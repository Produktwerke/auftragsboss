// Seed: legt den Handwerker aus preisliste.json an, damit die eigene
// WhatsApp-Nummer sofort erkannt wird. Aufruf: npm run db:seed
import { PrismaClient } from "@prisma/client";
import { ladePreisliste } from "../src/preisliste.js";

const prisma = new PrismaClient();

// ← HIER die eigene WhatsApp-Nummer eintragen (E.164, ohne "+")
const WHATSAPP_NUMMER = "4917612345678";

async function main() {
  const { betrieb } = ladePreisliste();

  const handwerker = await prisma.handwerker.upsert({
    where: { whatsappNummer: WHATSAPP_NUMMER },
    update: { firma: betrieb.firma, name: betrieb.inhaber, email: betrieb.email },
    create: {
      whatsappNummer: WHATSAPP_NUMMER,
      name: betrieb.inhaber,
      firma: betrieb.firma,
      email: betrieb.email,
      gewerk: betrieb.gewerk,
    },
  });
  console.log(`✅ Handwerker angelegt: ${handwerker.firma} (${handwerker.whatsappNummer})`);
  console.log(`   Dokumente gehen an: ${handwerker.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
