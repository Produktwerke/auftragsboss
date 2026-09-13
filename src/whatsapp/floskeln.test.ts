import { describe, it, expect } from "vitest";
import { floskel, floskelVarianten } from "./floskeln.js";

describe("floskel", () => {
  it("wiederholt für dieselbe Nummer nie zweimal hintereinander dieselbe Variante", () => {
    let vorher = floskel("foto", "4917");
    for (let i = 0; i < 50; i++) {
      const jetzt = floskel("foto", "4917");
      expect(jetzt).not.toBe(vorher);
      vorher = jetzt;
    }
  });
  it("liefert nur bekannte Varianten", () => {
    for (let i = 0; i < 20; i++) {
      expect(floskelVarianten("spracheNeu")).toContain(floskel("spracheNeu"));
      expect(floskelVarianten("text")).toContain(floskel("text"));
    }
  });
});
