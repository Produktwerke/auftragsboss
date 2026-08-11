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

/** Vorgefertigter Text zum Selbst-Teilen (WhatsApp/E-Mail), inkl. Link. */
export function empfehlungsText(werberFirma: string, werbeUrl: string): string {
  return (
    `Hi, ich nutze AuftragsBoss, damit sprichst du dein Angebot einfach per WhatsApp ` +
    `ein und bekommst ein fertiges Angebot als PDF/Word. Spart mir richtig Zeit. ` +
    `Wenn du dich über meinen Link anmeldest, bekommen wir beide 1 Monat gratis: ${werbeUrl}`
  );
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Baut die einmalige Empfehlungs-E-Mail an einen Kollegen. Bewusst als klar
 * gekennzeichnete PERSÖNLICHE Empfehlung formuliert (kein Marketing, kein
 * Nachfassen) — so bleibt die Einladung sauber.
 */
export function empfehlungsEinladungMail(
  werberFirma: string,
  empfaengerName: string,
  werbeUrl: string,
): { betreff: string; html: string } {
  const firma = esc(werberFirma);
  const name = esc(empfaengerName);
  const url = esc(werbeUrl);
  const betreff = `${werberFirma} empfiehlt dir AuftragsBoss`;
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;line-height:1.55;max-width:560px;margin:0 auto;padding:8px;">
  <p>Hallo ${name},</p>
  <p><strong>${firma}</strong> nutzt <strong>AuftragsBoss</strong> und empfiehlt es dir persönlich.</p>
  <p>Die Idee: Du sprichst nach dem Kundentermin dein Angebot einfach per WhatsApp-Sprachnachricht ein, AuftragsBoss macht daraus ein fertiges Angebot als PDF oder Word. Keine App, kein Login.</p>
  <p>Wenn du dich über den Link von ${firma} anmeldest, bekommt <em>ihr beide 1 Monat gratis</em>:</p>
  <p style="margin:22px 0;">
    <a href="${url}" style="background:#0B5CAD;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block;">Einladung ansehen</a>
  </p>
  <p style="font-size:12px;color:#888;">Du bekommst diese E-Mail, weil ${firma} dich persönlich empfohlen hat. Es folgt keine weitere Nachricht von uns.</p>
  </body></html>`;
  return { betreff, html };
}
