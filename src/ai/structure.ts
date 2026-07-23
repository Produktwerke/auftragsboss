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
  kategorie: z
    .enum(["LEISTUNG", "MATERIAL"])
    .describe(
      "LEISTUNG: eine Arbeit, die ausgeführt wird. MATERIAL: ein Werkstoff, der dafür gebraucht wird. " +
        "Material erscheint im Angebot in einem eigenen Block.",
    ),
  vorschlag: z
    .boolean()
    .describe(
      "true, wenn diese Position NICHT diktiert wurde, sondern von dir aus dem Handwerkskontext ergänzt " +
        "wurde (typischerweise Material). Wird im Angebot sichtbar als Vorschlag gekennzeichnet, damit der " +
        "Handwerker bewusst entscheidet. false für alles, was im Diktat genannt wurde.",
    ),
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
  positionen: z
    .array(PositionSchema)
    .describe(
      "Erst alle LEISTUNGEN in sinnvoller Ausführungsreihenfolge, danach das zugehörige MATERIAL.",
    ),
  fehlendeInfos: z
    .array(
      z.object({
        feld: z.string().describe("Kurzname der fehlenden Angabe, z.B. 'Kundenadresse'."),
        frage: z
          .string()
          .describe(
            "Eine kurze, direkte Frage an den Handwerker, per WhatsApp lesbar. Duzen. Höchstens ein Satz. " +
              "Beispiel: 'Wie lautet die Adresse von Familie Bär?'",
          ),
        wichtigkeit: z
          .enum(["PFLICHT", "HILFREICH"])
          .describe(
            "PFLICHT: ohne diese Angabe ist das Dokument nicht versandfähig (Kundenname, Adresse bei einem " +
              "Angebot). HILFREICH: verbessert das Ergebnis, ist aber verzichtbar (einzelne Mengen, Details).",
          ),
      }),
    )
    .describe(
      "Angaben, die im Diktat fehlen. Sei sparsam: höchstens 3 Einträge, und nur was wirklich zählt. " +
        "Fehlende PREISE gehören NIE hierher — die trägt der Handwerker ohnehin selbst ein.",
    ),
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

// Gewerkespezifische Materialketten. Malerei ist bewusst am ausführlichsten
// gepflegt — lieber ein Gewerk richtig gut als sieben halbgut. Weitere Gewerke
// sind reine Textbausteine und jederzeit ergänzbar.
const MATERIAL_HINWEISE: Record<string, string> = {
  malerei: `Typische Materialketten im Malerhandwerk:
- Tapezieren → Tapete (Art nach Kundenwahl), Tapetenkleister, ggf. Vorstrich/Tiefengrund
- Malervlies/Renoviervlies anbringen → Vlies, Vlieskleber
- Spachteln → Spachtelmasse, Schleifpapier/Schleifgitter
- Streichen/Anstrich → Dispersionsfarbe, Abdeckfolie, Kreppband, Abdeckvlies
- Alte Tapete entfernen → Tapetenlöser (bei Bedarf)
- Untergrund saugend oder kritisch → Tiefengrund
Fast immer sinnvoll: Abdeckmaterial (Folie, Kreppband) und Entsorgung des Altmaterials.`,

  sanitaer: `Typische Materialketten im Sanitär-/Heizungshandwerk:
- Rohrleitung verlegen → Rohr (Material/Durchmesser), Fittings, Dichtungen, Befestigungsschellen
- Armatur/Ventil tauschen → Armatur, Dichtungssatz, Hanf/Dichtband
- Heizkörper montieren → Heizkörper, Halterungen, Ventil, Thermostatkopf, Verschraubungen
- Therme warten → Dichtungssatz, ggf. Verschleißteile`,

  elektrik: `Typische Materialketten im Elektrohandwerk:
- Leitung verlegen → Kabel (Querschnitt), Leerrohr, Schellen, Dosen
- Steckdose/Schalter setzen → Gerät, Rahmen, Unterputzdose
- Verteiler erweitern → Sicherungsautomat, FI-Schalter, Klemmen`,
};

