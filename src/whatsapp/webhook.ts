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
import { maskiereNummer } from "./maskierung.js";

// Minimale Typen für den Ausschnitt des Meta-Payloads, den wir brauchen
interface WhatsAppMessage {
  from: string;
  id: string;
  type: string;
  audio?: { id: string; mime_type: string };
  image?: { id: string; mime_type: string; caption?: string };
  // Als Datei gesendetes Bild ("unkomprimiert senden", Teilen aus Dateien-App)
  document?: { id: string; mime_type?: string; caption?: string; filename?: string };
  text?: { body: string };
  // Klick auf einen Schnellantwort-Knopf einer VORLAGE
  button?: { payload?: string; text?: string };
  // Klick auf einen Antwort-Knopf einer interaktiven Nachricht (24-h-Fenster)
  interactive?: { type?: string; button_reply?: { id?: string; title?: string } };
}

/** Eine Meta-Nachricht in unsere Pipeline-Eingabe übersetzen (pur, testbar).
 *  Sprache, Foto und Text sind gleichwertige Auftrags-Eingaben; Knopf-Klicks
 *  (Vorlagen-Schnellantworten und interaktive Knöpfe) tragen ihre Kennung. */
export function extrahiereEingabe(msg: WhatsAppMessage):
  | { vonNummer: string; mediaId?: string; bildMediaId?: string; bildText?: string; text?: string; knopfPayload?: string; unbekannterTyp?: string }
  | null {
  if (msg.type === "audio" && msg.audio) return { vonNummer: msg.from, mediaId: msg.audio.id };
  if (msg.type === "image" && msg.image) {
    // Bildunterschrift mitnehmen: „Wohnzimmer Wand 2" ordnet ein Wandfoto zu.
    const bildText = msg.image.caption?.trim();
    return { vonNummer: msg.from, bildMediaId: msg.image.id, ...(bildText ? { bildText } : {}) };
  }
  // Ein Bild, das als Datei kam (image/jpeg, image/png …): wie ein Foto behandeln.
  if (msg.type === "document" && msg.document?.id && (msg.document.mime_type ?? "").toLowerCase().startsWith("image/")) {
    const bildText = msg.document.caption?.trim();
    return { vonNummer: msg.from, bildMediaId: msg.document.id, ...(bildText ? { bildText } : {}) };
  }
  if (msg.type === "text" && msg.text) return { vonNummer: msg.from, text: msg.text.body };
  if (msg.type === "button" && msg.button?.payload) {
    return { vonNummer: msg.from, knopfPayload: msg.button.payload };
  }
  if (msg.type === "interactive" && msg.interactive?.button_reply?.id) {
    return { vonNummer: msg.from, knopfPayload: msg.interactive.button_reply.id };
  }
  // "unsupported" ist bei Meta u.a. die Album-Hülle, die WhatsApp zusätzlich zu
  // den Einzelfotos eines Mehrfach-Versands schickt (Live-Test 11.09.2026: zwei
  // Mal „Das Format kann ich nicht lesen" mitten im Fotoschwung). Still ignorieren;
  // die Fotos kommen als eigene image-Nachrichten. Umfragen u.ä. fallen mit drunter.
  if (msg.type === "unsupported" || msg.type === "reaction") return null;
  // Alles andere (Video, PDF, Sticker, Kontakt, Standort): nicht still
  // verschlucken, sondern dem Absender kurz sagen, was wir lesen können.
  if (msg.from && msg.type) return { vonNummer: msg.from, unbekannterTyp: msg.type };
  return null;
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

// Zuletzt gesehene Nachrichten-IDs (Einfüge-Reihenfolge = Alter). Im RAM:
// deckt das reale Wiederholungsfenster von Meta (Sekunden bis Minuten) ab.
// Nach einem Neustart beginnt die Liste leer — die harten DB-Grenzen
// (Kontingente) bleiben davon unberührt.
const gesehen = new Set<string>();
const GESEHEN_MAX = 5000;

export function schonVerarbeitet(id: string | undefined): boolean {
  if (!id) return false;
  if (gesehen.has(id)) return true;
  gesehen.add(id);
  if (gesehen.size > GESEHEN_MAX) {
    for (const alt of gesehen) {
      gesehen.delete(alt);
      if (gesehen.size <= GESEHEN_MAX / 2) break;
    }
  }
  return false;
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
    // FAIL CLOSED (wie der Stripe-Webhook): Ohne App-Secret wird NICHTS
    // verarbeitet. Vorher lief der Webhook in dem Fall mit bloßer Warnung
    // weiter — dann hätte jeder beliebige Absendernummern simulieren und
    // KI-Kosten auslösen können (Audit AB-H04).
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
      app.log.error("WHATSAPP_APP_SECRET fehlt in der .env — Webhook lehnt alle Nachrichten ab (fail closed).");
      return reply.code(401).send({ fehler: "Webhook nicht konfiguriert" });
    }
    const signatur = req.headers["x-hub-signature-256"] as string | undefined;
    const roh = (req as FastifyRequest & { rawBody?: Buffer }).rawBody;
    if (!signaturGueltig(appSecret, roh, signatur)) {
      app.log.warn("Webhook mit ungültiger Signatur abgelehnt.");
      return reply.code(401).send({ fehler: "ungültige Signatur" });
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
      // Meta stellt mindestens-einmal zu: bei Timeout/Netzfehler kommt
      // dieselbe Nachricht erneut. Ohne Deduplizierung würde sie doppelt
      // transkribiert, doppelt bezahlt und doppelt beantwortet (AB-H04).
      if (schonVerarbeitet(msg.id)) {
        app.log.info({ msgId: msg.id }, "Doppelt zugestellte Nachricht übersprungen.");
        continue;
      }
      const eingabe = extrahiereEingabe(msg);
      // PII-frei: nur Typ und Kanal, kein Inhalt, keine Nummer.
      app.log.info({ typ: msg.type, kanal: eingabe?.mediaId ? "sprache" : eingabe?.bildMediaId ? "foto" : eingabe?.text ? "text" : eingabe?.knopfPayload ? "knopf" : eingabe?.unbekannterTyp ?? "ignoriert" }, "WhatsApp-Nachricht");
      if (!eingabe) continue;

      // Fire-and-forget mit eigenem Error-Handling — ein Fehler in einer
      // Nachricht darf die anderen nicht blockieren. Serielle Verarbeitung pro
      // Nummer verhindert, dass schnell aufeinanderfolgende Sprachnachrichten
      // je ein eigenes Angebot erzeugen (siehe pipeline.ts).
      // Nummer nur maskiert ins Log (S-10): Logs liegen 7 Tage auf der Platte,
      // die volle Nummer ist eine Kundendate und steht in der Datenbank.
      verarbeiteNachrichtSeriell(eingabe).catch((err) => {
        app.log.error({ err, von: maskiereNummer(msg.from) }, "Pipeline-Fehler");
      });
    }
  });
}
