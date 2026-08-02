// Prüft die Dialog-Steuerung.
//
// WICHTIG: Ob der Dialog endet, entscheidet im Betrieb die KI aus dem Verlauf.
// Der Handwerker muss KEIN Stichwort kennen — "mach ich später", "keine
// Ahnung" oder eine Antwort, die an der Frage vorbeigeht, versteht sie von
// selbst. Dieses Skript prüft deshalb zwei Dinge:
//
//   Teil 1  das Notfallnetz (Wortliste), das nur bei KI-Ausfall greift
//   Teil 2  die Szenarien, die die KI im Betrieb entscheiden muss
//
// Aufruf: npm run test:dialog
import { istAbschluss, rueckfragenText, MAX_RUNDEN, TIMEOUT_MINUTEN } from "./dialog.js";

const linie = (z = "─") => z.repeat(70);
let fehler = 0;

// ── Teil 1: Notfallnetz ───────────────────────────────────
console.log(linie("═"));
console.log("TEIL 1 — Notfallnetz (greift nur, wenn die KI-Auswertung ausfällt)");
console.log(linie("═") + "\n");

const NOTFALL_FAELLE: { text: string; erwartet: boolean; warum: string }[] = [
  { text: "weiter", erwartet: true, warum: "kurze Bestätigung" },
  { text: "Weiter!", erwartet: true, warum: "Großschreibung, Satzzeichen" },
  { text: "passt so", erwartet: true, warum: "umgangssprachlich" },
  { text: "später", erwartet: true, warum: "Umlaut" },
  { text: "weiß ich nicht", erwartet: true, warum: "Antwort, die keine ist" },
  {
    text: "Dann machen wir weiter mit der Decke, die muss noch gespachtelt werden",
    erwartet: false,
    warum: "'weiter' mitten im Diktat — darf NICHT abbrechen",
  },
  {
    text: "Die Adresse ist Musterstraße 5, den Rest mache ich später fertig",
    erwartet: false,
    warum: "'später' als Inhalt, nicht als Befehl",
  },
  { text: "Musterstraße 5", erwartet: false, warum: "echte Antwort auf eine Rückfrage" },
  { text: "45 Quadratmeter", erwartet: false, warum: "Mengenangabe" },
];

for (const fall of NOTFALL_FAELLE) {
  const ist = istAbschluss(fall.text);
  const ok = ist === fall.erwartet;
  if (!ok) fehler++;
  const gekuerzt = fall.text.length > 44 ? fall.text.slice(0, 41) + "..." : fall.text;
  console.log(`${ok ? "✅" : "❌"} "${gekuerzt}"`);
  console.log(`   → ${ist ? "beendet Dialog" : "normale Nachricht"}   (${fall.warum})`);
}

// ── Teil 2: Szenarien für die KI ──────────────────────────
console.log("\n" + linie("═"));
console.log("TEIL 2 — Szenarien, die die KI im Betrieb entscheidet");
console.log(linie("═"));
console.log("(Diese Fälle prüfst du mit echtem Anthropic-Key über: npm run test:ki)\n");

const SZENARIEN: { antwort: string; erwartet: string; grund: string }[] = [
  { antwort: "Musterstraße 5", erwartet: "ABSCHLIESSEN", grund: "Pflichtangabe geliefert" },
  { antwort: "Die Adresse schick ich dir nachher", erwartet: "ABSCHLIESSEN", grund: "vertagt" },
  { antwort: "Muss ich nochmal nachmessen", erwartet: "ABSCHLIESSEN", grund: "vertagt" },
  { antwort: "Keine Ahnung, steht noch nicht fest", erwartet: "ABSCHLIESSEN", grund: "weiß es nicht" },
  { antwort: "Schick einfach mal so", erwartet: "ABSCHLIESSEN", grund: "will loslegen" },
  {
    antwort: "Ach, und die Fenster sollen auch gestrichen werden",
    erwartet: "ABSCHLIESSEN",
    grund: "geht auf die Frage nicht ein, liefert stattdessen Neues",
  },
  { antwort: "(keine Antwort)", erwartet: "ABSCHLIESSEN", grund: `Zeitablauf nach ${TIMEOUT_MINUTEN} Min` },
];

for (const s of SZENARIEN) {
  console.log(`   Handwerker: "${s.antwort}"`);
  console.log(`   → erwartet: ${s.erwartet}   (${s.grund})\n`);
}

console.log(linie("─"));
console.log("So klingt ein Abschluss nach Vertagen (von der KI formuliert):\n");
console.log('   "Alles klar, ich schick dir schon mal einen Entwurf.');
console.log('    Die Adresse kannst du in der Word-Datei direkt ergänzen."');

console.log("\n" + linie("─"));
console.log("Ersatztext, falls die KI keine eigene Nachricht liefert:\n");
console.log(
  rueckfragenText([
    "Wie lautet die Adresse von Familie Bär?",
    "Wie groß ist die Wandfläche zum Tapezieren?",
  ]),
);

console.log("\n" + linie("═"));
if (fehler === 0) {
  console.log(
    `✅ Notfallnetz: alle ${NOTFALL_FAELLE.length} Fälle korrekt. ` +
      `Sicherheitsgrenzen: max. ${MAX_RUNDEN} Runden, ${TIMEOUT_MINUTEN} Min Timeout.`,
  );
} else {
  console.log(`❌ ${fehler} von ${NOTFALL_FAELLE.length} Fällen falsch erkannt.`);
  process.exit(1);
}
console.log(linie("═"));
