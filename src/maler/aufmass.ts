// Aufmaßrechner „Drei Zahlen und vier Fotos", Teiletappe 1.
//
// Der Maler nennt je Raum die Höhe und die Wandlängen; dieses Modul rechnet
// daraus die Wandfläche VOB-gerecht (DIN 18363 / VOB Teil C, Abschnitt 5):
//   - Öffnungen bis 2,5 m² werden ÜBERMESSEN (kein Abzug),
//   - Öffnungen über 2,5 m² werden ABGEZOGEN.
// Die KI liefert ausschließlich die Zahlen aus dem Diktat, gerechnet wird
// hier, deterministisch und getestet. Nichts wird geschätzt: Fehlt eine Zahl,
// bleibt die Fläche offen und der Handwerker sieht das.
//
// Reines Modul ohne Datenbank oder Netz, damit es in Sekunden testbar ist.

export const VOB_ABZUGSGRENZE_M2 = 2.5;
/** Öffnungen in diesem Bereich entscheiden knapp über Abzug oder nicht:
 *  hier lohnt eine Rückfrage, weil ein Fotomaß dafür zu ungenau ist. */
export const GRAUZONE_M2: readonly [number, number] = [2.2, 2.8];

export interface Oeffnung {
  /** Fenster, Tür, Fenstertür, Durchgang … (freier Text, nur zur Anzeige). */
  art: string;
  breiteM: number;
  hoeheM: number;
}

export interface RaumMasse {
  name: string;
  hoeheM: number | null;
  /** Genau zwei Werte = Rechteckraum (a × b). Sonst alle Wandlängen einzeln. */
  wandlaengenM: number[];
  waendeStreichen: boolean;
  deckeStreichen: boolean;
  oeffnungen: Oeffnung[];
  /** Halbhohe Fläche (Teiletappe 3): Oberkante einer unten NICHT zu streichenden
   *  Zone (Lambris, Paneele, Fliesenspiegel) in Metern. Gestrichen wird nur darüber. */
  paneelHoeheM?: number | null;
  /** Deckenfläche, wenn sie direkt genannt wurde (bei Vielecken die einzige Quelle). */
  deckeM2Genannt?: number | null;
  /** Laibungstiefe der abgezogenen Öffnungen in Metern; nur, wenn genannt. */
  laibungTiefeM?: number | null;
  /** Dachschrägen (Teiletappe 3): je Wand eine eigene Höhe (Kniestock, Giebel als
   *  mittlere Höhe), parallel zu wandlaengenM; null = Raumhöhe. */
  wandHoehenM?: (number | null)[];
  /** Dachschrägen selbst: Länge × Schrägenlänge (entlang der Schräge gemessen), zählen wie Wandfläche. */
  schraegen?: { laengeM: number; schraegeM: number }[];
}

export interface OeffnungBewertet extends Oeffnung {
  /** Volle Öffnungsfläche (Breite × Höhe). */
  flaecheM2: number;
  /** Anteil der Öffnung innerhalb der gestrichenen Zone (bei Paneelen kleiner). */
  wirksamM2: number;
  abgezogen: boolean;
  grauzone: boolean;
  /** Laibungsfläche dieser Öffnung (nur bei Abzug und genannter Tiefe, sonst 0). */
  laibungM2: number;
}

export interface RaumAufmass {
  name: string;
  hoeheM: number;
  /** Höhe der gestrichenen Zone: Raumhöhe minus Paneelhöhe. */
  streichHoeheM: number;
  paneelHoeheM: number | null;
  umfangM: number;
  /** true, wenn genau zwei Wandlängen genannt wurden (a × b). */
  rechteck: boolean;
  /** Wandfläche inklusive Dachschrägen (vor Abzug). */
  wandBruttoM2: number;
  /** Anteil der Dachschrägen an brutto (0 ohne Schrägen). */
  schraegenM2: number;
  abzugM2: number;
  /** Laibungen der abgezogenen Öffnungen (VOB: gesondert zu rechnen), fließen in netto ein. */
  laibungM2: number;
  wandNettoM2: number;
  /** Deckenfläche; null, wenn die Decke nicht gestrichen wird oder der Raum
   *  kein Rechteck ist (dann fehlt die Grundfläche). */
  deckeM2: number | null;
  oeffnungen: OeffnungBewertet[];
  /** Ein Satz je Raum für Aufmaßnotizen und Zusammenfassung. */
  erklaerung: string;
}

