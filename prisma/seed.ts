// Seed: legt einen Test-Handwerker an, damit die eigene WhatsApp-Nummer
// sofort erkannt wird. Aufruf: npm run db:seed
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const handwerker = await prisma.handwerker.upsert({
    where: { whatsappNummer: "4917612345678" }, // ← HIER eigene Nummer eintragen (E.164 ohne +)
    update: {},
    create: {
      whatsappNummer: "4917612345678",
      name: "Max Mustermann",
      firma: "Mustermann Haustechnik GmbH",
      email: "max@mustermann-haustechnik.de", // ← HIER eigene E-Mail eintragen
      gewerk: "Sanitär / Heizung",
    },
  });
  console.log("✅ Handwerker angelegt:", handwerker.firma, `(${handwerker.whatsappNummer})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
