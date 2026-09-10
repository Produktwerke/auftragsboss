// Einstiegspunkt: Fastify-Server + Webhook-Routen + Cron-Jobs.
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { serverConfig, pruefeStartKonfiguration } from "./config.js";
import { whatsappRoutes } from "./whatsapp/webhook.js";
import { editorRoutes } from "./web/routes.js";
import { importRoutes } from "./web/importRoutes.js";
import { registrierungRoutes } from "./web/registrierungRoutes.js";
import { betreiberRoutes } from "./web/betreiberRoutes.js";
import { adminAuthRoutes } from "./web/adminAuth.js";
import { stripeWebhookRoutes } from "./web/stripeWebhook.js";
import { aboRoutes } from "./web/aboRoutes.js";
import { starteGewaehrleistungsJob } from "./jobs/warrantyReminders.js";
import { starteVorgangTimeoutJob } from "./jobs/vorgangTimeout.js";
import { starteFotoWaisenJob } from "./jobs/fotoWaisen.js";
import { prisma } from "./pipeline.js";

// Boot-Gate (Nach-Audit 10.09., D-04): Ohne vollständige Zugangsdaten startet
// der Server gar nicht erst, statt beim ersten Kunden mitten in der Pipeline
// zu sterben. Optionales (SMTP, Stripe, Betreiber-Handy) bleibt lazy.
{
  const probleme = pruefeStartKonfiguration();
  if (probleme.length > 0) {
    console.error("\n❌ Server startet nicht, die .env ist unvollständig:\n");
    for (const p of probleme) console.error(`   • ${p}`);
    console.error("\n→ Werte in der .env ergänzen (Vorlage: .env.example), Prüfung: npx tsx src/env-check.ts\n");
    process.exit(1);
  }
}

// Tokens sind bei AuftragsBoss die Authentifizierung ("kein Passwort") —
// sie dürfen deshalb NICHT im Klartext in den Logs stehen (Audit AB-H05).
// Maskiert werden Pfadsegmente im Token-Alphabet (ohne i/l/o/0/1, ab 10
// Zeichen) sowie generell lange alphanumerische Segmente (Admin-Token).
export function maskiereTokensInUrl(url: string): string {
  return url
    .replace(/\/[a-hj-km-np-z2-9]{10,}(?=[/?#]|$)/g, "/[token]")
    .replace(/\/[A-Za-z0-9_-]{16,}(?=[/?#]|$)/g, "/[token]");
}

const app = Fastify({
  // Nur Caddy auf localhost ist ein vertrauenswürdiger Proxy: req.ip ist
  // damit die ECHTE Client-IP aus dem von Caddy angehängten Header — ein
  // selbst gesetzter X-Forwarded-For des Clients zählt nicht (Audit AB-H02).
  trustProxy: "127.0.0.1",
  logger: {
    serializers: {
      req(req) {
        return { method: req.method, url: maskiereTokensInUrl(req.url), remoteAddress: req.ip };
      },
    },
  },
});

// Ratenbegrenzung (Audit AB-H03): großzügige globale Grenze pro Client-IP;
// die heiklen Routen (Login, Mail-Versand, KI, Uploads) haben zusätzlich
// eigene, engere Grenzen per config.rateLimit an der Route. Ausgenommen:
// /health (Monitoring) und die signaturgeprüften Webhooks (Meta/Stripe
// senden legitime Bursts und wiederholen bei 4xx unnötig).
await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: "1 minute",
  allowList: (req) => req.url === "/health" || req.url.startsWith("/webhook/"),
  errorResponseBuilder: () => ({
    statusCode: 429,
    fehler: "Zu viele Anfragen. Bitte einen Moment warten und erneut versuchen.",
  }),
});

// Browser dürfen den Inhaltstyp nie „erraten" (F-04): ein als Bild gespeichertes
// HTML-Fragment würde sonst als Seite ausgeführt. Gilt für alle Antworten.
app.addHook("onSend", async (_req, reply) => {
  reply.header("X-Content-Type-Options", "nosniff");
});

// Health-Check (für Hosting/Uptime-Monitoring) MIT Datenbankprobe.
// Nach-Audit 10.09. (S-02): Am 07.09. war die Datenbank 14 Stunden kaputt,
// während dieser Endpunkt „ok" meldete — UptimeRobot und Wachhund waren blind.
// Jetzt: jede Anfrage macht eine echte Abfrage; alle 10 Minuten zusätzlich ein
// gecachter PRAGMA quick_check (liest die ganze Datei, deshalb nicht pro Aufruf).
let letzterQuickCheck = { zeit: 0, ok: true, text: "" };
app.get("/health", async (_req, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    if (Date.now() - letzterQuickCheck.zeit > 10 * 60 * 1000) {
      const zeilen = await prisma.$queryRawUnsafe<{ quick_check: string }[]>("PRAGMA quick_check");
      const text = zeilen[0]?.quick_check ?? "keine Antwort";
      letzterQuickCheck = { zeit: Date.now(), ok: text === "ok", text };
    }
  } catch (err) {
    letzterQuickCheck = { zeit: Date.now(), ok: false, text: err instanceof Error ? err.message.slice(0, 120) : String(err) };
  }
  if (!letzterQuickCheck.ok) {
    return reply.code(503).send({ status: "db-fehler", service: "voiceprotokoll-guard", db: letzterQuickCheck.text });
  }
  return { status: "ok", service: "voiceprotokoll-guard", db: "ok" };
});

await app.register(whatsappRoutes);
await app.register(editorRoutes);
await app.register(importRoutes);
await app.register(registrierungRoutes);
await app.register(betreiberRoutes);
await app.register(adminAuthRoutes);
await app.register(stripeWebhookRoutes);
await app.register(aboRoutes);

starteGewaehrleistungsJob();
starteVorgangTimeoutJob();
starteFotoWaisenJob();

const { PORT, HOST } = serverConfig();

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`🚀 VoiceProtokoll Guard läuft auf ${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
