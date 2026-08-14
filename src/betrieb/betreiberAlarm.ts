// Benachrichtigt den BETREIBER (Dirk) per WhatsApp über wichtige Ereignisse.
//
// Erste Anwendung: "🎉 neuer Kunde hat ein Abo gebucht" — ausgelöst wird das
// erst mit der Stripe-Anbindung (Webhook → Buchung → diese Meldung). Bis dahin
// lässt sich der Weg mit `npx tsx src/betreiber-ping.ts` durchtesten.
//
// Aus, solange BETREIBER_HANDY nicht in der .env steht. Die Nachricht läuft
// als Meta-VORLAGE (Template "neuer_kunde"), weil freier Text nur innerhalb
// des 24-Stunden-Fensters zugestellt würde — eine genehmigte Vorlage geht
// jederzeit.
import { betreiberConfig } from "../config.js";
import { sendeWhatsAppVorlage } from "../whatsapp/send.js";

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
