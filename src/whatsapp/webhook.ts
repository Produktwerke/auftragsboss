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
import { whatsappConfig } from "../config.js";
import { verarbeiteNachricht } from "../pipeline.js";

// Minimale Typen für den Ausschnitt des Meta-Payloads, den wir brauchen
interface WhatsAppMessage {
  from: string;
  id: string;
  type: string;
  audio?: { id: string; mime_type: string };
  text?: { body: string };
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
    if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] === whatsappConfig().WHATSAPP_VERIFY_TOKEN) {
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

    // Sprache UND Text sind gleichwertige Eingaben — Rückfragen darf der
    // Handwerker so beantworten, wie es ihm im Moment leichter fällt.
    for (const msg of messages) {
      const eingabe =
        msg.type === "audio" && msg.audio
          ? { vonNummer: msg.from, mediaId: msg.audio.id }
          : msg.type === "text" && msg.text
            ? { vonNummer: msg.from, text: msg.text.body }
            : null;

      if (!eingabe) continue;

      // Fire-and-forget mit eigenem Error-Handling — ein Fehler in einer
      // Nachricht darf die anderen nicht blockieren.
      verarbeiteNachricht(eingabe).catch((err) => {
        app.log.error({ err, von: msg.from }, "Pipeline-Fehler");
      });
    }
  });
}
