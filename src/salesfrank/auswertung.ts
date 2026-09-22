// SalesFrank (KI-Telefonakquise, 17.09.2026): Auswertung eines Gesprächs.
//
// SalesFrank ruft Malerbetriebe an und schickt nach jedem Gespräch einen Webhook
// mit Zusammenfassung und Transkript. Bevor AuftragsBoss daraus eine WhatsApp-
// Einladung macht (Marketing-Vorlage!), muss eindeutig sein, dass der Angerufene
// am Telefon AUSDRÜCKLICH einer WhatsApp-Nachricht zugestimmt hat. Das prüft
// Claude anhand des Transkripts; nur bei klarem Ja geht die Einladung automatisch
// raus, alles Unklare landet zur Prüfung im Betreiber-Cockpit.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { anthropicConfig } from "../config.js";

export type Urteil = "JA" | "NEIN" | "UNKLAR";

/** Begründung, wenn die KI-Antwort nicht auswertbar war (kein Urteil über das Gespräch!). */
export const ANTWORT_NICHT_LESBAR = "Antwort nicht lesbar";

/**
 * Festes Antwortformat (Structured Output, wie bei Angebot und Wandfoto). Vorher lieferte die
 * KI freien Text, aus dem ein JSON herausgesucht wurde; am 22.09.2026 scheiterte das bei drei
 * von rund 70 Gesprächen („Antwort nicht lesbar"), darunter ein klares Ja mit Handynummer.
 */
export const EinschaetzungSchema = z.object({
  interesse: z.enum(["JA", "NEIN", "UNKLAR"]).describe("JA, wenn der Angerufene AuftragsBoss ausprobieren möchte. NEIN bei Absage, kein Interesse, Auflegen, falscher Ansprechpartner ohne Weiterleitung. Sonst UNKLAR."),
  whatsappZustimmung: z.enum(["JA", "NEIN", "UNKLAR"]).describe("JA nur bei AUSDRÜCKLICHER Zustimmung zu einer WhatsApp-Nachricht. NEIN bei Ablehnung von WhatsApp. Frage nicht gestellt oder nicht klar beantwortet: UNKLAR."),
  anrede: z.string().describe('z. B. „Herr Müller", nur wenn der Nachname deutlich genannt oder buchstabiert wurde. Sonst leer, nie raten.'),
  handynummer: z.string().nullable().describe("Nur eine im Gespräch genannte (andere) Handynummer für WhatsApp, als Ziffern. Sonst null."),
  beleg: z.string().describe("Wörtliches Zitat des Angerufenen, das die Zustimmung zu WhatsApp belegt. Leer, wenn es keins gibt."),
  begruendung: z.string().describe("Ein Satz."),
  gespraechsart: z.enum(["GESPRAECH", "MAILBOX", "ABBRUCH", "RUECKRUF"]),
});

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

/** Ausgefülltes Formular (aus Structured Output oder notfalls aus Text) in die Einschätzung übernehmen. */
export function einschaetzungAusFormular(j: Record<string, unknown>, fallbackAnrede: string): Einschaetzung {
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
}

/** Notfallweg: JSON aus freiem Text lesen (nur noch, wenn das feste Format ausnahmsweise fehlt). */
export function parseEinschaetzung(text: string, fallbackAnrede: string): Einschaetzung {
  const leer: Einschaetzung = { interesse: "UNKLAR", whatsappZustimmung: "UNKLAR", anrede: fallbackAnrede, handynummer: null, beleg: "", begruendung: ANTWORT_NICHT_LESBAR, gespraechsart: "GESPRAECH" };
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return leer;
  try {
    return einschaetzungAusFormular(JSON.parse(m[0]) as Record<string, unknown>, fallbackAnrede);
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

Fülle das Formular vollständig aus.`;

export type Bewerter = (g: Gespraech) => Promise<Einschaetzung>;

/** Bewertet ein Gespräch mit Claude (Modell wie die Angebotserstellung, ohne Denkbudget, festes Antwortformat). */
export const bewerteGespraech: Bewerter = async (g) => {
  const cfg = anthropicConfig();
  const anthropic = new Anthropic({ apiKey: cfg.ANTHROPIC_API_KEY });
  const fallback = g.firma.trim() || g.name.trim();
  const inhalt =
    `Firma laut Liste: ${g.firma || "unbekannt"}\nName laut Liste: ${g.name || "unbekannt"}\n` +
    `Ergebnis laut SalesFrank: ${g.ergebnis || "keins"}\n\nZusammenfassung:\n${g.zusammenfassung || "(keine)"}\n\nTranskript:\n${g.transkript || "(keins)"}`;
  const antwort = await anthropic.messages.parse({
    model: cfg.ANGEBOT_MODELL,
    max_tokens: 800,
    system: SYSTEM,
    messages: [{ role: "user", content: inhalt.slice(0, 60_000) }],
    output_config: { format: zodOutputFormat(EinschaetzungSchema) },
  });
  if (antwort.parsed_output) return einschaetzungAusFormular(antwort.parsed_output, fallback);
  // Sollte mit festem Format nicht mehr vorkommen (nur refusal/abgeschnitten): Rohtext ins Log, damit
  // die Ursache sichtbar ist, und Notfallweg über den Text-Parser.
  const text = antwort.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  console.warn(`SalesFrank-Bewertung ohne auswertbares Formular (stop_reason ${antwort.stop_reason}); Rohtext: ${text.slice(0, 300).replace(/\s+/g, " ")}`);
  return parseEinschaetzung(text, fallback);
};
