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
}

export interface OeffnungBewertet extends Oeffnung {
  flaecheM2: number;
  abgezogen: boolean;
  grauzone: boolean;
}

export interface RaumAufmass {
  name: string;
  hoeheM: number;
  umfangM: number;
  /** true, wenn genau zwei Wandlängen genannt wurden (a × b). */
  rechteck: boolean;
  wandBruttoM2: number;
  abzugM2: number;
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

/** Rechnet einen Raum. Wirft nicht: Unbrauchbare Angaben liefern null. */
export function berechneRaum(raum: RaumMasse): RaumAufmass | { grund: string } {
  const name = raum.name.trim() || "Raum";
  if (!istMass(raum.hoeheM, 1.5, 8)) return { grund: "Raumhöhe fehlt oder unplausibel" };
  const laengen = (raum.wandlaengenM ?? []).filter((l) => istMass(l, 0.1, 60));
  if (laengen.length === 0) return { grund: "keine Wandlängen genannt" };
  if (laengen.length !== (raum.wandlaengenM ?? []).length) return { grund: "unplausible Wandlänge" };

  const rechteck = laengen.length === 2;
  const umfangM = rechteck ? 2 * (laengen[0]! + laengen[1]!) : laengen.reduce((s, l) => s + l, 0);
  const wandBruttoM2 = rund2(umfangM * raum.hoeheM);

  const oeffnungen: OeffnungBewertet[] = (raum.oeffnungen ?? [])
    .filter((o) => istMass(o.breiteM, 0.1, 10) && istMass(o.hoeheM, 0.1, 10))
    .map((o) => {
      const flaecheM2 = rund2(o.breiteM * o.hoeheM);
      return {
        ...o,
        flaecheM2,
        abgezogen: flaecheM2 > VOB_ABZUGSGRENZE_M2,
        grauzone: flaecheM2 >= GRAUZONE_M2[0] && flaecheM2 <= GRAUZONE_M2[1],
      };
    });

  const abzugM2 = rund2(oeffnungen.filter((o) => o.abgezogen).reduce((s, o) => s + o.flaecheM2, 0));
  const wandNettoM2 = rund2(Math.max(0, wandBruttoM2 - abzugM2));
  const deckeM2 = raum.deckeStreichen && rechteck ? rund2(laengen[0]! * laengen[1]!) : null;

  const abgezogen = oeffnungen.filter((o) => o.abgezogen);
  const uebermessen = oeffnungen.filter((o) => !o.abgezogen);
  const beschreibe = (o: OeffnungBewertet) => `${o.art} ${masz(o.breiteM)} × ${masz(o.hoeheM)} m`;
  const teile: string[] = [];
  const masse = rechteck ? `${masz(laengen[0]!)} × ${masz(laengen[1]!)} m` : `Wände ${laengen.map(masz).join(" + ")} m`;
  teile.push(`${name} (Höhe ${masz(raum.hoeheM)} m, ${masse})`);
  if (raum.waendeStreichen) {
    teile.push(`Wandfläche brutto ${zahl(wandBruttoM2)} m²`);
    if (abgezogen.length) {
      teile.push(
        `${abgezogen.length} Öffnung${abgezogen.length > 1 ? "en" : ""} über 2,5 m² abgezogen (${abgezogen
          .map((o) => `${beschreibe(o)} = ${zahl(o.flaecheM2)} m²`)
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
    teile.push(`Wandfläche netto ${zahl(wandNettoM2)} m²`);
  }
  if (raum.deckeStreichen) {
    teile.push(deckeM2 !== null ? `Decke ${zahl(deckeM2)} m²` : "Decke: Grundfläche nicht berechenbar (kein Rechteck)");
  }

  return {
    name,
    hoeheM: raum.hoeheM,
    umfangM: rund2(umfangM),
    rechteck,
    wandBruttoM2,
    abzugM2,
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
          `${a.name}: ${o.art} ${masz(o.breiteM)} × ${masz(o.hoeheM)} m hat ${zahl(o.flaecheM2)} m² und liegt nahe der ` +
            `VOB-Grenze von 2,5 m². Bitte das Maß prüfen, es entscheidet über Abzug oder Übermessen.`,
        );
      }
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
    teile.push(`Wände ${zahl(r.wandNettoM2)} m²`);
    if (r.abzugM2 > 0) teile.push(`(${zahl(r.abzugM2)} m² Öffnungen abgezogen)`);
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
    const wandlaengen = zahlenAus(felder.get("wände") ?? felder.get("waende") ?? "");
    const decke = /^(ja|yes|true)/i.test(felder.get("decke") ?? "");
    raeume.push({
      name,
      hoeheM: hoehe,
      wandlaengenM: wandlaengen,
      waendeStreichen: true,
      deckeStreichen: decke,
      oeffnungen: oeffnungenAus(felder.get("öffnungen") ?? felder.get("oeffnungen") ?? ""),
    });
  }
  return raeume;
}
