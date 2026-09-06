// Prüfstand für die Wandfoto-Analyse (Teiletappe 2): 42 WhatsApp-Wandfotos
// der Messbank gegen die Laser-Wahrheit der Öffnungen.
//
// Misst je Wand: gefundene/verpasste/erfundene Öffnungen, VOB-Klasse (> 2,5 m²)
// je gefundener Öffnung, Flächenfehler, und ob „Tür offen"/„Wand komplett"
// plausibel sind. Ziel vor Freischaltung: VOB-Klasse ≥ 95 %, keine erfundenen
// Öffnungen. Kosten: ein Vision-Aufruf je Foto (ca. 1–2 Cent).
//
//   npx tsx Messbank/auswertung/pruefstand-vision.ts [Raum01 Raum04 ...]
import "../../src/env.js";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { analysiereWandfoto, relevanteOeffnungen, type WandfotoAnalyse } from "../../src/ai/wandfoto.js";

const HIER = dirname(fileURLToPath(import.meta.url));
const MB = join(HIER, "..");
const zahl = (s: string) => Number(s.replace(",", "."));
const csv = (datei: string) => readFileSync(join(MB, datei), "utf8").trim().split(/\r?\n/).slice(1).map((z) => z.split(";"));

const raumHoehe = new Map(csv("wahrheit-raeume.csv").map((z) => [z[0]!, zahl(z[1]!)]));
interface Wahr { raum: string; wand: number; art: string; b: number; h: number }
const wahr: Wahr[] = csv("wahrheit-oeffnungen.csv").map((z) => ({ raum: z[0]!, wand: +z[1]!, art: z[2]!, b: zahl(z[3]!), h: zahl(z[4]!) }));
const waende = csv("wahrheit-waende.csv").map((z) => ({ raum: z[0]!, wand: +z[1]! }));

const nurRaeume = process.argv.slice(2);
const auswahl = waende.filter((w) => nurRaeume.length === 0 || nurRaeume.includes(w.raum));

interface Zeile {
  raum: string; wand: number; wahrN: number; gefunden: number; erfunden: number;
  vobRichtig: number; vobGesamt: number; flaechenFehler: number[]; wandKomplett: boolean; offen: number; arten: string;
}
const zeilen: Zeile[] = [];
let kosten = { ein: 0, aus: 0 };

async function pruefeWand(w: { raum: string; wand: number }): Promise<void> {
  const ordner = join(MB, w.raum, "whatsapp");
  const datei = readdirSync(ordner).find((f) => f.startsWith(`wand${w.wand}_`));
  if (!datei) { console.log(`?? ${w.raum} W${w.wand}: kein Foto`); return; }
  const daten = readFileSync(join(ordner, datei));
  let a: WandfotoAnalyse;
  try {
    a = await analysiereWandfoto({ daten, mimeType: "image/jpeg" }, { raumhoeheM: raumHoehe.get(w.raum) }, (e, s) => { kosten.ein += e; kosten.aus += s; });
  } catch (err) {
    console.log(`!! ${w.raum} W${w.wand}: ${err instanceof Error ? err.message.slice(0, 100) : err}`);
    return;
  }
  const soll = wahr.filter((x) => x.raum === w.raum && x.wand === w.wand);
  // Zuordnung: je Wahrheits-Öffnung die ähnlichste noch freie Vorhersage (Fläche)
  const frei = [...relevanteOeffnungen(a)];
  let gefunden = 0, vobRichtig = 0, vobGesamt = 0;
  const fehler: number[] = [];
  for (const s of soll) {
    const sf = s.b * s.h;
    let best = -1, bestDiff = Infinity;
    frei.forEach((o, i) => {
      const of = o.breiteM !== null && o.hoeheM !== null ? o.breiteM * o.hoeheM : sf; // ohne Maß: neutral
      const d = Math.abs(of - sf) / sf;
      if (d < bestDiff) { bestDiff = d; best = i; }
    });
    if (best < 0) continue;
    const o = frei.splice(best, 1)[0]!;
    gefunden++;
    if (o.breiteM !== null && o.hoeheM !== null) {
      const of = o.breiteM * o.hoeheM;
      fehler.push(Math.abs(of - sf) / sf * 100);
      vobGesamt++;
      if ((of > 2.5) === (sf > 2.5)) vobRichtig++;
    }
  }
  zeilen.push({
    raum: w.raum, wand: w.wand, wahrN: soll.length, gefunden, erfunden: frei.length,
    vobRichtig, vobGesamt, flaechenFehler: fehler, wandKomplett: a.wandKomplett, offen: relevanteOeffnungen(a).filter((o) => o.offen).length,
    arten: relevanteOeffnungen(a).map((o) => `${o.art}${o.breiteM !== null && o.hoeheM !== null ? ` ${o.breiteM}x${o.hoeheM}` : ""}`).join(", ") || "-",
  });
  console.log(`${w.raum} W${w.wand}: wahr ${soll.length} | gefunden ${gefunden} | erfunden ${frei.length} | VOB ${vobRichtig}/${vobGesamt} | komplett ${a.wandKomplett ? "ja" : "nein"} | ${zeilen.at(-1)!.arten}`);
}

