// Meta WhatsApp Cloud API Webhook.
//   GET  /webhook/whatsapp → Verifizierungs-Handshake (einmalig bei Einrichtung)
//   POST /webhook/whatsapp → eingehende Nachrichten
//
// Wichtig: Meta erwartet die 200-Antwort innerhalb weniger Sekunden, sonst
// wird der Webhook erneut zugestellt. Deshalb: sofort 200 senden, Pipeline
// asynchron weiterlaufen lassen.
//
// TODO (vor Produktion): X-Hub-Signature-256 gegen das App-Secret prüfen,
// damit nur Meta den Endpoint füttern kann.
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { verarbeiteSprachnachricht } from "../pipeline.js";

// Minimale Typen für den Ausschnitt des Meta-Payloads, den wir brauchen
interface WhatsAppMessage {
  from: string;
  id: string;
  type: string;
  audio?: { id: string; mime_type: string };
}

interface WebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: { messages?: WhatsAppMessage[] };
    }>;
  }>;
}

export async function whatsappRoutes(app: FastifyInstance): Promise<void> {
  // ── Verifizierungs-Handshake ──────────────────────────────
  app.get("/webhook/whatsapp", async (req, reply) => {
    const q = req.query as Record<string, string>;
    if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] === config.WHATSAPP_VERIFY_TOKEN) {
      return reply.send(q["hub.challenge"]);
    }
    return reply.code(403).send("Verifizierung fehlgeschlagen");
  });

  // ── Eingehende Nachrichten ────────────────────────────────
  app.post("/webhook/whatsapp", async (req, reply) => {
    // Sofort bestätigen — Verarbeitung läuft asynchron weiter
    reply.code(200).send({ status: "ok" });

    const body = req.body as WebhookBody;
    const messages =
      body.entry?.flatMap((e) => e.changes ?? []).flatMap((c) => c.value?.messages ?? []) ?? [];

    for (const msg of messages) {
      if (msg.type === "audio" && msg.audio) {
        // Fire-and-forget mit eigenem Error-Handling — ein Fehler in einer
        // Nachricht darf die anderen nicht blockieren.
        verarbeiteSprachnachricht({
          vonNummer: msg.from,
          mediaId: msg.audio.id,
        }).catch((err) => {
          app.log.error({ err, von: msg.from }, "Pipeline-Fehler");
        });
      } else if (msg.type === "text") {
        app.log.info({ von: msg.from }, "Textnachricht empfangen — Hinweis gesendet");
        // Nutzer sanft in den Voice-Flow lenken
        import("./send.js").then(({ sendeWhatsAppText }) =>
          sendeWhatsAppText(
            msg.from,
            "🎙️ Schick mir einfach eine *Sprachnachricht* mit den Auftragsdetails — " +
              "ich mache daraus ein fertiges Protokoll und schicke es dir per E-Mail.",
          ),
        );
      }
    }
  });
}
