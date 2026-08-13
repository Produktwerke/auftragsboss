import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { leistungSchluessel, schlagePreiseVor, merkePreise, merkePreiseAusImport, vergissPreis } from "./preisgedaechtnis.js";
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
      { beschreibung: "Türen lackieren", einheit: "Stk", einzelpreis: 85, preisquelle: "MANUELL", gedSperre: true }, // bewusst vergessen -> übersprungen
    ]);
    expect(n).toBe(1);
    expect(gemerkt).toEqual([leistungSchluessel("Wände streichen", "m2")]);
  });
});

describe("Preisgedächtnis: Vergessen (Knopf im Editor)", () => {
  it("entfernt genau den Eintrag dieses Betriebs (normalisierter Schlüssel)", async () => {
    const geloescht: any[] = [];
    const stub = {
      preisgedaechtnis: {
        deleteMany: async ({ where }: any) => { geloescht.push(where); return { count: 1 }; },
      },
    } as unknown as PrismaClient;

    const ok = await vergissPreis(stub, "hw1", "Wände streichen, weiß!", "m2");
    expect(ok).toBe(true);
    expect(geloescht[0]).toEqual({
      handwerkerId: "hw1",
      leistungSchluessel: leistungSchluessel("waende  Streichen weiss", "m2"),
    });
  });

  it("meldet false, wenn nichts gemerkt war", async () => {
    const stub = {
      preisgedaechtnis: { deleteMany: async () => ({ count: 0 }) },
    } as unknown as PrismaClient;
    expect(await vergissPreis(stub, "hw1", "Unbekannte Leistung", null)).toBe(false);
  });
});

describe("Preisgedächtnis: aus Import übernehmen (kontrolliertes Lernen)", () => {
  // Ein importiertes Alt-Angebot von hw1, datiert 2026-03-12, mit vier Positionen.
  const IMPORT_DOK = {
    id: "imp1",
    handwerkerId: "hw1",
    dokumentDatum: new Date("2026-03-12"),
    erstelltAm: new Date("2026-08-06"),
    positionen: [
      { originalTitel: "Wände streichen", einheit: "m2", einzelpreis: 12.5, extraktionsKonfidenz: "high" },
      { originalTitel: "Decke streichen", einheit: "m2", einzelpreis: null, extraktionsKonfidenz: "high" }, // kein Preis -> raus
      { originalTitel: "Undeutliche Zeile", einheit: null, einzelpreis: 99, extraktionsKonfidenz: "low" }, // low -> raus
      { originalTitel: "Türen lackieren", einheit: "Stk", einzelpreis: 85, extraktionsKonfidenz: "medium" },
    ],
  };

  function baueStub(vorhanden: Record<string, { letzterPreis: number; zuletztAm: Date }> = {}) {
    const upserts: any[] = [];
    const prisma = {
      importDokument: {
        findFirst: async ({ where }: any) =>
          where.id === IMPORT_DOK.id && where.handwerkerId === IMPORT_DOK.handwerkerId ? IMPORT_DOK : null,
      },
      preisgedaechtnis: {
        findUnique: async ({ where }: any) => vorhanden[where.handwerkerId_leistungSchluessel.leistungSchluessel] ?? null,
        upsert: async (args: any) => { upserts.push(args); return args.create; },
      },
    } as unknown as PrismaClient;
    return { prisma, upserts };
  }

  it("übernimmt nur ausgewiesene Einzelpreise mit Konfidenz != low, datiert aufs Angebotsdatum", async () => {
    const { prisma, upserts } = baueStub();
    const n = await merkePreiseAusImport(prisma, "hw1", "imp1");
    expect(n).toBe(2); // Wände + Türen; kein-Preis und low übersprungen
    for (const u of upserts) {
      expect(u.create.quelle).toBe("IMPORT");
      expect(u.create.zuletztAm.getFullYear()).toBe(2026);
      expect(u.create.zuletztAm.getMonth()).toBe(2); // März — nicht "heute"
    }
  });

  it("FRISCHE-SCHUTZ: ein neuerer gespeicherter Preis wird nicht vom älteren Import überschrieben", async () => {
    const { prisma, upserts } = baueStub({
      [leistungSchluessel("Wände streichen", "m2")]: { letzterPreis: 15, zuletztAm: new Date("2026-07-01") },
    });
    const n = await merkePreiseAusImport(prisma, "hw1", "imp1");
    expect(n).toBe(1); // nur Türen; Wände bleibt beim neueren Preis
    expect(upserts.map((u) => u.create.beschreibung)).toEqual(["Türen lackieren"]);
  });

  it("MANDANTENTRENNUNG: fremder Betrieb bekommt das Dokument nicht", async () => {
    const { prisma, upserts } = baueStub();
    const n = await merkePreiseAusImport(prisma, "hw2", "imp1");
    expect(n).toBe(0);
    expect(upserts).toHaveLength(0);
  });
});
