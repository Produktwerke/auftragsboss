// Verwaltung des laufenden WhatsApp-Dialogs.
//
// Grundgedanke: Der Handwerker sitzt im Auto. Rückfragen dürfen deshalb
// hilfreich sein, aber niemals lästig — harte Obergrenze bei den Runden,
// jederzeit ein Ausweg per Stichwort, und automatischer Abschluss, wenn
// er das Handy einfach weglegt.
import type { PrismaClient, Vorgang } from "@prisma/client";
import type { DialogNachricht, DokumentDaten } from "./ai/structure.js";
import { euro } from "./angebot/berechnung.js";
import { aufmassKurz, berechneAufmass, parseRaeumeText } from "./maler/aufmass.js";

/** Höchstens so viele Rückfrage-Runden, dann wird abgeschlossen. */
export const MAX_RUNDEN = 2;

/** Nach so langer Funkstille gilt ein Vorgang als beendet und wird fertiggestellt. */
export const TIMEOUT_MINUTEN = 15;

/** Im Sammelmodus (Räume + Fotos): nach so langer Stille einmal nachfragen
 *  „noch ein Raum, oder fertig?", bevor der Zeitablauf das Angebot erzwingt. */
export const ERINNERUNG_MINUTEN = 5;

/** Nach so langer Pause zählt eine neue Nachricht als neuer Auftrag, nicht als Antwort. */
export const NEUER_VORGANG_NACH_MINUTEN = 60;

/**
 * So lange nach dem Fertigstellen gilt eine neue Nachricht als NACHTRAG zum
 * eben erstellten Dokument — "ach, die Fenster sollen auch gestrichen werden"
 * oder "tapezieren machen wir für 14 Euro". So muss niemand die Word-Tabelle
 * anfassen; das Nachbessern läuft wie das Diktieren selbst.
 */
export const NACHTRAG_MINUTEN = 45;

/**
 * NOTFALLNETZ — nicht der eigentliche Mechanismus.
 *
 * Ob der Dialog endet, entscheidet die KI aus dem Verlauf: "mach ich später",
 * "keine Ahnung" oder eine Antwort, die an der Frage vorbeigeht, werden als
 * Abschluss verstanden, ohne dass der Handwerker ein Zauberwort kennen muss.
 *
 * Diese Liste greift nur, wenn die KI-Auswertung ausfällt (Netzfehler, Timeout).
 * Sie ist damit eine Absicherung, kein zu lernendes Vokabular.
 */
const ABSCHLUSS_WOERTER = [
  "weiter",
  "fertig",
  "später",
  "spaeter",
  "passt",
  "passt so",
  "reicht",
  "reicht so",
  "das wars",
  "das war's",
  "abschließen",
  "abschliessen",
  "mach fertig",
  "erstell",
  "erstelle",
  "ok",
  "okay",
  "ja",
  "jo",
  "jup",
  "jawohl",
  "genau",
  "stimmt",
  "weiß ich nicht",
  "weiss ich nicht",
  "keine ahnung",
];

export interface GespeicherteNachricht extends DialogNachricht {
  /** foto = automatische Wandfoto-Auswertung (Text ist die Erkennungszeile). */
  art: "sprache" | "text" | "foto";
  zeit: string;
}

/**
 * Grobe Erkennung eines Abbruchwunsches — siehe Hinweis oben, das ist nur
 * das Notfallnetz.
 *
 * Nur bei KURZEN Nachrichten — sonst würde ein Diktat wie "…dann machen wir
 * weiter mit der Decke…" fälschlich als Abbruch gewertet.
 */
export function istAbschluss(text: string): boolean {
  const sauber = text
    .toLowerCase()
    .replace(/[.,!?;:]/g, "")
    .trim();
  if (sauber.length > 40) return false;
  return ABSCHLUSS_WOERTER.some((w) => sauber === w || sauber.startsWith(w + " ") || sauber.endsWith(" " + w));
}

