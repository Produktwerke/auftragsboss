// Messbank-Auswertung: liest annotationen.json (Eckpunkte je Wandfoto) und
// die Wahrheits-CSVs, misst jede Wand mit dem Messkern (geometrie.ts) und
// erzeugt den Report mit den Kennzahlen aus Konzept Abschnitt 8 sowie der
// Go-/No-Go-Tabelle aus Abschnitt 9.
//
// Aufruf:  npx tsx Messbank/auswertung/messen.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { messeWand, type WandEcken } from "./geometrie.js";

const HIER = dirname(fileURLToPath(import.meta.url));
const MB = join(HIER, "..");

// ── Wahrheit einlesen ────────────────────────────────────────────────
const zahl = (s: string): number => parseFloat(s.replace(",", "."));
function csv(datei: string): string[][] {
  return readFileSync(join(MB, datei), "utf8").trim().split(/\r?\n/).slice(1).map((z) => z.split(";"));
}
const raumHoehe = new Map<string, number>();
for (const z of csv("wahrheit-raeume.csv")) raumHoehe.set(z[0]!, zahl(z[1]!));

interface WahrWand { raum: string; wand: number; laengeM: number }
const wahrWaende: WahrWand[] = csv("wahrheit-waende.csv").map((z) => ({
  raum: z[0]!, wand: parseInt(z[1]!, 10), laengeM: zahl(z[2]!),
}));

interface WahrOeffnung { raum: string; wand: number; art: string; breiteM: number; hoeheM: number; flaecheM2: number }
const wahrOeffnungen: WahrOeffnung[] = csv("wahrheit-oeffnungen.csv").map((z) => ({
  raum: z[0]!, wand: parseInt(z[1]!, 10), art: z[2]!, breiteM: zahl(z[3]!), hoeheM: zahl(z[4]!),
  flaecheM2: zahl(z[3]!) * zahl(z[4]!),
}));

// ── Annotationen ─────────────────────────────────────────────────────
interface Annotation {
  raum: string; wand: number; datei: string;
  bildBreite: number; bildHoehe: number;
  status: "ok" | "nicht_messbar";
  grund?: string;
  hinweis?: string;
  wandEcken?: WandEcken;
  oeffnungen?: { art: string; ecken: WandEcken }[];
}
const annotationen: Annotation[] = JSON.parse(readFileSync(join(HIER, "annotationen.json"), "utf8"));

// ── Messen + Vergleichen ─────────────────────────────────────────────
interface WandErgebnis {
  raum: string; wand: number; wahrM: number; gemessenM: number | null;
  fehlerProzent: number | null; blick: number | null; grund?: string; hinweis?: string;
  oeffnungen: { art: string; bM: number; hM: number; fM2: number }[];
}
const ergebnisse: WandErgebnis[] = [];
for (const a of annotationen) {
  const wahr = wahrWaende.find((w) => w.raum === a.raum && w.wand === a.wand);
  if (!wahr) throw new Error(`Wahrheit fehlt: ${a.raum} Wand ${a.wand}`);
  const hoehe = raumHoehe.get(a.raum)!;
  if (a.status !== "ok" || !a.wandEcken) {
    ergebnisse.push({ raum: a.raum, wand: a.wand, wahrM: wahr.laengeM, gemessenM: null, fehlerProzent: null, blick: null, grund: a.grund, oeffnungen: [] });
    continue;
  }
  const m = messeWand({
    ecken: a.wandEcken, bildBreite: a.bildBreite, bildHoehe: a.bildHoehe,
    raumhoeheM: hoehe, oeffnungen: (a.oeffnungen ?? []).map((o) => o.ecken),
  });
  ergebnisse.push({
    raum: a.raum, wand: a.wand, wahrM: wahr.laengeM, gemessenM: m.breiteM,
    fehlerProzent: (Math.abs(m.breiteM - wahr.laengeM) / wahr.laengeM) * 100,
    blick: m.blickwinkelGrad, hinweis: a.hinweis,
    oeffnungen: m.oeffnungen.map((o, i) => ({ art: a.oeffnungen![i]!.art, bM: o.breiteM, hM: o.hoeheM, fM2: o.flaecheM2 })),
  });
}

