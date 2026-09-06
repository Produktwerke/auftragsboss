// Einmalige Probe (Teiletappe 3): Paneelhöhe, Laibungen und genannte Decke im raeumeText? (echter Claude-Aufruf)
import "../src/env.js";
import { strukturiereTranskript } from "../src/ai/structure.js";
import { ladePreisliste } from "../src/preisliste.js";
import { berechneAufmass, wendeAufmassAn, aufmassText, parseRaeumeText } from "../src/maler/aufmass.js";
import { baueZusammenfassung } from "../src/dialog.js";

const diktat =
  "Angebot für Familie Großmüller, Lindenweg 12, Markstadt. Kinderzimmer, Höhe 2,55, 4,32 mal 3,98, " +
  "da sind unten Holzpaneele bis 1,10, wir streichen nur die Wände oberhalb der Paneele, ohne Decke. " +
  "Fenstertür 1,70 mal 2,30, die Laibungen mit 25 Zentimeter streichen wir mit. " +
  "Dann der Flur, Höhe 2,50, Wände 4,50, 2,00, 1,50, 1,00 und 3,00, Wände und Decke streichen, die Decke hat 7,4 Quadratmeter.";

const daten = await strukturiereTranskript(diktat, ladePreisliste());
console.log("RAEUME-TEXT:\n" + daten.raeumeText);
console.log("POSITIONEN (vor Aufmaß):");
for (const p of daten.positionen) console.log(` - [${p.kategorie}] ${p.beschreibung} | ${p.menge} ${p.einheit} | ${p.flaechenArt ?? "-"} | ${p.raumBezug ?? "-"}`);
const aufmass = berechneAufmass(parseRaeumeText(daten.raeumeText));
daten.positionen = wendeAufmassAn(daten.positionen, aufmass);
console.log("POSITIONEN (nach Aufmaß):");
for (const p of daten.positionen) console.log(` - [${p.kategorie}] ${p.beschreibung} | ${p.menge} ${p.einheit} | ${p.mengeQuelle ?? "-"}`);
console.log("AUFMASSTEXT:\n" + aufmassText(aufmass));
console.log("RUECKFRAGEN:", aufmass.rueckfragen);
console.log("FEHLENDE INFOS:", daten.fehlendeInfos);
console.log("ZUSAMMENFASSUNG:\n" + baueZusammenfassung(daten));
console.log("DIALOG:", daten.dialog.aktion, "|", daten.dialog.nachricht);
