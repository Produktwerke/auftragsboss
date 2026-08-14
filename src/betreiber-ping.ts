// Testet die Betreiber-Benachrichtigung: schickt die "neuer Kunde"-Vorlage
// per WhatsApp an BETREIBER_HANDY (aus der .env).
//
// Aufruf (auf dem Server, wo die WhatsApp-Zugangsdaten liegen):
//   cd /root/app && npx tsx src/betreiber-ping.ts
//   cd /root/app && npx tsx src/betreiber-ping.ts "Musterfirma GmbH" Profi 99
//
// Voraussetzungen: BETREIBER_HANDY in der .env UND die Vorlage "neuer_kunde"
// ist bei Meta angelegt und genehmigt (WhatsApp Manager → Nachrichtenvorlagen).
import { betreiberConfig } from "./config.js";
import { meldeNeuenKunden } from "./betrieb/betreiberAlarm.js";

const firma = process.argv[2] ?? "Musterfirma GmbH";
const tarif = process.argv[3] ?? "Basis";
const preis = Number(process.argv[4] ?? "49");

const cfg = betreiberConfig();
if (!cfg.BETREIBER_HANDY) {
  console.error(
    "BETREIBER_HANDY fehlt in der .env — bitte eintragen (z. B. BETREIBER_HANDY=4917662492471).",
  );
  process.exit(1);
}

console.log(`Sende Test-Meldung an ${cfg.BETREIBER_HANDY} (Vorlage "${cfg.BETREIBER_VORLAGE_NEUER_KUNDE}") …`);
const ok = await meldeNeuenKunden(firma, tarif, preis);
if (ok) {
  console.log("✅ Versand angenommen — die WhatsApp sollte gleich ankommen.");
} else {
  console.error(
    "❌ Versand fehlgeschlagen — Details stehen in der Fehlerzeile darüber. Häufigste Gründe: Vorlage noch nicht genehmigt, Vorlagenname/Sprache passt nicht (muss Deutsch/de sein).",
  );
  process.exit(1);
}
