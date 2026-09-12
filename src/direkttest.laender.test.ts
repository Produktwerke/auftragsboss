import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { nummerAusFreigegebenemLand, starteTestFuerNeueNummer } from "./direkttest.js";

describe("Ländersperre für unbekannte Nummern (12.09.2026)", () => {
  it("lässt deutsche Nummern durch und weist andere ab", () => {
    expect(nummerAusFreigegebenemLand("4917612345678", ["49"])).toBe(true);
    expect(nummerAusFreigegebenemLand("+49 176 12345678", ["49"])).toBe(true);
    expect(nummerAusFreigegebenemLand("33786900539", ["49"])).toBe(false);
    expect(nummerAusFreigegebenemLand("436601234567", ["49"])).toBe(false);
    expect(nummerAusFreigegebenemLand("436601234567", ["49", "43"])).toBe(true);
    expect(nummerAusFreigegebenemLand("", ["49"])).toBe(false);
    expect(nummerAusFreigegebenemLand("33786900539", [])).toBe(true); // leere Liste = keine Sperre
  });

  describe("starteTestFuerNeueNummer", () => {
    let sicherung: Record<string, string | undefined>;
    beforeEach(() => {
      sicherung = { DIREKTTEST_AKTIV: process.env.DIREKTTEST_AKTIV, DIREKTTEST_LAENDER: process.env.DIREKTTEST_LAENDER };
      process.env.DIREKTTEST_AKTIV = "true";
      delete process.env.DIREKTTEST_LAENDER; // Vorgabe: nur 49
    });
    afterEach(() => {
      for (const [k, v] of Object.entries(sicherung)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });

    it("legt für eine französische Nummer KEIN Test-Konto an, sondern weist zweisprachig ab", async () => {
      let angelegt = 0;
      const prisma = { handwerker: { create: async () => { angelegt++; return {}; } } } as never;
      const ergebnis = await starteTestFuerNeueNummer(prisma, "33786900539");
      expect("ablehnung" in ergebnis).toBe(true);
      if ("ablehnung" in ergebnis) {
        expect(ergebnis.ablehnung).toMatch(/nur für Handwerksbetriebe in Deutschland/);
        expect(ergebnis.ablehnung).toMatch(/Germany only/);
      }
      expect(angelegt).toBe(0);
    });
  });
});
