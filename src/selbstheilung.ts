// Selbstheilung der Angebots-Auswertung (13.09.2026, Dirk: „wenn so etwas bei
// einem echten Kunden passiert, muss ich informiert werden, kann unterwegs aber
// nichts tun").
//
// Scheitert die KI-Auswertung eines Vorgangs, wird er NICHT mehr geschlossen,
// sondern mit wachsendem Abstand erneut versucht. Der Maler erfährt ab dem
// zweiten Fehlversuch ehrlich, dass es klemmt und sein Diktat gespeichert ist.
// Der Betreiber bekommt je Fehlversuch einen Alarm (E-Mail + WhatsApp, siehe
// betrieb/betreiberAlarm.ts) und nach dem Erfolg eine Entwarnung.
// Reines Modul ohne Datenbank, damit es sich testen lässt.

/** Abstand bis zum nächsten Versuch in Minuten, je Fehlversuch (1., 2., 3. …). */
export const WIEDERHOLUNGEN_MINUTEN = [3, 10, 30, 60, 60, 60] as const;

/** Ab diesem Fehlversuch bekommt der Maler den ehrlichen Zwischenstand. */
export const MALER_HINWEIS_AB_VERSUCH = 2;

/** Minuten bis zum nächsten Versuch nach dem n-ten Fehlversuch; null = aufgeben. */
export function naechsteWiederholungMinuten(fehlversuche: number): number | null {
  if (fehlversuche < 1) return WIEDERHOLUNGEN_MINUTEN[0];
  return WIEDERHOLUNGEN_MINUTEN[fehlversuche - 1] ?? null;
}

export const MAX_FEHLVERSUCHE = WIEDERHOLUNGEN_MINUTEN.length;

export const MALER_ZWISCHENSTAND =
  "⏳ Bei mir klemmt gerade etwas. Dein Diktat ist gespeichert, ich versuche es automatisch weiter und melde mich, sobald das Angebot fertig ist. Du musst nichts noch einmal schicken.";

export const MALER_AUFGEGEBEN =
  "⚠️ Es tut mir leid, ich bekomme dein Angebot gerade nicht fertig. Dein Diktat ist gespeichert und das AuftragsBoss-Team ist informiert. Bitte schick es in ein paar Stunden noch einmal, oder melde dich unter kontakt@auftragsboss.de.";

/** Vorgeschlagener Satz, den der Betreiber dem Kunden von unterwegs schicken kann. */
export const KUNDEN_SATZ =
  "Hallo, hier ist Dirk von AuftragsBoss. Bei deinem letzten Angebot hakt es gerade auf unserer Seite. Dein Diktat ist gespeichert, wir kümmern uns darum und du bekommst das Angebot, sobald es läuft. Entschuldige die Verzögerung.";

/** Kurzer Stand für Alarm und Log. */
export function standText(fehlversuche: number): string {
  const naechste = naechsteWiederholungMinuten(fehlversuche);
  if (naechste === null) return `Versuch ${fehlversuche} von ${MAX_FEHLVERSUCHE} gescheitert, aufgegeben. Der Maler wurde gebeten, das Diktat später noch einmal zu schicken.`;
  return `Versuch ${fehlversuche} von ${MAX_FEHLVERSUCHE} gescheitert, nächster automatisch in ${naechste} Minuten.`;
}