const kurzUndSauber = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[.,!?;:„"“”'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * SAMMELMODUS (Räume und Wandfotos, Live-Test 11.09.2026): Erst wenn der Maler
 * „fertig" sagt, wird das Angebot gemacht. Bis dahin bekommt er nach jedem Raum
 * eine Bilanz mit der Frage „nächster Raum oder fertig?". Kurze Nachrichten,
 * die diesen Wunsch ausdrücken:
 */
export function istFertigWunsch(text: string): boolean {
  const s = kurzUndSauber(text);
  if (!s || s.length > 80) return false;
  return /(^|\s)(fertig|das wars|das war s|alles drin|mach (das|mir das|jetzt das) angebot|angebot (jetzt )?(machen|erstellen|fertig ?machen)|schick (mir )?(das|den) (angebot|entwurf)|abschließen|abschliessen|mach fertig)(\s|$)/.test(s);
}

/** Kurze Bestätigung einer Zusammenfassung („ja", „passt so"). */
export function istBestaetigung(text: string): boolean {
  const s = kurzUndSauber(text);
  if (!s || s.length > 40) return false;
  return /^(ja|jo|jep|jup|jawohl|genau|stimmt|richtig|korrekt|passt|passt so|ok|okay|alles richtig|so passt es|ja passt|ja stimmt|ja genau)( so)?( danke)?$/.test(s);
}

/**
 * Raumbilanz nach einem Raum (Sammelmodus): was ist drin, und die Aufforderung
 * weiterzumachen oder „fertig" zu sagen. Eine Zeile je Raum, ohne Eingangsmaße
 * (die stehen in der Rückfrage bzw. im Aufmaßblatt), dafür mit dem Ergebnis.
 */
export function raumBilanz(raeumeText: string | null | undefined, aufforderung: string): string | null {
  const aufmass = berechneAufmass(parseRaeumeText(raeumeText));
  if (aufmass.raeume.length === 0) return null;
  const zeilen: string[] = [];
  const letzter = aufmass.raeume[aufmass.raeume.length - 1]!;
  zeilen.push(aufmass.raeume.length === 1 ? `✅ *${letzter.name}* ist drin.` : `✅ *${letzter.name}* ist drin. Bisher ${aufmass.raeume.length} Räume:`);
  const z2 = (x: number) => x.toFixed(2).replace(".", ",");
  for (const r of aufmass.raeume) {
    const teile: string[] = [];
    teile.push(`Wände ${z2(r.wandNettoM2)} m²${r.paneelHoeheM ? " oberhalb der Paneele" : ""}`);
    if (r.schraegenM2 > 0) teile.push(`davon ${z2(r.schraegenM2)} m² Dachschrägen`);
    if (r.deckeM2 !== null) teile.push(`Decke ${z2(r.deckeM2)} m²`);
    if (r.abzugM2 > 0) teile.push(`${z2(r.abzugM2)} m² Öffnungen abgezogen`);
    zeilen.push(`• ${r.name}: ${teile.join(", ")}`);
    for (const v of r.verworfen) zeilen.push(`⚠️ ${r.name}: ${v}, nicht abgezogen`);
    for (const w of r.warnungen) zeilen.push(`⚠️ ${r.name}: ${w}`);
  }
  for (const u of aufmass.uebersprungen) zeilen.push(`⚠️ ${u.name}: noch nicht berechnet (${u.grund})`);
  zeilen.push("", aufforderung);
  return zeilen.join("\n");
}

/**
 * Kurze, lesbare Zusammenfassung dessen, was die KI verstanden hat — für den
 * WhatsApp-Readback vor dem Angebot ("das habe ich verstanden").
 *
 * Bewusst mit FETTGEDRUCKTEN Überschriften statt Emojis und OHNE separate
 * Aufmaß-Zeile: Die Maße stehen ohnehin im Objekt und in den Leistungen; eine
 * zusätzliche Maß-Zeile wirkte wie eine Doppelung und verwirrte. Keine
 * Gedankenstriche.
 */
export function baueZusammenfassung(daten: DokumentDaten): string {
  const zeilen: string[] = ["*Das habe ich verstanden:*", ""];
  const k = daten.kunde;
  const kunde = [k.name, k.strasse].filter((s) => s && s.trim()).join(", ");
  if (kunde) zeilen.push(`*Kunde:* ${kunde}`);
  if (daten.objekt?.trim()) zeilen.push(`*Objekt:* ${daten.objekt.trim()}`);

  const leistungen = daten.positionen
    .filter((p) => p.kategorie === "LEISTUNG")
    .map((p) => p.beschreibung.trim())
    .filter(Boolean);
  if (leistungen.length) {
    zeilen.push("*Leistungen:*");
    for (const l of leistungen) zeilen.push(`• ${l}`);
  }

  // Aus Raummaßen berechnete Flächen: Das ist die eine Maß-Zeile, die sich
  // lohnt, weil sie gerechnet ist (VOB) und der Handwerker sie hier prüft.
  const aufmass = berechneAufmass(parseRaeumeText(daten.raeumeText));
  if (aufmass.raeume.length) {
    zeilen.push("*Flächen (VOB-gerecht gerechnet):*");
    for (const z of aufmassKurz(aufmass)) zeilen.push(`• ${z}`);
  }

  const preise = daten.positionen
    .filter((p) => p.einzelpreis != null)
    .map((p) => `${p.beschreibung.trim()}: ${euro(p.einzelpreis as number)}`);
  if (preise.length) zeilen.push(`*Preise:* ${preise.join(", ")}`);

  return zeilen.join("\n");
}

export function nachrichtenLesen(vorgang: Vorgang): GespeicherteNachricht[] {
  try {
    return JSON.parse(vorgang.nachrichtenJson) as GespeicherteNachricht[];
  } catch {
    return [];
  }
}

/** Nur die Gesprächsanteile, die die KI braucht. */
export function alsDialog(vorgang: Vorgang): DialogNachricht[] {
  return nachrichtenLesen(vorgang).map(({ rolle, text, zweitfassung }) => ({
    rolle,
    text,
    ...(zweitfassung ? { zweitfassung } : {}),
  }));
}

/**
 * Liefert den offenen Vorgang des Handwerkers — oder legt einen neuen an.
 *
 * Ein alter Vorgang, der lange still war, wird nicht wiederverwendet: eine
 * Sprachnachricht nach einer Stunde gehört zum nächsten Kunden, nicht zum
 * letzten. Der alte wird dabei stillschweigend geschlossen.
 */
export async function holeOffenenVorgang(
  prisma: PrismaClient,
  handwerkerId: string,
): Promise<Vorgang | null> {
  const offen = await prisma.vorgang.findFirst({
    where: { handwerkerId, status: "OFFEN" },
    orderBy: { letzteAktivitaet: "desc" },
  });
  if (!offen) return null;

  const stillSeitMinuten = (Date.now() - offen.letzteAktivitaet.getTime()) / 60000;
  if (stillSeitMinuten > NEUER_VORGANG_NACH_MINUTEN) {
    await prisma.vorgang.update({ where: { id: offen.id }, data: { status: "ABGESCHLOSSEN" } });
    return null;
  }
  return offen;
}

/**
 * Sucht einen gerade abgeschlossenen Vorgang, an den sich ein Nachtrag
 * anschließen kann — und öffnet ihn wieder.
 */
export async function holeNachtragsVorgang(
  prisma: PrismaClient,
  handwerkerId: string,
): Promise<Vorgang | null> {
  const grenze = new Date(Date.now() - NACHTRAG_MINUTEN * 60_000);
  const letzter = await prisma.vorgang.findFirst({
    where: {
      handwerkerId,
      status: "ABGESCHLOSSEN",
      dokumentId: { not: null },
      letzteAktivitaet: { gte: grenze },
    },
    orderBy: { letzteAktivitaet: "desc" },
  });
  if (!letzter) return null;

  return prisma.vorgang.update({
    where: { id: letzter.id },
    data: { status: "OFFEN", runde: 0, letzteAktivitaet: new Date() },
  });
}

export async function ergaenzeNachricht(
  prisma: PrismaClient,
  vorgang: Vorgang,
  nachricht: Omit<GespeicherteNachricht, "zeit">,
): Promise<Vorgang> {
  const bisher = nachrichtenLesen(vorgang);
  bisher.push({ ...nachricht, zeit: new Date().toISOString() });
  return prisma.vorgang.update({
    where: { id: vorgang.id },
    data: { nachrichtenJson: JSON.stringify(bisher), letzteAktivitaet: new Date() },
  });
}

/**
 * Ersatz-Rückfrage, falls die KI keine eigene Nachricht geliefert hat.
 * Im Regelfall formuliert die KI den Text selbst und passend zum Verlauf.
 */
export function rueckfragenText(fragen: string[]): string {
  const kopf =
    fragen.length === 1 ? "Eine Sache fehlt mir noch:" : `${fragen.length} Sachen fehlen mir noch:`;
  const liste = fragen.map((f, i) => `${i + 1}. ${f}`).join("\n");
  return `${kopf}\n${liste}\n\nAntworte einfach per Sprache oder Text.`;
}