export interface AufmassErgebnis {
  raeume: RaumAufmass[];
  /** Räume, die nicht berechenbar waren, mit Grund (z. B. Höhe fehlt). */
  uebersprungen: { name: string; grund: string }[];
  /** Rückfragen an den Handwerker (Grauzonen-Öffnungen). */
  rueckfragen: string[];
}

const rund2 = (x: number): number => Math.round(x * 100) / 100;
const zahl = (x: number): string => x.toFixed(2).replace(".", ",");
const masz = (x: number): string => rund2(x).toString().replace(".", ",");

const istMass = (x: unknown, min: number, max: number): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;

/** Öffnungen, die auf dem Boden stehen (Türen, Durchgänge): bei Paneelen zählt nur ihr Teil oberhalb. */
export const stehtAufBoden = (art: string): boolean => /t[üu]r|durchgang|durchbruch|bogen|portal|nische/i.test(art);

/** Rechnet einen Raum. Wirft nicht: Unbrauchbare Angaben liefern null. */
export function berechneRaum(raum: RaumMasse): RaumAufmass | { grund: string } {
  const name = raum.name.trim() || "Raum";
  if (!istMass(raum.hoeheM, 1.5, 8)) return { grund: "Raumhöhe fehlt oder unplausibel" };
  const laengen = (raum.wandlaengenM ?? []).filter((l) => istMass(l, 0.1, 60));
  if (laengen.length === 0) return { grund: "keine Wandlängen genannt" };
  if (laengen.length !== (raum.wandlaengenM ?? []).length) return { grund: "unplausible Wandlänge" };

  // Halbhohe Fläche: gestrichen wird nur oberhalb der Paneele/Fliesen.
  const paneelHoeheM = istMass(raum.paneelHoeheM, 0.1, raum.hoeheM - 0.2) ? raum.paneelHoeheM : null;
  if (raum.paneelHoeheM != null && paneelHoeheM === null) return { grund: "Paneelhöhe unplausibel" };
  const streichHoeheM = rund2(raum.hoeheM - (paneelHoeheM ?? 0));
  const laibungTiefeM = istMass(raum.laibungTiefeM, 0.03, 1.0) ? raum.laibungTiefeM : null;

  // Eigene Wandhöhen (Kniestock unter der Dachschräge, Giebel als mittlere Höhe).
  const hoehen = (raum.wandHoehenM ?? []).slice(0, laengen.length);
  while (hoehen.length < laengen.length) hoehen.push(null);
  for (const h of hoehen) if (h !== null && !istMass(h, 0.3, raum.hoeheM)) return { grund: "Wandhöhe unplausibel (über Raumhöhe oder unter 0,3 m)" };
  const eigeneHoehen = hoehen.some((h) => h !== null);
  const schraegen = (raum.schraegen ?? []).filter((s) => istMass(s.laengeM, 0.1, 60) && istMass(s.schraegeM, 0.1, 15));
  if (schraegen.length !== (raum.schraegen ?? []).length) return { grund: "unplausible Dachschräge" };

  const rechteck = laengen.length === 2 && !eigeneHoehen;
  const umfangM = rechteck ? 2 * (laengen[0]! + laengen[1]!) : laengen.reduce((s, l) => s + l, 0);
  const streichHoeheJeWand = (i: number) => rund2(Math.max(0, (hoehen[i] ?? raum.hoeheM!) - (paneelHoeheM ?? 0)));
  const wandFlaecheM2 = rechteck
    ? umfangM * streichHoeheM
    : laengen.reduce((s, l, i) => s + l * streichHoeheJeWand(i), 0);
  const schraegenM2 = rund2(schraegen.reduce((s, x) => s + x.laengeM * x.schraegeM, 0));
  const wandBruttoM2 = rund2(wandFlaecheM2 + schraegenM2);

  const oeffnungen: OeffnungBewertet[] = (raum.oeffnungen ?? [])
    .filter((o) => istMass(o.breiteM, 0.1, 10) && istMass(o.hoeheM, 0.1, 10))
    .map((o) => {
      const flaecheM2 = rund2(o.breiteM * o.hoeheM);
      // Anteil in der gestrichenen Zone: Türen ragen von unten in die Paneele,
      // Fenster sitzen erfahrungsgemäß darüber (höchstens so hoch wie die Zone).
      const wirksameHoehe = paneelHoeheM
        ? stehtAufBoden(o.art)
          ? Math.max(0, o.hoeheM - paneelHoeheM)
          : Math.min(o.hoeheM, streichHoeheM)
        : o.hoeheM;
      const wirksamM2 = rund2(o.breiteM * wirksameHoehe);
      const abgezogen = wirksamM2 > VOB_ABZUGSGRENZE_M2;
      const laibungM2 =
        abgezogen && laibungTiefeM
          ? rund2((2 * wirksameHoehe + (stehtAufBoden(o.art) ? 0 : o.breiteM)) * laibungTiefeM)
          : 0;
      return {
        ...o,
        flaecheM2,
        wirksamM2,
        abgezogen,
        grauzone: wirksamM2 >= GRAUZONE_M2[0] && wirksamM2 <= GRAUZONE_M2[1],
        laibungM2,
      };
    });

  const abzugM2 = rund2(oeffnungen.filter((o) => o.abgezogen).reduce((s, o) => s + o.wirksamM2, 0));
  const laibungM2 = rund2(oeffnungen.reduce((s, o) => s + o.laibungM2, 0));
  const wandNettoM2 = rund2(Math.max(0, wandBruttoM2 - abzugM2) + laibungM2);
  const deckeM2 = !raum.deckeStreichen
    ? null
    : istMass(raum.deckeM2Genannt, 0.5, 500)
      ? rund2(raum.deckeM2Genannt)
      : rechteck
        ? rund2(laengen[0]! * laengen[1]!)
        : null;

  const abgezogen = oeffnungen.filter((o) => o.abgezogen);
  const uebermessen = oeffnungen.filter((o) => !o.abgezogen);
  const beschreibe = (o: OeffnungBewertet) => `${o.art} ${masz(o.breiteM)} × ${masz(o.hoeheM)} m`;
  const teile: string[] = [];
  const wandText = (l: number, i: number) => (hoehen[i] !== null ? `${masz(l)} (Höhe ${masz(hoehen[i]!)})` : masz(l));
  const masse = rechteck ? `${masz(laengen[0]!)} × ${masz(laengen[1]!)} m` : `Wände ${laengen.map(wandText).join(" + ")} m`;
  teile.push(
    `${name} (Höhe ${masz(raum.hoeheM)} m, ${masse}${paneelHoeheM ? `, gestrichen wird nur oberhalb der Paneele ab ${masz(paneelHoeheM)} m` : ""})`,
  );
  if (raum.waendeStreichen) {
    const bruttoTeile: string[] = [];
    if (paneelHoeheM && rechteck) bruttoTeile.push(`Umfang ${masz(umfangM)} m × ${masz(streichHoeheM)} m über den Paneelen`);
    else if (paneelHoeheM) bruttoTeile.push(`nur oberhalb der Paneele`);
    if (schraegenM2 > 0) bruttoTeile.push(`davon Dachschrägen ${zahl(schraegenM2)} m²: ${schraegen.map((s) => `${masz(s.laengeM)} × ${masz(s.schraegeM)} m`).join(", ")}`);
    teile.push(`Wandfläche brutto ${zahl(wandBruttoM2)} m²${bruttoTeile.length ? ` (${bruttoTeile.join("; ")})` : ""}`);
    if (abgezogen.length) {
      teile.push(
        `${abgezogen.length} Öffnung${abgezogen.length > 1 ? "en" : ""} über 2,5 m² abgezogen (${abgezogen
          .map((o) => `${beschreibe(o)} = ${zahl(o.wirksamM2)} m²${paneelHoeheM && o.wirksamM2 !== o.flaecheM2 ? " über den Paneelen" : ""}`)
          .join("; ")})`,
      );
    }
    if (uebermessen.length) {
      teile.push(
        `${uebermessen.length} Öffnung${uebermessen.length > 1 ? "en" : ""} bis 2,5 m² übermessen (${uebermessen
          .map(beschreibe)
          .join("; ")})`,
      );
    }
    if (oeffnungen.length === 0) teile.push("keine Öffnungen erfasst");
    if (laibungM2 > 0) teile.push(`Laibungen ${zahl(laibungM2)} m² (Tiefe ${masz(laibungTiefeM!)} m) hinzugerechnet`);
    else if (abgezogen.length && !laibungTiefeM) teile.push("Laibungen der abgezogenen Öffnungen nicht enthalten (Tiefe nicht genannt)");
    teile.push(`Wandfläche netto ${zahl(wandNettoM2)} m²`);
  }
  if (raum.deckeStreichen) {
    teile.push(
      deckeM2 !== null
        ? `Decke ${zahl(deckeM2)} m²${istMass(raum.deckeM2Genannt, 0.5, 500) ? " (wie genannt)" : ""}`
        : "Decke: Grundfläche nicht berechenbar (kein Rechteck, Fläche nicht genannt)",
    );
  }

  return {
    name,
    hoeheM: raum.hoeheM,
    streichHoeheM,
    paneelHoeheM,
    umfangM: rund2(umfangM),
    rechteck,
    wandBruttoM2,
    schraegenM2,
    abzugM2,
    laibungM2,
    wandNettoM2,
    deckeM2,
    oeffnungen,
    erklaerung: `${teile[0]}: ${teile.slice(1).join("; ")}.`,
  };
}