// ── Kennzahlen ───────────────────────────────────────────────────────
const gemessen = ergebnisse.filter((e) => e.gemessenM != null);
const fehler = gemessen.map((e) => e.fehlerProzent!).sort((x, y) => x - y);
const median = fehler[Math.floor(fehler.length / 2)] ?? NaN;
const p90 = fehler[Math.min(fehler.length - 1, Math.floor(fehler.length * 0.9))] ?? NaN;

// Öffnungs-Abgleich je Wand (Zuordnung nach bester Flächen-Übereinstimmung)
let oGefunden = 0, oVerpasst = 0, oFalsch = 0, klasseOk = 0, klasseGesamt = 0;
const oFlaechenFehler: number[] = [];
for (const e of ergebnisse) {
  const wahrHier = wahrOeffnungen.filter((o) => o.raum === e.raum && o.wand === e.wand);
  const gemHier = [...e.oeffnungen];
  for (const wo of wahrHier) {
    if (e.gemessenM == null) { oVerpasst++; continue; } // Wand nicht messbar → Öffnung zählt als verpasst
    let besteIdx = -1, bester = Infinity;
    gemHier.forEach((g, i) => {
      const diff = Math.abs(g.fM2 - wo.flaecheM2);
      if (diff < bester) { bester = diff; besteIdx = i; }
    });
    if (besteIdx === -1) { oVerpasst++; continue; }
    const g = gemHier.splice(besteIdx, 1)[0]!;
    oGefunden++;
    oFlaechenFehler.push((Math.abs(g.fM2 - wo.flaecheM2) / wo.flaecheM2) * 100);
    klasseGesamt++;
    if (g.fM2 > 2.5 === wo.flaecheM2 > 2.5) klasseOk++;
  }
  oFalsch += gemHier.length;
}
oFlaechenFehler.sort((a, b) => a - b);
const oMedian = oFlaechenFehler[Math.floor(oFlaechenFehler.length / 2)] ?? NaN;

// Je Raum: Umfang- und Netto-Flächen-Fehler (nur über messbare Wände,
// Wahrheit auf dieselben Wände eingeschränkt → fairer Vergleich; VOB:
// nur Öffnungen > 2,5 m² werden abgezogen)
interface RaumZeile { raum: string; waende: number; messbar: number; umfangFehler: number | null; nettoFehler: number | null }
const raumZeilen: RaumZeile[] = [];
for (const raum of [...new Set(ergebnisse.map((e) => e.raum))].sort()) {
  const hier = ergebnisse.filter((e) => e.raum === raum);
  const mess = hier.filter((e) => e.gemessenM != null);
  const hoehe = raumHoehe.get(raum)!;
  let umfangFehler: number | null = null, nettoFehler: number | null = null;
  if (mess.length > 0) {
    const wahrUmfang = mess.reduce((s, e) => s + e.wahrM, 0);
    const gemUmfang = mess.reduce((s, e) => s + e.gemessenM!, 0);
    umfangFehler = (Math.abs(gemUmfang - wahrUmfang) / wahrUmfang) * 100;

    const wahrNetto = mess.reduce((s, e) => {
      const abzug = wahrOeffnungen
        .filter((o) => o.raum === raum && o.wand === e.wand && o.flaecheM2 > 2.5)
        .reduce((x, o) => x + o.flaecheM2, 0);
      return s + e.wahrM * hoehe - abzug;
    }, 0);
    const gemNetto = mess.reduce((s, e) => {
      const abzug = e.oeffnungen.filter((o) => o.fM2 > 2.5).reduce((x, o) => x + o.fM2, 0);
      return s + e.gemessenM! * hoehe - abzug;
    }, 0);
    nettoFehler = (Math.abs(gemNetto - wahrNetto) / wahrNetto) * 100;
  }
  raumZeilen.push({ raum, waende: hier.length, messbar: mess.length, umfangFehler, nettoFehler });
}
const nachfass = ergebnisse.filter((e) => e.gemessenM == null).length;

