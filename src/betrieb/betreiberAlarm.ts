// Benachrichtigt den BETREIBER (Dirk) über wichtige Ereignisse.
//
// 1. "🎉 neuer Kunde hat ein Abo gebucht" (Stripe-Webhook → Buchung → Meldung).
// 2. Störungen der Angebots-Auswertung (13.09.2026): Alarm je Fehlversuch und
//    Entwarnung nach dem Erfolg, jeweils per E-Mail (ADMIN_EMAIL über das
//    SMTP-Konto der App) UND per WhatsApp-Vorlage `betreiber_alarm`. Die Mail
//    geht immer, die WhatsApp nur, wenn BETREIBER_HANDY gesetzt und die Vorlage
//    bei Meta genehmigt ist (sonst nur ein Logeintrag). Je Störungsschlüssel
//    höchstens ein Alarm pro Stunde, damit das Handy bei einer Dauerstörung
//    nicht dauerklingelt.
//
// WhatsApp läuft als Meta-VORLAGE, weil freier Text nur innerhalb des
// 24-Stunden-Fensters zugestellt würde — eine genehmigte Vorlage geht jederzeit.
import { betreiberConfig, smtpKonfiguriert } from "../config.js";
import { sendeWhatsAppVorlage } from "../whatsapp/send.js";
import { sendeMail } from "../email/send.js";

/** Platzhalter-Werte für die Vorlage — pur, damit sie sich testen lassen.
 *  {{1}} = Firma, {{2}} = Abo-Beschreibung mit Preis. */
export function neuerKundeParameter(
  firma: string,
  tarif: string,
  monatspreisEuro: number,
): string[] {
  const preis = monatspreisEuro.toLocaleString("de-DE", { maximumFractionDigits: 2 });
  return [firma.trim() || "Ein Betrieb", `${tarif} (${preis} € im Monat)`];
}

/**
 * "Neuer Kunde"-WhatsApp an den Betreiber senden. Gibt zurück, ob der Versand
 * angenommen wurde; false auch, wenn die Funktion aus ist (kein BETREIBER_HANDY).
 * Fehler brechen nie den Aufrufer ab — die Buchung selbst ist das Wichtige.
 */
export async function meldeNeuenKunden(
  firma: string,
  tarif: string,
  monatspreisEuro: number,
): Promise<boolean> {
  const cfg = betreiberConfig();
  if (!cfg.BETREIBER_HANDY) return false;
  try {
    return await sendeWhatsAppVorlage(
      cfg.BETREIBER_HANDY,
      cfg.BETREIBER_VORLAGE_NEUER_KUNDE,
      neuerKundeParameter(firma, tarif, monatspreisEuro),
    );
  } catch (err) {
    console.error("Betreiber-Benachrichtigung fehlgeschlagen:", err);
    return false;
  }
}

// ── Störungsalarm ─────────────────────────────────────────────────────

export interface Stoerung {
  /** Gleicher Schlüssel = gleiche Störung (Ratenbegrenzung), z.B. "auswertung:<vorgangId>". */
  schluessel: string;
  /** Was passiert ist, eine Zeile, z.B. "Angebot konnte nicht erstellt werden (Mustermann Malerbetrieb)". */
  was: string;
  /** Aktueller Stand, eine Zeile, z.B. "Versuch 2 von 6 gescheitert, nächster in 10 Minuten." */
  stand: string;
  /** Technische Einzelheiten (nur E-Mail), z.B. die Fehlermeldung. */
  details?: string;
  /** Vorgeschlagener Satz für den Kunden (nur E-Mail). */
  kundenSatz?: string;
}

/** Höchstens ein Alarm je Schlüssel in diesem Abstand. */
export const ALARM_ABSTAND_MS = 60 * 60_000;
/** Vorlagen-Platzhalter: keine Zeilenumbrüche, nicht zu lang. */
const PARAMETER_MAX = 300;

const zuletztGemeldet = new Map<string, number>();
const alarmOffen = new Set<string>();

/** Nur für Tests. */
export function alarmZuruecksetzen(): void {
  zuletztGemeldet.clear();
  alarmOffen.clear();
}

