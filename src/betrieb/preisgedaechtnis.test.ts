import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { leistungSchluessel, schlagePreiseVor, merkePreise } from "./preisgedaechtnis.js";
import type { Position } from "../ai/structure.js";

const pos = (over: Partial<Position>): Position => ({
  kategorie: "LEISTUNG", vorschlag: false, beschreibung: "Test", menge: 1, einheit: "pauschal",
  einzelpreis: null, preisquelle: "UNBEKANNT", mengeUnsicher: false, ...over,
});

describe("leistungSchluessel: Normalisierung", () => {
  it("normalisiert Umlaute, Groß/Klein und Sonderzeichen stabil", () => {
    expect(leistungSchluessel("Wände streichen, weiß!", "m2")).toBe(leistungSchluessel("waende  Streichen weiss", "m2"));
  });
  it("trennt nach Einheit", () => {
    expect(leistungSchluessel("Streichen", "m2")).not.toBe(leistungSchluessel("Streichen", "pauschal"));
  });
});

// Stub-Prisma: kennt genau EINEN Eintrag, und zwar nur für Betrieb "hw1".
const SCHLUESSEL = leistungSchluessel("Wände streichen", "m2");
const stubPrisma = {
  preisgedaechtnis: {
    findUnique: async ({ where }: any) => {
      const { handwerkerId, leistungSchluessel: s } = where.handwerkerId_leistungSchluessel;
      if (handwerkerId === "hw1" && s === SCHLUESSEL) {
        return { letzterPreis: 6.8, zuletztAm: new Date("2026-06-12"), beschreibung: "Wände streichen", einheit: "m2" };
      }
      return null;
    },
  },
} as unknown as PrismaClient;

describe("Preisgedächtnis: Vorschlag nur aus eigener Historie", () => {
  it("füllt einen leeren Preis mit datiertem Vorschlag aus dem Gedächtnis", async () => {
    const r = await schlagePreiseVor(stubPrisma, "hw1", [pos({ beschreibung: "Wände streichen", einheit: "m2", einzelpreis: null })]);
    expect(r.positionen[0]!.einzelpreis).toBe(6.8);
    expect(r.positionen[0]!.preisquelle).toBe("PREISGEDAECHTNIS");
    expect(r.vorschlaege).toHaveLength(1);
    expect(r.vorschlaege[0]!.zuletztAm.getFullYear()).toBe(2026);
  });

  it("lässt vorhandene Preise unangetastet", async () => {
    const r = await schlagePreiseVor(stubPrisma, "hw1", [pos({ beschreibung: "Wände streichen", einheit: "m2", einzelpreis: 12, preisquelle: "DIKTAT" })]);
    expect(r.positionen[0]!.einzelpreis).toBe(12);
    expect(r.positionen[0]!.preisquelle).toBe("DIKTAT");
    expect(r.vorschlaege).toHaveLength(0);
  });

  it("MANDANTENTRENNUNG: Betrieb hw2 bekommt NICHTS aus dem Gedächtnis von hw1", async () => {
    const r = await schlagePreiseVor(stubPrisma, "hw2", [pos({ beschreibung: "Wände streichen", einheit: "m2", einzelpreis: null })]);
    expect(r.positionen[0]!.einzelpreis).toBeNull();
    expect(r.vorschlaege).toHaveLength(0);
  });
});

describe("Preisgedächtnis: Merken", () => {
  it("merkt bepreiste Positionen, überspringt leere und PREISGEDAECHTNIS-Vorschläge", async () => {
    const gemerkt: string[] = [];
    const stub = {
      preisgedaechtnis: {
        upsert: async ({ create }: any) => { gemerkt.push(create.leistungSchluessel); return create; },
      },
    } as unknown as PrismaClient;

    const n = await merkePreise(stub, "hw1", [
      { beschreibung: "Wände streichen", einheit: "m2", einzelpreis: 6.8, preisquelle: "MANUELL" },
      { beschreibung: "Decke streichen", einheit: "m2", einzelpreis: null, preisquelle: "UNBEKANNT" }, // leer -> übersprungen
      { beschreibung: "Boden schützen", einheit: "pauschal", einzelpreis: 30, preisquelle: "PREISGEDAECHTNIS" }, // Vorschlag -> übersprungen
    ]);
    expect(n).toBe(1);
    expect(gemerkt).toEqual([leistungSchluessel("Wände streichen", "m2")]);
  });
});
