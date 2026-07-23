// Schritt 2 der KI-Pipeline: Transkript → strukturiertes Dokument.
//
// Claude Opus 4.8 mit Structured Outputs (Zod-Schema) — die Antwort ist
// GARANTIERT valides JSON im erwarteten Format, kein Parsing-Risiko.
//
// Zwei Fälle, automatisch erkannt:
//   ANGEBOT    — diktiert nach dem Beratungstermin, Arbeiten noch offen
//   PROTOKOLL  — diktiert nach getaner Arbeit, Dokumentation + Gewährleistung
//
// WICHTIG: Die KI rechnet NICHT. Sie liefert nur Menge und Einzelpreis;
// alle Summen und die MwSt. berechnet der Code (siehe angebot/berechnung.ts).
// Und sie erfindet keine Preise — unbekannt bleibt unbekannt.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { anthropicConfig } from "../config.js";
import { EINHEITEN, preislisteAlsText, type Preisliste } from "../preisliste.js";

export const PositionSchema = z.object({
  beschreibung: z.string().describe("Klare Bezeichnung der Leistung, wie sie im Angebot stehen soll."),
  menge: z
    .number()
    .nullable()
    .describe("Zahlenwert der Menge, z.B. 45 für '45 Quadratmeter'. null, wenn im Diktat keine Menge genannt wurde."),
  einheit: z
    .enum(EINHEITEN)
    .nullable()
    .describe("m2 (Fläche), lfm (laufender Meter), Stk (Stück), Std (Stunden) oder pauschal. null wenn unklar."),
  einzelpreis: z
    .number()
    .nullable()
    .describe(
      "Preis pro Einheit in Euro. NUR setzen, wenn er im Diktat ausdrücklich genannt wurde ODER in der " +
        "Preisliste steht. null ist der Normalfall und völlig in Ordnung — der Handwerker trägt den Preis " +
        "später am Schreibtisch ein. Niemals schätzen oder aus Erfahrung ergänzen.",
    ),
  preisquelle: z
    .enum(["DIKTAT", "PREISLISTE", "UNBEKANNT"])
    .describe("Woher der Einzelpreis stammt. UNBEKANNT, wenn einzelpreis null ist."),
  mengeUnsicher: z
    .boolean()
    .describe("true, wenn die Menge geschätzt/abgeleitet wurde statt klar diktiert (z.B. aus Raumangaben gerechnet)."),
});

export const DokumentSchema = z.object({
  art: z
    .enum(["ANGEBOT", "PROTOKOLL"])
    .describe(
      "ANGEBOT: Der Handwerker beschreibt Arbeiten, die noch AUSGEFÜHRT WERDEN SOLLEN (Aufmaß, Beratungstermin, " +
        "Kundenwunsch, Zukunftsform, Preisangaben). PROTOKOLL: Der Handwerker beschreibt bereits ERLEDIGTE " +
        "Arbeiten (Vergangenheitsform, 'haben wir gemacht', Hinweise an den Kunden nach Ausführung). " +
        "Im Zweifel ANGEBOT.",
    ),
  kunde: z.object({
    name: z.string().nullable().describe("Kundenname, z.B. 'Familie Bär'. null wenn nicht genannt."),
    adresse: z.string().nullable().describe("Straße/Ort des Objekts, falls genannt."),
  }),
  gewerk: z.string().nullable().describe("Gewerk, z.B. 'Malerei', 'Sanitär'."),
  objekt: z
    .string()
    .nullable()
    .describe("Kurzbeschreibung des Objekts/Raums, z.B. 'Wohnzimmer, ca. 45 m², Deckenhöhe 2,50 m'."),
  positionen: z.array(PositionSchema).describe("Alle Leistungen einzeln, in sinnvoller Ausführungsreihenfolge."),
  aufmassNotizen: z
    .string()
    .nullable()
    .describe(
      "Alle Maße und baulichen Gegebenheiten aus dem Diktat, die für die Kalkulation wichtig sind " +
        "(Fensteranzahl, Türbreiten, Deckenhöhe, Besonderheiten der Räume). Wörtlich nah am Diktat bleiben.",
    ),
  besonderheiten: z
    .string()
    .nullable()
    .describe("Absprachen, Kundenwünsche, offene Entscheidungen, Hinweise — alles Haftungs- oder Verkaufsrelevante."),
  folgetermin: z.string().nullable().describe("Vereinbarter Folgetermin, falls genannt."),
  einleitung: z
    .string()
    .describe(
      "Anrede und 1–3 einleitende Sätze für das Kundendokument. Sie-Form, professionell, freundlich. " +
        "Bei ANGEBOT: Bezug auf das Gespräch/den Termin, Freude über die Anfrage. " +
        "Bei PROTOKOLL: Dank für den Auftrag, Hinweis auf die Dokumentation. " +
        "KEINE Positionsliste und KEINE Summen — die fügt das Programm selbst ein.",
    ),
  schlusstext: z
    .string()
    .describe(
      "Abschließende Sätze nach der Positionsliste: Hinweise, offene Punkte, Bitte um Rückmeldung, Grußformel. " +
        "KEINE Preise oder Summen wiederholen. KEINE Gültigkeitsdauer nennen — die ergänzt das Programm.",
    ),
  rueckfragen: z
    .array(z.string())
    .describe(
      "Punkte, die der Handwerker vor dem Versand prüfen sollte: unklare Angaben, fehlende Mengen, " +
        "Widersprüche im Diktat, vermutete Transkriptionsfehler. NICHT erwähnen, dass Preise fehlen — " +
        "das ist der Normalfall und dafür gibt es die Platzhalter. Leeres Array, wenn alles eindeutig ist.",
    ),
  gewaehrleistung: z
    .object({
      typ: z.enum(["WERK_2_JAHRE", "BAUWERK_5_JAHRE"]),
      begruendung: z.string(),
    })
    .nullable()
    .describe(
      "NUR bei art=PROTOKOLL ausfüllen, sonst null. § 634a BGB: BAUWERK_5_JAHRE bei Arbeiten, die für " +
        "Errichtung oder Bestand eines Bauwerks wesentlich sind. Sonst WERK_2_JAHRE (im Zweifel dieses).",
    ),
});

