// Maler-Fachengine v1 — deterministischer Parser für Alt-Angebotstexte.
//
// Wandelt den extrahierten ROHTEXT eines Alt-Angebots in strukturierte
// Kopfdaten + Positionen. Streng regelbasiert, KEINE KI, KEINE Erfindung:
//   • Ein Wert wird nur gesetzt, wenn er wörtlich im Text steht.
//   • Was nicht sicher erkannt wird, bleibt null (später manuell prüfbar).
//   • Preise werden nie berechnet/ergänzt — nur übernommen, wie sie dastehen.
// Die Konfidenz je Position sagt, wie belastbar die Zerlegung war.

export type Konfidenz = "high" | "medium" | "low" | "unknown";

export interface ParsePosition {
  originalNummer: string | null;
  originalTitel: string;
  menge: number | null;
  einheit: string | null;
  einzelpreis: number | null;
  gesamtpreis: number | null;
  konfidenz: Konfidenz;
}

export interface ParseKopf {
  angebotsnummer: string | null;
  dokumentDatum: Date | null;
  mwstSatz: number | null;
  nettoSumme: number | null;
  mwstSumme: number | null;
  bruttoSumme: number | null;
}

export interface ParseErgebnis {
  kopf: ParseKopf;
  positionen: ParsePosition[];
  warnungen: string[];
}

// Erkannte Einheiten (klein geschrieben). Reihenfolge: längere zuerst matchen.
const EINHEITEN: Record<string, string> = {
  "m²": "m²",
  m2: "m²",
  qm: "m²",
  "m³": "m³",
  m3: "m³",
  lfdm: "lfm",
  lfm: "lfm",
  "lfd.m": "lfm",
  laufmeter: "lfm",
  stk: "Stk",
  stck: "Stk",
  stück: "Stk",
  std: "Std",
  stunde: "Std",
  stunden: "Std",
  h: "Std",
  psch: "pauschal",
  pauschal: "pauschal",
  pausch: "pauschal",
  liter: "Liter",
  l: "Liter",
  kg: "kg",
  sack: "Sack",
  gebinde: "Gebinde",
  rolle: "Rolle",
  stg: "Stg", // Gerüst-Standgerüst o.ä. — als Rohwert übernehmen
};

/** Deutsche Zahl ("1.234,56" / "45,00" / "12") → number. Null bei Unsinn. */
function zahl(roh: string): number | null {
  const t = roh.trim().replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Ein Geldbetrag: deutsche Notation mit Nachkommastellen, € optional.
// Beispiele: "1.234,56 €", "540,00€", "12,00 EUR"
const GELD = /(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})\s*(?:€|EUR|eur)?/g;

// Menge + Einheit direkt beieinander, z.B. "45,00 m²" / "12 Stk" / "3 h".
// Der abschließende Lookahead ersetzt ein \b: Einheiten wie "m²"/"m³" enden auf
// ein Nicht-Wort-Zeichen, an dem \b scheitern würde. Die Einheit muss von
// Leerzeichen, Satzzeichen, €/Ende gefolgt sein — so matcht "3 h", nicht "3 haus".
const MENGE_EINHEIT = new RegExp(
  String.raw`(\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s*(m²|m2|qm|m³|m3|lfdm|lfm|lfd\.m|laufmeter|stück|stck|stk|stunden|stunde|std|psch|pauschal|pausch|liter|sack|gebinde|rolle|kg|stg|h|l)(?=[\s.,;:)\/€]|$)`,
  "i",
);

/** Findet alle Geldbeträge einer Zeile als Zahlenwerte, in Reihenfolge. */
function geldbetraege(zeile: string): number[] {
  const treffer: number[] = [];
  for (const m of zeile.matchAll(GELD)) {
    const n = zahl(`${m[1]},${m[2]}`);
    if (n !== null) treffer.push(n);
  }
  return treffer;
}

/** Prozent-MwSt-Satz aus einem Textausschnitt, z.B. "MwSt. 19 %". */
function prozentSatz(text: string): number | null {
  const m = text.match(/(\d{1,2}(?:,\d)?)\s*%/);
  if (!m) return null;
  return zahl(m[1]);
}

