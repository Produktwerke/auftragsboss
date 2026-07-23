// DEMO-MODUS — läuft komplett OHNE API-Keys und OHNE E-Mail-Versand.
//
// Durchläuft die gesamte Kette mit fertigen Beispieldaten:
//   Diktat → (KI übersprungen) → Summenberechnung → Datenbank-Archiv
//          → E-Mail als HTML-Datei zum Anschauen im Browser
//
// Damit lässt sich alles testen außer den beiden KI-Schritten:
// Preisliste, Summenberechnung, Datenbank, E-Mail-Layout, Erinnerungs-Mails.
//
// Aufruf: npm run test:demo
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { DokumentDaten } from "./ai/structure.js";
import { berechneAngebot } from "./angebot/berechnung.js";
import { erzeugeAngebotWord, wordDateiname } from "./angebot/word.js";
import { bearbeitenLink, erzeugeToken, kundenLink } from "./web/tokens.js";
import { ladePreisliste } from "./preisliste.js";
import { dokumentMail, gewaehrleistungsErinnerung } from "./email/templates.js";

const prisma = new PrismaClient();
const AUSGABE_ORDNER = resolve("demo-ausgabe");

const BETRIEB_WHATSAPP = "4917612345678";

const TRANSKRIPT =
  "So, ich war gerade bei Familie Bär, Rotberg 18. Wohnzimmer tapezieren, ca. 45 " +
  "Quadratmeter, Deckenhöhe 2,50. Tapete nach Wahl. Decken spachteln, vorher Tapete " +
  "runter machen, Malervlies an die Decke. Wohnzimmer hat 5 Fenster, davon sind 3 " +
  "Balkontüren, 1,70 Meter breit die Türen. An den Wänden Löcher zumachen, " +
  "Kabelkanäle zuspachteln, ein bisschen schleifen und das wars eigentlich.";

type Einheit = DokumentDaten["positionen"][number]["einheit"];

/** Kurzschreibweise: diktierte Leistung. */
const L = (
  beschreibung: string,
  menge: number | null,
  einheit: Einheit,
  mengeUnsicher = false,
): DokumentDaten["positionen"][number] => ({
  kategorie: "LEISTUNG",
  vorschlag: false,
  beschreibung,
  menge,
  einheit,
  einzelpreis: null,
  preisquelle: "UNBEKANNT",
  mengeUnsicher,
});

/** Kurzschreibweise: von der KI ergänztes Material. */
const M = (
  beschreibung: string,
  menge: number | null,
  einheit: Einheit,
): DokumentDaten["positionen"][number] => ({
  kategorie: "MATERIAL",
  vorschlag: true,
  beschreibung,
  menge,
  einheit,
  einzelpreis: null,
  preisquelle: "UNBEKANNT",
  mengeUnsicher: false,
});

