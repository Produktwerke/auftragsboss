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

describe("Startnachricht von der Landingpage (15.09.2026)", () => {
  it("erkennt vorgefüllte Testwünsche samt Tarif, aber keine Diktate", async () => {
    const { testStartAusText } = await import("./direkttest.js");
    expect(testStartAusText("Hallo AuftragsBoss, ich möchte 14 Tage kostenlos testen (Tarif Profi).")).toEqual({ tarif: "profi" });
    expect(testStartAusText("Hallo AuftragsBoss, ich möchte kostenlos ein Angebot testen.")).toEqual({ tarif: null });
    expect(testStartAusText("Angebot für Familie Bär, Bergstraße 12, Wohnzimmer 4,49 mal 4,36, Wände streichen")).toBeNull();
    expect(testStartAusText("Wohnzimmer, Höhe 2,52, Wände und Decke streichen, das will ich mal testen")).toBeNull();
    expect(testStartAusText("")).toBeNull();
    expect(testStartAusText(undefined)).toBeNull();
  });
});
