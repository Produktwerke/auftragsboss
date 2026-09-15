// Testphase-Erinnerungen SOFORT prüfen (sonst täglich 09:00, siehe jobs/testphaseErinnerung.ts).
//
// Aufruf (auf dem Server als auftragsboss):
//   cd ~/app && npx tsx src/testphase-erinnerung-jetzt.ts              → regulärer Lauf
//   cd ~/app && npx tsx src/testphase-erinnerung-jetzt.ts 4917612345678 → Probelauf: beide
//     Vorlagen an genau diese Nummer, unabhängig vom Datum (zum Anschauen der Texte).
import { prisma } from "./pipeline.js";
import { sendeTestphaseErinnerungen } from "./jobs/testphaseErinnerung.js";

const nummer = process.argv[2]?.replace(/\D/g, "") || undefined;
const e = await sendeTestphaseErinnerungen(undefined, nummer);
console.log(`🔔 Testphase-Erinnerungen${nummer ? ` (Probe an ${nummer})` : ""}: ${e.gesendet} gesendet, ${e.fehlgeschlagen} fehlgeschlagen.`);
await prisma.$disconnect();
