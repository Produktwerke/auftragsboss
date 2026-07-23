// Alle Summen werden HIER berechnet, nicht von der KI.
//
// Sprachmodelle sind gut im Verstehen, aber nicht zuverlässig im Rechnen.
// Ein falscher Gesamtbetrag in einem Angebot ist geschäftsschädigend —
// deshalb liefert die KI nur Menge und Einzelpreis, und der Code multipliziert.
//
// Rundung: kaufmännisch auf 2 Nachkommastellen, Zwischenschritte in Cent,
// damit sich keine Fließkomma-Ungenauigkeiten aufsummieren.
import type { Position } from "../ai/structure.js";
import type { Preisliste } from "../preisliste.js";

export interface BerechnetePosition extends Position {
  nummer: number;
  gesamt: number | null; // null = nicht berechenbar (Menge oder Preis fehlt)
  offen: boolean; // true = Preis wird vom Handwerker noch eingetragen
}

export interface Angebotssumme {
  positionen: BerechnetePosition[];
  netto: number;
  mwstSatz: number;
  mwstBetrag: number;
  brutto: number;
  anzahlOffen: number;
  /** true, wenn jede Position einen Preis hat — dann ist die Summe belastbar. */
  vollstaendig: boolean;
  /** true, wenn GAR KEIN Preis gesetzt ist — der Regelfall beim Diktat im Auto.
   *  Dann wird die Summenzeile als reiner Platzhalter dargestellt. */
  ohnePreise: boolean;
  gueltigBis: Date;
}

const centGenau = (betrag: number): number => Math.round(betrag * 100) / 100;

export function berechneAngebot(
  positionen: Position[],
  preisliste: Preisliste,
  ab: Date = new Date(),
): Angebotssumme {
  const berechnet: BerechnetePosition[] = positionen.map((p, i) => {
    // "pauschal" braucht keine Menge — der Einzelpreis ist der Gesamtpreis.
    const menge = p.einheit === "pauschal" ? (p.menge ?? 1) : p.menge;
    const berechenbar = menge !== null && p.einzelpreis !== null;

    return {
      ...p,
      nummer: i + 1,
      gesamt: berechenbar ? centGenau(menge * p.einzelpreis!) : null,
      offen: !berechenbar,
    };
  });

  const nettoCent = berechnet.reduce((s, p) => s + Math.round((p.gesamt ?? 0) * 100), 0);
  const netto = centGenau(nettoCent / 100);
  const mwstSatz = preisliste.konditionen.mwstSatz;
  const mwstBetrag = centGenau((netto * mwstSatz) / 100);

  const gueltigBis = new Date(ab);
  gueltigBis.setDate(gueltigBis.getDate() + preisliste.konditionen.angebotGueltigTage);

  const anzahlOffen = berechnet.filter((p) => p.offen).length;

  return {
    positionen: berechnet,
    netto,
    mwstSatz,
    mwstBetrag,
    brutto: centGenau(netto + mwstBetrag),
    anzahlOffen,
    vollstaendig: anzahlOffen === 0 && berechnet.length > 0,
    ohnePreise: berechnet.length > 0 && berechnet.every((p) => p.einzelpreis === null),
    gueltigBis,
  };
}

/** Platzhalter für noch einzutragende Beträge — bewusst neutral, keine Warnung. */
export const PLATZHALTER = "________ €";

/** Fortlaufende Angebotsnummer im Format ANG-2026-0042. */
export function angebotsNummer(laufendeNummer: number, datum: Date = new Date()): string {
  return `ANG-${datum.getFullYear()}-${String(laufendeNummer).padStart(4, "0")}`;
}

export const euro = (betrag: number): string =>
  betrag.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

/** Menge samt Einheit in lesbarer Form, z.B. "45 m²" oder "6 Std." */
export function mengeMitEinheit(menge: number | null, einheit: string | null): string {
  if (menge === null && einheit === "pauschal") return "pauschal";
  if (menge === null) return "—";
  const zahl = menge.toLocaleString("de-DE", { maximumFractionDigits: 2 });
  const beschriftung: Record<string, string> = {
    m2: "m²",
    lfm: "lfm",
    Stk: "Stk.",
    Std: "Std.",
    pauschal: "pauschal",
  };
  return einheit ? `${zahl} ${beschriftung[einheit] ?? einheit}` : zahl;
}