/** Rechnet alle Räume und sammelt Rückfragen für Grauzonen-Öffnungen. */
export function berechneAufmass(raeume: RaumMasse[]): AufmassErgebnis {
  const ergebnis: AufmassErgebnis = { raeume: [], uebersprungen: [], rueckfragen: [] };
  for (const r of raeume ?? []) {
    const a = berechneRaum(r);
    if ("grund" in a) {
      ergebnis.uebersprungen.push({ name: r.name.trim() || "Raum", grund: a.grund });
      continue;
    }
    ergebnis.raeume.push(a);
    for (const o of a.oeffnungen) {
      if (o.grauzone) {
        ergebnis.rueckfragen.push(
          `${a.name}: ${o.art} ${masz(o.breiteM)} × ${masz(o.hoeheM)} m hat ${zahl(o.wirksamM2)} m²` +
            `${a.paneelHoeheM && o.wirksamM2 !== o.flaecheM2 ? " über den Paneelen" : ""} und liegt nahe der ` +
            `VOB-Grenze von 2,5 m². Bitte das Maß prüfen, es entscheidet über Abzug oder Übermessen.`,
        );
      }
    }
    if (a.oeffnungen.some((o) => o.abgezogen) && a.laibungM2 === 0) {
      ergebnis.rueckfragen.push(
        `${a.name}: Sollen die Laibungen der abgezogenen Öffnungen mitgestrichen werden? Dann nenne die Laibungstiefe (z.B. „Laibungen 25 cm“).`,
      );
    }
  }
  return ergebnis;
}

