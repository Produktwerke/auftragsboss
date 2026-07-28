// Startet NUR den Web-Editor — ohne WhatsApp, ohne KI, ohne E-Mail.
//
// Zum Anschauen und Ausprobieren der Bearbeitungsseite im Browser. Legt beim
// Start ein Demo-Dokument an (falls keins da ist) und zeigt den Link.
//
// Aufruf: npm run dev:editor
import Fastify from "fastify";
import { prisma } from "../pipeline.js";
import { ladePreisliste } from "../preisliste.js";
import { editorRoutes } from "./routes.js";
import { basisUrl, bearbeitenLink, einstellungenLink, erzeugeToken, kundenLink, werbeLink } from "./tokens.js";
import { einstellungenTokenBereit } from "../betrieb/betriebsdaten.js";
import { werbeCodeBereit } from "../empfehlung.js";

async function stelleDemoDokumentBereit(): Promise<{
  bearbeiten: string;
  kunde: string;
  einstellungen: string;
  werbe: string;
}> {
  const preisliste = ladePreisliste();
  const b = preisliste.betrieb;

  const handwerker = await prisma.handwerker.upsert({
    where: { whatsappNummer: "4917612345678" },
    update: {},
    create: {
      whatsappNummer: "4917612345678",
      name: b.inhaber,
      firma: b.firma,
      email: b.email || "test@example.com",
      gewerk: b.gewerk,
    },
  });
  const einstellungen = await einstellungenTokenBereit(prisma, handwerker);
  const werbe = await werbeCodeBereit(prisma, handwerker);

  const vorhanden = await prisma.dokument.findFirst({ orderBy: { datum: "desc" } });
  if (vorhanden)
    return { bearbeiten: vorhanden.bearbeitenToken, kunde: vorhanden.kundenToken, einstellungen, werbe };

  const positionen = [
    L("Alte Tapete entfernen", 45, "m2"),
    L("Deckenflächen spachteln", 45, "m2"),
    L("Wände tapezieren", null, "m2"),
    M("Tapete (nach Kundenwahl)", null, "m2"),
    M("Tapetenkleister", null, "Stk"),
  ];

  const dok = await prisma.dokument.create({
    data: {
      handwerkerId: handwerker.id,
      art: "ANGEBOT",
      nummer: "ANG-2026-DEMO",
      bearbeitenToken: erzeugeToken(),
      kundenToken: erzeugeToken(),
      transkript: "Demo",
      kundeName: "Familie Bär",
      kundeStrasse: "Rotberg 18",
      kundePlzOrt: "12345 Musterstadt",
      kundenNummer: "K-1042",
      gewerk: "Malerei",
      objekt: "Wohnzimmer, ca. 45 m²",
      positionenJson: JSON.stringify(positionen),
      kiOriginalJson: JSON.stringify({
        positionen,
        kunde: { name: "Familie Bär", strasse: "Rotberg 18", plzOrt: "12345 Musterstadt" },
        objekt: "Wohnzimmer, ca. 45 m²",
        einleitung: "",
        schlusstext: "",
      }),
      einleitung:
        "Sehr geehrte Familie Bär,\n\nvielen Dank für das freundliche Gespräch. Gerne unterbreiten wir Ihnen unser Angebot für die Malerarbeiten in Ihrem Wohnzimmer.",
      schlusstext:
        "Die Tapete wählen Sie nach eigenem Wunsch. Bei Rückfragen sind wir jederzeit für Sie da.\n\nMit freundlichen Grüßen\n" +
        b.firma,
      rueckfragenJson: "[]",
      netto: 0,
      mwstSatz: preisliste.konditionen.mwstSatz,
      mwstBetrag: 0,
      brutto: 0,
      gueltigBis: new Date(Date.now() + 30 * 864e5),
    },
  });
  return { bearbeiten: dok.bearbeitenToken, kunde: dok.kundenToken, einstellungen, werbe };
}

function L(beschreibung: string, menge: number | null, einheit: string) {
  return { kategorie: "LEISTUNG", vorschlag: false, beschreibung, menge, einheit, einzelpreis: null, preisquelle: "UNBEKANNT", mengeUnsicher: false };
}
function M(beschreibung: string, menge: number | null, einheit: string) {
  return { kategorie: "MATERIAL", vorschlag: true, beschreibung, menge, einheit, einzelpreis: null, preisquelle: "UNBEKANNT", mengeUnsicher: false };
}

async function main(): Promise<void> {
  // Für die Vorschau einen festen Demo-Admin-Token setzen (in Produktion via .env).
  process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "admin-demo-token";

  const app = Fastify({ logger: false });
  await app.register(editorRoutes);

  const tokens = await stelleDemoDokumentBereit();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });

  const linie = "─".repeat(64);
  console.log("\n" + linie);
  console.log("  ANGEBOTSBLITZ — Editor-Vorschau läuft");
  console.log(linie);
  console.log(`\n  Angebots-Editor:\n  ${bearbeitenLink(tokens.bearbeiten)}\n`);
  console.log(`  Einstellungen:\n  ${einstellungenLink(tokens.einstellungen)}\n`);
  console.log(`  Kundenansicht: ${kundenLink(tokens.kunde)}\n`);
  console.log(`  Lern-Auswertung (Admin):\n  ${basisUrl()}/admin/${process.env.ADMIN_TOKEN}\n`);
  console.log(`  Einladung (Empfehlung):\n  ${werbeLink(tokens.werbe)}`);
  console.log("\n  Beenden mit Strg+C");
  console.log(linie + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
