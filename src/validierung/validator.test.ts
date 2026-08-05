import { describe, it, expect } from "vitest";
import { validierePositionen, preisImText } from "./validator.js";
import type { Position } from "../ai/structure.js";
import type { Preisliste } from "../preisliste.js";

const preisliste = {
  betrieb: { firma: "T", inhaber: "T", strasse: "", plz: "", ort: "", telefon: "", email: "", gewerk: "malerei", ustIdNr: "", logo: "", farbe: "0B5CAD", bank: "" },
  konditionen: { stundensatz: 55, mwstSatz: 19, angebotGueltigTage: 30, anfahrtPauschale: 0, zahlungsziel: "14 Tage netto" },
  positionen: [{ suchbegriffe: ["tapezieren"], beschreibung: "Tapezieren", einheit: "m2", preis: 14 }],
} as unknown as Preisliste;

const pos = (over: Partial<Position>): Position => ({
  kategorie: "LEISTUNG", vorschlag: false, beschreibung: "Test", menge: 1, einheit: "pauschal",
  einzelpreis: null, preisquelle: "UNBEKANNT", mengeUnsicher: false, ...over,
});

describe("Validator: erfindet keine Preise", () => {
  it("behält einen DIKTAT-Preis, der im Diktat belegt ist", () => {
    const r = validierePositionen([pos({ beschreibung: "Tapezieren", einzelpreis: 9.8, preisquelle: "DIKTAT" })], { transkript: "tapezieren 9,80 pro Meter", preisliste });
    expect(r.positionen[0]!.einzelpreis).toBe(9.8);
    expect(r.korrigiert).toBe(0);
  });

  it("entfernt einen DIKTAT-Preis ohne Beleg im Diktat", () => {
    const r = validierePositionen([pos({ einzelpreis: 42, preisquelle: "DIKTAT" })], { transkript: "streichen weiß", preisliste });
    expect(r.positionen[0]!.einzelpreis).toBeNull();
    expect(r.positionen[0]!.preisquelle).toBe("UNBEKANNT");
    expect(r.korrigiert).toBe(1);
  });

  it("entfernt einen Preis ohne Herkunft (UNBEKANNT + Betrag)", () => {
    const r = validierePositionen([pos({ einzelpreis: 30, preisquelle: "UNBEKANNT" })], { transkript: "30", preisliste });
    expect(r.positionen[0]!.einzelpreis).toBeNull();
    expect(r.korrigiert).toBe(1);
  });

  it("behält einen PREISLISTE-Preis, der in der Liste steht", () => {
    const r = validierePositionen([pos({ einzelpreis: 14, preisquelle: "PREISLISTE" })], { transkript: "", preisliste });
    expect(r.positionen[0]!.einzelpreis).toBe(14);
    expect(r.korrigiert).toBe(0);
  });

  it("entfernt einen PREISLISTE-Preis, der nicht in der Liste steht", () => {
    const r = validierePositionen([pos({ einzelpreis: 99, preisquelle: "PREISLISTE" })], { transkript: "", preisliste });
    expect(r.positionen[0]!.einzelpreis).toBeNull();
    expect(r.korrigiert).toBe(1);
  });

  it("erkennt den Stundensatz als Preislisten-Beleg", () => {
    const r = validierePositionen([pos({ einzelpreis: 55, preisquelle: "PREISLISTE" })], { transkript: "", preisliste });
    expect(r.positionen[0]!.einzelpreis).toBe(55);
    expect(r.korrigiert).toBe(0);
  });

  it("normalisiert einen null-Preis ohne Korrektur auf UNBEKANNT", () => {
    const r = validierePositionen([pos({ einzelpreis: null, preisquelle: "DIKTAT" })], { transkript: "", preisliste });
    expect(r.positionen[0]!.preisquelle).toBe("UNBEKANNT");
    expect(r.korrigiert).toBe(0);
  });

  it("entfernt eine von der KI unzulässig gesetzte MANUELL-Quelle", () => {
    const r = validierePositionen([pos({ einzelpreis: 20, preisquelle: "MANUELL" })], { transkript: "20", preisliste });
    expect(r.positionen[0]!.einzelpreis).toBeNull();
    expect(r.korrigiert).toBe(1);
  });

  it("erlaubt MANUELL im Editor-Kontext (erweiterte Quellen)", () => {
    const r = validierePositionen([pos({ einzelpreis: 20, preisquelle: "MANUELL" })], { transkript: "", preisliste, erlaubteQuellen: ["DIKTAT", "PREISLISTE", "MANUELL", "PREISGEDAECHTNIS"] });
    expect(r.positionen[0]!.einzelpreis).toBe(20);
    expect(r.korrigiert).toBe(0);
  });
});

describe("preisImText: robuste Zahlenerkennung", () => {
  it("findet 9,80 für den Wert 9.8", () => expect(preisImText(9.8, "kostet 9,80 euro")).toBe(true));
  it("verwechselt 14 nicht mit 140", () => expect(preisImText(14, "das sind 140 quadratmeter")).toBe(false));
  it("verwechselt 6,80 nicht mit 16,80", () => expect(preisImText(6.8, "16,80 euro")).toBe(false));
  it("findet 14 in '14 Euro'", () => expect(preisImText(14, "vierzehn, also 14 Euro")).toBe(true));
});
