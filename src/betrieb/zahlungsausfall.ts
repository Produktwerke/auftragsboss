// Zahlungsausfall bei Stripe-Abos (Stripe Etappe 3, Teil 2; 15.09.2026).
//
// Ablauf: Stripe zieht die Monatsrechnung ein. Scheitert das (Karte abgelaufen,
// Konto nicht gedeckt), kommt invoice.payment_failed. Stripe wiederholt den
// Einzug selbst mehrfach über einige Tage („Smart Retries") und mailt dem
// Kunden, wenn das im Stripe-Dashboard eingeschaltet ist. Wir tun zusätzlich:
//   1. Abo als „Zahlung offen" markieren (Abo.zahlungOffenSeit, Fehlversuche,
//      Link zur offenen Rechnung) → Hinweis im Cockpit des Malers und auf
//      „Abo & Abrechnung", Warnsignal im Betreiber-Cockpit.
//   2. Den Maler per E-Mail bitten, die Zahlungsart im Kundenportal zu prüfen
//      (WhatsApp ginge nur über eine genehmigte Meta-Vorlage, später möglich).
//   3. Den Betreiber informieren (E-Mail + WhatsApp-Vorlage betreiber_alarm),
//      mit Entwarnung, sobald die Zahlung nachgeholt ist.
//   4. Gibt Stripe nach den Wiederholungen auf und beendet das Abo, greift der
//      bestehende Weg customer.subscription.deleted → GEKUENDIGT (mit Vermerk).
// Kein automatischer Zugriffsentzug: ob ein Betrieb gesperrt wird, entscheidet
// der Betreiber im Cockpit (Blockieren), nicht ein Automat.
import type { PrismaClient } from "@prisma/client";
import { sendeMail } from "../email/send.js";
import { zahlungsausfallMail } from "../email/templates.js";
import { smtpKonfiguriert } from "../config.js";
import { einstellungenTokenBereit } from "./betriebsdaten.js";
import { basisUrl } from "../web/tokens.js";
import { meldeStoerung, meldeEntwarnung } from "./betreiberAlarm.js";

export interface ZahlungsausfallInfo {
  /** Wievielter Fehlversuch dieser Rechnung (1 = erster). */
  versuch: number;
  /** Link zur gehosteten Stripe-Rechnung (dort kann der Kunde direkt zahlen), wenn vorhanden. */
  rechnungUrl: string | null;
  /** Rechnungsbetrag brutto in Euro, wenn bekannt. */
  bruttoEuro: number | null;
}

export interface ZahlungsHooks {
  fehlgeschlagen: (prisma: PrismaClient, betrieb: BetriebKurz, info: ZahlungsausfallInfo) => Promise<void>;
  nachgeholt: (prisma: PrismaClient, betrieb: BetriebKurz) => Promise<void>;
  aboBeendet: (prisma: PrismaClient, betrieb: BetriebKurz) => Promise<void>;
}

type BetriebKurz = { id: string; firma: string; name: string; email: string; einstellungenToken: string | null };

/** Link ins Kundenportal (Zahlungsart ändern), über die vertraute Cockpit-Tür des Betriebs. */
async function portalUrlFuer(prisma: PrismaClient, betrieb: BetriebKurz): Promise<string> {
  const token = await einstellungenTokenBereit(prisma, betrieb as never);
  return `${basisUrl()}/abo/verwalten/${token}`;
}

export const echteZahlungsHooks: ZahlungsHooks = {
  async fehlgeschlagen(prisma, betrieb, info) {
    const name = betrieb.firma || betrieb.name;
    // 1. Der Maler: E-Mail mit Portal-Link (nur wenn Adresse + SMTP da sind).
    if (betrieb.email && smtpKonfiguriert()) {
      try {
        const portal = await portalUrlFuer(prisma, betrieb);
        const mail = zahlungsausfallMail({ versuch: info.versuch, bruttoEuro: info.bruttoEuro, portalUrl: portal, rechnungUrl: info.rechnungUrl });
        await sendeMail(betrieb.email, mail.betreff, mail.html);
      } catch (err) {
        console.error("Zahlungsausfall-Mail an den Betrieb fehlgeschlagen:", err instanceof Error ? err.message : err);
      }
    }
    // 2. Der Betreiber: Alarm (höchstens einmal je Stunde und Betrieb).
    await meldeStoerung({
      schluessel: `zahlung:${betrieb.id}`,
      was: `Abo-Zahlung fehlgeschlagen bei ${name} (Versuch ${info.versuch})`,
      stand: "Stripe wiederholt den Einzug automatisch. Der Betrieb wurde per E-Mail gebeten, seine Zahlungsart im Kundenportal zu prüfen. Nichts zu tun, solange die Entwarnung kommt.",
      details: info.rechnungUrl ? `Offene Rechnung: ${info.rechnungUrl}` : undefined,
    });
  },

  async nachgeholt(_prisma, betrieb) {
    const name = betrieb.firma || betrieb.name;
    await meldeEntwarnung({
      schluessel: `zahlung:${betrieb.id}`,
      was: `Abo-Zahlung nachgeholt bei ${name}`,
      stand: "Die offene Rechnung ist bezahlt, das Abo läuft normal weiter.",
    });
  },

  async aboBeendet(_prisma, betrieb) {
    const name = betrieb.firma || betrieb.name;
    await meldeStoerung({
      schluessel: `abo-ende:${betrieb.id}`,
      was: `Abo bei ${name} nach Zahlungsausfall beendet`,
      stand: "Stripe hat das Abo nach den fehlgeschlagenen Wiederholungen gekündigt. Der Betrieb kann jederzeit neu buchen; ob er bis dahin gesperrt wird, entscheidest du im Cockpit.",
    });
  },
};