function materialHinweis(gewerk: string): string {
  const schluessel = gewerk
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue");
  const treffer = Object.keys(MATERIAL_HINWEISE).find((k) => schluessel.includes(k));
  return treffer
    ? MATERIAL_HINWEISE[treffer]!
    : "(Für dieses Gewerk sind keine Materialketten hinterlegt — ergänze Material nur, wenn du dir fachlich sicher bist.)";
}

function systemPrompt(preisliste: Preisliste): string {
  return `Du bist das Backend von "Angebotsblitz", einem Diktier-Tool für deutsche Handwerksbetriebe.

Du erhältst das Roh-Transkript einer WhatsApp-Sprachnachricht, die ein Handwerker direkt nach einem Kundentermin im Auto diktiert hat. Transkripte sind umgangssprachlich, ungeordnet, enthalten Füllwörter, Dialekt-Reste und vor allem TRANSKRIPTIONSFEHLER bei Fachbegriffen.

## Deine Aufgaben

1. **Hörfehler korrigieren.** Die Spracherkennung verwechselt Fachbegriffe. Erkenne aus dem Handwerkskontext, was gemeint war — z.B. "Balkontiere" → "Balkontüren", "Tabezieher" → "tapezieren", "schläfen" → "schleifen", "fünfzehner Kupferrohr" → "Kupferrohr 15 mm". Vermerke solche Korrekturen in "rueckfragen", wenn du dir nicht sicher bist.

2. **Dokumentart erkennen.** Geht es um Arbeiten, die noch ausgeführt werden sollen (ANGEBOT), oder um bereits erledigte Arbeiten (PROTOKOLL)? Achte auf die Zeitform und darauf, ob Maße für eine Kalkulation aufgenommen werden.

3. **Positionen sauber trennen.** Jede Leistung wird eine eigene Position mit Menge und Einheit. Ordne sie in der Reihenfolge, in der ein Fachmann sie ausführen würde (z.B. erst Tapete entfernen, dann spachteln, dann schleifen, dann tapezieren) — nicht in der Reihenfolge des Diktats.

4. **Mengen ableiten, aber ehrlich kennzeichnen.** Wenn eine Menge nur indirekt genannt wurde (z.B. Raumfläche für Deckenarbeiten), darfst du sie übernehmen und setzt "mengeUnsicher": true. Rechne keine komplizierten Wandflächen aus, wenn die nötigen Maße fehlen — dann Menge null und ein Eintrag in "rueckfragen".

5. **Material ergänzen — als sichtbaren Vorschlag.** Zu jeder diktierten Leistung gehört Material, das der Handwerker im Auto meist nicht mit aufzählt. Ergänze es als Positionen mit kategorie "MATERIAL" und vorschlag true. Regeln dafür:
   - Menge NUR setzen, wenn sie sich direkt aus einer Leistung ergibt (Malervlies = Deckenfläche). Verbrauchsmengen wie "wie viel Kleister auf 45 m²" hängen vom Produkt und Untergrund ab — die schätzt du NICHT, Menge bleibt null.
   - Keine Produktnamen oder Marken erfinden. "Tapetenkleister" ja, "Metylan Ovalit T" nein.
   - Keine Dopplung: wurde ein Material bereits diktiert, ist es eine normale Position mit vorschlag false.
   - Im Zweifel weglassen. Ein fehlender Vorschlag ist harmlos, ein unpassender kostet Vertrauen.

6. **Fehlende Angaben melden.** Trage in "fehlendeInfos" ein, was du für ein versandfähiges Dokument brauchst, und formuliere je eine kurze Frage. Der Handwerker bekommt sie per WhatsApp und kann direkt antworten. Halte dich kurz: höchstens 3 Fragen, davon so wenige PFLICHT wie möglich. Bei einem ANGEBOT sind Kundenname und Adresse PFLICHT — ohne sie lässt sich kein Anschreiben erstellen.

## Absolute Regeln

- **ERFINDE NIEMALS PREISE.** Ein Einzelpreis darf nur gesetzt werden, wenn er im Diktat genannt wurde (preisquelle: DIKTAT) oder in der Preisliste unten steht (preisquelle: PREISLISTE). Sonst einzelpreis null und preisquelle UNBEKANNT. Ein erfundener Preis, der beim Kunden landet, ist ein rechtliches Problem für den Handwerker.
- **PREISE FEHLEN NORMALERWEISE — das ist kein Mangel.** Der Handwerker diktiert im Auto und nennt meist keine Preise. Das erzeugte Angebot ist bewusst ein Gerüst: alle Leistungen sauber aufgeschlüsselt, Preisspalten offen zum Ausfüllen. Formuliere Einleitung und Schlusstext deshalb so, dass sie auch ohne Preise stimmig sind, und weise NICHT darauf hin, dass Preise fehlen.
- **RECHNE NICHT.** Keine Zwischensummen, keine Gesamtsumme, keine Mehrwertsteuer. Das übernimmt das Programm. Du lieferst nur Menge und Einzelpreis.
- **ERFINDE KEINE LEISTUNGEN.** Nur was diktiert wurde. Wenn dir auffällt, dass ein üblicher Arbeitsschritt fehlt, gehört dieser Hinweis in "rueckfragen" — nicht in die Positionsliste.
- Was nicht im Diktat steht, ist null oder ein leeres Array.

## Materialwissen für dieses Gewerk (${preisliste.betrieb.gewerk || "unbekannt"})

${materialHinweis(preisliste.betrieb.gewerk)}

## Hinterlegte Preisliste des Betriebs

${preislisteAlsText(preisliste)}

Ordne Positionen anhand der Suchbegriffe zu. Passt nichts, bleibt der Preis unbekannt.`;
}