// 4 parallel, damit 42 Fotos in wenigen Minuten durch sind
const warteschlange = [...auswahl];
await Promise.all(Array.from({ length: 4 }, async () => { while (warteschlange.length) await pruefeWand(warteschlange.shift()!); }));
zeilen.sort((a, b) => a.raum.localeCompare(b.raum) || a.wand - b.wand);

const wahrGesamt = zeilen.reduce((s, z) => s + z.wahrN, 0);
const gefunden = zeilen.reduce((s, z) => s + z.gefunden, 0);
const erfunden = zeilen.reduce((s, z) => s + z.erfunden, 0);
const vobR = zeilen.reduce((s, z) => s + z.vobRichtig, 0), vobG = zeilen.reduce((s, z) => s + z.vobGesamt, 0);
const alleFehler = zeilen.flatMap((z) => z.flaechenFehler).sort((a, b) => a - b);
const median = alleFehler[Math.floor(alleFehler.length / 2)] ?? NaN;
const p90 = alleFehler[Math.min(alleFehler.length - 1, Math.floor(alleFehler.length * 0.9))] ?? NaN;

const md = [
  `# Prüfstand Wandfoto-Analyse (${new Date().toISOString().slice(0, 10)})`,
  "",
  `Wände: ${zeilen.length} · Öffnungen wahr ${wahrGesamt} · gefunden ${gefunden} (${((gefunden / wahrGesamt) * 100).toFixed(0)} %) · erfunden ${erfunden}`,
  `VOB-Klasse (> 2,5 m²): ${vobR}/${vobG} = ${vobG ? ((vobR / vobG) * 100).toFixed(1) : "-"} % · Flächenfehler Median ${median.toFixed(1)} % · P90 ${p90.toFixed(1)} %`,
  `Wand als komplett erkannt: ${zeilen.filter((z) => z.wandKomplett).length}/${zeilen.length} · Token ein/aus: ${kosten.ein}/${kosten.aus}`,
  "",
  "| Raum | Wand | wahr | gefunden | erfunden | VOB | Fehler % | komplett | erkannt |",
  "|---|---|---|---|---|---|---|---|---|",
  ...zeilen.map((z) => `| ${z.raum} | ${z.wand} | ${z.wahrN} | ${z.gefunden} | ${z.erfunden} | ${z.vobRichtig}/${z.vobGesamt} | ${z.flaechenFehler.map((f) => f.toFixed(0)).join(", ") || "-"} | ${z.wandKomplett ? "ja" : "nein"} | ${z.arten} |`),
].join("\n");
writeFileSync(join(HIER, "PRUEFSTAND-VISION.md"), md);
console.log("\n" + md.split("\n").slice(2, 5).join("\n"));
console.log(`→ ${join(HIER, "PRUEFSTAND-VISION.md")}`);
