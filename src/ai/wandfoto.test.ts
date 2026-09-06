import { describe, expect, it } from "vitest";
import { fotoAlsDialogText, fotoFeedback, fotoProbleme, oeffnungenBeschreibung, type WandfotoAnalyse } from "./wandfoto.js";

const basis: WandfotoAnalyse = {
  istWandfoto: true,
  notizText: null,
  wandKomplett: true,
  bodenSichtbar: true,
  hellGenug: true,
  oeffnungen: [
    { art: "Fenstertuer", offen: false, breiteM: 1.7, hoeheM: 2.2, sicherheit: "hoch", inNachbarwand: false },
    { art: "Tuer", offen: false, breiteM: 0.82, hoeheM: 1.98, sicherheit: "hoch", inNachbarwand: false },
  ],
  besonderheiten: [],
};

describe("Wandfoto-Helfer", () => {
  it("beschreibt Öffnungen mit VOB-Einordnung und Grauzonen-Hinweis", () => {
    const z = oeffnungenBeschreibung({
      ...basis,
      oeffnungen: [...basis.oeffnungen, { art: "Fenster", offen: false, breiteM: 1.4, hoeheM: 1.7, sicherheit: "mittel", inNachbarwand: false }],
    });
    expect(z[0]).toBe("Fenstertür ca. 1,7 × 2,2 m = 3,74 m² (wird abgezogen)");
    expect(z[1]).toBe("Tür ca. 0,82 × 1,98 m = 1,62 m² (wird übermessen)");
    expect(z[2]).toContain("2,38 m² (wird übermessen, nahe der 2,5-m²-Grenze: bitte kurz nachmessen)");
  });

  it("Sofortantwort: grün bei sauberem Foto, Warnung bei offener Tür oder Dunkelheit", () => {
    expect(fotoFeedback(basis, 2, "Wohnzimmer")).toBe(
      "✅ Wohnzimmer, Wand 2: Fenstertür ca. 1,7 × 2,2 m = 3,74 m² (wird abgezogen); Tür ca. 0,82 × 1,98 m = 1,62 m² (wird übermessen).",
    );
    const offen = { ...basis, oeffnungen: [{ ...basis.oeffnungen[1]!, offen: true }] };
    expect(fotoFeedback(offen, 1, null)).toBe("⚠️ Wand 1: Tür steht offen, bitte schließen und nochmal fotografieren.");
    const dunkel = { ...basis, hellGenug: false, wandKomplett: false };
    const f = fotoFeedback(dunkel, 3, "Küche");
    expect(f).toContain("⚠️ Küche, Wand 3: Das Foto ist zu dunkel");
    expect(f).toContain("ℹ️ Die Wand ist nicht ganz im Bild");
    expect(fotoFeedback({ ...basis, oeffnungen: [] }, 4, "Bad")).toBe("✅ Bad, Wand 4: keine Öffnungen, notiert.");
  });

  it("Öffnungen in Nachbarwänden werden überall aussortiert", () => {
    const mitNachbar = { ...basis, oeffnungen: [...basis.oeffnungen, { art: "Tuer" as const, offen: true, breiteM: 0.85, hoeheM: 2, sicherheit: "hoch" as const, inNachbarwand: true }] };
    expect(oeffnungenBeschreibung(mitNachbar)).toHaveLength(2);
    expect(fotoProbleme(mitNachbar)).toEqual([]); // die offene Nachbartür zählt nicht
    expect(fotoAlsDialogText(mitNachbar, 1, null)).not.toContain("offen");
  });

  it("unvollständige Wand ist nur ein Hinweis, kein Nachfassen", () => {
    expect(fotoProbleme({ ...basis, wandKomplett: false })).toEqual([
      { schwere: "hinweis", text: "Die Wand ist nicht ganz im Bild (Ecken oder Boden fehlen)." },
    ]);
  });

  it("Dialogzeile für die KI trägt Raum, Unterschrift, Maße und Markierungen", () => {
    const t = fotoAlsDialogText(
      { ...basis, wandKomplett: false, besonderheiten: ["Lambris halbhoch"], oeffnungen: [{ ...basis.oeffnungen[0]!, offen: true, sicherheit: "niedrig" }] },
      2,
      "Wohnzimmer",
      "Wohnzimmer Wand 2",
    );
    expect(t).toBe(
      "FOTO Wand 2 (Raum: Wohnzimmer) [Bildunterschrift: Wohnzimmer Wand 2]: Öffnungen: Fenstertür ca. 1,7 x 2,2 m (offen) (unsicher). Wand nicht vollständig im Bild. Besonderheiten: Lambris halbhoch.",
    );
    expect(fotoAlsDialogText({ ...basis, oeffnungen: [] }, 1, null)).toBe("FOTO Wand 1: Keine Öffnungen.");
  });
});
