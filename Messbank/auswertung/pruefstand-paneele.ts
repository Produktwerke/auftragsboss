// Prüfstand für die Paneel-Erkennung (Teiletappe 3): Findet die Bildauswertung
// halbhohe Verkleidungen (Lambris, Fliesenspiegel) und schätzt sie die Oberkante?
//
// Räume mit Verkleidung laut Messbank: Raum05 + Raum06 (weiße Lambris),
// Raum07 (Fliesenspiegel halbhoch). Kontrollräume ohne Verkleidung zeigen,
// ob das Modell Paneele erfindet. Kosten: ein Vision-Aufruf je Foto.
//
//   npx tsx Messbank/auswertung/pruefstand-paneele.ts [Raum05 Raum06 ...]
import "../../src/env.js";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { analysiereWandfoto, type WandfotoAnalyse } from "../../src/ai/wandfoto.js";

const HIER = dirname(fileURLToPath(import.meta.url));
const MB = join(HIER, "..");
const zahl = (s: string) => Number(s.replace(",", "."));
const csv = (datei: string) => readFileSync(join(MB, datei), "utf8").trim().split(/\r?\n/).slice(1).map((z) => z.split(";"));

const raeume = csv("wahrheit-raeume.csv").map((z) => ({ raum: z[0]!, hoehe: zahl(z[1]!), farbe: z[3] ?? "", bemerkung: z[5] ?? "" }));
const waende = csv("wahrheit-waende.csv").map((z) => ({ raum: z[0]!, wand: +z[1]! }));
const MIT_VERKLEIDUNG = new Set(["Raum05", "Raum06", "Raum07"]);
const STANDARD = ["Raum05", "Raum06", "Raum07", "Raum01", "Raum04", "Raum08"];

const auswahl = process.argv.slice(2).length ? process.argv.slice(2) : STANDARD;
const MUSTER = /lambris|paneel|fliesenspiegel|fliesen|verkleid|vertäf|holz/i;
const HOEHE = /(\d+(?:[.,]\d+)?)\s*m\b/i;

interface Zeile { raum: string; wand: number; soll: boolean; treffer: string[]; hoehe: number | null; alle: string[] }
const zeilen: Zeile[] = [];
const kosten = { ein: 0, aus: 0 };

for (const raum of auswahl) {
  const info = raeume.find((r) => r.raum === raum);
  if (!info) { console.log(`?? ${raum}: nicht in wahrheit-raeume.csv`); continue; }
  for (const w of waende.filter((x) => x.raum === raum)) {
    const ordner = join(MB, raum, "whatsapp");
    const datei = readdirSync(ordner).find((f) => f.startsWith(`wand${w.wand}_`));
    if (!datei) continue;
    let a: WandfotoAnalyse;
    try {
      a = await analysiereWandfoto({ daten: readFileSync(join(ordner, datei)), mimeType: "image/jpeg" }, { raumhoeheM: info.hoehe }, (e, s) => { kosten.ein += e; kosten.aus += s; });
    } catch (err) {
      console.log(`!! ${raum} W${w.wand}: ${err instanceof Error ? err.message.slice(0, 120) : err}`);
      continue;
    }
    const treffer = a.besonderheiten.filter((b) => MUSTER.test(b));
    const h = treffer.map((t) => HOEHE.exec(t)?.[1]).find(Boolean);
    const z: Zeile = { raum, wand: w.wand, soll: MIT_VERKLEIDUNG.has(raum), treffer, hoehe: h ? zahl(h) : null, alle: a.besonderheiten };
    zeilen.push(z);
    console.log(`${raum} W${w.wand} [${z.soll ? "Verkleidung" : "Kontrolle"}]: ${a.besonderheiten.join(" | ") || "(nichts)"}`);
  }
}

const mitSoll = zeilen.filter((z) => z.soll);
const kontrolle = zeilen.filter((z) => !z.soll);
const gefunden = mitSoll.filter((z) => z.treffer.length);
const mitHoehe = gefunden.filter((z) => z.hoehe !== null);
const erfunden = kontrolle.filter((z) => z.treffer.length);
const md = [
  `# Prüfstand Paneel-Erkennung (${new Date().toISOString().slice(0, 10)})`,
  "",
  `Räume mit Verkleidung: Raum05/06 (weiße Lambris), Raum07 (Fliesenspiegel halbhoch). Kontrolle: ${[...new Set(kontrolle.map((z) => z.raum))].join(", ") || "keine"}.`,
  "",
  `- Wände mit Verkleidung im Bild (Soll): ${mitSoll.length}; davon Verkleidung gemeldet: ${gefunden.length}; davon mit Höhenschätzung: ${mitHoehe.length}`,
  `- Kontrollwände: ${kontrolle.length}; davon fälschlich Verkleidung gemeldet: ${erfunden.length}`,
  `- Token ein/aus: ${kosten.ein}/${kosten.aus}`,
  "",
  "| Raum | Wand | Soll | Gemeldet | Höhe (m) | Alle Besonderheiten |",
  "|---|---|---|---|---|---|",
  ...zeilen.map((z) => `| ${z.raum} | ${z.wand} | ${z.soll ? "ja" : "nein"} | ${z.treffer.join("; ") || "–"} | ${z.hoehe ?? "–"} | ${z.alle.join("; ") || "–"} |`),
  "",
  "Hinweis: Nicht jede Wand eines Raums mit Lambris zeigt die Lambris (Möbel, Bildausschnitt). Die Soll-Spalte ist raumweise, nicht wandweise.",
].join("\n");
writeFileSync(join(HIER, "PRUEFSTAND-PANEELE.md"), md);
console.log(`\nVerkleidung gemeldet: ${gefunden.length}/${mitSoll.length} (mit Höhe ${mitHoehe.length}), erfunden: ${erfunden.length}/${kontrolle.length}`);
console.log(`→ ${join(HIER, "PRUEFSTAND-PANEELE.md")}`);
