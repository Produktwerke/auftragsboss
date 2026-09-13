import { describe, it, expect } from "vitest";
import { istAbschluss } from "./dialog.js";

describe("istAbschluss (Notfallnetz)", () => {
  it("erkennt kurze Abschlusswörter", () => {
    expect(istAbschluss("passt")).toBe(true);
    expect(istAbschluss("mach fertig")).toBe(true);
  });
  it("wertet ein langes Diktat nicht als Abschluss", () => {
    expect(istAbschluss("dann machen wir weiter mit der Decke und den Fensterlaibungen im Bad")).toBe(false);
  });
});
