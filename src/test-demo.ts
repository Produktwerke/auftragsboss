// DEMO-MODUS — läuft komplett OHNE API-Keys und OHNE E-Mail-Versand.
//
// Durchläuft die gesamte Kette mit fertigen Beispieldaten:
//   Diktat → (KI übersprungen) → Datenbank-Archiv → Gewährleistungsfrist
//          → E-Mail als HTML-Datei zum Anschauen im Browser
//
// Damit lässt sich alles testen außer den beiden KI-Schritten:
// Datenbank, Fristen-Berechnung, E-Mail-Layout, Erinnerungs-Mails.
//
// Aufruf: npm run test:demo
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { ProtokollDaten } from "./ai/structure.js";
import { protokollMail, gewaehrleistungsErinnerung } from "./email/templates.js";

const prisma = new PrismaClient();
const AUSGABE_ORDNER = resolve("demo-ausgabe");

// ── Beispiel-Betrieb ──────────────────────────────────────
const BETRIEB = {
  whatsappNummer: "4917612345678",
  name: "Max Mustermann",
  firma: "Mustermann Haustechnik GmbH",
  email: "max@mustermann-haustechnik.de",
  gewerk: "Sanitär / Heizung",
};

const TRANSKRIPT =
  "So, ich bin gerade bei Familie Müller in der Gartenstraße 12 fertig geworden. " +
  "Wir haben heute die Gastherme gewartet, also Brenner gereinigt, Düsen kontrolliert " +
  "und das Ausdehnungsgefäß getauscht, das war komplett hinüber. Ähm, waren ungefähr " +
  "zweieinhalb Stunden. Material war das neue Ausdehnungsgefäß 18 Liter und zwei " +
  "Dichtungen. Wichtig: Ich hab die Frau Müller drauf hingewiesen, dass das Eckventil " +
  "im Gäste-WC tropft, das müsste eigentlich auch gemacht werden, das wollte sie sich " +
  "aber noch überlegen. Und wir haben ausgemacht, nächste Woche Dienstag komme ich " +
  "nochmal vorbei wegen dem Heizkörper im Schlafzimmer, der wird nicht richtig warm.";

// Genau das, was Claude aus dem Transkript machen würde —
// hier fest hinterlegt, damit kein API-Key nötig ist.
const DEMO_DATEN: ProtokollDaten = {
  kunde: { name: "Familie Müller", adresse: "Gartenstraße 12" },
  auftrag: {
    gewerk: "Sanitär / Heizung",
    leistungen: [
      { beschreibung: "Wartung der Gastherme", menge: null },
      { beschreibung: "Reinigung des Brenners", menge: null },
      { beschreibung: "Kontrolle der Düsen", menge: null },
      { beschreibung: "Austausch des defekten Ausdehnungsgefäßes", menge: "1 Stück" },
    ],
    material: ["Ausdehnungsgefäß 18 Liter", "2 Dichtungen"],
    arbeitszeit: "ca. 2,5 Stunden",
    besonderheiten:
      "Kundin wurde auf das tropfende Eckventil im Gäste-WC hingewiesen. Austausch " +
      "wurde empfohlen, um Folgeschäden zu vermeiden; die Kundin möchte sich dies " +
      "noch überlegen.",
    folgetermin: "Dienstag kommender Woche — Prüfung des Heizkörpers im Schlafzimmer",
  },
  gewaehrleistung: {
    typ: "WERK_2_JAHRE",
    begruendung:
      "Wartungs- und Instandsetzungsarbeiten an einer bestehenden Heizungsanlage " +
      "sind keine für Errichtung oder Bestand des Bauwerks wesentlichen Arbeiten.",
  },
  protokoll_text: `Sehr geehrte Familie Müller,

vielen Dank für Ihren Auftrag. Nachfolgend die Dokumentation der durchgeführten Arbeiten:

Durchgeführte Arbeiten:
- Wartung der Gastherme
- Reinigung des Brenners
- Kontrolle der Düsen
- Austausch des defekten Ausdehnungsgefäßes

Verwendetes Material:
- Ausdehnungsgefäß 18 Liter
- 2 Dichtungen

Arbeitszeit: ca. 2,5 Stunden

Hinweise und Absprachen:
Im Rahmen der Arbeiten haben wir festgestellt, dass das Eckventil im Gäste-WC tropft. Wir haben Sie hierauf hingewiesen und empfehlen einen zeitnahen Austausch, um Folgeschäden zu vermeiden. Sie möchten sich dies noch überlegen — sprechen Sie uns gerne an.

Folgetermin:
Wie vereinbart kommen wir am kommenden Dienstag erneut vorbei, um den Heizkörper im Schlafzimmer zu prüfen, der nicht die volle Wärmeleistung erreicht.

Bei Fragen stehen wir Ihnen jederzeit zur Verfügung.

Mit freundlichen Grüßen
Mustermann Haustechnik GmbH`,
};

