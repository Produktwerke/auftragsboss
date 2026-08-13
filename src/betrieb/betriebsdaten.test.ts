import { describe, it, expect } from "vitest";
import type { Handwerker } from "@prisma/client";
import { effektivePreisliste } from "./betriebsdaten.js";
import type { Preisliste } from "../preisliste.js";

// Nur die Felder, die effektivePreisliste anfasst — Rest bleibt leer.
function handwerker(teil: Partial<Handwerker> = {}): Handwerker {
  return {
    firma: "Malerbetrieb Muster", name: "Max", email: "max@muster.de",
    strasse: null, plz: null, ort: null, telefon: null, ustIdNr: null, bank: null,
    farbe: null, logoDatei: null, gewerk: null,
    angebotGueltigTage: null, zahlungsziel: null,
    ...teil,
  } as Handwerker;
}

const BASIS = {
  betrieb: {
    firma: "Vorgabe GmbH", inhaber: "V. Orlage", strasse: "Weg 1", plz: "11111", ort: "Vorstadt",
    telefon: "0", email: "v@v.de", gewerk: "Malerei", ustIdNr: "", logo: "", farbe: "0B5CAD", bank: "",
  },
  konditionen: { stundensatz: 0, mwstSatz: 19, angebotGueltigTage: 30, anfahrtPauschale: 0, zahlungsziel: "14 Tage netto" },
  positionen: [],
} as unknown as Preisliste;

describe("effektivePreisliste: Konditionen je Betrieb", () => {
  it("ohne eigene Werte greifen die Vorgaben (30 Tage, 14 Tage netto)", () => {
    const eff = effektivePreisliste(handwerker(), BASIS);
    expect(eff.konditionen.angebotGueltigTage).toBe(30);
    expect(eff.konditionen.zahlungsziel).toBe("14 Tage netto");
  });

  it("eigene Gültigkeitsdauer und eigenes Zahlungsziel gewinnen", () => {
    const eff = effektivePreisliste(
      handwerker({ angebotGueltigTage: 14, zahlungsziel: "Zahlbar sofort ohne Abzug" }),
      BASIS,
    );
    expect(eff.konditionen.angebotGueltigTage).toBe(14);
    expect(eff.konditionen.zahlungsziel).toBe("Zahlbar sofort ohne Abzug");
  });

  it("Unsinnswerte (0 Tage, leerer Text) fallen auf die Vorgabe zurück", () => {
    const eff = effektivePreisliste(handwerker({ angebotGueltigTage: 0, zahlungsziel: "   " }), BASIS);
    expect(eff.konditionen.angebotGueltigTage).toBe(30);
    expect(eff.konditionen.zahlungsziel).toBe("14 Tage netto");
  });

  it("übrige Konditionen (MwSt) bleiben unangetastet", () => {
    const eff = effektivePreisliste(handwerker({ angebotGueltigTage: 7 }), BASIS);
    expect(eff.konditionen.mwstSatz).toBe(19);
  });
});
