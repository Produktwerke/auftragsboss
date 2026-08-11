import { describe, it, expect } from "vitest";
import { geraetAusUA } from "./event.js";

describe("geraetAusUA: grobe Geräteklasse (PII-frei)", () => {
  it("erkennt Handys", () => {
    expect(geraetAusUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) …")).toBe("mobil");
    expect(geraetAusUA("Mozilla/5.0 (Linux; Android 14; Pixel 8) …Mobile Safari")).toBe("mobil");
  });
  it("erkennt Desktops", () => {
    expect(geraetAusUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64) …Chrome/120")).toBe("desktop");
    expect(geraetAusUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) …Safari")).toBe("desktop");
  });
  it("fällt bei fehlendem User-Agent sauber auf 'unbekannt'", () => {
    expect(geraetAusUA(undefined)).toBe("unbekannt");
    expect(geraetAusUA("")).toBe("unbekannt");
  });
});
