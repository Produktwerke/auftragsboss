// Text-Antworten an den Handwerker zurück auf WhatsApp senden —
// Bestätigung ("Protokoll ist unterwegs 📬") oder Fehlerhinweis.
import { config } from "../config.js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export async function sendeWhatsAppText(anNummer: string, text: string): Promise<void> {
  const res = await fetch(`${GRAPH_BASE}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: anNummer,
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    // Antwort-Fehler loggen, aber Pipeline nicht abbrechen —
    // die E-Mail ist das wichtigere Artefakt.
    console.error(`WhatsApp-Antwort fehlgeschlagen (${res.status}): ${await res.text()}`);
  }
}
