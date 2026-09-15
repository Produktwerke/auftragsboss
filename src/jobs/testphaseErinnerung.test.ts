import { describe, it, expect } from "vitest";
import { faelligeErinnerung, testAblauf, anredeFuer, VORWARNUNG_TAGE } from "./testphaseErinnerung.js";

const TAG = 24 * 60 * 60 * 1000;
const start = new Date("2026-09-01T10:00:00Z");
const nach = (tage: number) => new Date(start.getTime() + tage * TAG);

describe("Testphase-Erinnerungen: Fälligkeit", () => {
  it("berechnet den Ablauf aus Anlage + Testtagen", () => {
    expect(testAblauf(start, 14).toISOString()).toBe("2026-09-15T10:00:00.000Z");
  });

  it("3 Tage vor Ablauf ENDET_BALD, genau einmal", () => {
    expect(faelligeErinnerung(start, 14, new Set(), nach(10))).toBeNull(); // noch 4 Tage
    expect(faelligeErinnerung(start, 14, new Set(), nach(11))).toBe("ENDET_BALD"); // noch 3 Tage
    expect(faelligeErinnerung(start, 14, new Set(), nach(13))).toBe("ENDET_BALD"); // noch 1 Tag, falls verpasst
    expect(faelligeErinnerung(start, 14, new Set(["ENDET_BALD"]), nach(12))).toBeNull();
  });

  it("nach Ablauf ABGELAUFEN, aber nur im 2-Tage-Fenster und einmal", () => {
    expect(faelligeErinnerung(start, 14, new Set(), nach(14.5))).toBe("ABGELAUFEN");
    expect(faelligeErinnerung(start, 14, new Set(), nach(15.9))).toBe("ABGELAUFEN");
    expect(faelligeErinnerung(start, 14, new Set(["ABGELAUFEN"]), nach(15))).toBeNull();
    // Alte Test-Konten (Wochen abgelaufen) bekommen beim ersten Lauf des Jobs nichts
    expect(faelligeErinnerung(start, 14, new Set(), nach(30))).toBeNull();
  });

  it("Anrede: Name, sonst Firma, sonst Boss", () => {
    expect(anredeFuer({ name: "Herr Müller", firma: "Maler Müller" })).toBe("Herr Müller");
    expect(anredeFuer({ name: "", firma: "Maler Müller" })).toBe("Maler Müller");
    expect(anredeFuer({ name: " ", firma: "" })).toBe("Boss");
    expect(VORWARNUNG_TAGE).toBe(3);
  });
});
