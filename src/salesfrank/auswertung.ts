// SalesFrank (KI-Telefonakquise, 17.09.2026): Auswertung eines Gesprächs.
//
// SalesFrank ruft Malerbetriebe an und schickt nach jedem Gespräch einen Webhook
// mit Zusammenfassung und Transkript. Bevor AuftragsBoss daraus eine WhatsApp-
// Einladung macht (Marketing-Vorlage!), muss eindeutig sein, dass der Angerufene
// am Telefon AUSDRÜCKLICH einer WhatsApp-Nachricht zugestimmt hat. Das prüft
// Claude anhand des Transkripts; nur bei klarem Ja geht die Einladung automatisch
// raus, alles Unklare landet zur Prüfung im Betreiber-Cockpit.
import Anthropic from "@anthropic-ai/sdk";
import { anthropicConfig } from "../config.js";

export type Urteil = "JA" | "NEIN" | "UNKLAR";

export interface Gespraech {
  transkript: string;
  zusammenfassung: string;
  /** Ergebnis-Klassifikation von SalesFrank, falls geliefert (nur als Hinweis). */
  ergebnis: string;
  name: string;
  firma: string;
}

export interface Einschaetzung {
  /** Hat der Betrieb Interesse, AuftragsBoss auszuprobieren? */
  interesse: Urteil;
  /** Hat er ausdrücklich zugestimmt, eine WhatsApp-Nachricht zu bekommen? */
  whatsappZustimmung: Urteil;
  /** Anrede für die Einladung, z. B. „Herr Müller" (Fallback: Firma). */
  anrede: string;
  /** Im Gespräch genannte Handynummer (Ziffern), falls abweichend genannt. */
  handynummer: string | null;
  /** Wörtliches Zitat aus dem Transkript, das die Zustimmung belegt. */
  beleg: string;
  begruendung: string;
  /** Kam überhaupt ein Gespräch zustande? Mailbox/Abbruch/Rückrufwunsch sind kein Prüffall. */
  gespraechsart: Gespraechsart;
}

export type Gespraechsart = "GESPRAECH" | "MAILBOX" | "ABBRUCH" | "RUECKRUF";

export type Entscheidung = "EINLADEN" | "PRUEFUNG" | "ABLEHNEN" | "KEIN_GESPRAECH";

/** Rein, testbar: nur klares Ja + Ja lädt automatisch ein; ein Nein beendet; Rest zur Prüfung. */
export function entscheide(e: Einschaetzung): Entscheidung {
  if (e.interesse === "JA" && e.whatsappZustimmung === "JA" && e.beleg.trim().length > 0) return "EINLADEN";
  if (e.interesse === "NEIN" || e.whatsappZustimmung === "NEIN") return e.gespraechsart === "GESPRAECH" ? "ABLEHNEN" : "KEIN_GESPRAECH";
  if (e.gespraechsart !== "GESPRAECH") return "KEIN_GESPRAECH";
  return "PRUEFUNG";
}

const gespraechsart = (v: unknown): Gespraechsart => {
  const s = String(v ?? "").trim().toUpperCase();
  return s === "MAILBOX" || s === "ABBRUCH" || s === "RUECKRUF" ? s : "GESPRAECH";
};

const urteil = (v: unknown): Urteil => {
  const s = String(v ?? "").trim().toUpperCase();
  return s === "JA" || s === "NEIN" ? s : "UNKLAR";
};

/** Tolerantes Auslesen der Modellantwort (JSON, notfalls aus umgebendem Text). */
export function parseEinschaetzung(text: string, fallbackAnrede: string): Einschaetzung {
  const leer: Einschaetzung = { interesse: "UNKLAR", whatsappZustimmung: "UNKLAR", anrede: fallbackAnrede, handynummer: null, beleg: "", begruendung: "Antwort nicht lesbar", gespraechsart: "GESPRAECH" };
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return leer;
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    const ziffern = String(j.handynummer ?? "").replace(/\D/g, "");
    return {
      interesse: urteil(j.interesse),
      whatsappZustimmung: urteil(j.whatsappZustimmung ?? j.whatsapp_zustimmung),
      anrede: String(j.anrede ?? "").trim() || fallbackAnrede,
      handynummer: ziffern.length >= 8 ? ziffern : null,
      beleg: String(j.beleg ?? "").trim(),
      begruendung: String(j.begruendung ?? "").trim(),
      gespraechsart: gespraechsart(j.gespraechsart),
    };
  } catch {
    return leer;
  }
}

