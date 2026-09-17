// Vertragsende (17.09.2026, Dirks Entscheidung zu den AGB-Fragen 1 und 3):
//
//   Tag 0        Abo endet (Stripe customer.subscription.deleted oder manuell im Cockpit)
//   Tag 0..30    voller Zugriff bleibt (Angebote machen, Editor, Cockpit)
//   Tag 30       PAUSE: Konto wird blockiert (Grund "ABO_ENDE …"), Angebote und Editor
//                bleiben lesbar, neue Nachrichten bekommen den Reaktivierungslink
//   Tag 83       VORWARNUNG per E-Mail: in 7 Tagen werden alle Daten gelöscht
//   Tag 90       LÖSCHUNG (frühestens 7 Tage nach der Vorwarnung), DSGVO-Kaskade
//
// Schließt der Betrieb vorher wieder ein Abo ab (Stripe-Checkout oder Betreiber-
// Cockpit), wird die Pause automatisch aufgehoben und die Uhr steht still.
import type { PrismaClient } from "@prisma/client";
import { spurEvent } from "../analytics/event.js";
import { sendeMail } from "../email/send.js";
import { smtpKonfiguriert } from "../config.js";
import { einstellungenTokenBereit } from "./betriebsdaten.js";
import { aboLink } from "../web/tokens.js";
import { loescheBetrieb } from "./loeschung.js";

export const PAUSE_NACH_TAGEN = 30;
export const VORWARNUNG_NACH_TAGEN = 83;
export const LOESCHUNG_NACH_TAGEN = 90;
export const VORWARNUNG_MINDESTABSTAND_TAGE = 7;
/** Präfix im Sperrgrund, an dem Pipeline und Cockpit die Vertragsende-Pause erkennen. */
export const ABO_ENDE_PRAEFIX = "ABO_ENDE:";

const TAG_MS = 86_400_000;
export const datumDE = (d: Date) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

export type VertragsendeAktion = "PAUSE" | "VORWARNUNG" | "LOESCHEN";

/** Welche Aktion ist heute fällig? Rein, testbar. */
export function vertragsendeAktion(
  h: { istTest: boolean; blockiert: boolean; blockiertGrund: string | null },
  abo: { status: string; gekuendigtAm: Date | null } | null,
  vorwarnungAm: Date | null,
  jetzt = new Date(),
): VertragsendeAktion | null {
  if (h.istTest || !abo || abo.status !== "GEKUENDIGT" || !abo.gekuendigtAm) return null;
  const tage = (jetzt.getTime() - abo.gekuendigtAm.getTime()) / TAG_MS;
  if (tage >= LOESCHUNG_NACH_TAGEN && vorwarnungAm && jetzt.getTime() - vorwarnungAm.getTime() >= VORWARNUNG_MINDESTABSTAND_TAGE * TAG_MS) return "LOESCHEN";
  if (tage >= VORWARNUNG_NACH_TAGEN && !vorwarnungAm) return "VORWARNUNG";
  // Pause nur, wenn nicht schon (aus welchem Grund auch immer) blockiert.
  if (tage >= PAUSE_NACH_TAGEN && !h.blockiert) return "PAUSE";
  return null;
}

export function istAboEndePause(blockiertGrund: string | null | undefined): boolean {
  return (blockiertGrund ?? "").startsWith(ABO_ENDE_PRAEFIX);
}

export function loeschDatum(gekuendigtAm: Date): Date {
  return new Date(gekuendigtAm.getTime() + LOESCHUNG_NACH_TAGEN * TAG_MS);
}

/** Pause nach Reaktivierung (neues Abo) wieder aufheben. Gibt zurück, ob etwas zu tun war. */
export async function hebeAboEndePauseAuf(prisma: PrismaClient, h: { id: string; firma: string; name: string; blockiert: boolean; blockiertGrund: string | null }): Promise<boolean> {
  if (!h.blockiert || !istAboEndePause(h.blockiertGrund)) return false;
  await prisma.handwerker.update({ where: { id: h.id }, data: { blockiert: false, blockiertGrund: null, blockiertAm: null } });
  await prisma.adminLog.create({
    data: { aktion: "ABO_REAKTIVIERT", handwerkerId: h.id, betrieb: h.firma || h.name, detail: "Neues Abo, Vertragsende-Pause aufgehoben" },
  });
  await spurEvent(prisma, "VERTRAGSENDE_REAKTIVIERT", { handwerkerId: h.id });
  return true;
}

export interface VertragsendeErgebnis {
  geprueft: number;
  pausiert: number;
  vorgewarnt: number;
  geloescht: number;
}

