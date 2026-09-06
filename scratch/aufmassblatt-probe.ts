// Einmalige Probe (Teiletappe 3): Word-Datei mit Aufmaßblatt und Belegfotos erzeugen, ohne KI und ohne Datenbank.
import { readFileSync, writeFileSync } from "node:fs";
import { erzeugeAngebotWord } from "../src/angebot/word.js";
import { berechneAngebot } from "../src/angebot/berechnung.js";
import { ladePreisliste } from "../src/preisliste.js";
import { leseMasse } from "../src/betrieb/logo.js";
import { fotoBeschreibung, type Belegfoto } from "../src/angebot/aufmassblatt.js";
import type { DokumentDaten } from "../src/ai/structure.js";

const ziel = process.argv[2]!;
const bilder = [
  "Messbank/Raumfotos Whatsapp/WhatsApp Image 2026-09-04 at 18.51.00 (1).jpeg",
  "Messbank/Raumfotos Whatsapp/WhatsApp Image 2026-09-04 at 18.51.00 (2).jpeg",
  "Messbank/Raumfotos Whatsapp/WhatsApp Image 2026-09-04 at 18.51.00 (3).jpeg",
];
const erkennung = [
  { istWandfoto: true, notizText: null, wandKomplett: true, bodenSichtbar: true, hellGenug: true, besonderheiten: ["Holzpaneele bis ca. 1,10 m"], oeffnungen: [{ art: "Fenstertuer", inNachbarwand: false, offen: false, breiteM: 1.7, hoeheM: 2.3, sicherheit: "hoch" }] },
  { istWandfoto: true, notizText: null, wandKomplett: false, bodenSichtbar: true, hellGenug: true, besonderheiten: [], oeffnungen: [{ art: "Tuer", inNachbarwand: false, offen: false, breiteM: 0.86, hoeheM: 2.0, sicherheit: "hoch" }, { art: "Tuer", inNachbarwand: true, offen: false, breiteM: 0.8, hoeheM: 2.0, sicherheit: "niedrig" }] },
  { istWandfoto: true, notizText: null, wandKomplett: true, bodenSichtbar: true, hellGenug: true, besonderheiten: [], oeffnungen: [] },
];
const fotos: Belegfoto[] = bilder.map((pfad, i) => {
  const daten = readFileSync(pfad);
  const masse = leseMasse(daten, "jpg") ?? { breite: 4, hoehe: 3 };
  return { id: String(i), raum: "Kinderzimmer", wandNr: i + 1, beschreibung: fotoBeschreibung(JSON.stringify(erkennung[i])), daten, typ: "jpg", ...masse };
});

const daten: DokumentDaten = {
  art: "ANGEBOT",
  kunde: { name: "Familie Großmüller", strasse: "Lindenweg 12", plzOrt: "67433 Markstadt" },
  gewerk: "Malerarbeiten",
  objekt: "Kinderzimmer",
  positionen: [
    { kategorie: "LEISTUNG", beschreibung: "Wandflächen oberhalb der Holzpaneele grundieren und streichen", menge: 21.47, einheit: "m2", einzelpreis: 10.5, preisquelle: "DIKTAT", vorschlag: false, mengeUnsicher: false, flaechenArt: "WAND", raumBezug: "Kinderzimmer", mengeQuelle: "AUFMASS" },
    { kategorie: "MATERIAL", beschreibung: "Dispersionsfarbe (weiß, matt)", menge: 5, einheit: "l", einzelpreis: 6.5, preisquelle: "PREISLISTE", vorschlag: true, mengeUnsicher: false },
  ] as DokumentDaten["positionen"],
  aufmassNotizen:
    "Kinderzimmer (Höhe 2,55 m, 4,32 × 3,98 m, gestrichen wird nur oberhalb der Paneele ab 1,1 m): Wandfläche brutto 24,07 m² (Umfang 16,6 m × 1,45 m über den Paneelen); 1 Öffnung über 2,5 m² abgezogen (Durchgang 2 × 2,4 m = 2,60 m² über den Paneelen); 2 Öffnungen bis 2,5 m² übermessen (Fenstertür 1,7 × 2,3 m; Fenster 1 × 1,2 m); Laibungen der abgezogenen Öffnungen nicht enthalten (Tiefe nicht genannt); Wandfläche netto 21,47 m².\nFlur (Höhe 2,5 m, Wände 4,5 + 2 + 1,5 + 1 + 3 m): Wandfläche brutto 30,00 m²; keine Öffnungen erfasst; Wandfläche netto 30,00 m²; Decke 7,40 m² (wie genannt).",
  besonderheiten: null,
  folgetermin: null,
  einleitung: "vielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen folgendes Angebot.",
  schlusstext: "Wir freuen uns auf Ihren Auftrag.",
  rueckfragen: [],
  dialog: { aktion: "ABSCHLIESSEN", nachricht: "" },
  fehlendeInfos: [],
  gewaehrleistung: null,
  raeumeText: null,
};
const preisliste = ladePreisliste();
const summe = berechneAngebot(daten.positionen, preisliste, new Date());
const word = await erzeugeAngebotWord({ daten, summe, preisliste, nummer: "ANG-2026-9999", datum: new Date(), aufmass: { notizen: daten.aufmassNotizen ?? null, fotos } });
writeFileSync(ziel, word);
console.log("geschrieben:", ziel, word.length, "Bytes,", fotos.length, "Fotos");
