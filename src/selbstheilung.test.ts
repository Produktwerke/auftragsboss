import { describe, it, expect } from "vitest";
import { naechsteWiederholungMinuten, standText, MAX_FEHLVERSUCHE, WIEDERHOLUNGEN_MINUTEN } from "./selbstheilung.js";

describe("Selbstheilung: Wiederholungsabstände", () => {
  it("wächst von 3 über 10 und 30 auf 60 Minuten und gibt danach auf", () => {
    expect(naechsteWiederholungMinuten(1)).toBe(3);
    expect(naechsteWiederholungMinuten(2)).toBe(10);
    expect(naechsteWiederholungMinuten(3)).toBe(30);
    expect(naechsteWiederholungMinuten(4)).toBe(60);
    expect(naechsteWiederholungMinuten(MAX_FEHLVERSUCHE)).toBe(60);
    expect(naechsteWiederholungMinuten(MAX_FEHLVERSUCHE + 1)).toBeNull();
    expect(naechsteWiederholungMinuten(0)).toBe(WIEDERHOLUNGEN_MINUTEN[0]);
  });
  it("formuliert den Stand für den Alarm", () => {
    expect(standText(1)).toBe("Versuch 1 von 6 gescheitert, nächster automatisch in 3 Minuten.");
    expect(standText(7)).toContain("aufgegeben");
  });
});
