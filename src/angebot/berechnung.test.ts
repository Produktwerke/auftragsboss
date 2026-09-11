import { describe, it, expect } from "vitest";
import { berechneAngebot, type EingabePosition } from "./berechnung.js";
import type { Preisliste } from "../preisliste.js";

const preisliste = {
  betrieb: { firma: "T", inhaber: "T", strasse: "", plz: "", ort: "", telefon: "", email: "", gewerk: "malerei", ustIdNr: "", logo: "", farbe: "0B5CAD", bank: "" },
  konditionen: { stundensatz: 0, mwstSatz: 19, angebotGueltigTage: 30, anfahrtPauschale: 0, zahlungsziel: "14 Tage netto" },
  positionen: [],
} as unknown as Preisliste;

const p = (over: Partial<EingabePosition>): EingabePosition => ({
  kategorie: "LEISTUNG", vorschlag: false, beschreibung: "Test", menge: 1, einheit: "pauschal",
  einzelpreis: null, preisquelle: "UNBEKANNT", mengeUnsicher: false, ...over,
});

describe("berechneAngebot: Raumblöcke bei mehreren Räumen", () => {
  it("gruppiert nach Raum (Material vor Arbeit je Raum), Kleinmaterial ohne Raum zuletzt, Nummern fortlaufend", () => {
    const s = berechneAngebot(
      [
        p({ kategorie: "LEISTUNG", beschreibung: "Wände streichen", raumBezug: "Kinderzimmer links", einzelpreis: 300 }),
        p({ kategorie: "LEISTUNG", beschreibung: "Wände streichen", raumBezug: "Kinderzimmer rechts", einzelpreis: 250 }),
        p({ kategorie: "MATERIAL", beschreibung: "Farbe, Kinderzimmer links", raumBezug: "Kinderzimmer links", menge: 10, einheit: "l", einzelpreis: 5 }),
        p({ kategorie: "MATERIAL", beschreibung: "Abdeckmaterial", raumBezug: null, menge: 1, einheit: "pauschal", einzelpreis: 20 }),
        p({ kategorie: "MATERIAL", beschreibung: "Farbe, Kinderzimmer rechts", raumBezug: "Kinderzimmer rechts", menge: 8, einheit: "l", einzelpreis: 5 }),
      ],
      preisliste,
    );
    expect(s.bloecke.map((b) => b.name)).toEqual(["Kinderzimmer links", "Kinderzimmer rechts", "Klein- und Hilfsmaterial"]);
    expect(s.bloecke[0]!.positionen.map((x) => x.beschreibung)).toEqual(["Farbe, Kinderzimmer links", "Wände streichen"]);
    expect(s.bloecke[0]!.netto).toBe(350);
    expect(s.bloecke[1]!.netto).toBe(290);
    expect(s.bloecke[2]!.netto).toBe(20);
    expect(s.positionen.map((x) => x.nummer)).toEqual([1, 2, 3, 4, 5]);
    expect(s.netto).toBe(660);
  });

  it("bleibt bei einem Raum oder ohne Raumbezug bei den Kategorieblöcken", () => {
    const s = berechneAngebot(
      [
        p({ kategorie: "LEISTUNG", beschreibung: "Streichen", raumBezug: "Wohnzimmer", einzelpreis: 100 }),
        p({ kategorie: "MATERIAL", beschreibung: "Farbe", raumBezug: "Wohnzimmer", menge: 2, einheit: "l", einzelpreis: 10 }),
      ],
      preisliste,
    );
    expect(s.bloecke.map((b) => b.name)).toEqual(["Material", "Arbeitsaufwand"]);
  });
});

describe("berechneAngebot: Regression der Kernberechnung", () => {
  it("stellt Material vor Arbeitsaufwand (Positionsnummern folgen der Anzeige)", () => {
    const s = berechneAngebot(
      [
        p({ kategorie: "LEISTUNG", beschreibung: "Streichen", einzelpreis: 100 }),
        p({ kategorie: "MATERIAL", beschreibung: "Farbe", menge: 2, einheit: "l", einzelpreis: 10 }),
      ],
      preisliste,
    );
    expect(s.positionen[0]!.kategorie).toBe("MATERIAL");
    expect(s.positionen[0]!.nummer).toBe(1);
  });

  it("rechnet netto/MwSt/brutto centgenau", () => {
    const s = berechneAngebot(
      [
        p({ kategorie: "LEISTUNG", beschreibung: "Streichen", einzelpreis: 100 }),
        p({ kategorie: "MATERIAL", beschreibung: "Farbe", menge: 2, einheit: "l", einzelpreis: 10 }),
      ],
      preisliste,
    );
    expect(s.netto).toBe(120);
    expect(s.mwstBetrag).toBe(22.8);
    expect(s.brutto).toBe(142.8);
    expect(s.vollstaendig).toBe(true);
  });

  it("behandelt Pauschale ohne Menge als Menge 1 (Einzelpreis = Gesamt)", () => {
    const s = berechneAngebot([p({ einheit: "pauschal", menge: null, einzelpreis: 250 })], preisliste);
    expect(s.positionen[0]!.gesamt).toBe(250);
  });

  it("lässt Positionen ohne Preis offen (keine Summe, ohnePreise-Fall)", () => {
    const s = berechneAngebot([p({ einzelpreis: null })], preisliste);
    expect(s.positionen[0]!.offen).toBe(true);
    expect(s.anzahlOffen).toBe(1);
    expect(s.ohnePreise).toBe(true);
    expect(s.vollstaendig).toBe(false);
  });
});
