import { describe, it, expect, beforeEach } from "vitest";
import { merkeEingabe, eingabeStandVon, istUeberholt, eingabestandZuruecksetzen } from "./eingabestand.js";

describe("Eingabestand (Überholen laufender Auswertungen)", () => {
  beforeEach(() => eingabestandZuruecksetzen());

  it("zählt je Nummer getrennt", () => {
    expect(eingabeStandVon("49170")).toBe(0);
    expect(merkeEingabe("49170")).toBe(1);
    expect(merkeEingabe("49170")).toBe(2);
    expect(merkeEingabe("49171")).toBe(1);
    expect(eingabeStandVon("49170")).toBe(2);
  });

  it("erkennt eine Auswertung als überholt, sobald eine weitere Eingabe kam", () => {
    merkeEingabe("49170");
    const beiStart = eingabeStandVon("49170");
    expect(istUeberholt("49170", beiStart)).toBe(false);
    merkeEingabe("49170");
    expect(istUeberholt("49170", beiStart)).toBe(true);
    // Eine andere Nummer überholt nichts
    merkeEingabe("49171");
    expect(istUeberholt("49171", 1)).toBe(false);
  });
});
