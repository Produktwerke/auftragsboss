// Verwaltung des laufenden WhatsApp-Dialogs.
//
// Grundgedanke: Der Handwerker sitzt im Auto. Rückfragen dürfen deshalb
// hilfreich sein, aber niemals lästig — harte Obergrenze bei den Runden,
// jederzeit ein Ausweg per Stichwort, und automatischer Abschluss, wenn
// er das Handy einfach weglegt.
import type { PrismaClient, Vorgang } from "@prisma/client";
import type { DialogNachricht, DokumentDaten } from "./ai/structure.js";
import { euro } from "./angebot/berechnung.js";

/** Höchstens so viele Rückfrage-Runden, dann wird abgeschlossen. */
export const MAX_RUNDEN = 2;

/** Nach so langer Funkstille gilt ein Vorgang als beendet und wird fertiggestellt. */
export const TIMEOUT_MINUTEN = 20;

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
  art: "sprache" | "text";
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
