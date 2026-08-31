// Abrechnungs-Kennzahlen (Betreiber-Cockpit Stufe 2).
//
// Reine Rechenfunktionen ohne Datenbankzugriff: Die Routen laden Abos und
// Buchungen, hier wird nur gerechnet. Grundsatz: Umsätze kommen IMMER aus dem
// Buchungs-Ledger (Ist), das Abo liefert nur den Soll-Blick (MRR).

/** Tarif-Presets (EUR netto/Monat) — müssen zur Preisseite der Landingpage passen. */
export const TARIF_PRESETS: Record<string, number> = {
  BASIS: 29,
  PROFI: 79,
  TEAM: 149,
};

export const TARIFE = ["BASIS", "PROFI", "TEAM", "INDIVIDUELL"] as const;
export type Tarif = (typeof TARIFE)[number];

export function istTarif(wert: string): wert is Tarif {
  return (TARIFE as readonly string[]).includes(wert);
}

export interface AboLite {
  status: string; // "AKTIV" | "GEKUENDIGT"
  monatspreis: number;
}

export interface BuchungLite {
  handwerkerId: string;
  betrag: number;
  zeitraum: string; // "JJJJ-MM"
}

/** "JJJJ-MM" für ein Datum (lokale Zeit). */
export function monatsZeitraum(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function istZeitraum(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/** MRR (Soll): Summe der Monatspreise aller aktiven Abos. */
export function mrr(abos: AboLite[]): number {
  return runde(abos.filter((a) => a.status === "AKTIV").reduce((s, a) => s + a.monatspreis, 0));
}

/** Einnahmen (Ist) in einem Monat: Summe aller Buchungsbeträge des Zeitraums. */
export function einnahmenImZeitraum(buchungen: BuchungLite[], zeitraum: string): number {
  return runde(buchungen.filter((b) => b.zeitraum === zeitraum).reduce((s, b) => s + b.betrag, 0));
}

/** Gesamtumsatz seit Start: Summe ALLER Buchungsbeträge. */
export function gesamtUmsatz(buchungen: BuchungLite[]): number {
  return runde(buchungen.reduce((s, b) => s + b.betrag, 0));
}

/** Umsatz je Betrieb (handwerkerId → Summe). */
export function umsatzJeKunde(buchungen: BuchungLite[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of buchungen) m.set(b.handwerkerId, runde((m.get(b.handwerkerId) ?? 0) + b.betrag));
  return m;
}

/** Monatsverlauf, aufsteigend sortiert; Monate ohne Buchung fehlen bewusst nicht,
 *  wenn sie ZWISCHEN belegten Monaten liegen (0-Zeile), damit Lücken sichtbar sind. */
export function monatsverlauf(buchungen: BuchungLite[]): Array<{ zeitraum: string; summe: number }> {
  if (!buchungen.length) return [];
  const summen = new Map<string, number>();
  for (const b of buchungen) summen.set(b.zeitraum, runde((summen.get(b.zeitraum) ?? 0) + b.betrag));
  const sortiert = [...summen.keys()].sort();
  const erste = sortiert[0];
  const letzte = sortiert[sortiert.length - 1];
  const verlauf: Array<{ zeitraum: string; summe: number }> = [];
  let [jahr, monat] = erste.split("-").map(Number);
  const [endJahr, endMonat] = letzte.split("-").map(Number);
  while (jahr < endJahr || (jahr === endJahr && monat <= endMonat)) {
    const z = `${jahr}-${String(monat).padStart(2, "0")}`;
    verlauf.push({ zeitraum: z, summe: summen.get(z) ?? 0 });
    monat++;
    if (monat > 12) {
      monat = 1;
      jahr++;
    }
  }
  return verlauf;
}

/** EUR-Rundung auf 2 Nachkommastellen (vermeidet 0.1+0.2-Artefakte). */
function runde(n: number): number {
  return Math.round(n * 100) / 100;
}
