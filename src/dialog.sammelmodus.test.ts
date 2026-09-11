import { describe, it, expect } from "vitest";
import { istFertigWunsch, istBestaetigung, raumBilanz } from "./dialog.js";

describe("istFertigWunsch (Sammelmodus)", () => {
  it("erkennt kurze Abschlusswünsche in Sprache und Text", () => {
    for (const t of ["Fertig.", "fertig", "Das war's!", "Das wars", "Mach das Angebot", "Angebot machen", "Schick mir das Angebot", "Alles drin, fertig", "So, das war's dann."]) {
      expect(istFertigWunsch(t), t).toBe(true);
    }
  });
  it("wertet Diktate mit dem Wort fertig nicht als Abschluss", () => {
    expect(istFertigWunsch("Dann das Dachzimmer, Höhe 2,40, Wände 4,20 mit Kniestock, wenn das fertig ist streichen wir auch noch die Decke")).toBe(false);
    expect(istFertigWunsch("Kinderzimmer rechts, Höhe 2,50, Wände 3,99 mal 3,90, Wände komplett streichen")).toBe(false);
    expect(istFertigWunsch("")).toBe(false);
  });
});

describe("istBestaetigung", () => {
  it("erkennt ja, passt, ok", () => {
    for (const t of ["ja", "Ja.", "Passt so", "ok", "Okay, danke", "stimmt", "ja genau"]) expect(istBestaetigung(t), t).toBe(true);
  });
  it("erkennt neuen Inhalt nicht als Bestätigung", () => {
    expect(istBestaetigung("ja und dann noch der Flur, Höhe 2,50")).toBe(false);
    expect(istBestaetigung("Kinderzimmer rechts, Höhe 2,50")).toBe(false);
  });
});

describe("raumBilanz", () => {
  const raeume =
    "Raum: Kinderzimmer links; Höhe: 2,55; Wände: 3,99 x 4,33; Decke: nein; Öffnungen: Fenster 1,70 x 2,35; Paneel: 0,97\n" +
    "Raum: Dachzimmer; Höhe: 2,40; Wände: 4,20 (1,20), 3,50, 4,20 (1,20), 3,50; Decke: 5,9; Öffnungen: keine; Schrägen: 4,20 x 2,10, 4,20 x 2,10";

  it("nennt den letzten Raum, zählt alle Räume und endet mit der Aufforderung", () => {
    const text = raumBilanz(raeume, "Nächster Raum? Oder sag *fertig*.");
    expect(text).not.toBeNull();
    expect(text).toMatch(/^✅ \*Dachzimmer\* ist drin\. Bisher 2 Räume:/);
    expect(text).toMatch(/• Kinderzimmer links: Wände [\d,]+ m² oberhalb der Paneele, [\d,]+ m² Öffnungen abgezogen/);
    expect(text).toMatch(/• Dachzimmer: Wände [\d,]+ m², davon 17,64 m² Dachschrägen, Decke 5,90 m²/);
    expect(text?.endsWith("Nächster Raum? Oder sag *fertig*.")).toBe(true);
    // Keine Eingangsmaße in der Bilanz (die stehen im Aufmaßblatt)
    expect(text).not.toMatch(/3,99 x 4,33/);
  });
  it("liefert null ohne Räume", () => {
    expect(raumBilanz(null, "x")).toBeNull();
    expect(raumBilanz("", "x")).toBeNull();
  });
});