export type DokumentDaten = z.infer<typeof DokumentSchema>;
export type Position = z.infer<typeof PositionSchema>;

function systemPrompt(preisliste: Preisliste): string {
  return `Du bist das Backend von "Angebotsblitz", einem Diktier-Tool für deutsche Handwerksbetriebe.

Du erhältst das Roh-Transkript einer WhatsApp-Sprachnachricht, die ein Handwerker direkt nach einem Kundentermin im Auto diktiert hat. Transkripte sind umgangssprachlich, ungeordnet, enthalten Füllwörter, Dialekt-Reste und vor allem TRANSKRIPTIONSFEHLER bei Fachbegriffen.

## Deine Aufgaben

1. **Hörfehler korrigieren.** Die Spracherkennung verwechselt Fachbegriffe. Erkenne aus dem Handwerkskontext, was gemeint war — z.B. "Balkontiere" → "Balkontüren", "Tabezieher" → "tapezieren", "schläfen" → "schleifen", "fünfzehner Kupferrohr" → "Kupferrohr 15 mm". Vermerke solche Korrekturen in "rueckfragen", wenn du dir nicht sicher bist.

2. **Dokumentart erkennen.** Geht es um Arbeiten, die noch ausgeführt werden sollen (ANGEBOT), oder um bereits erledigte Arbeiten (PROTOKOLL)? Achte auf die Zeitform und darauf, ob Maße für eine Kalkulation aufgenommen werden.

3. **Positionen sauber trennen.** Jede Leistung wird eine eigene Position mit Menge und Einheit. Ordne sie in der Reihenfolge, in der ein Fachmann sie ausführen würde (z.B. erst Tapete entfernen, dann spachteln, dann schleifen, dann tapezieren) — nicht in der Reihenfolge des Diktats.

4. **Mengen ableiten, aber ehrlich kennzeichnen.** Wenn eine Menge nur indirekt genannt wurde (z.B. Raumfläche für Deckenarbeiten), darfst du sie übernehmen und setzt "mengeUnsicher": true. Rechne keine komplizierten Wandflächen aus, wenn die nötigen Maße fehlen — dann Menge null und ein Eintrag in "rueckfragen".

## Absolute Regeln

- **ERFINDE NIEMALS PREISE.** Ein Einzelpreis darf nur gesetzt werden, wenn er im Diktat genannt wurde (preisquelle: DIKTAT) oder in der Preisliste unten steht (preisquelle: PREISLISTE). Sonst einzelpreis null und preisquelle UNBEKANNT. Ein erfundener Preis, der beim Kunden landet, ist ein rechtliches Problem für den Handwerker.
- **PREISE FEHLEN NORMALERWEISE — das ist kein Mangel.** Der Handwerker diktiert im Auto und nennt meist keine Preise. Das erzeugte Angebot ist bewusst ein Gerüst: alle Leistungen sauber aufgeschlüsselt, Preisspalten offen zum Ausfüllen. Formuliere Einleitung und Schlusstext deshalb so, dass sie auch ohne Preise stimmig sind, und weise NICHT darauf hin, dass Preise fehlen.
- **RECHNE NICHT.** Keine Zwischensummen, keine Gesamtsumme, keine Mehrwertsteuer. Das übernimmt das Programm. Du lieferst nur Menge und Einzelpreis.
- **ERFINDE KEINE LEISTUNGEN.** Nur was diktiert wurde. Wenn dir auffällt, dass ein üblicher Arbeitsschritt fehlt, gehört dieser Hinweis in "rueckfragen" — nicht in die Positionsliste.
- Was nicht im Diktat steht, ist null oder ein leeres Array.

## Hinterlegte Preisliste des Betriebs

${preislisteAlsText(preisliste)}

Ordne Positionen anhand der Suchbegriffe zu. Passt nichts, bleibt der Preis unbekannt.`;
}

export async function strukturiereTranskript(
  transkript: string,
  preisliste: Preisliste,
): Promise<DokumentDaten> {
  const anthropic = new Anthropic({ apiKey: anthropicConfig().ANTHROPIC_API_KEY });
  const b = preisliste.betrieb;

  const response = await anthropic.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: systemPrompt(preisliste),
    messages: [
      {
        role: "user",
        content:
          `Betrieb: ${b.firma} (Inhaber: ${b.inhaber}${b.gewerk ? `, Gewerk: ${b.gewerk}` : ""})\n\n` +
          `Transkript der Sprachnachricht:\n"""\n${transkript}\n"""`,
      },
    ],
    output_config: { format: zodOutputFormat(DokumentSchema) },
  });

  if (!response.parsed_output) {
    throw new Error(`Strukturierung fehlgeschlagen (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}