// Genau das, was Claude aus dem Transkript machen würde —
// hier fest hinterlegt, damit kein API-Key nötig ist.
const DEMO_DATEN: DokumentDaten = {
  art: "ANGEBOT",
  kunde: { name: "Familie Bär", strasse: "Rotberg 18", plzOrt: "12345 Musterstadt" },
  gewerk: "Malerei",
  objekt: "Wohnzimmer, ca. 45 m² Deckenfläche, Deckenhöhe 2,50 m",
  // Regelfall: im Auto diktiert, keine Preise genannt → alle Preise offen.
  // Leistungen zuerst, danach die Materialvorschläge der KI.
  positionen: [
    L("Alte Tapete entfernen und Untergrund reinigen", 45, "m2"),
    L("Deckenflächen spachteln", 45, "m2"),
    L("Schleifarbeiten", 45, "m2", true),
    L("Malervlies an der Decke anbringen", 45, "m2"),
    L("Wohnzimmer tapezieren (Tapete nach Wahl des Kunden)", null, "m2"),
    L("Löcher und Risse in den Wänden verschließen", null, "Stk"),
    L("Kabelkanäle verspachteln", null, "lfm"),
    // Material — von der KI ergänzt, nicht diktiert
    M("Tapete (Auswahl durch Kunden)", null, "m2"),
    M("Tapetenkleister", null, null),
    M("Malervlies", 45, "m2"),
    M("Vlieskleber", null, null),
    M("Spachtelmasse", null, null),
    M("Schleifpapier / Schleifgitter", null, null),
    M("Abdeckfolie und Kreppband", null, null),
  ],
  aufmassNotizen:
    "Wohnzimmer ca. 45 m² Grundfläche, Deckenhöhe 2,50 m. 5 Fenster, davon 3 Balkontüren " +
    "mit je 1,70 m Breite (abzugsrelevant für die Wandfläche).",
  besonderheiten:
    "Tapete wird vom Kunden ausgewählt — Materialkosten der Tapete sind im Angebot noch nicht enthalten.",
  folgetermin: null,
  einleitung: `Sehr geehrte Familie Bär,

vielen Dank für das freundliche Gespräch und die Besichtigung Ihres Wohnzimmers. Gerne unterbreiten wir Ihnen nachfolgend unser Angebot für die besprochenen Maler- und Tapezierarbeiten.`,
  schlusstext: `Die Tapete wählen Sie nach eigenem Wunsch aus; die Materialkosten hierfür weisen wir nach Ihrer Entscheidung gesondert aus.

Bei Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung. Über Ihren Auftrag würden wir uns freuen.

Mit freundlichen Grüßen
Mustermann Malerbetrieb GmbH`,
  rueckfragen: [
    "Wandfläche fürs Tapezieren fehlt — bitte Raummaße ergänzen (Fenster und Balkontüren abziehen).",
    "Anzahl der zu schließenden Löcher und laufende Meter Kabelkanal wurden nicht genannt.",
    "Deckenfläche für die Schleifarbeiten wurde aus der Raumfläche übernommen — bitte prüfen.",
  ],
  dialog: {
    aktion: "ABSCHLIESSEN",
    nachricht: "",
  },
  fehlendeInfos: [
    {
      feld: "Wandfläche",
      frage: "Wie groß ist die Wandfläche zum Tapezieren (ohne Fenster und Türen)?",
      wichtigkeit: "HILFREICH",
    },
  ],
  gewaehrleistung: null, // Angebot → noch keine Gewährleistung
};

const deDatum = (d: Date) => d.toLocaleDateString("de-DE");
const linie = (z = "─") => z.repeat(70);

function schreibeHtml(dateiname: string, html: string): string {
  mkdirSync(AUSGABE_ORDNER, { recursive: true });
  const pfad = resolve(AUSGABE_ORDNER, dateiname);
  writeFileSync(
    pfad,
    `<!doctype html><meta charset="utf-8">\n` +
      `<meta name="color-scheme" content="light">\n` +
      `<body style="margin:0;background:#eef0f3;padding:24px 0;">\n${html}\n</body>`,
    "utf-8",
  );
  return pfad;
}

