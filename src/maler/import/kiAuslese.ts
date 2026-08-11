// Maler-Fachengine v1 — KI-gestützte Auslese eines Alt-Angebots.
//
// Der reine Regel-Parser (parser.ts) scheitert an echten Angeboten: mehrspaltige
// Layouts, Überträge/Titelsummen, verschobene Preisspalten. Deshalb strukturiert
// hier Claude den bereits extrahierten ROHTEXT in Kopfdaten + Positionen — genau
// wie AuftragsBoss es beim Diktat schon tut (structure.ts).
//
// STRIKTE Regeln (wie überall im Produkt): Claude erfindet NICHTS und rechnet
// NICHT. Es übernimmt nur, was wörtlich im Text steht. Zwischensummen, Überträge
// und Endsummen sind KEINE Positionen. Fehlt ein Wert, bleibt er null. Die
// deterministische Plausiprüfung (Positionssumme vs. Netto) bleibt als
// Sicherheitsnetz dahinter (pruefeSummen).
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { anthropicConfig } from "../../config.js";
import {
  bewerteKonfidenz,
  kanonischeEinheit,
  pruefeSummen,
  type ParseErgebnis,
  type ParseKopf,
  type ParsePosition,
} from "./parser.js";

// Was Claude liefern MUSS — bewusst schlicht, alle Zahlen als number|null.
const KiPositionSchema = z.object({
  nummer: z.string().nullable().describe("Positionsnummer wie im Angebot (z.B. '1.1'), sonst null."),
  titel: z.string().describe("Leistungstext der Position, ohne Mengen/Preise."),
  menge: z.number().nullable().describe("Menge, falls ausgewiesen, sonst null. Nichts schätzen."),
  einheit: z.string().nullable().describe("Einheit wie im Angebot (m², qm, Std, Stk, pauschal…), sonst null."),
  einzelpreis: z.number().nullable().describe("Preis pro Einheit, falls ausgewiesen, sonst null. Nicht rechnen."),
  gesamtpreis: z.number().nullable().describe("Zeilensumme der Position, falls ausgewiesen, sonst null. Nicht rechnen."),
});

const KiAusleseSchema = z.object({
  angebotsnummer: z.string().nullable(),
  datum: z.string().nullable().describe("Angebotsdatum als YYYY-MM-DD, sonst null."),
  mwstSatz: z.number().nullable().describe("MwSt-Satz in Prozent (z.B. 19), sonst null."),
  nettoSumme: z.number().nullable().describe("Ausgewiesene Nettosumme (Gesamtbetrag netto), sonst null."),
  mwstSumme: z.number().nullable().describe("Ausgewiesener MwSt-Betrag, sonst null."),
  bruttoSumme: z.number().nullable().describe("Ausgewiesener Gesamtbetrag inkl. Steuer, sonst null."),
  positionen: z.array(KiPositionSchema),
});

const SYSTEM = `Du bist das Import-Backend von "AuftragsBoss". Du bekommst den ROHTEXT eines BESTEHENDEN Angebots eines Handwerksbetriebs (aus einer PDF/Word-Datei ausgelesen) und strukturierst ihn.

## Aufgabe
Lies Kopfdaten und Leistungspositionen aus dem Text und gib sie strukturiert zurück.

## Absolute Regeln
- ERFINDE NICHTS. Übernimm nur, was wörtlich im Text steht. Steht ein Wert nicht da, ist er null.
- RECHNE NICHT. Leite keine Preise, Mengen oder Summen ab. Wenn nur ein Gesamtpreis dasteht, bleibt der Einzelpreis null (nicht dividieren). Wenn nur ein Einzelpreis dasteht, bleibt der Gesamtpreis null.
- Ordne Einzel- und Gesamtpreis KORREKT zu: Einzelpreis = Preis pro Einheit, Gesamtpreis = Zeilensumme dieser Position. In mehrspaltigen Angeboten sind das getrennte Spalten; verwechsle sie nicht.
- Positionsnummern (1, 1.1, 2.3 …) gehören in "nummer", NICHT in den Titel.

## Was KEINE Position ist (weglassen)
Zwischensummen, Überträge ("Übertrag"), Titelsummen, Titelüberschriften ohne eigene Leistung, "Gesamtbetrag netto", "Mehrwertsteuer", "Gesamtbetrag inkl. Steuer", Seitenzahlen, Anschriften, Anrede, Einleitungs- und Schlusstexte. Solche Zeilen sind Kopf-/Summen-/Fließtext, keine Leistungen.

## Kopf-/Summenfelder
- nettoSumme / mwstSumme / bruttoSumme NUR aus den ausdrücklich ausgewiesenen END-Summen des Angebots übernehmen (nicht aus einer beliebigen Zeile mit einer Zahl).
- mwstSatz als Prozentzahl (19), datum als YYYY-MM-DD.

## Einheiten
Übernimm die Einheit so, wie sie im Angebot steht (m², qm, m2, lfm, Std, Stunden, Stk, pauschal, l, kg …). Die Normalisierung macht das Programm.

Gib ausschließlich das strukturierte Ergebnis zurück.`;

