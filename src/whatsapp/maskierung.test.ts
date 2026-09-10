import { describe, it, expect } from "vitest";
import { maskiereNummer } from "./maskierung.js";

describe("maskiereNummer (S-10)", () => {
  it("lässt Vorwahl und die letzten zwei Ziffern stehen", () => {
    expect(maskiereNummer("491749364823")).toBe("4917******23");
    expect(maskiereNummer("+49 174 9364823")).toBe("4917******23");
  });
  it("gibt bei kurzen oder leeren Werten nichts Verwertbares preis", () => {
    expect(maskiereNummer("12345")).toBe("***");
    expect(maskiereNummer("")).toBe("(leer)");
    expect(maskiereNummer(undefined)).toBe("(leer)");
  });
});