async function main(): Promise<void> {
  console.log(linie("═"));
  console.log("DEMO-MODUS — komplette Kette ohne API-Keys");
  console.log(linie("═"));

  const preisliste = ladePreisliste();
  console.log(`\n① Preisliste geladen: ${preisliste.positionen.length} Standardpositionen`);
  console.log(`   Betrieb: ${preisliste.betrieb.firma}`);

  // Betrieb anlegen (oder vorhandenen nutzen)
  const handwerker = await prisma.handwerker.upsert({
    where: { whatsappNummer: BETRIEB_WHATSAPP },
    update: {},
    create: {
      whatsappNummer: BETRIEB_WHATSAPP,
      name: preisliste.betrieb.inhaber,
      firma: preisliste.betrieb.firma,
      email: preisliste.betrieb.email || "test@example.com",
      gewerk: preisliste.betrieb.gewerk,
    },
  });

  // Summen berechnen (im Code, nicht von der KI)
  const datum = new Date();
  const summe = berechneAngebot(DEMO_DATEN.positionen, preisliste, datum);
  const jahr = datum.getFullYear();
  const bisher = await prisma.dokument.count({
    where: { handwerkerId: handwerker.id, art: DEMO_DATEN.art, datum: { gte: new Date(jahr, 0, 1) } },
  });
  const nummer = `ANG-${jahr}-${String(bisher + 1).padStart(4, "0")}`;

  console.log(`\n② Angebotsgerüst erstellt: ${summe.positionen.length} Positionen`);
  if (summe.vollstaendig) {
    console.log(`   Netto ${summe.netto.toFixed(2)} € · MwSt ${summe.mwstBetrag.toFixed(2)} € · Brutto ${summe.brutto.toFixed(2)} €`);
  } else if (summe.ohnePreise) {
    console.log(`   ✏️  Alle Preisspalten offen — Platzhalter zum Ausfüllen (Regelfall beim Diktat)`);
  } else {
    console.log(`   ✏️  ${summe.anzahlOffen} von ${summe.positionen.length} Positionen ohne Preis`);
  }

  // Archivieren
  const dokument = await prisma.dokument.create({
    data: {
      handwerkerId: handwerker.id,
      art: DEMO_DATEN.art,
      nummer,
      bearbeitenToken: erzeugeToken(),
      kundenToken: erzeugeToken(),
      transkript: TRANSKRIPT,
      kundeName: DEMO_DATEN.kunde.name,
      kundeStrasse: DEMO_DATEN.kunde.strasse,
      kundePlzOrt: DEMO_DATEN.kunde.plzOrt,
      gewerk: DEMO_DATEN.gewerk,
      objekt: DEMO_DATEN.objekt,
      positionenJson: JSON.stringify(summe.positionen),
      aufmassNotizen: DEMO_DATEN.aufmassNotizen,
      besonderheiten: DEMO_DATEN.besonderheiten,
      folgetermin: DEMO_DATEN.folgetermin,
      einleitung: DEMO_DATEN.einleitung,
      schlusstext: DEMO_DATEN.schlusstext,
      rueckfragenJson: JSON.stringify(DEMO_DATEN.rueckfragen),
      netto: summe.netto,
      mwstSatz: summe.mwstSatz,
      mwstBetrag: summe.mwstBetrag,
      brutto: summe.brutto,
      anzahlOffen: summe.anzahlOffen,
      gueltigBis: summe.gueltigBis,
      datum,
    },
  });
  console.log(`\n③ Archiviert als ${nummer} (${dokument.id})`);
  console.log(`   Gültig bis ${deDatum(summe.gueltigBis)}`);

  // Word-Datei erzeugen (das eigentliche Arbeitsdokument)
  const word = await erzeugeAngebotWord({ daten: DEMO_DATEN, summe, preisliste, nummer, datum });
  const docxName = wordDateiname(DEMO_DATEN.art, nummer, DEMO_DATEN.kunde.name);
  mkdirSync(AUSGABE_ORDNER, { recursive: true });
  const pWord = resolve(AUSGABE_ORDNER, docxName);
  writeFileSync(pWord, word);
  console.log(`\n④ Word-Datei erzeugt: ${docxName} (${(word.length / 1024).toFixed(1)} KB)`);

  // E-Mails als HTML erzeugen
  const mail = dokumentMail({
    daten: DEMO_DATEN,
    summe,
    preisliste,
    transkript: TRANSKRIPT,
    nummer,
    datum,
    wordDateiname: docxName,
    bearbeitenUrl: bearbeitenLink(dokument.bearbeitenToken),
    kundenUrl: kundenLink(dokument.kundenToken),
  });
  const p1 = schreibeHtml("1-angebot-mail.html", mail.html);

  const erinnerung = gewaehrleistungsErinnerung({
    art: "VORWARNUNG",
    kunde: DEMO_DATEN.kunde.name ?? "—",
    datum,
    ablauf: new Date(datum.getFullYear() + 2, datum.getMonth(), datum.getDate()),
    nummer: `PRO-${jahr}-0001`,
    einleitung: DEMO_DATEN.einleitung,
  });
  const p2 = schreibeHtml("2-erinnerung-vorwarnung.html", erinnerung.html);

  const anzahl = await prisma.dokument.count();

  console.log("\n" + linie("═"));
  console.log("FERTIG — diese Dateien öffnen (Doppelklick):");
  console.log(linie("═"));
  console.log(`\n  📎 WORD-ANGEBOT (in Word öffnen, Preise eintragen):\n     ${pWord}`);
  console.log(`\n  1. ${p1}\n     → E-Mail: "${mail.betreff}"`);
  console.log(`\n  2. ${p2}\n     → E-Mail: "${erinnerung.betreff}"`);
  console.log(`\n📦 Dokumente im Archiv: ${anzahl}   (ansehen mit: npm run db:studio)`);
  console.log("\n" + linie());
  console.log("✅ Preisliste, Summenberechnung, Datenbank und E-Mail-Layout funktionieren.");
  console.log("   Offen bleibt nur der KI-Teil — dafür wird der Anthropic-Key gebraucht.");
  console.log(linie());
}

main()
  .catch((err) => {
    console.error("\n❌ Demo fehlgeschlagen:\n", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
