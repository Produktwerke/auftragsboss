// Erzeugt den Passwort-Hash für den /stasi-Login (Betreiber-Cockpit).
//
// Aufruf (lokal, das Passwort landet NIRGENDS außer in deinem Terminal):
//   npx tsx src/stasi-passwort.ts "MeinSicheresPasswort"
//
// Die beiden ausgegebenen Zeilen kommen in die Server-.env; das Passwort
// selbst gehört in 1Password.
import { passwortHashErzeugen } from "./web/adminAuth.js";

const passwort = process.argv[2];
if (!passwort || passwort.length < 8) {
  console.error('Bitte ein Passwort mit mindestens 8 Zeichen angeben:\n  npx tsx src/stasi-passwort.ts "MeinPasswort"');
  process.exit(1);
}

console.log("In die Server-.env eintragen (E-Mail-Adresse anpassen):\n");
console.log("ADMIN_EMAIL=du@deine-mail.de");
console.log(`ADMIN_PASSWORT_HASH=${passwortHashErzeugen(passwort)}`);
