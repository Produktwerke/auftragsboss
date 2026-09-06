import { describe, expect, it } from "vitest";
import { aufmassKurz, aufmassText, berechneAufmass, berechneRaum, parseRaeumeText, wendeAufmassAn, type RaumMasse } from "./aufmass.js";

const schlafzimmer: RaumMasse = {
  name: "Schlafzimmer",
  hoeheM: 2.55,
  wandlaengenM: [3.84, 3.99],
  waendeStreichen: true,
  deckeStreichen: true,
  oeffnungen: [
    { art: "Tür", breiteM: 0.82, hoeheM: 1.975 },
    { art: "Fenster", breiteM: 0.69, hoeheM: 0.74 },
    { art: "Fenstertür", breiteM: 1.69, hoeheM: 2.22 },
  ],
};

describe("berechneRaum", () => {
  it("rechnet Rechteckraum VOB-gerecht: kleine Öffnungen übermessen, große abziehen", () => {
    const a = berechneRaum(schlafzimmer);
    if ("grund" in a) throw new Error(a.grund);
    expect(a.rechteck).toBe(true);
    expect(a.umfangM).toBe(15.66);
    expect(a.wandBruttoM2).toBe(39.93); // 15,66 × 2,55
    expect(a.abzugM2).toBe(3.75); // nur die Fenstertür (1,69 × 2,22)
    expect(a.wandNettoM2).toBe(36.18);
    expect(a.deckeM2).toBe(15.32); // 3,84 × 3,99
    expect(a.oeffnungen.map((o) => o.abgezogen)).toEqual([false, false, true]);
  });

  it("genau 2,5 m² wird noch übermessen, knapp darüber abgezogen", () => {
    const grenze = berechneRaum({ ...schlafzimmer, oeffnungen: [{ art: "Fenster", breiteM: 2.5, hoeheM: 1.0 }] });
    const drueber = berechneRaum({ ...schlafzimmer, oeffnungen: [{ art: "Fenster", breiteM: 2.51, hoeheM: 1.0 }] });
    if ("grund" in grenze || "grund" in drueber) throw new Error("unerwartet");
    expect(grenze.abzugM2).toBe(0);
    expect(drueber.abzugM2).toBe(2.51);
  });

  it("Vieleck: Wandlängen werden summiert, Decke bleibt ohne Grundfläche", () => {
    const a = berechneRaum({
      name: "Flur",
      hoeheM: 2.52,
      wandlaengenM: [4.49, 4.36, 4.49, 1.97, 2.51],
      waendeStreichen: true,
      deckeStreichen: true,
      oeffnungen: [],
    });
    if ("grund" in a) throw new Error(a.grund);
    expect(a.rechteck).toBe(false);
    expect(a.umfangM).toBe(17.82);
    expect(a.wandBruttoM2).toBe(44.91);
    expect(a.deckeM2).toBeNull();
    expect(a.erklaerung).toContain("keine Öffnungen erfasst");
    expect(a.erklaerung).toContain("nicht berechenbar");
  });

  it("weist unplausible Angaben ab statt Unsinn zu rechnen", () => {
    expect(berechneRaum({ ...schlafzimmer, hoeheM: null })).toEqual({ grund: "Raumhöhe fehlt oder unplausibel" });
    expect(berechneRaum({ ...schlafzimmer, hoeheM: 25 })).toEqual({ grund: "Raumhöhe fehlt oder unplausibel" });
    expect(berechneRaum({ ...schlafzimmer, wandlaengenM: [] })).toEqual({ grund: "keine Wandlängen genannt" });
    expect(berechneRaum({ ...schlafzimmer, wandlaengenM: [3.84, Number.NaN] })).toEqual({ grund: "unplausible Wandlänge" });
  });

  it("ignoriert unbrauchbare Öffnungsmaße und lässt die Fläche nie negativ werden", () => {
    const a = berechneRaum({
      ...schlafzimmer,
      wandlaengenM: [1, 1],
      oeffnungen: [
        { art: "Fenster", breiteM: 0, hoeheM: 1 },
        { art: "Tor", breiteM: 4, hoeheM: 3 },
      ],
    });
    if ("grund" in a) throw new Error(a.grund);
    expect(a.oeffnungen).toHaveLength(1);
    expect(a.wandNettoM2).toBe(0);
  });

  it("Erklärtext ist lesbar, deutsch formatiert und ohne Gedankenstriche", () => {
    const a = berechneRaum(schlafzimmer);
    if ("grund" in a) throw new Error(a.grund);
    expect(a.erklaerung).toBe(
      "Schlafzimmer (Höhe 2,55 m, 3,84 × 3,99 m): Wandfläche brutto 39,93 m²; " +
        "1 Öffnung über 2,5 m² abgezogen (Fenstertür 1,69 × 2,22 m = 3,75 m²); " +
        "2 Öffnungen bis 2,5 m² übermessen (Tür 0,82 × 1,98 m; Fenster 0,69 × 0,74 m); " +
        "Wandfläche netto 36,18 m²; Decke 15,32 m².",
    );
    expect(a.erklaerung).not.toMatch(/[—–]/);
  });
});