// ── Anwendung auf die Positionen ────────────────────────────────────────

/** Das, was eine Position mindestens braucht, damit das Aufmaß greifen kann. */
export interface FlaechenPosition {
  beschreibung: string;
  menge: number | null;
  einheit: string | null;
  mengeUnsicher: boolean;
  flaechenArt?: "WAND" | "DECKE" | null;
  raumBezug?: string | null;
  mengeQuelle?: "DIKTAT" | "AUFMASS" | null;
}

const normal = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function findeRaum(raeume: RaumAufmass[], bezug: string | null | undefined): RaumAufmass[] {
  if (!bezug?.trim()) return raeume.length === 1 ? raeume : [];
  const b = normal(bezug);
  const treffer = raeume.filter((r) => {
    const n = normal(r.name);
    return n === b || n.includes(b) || b.includes(n);
  });
  return treffer;
}

/**
 * Trägt berechnete Flächen in Positionen mit Flächenbezug ein.
 * Ohne Raumtreffer bleibt die Position unverändert (lieber offen als falsch).
 * Bezieht sich eine Position auf keinen bestimmten Raum, aber es gibt mehrere,
 * gilt sie als raumübergreifend und bekommt die Summe der passenden Räume.
 */
export function wendeAufmassAn<P extends FlaechenPosition>(positionen: P[], aufmass: AufmassErgebnis): P[] {
  if (aufmass.raeume.length === 0) return positionen;
  return positionen.map((p) => {
    if (p.flaechenArt !== "WAND" && p.flaechenArt !== "DECKE") return p;
    let raeume = findeRaum(aufmass.raeume, p.raumBezug);
    if (raeume.length === 0 && !p.raumBezug?.trim()) raeume = aufmass.raeume; // raumübergreifend
    if (raeume.length === 0) return p;
    const werte = raeume.map((r) => (p.flaechenArt === "WAND" ? r.wandNettoM2 : r.deckeM2)).filter((x): x is number => x !== null);
    if (werte.length === 0) return p;
    const menge = rund2(werte.reduce((s, x) => s + x, 0));
    return { ...p, menge, einheit: "m2", mengeUnsicher: false, mengeQuelle: "AUFMASS" as const };
  });
}

