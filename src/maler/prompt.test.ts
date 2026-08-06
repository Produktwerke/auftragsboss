import { describe, it, expect } from "vitest";
import { malerFachwissen } from "./prompt.js";

describe("malerFachwissen: Fachwissen-Block aus der Wissensbasis", () => {
  const block = malerFachwissen();

  it("enthält die Positionsbibliothek mit Fach-Benennungen", () => {
    expect(block).toContain("Positionsbibliothek");
    expect(block).toContain("Grundierung auftragen");
    expect(block).toContain("Türen lackieren");
  });

  it("enthält die wichtigsten Pflicht-Rückfragen (A)", () => {
    expect(block).toMatch(/Fläche/);
  });

  it("nennt die Scope-Grenze (außerhalb v0)", () => {
    expect(block.toLowerCase()).toContain("fassade");
  });
});