describe("berechneAufmass", () => {
  it("sammelt Räume, übersprungene Räume und Grauzonen-Rückfragen", () => {
    const e = berechneAufmass([
      schlafzimmer,
      { ...schlafzimmer, name: "Bad", hoeheM: null },
      { ...schlafzimmer, name: "Küche", oeffnungen: [{ art: "Fenster", breiteM: 1.4, hoeheM: 1.7 }] },
    ]);
    expect(e.raeume.map((r) => r.name)).toEqual(["Schlafzimmer", "Küche"]);
    expect(e.uebersprungen).toEqual([{ name: "Bad", grund: "Raumhöhe fehlt oder unplausibel" }]);
    expect(e.rueckfragen).toHaveLength(1);
    expect(e.rueckfragen[0]).toContain("Küche: Fenster 1,4 × 1,7 m hat 2,38 m²");
    expect(aufmassText(e)).toContain("Bad: nicht berechnet (Raumhöhe fehlt oder unplausibel).");
    expect(aufmassKurz(e)[0]).toBe("Schlafzimmer: Wände 36,18 m², (3,75 m² Öffnungen abgezogen), Decke 15,32 m²");
  });
});

describe("wendeAufmassAn", () => {
  const e = berechneAufmass([schlafzimmer, { ...schlafzimmer, name: "Küche", deckeStreichen: false, oeffnungen: [] }]);
  const pos = (p: Partial<Parameters<typeof wendeAufmassAn>[0][number]>) => ({
    beschreibung: "Wände streichen",
    menge: null,
    einheit: "pauschal" as string | null,
    mengeUnsicher: true,
    ...p,
  });

  it("trägt die Netto-Wandfläche des genannten Raums ein und markiert die Herkunft", () => {
    const [p] = wendeAufmassAn([pos({ flaechenArt: "WAND", raumBezug: "schlafzimmer" })], e);
    expect(p).toMatchObject({ menge: 36.18, einheit: "m2", mengeUnsicher: false, mengeQuelle: "AUFMASS" });
  });

  it("findet Räume auch bei Teilübereinstimmung des Namens", () => {
    const [p] = wendeAufmassAn([pos({ flaechenArt: "DECKE", raumBezug: "Schlafzimmer OG" })], e);
    expect(p.menge).toBe(15.32);
  });

  it("summiert raumübergreifende Positionen über alle Räume", () => {
    const [p] = wendeAufmassAn([pos({ flaechenArt: "WAND", raumBezug: null })], e);
    expect(p.menge).toBe(36.18 + 39.93); // Küche ohne Öffnungen: brutto = netto
  });

  it("lässt Positionen ohne Flächenbezug oder ohne Raumtreffer unangetastet", () => {
    const unveraendert = [pos({}), pos({ flaechenArt: "WAND", raumBezug: "Garage" }), pos({ flaechenArt: "DECKE", raumBezug: "Küche" })];
    expect(wendeAufmassAn(unveraendert, e)).toEqual(unveraendert); // Küche: Decke nicht gestrichen → null → unverändert
  });

  it("tut nichts, wenn kein Raum berechenbar war", () => {
    const leer = berechneAufmass([{ ...schlafzimmer, hoeheM: null }]);
    const p = pos({ flaechenArt: "WAND", raumBezug: "Schlafzimmer" });
    expect(wendeAufmassAn([p], leer)).toEqual([p]);
  });
});

describe("parseRaeumeText", () => {
  it("liest das vorgegebene Zeilenformat inklusive Öffnungen", () => {
    const [r] = parseRaeumeText(
      "Raum: Wohnzimmer; Höhe: 2,52; Wände: 4,49 x 4,36; Decke: ja; Öffnungen: Fenstertür 1,70 x 2,20, Fenster 1,10 x 1,20, Zimmertür 0,82 x 1,98",
    );
    expect(r).toEqual({
      name: "Wohnzimmer",
      hoeheM: 2.52,
      wandlaengenM: [4.49, 4.36],
      waendeStreichen: true,
      deckeStreichen: true,
      oeffnungen: [
        { art: "Fenstertür", breiteM: 1.7, hoeheM: 2.2 },
        { art: "Fenster", breiteM: 1.1, hoeheM: 1.2 },
        { art: "Zimmertür", breiteM: 0.82, hoeheM: 1.98 },
      ],
    });
  });

  it("versteht Vielecke, 'mal', Punkt-Dezimale, 'keine' und mehrere Zeilen", () => {
    const rs = parseRaeumeText(
      "Raum: Küche; Höhe: 2.49; Wände: 10,38, 3,20 und 5,10; Decke: nein; Öffnungen: keine\n" +
        "Raum: Flur; Höhe: 2,50; Wände: 4,50 mal 2,00; Decke: ja; Öffnungen: Tür 0,86 × 2,00",
    );
    expect(rs).toHaveLength(2);
    expect(rs[0]).toMatchObject({ name: "Küche", hoeheM: 2.49, wandlaengenM: [10.38, 3.2, 5.1], deckeStreichen: false, oeffnungen: [] });
    expect(rs[1]).toMatchObject({ name: "Flur", wandlaengenM: [4.5, 2.0], oeffnungen: [{ art: "Tür", breiteM: 0.86, hoeheM: 2.0 }] });
  });

  it("wirft Unbrauchbares weg statt zu raten", () => {
    expect(parseRaeumeText(null)).toEqual([]);
    expect(parseRaeumeText("   ")).toEqual([]);
    expect(parseRaeumeText("Höhe: 2,5; Wände: 3 x 4")).toEqual([]); // kein Raumname
    const [r] = parseRaeumeText("Raum: Bad; Höhe: ; Wände: ; Decke: ja; Öffnungen: Fenster ohne Maß");
    expect(r).toMatchObject({ name: "Bad", hoeheM: null, wandlaengenM: [], oeffnungen: [] });
    expect("grund" in berechneRaum(r!)).toBe(true);
  });
});