/** Aufmaßnotiz für E-Mail, Editor und Dokument, ein Absatz je Raum. */
export function aufmassText(aufmass: AufmassErgebnis): string {
  const zeilen = aufmass.raeume.map((r) => r.erklaerung);
  for (const u of aufmass.uebersprungen) zeilen.push(`${u.name}: nicht berechnet (${u.grund}).`);
  return zeilen.join("\n");
}

/** Kurzfassung für die WhatsApp-Zusammenfassung, eine Zeile je Raum. */
export function aufmassKurz(aufmass: AufmassErgebnis): string[] {
  return aufmass.raeume.map((r) => {
    const teile: string[] = [];
    teile.push(`Wände ${zahl(r.wandNettoM2)} m²${r.paneelHoeheM ? ` (nur oberhalb der Paneele ab ${masz(r.paneelHoeheM)} m)` : ""}`);
    if (r.schraegenM2 > 0) teile.push(`(davon ${zahl(r.schraegenM2)} m² Dachschrägen)`);
    if (r.abzugM2 > 0) teile.push(`(${zahl(r.abzugM2)} m² Öffnungen abgezogen)`);
    if (r.laibungM2 > 0) teile.push(`(${zahl(r.laibungM2)} m² Laibungen dazu)`);
    if (r.deckeM2 !== null) teile.push(`Decke ${zahl(r.deckeM2)} m²`);
    return `${r.name}: ${teile.join(", ")}`;
  });
}

// ── Parser für die Raumzeilen der KI ───────────────────────────────────
//
// Das Structured-Output-Schema ist an der Größengrenze; ein verschachteltes
// Objekt-Array für Räume sprengt die Grammatik. Deshalb liefert die KI EINE
// Textzeile je Raum in festem Format, und dieser Parser macht daraus Zahlen.
// Alles, was nicht sauber parsebar ist, wird verworfen (kein falsches Maß).
//   Raum: Wohnzimmer; Höhe: 2,52; Wände: 4,49 x 4,36; Decke: ja; Öffnungen: Fenstertür 1,70 x 2,20, Fenster 1,10 x 1,20

const dezimal = (s: string): number | null => {
  const n = Number(s.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Zahlenliste aus "4,49 x 4,36" / "4,49 mal 4,36" / "10,38, 3,20 und 5,10". */
function zahlenAus(text: string): number[] {
  const treffer = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return treffer.map((z) => dezimal(z)).filter((n): n is number => n !== null);
}

/**
 * Wandlängen mit optionaler eigener Höhe in Klammern: "4,20 (1,20), 3,50, 4,20 (Höhe 1,20), 3,50".
 * Rechteckform "4,49 x 4,36" liefert zwei Längen ohne Höhen.
 */
function waendeAus(text: string): { laengen: number[]; hoehen: (number | null)[] } {
  const laengen: number[] = [];
  const hoehen: (number | null)[] = [];
  const muster = /(\d+(?:[.,]\d+)?)(?:\s*\(\s*(?:h[öo]he\s*)?(\d+(?:[.,]\d+)?)\s*\))?/gi;
  let m: RegExpExecArray | null;
  while ((m = muster.exec(text)) !== null) {
    const l = dezimal(m[1]!);
    if (l === null) continue;
    laengen.push(l);
    hoehen.push(m[2] ? dezimal(m[2]) : null);
  }
  return { laengen, hoehen };
}

/** Dachschrägen "4,20 x 2,10, 3,50 x 1,80": Länge × Schrägenlänge je Schräge. */
function schraegenAus(text: string): { laengeM: number; schraegeM: number }[] {
  const ergebnis: { laengeM: number; schraegeM: number }[] = [];
  const muster = /(\d+(?:[.,]\d+)?)\s*(?:x|×|\*|mal)\s*(\d+(?:[.,]\d+)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = muster.exec(text)) !== null) {
    const laengeM = dezimal(m[1]!), schraegeM = dezimal(m[2]!);
    if (laengeM !== null && schraegeM !== null) ergebnis.push({ laengeM, schraegeM });
  }
  return ergebnis;
}

function oeffnungenAus(text: string): Oeffnung[] {
  const t = text.trim();
  if (!t || /^(keine|none|-|null)$/i.test(t)) return [];
  const ergebnis: Oeffnung[] = [];
  // Ein Eintrag = beliebiger Name + Breite (x|×|mal|*) Höhe; Trenner zwischen Einträgen: Komma oder Semikolon
  const muster = /([^\d,;]+?)\s*(\d+(?:[.,]\d+)?)\s*(?:x|×|\*|mal)\s*(\d+(?:[.,]\d+)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = muster.exec(t)) !== null) {
    const breiteM = dezimal(m[2]!), hoeheM = dezimal(m[3]!);
    if (breiteM === null || hoeheM === null) continue;
    const art = m[1]!.replace(/^[\s,;]+|[\s,;]+$/g, "").trim() || "Öffnung";
    ergebnis.push({ art, breiteM, hoeheM });
  }
  return ergebnis;
}

