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
 *  werden der Reihe nach mit `parameter` gefüllt. Hat die Vorlage
 *  Schnellantwort-Knöpfe, bekommen sie über `knopfPayloads` ihre Kennungen —
 *  die kommen beim Klick als button.payload im Webhook zurück. */
export function baueVorlagenNachricht(
  anNummer: string,
  vorlage: string,
  parameter: string[],
  knopfPayloads: string[] = [],
) {
  const components: unknown[] = [];
  if (parameter.length > 0) {
    components.push({ type: "body", parameters: parameter.map((text) => ({ type: "text", text })) });
  }
  knopfPayloads.forEach((payload, i) => {
    components.push({
      type: "button",
      sub_type: "quick_reply",
      index: String(i),
      parameters: [{ type: "payload", payload }],
    });
  });
  return {
    messaging_product: "whatsapp",
    to: anNummer,
    type: "template",
    template: {
      name: vorlage,
      language: { code: "de" },
      components,
    },
  };
}

/** Nachrichtenkörper für eine interaktive Nachricht mit Antwort-Knöpfen
 *  (max. 3, Titel je max. 20 Zeichen). Nur innerhalb des 24-Stunden-Fensters
 *  zustellbar — also nachdem der Empfänger geantwortet/geklickt hat. */
export function baueKnopfNachricht(
  anNummer: string,
  text: string,
  knoepfe: Array<{ id: string; titel: string }>,
) {
  return {
    messaging_product: "whatsapp",
    to: anNummer,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text },
      action: {
        buttons: knoepfe.map((k) => ({ type: "reply", reply: { id: k.id, title: k.titel } })),
      },
    },
  };
}

/** Interaktive Knopf-Nachricht senden (24-h-Fenster). Fehler nur geloggt. */
export async function sendeWhatsAppKnoepfe(
  anNummer: string,
  text: string,
  knoepfe: Array<{ id: string; titel: string }>,
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
      body: JSON.stringify(baueKnopfNachricht(anNummer, text, knoepfe)),
    },
  );
  if (!res.ok) {
    console.error(`WhatsApp-Knopfnachricht fehlgeschlagen (${res.status}): ${await res.text()}`);
    return false;
  }
  return true;
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
  knopfPayloads: string[] = [],
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
      body: JSON.stringify(baueVorlagenNachricht(anNummer, vorlage, parameter, knopfPayloads)),
    },
  );
  if (!res.ok) {
    console.error(`WhatsApp-Vorlage fehlgeschlagen (${res.status}): ${await res.text()}`);
    return false;
  }
  return true;
}
