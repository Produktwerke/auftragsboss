// Selbsttest des Messkerns v2: künstliche Kamera, Rechteck bekannter Größe,
// Ecken projizieren, zurückrechnen. Prüft drei Dinge:
//  A) Mit BEKANNTER Brennweite muss das Ergebnis exakt sein (Mathe korrekt?).
//  B) Mit dem f-PRIOR (0,70·Breite) bei "echter" Kamera 0,693·Breite:
//     Wie groß ist der systematische Fehler je Blickwinkel? (Erwartung: klein.)
//  C) Rauschtest: ±3 px auf allen Ecken — bleibt der Fehler zivil?
import { messeWand, type WandEcken } from "./geometrie.js";

type V3 = [number, number, number];
const BILD_B = 1600, BILD_H = 740;
const F_ECHT = 0.693 * BILD_B; // "echte" Samsung-Hauptkamera (~24 mm äquiv.)

function projiziere(p: V3, f: number): [number, number] {
  return [BILD_B / 2 + (f * p[0]) / p[2], BILD_H / 2 + (f * p[1]) / p[2]];
}
function rotiereY(p: V3, grad: number): V3 {
  const a = (grad * Math.PI) / 180;
  return [p[0]*Math.cos(a) + p[2]*Math.sin(a), p[1], -p[0]*Math.sin(a) + p[2]*Math.cos(a)];
}
function baueEcken(W: number, H: number, winkel: number, abstand: number, rausch = 0): { wand: WandEcken; tuer: WandEcken } {
  const mach = (punkte: Record<string, V3>): WandEcken => {
    const raus = {} as WandEcken;
    for (const [k, p] of Object.entries(punkte)) {
      const g = rotiereY(p, winkel);
      const [x, y] = projiziere([g[0], g[1], g[2] + abstand], F_ECHT);
      (raus as unknown as Record<string, [number, number]>)[k] = [
        x + (Math.random() - 0.5) * 2 * rausch,
        y + (Math.random() - 0.5) * 2 * rausch,
      ];
    }
    return raus;
  };
  const wand = mach({ ol: [-W/2, -H/2, 0], or: [W/2, -H/2, 0], ur: [W/2, H/2, 0], ul: [-W/2, H/2, 0] });
  const tuer = mach({
    ol: [-W/2 + 0.4, H/2 - 1.975, 0], or: [-W/2 + 1.22, H/2 - 1.975, 0],
    ur: [-W/2 + 1.22, H/2, 0], ul: [-W/2 + 0.4, H/2, 0],
  });
  return { wand, tuer };
}

let fehlerGesamt = false;
function pruefe(name: string, wert: number, wahr: number, toleranzProzent: number) {
  const fehler = (Math.abs(wert - wahr) / wahr) * 100;
  const ok = fehler <= toleranzProzent;
  console.log(`  ${ok ? "✅" : "❌"} ${name}: ${wert.toFixed(3)} (wahr ${wahr}) → ${fehler.toFixed(2)} %`);
  if (!ok) fehlerGesamt = true;
}

console.log("A) Bekannte Brennweite (muss exakt sein):");
for (const [W, H, winkel] of [[3.98, 2.55, 0], [3.5, 2.54, 12], [5.49, 2.55, 30], [6.14, 2.42, 48]] as const) {
  const { wand, tuer } = baueEcken(W, H, winkel, 2.6);
  const erg = messeWand({ ecken: wand, bildBreite: BILD_B, bildHoehe: BILD_H, raumhoeheM: H, oeffnungen: [tuer], fOverridePx: F_ECHT });
  console.log(` Wand ${W} m @ ${winkel}°:`);
  pruefe("Breite", erg.breiteM, W, 0.2);
  pruefe("Tür-Breite", erg.oeffnungen[0]!.breiteM, 0.82, 0.5);
  pruefe("Tür-Höhe", erg.oeffnungen[0]!.hoeheM, 1.975, 0.5);
}

console.log("\nB) f-Prior 0,70·Breite statt echter 0,693·Breite (systematischer Fehler):");
for (const [W, H, winkel] of [[3.98, 2.55, 0], [3.5, 2.54, 12], [5.49, 2.55, 30], [6.14, 2.42, 48]] as const) {
  const { wand, tuer } = baueEcken(W, H, winkel, 2.6);
  const erg = messeWand({ ecken: wand, bildBreite: BILD_B, bildHoehe: BILD_H, raumhoeheM: H, oeffnungen: [tuer] });
  console.log(` Wand ${W} m @ ${winkel}° [f=${erg.brennweitePx.toFixed(0)} px, ${erg.brennweiteQuelle}, Blick ${erg.blickwinkelGrad.toFixed(0)}°]:`);
  pruefe("Breite", erg.breiteM, W, 3.0);
  pruefe("Tür-Breite", erg.oeffnungen[0]!.breiteM, 0.82, 4.0);
}

console.log("\nC) Rauschtest ±3 px, 200 Läufe, 30°-Wand 5,49 m (f-Prior):");
{
  const fehler: number[] = [];
  for (let i = 0; i < 200; i++) {
    const { wand } = baueEcken(5.49, 2.55, 30, 2.6, 3);
    const erg = messeWand({ ecken: wand, bildBreite: BILD_B, bildHoehe: BILD_H, raumhoeheM: 2.55 });
    fehler.push((Math.abs(erg.breiteM - 5.49) / 5.49) * 100);
  }
  fehler.sort((a, b) => a - b);
  const median = fehler[100]!, p90 = fehler[180]!, max = fehler[199]!;
  console.log(`  Median ${median.toFixed(2)} % | P90 ${p90.toFixed(2)} % | max ${max.toFixed(2)} %`);
  if (p90 > 6) { console.log("  ❌ P90 über 6 %"); fehlerGesamt = true; } else console.log("  ✅ stabil");
}

if (fehlerGesamt) { console.error("\nSELBSTTEST FEHLGESCHLAGEN"); process.exit(1); }
console.log("\nSELBSTTEST BESTANDEN — Messkern ist rechnerisch korrekt.");
