import { describe, it, expect } from "vitest";
import { baueZusammenfassung, istAbschluss } from "./dialog.js";
import type { DokumentDaten } from "./ai/structure.js";

const daten = {
  kunde: { name: "Familie Bär", strasse: "Bergstraße 12", plzOrt: null },
  objekt: "Wohnzimmer, ca. 45 m²",
  positionen: [
    { kategorie: "LEISTUNG", beschreibung: "Wände streichen", menge: 1, einheit: "pauschal", einzelpreis: null, preisquelle: "UNBEKANNT", vorschlag: false, mengeUnsicher: false },
    { kategorie: "LEISTUNG", beschreibung: "Anfahrt", menge: 1, einheit: "pauschal", einzelpreis: 40, preisquelle: "DIKTAT", vorschlag: false, mengeUnsicher: false },
    { kategorie: "MATERIAL", beschreibung: "Dispersionsfarbe", menge: null, einheit: "l", einzelpreis: null, preisquelle: "UNBEKANNT", vorschlag: true, mengeUnsicher: false },
  ],
  aufmassNotizen: "45 m² Wandfläche, Decke 20 m²",
} as unknown as DokumentDaten;

describe("baueZusammenfassung", () => {
  const text = baueZusammenfassung(daten);
  it("nutzt fettgedruckte Überschriften statt Emojis", () => {
    expect(text).toContain("*Kunde:*");
    expect(text).toContain("*Objekt:*");
    expect(text).toContain("*Leistungen:*");
    expect(text).not.toMatch(/📝|🛠️|📏|👤|🏠|💶/);
  });
  it("nennt Kunde, Objekt und Leistungen als Aufzählung", () => {
    expect(text).toContain("Familie Bär");
    expect(text).toContain("Wohnzimmer");
    expect(text).toContain("• Wände streichen");
  });
  it("zeigt genannte Preise formatiert", () => {
    expect(text).toMatch(/Anfahrt: .*40/);
  });
  it("wiederholt keine Maße separat und listet kein Material als Leistung", () => {
    expect(text).not.toContain("45 m² Wandfläche"); // stand nur in aufmassNotizen
    expect(text).not.toContain("Dispersionsfarbe");
  });
});

describe("istAbschluss (Notfallnetz)", () => {
  it("erkennt kurze Abschlusswörter", () => {
    expect(istAbschluss("passt")).toBe(true);
    expect(istAbschluss("mach fertig")).toBe(true);
  });
  it("wertet ein langes Diktat nicht als Abschluss", () => {
    expect(istAbschluss("dann machen wir weiter mit der Decke und den Fensterlaibungen im Bad")).toBe(false);
  });
});
