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

// Die KI kennt nur LEISTUNG und MATERIAL — der Handwerker darf im Editor
// aber eigene Hauptkategorien anlegen ("Gerüst", "Entsorgung", …). Deshalb
// ist die Kategorie ab hier ein freier Text, nicht mehr das enge Enum.
// Ebenso die Einheit: Die KI wählt aus EINHEITEN, im Editor darf der
// Handwerker aber eine eigene eintippen ("Andere…", z.B. "Eimer").
export type EingabePosition = Omit<Position, "kategorie" | "einheit"> & {
  kategorie: string;
  einheit: string | null;
  /** true = der Handwerker hat diesen Preis bewusst aus dem Preisgedächtnis
   *  „vergessen" — das automatische Lernen beim Speichern lässt die Zeile dann
   *  in Ruhe, bis er wieder ausdrücklich auf „merken" drückt. */
  gedSperre?: boolean;
};

/** Anzeigename einer Kategorie — die KI-Codes bekommen sprechende Titel. */
export function kategorieName(kategorie: string): string {
  if (kategorie === "LEISTUNG") return "Arbeitsaufwand";
  if (kategorie === "MATERIAL") return "Material";
  return kategorie;
}

export interface BerechnetePosition extends EingabePosition {
  nummer: number;
  gesamt: number | null; // null = nicht berechenbar (Menge oder Preis fehlt)
  offen: boolean; // true = Preis wird vom Handwerker noch eingetragen
}

/** Zwischensumme eines Blocks (Arbeitsaufwand, Material oder eigene Kategorie). */
export interface Teilsumme {
  netto: number;
  /** true, wenn jede Position dieses Blocks berechenbar ist. */
  vollstaendig: boolean;
  anzahl: number;
}

export interface Kategorieblock extends Teilsumme {
  /** Interner Schlüssel (z.B. "LEISTUNG" oder ein frei vergebener Name). */
  kategorie: string;
  /** Sprechender Titel für die Anzeige, z.B. "Arbeitsaufwand". */
  name: string;
  positionen: BerechnetePosition[];
}

export interface Angebotssumme {
  positionen: BerechnetePosition[];
  /** Blöcke in der Reihenfolge ihres ersten Auftretens — jeder mit eigener
   *  Zwischensumme. Der Handwerker kann eigene Kategorien anlegen. */
  bloecke: Kategorieblock[];
  /** Kurzzugriffe für die Standard-Blöcke (E-Mail-Vorlagen). */
  leistungen: Teilsumme;
  material: Teilsumme;
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
  /** Summe der bereits bepreisten Positionen — Zwischenstand für den
   *  Handwerker, erscheint NICHT im Kundendokument. */
  bereitsBepreist: number;
  gueltigBis: Date;
}

const centGenau = (betrag: number): number => Math.round(betrag * 100) / 100;

export function berechneAngebot(
  positionen: EingabePosition[],
  preisliste: Preisliste,
  ab: Date = new Date(),
): Angebotssumme {
  // Anzeige-Reihenfolge festlegen: MATERIAL zuerst, dann LEISTUNG (Arbeits-
  // aufwand), danach eigene Kategorien in ihrer ursprünglichen Reihenfolge. So
  // steht im gesamten Angebot (Editor, PDF, Word) das Material vor dem Arbeits-
  // aufwand. Stabil sortiert (Index als Zweitkriterium), damit die Reihenfolge
  // innerhalb einer Kategorie erhalten bleibt. Weil wir hier sortieren, werden
  // auch die Positionsnummern (Pos. 1, 2, …) in der Anzeige-Reihenfolge vergeben.
  const kategorieRang = (k: string): number => (k === "MATERIAL" ? 0 : k === "LEISTUNG" ? 1 : 2);
  const sortiert = positionen
    .map((p, i) => ({ p, i }))
    .sort((a, b) => kategorieRang(a.p.kategorie) - kategorieRang(b.p.kategorie) || a.i - b.i)
    .map((x) => x.p);

  const berechnet: BerechnetePosition[] = sortiert.map((p, i) => {
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

  // In Cent aufsummieren, damit sich keine Fließkomma-Reste aufaddieren
  const teilsumme = (auswahl: BerechnetePosition[]): Teilsumme => ({
    netto: centGenau(auswahl.reduce((s, p) => s + Math.round((p.gesamt ?? 0) * 100), 0) / 100),
    vollstaendig: auswahl.length > 0 && auswahl.every((p) => !p.offen),
    anzahl: auswahl.length,
  });

  // Blöcke in der Reihenfolge des ersten Auftretens der Kategorie
  const reihenfolge: string[] = [];
  for (const p of berechnet) {
    if (!reihenfolge.includes(p.kategorie)) reihenfolge.push(p.kategorie);
  }
  const bloecke: Kategorieblock[] = reihenfolge.map((kategorie) => {
    const eigene = berechnet.filter((p) => p.kategorie === kategorie);
    return { kategorie, name: kategorieName(kategorie), positionen: eigene, ...teilsumme(eigene) };
  });

  const leistungen = teilsumme(berechnet.filter((p) => p.kategorie !== "MATERIAL"));
  const material = teilsumme(berechnet.filter((p) => p.kategorie === "MATERIAL"));

  const netto = centGenau(
    bloecke.reduce((s, b) => s + Math.round(b.netto * 100), 0) / 100,
  );
  const mwstSatz = preisliste.konditionen.mwstSatz;
  const mwstBetrag = centGenau((netto * mwstSatz) / 100);

  const gueltigBis = new Date(ab);
  gueltigBis.setDate(gueltigBis.getDate() + preisliste.konditionen.angebotGueltigTage);

  const anzahlOffen = berechnet.filter((p) => p.offen).length;

  return {
    positionen: berechnet,
    bloecke,
    leistungen,
    material,
    netto,
    mwstSatz,
    mwstBetrag,
    brutto: centGenau(netto + mwstBetrag),
    anzahlOffen,
    vollstaendig: anzahlOffen === 0 && berechnet.length > 0,
    ohnePreise: berechnet.length > 0 && berechnet.every((p) => p.einzelpreis === null),
    bereitsBepreist: netto,
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
  // Pauschale immer schlicht als "pauschal" ausweisen — die Stückzahl 1 ist nur
  // intern für die Berechnung (Einzelpreis = Gesamtpreis) und würde als
  // "1 pauschal" im Kundendokument nur verwirren.
  if (einheit === "pauschal") return "pauschal";
  if (menge === null) return "—";
  const zahl = menge.toLocaleString("de-DE", { maximumFractionDigits: 2 });
  const beschriftung: Record<string, string> = {
    m2: "m²",
    lfm: "lfm",
    Stk: "Stk.",
    Std: "Std.",
    l: "Liter",
    pauschal: "pauschal",
  };
  return einheit ? `${zahl} ${beschriftung[einheit] ?? einheit}` : zahl;
}
