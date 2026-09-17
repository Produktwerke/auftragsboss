// Monatskontingent zahlender Betriebe (17.09.2026, Dirk: „harte Grenze").
//
// Preisseite: Basis 50, Profi 120, Team 300 Angebote im Monat. Gezählt werden
// Erstfassungen (Dokument.version === 1) im laufenden Kalendermonat; Nachträge
// und Korrekturfassungen zählen nicht. Ist das Kontingent erreicht, nimmt
// AuftragsBoss KEINEN neuen Auftrag an, Nachträge zu bestehenden Angeboten
// laufen weiter. Test-Konten haben ihre eigene Grenze (direkttest.ts).
import type { PrismaClient } from "@prisma/client";

export const KONTINGENT_JE_TARIF: Record<string, number> = {
  BASIS: 50,
  PROFI: 120,
  TEAM: 300,
  INDIVIDUELL: 300,
};

/** Kontingent des Betriebs (Abo-Tarif; ohne Abo wie Basis; gekündigt = letzter Tarif). */
export function kontingentFuer(abo: { tarif: string } | null): number {
  return KONTINGENT_JE_TARIF[abo?.tarif ?? "BASIS"] ?? KONTINGENT_JE_TARIF.BASIS!;
}

export function monatsStart(jetzt = new Date()): Date {
  return new Date(jetzt.getFullYear(), jetzt.getMonth(), 1);
}

export function naechsterMonatsStart(jetzt = new Date()): Date {
  return new Date(jetzt.getFullYear(), jetzt.getMonth() + 1, 1);
}

export interface KontingentStand {
  limit: number;
  genutzt: number;
  frei: number;
  erschoepft: boolean;
  tarif: string;
}

export function kontingentStand(abo: { tarif: string } | null, genutzt: number): KontingentStand {
  const limit = kontingentFuer(abo);
  return { limit, genutzt, frei: Math.max(0, limit - genutzt), erschoepft: genutzt >= limit, tarif: abo?.tarif ?? "BASIS" };
}

/** Erstfassungen dieses Betriebs im laufenden Monat. */
export async function genutzteAngebote(prisma: PrismaClient, handwerkerId: string, jetzt = new Date()): Promise<number> {
  return prisma.dokument.count({ where: { handwerkerId, version: 1, erstelltAm: { gte: monatsStart(jetzt) } } });
}

export async function ladeKontingent(prisma: PrismaClient, handwerkerId: string, jetzt = new Date()): Promise<KontingentStand> {
  const [abo, genutzt] = await Promise.all([
    prisma.abo.findUnique({ where: { handwerkerId }, select: { tarif: true } }),
    genutzteAngebote(prisma, handwerkerId, jetzt),
  ]);
  return kontingentStand(abo, genutzt);
}

const tarifName = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

/** WhatsApp-Text, wenn das Kontingent erreicht ist. */
export function kontingentErschoepftText(stand: KontingentStand, aboUrl: string, jetzt = new Date()): string {
  const ab = naechsterMonatsStart(jetzt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const naechster = stand.tarif === "BASIS" ? "Profi (120 Angebote) oder Team (300 Angebote)" : stand.tarif === "PROFI" ? "Team (300 Angebote)" : null;
  return (
    `⛔ Dein Monatskontingent ist erreicht: ${stand.genutzt} von ${stand.limit} Angeboten im Tarif ${tarifName(stand.tarif)}.\n\n` +
    `Nachträge und Korrekturen zu bestehenden Angeboten gehen weiter. Neue Angebote wieder ab ${ab}` +
    (naechster ? `, oder sofort mit Tarif ${naechster}:\n${aboUrl}` : ".")
  );
}

/** Kurzer Hinweis unter der Fertigmeldung, wenn es knapp wird (letzte 5). */
export function kontingentHinweisText(stand: KontingentStand): string | null {
  if (stand.frei > 5 || stand.erschoepft) return null;
  return `ℹ️ Noch ${stand.frei} Angebot${stand.frei === 1 ? "" : "e"} in deinem Monatskontingent (${stand.genutzt} von ${stand.limit}, Tarif ${tarifName(stand.tarif)}).`;
}