const SYSTEM = `Du wertest das Transkript eines Verkaufstelefonats aus. Ein KI-Telefonassistent hat einen Malerbetrieb angerufen und AuftragsBoss vorgestellt (Angebote per WhatsApp-Sprachnachricht). Am Ende sollte der Assistent fragen, ob er dem Betrieb eine WhatsApp-Nachricht zum kostenlosen Ausprobieren schicken darf.

Beurteile streng und nur anhand dessen, was der ANGERUFENE tatsächlich gesagt hat:
1. interesse: JA, wenn der Angerufene AuftragsBoss ausprobieren möchte. NEIN bei Absage, kein Interesse, Auflegen, falscher Ansprechpartner ohne Weiterleitung. Sonst UNKLAR.
2. whatsappZustimmung: JA nur, wenn der Angerufene AUSDRÜCKLICH zugestimmt hat, eine WhatsApp-Nachricht zu bekommen (z. B. „ja, schicken Sie mir das per WhatsApp", „ja gerne", „können Sie machen" als Antwort auf genau diese Frage). Ein allgemeines Interesse ist KEINE Zustimmung. NEIN, wenn er WhatsApp ablehnt. Wurde die Frage nicht gestellt oder nicht klar beantwortet: UNKLAR.
3. anrede: Wie die Einladung beginnen soll, z. B. „Herr Müller" oder „Frau Schmidt". NUR, wenn der Angerufene seinen Nachnamen deutlich genannt oder buchstabiert und ggf. bestätigt hat. Bei Unsicherheit, mehreren Varianten oder unklarer Schreibweise leer lassen (dann wird der Firmenname verwendet). Nie raten.
4. handynummer: Nur, wenn der Angerufene im Gespräch eine (andere) Handynummer für WhatsApp genannt hat, als Ziffern. Sonst null.
5. beleg: Das wörtliche Zitat des Angerufenen, das die Zustimmung zu WhatsApp belegt. Leer, wenn es keins gibt.
6. begruendung: Ein Satz.
7. gespraechsart: MAILBOX, wenn nur ein Anrufbeantworter, eine Mailbox oder eine Netzansage erreicht wurde. ABBRUCH, wenn der Angerufene nach wenigen Worten aufgelegt hat oder das Gespräch abbrach, bevor AuftragsBoss vorgestellt wurde (auch „passt gerade nicht", falsche Nummer, nicht zuständig ohne Weiterleitung, unverständlich). RUECKRUF, wenn der Angerufene um einen Anruf zu einem anderen Zeitpunkt gebeten hat. GESPRAECH nur, wenn AuftragsBoss tatsächlich vorgestellt wurde und der Angerufene inhaltlich reagiert hat.

Antworte NUR mit JSON: {"interesse":"JA|NEIN|UNKLAR","whatsappZustimmung":"JA|NEIN|UNKLAR","anrede":"…","handynummer":"…"|null,"beleg":"…","begruendung":"…","gespraechsart":"GESPRAECH|MAILBOX|ABBRUCH|RUECKRUF"}`;

export type Bewerter = (g: Gespraech) => Promise<Einschaetzung>;

/** Bewertet ein Gespräch mit Claude (Modell wie die Angebotserstellung, ohne Denkbudget). */
export const bewerteGespraech: Bewerter = async (g) => {
  const cfg = anthropicConfig();
  const anthropic = new Anthropic({ apiKey: cfg.ANTHROPIC_API_KEY });
  const fallback = g.firma.trim() || g.name.trim();
  const inhalt =
    `Firma laut Liste: ${g.firma || "unbekannt"}\nName laut Liste: ${g.name || "unbekannt"}\n` +
    `Ergebnis laut SalesFrank: ${g.ergebnis || "keins"}\n\nZusammenfassung:\n${g.zusammenfassung || "(keine)"}\n\nTranskript:\n${g.transkript || "(keins)"}`;
  const antwort = await anthropic.messages.create({
    model: cfg.ANGEBOT_MODELL,
    max_tokens: 600,
    system: SYSTEM,
    messages: [{ role: "user", content: inhalt.slice(0, 60_000) }],
  });
  const text = antwort.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return parseEinschaetzung(text, fallback);
};
