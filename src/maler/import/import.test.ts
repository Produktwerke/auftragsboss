import { describe, it, expect } from "vitest";
import { parseAngebotstext } from "./parser.js";
import { ordneTypZu } from "./typzuordnung.js";
import { erkenneFormat, ImportFormatFehler } from "./extraktion.js";

const GOLD = `Angebot Nr. 2026-041
Datum: 12.03.2026
Kunde: Familie Muster
Objekt: Wohnzimmer, Renovierung

Pos  Bezeichnung                  Menge  Einheit  Einzelpreis  Gesamtpreis
1    Wände und Decken grundieren  80,00  m²       3,50 €       280,00 €
2    Wände streichen 2x weiß      60,00  m²       12,00 €      720,00 €
3    Türen lackieren              3      Stk      85,00 €      255,00 €
4    Baustelle einrichten         1      pauschal 90,00 €      90,00 €

Zwischensumme netto                                           1.345,00 €
MwSt. 19 %                                                      255,55 €
Gesamtbetrag                                                   1.600,55 €`;

describe("parseAngebotstext — Kopfdaten", () => {
  const { kopf } = parseAngebotstext(GOLD);

  it("liest die Angebotsnummer", () => {
    expect(kopf.angebotsnummer).toBe("2026-041");
  });
  it("liest das Datum", () => {
    expect(kopf.dokumentDatum?.getFullYear()).toBe(2026);
    expect(kopf.dokumentDatum?.getMonth()).toBe(2); // März = Index 2
    expect(kopf.dokumentDatum?.getDate()).toBe(12);
  });
  it("liest Netto, MwSt-Satz/-Summe und Brutto", () => {
    expect(kopf.nettoSumme).toBe(1345.0);
    expect(kopf.mwstSatz).toBe(19);
    expect(kopf.mwstSumme).toBe(255.55);
    expect(kopf.bruttoSumme).toBe(1600.55);
  });
});

describe("parseAngebotstext — Positionen", () => {
  const { positionen, warnungen } = parseAngebotstext(GOLD);

  it("erkennt genau die 4 Leistungszeilen (keine Kopf-/Summenzeilen)", () => {
    expect(positionen).toHaveLength(4);
  });

  it("zerlegt eine vollständige Zeile korrekt und rechnerisch stimmig (high)", () => {
    const p = positionen[0];
    expect(p.originalNummer).toBe("1");
    expect(p.originalTitel).toBe("Wände und Decken grundieren");
    expect(p.menge).toBe(80);
    expect(p.einheit).toBe("m2"); // kanonisch (Pipeline-Schreibweise), nicht "m²"
    expect(p.einzelpreis).toBe(3.5);
    expect(p.gesamtpreis).toBe(280);
    expect(p.konfidenz).toBe("high");
  });

  it("behandelt Stück- und Pauschalzeilen", () => {
    const tueren = positionen[2];
    expect(tueren.einheit).toBe("Stk");
    expect(tueren.menge).toBe(3);
    expect(tueren.gesamtpreis).toBe(255);

    const baustelle = positionen[3];
    expect(baustelle.einheit).toBe("pauschal");
    expect(baustelle.gesamtpreis).toBe(90);
  });

  it("erfindet nichts: Summe der Positionen deckt sich mit dem Netto (keine Warnung)", () => {
    const summe = positionen.reduce((s, p) => s + (p.gesamtpreis ?? 0), 0);
    expect(summe).toBe(1345);
    expect(warnungen).toHaveLength(0);
  });
});

describe("parseAngebotstext — Robustheit", () => {
  it("warnt, wenn keine Positionen erkennbar sind", () => {
    const { positionen, warnungen } = parseAngebotstext("Sehr geehrte Damen und Herren,\nvielen Dank für Ihre Anfrage.");
    expect(positionen).toHaveLength(0);
    expect(warnungen.length).toBeGreaterThan(0);
  });

  it("lässt unsichere Felder null statt zu raten", () => {
    const { positionen } = parseAngebotstext("Malerarbeiten nach Aufwand 250,00 €");
    expect(positionen).toHaveLength(1);
    expect(positionen[0].menge).toBeNull();
    expect(positionen[0].einheit).toBeNull();
    expect(positionen[0].gesamtpreis).toBe(250);
  });
});

describe("ordneTypZu — konservatives Mapping auf die Wissensbasis", () => {
  it("ordnet klare Titel den richtigen Positionstypen zu", () => {
    expect(ordneTypZu("Wände streichen 2x weiß")).toBe("wand_beschichten");
    expect(ordneTypZu("Decke streichen")).toBe("decke_beschichten");
    expect(ordneTypZu("Türen lackieren")).toBe("tueren_lackieren");
    expect(ordneTypZu("Grundierung auftragen")).toBe("grundieren");
    expect(ordneTypZu("Alte Tapete entfernen")).toBe("tapete_entfernen");
  });

  it("gibt null bei zu vagen Titeln zurück (lieber unbekannt als falsch)", () => {
    expect(ordneTypZu("Diverse Arbeiten")).toBeNull();
    expect(ordneTypZu("Sonstiges")).toBeNull();
    expect(ordneTypZu("")).toBeNull();
  });
});

describe("erkenneFormat", () => {
  it("erkennt PDF und DOCX über die Endung", () => {
    expect(erkenneFormat("angebot.pdf")).toBe("pdf");
    expect(erkenneFormat("Angebot 2026.DOCX")).toBe("docx");
  });
  it("wirft bei unbekanntem Format", () => {
    expect(() => erkenneFormat("bild.jpg")).toThrow(ImportFormatFehler);
  });
});
