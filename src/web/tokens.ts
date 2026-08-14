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
 * Kürzeres Token NUR für den Bearbeiten-Link (der in WhatsApp verschickt wird).
 * 12 Zeichen aus dem 31er-Alphabet ≈ 59 Bit — bewusst kürzer als die 26er-Token,
 * damit der Link elegant bleibt. Das ist vertretbar, weil der Editor zusätzlich
 * durch die Zugangs-Schleuse (Handynummer + Geräte-Cookie, Fehlversuch-Sperre)
 * geschützt ist; die Unratbarkeit des Tokens ist hier NICHT mehr die einzige
 * Sicherung. Die sensiblen Token (Einstellungen/Cockpit = „vertraute Tür" OHNE
 * Schleuse) bleiben bewusst 26 Zeichen.
 */
export function erzeugeKurzToken(): string {
  return erzeugeToken(12);
}

/**
 * Basis-URL für die Links in WhatsApp und E-Mail.
 * Lokal reicht http://localhost:3000; in Produktion die echte Domain
 * über BASE_URL in der .env setzen.
 */
export function basisUrl(): string {
  return (process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/+$/, "");
}

// Kurzer Wurzel-Link (neue Angebote). Die Route hört zusätzlich weiter auf
// /a/:token, damit ältere, schon verschickte Links gültig bleiben.
export const bearbeitenLink = (token: string): string => `${basisUrl()}/${token}`;
export const kundenLink = (token: string): string => `${basisUrl()}/k/${token}`;
export const einstellungenLink = (token: string): string => `${basisUrl()}/einstellungen/${token}`;
export const cockpitLink = (token: string): string => `${basisUrl()}/start/${token}`;
export const registrierLink = (token: string): string => `${basisUrl()}/registrieren/${token}`;
export const importLink = (token: string): string => `${basisUrl()}/import/${token}`;
export const aboLink = (token: string): string => `${basisUrl()}/abo/${token}`;
export const werbeLink = (code: string): string => `${basisUrl()}/einladung/${code}`;
