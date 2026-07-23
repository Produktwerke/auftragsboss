// Prüft die Dialog-Steuerung — ohne API-Keys, ohne Datenbank.
//
// Die heikelste Stelle: Stichwörter wie "weiter" beenden den Dialog. In einem
// normalen Diktat kommt "weiter" aber ebenfalls vor ("...dann machen wir weiter
// mit der Decke..."). Ein falscher Treffer würde ein halbes Angebot erzeugen.
//
// Aufruf: npm run test:dialog
import { istAbschluss, rueckfragenText, MAX_RUNDEN } from "./dialog.js";

interface Fall {
  text: string;
  erwartet: boolean;
  warum: string;
}

const FAELLE: Fall[] = [
  // ── soll abbrechen ──────────────────────────────────────
  { text: "weiter", erwartet: true, warum: "das Standard-Stichwort" },
  { text: "Weiter!", erwartet: true, warum: "Großschreibung und Satzzeichen" },
  { text: "passt so", erwartet: true, warum: "umgangssprachlich" },
  { text: "später", erwartet: true, warum: "Umlaut" },
  { text: "spaeter", erwartet: true, warum: "ohne Umlaut getippt" },
  { text: "weiß ich nicht", erwartet: true, warum: "Antwort, die keine ist" },
  { text: "mach fertig", erwartet: true, warum: "zwei Wörter" },
  { text: "ok", erwartet: true, warum: "kürzeste Bestätigung" },
  { text: "das wars", erwartet: true, warum: "ohne Apostroph" },

  // ── darf NICHT abbrechen ────────────────────────────────
  {
    text: "Dann machen wir weiter mit der Decke, die muss noch gespachtelt werden",
    erwartet: false,
    warum: "'weiter' mitten im Diktat",
  },
  {
    text: "Die Adresse ist Rotberg 18, den Rest mache ich später fertig",
    erwartet: false,
    warum: "'später' als Inhalt, nicht als Befehl",
  },
  {
    text: "Familie Bär, Wohnzimmer tapezieren, 45 Quadratmeter, passt das so für Sie",
    erwartet: false,
    warum: "'passt' innerhalb eines langen Diktats",
  },
  { text: "Rotberg 18", erwartet: false, warum: "echte Antwort auf eine Rückfrage" },
  { text: "45 Quadratmeter", erwartet: false, warum: "Mengenangabe" },
];

const linie = (z = "─") => z.repeat(70);
let fehler = 0;

console.log(linie("═"));
console.log("DIALOG-STEUERUNG — Erkennung der Abschluss-Stichwörter");
console.log(linie("═") + "\n");

for (const fall of FAELLE) {
  const ist = istAbschluss(fall.text);
  const ok = ist === fall.erwartet;
  if (!ok) fehler++;
  const marke = ok ? "✅" : "❌";
  const wirkung = ist ? "beendet Dialog" : "normale Nachricht";
  const gekuerzt = fall.text.length > 44 ? fall.text.slice(0, 41) + "..." : fall.text;
  console.log(`${marke} "${gekuerzt}"`);
  console.log(`   → ${wirkung}   (${fall.warum})`);
}

console.log("\n" + linie("═"));
console.log("BEISPIEL — so sähe eine Rückfrage auf WhatsApp aus");
console.log(linie("═") + "\n");
console.log(
  rueckfragenText(
    ["Wie lautet die Adresse von Familie Bär?", "Wie groß ist die Wandfläche zum Tapezieren?"],
    0,
    false,
  ),
);
console.log("\n" + linie("─"));
console.log("… und in der letzten Runde:\n");
console.log(rueckfragenText(["Wie groß ist die Wandfläche?"], 1, true));

console.log("\n" + linie("═"));
if (fehler === 0) {
  console.log(`✅ Alle ${FAELLE.length} Fälle korrekt erkannt. Max. ${MAX_RUNDEN} Rückfrage-Runden.`);
} else {
  console.log(`❌ ${fehler} von ${FAELLE.length} Fällen falsch erkannt.`);
  process.exit(1);
}
console.log(linie("═"));
