// Legt einen echten Tester-Betrieb an (kein Test-Konto) und druckt die
// persönlichen Links + einen fertigen Einladungstext zum Weiterschicken.
//
// Aufruf (auf dem Server):
//   npx tsx src/tester-einladen.ts 4917xxxxxxx "Firma GmbH" "Vorname Nachname" mail@firma.de
//
// Nur die Nummer ist Pflicht; Firma/Name/E-Mail sind optional (Platzhalter,
// kann der Tester später selbst in den Einstellungen setzen).
import { prisma } from "./pipeline.js";
import { einstellungenTokenBereit } from "./betrieb/betriebsdaten.js";
import { cockpitLink, importLink, einstellungenLink } from "./web/tokens.js";

const PRODUKTIONSNUMMER = "+49 174 936 4823"; // Nummer, der die Tester schreiben

const nummer = (process.argv[2] ?? "").replace(/[^\d]/g, "");
const firma = process.argv[3] ?? "Mein Malerbetrieb";
const name = process.argv[4] ?? "";
const email = process.argv[5] ?? "";

if (!/^\d{8,15}$/.test(nummer)) {
  console.error('❌ Bitte die WhatsApp-Nummer angeben (Format 49…), z.B.:\n   npx tsx src/tester-einladen.ts 4917xxxxxxx "Firma GmbH" "Max Muster" mail@firma.de');
  process.exit(1);
}

let hw = await prisma.handwerker.findUnique({ where: { whatsappNummer: nummer } });
if (hw) {
  // Bestehendes Konto zu einem echten registrierten Tester machen.
  hw = await prisma.handwerker.update({
    where: { id: hw.id },
    data: {
      istTest: false,
      preisGedaechtnisAktiv: true,
      ...(firma ? { firma } : {}),
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
    },
  });
  console.log("ℹ️  Bestehendes Konto aktualisiert.");
} else {
  hw = await prisma.handwerker.create({
    data: {
      whatsappNummer: nummer,
      firma,
      name: name || "Inhaber",
      email: email || "kein@example.com",
      gewerkTyp: "MALER",
      preisGedaechtnisAktiv: true,
      istTest: false,
    },
  });
  console.log("➕ Neuer Tester-Betrieb angelegt.");
}

const token = await einstellungenTokenBereit(prisma, hw);

console.log("\n" + "=".repeat(70));
console.log(`Tester: ${hw.firma}  ·  WhatsApp ${hw.whatsappNummer}`);
console.log("=".repeat(70));
console.log("Cockpit:       " + cockpitLink(token));
console.log("Import:        " + importLink(token));
console.log("Einstellungen: " + einstellungenLink(token));
console.log("=".repeat(70));

console.log("\n— Fertiger Einladungstext zum Kopieren ——————————————————\n");
console.log(`Hallo${name ? " " + name.split(" ")[0] : ""},

du testest AuftragsBoss, dein Angebot per WhatsApp-Sprachnachricht.

So geht's:
1) Speichere diese Nummer als Kontakt: ${PRODUKTIONSNUMMER}
2) Schick ihr nach einem Kundentermin eine Sprachnachricht (Kunde, Adresse,
   was gemacht werden soll). Du bekommst kurz darauf einen Link zum fertigen
   Angebot, das du bearbeiten und als PDF/Word verschicken kannst.

Dein persönlicher Bereich (kein Login nötig, einfach den Link speichern):
• Übersicht:  ${cockpitLink(token)}
• Alte Angebote hochladen (dann schlägt AuftragsBoss beim nächsten Mal deine
  eigenen Preise vor):  ${importLink(token)}

Tipp: Lade zuerst 2 bis 3 deiner letzten Angebote hoch. Dann kennt AuftragsBoss
deine Preise, sobald du dein erstes Angebot einsprichst.

Bei Fragen einfach zurückschreiben. Danke fürs Testen!`);
console.log("\n———————————————————————————————————————————————\n");

await prisma.$disconnect();
process.exit(0);
