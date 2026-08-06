// Zufallstoken für die Links — der Ersatz für ein Login.
//
// Wer den Link hat, darf das Dokument sehen. Das ist bewusst so: Der
// Handwerker soll nichts eintippen müssen, der Kunde erst recht nicht.
// Sicherheit kommt daher aus der Unratbarkeit des Tokens, nicht aus einem
// Passwort — deshalb 128 Bit Entropie und keine kürzeren Codes.
import { randomBytes } from "node:crypto";

/** Zeichenvorrat ohne verwechselbare Zeichen (0/O, 1/l/I). */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function erzeugeToken(laenge = 26): string {
  const bytes = randomBytes(laenge);
  let token = "";
  for (let i = 0; i < laenge; i++) {
    token += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return token;
}

/**
 * Basis-URL für die Links in WhatsApp und E-Mail.
 * Lokal reicht http://localhost:3000; in Produktion die echte Domain
 * über BASE_URL in der .env setzen.
 */
export function basisUrl(): string {
  return (process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/+$/, "");
}

export const bearbeitenLink = (token: string): string => `${basisUrl()}/a/${token}`;
export const kundenLink = (token: string): string => `${basisUrl()}/k/${token}`;
export const einstellungenLink = (token: string): string => `${basisUrl()}/einstellungen/${token}`;
export const cockpitLink = (token: string): string => `${basisUrl()}/start/${token}`;
export const importLink = (token: string): string => `${basisUrl()}/import/${token}`;
export const werbeLink = (code: string): string => `${basisUrl()}/einladung/${code}`;