/** Darf für diesen Schlüssel jetzt ein Alarm raus? Merkt sich den Zeitpunkt. */
export function darfMelden(schluessel: string, jetzt = Date.now()): boolean {
  const vorher = zuletztGemeldet.get(schluessel);
  if (vorher !== undefined && jetzt - vorher < ALARM_ABSTAND_MS) return false;
  zuletztGemeldet.set(schluessel, jetzt);
  return true;
}

/** Platzhalter für die Vorlage `betreiber_alarm`: {{1}} = was, {{2}} = Stand. */
export function alarmParameter(was: string, stand: string): string[] {
  const glatt = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, PARAMETER_MAX) || "-";
  return [glatt(was), glatt(stand)];
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** E-Mail-Text (HTML) für Alarm bzw. Entwarnung. */
export function alarmMailHtml(s: Stoerung, entwarnung: boolean): string {
  const teile = [
    `<p style="font-size:16px"><b>${entwarnung ? "✅ Entwarnung" : "⚠️ Störung"}: ${esc(s.was)}</b></p>`,
    `<p><b>Stand:</b> ${esc(s.stand)}</p>`,
  ];
  if (s.details) teile.push(`<p><b>Einzelheiten:</b><br><code style="white-space:pre-wrap">${esc(s.details)}</code></p>`);
  if (!entwarnung) {
    teile.push(
      `<p><b>Was du tun kannst:</b> Nichts, solange die Entwarnung kommt. AuftragsBoss versucht es automatisch weiter. ` +
        `Bleibt die Entwarnung aus, prüfe am Rechner: <code>su - auftragsboss -c 'pm2 logs auftragsboss --err --lines 50'</code>.</p>`,
    );
    if (s.kundenSatz) {
      teile.push(`<p><b>Satz für den Kunden</b> (falls du ihm von unterwegs schreiben willst):</p><blockquote>${esc(s.kundenSatz)}</blockquote>`);
    }
  }
  teile.push(`<p style="color:#888;font-size:12px">Schlüssel: ${esc(s.schluessel)} · ${new Date().toLocaleString("de-DE")}</p>`);
  return teile.join("\n");
}

async function anBetreiber(s: Stoerung, entwarnung: boolean): Promise<void> {
  const betreff = `${entwarnung ? "Entwarnung" : "ALARM"} AuftragsBoss: ${s.was}`.slice(0, 200);
  const adminMail = process.env.ADMIN_EMAIL?.trim();
  if (adminMail && smtpKonfiguriert()) {
    try {
      await sendeMail(adminMail, betreff, alarmMailHtml(s, entwarnung));
    } catch (err) {
      console.error("Betreiber-Alarm-Mail fehlgeschlagen:", err instanceof Error ? err.message : err);
    }
  } else {
    console.warn(`Betreiber-Alarm nur im Log (ADMIN_EMAIL/SMTP fehlt): ${betreff}`);
  }
  const cfg = betreiberConfig();
  if (cfg.BETREIBER_HANDY) {
    try {
      const was = entwarnung ? `Entwarnung: ${s.was}` : s.was;
      const ok = await sendeWhatsAppVorlage(cfg.BETREIBER_HANDY, cfg.BETREIBER_VORLAGE_ALARM, alarmParameter(was, s.stand));
      if (!ok) console.warn("Betreiber-Alarm-WhatsApp nicht angenommen (Vorlage genehmigt?).");
    } catch (err) {
      console.error("Betreiber-Alarm-WhatsApp fehlgeschlagen:", err instanceof Error ? err.message : err);
    }
  }
}

/** Störung melden (E-Mail + WhatsApp), höchstens einmal je Stunde und Schlüssel. Wirft nie. */
export async function meldeStoerung(s: Stoerung): Promise<void> {
  alarmOffen.add(s.schluessel);
  if (!darfMelden(s.schluessel)) return;
  console.error(`🚨 Betreiber-Alarm: ${s.was} | ${s.stand}`);
  await anBetreiber(s, false);
}

/** Entwarnung nur, wenn zu diesem Schlüssel vorher ein Alarm ausgelöst wurde. Wirft nie. */
export async function meldeEntwarnung(s: Stoerung): Promise<void> {
  if (!alarmOffen.has(s.schluessel)) return;
  alarmOffen.delete(s.schluessel);
  zuletztGemeldet.delete(s.schluessel);
  console.log(`✅ Betreiber-Entwarnung: ${s.was}`);
  await anBetreiber(s, true);
}
