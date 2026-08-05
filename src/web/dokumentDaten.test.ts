import { describe, it, expect } from "vitest";
import { editorZuPositionen, type EditorPosition } from "./dokumentDaten.js";

describe("editorZuPositionen: Herkunft bleibt erhalten", () => {
  it("behält eine mitgelieferte Quelle (PREISLISTE wird NICHT zu DIKTAT)", () => {
    const eingabe: EditorPosition[] = [
      { kategorie: "LEISTUNG", beschreibung: "Tapezieren", menge: 1, einheit: "m2", einzelpreis: 14, preisquelle: "PREISLISTE" },
    ];
    expect(editorZuPositionen(eingabe)[0]!.preisquelle).toBe("PREISLISTE");
  });

  it("behält den Vorschlags-Charakter und mengeUnsicher", () => {
    const eingabe: EditorPosition[] = [
      { kategorie: "MATERIAL", beschreibung: "Farbe", menge: 2, einheit: "l", einzelpreis: null, vorschlag: true, mengeUnsicher: true, preisquelle: "UNBEKANNT" },
    ];
    const r = editorZuPositionen(eingabe)[0]!;
    expect(r.vorschlag).toBe(true);
    expect(r.mengeUnsicher).toBe(true);
  });

  it("leitet fehlende Herkunft aus dem Preis ab: Betrag -> MANUELL", () => {
    const eingabe: EditorPosition[] = [
      { kategorie: "LEISTUNG", beschreibung: "Streichen", menge: 1, einheit: "pauschal", einzelpreis: 250 },
    ];
    expect(editorZuPositionen(eingabe)[0]!.preisquelle).toBe("MANUELL");
  });

  it("leitet fehlende Herkunft aus dem Preis ab: kein Betrag -> UNBEKANNT", () => {
    const eingabe: EditorPosition[] = [
      { kategorie: "LEISTUNG", beschreibung: "Streichen", menge: 1, einheit: "pauschal", einzelpreis: null },
    ];
    expect(editorZuPositionen(eingabe)[0]!.preisquelle).toBe("UNBEKANNT");
  });
});
