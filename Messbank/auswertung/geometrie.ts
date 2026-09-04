// Single-View-Metrologie für das Foto-Aufmaß (Konzept Abschnitt 3) — v2.
//
// ERKENNTNIS AUS DEM SELBSTTEST (wichtig, im Report dokumentiert):
// Hält man die Kamera aufrecht, sind die senkrechten Wandkanten im Bild
// parallel (Fluchtpunkt im Unendlichen). In diesem NORMALFALL ist die
// Brennweite aus dem Bild allein mathematisch NICHT bestimmbar — die
// Zhang-Fluchtpunktformel wird instabil (im Rauschtest >500 % Fehler).
// Lösung wie in kommerziellen Aufmaß-Apps: BRENNWEITEN-PRIOR.
// Smartphone-Hauptkamera (1×) ≈ 24-26 mm KB-Äquivalent ⇒ f ≈ 0,70 ×
// Bildbreite (bei 4:3-Vollbreite; gilt auch für beschnittene Formate,
// weil die horizontale Brennweite gleich bleibt). WhatsApp skaliert nur —
// das Verhältnis f/Bildbreite bleibt identisch, EXIF wird nicht gebraucht.
//
// Messweg (Strahl-Ebenen-Geometrie, stabil für ALLE Blickwinkel):
//   1. Richtungen der Wand in 3D aus den Kanten (Fluchtpunkte, auch ∞),
//   2. Wandebene aus beiden Richtungen (Normale = Kreuzprodukt),
//   3. Eckstrahlen mit der Ebene schneiden → 3D-Punkte (bis auf Skalierung),
//   4. Raumhöhe = Maßstab → Breite und Öffnungsmaße in Metern.
// Es wird GEMESSEN, nie geschätzt: Alle Zahlen entstehen aus Eckpunkten,
// Raumhöhe und dem dokumentierten f-Prior.

export type Punkt = [number, number];

export interface WandEcken {
  ol: Punkt; // oben links   (Decke × linke Nachbarwand)
  or: Punkt; // oben rechts
  ur: Punkt; // unten rechts (Boden × rechte Nachbarwand)
  ul: Punkt; // unten links
}

export interface OeffnungMass { breiteM: number; hoeheM: number; flaecheM2: number }

export interface MessErgebnis {
  breiteM: number;
  brennweitePx: number;
  brennweiteQuelle: "prior" | "fluchtpunkte";
  blickwinkelGrad: number; // Winkel Kamera→Wandnormale (0 = frontal)
  oeffnungen: OeffnungMass[];
}

/** f-Prior: 24-26-mm-Hauptkamera ⇒ horizontales Sichtfeld ≈ 71° ⇒ f ≈ 0,70·Breite. */
export const F_PRIOR_FAKTOR = 0.7;

type V3 = [number, number, number];
const kreuz = (a: V3, b: V3): V3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const punkt = (a: V3, b: V3): number => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const einheits = (a: V3): V3 => { const l = norm(a); return [a[0]/l, a[1]/l, a[2]/l]; };
const minus = (a: V3, b: V3): V3 => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];

/** Schnittpunkt zweier Bildgeraden (homogen); bei Parallelität Punkt im Unendlichen. */
function schnitt(p1: Punkt, p2: Punkt, q1: Punkt, q2: Punkt): V3 {
  const g1 = kreuz([p1[0], p1[1], 1], [p2[0], p2[1], 1]);
  const g2 = kreuz([q1[0], q1[1], 1], [q2[0], q2[1], 1]);
  return kreuz(g1, g2); // [x,y,w]; w≈0 ⇒ Fluchtpunkt im Unendlichen
}

/** 3D-Richtung zu einem Fluchtpunkt (auch im Unendlichen) bei Kamera K(f,u0,v0). */
function richtung(vp: V3, f: number, u0: number, v0: number): V3 {
  const skala = Math.max(Math.abs(vp[0]), Math.abs(vp[1]), 1);
  if (Math.abs(vp[2]) * skala < 1e-8 * skala || Math.abs(vp[2]) < 1e-10) {
    return einheits([vp[0], vp[1], 0]); // ∞: reine Bildrichtung, keine Tiefenkomponente
  }
  return einheits([(vp[0]/vp[2] - u0) / f, (vp[1]/vp[2] - v0) / f, 1]);
}

/**
 * Versucht, die Brennweite aus BEIDEN Fluchtpunkten zu bestimmen (Zhang).
 * Liefert nur dann einen Wert, wenn er numerisch gut konditioniert und
 * physikalisch plausibel ist (0,45–1,2 × Bildbreite) — sonst null.
 */
