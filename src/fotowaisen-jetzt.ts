// Räumt verwaiste Wandfotos SOFORT auf (sonst täglich 04:10 per Cron-Job,
// siehe jobs/fotoWaisen.ts). Löscht Zeilen ohne Datei, Fotos gelöschter
// Angebote, Fotos ohne Angebot nach Ablauf der Aufbewahrung und Dateien ohne
// Datenbankzeile (älter als 24 h). Verändert keine Belegfotos bestehender Angebote.
//
// Aufruf (auf dem Server als auftragsboss):  cd ~/app && npx tsx src/fotowaisen-jetzt.ts
import { prisma } from "./pipeline.js";
import { raeumeFotoWaisenAuf, WAISEN_AUFBEWAHRUNG_TAGE } from "./jobs/fotoWaisen.js";

const e = await raeumeFotoWaisenAuf(prisma);
console.log(
  `🧹 Fotowaisen aufgeräumt: ${e.ohneDatei} Zeile(n) ohne Datei, ${e.angebotWeg} zu gelöschten Angeboten, ` +
    `${e.abgelaufen} ohne Angebot älter als ${WAISEN_AUFBEWAHRUNG_TAGE} Tage, ${e.dateienOhneZeile} Datei(en) ohne Zeile.`,
);
await prisma.$disconnect();
