// Hilfsskript: gibt einen persönlichen Import-Link für den Test aus.
//
// Der Import läuft passwortlos über den einstellungenToken eines Betriebs.
// Als "fremder" Tester hat man noch keinen — dieses Skript stellt einen
// Test-Betrieb sicher, schaltet das Preisgedächtnis ein und druckt den Link.
//
// Aufruf (auf dem Server):
//   npx tsx src/import-link.ts 4917xxxxxxx     (eigene Nummer, empfohlen)
//   npx tsx src/import-link.ts                 (nimmt den neuesten Betrieb)
import { prisma } from "./pipeline.js";
import { ladePreisliste } from "./preisliste.js";
import { einstellungenTokenBereit } from "./betrieb/betriebsdaten.js";

const BASIS = process.env.BASE_URL?.replace(/\/$/, "") || "https://api.auftragsboss.de";
const NUMMER = (process.argv[2] ?? "").replace(/[^\d]/g, "");

let hw = NUMMER
  ? await prisma.handwerker.findUnique({ where: { whatsappNummer: NUMMER } })
  : await prisma.handwerker.findFirst({ orderBy: { erstelltAm: "desc" } });

if (!hw) {
  if (!/^\d{8,15}$/.test(NUMMER)) {
    console.error("❌ Kein Betrieb gefunden. Bitte eigene Nummer angeben, z.B.: npx tsx src/import-link.ts 4917xxxxxxx");
    process.exit(1);
  }
  const b = ladePreisliste().betrieb;
  hw = await prisma.handwerker.create({
    data: { whatsappNummer: NUMMER, name: b.inhaber || "Test", firma: b.firma || "Testbetrieb", email: b.email || "test@example.com", gewerkTyp: "MALER", preisGedaechtnisAktiv: true },
  });
  console.log("➕ Neuen Test-Betrieb angelegt.");
}

// Aus einem (evtl. aus Direkt-Tests stammenden) Test-Konto ein echtes,
// registriertes Konto machen: Test-Flag entfernen (sonst fehlt u.a. der
// „Einstellungen"-Link auf den Angeboten) und Preisgedächtnis einschalten.
if (hw.istTest || !hw.preisGedaechtnisAktiv) {
  hw = await prisma.handwerker.update({
    where: { id: hw.id },
    data: { istTest: false, preisGedaechtnisAktiv: true },
  });
}

const token = await einstellungenTokenBereit(prisma, hw);
console.log(`\n✅ Betrieb: "${hw.firma}"  ·  WhatsApp ${hw.whatsappNummer}  ·  Preisgedächtnis: an`);
console.log(`\n📥 Import-Link:    ${BASIS}/import/${token}`);
console.log(`⚙️  Einstellungen:  ${BASIS}/einstellungen/${token}\n`);
await prisma.$disconnect();