/** Eine Nachricht im WhatsApp-Dialog. */
export interface DialogNachricht {
  rolle: "handwerker" | "assistent";
  text: string;
}

/**
 * Wertet den gesamten bisherigen Dialog aus.
 *
 * Beim ersten Aufruf ist das nur die erste Sprachnachricht. Nach Rückfragen
 * enthält der Dialog auch die gestellten Fragen und die Antworten darauf —
 * so kann die KI Angaben aus späteren Nachrichten korrekt einsortieren.
 */
export async function strukturiereDialog(
  nachrichten: DialogNachricht[],
  preisliste: Preisliste,
): Promise<DokumentDaten> {
  const anthropic = new Anthropic({ apiKey: anthropicConfig().ANTHROPIC_API_KEY });
  const b = preisliste.betrieb;

  const verlauf = nachrichten
    .map((n) => (n.rolle === "handwerker" ? `HANDWERKER: ${n.text}` : `RÜCKFRAGE: ${n.text}`))
    .join("\n\n");

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
          `Bisheriger Verlauf (Diktat und ggf. Antworten auf deine Rückfragen):\n"""\n${verlauf}\n"""\n\n` +
          `Werte den GESAMTEN Verlauf aus. Angaben aus späteren Antworten ergänzen oder korrigieren ` +
          `frühere. Stelle keine Frage erneut, die bereits beantwortet wurde.`,
      },
    ],
    output_config: { format: zodOutputFormat(DokumentSchema) },
  });

  if (!response.parsed_output) {
    throw new Error(`Strukturierung fehlgeschlagen (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}

/** Bequemer Einstieg für Einzeltexte (Testskripte). */
export function strukturiereTranskript(
  transkript: string,
  preisliste: Preisliste,
): Promise<DokumentDaten> {
  return strukturiereDialog([{ rolle: "handwerker", text: transkript }], preisliste);
}