/** Täglicher Durchlauf über alle beendeten Abos. `mail` und `jetzt` sind injizierbar. */
export async function verarbeiteVertragsenden(
  prisma: PrismaClient,
  mail: typeof sendeMail | null = smtpKonfiguriert() ? sendeMail : null,
  jetzt = new Date(),
): Promise<VertragsendeErgebnis> {
  const ergebnis: VertragsendeErgebnis = { geprueft: 0, pausiert: 0, vorgewarnt: 0, geloescht: 0 };
  const abos = await prisma.abo.findMany({ where: { status: "GEKUENDIGT", gekuendigtAm: { not: null } }, include: { handwerker: true } });

  for (const abo of abos) {
    const h = abo.handwerker;
    ergebnis.geprueft++;
    const vorwarnung = await prisma.event.findFirst({
      where: { handwerkerId: h.id, typ: "VERTRAGSENDE_VORWARNUNG", erstelltAm: { gte: abo.gekuendigtAm! } },
      orderBy: { erstelltAm: "desc" },
    });
    const aktion = vertragsendeAktion(h, abo, vorwarnung?.erstelltAm ?? null, jetzt);
    if (!aktion) continue;
    const betrieb = h.firma || h.name || `+${h.whatsappNummer}`;
    const loeschung = datumDE(loeschDatum(abo.gekuendigtAm!));

    if (aktion === "PAUSE") {
      await prisma.handwerker.update({
        where: { id: h.id },
        data: { blockiert: true, blockiertAm: jetzt, blockiertGrund: `${ABO_ENDE_PRAEFIX} Abo beendet am ${datumDE(abo.gekuendigtAm!)}, Löschung am ${loeschung}` },
      });
      await prisma.adminLog.create({ data: { aktion: "ABO_PAUSE", handwerkerId: h.id, betrieb, detail: `${PAUSE_NACH_TAGEN} Tage nach Vertragsende pausiert, Löschung am ${loeschung}` } });
      await spurEvent(prisma, "VERTRAGSENDE_PAUSE", { handwerkerId: h.id });
      if (mail && h.email) {
        const token = await einstellungenTokenBereit(prisma, h);
        await mail(
          h.email,
          "Dein AuftragsBoss-Zugang ist pausiert",
          `<p>Hallo ${h.name || h.firma},</p><p>dein AuftragsBoss-Abo ist am ${datumDE(abo.gekuendigtAm!)} zu Ende gegangen. Dein Zugang ist deshalb pausiert: Deine Angebote und Einstellungen bleiben noch bis zum <b>${loeschung}</b> gespeichert, neue Angebote sind so lange nicht möglich.</p><p>Wenn du weitermachen willst, wähle einfach wieder einen Tarif, dann geht es sofort weiter, alles bleibt erhalten:<br><a href="${aboLink(token)}">${aboLink(token)}</a></p><p>Deine Daten kannst du jederzeit im Cockpit als ZIP herunterladen.</p><p>Viele Grüße<br>dein AuftragsBoss-Team</p>`,
        ).catch((err) => console.warn("Vertragsende-Mail (Pause) fehlgeschlagen:", err instanceof Error ? err.message : err));
      }
      ergebnis.pausiert++;
    } else if (aktion === "VORWARNUNG") {
      await spurEvent(prisma, "VERTRAGSENDE_VORWARNUNG", { handwerkerId: h.id, data: { mail: !!(mail && h.email) } });
      await prisma.adminLog.create({ data: { aktion: "LOESCHUNG_ANGEKUENDIGT", handwerkerId: h.id, betrieb, detail: `Löschung am ${loeschung} angekündigt${mail && h.email ? " (E-Mail)" : " (keine E-Mail hinterlegt)"}` } });
      if (mail && h.email) {
        const token = await einstellungenTokenBereit(prisma, h);
        await mail(
          h.email,
          `Deine AuftragsBoss-Daten werden am ${loeschung} gelöscht`,
          `<p>Hallo ${h.name || h.firma},</p><p>dein AuftragsBoss-Abo ist seit dem ${datumDE(abo.gekuendigtAm!)} beendet. Wie in unseren Bedingungen beschrieben, löschen wir deine Angebote, Protokolle, Kundendaten und Einstellungen <b>am ${loeschung}</b> endgültig.</p><p>Wenn du das nicht willst, hast du zwei Möglichkeiten:</p><ul><li>Wieder einen Tarif wählen, dann bleibt alles erhalten: <a href="${aboLink(token)}">${aboLink(token)}</a></li><li>Deine Daten vorher als ZIP herunterladen (JSON, CSV, PDFs, Fotos): im Cockpit über „Meine Daten (ZIP)".</li></ul><p>Viele Grüße<br>dein AuftragsBoss-Team</p>`,
        ).catch((err) => console.warn("Vertragsende-Mail (Vorwarnung) fehlgeschlagen:", err instanceof Error ? err.message : err));
      }
      ergebnis.vorgewarnt++;
    } else if (aktion === "LOESCHEN") {
      await loescheBetrieb(prisma, h, `${LOESCHUNG_NACH_TAGEN} Tage nach Vertragsende, Vorwarnung am ${datumDE(vorwarnung!.erstelltAm)}`);
      await spurEvent(prisma, "VERTRAGSENDE_GELOESCHT", { data: { tageNachEnde: LOESCHUNG_NACH_TAGEN } });
      ergebnis.geloescht++;
    }
  }
  return ergebnis;
}
