// Einmalige Probe: extrahiert die KI Raummaße + Flächenbezug korrekt? (echter Claude-Aufruf)
import "../src/env.js";
import { strukturiereTranskript } from "../src/ai/structure.js";
import { ladePreisliste } from "../src/preisliste.js";
import { berechneAufmass, wendeAufmassAn, aufmassText, parseRaeumeText } from "../src/maler/aufmass.js";
import { baueZusammenfassung } from "../src/dialog.js";

const diktat =
  "Angebot für Familie Bär, Bergstraße 12, 67433 Neustadt. Wohnzimmer, Höhe 2,52, 4,49 mal 4,36, " +
  "Wände und Decke streichen, vorher die Wände spachteln und schleifen. Da ist eine Fenstertür 1,70 mal 2,20, " +
  "ein Fenster 1,10 mal 1,20 und die Zimmertür 82 mal 1,98. Dann die Küche, Höhe 2,49, Wände 10,38, 3,20 und 5,10, " +
  "da nur die Wände streichen, Fenster 1,40 mal 1,70. Abdecken und Entsorgung wie immer.";

const daten = await strukturiereTranskript(diktat, ladePreisliste());
console.log("RAEUME-TEXT:", daten.raeumeText);
console.log("POSITIONEN (vor Aufmaß):");
for (const p of daten.positionen) console.log(` - [${p.kategorie}] ${p.beschreibung} | ${p.menge} ${p.einheit} | ${p.flaechenArt ?? "-"} | ${p.raumBezug ?? "-"}`);
const aufmass = berechneAufmass(parseRaeumeText(daten.raeumeText));
daten.positionen = wendeAufmassAn(daten.positionen, aufmass);
console.log("POSITIONEN (nach Aufmaß):");
for (const p of daten.positionen) console.log(` - [${p.kategorie}] ${p.beschreibung} | ${p.menge} ${p.einheit} | ${p.mengeQuelle ?? "-"}`);
console.log("AUFMASSTEXT:\n" + aufmassText(aufmass));
console.log("RUECKFRAGEN:", aufmass.rueckfragen);
console.log("ZUSAMMENFASSUNG:\n" + baueZusammenfassung(daten));
console.log("DIALOG:", daten.dialog.aktion, "|", daten.dialog.nachricht);
