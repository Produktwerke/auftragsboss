// Kleines Hilfsskript: registriert eine WhatsApp-Nummer als Betrieb.
//
// Stellt den bestehenden Demo-Betrieb ("Mustermann Malerbetrieb") auf die
// angegebene Nummer um — so erkennt die Pipeline den Absender und Logo/
// Einstellungen bleiben erhalten. Existiert kein Demo-Betrieb, wird ein neuer
// angelegt.
//
// Aufruf:  tsx src/registriere-nummer.ts 4917662492471
import { prisma } from "./pipeline.js";
import { ladePreisliste } from "./preisliste.js";

const NUMMER = (process.argv[2] ?? "").replace(/[^\d]/g, "");
if (!/^\d{8,15}$/.test(NUMMER)) {
  console.error("❌ Bitte die Nummer im Format 49... angeben (nur Ziffern), z.B. 4917662492471");
  process.exit(1);
}

const b = ladePreisliste().betrieb;

const demo = await prisma.handwerker.findFirst({ where: { whatsappNummer: "4917612345678" } });
const schon = await prisma.handwerker.findUnique({ where: { whatsappNummer: NUMMER } });

let hw;
if (schon) {
  hw = schon; // Nummer ist bereits registriert
} else if (demo) {
  hw = await prisma.handwerker.update({ where: { id: demo.id }, data: { whatsappNummer: NUMMER } });
} else {
  hw = await prisma.handwerker.create({
    data: {
      whatsappNummer: NUMMER,
      name: b.inhaber,
      firma: b.firma,
      email: b.email || "test@example.com",
      gewerk: b.gewerk,
    },
  });
}

console.log(`✅ Registriert: "${hw.firma}" → WhatsApp ${hw.whatsappNummer} (id ${hw.id})`);
await prisma.$disconnect();
