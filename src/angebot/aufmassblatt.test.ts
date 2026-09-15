import { describe, it, expect } from "vitest";
import { fotoBeschreibung } from "./aufmassblatt.js";

describe("Bildunterschrift in der Aufmaß-Anlage (Kundendokument, 15.09.2026)", () => {
  const erkennung = JSON.stringify({
    istWandfoto: true,
    notizText: null,
    wandKomplett: false,
    bodenSichtbar: false,
    hellGenug: true,
    oeffnungen: [
      { art: "Fenster", offen: false, breiteM: 1.4, hoeheM: 1.7, sicherheit: "mittel", inNachbarwand: false },
      { art: "Tuer", offen: false, breiteM: null, hoeheM: null, sicherheit: "niedrig", inNachbarwand: false },
      { art: "Fenstertuer", offen: false, breiteM: 1.7, hoeheM: 2.2, sicherheit: "hoch", inNachbarwand: true },
    ],
    besonderheiten: ["Hochbett mit Leiter", "Guns-N'-Roses-Aufkleber"],
  });

  it("nennt nur die Öffnungen mit Maß, nichts Internes", () => {
    const t = fotoBeschreibung(erkennung);
    expect(t).toBe("Fenster ca. 1,4 × 1,7 m; Tür");
    expect(t).not.toMatch(/nachmessen|Grenze|Bildrand|Hochbett|Aufkleber|Boden/);
  });

  it("sagt keine Öffnungen, wenn keine da sind, und bleibt bei Unlesbarem leer", () => {
    expect(fotoBeschreibung(JSON.stringify({ oeffnungen: [], besonderheiten: ["Heizkörper"] }))).toBe("keine Öffnungen");
    expect(fotoBeschreibung("kaputt")).toBe("");
  });
});