/** Deutsches Datum TT.MM.JJJJ → Date (lokal, mittags um DST-Rand zu meiden). */
function datum(text: string): Date | null {
  const m = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const tag = Number(m[1]);
  const monat = Number(m[2]);
  const jahr = Number(m[3]);
  if (monat < 1 || monat > 12 || tag < 1 || tag > 31) return null;
  return new Date(jahr, monat - 1, tag, 12, 0, 0);
}

/** Zeilen, die keine Positionen sind (Kopf/Fuß/Summen/Rechtstexte). */
const IGNORIER_PRAEFIX =
  /^(angebot|datum|kunde|kundennummer|objekt|bauvorhaben|seite|zwischensumme|netto|zwischen|summe|gesamt|mwst|mehrwertsteuer|umsatzsteuer|ust|zahlungsziel|gültig|gueltig|position\b|pos\.?\b|menge\b|einheit\b|einzelpreis|gesamtpreis|bezeichnung|leistung\b|beschreibung\b|anzahl\b)/i;

/**
 * Prüft, ob eine Zeile inhaltlich als Position taugt: Sie braucht Text UND
 * mindestens einen belastbaren Zahlenanker (Menge+Einheit oder einen Preis).
 */
function istPositionsZeile(zeile: string): boolean {
  const hatText = /[a-zäöüß]{3,}/i.test(zeile);
  if (!hatText) return false;
  if (IGNORIER_PRAEFIX.test(zeile.trim())) return false;
  const hatGeld = geldbetraege(zeile).length > 0;
  const hatMenge = MENGE_EINHEIT.test(zeile);
  return hatGeld || hatMenge;
}

/** Zerlegt eine einzelne Positionszeile. */
function parsePosition(zeile: string): ParsePosition {
  const roh = zeile.trim();

  // 1) Führende Positionsnummer ("1", "1.", "01", "1.1", "10)") abtrennen.
  let rest = roh;
  let originalNummer: string | null = null;
  const nummerM = rest.match(/^(\d{1,3}(?:\.\d{1,2})?)[.)]?\s+/);
  if (nummerM) {
    originalNummer = nummerM[1];
    rest = rest.slice(nummerM[0].length);
  }

  // 2) Menge + Einheit (erstes Vorkommen).
  let menge: number | null = null;
  let einheit: string | null = null;
  const meM = rest.match(MENGE_EINHEIT);
  if (meM) {
    menge = zahl(meM[1]);
    einheit = EINHEITEN[meM[2].toLowerCase()] ?? meM[2];
  }

  // 3) Preise: letzter Geldbetrag = Gesamtpreis; ein zweiter, davor stehender,
  //    plausibler = Einzelpreis. Konservativ, nichts rechnen. WICHTIG: die
  //    Menge (z.B. "80,00 m²") vorher entfernen, sonst zählt sie als Geldbetrag.
  const restOhneMenge = meM ? rest.replace(meM[0], " ") : rest;
  const preise = geldbetraege(restOhneMenge);
  let einzelpreis: number | null = null;
  let gesamtpreis: number | null = null;
  if (preise.length === 1) {
    gesamtpreis = preise[0];
  } else if (preise.length >= 2) {
    gesamtpreis = preise[preise.length - 1];
    einzelpreis = preise[preise.length - 2];
  }

  // 4) Titel = Zeile ohne Mengen-/Einheit-/Preis-Ballast.
  let titel = rest
    .replace(MENGE_EINHEIT, " ")
    .replace(GELD, " ")
    .replace(/\b(€|EUR|eur)\b/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    // verwaiste Trenner an den Rändern entfernen
    .replace(/^[\s.:;,\-–|]+|[\s.:;,\-–|]+$/g, "")
    .trim();
  if (!titel) titel = roh; // im Zweifel den Rohtext behalten, nie leer

  // 5) Konfidenz: je vollständiger und rechnerisch stimmiger, desto höher.
  let konfidenz: Konfidenz = "low";
  const vollstaendig = menge !== null && einheit !== null && einzelpreis !== null && gesamtpreis !== null;
  if (vollstaendig) {
    // Stimmt Menge × Einzelpreis (auf 2 Cent genau) mit dem Gesamtpreis?
    const erwartet = Math.round(menge! * einzelpreis! * 100) / 100;
    konfidenz = Math.abs(erwartet - gesamtpreis!) <= 0.02 ? "high" : "medium";
  } else if ((menge !== null && einheit !== null) || gesamtpreis !== null) {
    konfidenz = "medium";
  }

  return { originalNummer, originalTitel: titel, menge, einheit, einzelpreis, gesamtpreis, konfidenz };
}

