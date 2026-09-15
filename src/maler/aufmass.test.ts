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

  it("verwirft unbrauchbare oder zu große Öffnungen NICHT still, sondern mit Grund (Nach-Audit E-02/E-13)", () => {
    const a = berechneRaum({
      ...schlafzimmer,
      wandlaengenM: [1, 1],
      oeffnungen: [
        { art: "Fenster", breiteM: 0, hoeheM: 1 }, // Maß unplausibel
        { art: "Tor", breiteM: 4, hoeheM: 3 }, // breiter als die Wand UND höher als der Raum
        { art: "Fenstertür", breiteM: 17, hoeheM: 2.2 }, // Hörfehler 1,70 → 17,0
      ],
    });
    if ("grund" in a) throw new Error(a.grund);
    expect(a.oeffnungen).toHaveLength(0);
    expect(a.wandNettoM2).toBe(10.2); // 4 × 2,55: nichts abgezogen, aber ausgewiesen
    expect(a.verworfen).toEqual([
      "Fenster 0 × 1 m: Maß unplausibel",
      "Tor 4 × 3 m: höher als der Raum (2,55 m)",
      "Fenstertür 17 × 2,2 m: Maß unplausibel",
    ]);
    expect(a.erklaerung).toContain("NICHT berücksichtigt: Fenster 0 × 1 m: Maß unplausibel; Tor 4 × 3 m");
    expect(a.erklaerung).not.toContain("keine Öffnungen erfasst");
    const e = berechneAufmass([{ ...schlafzimmer, oeffnungen: [{ art: "Fenstertür", breiteM: 17, hoeheM: 2.2 }] }]);
    expect(e.rueckfragen[0]).toBe("Schlafzimmer: Fenstertür 17 × 2,2 m: Maß unplausibel. Diese Öffnung wurde NICHT abgezogen, bitte das Maß prüfen.");
    expect(aufmassKurz(e)).toEqual([
      "Schlafzimmer (3,84 × 3,99 m, Höhe 2,55 m): Wände 39,93 m², Decke 15,32 m²",
      "⚠️ Schlafzimmer: Fenstertür 17 × 2,2 m: Maß unplausibel, nicht abgezogen",
    ]);
  });

  it("warnt bei Hörfehler-verdächtigen Maßen (4,49 → 44,9) statt still zu rechnen (Nach-Audit E-03)", () => {
    const e = berechneAufmass([{ ...schlafzimmer, wandlaengenM: [44.9, 4.36], hoeheM: 2.52, oeffnungen: [] }]);
    const [r] = e.raeume;
    expect(r!.wandBruttoM2).toBe(248.27);
    expect(r!.warnungen).toEqual([
      "Wandlänge 44,9 m ist ungewöhnlich groß, bitte prüfen (Hörfehler?)",
      "Wandfläche 248,27 m² ist ungewöhnlich groß für einen Raum, bitte Maße prüfen",
    ]);
    expect(e.rueckfragen).toHaveLength(2);
    expect(aufmassKurz(e)[0]).toBe("Schlafzimmer (44,9 × 4,36 m, Höhe 2,52 m): Wände 248,27 m², Decke 195,76 m²");
    expect(aufmassKurz(e)[1]).toContain("⚠️ Schlafzimmer: Wandlänge 44,9 m");
  });

  it("Erklärtext ist lesbar, deutsch formatiert und ohne Gedankenstriche", () => {
    const a = berechneRaum(schlafzimmer);
    if ("grund" in a) throw new Error(a.grund);
    expect(a.erklaerung).toBe(
      "Schlafzimmer (Höhe 2,55 m, 3,84 × 3,99 m): Wandfläche brutto 39,93 m²; " +
        "1 Öffnung über 2,5 m² abgezogen (Fenstertür 1,69 × 2,22 m = 3,75 m²); " +
        "2 Öffnungen bis 2,5 m² übermessen (Tür 0,82 × 1,98 m; Fenster 0,69 × 0,74 m); " +
        "Laibungen der abgezogenen Öffnungen nicht enthalten (Tiefe nicht genannt); " +
        "Wandfläche netto 36,18 m²; Decke 15,32 m².",
    );
    expect(a.erklaerung).not.toMatch(/[—–]/);
  });

  // ── Teiletappe 3: halbhohe Flächen, Laibungen, genannte Decke ──
  it("Paneele: gestrichen wird nur oberhalb, Türen zählen nur mit ihrem Teil darüber", () => {
    // Kinderzimmer aus dem Live-Test: 4,32 × 3,98, Höhe 2,55, Holzpaneele bis 1,10 m
    const a = berechneRaum({
      name: "Kinderzimmer",
      hoeheM: 2.55,
      wandlaengenM: [4.32, 3.98],
      waendeStreichen: true,
      deckeStreichen: false,
      paneelHoeheM: 1.1,
      oeffnungen: [
        { art: "Fenstertür", breiteM: 1.7, hoeheM: 2.3 }, // voll 3,91 m², über den Paneelen 1,7 × 1,2 = 2,04 → übermessen
        { art: "Fenster", breiteM: 1.0, hoeheM: 1.2 }, // sitzt über den Paneelen: bleibt 1,2 m²
        { art: "Durchgang", breiteM: 2.0, hoeheM: 2.4 }, // über den Paneelen 2,0 × 1,3 = 2,6 → abgezogen
      ],
    });
    if ("grund" in a) throw new Error(a.grund);
    expect(a.streichHoeheM).toBe(1.45);
    expect(a.wandBruttoM2).toBe(24.07); // 16,6 × 1,45
    expect(a.oeffnungen.map((o) => o.wirksamM2)).toEqual([2.04, 1.2, 2.6]);
    expect(a.oeffnungen.map((o) => o.abgezogen)).toEqual([false, false, true]);
    expect(a.abzugM2).toBe(2.6);
    expect(a.wandNettoM2).toBe(21.47);
    expect(a.erklaerung).toContain("gestrichen wird nur oberhalb der Paneele ab 1,1 m");
    expect(a.erklaerung).toContain("Durchgang 2 × 2,4 m = 2,60 m² über den Paneelen");
    expect(aufmassKurz({ raeume: [a], uebersprungen: [], rueckfragen: [] })[0]).toContain("(nur oberhalb der Paneele ab 1,1 m)");
  });

  it("Paneelhöhe muss unter der Raumhöhe liegen", () => {
    expect(berechneRaum({ ...schlafzimmer, paneelHoeheM: 2.5 })).toEqual({ grund: "Paneelhöhe unplausibel" });
  });

  it("Laibungen: bei abgezogenen Öffnungen und genannter Tiefe hinzugerechnet (Fenster mit Sturz, Tür ohne Boden)", () => {
    const a = berechneRaum({
      ...schlafzimmer,
      laibungTiefeM: 0.25,
      oeffnungen: [
        { art: "Fenster", breiteM: 2.0, hoeheM: 1.5 }, // 3,0 m² abgezogen; Laibung (2×1,5 + 2,0) × 0,25 = 1,25
        { art: "Tür", breiteM: 1.4, hoeheM: 2.1 }, // 2,94 m² abgezogen; Laibung (2×2,1) × 0,25 = 1,05
        { art: "Fenster", breiteM: 0.8, hoeheM: 1.0 }, // übermessen, keine Laibung
      ],
    });
    if ("grund" in a) throw new Error(a.grund);
    expect(a.oeffnungen.map((o) => o.laibungM2)).toEqual([1.25, 1.05, 0]);
    expect(a.laibungM2).toBe(2.3);
    expect(a.wandNettoM2).toBe(39.93 - 5.94 + 2.3);
    expect(a.erklaerung).toContain("Laibungen 2,30 m² (Tiefe 0,25 m) hinzugerechnet");
    expect(a.erklaerung).not.toContain("nicht enthalten");
  });

  it("Dachschrägen: Kniestock-Wände mit eigener Höhe, Schrägen als Wandfläche dazu", () => {
    // Dachzimmer: 4,20 × 3,50, Firsthöhe 2,50, an den Längsseiten Kniestock 1,20, darüber je eine Schräge 4,20 × 2,10
    const a = berechneRaum({
      name: "Dachzimmer",
      hoeheM: 2.5,
      wandlaengenM: [4.2, 3.5, 4.2, 3.5],
      wandHoehenM: [1.2, null, 1.2, null],
      schraegen: [{ laengeM: 4.2, schraegeM: 2.1 }, { laengeM: 4.2, schraegeM: 2.1 }],
      waendeStreichen: true,
      deckeStreichen: true,
      deckeM2Genannt: 5.9,
      oeffnungen: [{ art: "Dachfenster", breiteM: 0.78, hoeheM: 1.18 }],
    });
    if ("grund" in a) throw new Error(a.grund);
    expect(a.rechteck).toBe(false);
    expect(a.schraegenM2).toBe(17.64);
    // Wände: 2 × 4,2 × 1,2 = 10,08 + 2 × 3,5 × 2,5 = 17,5 → 27,58 + Schrägen 17,64 = 45,22
    expect(a.wandBruttoM2).toBe(45.22);
    expect(a.abzugM2).toBe(0); // Dachfenster 0,92 m² übermessen
    expect(a.wandNettoM2).toBe(45.22);
    expect(a.deckeM2).toBe(5.9);
    expect(a.erklaerung).toContain("Wände 4,2 (Höhe 1,2) + 3,5 + 4,2 (Höhe 1,2) + 3,5 m");
    expect(a.erklaerung).toContain("davon Dachschrägen 17,64 m²: 4,2 × 2,1 m, 4,2 × 2,1 m");
    expect(aufmassKurz({ raeume: [a], uebersprungen: [], rueckfragen: [] })[0]).toContain("(davon 17,64 m² Dachschrägen)");
  });

  it("Dachschrägen: Paneele wirken je Wand, unplausible Höhen werden abgewiesen", () => {
    const a = berechneRaum({ ...schlafzimmer, wandlaengenM: [4, 3, 4, 3], wandHoehenM: [1.5, null, 1.5, null], paneelHoeheM: 1.0, oeffnungen: [] });
    if ("grund" in a) throw new Error(a.grund);
    // 2 × 4 × 0,5 + 2 × 3 × 1,55 = 4 + 9,3
    expect(a.wandBruttoM2).toBe(13.3);
    expect(berechneRaum({ ...schlafzimmer, wandlaengenM: [4, 3], wandHoehenM: [3.0, null] })).toEqual({ grund: "Wandhöhe unplausibel (über Raumhöhe oder unter 0,3 m)" });
    expect(berechneRaum({ ...schlafzimmer, schraegen: [{ laengeM: 4, schraegeM: 40 }] })).toEqual({ grund: "unplausible Dachschräge" });
  });

  it("führt doppelt genannte Felder zusammen (Schrägen zweimal, Kostenprobe 15.09.2026)", () => {
    const [r] = parseRaeumeText("Raum: Dachzimmer; Höhe: 2,40; Wände: 4,20 (1,20), 3,50, 4,20 (1,20), 3,50; Decke: 5,9; Öffnungen: Dachfenster 0,80 x 1,20; Schrägen: 4,20 x 2,10; Schrägen: 4,20 x 2,10");
    expect(r!.schraegen?.length).toBe(2);
    expect(berechneAufmass([r!]).raeume[0]!.schraegenM2).toBe(17.64);
  });

  it("Decke: Grundmaß 'a x b', wenn nicht alle Wände gestrichen werden (Arbeitszimmer 13.09.2026)", () => {
    const [r] = parseRaeumeText("Raum: Arbeitszimmer; Höhe: 2,55; Wände: 3,98, 3,50, 3,98; Decke: 3,98 x 3,50; Öffnungen: Tür 0,85 x 2,00, Fenster 1,10 x 1,20");
    expect(r!.deckeStreichen).toBe(true);
    expect(r!.deckeM2Genannt).toBe(13.93);
    const a = berechneAufmass([r!]);
    expect(a.raeume[0]!.rechteck).toBe(false);
    expect(a.raeume[0]!.wandBruttoM2).toBe(29.22);
    expect(a.raeume[0]!.deckeM2).toBe(13.93);
  });

  it("Decke: direkt genannte Fläche gilt auch für Vielecke", () => {
    const a = berechneRaum({ name: "Flur", hoeheM: 2.5, wandlaengenM: [4.5, 2.0, 1.5, 1.0, 3.0], waendeStreichen: true, deckeStreichen: true, oeffnungen: [], deckeM2Genannt: 7.4 });
    if ("grund" in a) throw new Error(a.grund);
    expect(a.deckeM2).toBe(7.4);
    expect(a.erklaerung).toContain("Decke 7,40 m² (wie genannt)");
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
    // Schlafzimmer: Laibungsfrage zur abgezogenen Fenstertür; Küche: Grauzone
    expect(e.rueckfragen).toHaveLength(2);
    expect(e.rueckfragen[0]).toContain("Schlafzimmer: Sollen die Laibungen der abgezogenen Öffnungen mitgestrichen werden?");
    expect(e.rueckfragen[1]).toContain("Küche: Fenster 1,4 × 1,7 m hat 2,38 m²");
    expect(aufmassText(e)).toContain("Bad: nicht berechnet (Raumhöhe fehlt oder unplausibel).");
    expect(aufmassKurz(e)[0]).toBe("Schlafzimmer (3,84 × 3,99 m, Höhe 2,55 m): Wände 36,18 m², (3,75 m² Öffnungen abgezogen), Decke 15,32 m²");
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

  it("hält zwei gleichnamige Räume auseinander (Kinderzimmer / Kinderzimmer 2)", () => {
    const k1 = { ...schlafzimmer, name: "Kinderzimmer" };
    const k2 = { ...schlafzimmer, name: "Kinderzimmer 2", oeffnungen: [], deckeStreichen: false };
    const zwei = berechneAufmass([k1, k2]);
    const [p1, p2, p3] = wendeAufmassAn(
      [
        pos({ flaechenArt: "WAND", raumBezug: "Kinderzimmer" }),
        pos({ flaechenArt: "WAND", raumBezug: "Kinderzimmer 2" }),
        pos({ flaechenArt: "WAND", raumBezug: "Kinderzim" }), // unscharf, aber zweideutig → offen lassen
      ],
      zwei,
    );
    expect(p1.menge).toBe(36.18);
    expect(p2.menge).toBe(39.93);
    expect(p3.menge).toBeNull();
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
      paneelHoeheM: null,
      deckeM2Genannt: null,
      laibungTiefeM: null,
    });
  });

  it("liest Wandhöhen in Klammern und Dachschrägen", () => {
    const [r] = parseRaeumeText("Raum: Dachzimmer; Höhe: 2,50; Wände: 4,20 (1,20), 3,50, 4,20 (Höhe 1,20), 3,50; Schrägen: 4,20 x 2,10, 4,20 x 2,10; Decke: 5,9; Öffnungen: Dachfenster 0,78 x 1,18");
    expect(r).toMatchObject({
      wandlaengenM: [4.2, 3.5, 4.2, 3.5],
      wandHoehenM: [1.2, null, 1.2, null],
      schraegen: [{ laengeM: 4.2, schraegeM: 2.1 }, { laengeM: 4.2, schraegeM: 2.1 }],
      deckeM2Genannt: 5.9,
      oeffnungen: [{ art: "Dachfenster", breiteM: 0.78, hoeheM: 1.18 }],
    });
    const [s] = parseRaeumeText("Raum: Küche; Höhe: 2,5; Wände: 3 x 4; Decke: ja; Öffnungen: keine");
    expect(s).not.toHaveProperty("wandHoehenM");
    expect(s).not.toHaveProperty("schraegen");
  });

  it("liest Paneelhöhe, Laibungstiefe (auch in cm) und direkt genannte Deckenfläche", () => {
    const [r] = parseRaeumeText("Raum: Bad; Höhe: 2,40; Wände: 2,10 x 1,80; Decke: 3,8; Öffnungen: Tür 0,76 x 2,00; Paneel: 1,20; Laibung: 25");
    expect(r).toMatchObject({ paneelHoeheM: 1.2, laibungTiefeM: 0.25, deckeStreichen: true, deckeM2Genannt: 3.8 });
    const [s] = parseRaeumeText("Raum: Küche; Höhe: 2,5; Wände: 3 x 4; Decke: nein; Öffnungen: keine; Paneelhöhe: 0,90; Laibungstiefe: 0,3");
    expect(s).toMatchObject({ paneelHoeheM: 0.9, laibungTiefeM: 0.3, deckeStreichen: false, deckeM2Genannt: null });
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

  it("frisst sich nicht an langen Leerzeichenläufen fest (Nach-Audit E-01, vorher 7 s bei 3.000 Leerzeichen)", () => {
    const start = performance.now();
    const rs = parseRaeumeText(`Raum: X; Höhe: 2,5; Wände: 3 x 4; Öffnungen: Fenster${" ".repeat(5000)}1, Tür 0,8 x 2`);
    expect(performance.now() - start).toBeLessThan(200);
    expect(rs[0]!.oeffnungen).toEqual([{ art: "Tür", breiteM: 0.8, hoeheM: 2 }]);
    // Länge wird gekappt: 32.000 Zeichen Raumtext → höchstens 20.000 werden gelesen, nichts explodiert.
    expect(parseRaeumeText("Raum: A; Höhe: 2,5; Wände: 3 x 4\n".repeat(1000)).length).toBeLessThan(1000);
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
