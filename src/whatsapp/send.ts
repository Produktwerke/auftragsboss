// Text-Antworten an den Handwerker zurück auf WhatsApp senden —
// Bestätigung ("Protokoll ist unterwegs 📬") oder Fehlerhinweis.
import { whatsappConfig } from "../config.js";

export async function sendeWhatsAppText(anNummer: string, text: string): Promise<void> {
  const cfg = whatsappConfig();
  const res = await fetch(
    `https://graph.facebook.com/${cfg.GRAPH_API_VERSION}/${cfg.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.WHATSAPP_ACCESS_TOKEN}`,
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

/** Nachrichtenkörper für eine Vorlagen-Nachricht (Template) — pur, damit er
 *  sich ohne Netz testen lässt. Die Platzhalter {{1}}, {{2}} … der Vorlage
 *  werden der Reihe nach mit `parameter` gefüllt. */
export function baueVorlagenNachricht(anNummer: string, vorlage: string, parameter: string[]) {
  return {
    messaging_product: "whatsapp",
    to: anNummer,
    type: "template",
    template: {
      name: vorlage,
      language: { code: "de" },
      components:
        parameter.length > 0
          ? [{ type: "body", parameters: parameter.map((text) => ({ type: "text", text })) }]
          : [],
    },
  };
}

/**
 * Vorlagen-Nachricht (Template) senden. Anders als freier Text darf sie AUCH
 * außerhalb des 24-Stunden-Fensters zugestellt werden — Voraussetzung ist eine
 * bei Meta angelegte und GENEHMIGTE Vorlage (WhatsApp Manager, Sprache Deutsch).
 * Gibt zurück, ob der Versand angenommen wurde (Fehler nur geloggt).
 */
export async function sendeWhatsAppVorlage(
  anNummer: string,
  vorlage: string,
  parameter: string[],
): Promise<boolean> {
  const cfg = whatsappConfig();
  const res = await fetch(
    `https://graph.facebook.com/${cfg.GRAPH_API_VERSION}/${cfg.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(baueVorlagenNachricht(anNummer, vorlage, parameter)),
    },
  );
  if (!res.ok) {
    console.error(`WhatsApp-Vorlage fehlgeschlagen (${res.status}): ${await res.text()}`);
    return false;
  }
  return true;
}