/** Liest die Kopf-/Summenfelder aus dem gesamten Text. */
function parseKopf(text: string, zeilen: string[]): ParseKopf {
  const angebotM = text.match(/angebot(?:s)?[-\s]?(?:nr\.?|nummer)[:\s]*([A-Za-z0-9][A-Za-z0-9\/.\-]*)/i);
  const angebotsnummer = angebotM ? angebotM[1].replace(/[.\-\/]+$/, "") : null;

  // Datum: bevorzugt eine Zeile mit "Datum", sonst das erste Datum im Text.
  const datumZeile = zeilen.find((z) => /datum/i.test(z));
  const dokumentDatum = (datumZeile && datum(datumZeile)) || datum(text);

  // Summen zeilenweise suchen (der jeweils letzte Betrag der Zeile zählt).
  let netto: number | null = null;
  let mwstSumme: number | null = null;
  let brutto: number | null = null;
  let mwstSatz: number | null = null;
  for (const z of zeilen) {
    const betr = geldbetraege(z);
    const letzter = betr.length ? betr[betr.length - 1] : null;
    if (/(zwischensumme|nettobetrag|netto(?!.*inkl)|gesamt\s*netto|summe\s*netto)/i.test(z) && letzter !== null) {
      netto = letzter;
    }
    if (/(mwst|mehrwertsteuer|umsatzsteuer|ust)/i.test(z)) {
      const s = prozentSatz(z);
      if (s !== null) mwstSatz = s;
      if (letzter !== null) mwstSumme = letzter;
    }
    if (/(gesamtbetrag|rechnungsbetrag|gesamtsumme|bruttobetrag|endbetrag|gesamt\s*brutto|zu\s*zahlen)/i.test(z) && letzter !== null) {
      brutto = letzter;
    }
  }

  return { angebotsnummer, dokumentDatum, mwstSatz, nettoSumme: netto, mwstSumme, bruttoSumme: brutto };
}

/**
 * Parst den Rohtext eines Alt-Angebots. Deterministisch, konservativ:
 * erkennt Kopfdaten + Positionen, erfindet nichts, lässt Unsicheres null.
 */
export function parseAngebotstext(text: string): ParseErgebnis {
  const zeilen = text
    .split(/\r?\n/)
    .map((z) => z.replace(/\t/g, " ").replace(/\s{2,}/g, " ").trim())
    .filter((z) => z.length > 0);

  const kopf = parseKopf(text, zeilen);

  const positionen: ParsePosition[] = [];
  for (const z of zeilen) {
    if (istPositionsZeile(z)) positionen.push(parsePosition(z));
  }

  const warnungen: string[] = [];
  if (positionen.length === 0) {
    warnungen.push("Keine Positionen erkannt — Struktur unklar, bitte manuell prüfen.");
  }
  if (kopf.nettoSumme !== null && positionen.some((p) => p.gesamtpreis !== null)) {
    const summe = positionen.reduce((s, p) => s + (p.gesamtpreis ?? 0), 0);
    // Große Abweichung → Zerlegung womöglich unvollständig (nur Hinweis).
    if (Math.abs(summe - kopf.nettoSumme) > Math.max(1, kopf.nettoSumme * 0.02)) {
      warnungen.push(
        `Summe der erkannten Positionen (${summe.toFixed(2)}) weicht vom Netto (${kopf.nettoSumme.toFixed(2)}) ab.`,
      );
    }
  }

  return { kopf, positionen, warnungen };
}
