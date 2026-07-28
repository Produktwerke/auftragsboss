// Empfehlungsprogramm ("Freundschaftswerbung").
//
// Jeder Betrieb hat einen kurzen, persönlichen Einladungscode. Teilt er den
// Link, kann ein Kollege sich als Lead eintragen — beide bekommen 1 Monat
// gratis (wird beim Freischalten durch das Team gutgeschrieben).
import type { Handwerker, PrismaClient } from "@prisma/client";
import { erzeugeToken } from "./web/tokens.js";

/** Nach so vielen erstellten Angeboten wird zum Einladen aufgefordert. */
export const EMPFEHLUNG_AB_ANGEBOT = 3;

/** Liefert den Einladungscode des Betriebs — erzeugt ihn beim ersten Bedarf. */
export async function werbeCodeBereit(prisma: PrismaClient, handwerker: Handwerker): Promise<string> {
  if (handwerker.werbeCode) return handwerker.werbeCode;
  const code = erzeugeToken(8);
  await prisma.handwerker.update({ where: { id: handwerker.id }, data: { werbeCode: code } });
  return code;
}