// ── Go/No-Go (Abschnitt 9) ───────────────────────────────────────────
const nettoWerte = raumZeilen.filter((r) => r.nettoFehler != null);
const nettoUnter8 = nettoWerte.filter((r) => r.nettoFehler! <= 8).length;
const nettoUeber15 = nettoWerte.filter((r) => r.nettoFehler! > 15).length;
const klasseQuote = klasseGesamt ? (klasseOk / klasseGesamt) * 100 : NaN;
const nachfassProRaum = nachfass / raumZeilen.length;

const kriterien = [
  { name: "Netto-Wandfläche je Raum", wert: `${nettoUnter8}/${nettoWerte.length} Räume ≤ 8 % (max ${Math.max(...nettoWerte.map((r) => r.nettoFehler!)).toFixed(1)} %)`, go: nettoUnter8 >= Math.min(8, nettoWerte.length) && nettoUeber15 === 0 },
  { name: "Einzelne Wandbreite", wert: `Median ${median.toFixed(1)} % | P90 ${p90.toFixed(1)} %`, go: median <= 5 && p90 <= 10 },
  { name: "Öffnungs-Klassifikation > 2,5 m²", wert: `${klasseOk}/${klasseGesamt} = ${klasseQuote.toFixed(0)} %`, go: klasseQuote >= 95 },
  { name: "Nachfassquote", wert: `${nachfass} nicht messbare Wände (${nachfassProRaum.toFixed(1)}/Raum)`, go: nachfassProRaum <= 1 },
];

// ── Report schreiben ─────────────────────────────────────────────────
let md = `# Messbank-Report Foto-Aufmaß\n\nStand ${new Date().toISOString().slice(0, 10)} · gemessen auf den **WhatsApp-Fassungen** (Produkt-Realität) · Raumhöhe als Maßstab · Brennweiten-Prior 0,70×Bildbreite · Öffnungen im lichten Maß.\n\n`;
md += `## Wände (${gemessen.length}/${ergebnisse.length} messbar)\n\n| Raum | Wand | Wahr (m) | Gemessen (m) | Fehler | Blickwinkel | Anmerkung |\n|---|---|---|---|---|---|---|\n`;
for (const e of ergebnisse) {
  md += e.gemessenM != null
    ? `| ${e.raum} | ${e.wand} | ${e.wahrM.toFixed(2)} | ${e.gemessenM.toFixed(2)} | ${e.fehlerProzent!.toFixed(1)} % | ${e.blick!.toFixed(0)}° | ${e.hinweis ?? ""} |\n`
    : `| ${e.raum} | ${e.wand} | ${e.wahrM.toFixed(2)} | — | — | — | ❌ ${e.grund ?? "nicht messbar"} |\n`;
}
md += `\n**Wandbreiten-Fehler: Median ${median.toFixed(1)} % · P90 ${p90.toFixed(1)} % · max ${Math.max(...fehler).toFixed(1)} %**\n\n`;
md += `## Öffnungen\n\nGefunden ${oGefunden} · verpasst ${oVerpasst} · fälschlich ${oFalsch} · Flächenfehler Median ${oMedian.toFixed(1)} % · VOB-Klassifikation (> 2,5 m²) ${klasseOk}/${klasseGesamt} korrekt\n\n`;
md += `## Je Raum\n\n| Raum | Wände | messbar | Umfangsfehler | Netto-Flächen-Fehler |\n|---|---|---|---|---|\n`;
for (const r of raumZeilen) {
  md += `| ${r.raum} | ${r.waende} | ${r.messbar} | ${r.umfangFehler == null ? "—" : r.umfangFehler.toFixed(1) + " %"} | ${r.nettoFehler == null ? "—" : r.nettoFehler.toFixed(1) + " %"} |\n`;
}
md += `\n## Go-/No-Go (Konzept Abschnitt 9)\n\n| Kriterium | Ergebnis | Bewertung |\n|---|---|---|\n`;
for (const k of kriterien) md += `| ${k.name} | ${k.wert} | ${k.go ? "✅ GO" : "❌ NO-GO"} |\n`;
md += `\n**Gesamturteil: ${kriterien.every((k) => k.go) ? "✅ GO" : kriterien.filter((k) => !k.go).length <= 1 ? "🟡 GRENZFALL" : "❌ NO-GO"}**\n`;

writeFileSync(join(HIER, "REPORT.md"), md);
console.log(md);
