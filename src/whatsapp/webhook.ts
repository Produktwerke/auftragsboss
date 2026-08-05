// Meta WhatsApp Cloud API Webhook.
//   GET  /webhook/whatsapp → Verifizierungs-Handshake (einmalig bei Einrichtung)
//   POST /webhook/whatsapp → eingehende Nachrichten
//
// Wichtig: Meta erwartet die 200-Antwort innerhalb weniger Sekunden, sonst
// wird der Webhook erneut zugestellt. Deshalb: sofort 200 senden, Pipeline
// asynchron weiterlaufen lassen.
//
// Sicherheit: Ist WHATSAPP_APP_SECRET gesetzt, wird jede POST-Anfrage über den
// Header X-Hub-Signature-256 gegen das App-Secret geprüft — so kann nur Meta
// den Endpoint füttern. Ohne Secret läuft es (mit Warnung) ungeprüft weiter,
// damit der Testbetrieb nicht blockiert.
import crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { whatsappConfig } from "../config.js";
import { verarbeiteNachrichtSeriell } from "../pipeline.js";

// Minimale Typen für den Ausschnitt des Meta-Payloads, den wir brauchen
interface WhatsAppMessage {
  from: string;
  id: string;
  type: string;
  audio?: { id: string; mime_type: string };
  image?: { id: string; mime_type: string; caption?: string };
  text?: { body: string };
}

interface WebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: { messages?: WhatsAppMessage[] };
    }>;
  }>;
}

/**
 * Prüft die Meta-Signatur: HMAC-SHA256 über den ROHEN Body mit dem App-Secret,
 * verglichen mit dem Header `sha256=…`. Zeitkonstanter Vergleich gegen
 * Timing-Angriffe.
 */
export function signaturGueltig(secret: string, roh: Buffer | undefined, signatur: string | undefined): boolean {
  if (!roh || !signatur || !signatur.startsWith("sha256=")) return false;
  const erwartet = "sha256=" + crypto.createHmac("sha256", secret).update(roh).digest("hex");
  const a = Buffer.from(signatur);
  const b = Buffer.from(erwartet);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function whatsappRoutes(app: FastifyInstance): Promise<void> {
  // Den rohen Body byte-genau aufbewahren (für die Signaturprüfung) und dabei
  // wie gewohnt als JSON parsen. Scoped auf diese Routen.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    (req as FastifyRequest & { rawBody?: Buffer }).rawBody = body as Buffer;
    try {
      const text = (body as Buffer).toString("utf8");
      done(null, text.length ? JSON.parse(text) : {});
    } catch (err) {
      done(err as Error);
    }
  });

  // ── Verifizierungs-Handshake ──────────────────────────────
  app.get("/webhook/whatsapp", async (req, reply) => {
    const q = req.query as Record<string, string>;
    if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] === whatsappConfig().WHATSAPP_VERIFY_TOKEN) {
      return reply.send(q["hub.challenge"]);
    }
    return reply.code(403).send("Verifizierung fehlgeschlagen");
  });

  // ── Eingehende Nachrichten ────────────────────────────────
  app.post("/webhook/whatsapp", async (req, reply) => {
    // Signatur prüfen, sofern ein App-Secret hinterlegt ist.
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (appSecret) {
      const signatur = req.headers["x-hub-signature-256"] as string | undefined;
      const roh = (req as FastifyRequest & { rawBody?: Buffer }).rawBody;
      if (!signaturGueltig(appSecret, roh, signatur)) {
        app.log.warn("Webhook mit ungültiger Signatur abgelehnt.");
        return reply.code(401).send({ fehler: "ungültige Signatur" });
      }
    } else {
      app.log.warn("WHATSAPP_APP_SECRET nicht gesetzt — Webhook-Signatur wird NICHT geprüft.");
    }

    // Sofort bestätigen — Verarbeitung läuft asynchron weiter
    reply.code(200).send({ status: "ok" });

    const body = req.body as WebhookBody;
    const messages =
      body.entry?.flatMap((e) => e.changes ?? []).flatMap((c) => c.value?.messages ?? []) ?? [];

    // Sprache, Foto UND Text sind gleichwertige Eingaben — der Handwerker darf
    // so liefern, wie es ihm im Moment leichter fällt (diktieren, Aufmaß-Zettel
    // fotografieren oder tippen).
    for (const msg of messages) {
      const eingabe =
        msg.type === "audio" && msg.audio
          ? { vonNummer: msg.from, mediaId: msg.audio.id }
          : msg.type === "image" && msg.image
            ? { vonNummer: msg.from, bildMediaId: msg.image.id }
            : msg.type === "text" && msg.text
              ? { vonNummer: msg.from, text: msg.text.body }
              : null;

      if (!eingabe) continue;

      // Fire-and-forget mit eigenem Error-Handling — ein Fehler in einer
      // Nachricht darf die anderen nicht blockieren. Serielle Verarbeitung pro
      // Nummer verhindert, dass schnell aufeinanderfolgende Sprachnachrichten
      // je ein eigenes Angebot erzeugen (siehe pipeline.ts).
      verarbeiteNachrichtSeriell(eingabe).catch((err) => {
        app.log.error({ err, von: msg.from }, "Pipeline-Fehler");
      });
    }
  });
}
