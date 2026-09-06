// Einmalige Probe (Teiletappe 3): Dachschrägen, Kniestock und Dachfenster im raeumeText? (echter Claude-Aufruf)
import "../src/env.js";
import { strukturiereTranskript } from "../src/ai/structure.js";
import { ladePreisliste } from "../src/preisliste.js";
import { berechneAufmass, wendeAufmassAn, aufmassText, parseRaeumeText } from "../src/maler/aufmass.js";
import { baueZusammenfassung } from "../src/dialog.js";

const diktat =
  "Angebot für Frau Keller, Am Hang 3, 67435 Neustadt. Dachzimmer, Firsthöhe 2,50, die Wände 4,20, 3,50, 4,20 und 3,50, " +
  "die beiden langen Wände haben Kniestock 1,20, darüber jeweils eine Dachschräge 4,20 lang und 2,10 entlang der Schräge gemessen. " +
  "Ein Dachfenster 78 mal 118. Wände und Schrägen streichen, die restliche Decke hat 5,9 Quadratmeter, die auch.";

const daten = await strukturiereTranskript(diktat, ladePreisliste());
console.log("RAEUME-TEXT:\n" + daten.raeumeText);
console.log("POSITIONEN (vor Aufmaß):");
for (const p of daten.positionen) console.log(` - [${p.kategorie}] ${p.beschreibung} | ${p.menge} ${p.einheit} | ${p.flaechenArt ?? "-"} | ${p.raumBezug ?? "-"}`);
const aufmass = berechneAufmass(parseRaeumeText(daten.raeumeText));
daten.positionen = wendeAufmassAn(daten.positionen, aufmass);
console.log("POSITIONEN (nach Aufmaß):");
for (const p of daten.positionen) console.log(` - [${p.kategorie}] ${p.beschreibung} | ${p.menge} ${p.einheit} | ${p.mengeQuelle ?? "-"}`);
console.log("AUFMASSTEXT:\n" + aufmassText(aufmass));
console.log("UEBERSPRUNGEN:", aufmass.uebersprungen, "RUECKFRAGEN:", aufmass.rueckfragen);
console.log("FEHLENDE INFOS:", daten.fehlendeInfos.map((f) => `${f.wichtigkeit}: ${f.frage}`));
console.log("ZUSAMMENFASSUNG:\n" + baueZusammenfassung(daten));
console.log("DIALOG:", daten.dialog.aktion, "|", daten.dialog.nachricht);
