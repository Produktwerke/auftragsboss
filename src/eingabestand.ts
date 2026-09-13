// Eingabestand je WhatsApp-Nummer (Umbau 13.09.2026, Dirk: „so schnell wie
// möglich das Angebot, lieber korrigieren als lange interagieren").
//
// Jede Eingabe (Sprache, Text, Foto) zählt den Stand hoch. Eine Auswertung merkt
// sich den Stand beim Start; hat er sich nach dem KI-Aufruf geändert, ist sie
// ÜBERHOLT: die neue Eingabe hat längst eine neue Auswertung geplant, die alles
// enthält. Das Ergebnis der alten wird verworfen, sonst gäbe es zwei Fassungen
// desselben Angebots kurz hintereinander.
const stand = new Map<string, number>();

/** Neue Eingabe dieser Nummer registrieren; liefert den neuen Stand. */
export function merkeEingabe(nummer: string): number {
  const n = (stand.get(nummer) ?? 0) + 1;
  stand.set(nummer, n);
  return n;
}

export function eingabeStandVon(nummer: string): number {
  return stand.get(nummer) ?? 0;
}

/** true, wenn seit standBeiStart eine weitere Eingabe dieser Nummer kam. */
export function istUeberholt(nummer: string, standBeiStart: number): boolean {
  return eingabeStandVon(nummer) !== standBeiStart;
}

/** Nur für Tests. */
export function eingabestandZuruecksetzen(): void {
  stand.clear();
}
