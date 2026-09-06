import { describe, expect, it } from "vitest";
import { ordneFotoZu } from "./fotoZuordnung.js";

const vorgang = {
  raeumeText:
    "Raum: Wohnzimmer; Höhe: 2,52; Wände: 4,49 x 4,36; Decke: ja; Öffnungen: keine\n" +
    "Raum: Küche; Höhe: 2,49; Wände: 3,20 x 5,10; Decke: nein; Öffnungen: keine",
};

describe("ordneFotoZu", () => {
  it("ohne Unterschrift: zuletzt genannter Raum samt Höhe", () => {
    expect(ordneFotoZu(vorgang, undefined)).toEqual({ raumName: "Küche", raumhoeheM: 2.49, wandNrAusText: null });
  });
  it("Unterschrift nennt bekannten Raum und Wandnummer", () => {
    expect(ordneFotoZu(vorgang, "wohnzimmer Wand 3")).toEqual({ raumName: "Wohnzimmer", raumhoeheM: 2.52, wandNrAusText: 3 });
  });
  it("Unterschrift mit unbekanntem Raum wird als Raumname übernommen, ohne Höhe", () => {
    expect(ordneFotoZu(vorgang, "Bad, Wand 2")).toEqual({ raumName: "Bad", raumhoeheM: null, wandNrAusText: 2 });
  });
  it("ohne Vorgang und ohne Unterschrift: nichts zuordnen", () => {
    expect(ordneFotoZu(null, "")).toEqual({ raumName: null, raumhoeheM: null, wandNrAusText: null });
    expect(ordneFotoZu(null, "Wand 1")).toEqual({ raumName: null, raumhoeheM: null, wandNrAusText: 1 });
  });
});
