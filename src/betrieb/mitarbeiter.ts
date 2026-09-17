// Mitarbeiter-Nummern je Betrieb (17.09.2026, AGB-Fragen 16 und 17).
//
// Ein Betrieb hat eine Inhaber-Nummer (Handwerker.whatsappNummer) und je nach
// Tarif weitere Nummern (Mitarbeiter). Jede Mitarbeiter-Nummer ist eindeutig
// im System, gehört genau einem Betrieb und schreibt AuftragsBoss wie der
// Inhaber: Angebote landen beim Betrieb, Antworten gehen an die Nummer, die
// gerade schreibt. Jede Nummer hat ihren eigenen Vorgang (zwei Mitarbeiter
// können parallel diktieren, ohne sich zu vermischen).
//
// Grenzen laut Preisseite: Basis 1 Nummer, Profi bis zu 3, Team bis zu 15
// (jeweils inklusive Inhaber). Test-Konten: nur die eigene Nummer.
import type { PrismaClient, Handwerker, Mitarbeiter } from "@prisma/client";
import { normalisiereHandy } from "../config.js";

/** Zusätzliche Nummern je Tarif (ohne den Inhaber). */
export const MITARBEITER_JE_TARIF: Record<string, number> = {
  BASIS: 0,
  PROFI: 2,
  TEAM: 14,
  INDIVIDUELL: 14,
};

export function erlaubteMitarbeiter(abo: { tarif: string; status: string } | null, istTest: boolean): number {
  if (istTest || !abo || abo.status !== "AKTIV") return 0;
  return MITARBEITER_JE_TARIF[abo.tarif] ?? 0;
}

export function tarifLabelFuerNummern(abo: { tarif: string; status: string } | null, istTest: boolean): string {
  const n = erlaubteMitarbeiter(abo, istTest);
  if (istTest) return "Im kostenlosen Test gilt nur deine eigene Nummer.";
  if (!abo || abo.status !== "AKTIV") return "Mitarbeiter-Nummern gibt es mit einem aktiven Abo (Profi: bis zu 3 Nummern, Team: bis zu 15).";
  if (n === 0) return "Im Tarif Basis gilt eine Nummer. Mit Profi kannst du bis zu 3 Nummern nutzen, mit Team bis zu 15.";
  return `Dein Tarif ${abo.tarif.charAt(0) + abo.tarif.slice(1).toLowerCase()} erlaubt neben deiner Nummer bis zu ${n} weitere.`;
}

/** Betrieb zu einer Absendernummer: Inhaber oder Mitarbeiter. */
export async function findeBetriebZuNummer(
  prisma: PrismaClient,
  nummer: string,
): Promise<{ handwerker: Handwerker; mitarbeiter: Mitarbeiter | null } | null> {
  const inhaber = await prisma.handwerker.findUnique({ where: { whatsappNummer: nummer } });
  if (inhaber) return { handwerker: inhaber, mitarbeiter: null };
  const m = await prisma.mitarbeiter.findUnique({ where: { whatsappNummer: nummer }, include: { handwerker: true } });
  if (!m) return null;
  return { handwerker: m.handwerker, mitarbeiter: m };
}

export type MitarbeiterErgebnis = { ok: true; mitarbeiter: Mitarbeiter } | { ok: false; fehler: string };

export async function fuegeMitarbeiterHinzu(
  prisma: PrismaClient,
  handwerker: Handwerker,
  abo: { tarif: string; status: string } | null,
  eingabe: { name: string; nummer: string },
): Promise<MitarbeiterErgebnis> {
  const name = eingabe.name.trim().slice(0, 60);
  const nummer = normalisiereHandy(eingabe.nummer);
  if (name.length < 2) return { ok: false, fehler: "Bitte einen Namen angeben." };
  if (!nummer) return { ok: false, fehler: "Bitte eine gültige Handynummer angeben, zum Beispiel 0176 1234567." };
  if (nummer === handwerker.whatsappNummer) return { ok: false, fehler: "Das ist deine eigene Nummer." };

  const erlaubt = erlaubteMitarbeiter(abo, handwerker.istTest);
  const vorhanden = await prisma.mitarbeiter.count({ where: { handwerkerId: handwerker.id } });
  if (vorhanden >= erlaubt) {
    return { ok: false, fehler: erlaubt === 0 ? tarifLabelFuerNummern(abo, handwerker.istTest) : `Dein Tarif erlaubt ${erlaubt} weitere Nummer${erlaubt === 1 ? "" : "n"}. Entferne erst eine, um eine neue hinzuzufügen.` };
  }

  const andererBetrieb = await prisma.handwerker.findUnique({ where: { whatsappNummer: nummer }, select: { id: true } });
  if (andererBetrieb) return { ok: false, fehler: "Diese Nummer ist schon als eigenes Konto bei AuftragsBoss angemeldet." };
  const andererMitarbeiter = await prisma.mitarbeiter.findUnique({ where: { whatsappNummer: nummer }, select: { handwerkerId: true } });
  if (andererMitarbeiter) {
    return { ok: false, fehler: andererMitarbeiter.handwerkerId === handwerker.id ? "Diese Nummer ist schon eingetragen." : "Diese Nummer ist schon bei einem anderen Betrieb eingetragen." };
  }

  const mitarbeiter = await prisma.mitarbeiter.create({ data: { handwerkerId: handwerker.id, whatsappNummer: nummer, name } });
  await prisma.adminLog.create({
    data: { aktion: "MITARBEITER_HINZU", handwerkerId: handwerker.id, betrieb: handwerker.firma || handwerker.name, detail: `Mitarbeiter-Nummer hinzugefügt: ${name}` },
  });
  return { ok: true, mitarbeiter };
}

export async function entferneMitarbeiter(prisma: PrismaClient, handwerker: Handwerker, mitarbeiterId: string): Promise<boolean> {
  const m = await prisma.mitarbeiter.findFirst({ where: { id: mitarbeiterId, handwerkerId: handwerker.id } });
  if (!m) return false;
  await prisma.mitarbeiter.delete({ where: { id: m.id } });
  await prisma.adminLog.create({
    data: { aktion: "MITARBEITER_ENTFERNT", handwerkerId: handwerker.id, betrieb: handwerker.firma || handwerker.name, detail: `Mitarbeiter-Nummer entfernt: ${m.name}` },
  });
  return true;
}

/**
 * Where-Bedingung für Vorgänge des Absenders: Mitarbeiter sehen nur eigene Vorgänge,
 * der Inhaber seine eigenen plus Altbestand ohne Absender.
 */
export function absenderWhere(nummer: string, istInhaber: boolean): Record<string, unknown> {
  return istInhaber ? { OR: [{ absenderNummer: null }, { absenderNummer: nummer }] } : { absenderNummer: nummer };
}

/** Nummern, die die Zugangs-Schleuse eines Betriebs passieren dürfen (Inhaber + Mitarbeiter). */
export async function erlaubteNummern(prisma: PrismaClient, handwerkerId: string, inhaberNummer: string): Promise<string[]> {
  const m = await prisma.mitarbeiter.findMany({ where: { handwerkerId }, select: { whatsappNummer: true } });
  return [inhaberNummer, ...m.map((x) => x.whatsappNummer)];
}
