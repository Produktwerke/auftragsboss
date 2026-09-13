// Fertigmeldung per WhatsApp (Umbau 13.09.2026 nach Dirks Sprachnotizen):
// EINE kompakte Nachricht je Fassung: Link, zwei Zeilen „das habe ich
// verstanden", Warnhinweise (Foto ohne Boden, verworfene Öffnungen, offene
// Pflichtangaben) und zwei Knöpfe „Nächster Raum" / „Angebot korrigieren".
// Kein Materialhinweis, kein Einstellungslink, keine Preisdurchsage-Erklärung.
// Reines Modul ohne Datenbank, damit es sich testen lässt.

/** Kennungen der Antwort-Knöpfe (kommen im Webhook als knopfPayload zurück). */
export const KNOPF_RAUM_WEITER = "RAUM_WEITER";
export const KNOPF_KORRIGIEREN = "ANGEBOT_KORRIGIEREN";

export const ANGEBOTS_KNOEPFE = [
  { id: KNOPF_RAUM_WEITER, titel: "Nächster Raum" },
  { id: KNOPF_KORRIGIEREN, titel: "Angebot korrigieren" },
];

/** Antworten auf die Knöpfe (kein KI-Aufruf). */
export const ANTWORT_RAUM_WEITER = "👍 Dann jetzt Maße und Fotos vom nächsten Raum. Ich hänge ihn an dasselbe Angebot.";
export const ANTWORT_KORRIGIEREN = "👍 Sag mir frei raus, was fehlt oder anders sein soll. Ich mache daraus eine neue Fassung.";
export const ANTWORT_KEIN_ANGEBOT =
  "Das letzte Angebot ist schon eine Weile her. Diktier mir den Auftrag einfach als neue Nachricht, dann mache ich ein frisches Angebot.";

/** Zusatz unter jeder Rückfrage: nichts muss jetzt beantwortet werden. */
export const RUECKFRAGE_ZUSATZ =
  "_Weißt du es gerade nicht? Kein Problem, das kannst du später im Angebot ergänzen._";

/** Einmal je Angebot (erste Fassung mit Räumen, aber ohne Fotos). */
export const FOTO_TIPP =
  "📷 Tipp: je Fenster oder Tür ein Foto, hochkant, Boden und Decke mit drauf. Dann rechne ich die Abzüge fürs Aufmaß.";

/** WhatsApp erlaubt im Text einer Knopfnachricht 1024 Zeichen; etwas Luft lassen. */
export const MAX_ZEICHEN = 1000;
/** Höchstens so viele Hinweiszeilen, sonst wird die Nachricht zur Wand. */
export const MAX_HINWEISE = 4;

export interface FertigmeldungArgs {
  bezeichnung: "Angebot" | "Protokoll";
  nummer: string;
  version: number;
  kunde: string | null;
  link: string;
  raeume: string[];
  leistungen: string[];
  anzahlPositionen: number;
  /** Formatierter Bruttobetrag, nur wenn alle Preise da sind. */
  gesamtBrutto: string | null;
  /** Warnhinweise (Aufmaß, Fotos), schon mit Symbol am Anfang. */
  hinweise: string[];
  /** Pflichtangaben, die die KI noch vermisst (Kurznamen). */
  fehlende: string[];
  fotoTipp: boolean;
  istTest: boolean;
  gewaehrleistungJahre: number | null;
  /** false = Nachricht geht als reiner Text (Knöpfe nicht möglich), dann steht der Hinweis im Text. */
  mitKnoepfen: boolean;
}

/** Räume und Leistungen aus den Positionen, für die Zeile „das habe ich verstanden". */
export function kurzeBilanz(
  positionen: ReadonlyArray<{ kategorie: string; beschreibung: string; raumBezug?: string | null }>,
): { raeume: string[]; leistungen: string[] } {
  const raeume: string[] = [];
  const leistungen: string[] = [];
  for (const p of positionen) {
    const r = (p.raumBezug ?? "").trim();
    if (r && !raeume.includes(r)) raeume.push(r);
    if (p.kategorie !== "MATERIAL") {
      const l = p.beschreibung.split("\n")[0]!.replace(/,?\s*inkl\.? Material\.?$/i, "").trim();
      if (l && !leistungen.includes(l)) leistungen.push(l);
    }
  }
  return { raeume, leistungen };
}

function leistungenKurz(leistungen: string[]): string {
  const max = 3;
  const kurz = leistungen.slice(0, max).map((l) => (l.length > 45 ? l.slice(0, 42).trimEnd() + "…" : l));
  const rest = leistungen.length - kurz.length;
  return kurz.join(", ") + (rest > 0 ? `, +${rest} weitere` : "");
}

export function baueFertigmeldung(a: FertigmeldungArgs): string {
  const kopf =
    a.version > 1
      ? `✅ ${a.bezeichnung} ${a.nummer}, Fassung ${a.version}`
      : `✅ ${a.bezeichnung} ${a.nummer} für *${a.kunde?.trim() || "deinen Auftrag"}* ist fertig`;

  const pos = `${a.anzahlPositionen} Position${a.anzahlPositionen === 1 ? "" : "en"}`;
  let verstanden: string;
  if (a.raeume.length && a.leistungen.length) verstanden = `📋 ${a.raeume.join(", ")}: ${leistungenKurz(a.leistungen)} (${pos})`;
  else if (a.leistungen.length) verstanden = `📋 ${leistungenKurz(a.leistungen)} (${pos})`;
  else if (a.raeume.length) verstanden = `📋 ${a.raeume.join(", ")} (${pos})`;
  else verstanden = `📋 ${pos}`;

  const kopfZeilen: string[] = [kopf, verstanden];
  if (a.gesamtBrutto) kopfZeilen.push(`💶 Gesamt: ${a.gesamtBrutto} brutto`);
  kopfZeilen.push("", `👉 ${a.link}`);

  const alleHinweise = [...a.hinweise];
  if (a.fehlende.length) alleHinweise.push(`✏️ Im Angebot noch ergänzen: ${a.fehlende.slice(0, 3).join(", ")}.`);

  const schluss: string[] = [];
  if (a.fotoTipp) schluss.push("", FOTO_TIPP);
  if (a.gewaehrleistungJahre) schluss.push("", `🛡️ Gewährleistung ${a.gewaehrleistungJahre} Jahre, ich erinnere dich vor Ablauf.`);
  if (a.istTest) schluss.push("", "👆 Das war ein Test. Im Link kannst du jede Position, Menge und jeden Preis anpassen.");
  if (!a.mitKnoepfen) schluss.push("", "Nächster Raum oder eine Korrektur? Einfach weiter diktieren, ich mache eine neue Fassung.");

  const zusammen = (anzahl: number): string => {
    const gezeigt = alleHinweise.slice(0, anzahl);
    if (alleHinweise.length > anzahl && anzahl > 0) gezeigt.push(`… und ${alleHinweise.length - anzahl} weitere Hinweise, siehe Angebot.`);
    return [...kopfZeilen, ...(gezeigt.length ? ["", ...gezeigt] : []), ...schluss].join("\n");
  };

  // Zu lang für eine Knopfnachricht: Hinweise von hinten kürzen, notfalls hart kappen.
  let anzahl = Math.min(MAX_HINWEISE, alleHinweise.length);
  let text = zusammen(anzahl);
  while (text.length > MAX_ZEICHEN && anzahl > 0) text = zusammen(--anzahl);
  if (text.length > MAX_ZEICHEN) text = text.slice(0, MAX_ZEICHEN - 1) + "…";
  return text;
}