/** ISO-Datum (YYYY-MM-DD) → Date (mittags), oder null. */
function zuDatum(iso: string | null): Date | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const jahr = Number(m[1]);
  const monat = Number(m[2]);
  const tag = Number(m[3]);
  if (monat < 1 || monat > 12 || tag < 1 || tag > 31) return null;
  return new Date(jahr, monat - 1, tag, 12, 0, 0);
}

/**
 * Strukturiert den Rohtext eines Alt-Angebots per Claude in das gleiche Format
 * wie der Regel-Parser (ParseErgebnis) — so ist die KI-Auslese ein direkter
 * Ersatz. Wirft bei API-/Format-Fehler; der Aufrufer kann auf den Regel-Parser
 * zurückfallen.
 */
export async function kiAusleseAngebotstext(
  text: string,
  /** Optional: meldet den Token-Verbrauch (Kosten-Tracking im Betreiber-Cockpit). */
  verbrauch?: (tokensEin: number, tokensAus: number) => void,
): Promise<ParseErgebnis> {
  const anthropic = new Anthropic({ apiKey: anthropicConfig().ANTHROPIC_API_KEY });

  const response = await anthropic.messages.parse({
    model: "claude-fable-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Rohtext des Angebots:\n"""\n${text}\n"""\n\nStrukturiere den Text nach den Regeln. Erfinde nichts, rechne nicht.`,
      },
    ],
    output_config: { format: zodOutputFormat(KiAusleseSchema) },
  });

  verbrauch?.(response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0);

  if (response.stop_reason === "refusal") {
    throw new Error("KI hat die Auslese abgelehnt (refusal).");
  }
  if (!response.parsed_output) {
    throw new Error(`KI-Auslese fehlgeschlagen (stop_reason: ${response.stop_reason}).`);
  }
  const roh = response.parsed_output;

  const kopf: ParseKopf = {
    angebotsnummer: roh.angebotsnummer?.trim() || null,
    dokumentDatum: zuDatum(roh.datum),
    mwstSatz: roh.mwstSatz,
    nettoSumme: roh.nettoSumme,
    mwstSumme: roh.mwstSumme,
    bruttoSumme: roh.bruttoSumme,
  };

  const positionen: ParsePosition[] = roh.positionen
    .filter((p) => p.titel?.trim())
    .map((p) => {
      const einheit = kanonischeEinheit(p.einheit);
      return {
        originalNummer: p.nummer?.trim() || null,
        originalTitel: p.titel.trim(),
        menge: p.menge,
        einheit,
        einzelpreis: p.einzelpreis,
        gesamtpreis: p.gesamtpreis,
        // Konfidenz deterministisch (rechnerisch stimmig = high) — nicht die KI
        // ihre eigene Sicherheit bewerten lassen.
        konfidenz: bewerteKonfidenz(p.menge, einheit, p.einzelpreis, p.gesamtpreis),
      };
    });

  return { kopf, positionen, warnungen: pruefeSummen(kopf, positionen) };
}
