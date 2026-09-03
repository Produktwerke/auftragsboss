import { describe, it, expect } from "vitest";
import { speicherSchema, einstellungenSchema, registrierungSchema, empfehlungMailSchema, eineEmail } from "./eingabeSchemata.js";

const pos = (extra: Record<string, unknown>) => ({
  kategorie: "LEISTUNG",
  beschreibung: "Wände streichen",
  menge: 10,
  einheit: "m2",
  einzelpreis: 12.5,
  ...extra,
});

describe("speicherSchema: Editor-Speichern", () => {
  it("normale Angebotsdaten gehen durch", () => {
    const erg = speicherSchema.safeParse({
      kundeName: "Familie Mustermann",
      datum: "2026-09-03",
      positionen: [pos({}), pos({ menge: null, einzelpreis: null, einheit: null })],
    });
    expect(erg.success).toBe(true);
  });

  it("Nachlass (negativer Einzelpreis) bleibt erlaubt", () => {
    expect(speicherSchema.safeParse({ positionen: [pos({ einzelpreis: -100 })] }).success).toBe(true);
  });

  it("String statt Zahl in menge wird abgelehnt (XSS-Träger der Lern-Auswertung)", () => {
    expect(speicherSchema.safeParse({ positionen: [pos({ menge: "<img src=x onerror=1>" })] }).success).toBe(false);
  });

  it("Zahl statt Text in beschreibung wird abgelehnt (Admin-Crash)", () => {
    expect(speicherSchema.safeParse({ positionen: [pos({ beschreibung: 42 })] }).success).toBe(false);
  });

  it("Infinity und NaN werden abgelehnt (JSON 1e999 wird zu Infinity)", () => {
    expect(speicherSchema.safeParse({ positionen: [pos({ einzelpreis: Infinity })] }).success).toBe(false);
    expect(speicherSchema.safeParse({ positionen: [pos({ menge: NaN })] }).success).toBe(false);
    expect(speicherSchema.safeParse({ positionen: [pos({ menge: -5 })] }).success).toBe(false);
  });

  it("kaputtes Datum und Überlängen werden abgelehnt", () => {
    expect(speicherSchema.safeParse({ datum: "morgen" }).success).toBe(false);
    expect(speicherSchema.safeParse({ kundeName: "x".repeat(201) }).success).toBe(false);
    expect(speicherSchema.safeParse({ positionen: [pos({ beschreibung: "x".repeat(2001) })] }).success).toBe(false);
  });
});

describe("E-Mail-Regel: genau EINE Adresse", () => {
  it("gültige Adresse ja, Empfängerliste nein", () => {
    expect(eineEmail.safeParse("maler@firma.de").success).toBe(true);
    expect(eineEmail.safeParse("a@x.de, b@y.de").success).toBe(false);
    expect(eineEmail.safeParse("a@x.de b@y.de").success).toBe(false);
    expect(eineEmail.safeParse("a@x.de;b@y.de").success).toBe(false);
  });

  it("gilt für Einstellungen, Registrierung und Empfehlung", () => {
    expect(einstellungenSchema.safeParse({ email: "a@x.de, b@y.de" }).success).toBe(false);
    expect(einstellungenSchema.safeParse({ email: "" }).success).toBe(true); // leer = Feld unangetastet
    expect(registrierungSchema.safeParse({ firma: "Maler Mustermann", name: "Max", email: "a@x.de,b@y.de" }).success).toBe(false);
    expect(empfehlungMailSchema.safeParse({ email: "kollege@firma.de", name: "Kai" }).success).toBe(true);
  });
});