const addJahre = (d: Date, n: number) => {
  const x = new Date(d);
  x.setFullYear(x.getFullYear() + n);
  return x;
};
const addMonate = (d: Date, n: number) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
};
const deDatum = (d: Date) => d.toLocaleDateString("de-DE");
const linie = (z = "─") => z.repeat(64);

function schreibeHtml(dateiname: string, html: string): string {
  mkdirSync(AUSGABE_ORDNER, { recursive: true });
  const pfad = resolve(AUSGABE_ORDNER, dateiname);
  // charset für Umlaute; color-scheme light, damit die Vorschau im Browser
  // genauso aussieht wie später im E-Mail-Programm
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

  // 1. Betrieb anlegen (oder vorhandenen nutzen)
  const handwerker = await prisma.handwerker.upsert({
    where: { whatsappNummer: BETRIEB.whatsappNummer },
    update: {},
    create: BETRIEB,
  });
  console.log(`\n① Betrieb in der Datenbank: ${handwerker.firma}`);

  // 2. Protokoll archivieren + Gewährleistungsfrist berechnen
  const auftragsDatum = new Date();
  const jahre = DEMO_DATEN.gewaehrleistung.typ === "BAUWERK_5_JAHRE" ? 5 : 2;
  const ablauf = addJahre(auftragsDatum, jahre);
  const vorwarnung = addMonate(ablauf, -3);

  const protokoll = await prisma.protokoll.create({
    data: {
      handwerkerId: handwerker.id,
      transkript: TRANSKRIPT,
      kundeName: DEMO_DATEN.kunde.name,
      kundeAdresse: DEMO_DATEN.kunde.adresse,
      gewerk: DEMO_DATEN.auftrag.gewerk,
      leistungenJson: JSON.stringify(DEMO_DATEN.auftrag.leistungen),
      materialJson: JSON.stringify(DEMO_DATEN.auftrag.material),
      arbeitszeit: DEMO_DATEN.auftrag.arbeitszeit,
      besonderheiten: DEMO_DATEN.auftrag.besonderheiten,
      folgetermin: DEMO_DATEN.auftrag.folgetermin,
      protokollText: DEMO_DATEN.protokoll_text,
      auftragsDatum,
      gewaehrleistung: {
        create: { typ: DEMO_DATEN.gewaehrleistung.typ, beginn: auftragsDatum, ablauf, vorwarnung },
      },
    },
  });
  console.log(`② Protokoll archiviert — Archiv-Nr. ${protokoll.id}`);
  console.log(`③ Gewährleistung: ${jahre} Jahre, läuft ab ${deDatum(ablauf)}`);
  console.log(`   🔔 Erinnerung geplant für ${deDatum(vorwarnung)}`);

  // 3. Alle drei E-Mails als HTML-Dateien erzeugen
  const mail = protokollMail({
    daten: DEMO_DATEN,
    transkript: TRANSKRIPT,
    protokollId: protokoll.id,
    auftragsDatum,
    gewaehrleistungAblauf: ablauf,
  });
  const p1 = schreibeHtml("1-protokoll-mail.html", mail.html);

  const erinnerung = gewaehrleistungsErinnerung({
    art: "VORWARNUNG",
    kunde: DEMO_DATEN.kunde.name ?? "—",
    auftragsDatum,
    ablauf,
    protokollId: protokoll.id,
    protokollText: DEMO_DATEN.protokoll_text,
  });
  const p2 = schreibeHtml("2-erinnerung-vorwarnung.html", erinnerung.html);

  const ablaufMail = gewaehrleistungsErinnerung({
    art: "ABLAUF",
    kunde: DEMO_DATEN.kunde.name ?? "—",
    auftragsDatum,
    ablauf,
    protokollId: protokoll.id,
    protokollText: DEMO_DATEN.protokoll_text,
  });
  const p3 = schreibeHtml("3-erinnerung-ablauf.html", ablaufMail.html);

  // 4. Gesamtstand aus der Datenbank
  const anzahl = await prisma.protokoll.count();

  console.log("\n" + linie("═"));
  console.log("FERTIG — diese Dateien im Browser öffnen (Doppelklick):");
  console.log(linie("═"));
  console.log(`\n  1. ${p1}\n     → "${mail.betreff}"`);
  console.log(`\n  2. ${p2}\n     → "${erinnerung.betreff}"`);
  console.log(`\n  3. ${p3}\n     → "${ablaufMail.betreff}"`);
  console.log(`\n📦 Protokolle im Archiv: ${anzahl}`);
  console.log("   (Archiv ansehen mit: npm run db:studio)");
  console.log("\n" + linie());
  console.log("✅ Datenbank, Fristen-Berechnung und E-Mail-Layout funktionieren.");
  console.log("   Offen bleibt nur der KI-Teil — dafür wird der API-Key gebraucht.");
  console.log(linie());
}

main()
  .catch((err) => {
    console.error("\n❌ Demo fehlgeschlagen:\n", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