/** Zerlegt den Raumtext der KI in Raummaße. Unbrauchbare Zeilen werden übersprungen. */
export function parseRaeumeText(text: string | null | undefined): RaumMasse[] {
  if (!text?.trim()) return [];
  const raeume: RaumMasse[] = [];
  for (const zeile of text.split(/\r?\n/)) {
    if (!zeile.trim()) continue;
    const felder = new Map<string, string>();
    for (const teil of zeile.split(";")) {
      const i = teil.indexOf(":");
      if (i < 0) continue;
      felder.set(teil.slice(0, i).trim().toLowerCase(), teil.slice(i + 1).trim());
    }
    const name = felder.get("raum") ?? "";
    if (!name) continue;
    const hoeheRoh = felder.get("höhe") ?? felder.get("hoehe") ?? "";
    const hoehe = zahlenAus(hoeheRoh)[0] ?? null;
    const { laengen: wandlaengen, hoehen: wandhoehen } = waendeAus(felder.get("wände") ?? felder.get("waende") ?? "");
    const schraegen = schraegenAus(felder.get("schrägen") ?? felder.get("schraegen") ?? felder.get("schräge") ?? felder.get("schraege") ?? felder.get("dachschrägen") ?? "");
    // Decke: "ja"/"nein" oder direkt die Fläche ("Decke: 14,2"), z.B. bei Vielecken.
    const deckeRoh = felder.get("decke") ?? "";
    const deckeZahl = zahlenAus(deckeRoh)[0] ?? null;
    const decke = /^(ja|yes|true)/i.test(deckeRoh) || (deckeZahl !== null && !/^(nein|no|false)/i.test(deckeRoh));
    // Teiletappe 3: Paneelhöhe (Lambris, Fliesenspiegel) und Laibungstiefe, beide optional.
    const paneel = zahlenAus(felder.get("paneel") ?? felder.get("paneele") ?? felder.get("paneelhöhe") ?? felder.get("paneelhoehe") ?? "")[0] ?? null;
    const laibungRoh = zahlenAus(felder.get("laibung") ?? felder.get("laibungen") ?? felder.get("laibungstiefe") ?? "")[0] ?? null;
    // Laibungstiefe wird oft in Zentimetern gesagt ("25"): alles über 1 gilt als cm.
    const laibung = laibungRoh === null ? null : laibungRoh > 1 ? laibungRoh / 100 : laibungRoh;
    raeume.push({
      name,
      hoeheM: hoehe,
      wandlaengenM: wandlaengen,
      waendeStreichen: true,
      deckeStreichen: decke,
      oeffnungen: oeffnungenAus(felder.get("öffnungen") ?? felder.get("oeffnungen") ?? ""),
      paneelHoeheM: paneel,
      deckeM2Genannt: decke && deckeZahl !== null ? deckeZahl : null,
      laibungTiefeM: laibung,
      ...(wandhoehen.some((h) => h !== null) ? { wandHoehenM: wandhoehen } : {}),
      ...(schraegen.length ? { schraegen } : {}),
    });
  }
  return raeume;
}