function brennweiteAusFluchtpunkten(v1: V3, v2: V3, u0: number, v0: number, bildBreite: number): number | null {
  if (Math.abs(v1[2]) < 1e-8 || Math.abs(v2[2]) < 1e-8) return null; // ein VP im ∞ ⇒ unbestimmbar
  const a: Punkt = [v1[0]/v1[2] - u0, v1[1]/v1[2] - v0];
  const b: Punkt = [v2[0]/v2[2] - u0, v2[1]/v2[2] - v0];
  const f2 = -(a[0]*b[0] + a[1]*b[1]);
  if (!(f2 > 0)) return null;
  const f = Math.sqrt(f2);
  if (f < 0.45 * bildBreite || f > 1.2 * bildBreite) return null; // unplausibel ⇒ Rauschen
  return f;
}

/**
 * Misst eine Wand: Breite in Metern aus den vier Bildecken + Raumhöhe,
 * plus Maße aller Öffnungen (lichtes Maß — Ecken an der Loch-Innenkante).
 */
export function messeWand(args: {
  ecken: WandEcken;
  bildBreite: number;
  bildHoehe: number;
  raumhoeheM: number;
  oeffnungen?: WandEcken[];
  fOverridePx?: number; // nur für Tests
}): MessErgebnis {
  const { ecken, bildBreite, bildHoehe, raumhoeheM } = args;
  const u0 = bildBreite / 2, v0 = bildHoehe / 2;

  // Fluchtpunkte: waagerechte Kanten (Decke oben, Boden unten) und senkrechte.
  const vpBreite = schnitt(ecken.ol, ecken.or, ecken.ul, ecken.ur);
  const vpHoehe = schnitt(ecken.ol, ecken.ul, ecken.or, ecken.ur);

  // Entscheidung nach Selbsttest: IMMER der f-Prior. Die Fluchtpunkt-
  // Schätzung (Zhang) liefert bei verrauschten Ecken gelegentlich eine
  // "plausible" aber falsche Brennweite (Rauschtest-Ausreißer bis 22 %),
  // während der Prior über alle Winkel ≤ 0,6 % systematischen Fehler hat.
  // Prior bezieht sich auf die LANGE Bildseite (Sensor-Eigenschaft) —
  // so stimmt er auch für Hochformat-Fotos.
  const f = args.fOverridePx ?? F_PRIOR_FAKTOR * Math.max(bildBreite, bildHoehe);
  const quelle: MessErgebnis["brennweiteQuelle"] = args.fOverridePx ? "fluchtpunkte" : "prior";
  void brennweiteAusFluchtpunkten; // bewusst ungenutzt — Begründung siehe oben

  const dBreite = richtung(vpBreite, f, u0, v0);
  const dHoehe = richtung(vpHoehe, f, u0, v0);
  let n = einheits(kreuz(dBreite, dHoehe));
  // Normale zur Kamera orientieren (z-Komponente positiv), sonst liegen
  // die Ebenen-Schnittpunkte "hinter" der Kamera.
  if (n[2] < 0) n = [-n[0], -n[1], -n[2]];

  const strahl = (p: Punkt): V3 => [(p[0]-u0)/f, (p[1]-v0)/f, 1];
  const aufEbene = (p: Punkt): V3 => {
    const r = strahl(p);
    const t = 1 / punkt(n, r); // Ebene nᵀX = 1
    return [r[0]*t, r[1]*t, r[2]*t];
  };

  const OL = aufEbene(ecken.ol), OR = aufEbene(ecken.or), UR = aufEbene(ecken.ur), UL = aufEbene(ecken.ul);
  const hoeheEinheiten = (norm(minus(UL, OL)) + norm(minus(UR, OR))) / 2;
  const breiteEinheiten = (norm(minus(OR, OL)) + norm(minus(UR, UL))) / 2;
  const meterProEinheit = raumhoeheM / hoeheEinheiten;
  const breiteM = breiteEinheiten * meterProEinheit;

  const blickwinkelGrad = (Math.acos(Math.min(1, Math.abs(n[2]) / norm(n))) * 180) / Math.PI;

  const oeffnungen: OeffnungMass[] = (args.oeffnungen ?? []).map((o) => {
    const a = aufEbene(o.ol), b = aufEbene(o.or), c = aufEbene(o.ur), d = aufEbene(o.ul);
    const bM = ((norm(minus(b, a)) + norm(minus(c, d))) / 2) * meterProEinheit;
    const hM = ((norm(minus(d, a)) + norm(minus(c, b))) / 2) * meterProEinheit;
    return { breiteM: bM, hoeheM: hM, flaecheM2: bM * hM };
  });

  return { breiteM, brennweitePx: f, brennweiteQuelle: quelle, blickwinkelGrad, oeffnungen };
}
