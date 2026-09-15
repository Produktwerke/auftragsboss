import { describe, it, expect } from "vitest";
import { tarifAusFormular, WHATSAPP_LINK } from "./testStartRoutes.js";

describe("Test starten von der Landingpage", () => {
  it("nimmt nur die drei Tarife an", () => {
    expect(tarifAusFormular("Profi")).toBe("profi");
    expect(tarifAusFormular("team")).toBe("team");
    expect(tarifAusFormular("gold")).toBeNull();
    expect(tarifAusFormular(undefined)).toBeNull();
  });
  it("WhatsApp-Ausweg zeigt auf die Produktionsnummer mit vorgefülltem Text", () => {
    expect(WHATSAPP_LINK).toContain("wa.me/491749364823");
    expect(decodeURIComponent(WHATSAPP_LINK)).toContain("14 Tage kostenlos testen");
  });
});
