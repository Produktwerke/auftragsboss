import { describe, expect, it } from "vitest";
import { bereinigeAnalyse, fotoAlsDialogText, fotoBeschreibung, fotoFeedback, fotoHinweiseKurz, fotoNachfassHinweis, fotoProbleme, oeffnungenBeschreibung, type WandfotoAnalyse } from "./wandfoto.js";

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
    const dunkel = { ...basis, hellGenug: false, bodenSichtbar: false };
    const f = fotoFeedback(dunkel, 3, "Küche");
    expect(f).toContain("⚠️ Küche, Wand 3: Das Foto ist zu dunkel");
    expect(f).toContain("ℹ️ Der Boden ist nicht im Bild");
    expect(fotoFeedback({ ...basis, oeffnungen: [] }, 4, "Bad")).toBe("✅ Bad, Wand 4: keine Öffnungen, notiert.");
  });

  it("Öffnungen in Nachbarwänden werden überall aussortiert", () => {
    const mitNachbar = { ...basis, oeffnungen: [...basis.oeffnungen, { art: "Tuer" as const, offen: true, breiteM: 0.85, hoeheM: 2, sicherheit: "hoch" as const, inNachbarwand: true }] };
    expect(oeffnungenBeschreibung(mitNachbar)).toHaveLength(2);
    expect(fotoProbleme(mitNachbar)).toEqual([]); // die offene Nachbartür zählt nicht
    expect(fotoAlsDialogText(mitNachbar, 1, null)).not.toContain("(offen)");
    expect(fotoAlsDialogText(mitNachbar, 1, null)).toContain("vermutlich Nachbarwand (nur übernehmen, wenn der Handwerker es bestätigt): Tür ca. 0,85 x 2 m.");
    // Kleine Zimmertür am Rand: wird ohnehin übermessen, keine Nachfrage mehr (Live-Test 11.09.)
    expect(fotoFeedback(mitNachbar, 1, "Bad")).not.toContain("❓ Am Bildrand");
    // Große Öffnung am Rand (Fenstertür > 2,5 m²): Nachfrage lohnt sich
    const mitGrosserNachbar = { ...basis, oeffnungen: [...basis.oeffnungen, { art: "Fenstertuer" as const, offen: false, breiteM: 1.8, hoeheM: 2.2, sicherheit: "niedrig" as const, inNachbarwand: true }] };
    expect(fotoFeedback(mitGrosserNachbar, 1, "Bad")).toContain("❓ Am Bildrand noch: Fenstertür.");
    // Unbekanntes Maß: nur bei typischerweise großen Arten fragen
    const ohneMass = (art: "Tuer" | "Durchgang") => ({ ...basis, oeffnungen: [{ art, offen: false, breiteM: null, hoeheM: null, sicherheit: "niedrig" as const, inNachbarwand: true }] });
    expect(fotoFeedback(ohneMass("Durchgang"), 1, null)).toContain("❓ Am Bildrand noch: Durchgang.");
    expect(fotoFeedback(ohneMass("Tuer"), 1, null)).not.toContain("❓");
  });

  it("bereinigeAnalyse führt dieselbe doppelt gemeldete Öffnung zusammen", () => {
    const doppelt = {
      ...basis,
      oeffnungen: [
        { art: "Tuer" as const, offen: false, breiteM: 0.85, hoeheM: 2, sicherheit: "hoch" as const, inNachbarwand: false },
        { art: "Tuer" as const, offen: false, breiteM: 0.85, hoeheM: 2.03, sicherheit: "mittel" as const, inNachbarwand: false },
        { art: "Fenster" as const, offen: false, breiteM: 1, hoeheM: 1.35, sicherheit: "hoch" as const, inNachbarwand: false },
      ],
    };
    const b = bereinigeAnalyse(doppelt);
    expect(b.oeffnungen).toHaveLength(2);
    expect(b.oeffnungen.map((o) => o.art)).toEqual(["Tuer", "Fenster"]);
    // Zwei verschiedene Türen bleiben zwei
    const zwei = { ...basis, oeffnungen: [doppelt.oeffnungen[0]!, { ...doppelt.oeffnungen[0]!, breiteM: 1.0 }] };
    expect(bereinigeAnalyse(zwei).oeffnungen).toHaveLength(2);
    expect(bereinigeAnalyse(basis)).toBe(basis); // unverändert → dasselbe Objekt
  });

  it("Wandausschnitt ist kein Mangel; nur fehlender Boden ist ein Hinweis, kein Nachfassen", () => {
    expect(fotoProbleme({ ...basis, wandKomplett: false })).toEqual([]);
    expect(fotoProbleme({ ...basis, wandKomplett: false, bodenSichtbar: false })).toEqual([
      { schwere: "hinweis", text: "Der Boden ist nicht im Bild, dann werden die Maße ungenauer. Hochkant mit Boden und Decke reicht." },
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
      "FOTO Wand 2 (Raum: Wohnzimmer) [Bildunterschrift: Wohnzimmer Wand 2]: Öffnungen: Fenstertür ca. 1,7 x 2,2 m (offen) (unsicher). Besonderheiten: Lambris halbhoch.",
    );
    expect(fotoAlsDialogText({ ...basis, oeffnungen: [] }, 1, null)).toBe("FOTO Wand 1: Keine Öffnungen.");
  });
});

describe("Foto-Hinweise für die Fertigmeldung (13.09.2026: nach Inhalt statt Wandnummer)", () => {
  it("beschreibt das Foto nach seinen Öffnungen und dem Raum", () => {
    expect(fotoBeschreibung(basis, "Kinderzimmer")).toBe("Foto mit Fenstertür ca. 1,7 x 2,2 m und Tür ca. 0,82 x 1,98 m (Kinderzimmer)");
    expect(fotoBeschreibung({ ...basis, oeffnungen: [] }, null)).toBe("Foto ohne Öffnung");
    expect(fotoBeschreibung({ ...basis, oeffnungen: [], besonderheiten: ["Heizkörper"] }, "Bad")).toBe("Foto mit Heizkörper (Bad)");
  });
  it("nennt in den Hinweisen keine Wandnummer", () => {
    const z = fotoHinweiseKurz({ ...basis, bodenSichtbar: false }, 3, "Kinderzimmer");
    expect(z).toEqual(["ℹ️ Foto mit Fenstertür ca. 1,7 x 2,2 m und Tür ca. 0,82 x 1,98 m (Kinderzimmer): Boden nicht im Bild, Maße ungenauer."]);
    expect(fotoHinweiseKurz(basis, 3, "Kinderzimmer")).toEqual([]);
    expect(fotoNachfassHinweis({ ...basis, hellGenug: false }, 3, "Bad")).toBe("⚠️ Dein letztes Foto (Bad): Das Foto ist zu dunkel oder überstrahlt.");
    expect(fotoNachfassHinweis(basis, 3, "Bad")).toBeNull();
  });
});
