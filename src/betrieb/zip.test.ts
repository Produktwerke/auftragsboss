import { describe, it, expect } from "vitest";
import { erzeugeZip, liesZip } from "./zip.js";

describe("ZIP-Schreiber", () => {
  it("packt Texte und Binärdaten und liest sie identisch zurück", () => {
    const text = "Hallo Welt, ".repeat(200);
    const bin = Buffer.from(Array.from({ length: 512 }, (_, i) => (i * 37) % 256));
    const zip = erzeugeZip([
      { pfad: "LIESMICH.txt", inhalt: text },
      { pfad: "angebote/ANG-2026-0001.json", inhalt: JSON.stringify({ a: 1, ü: "ö" }) },
      { pfad: "fotos/wand1.bin", inhalt: bin },
    ]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    const zurueck = liesZip(zip);
    expect(zurueck.map((e) => e.pfad)).toEqual(["LIESMICH.txt", "angebote/ANG-2026-0001.json", "fotos/wand1.bin"]);
    expect(zurueck[0]!.inhalt.toString("utf8")).toBe(text);
    expect(JSON.parse(zurueck[1]!.inhalt.toString("utf8"))).toEqual({ a: 1, ü: "ö" });
    expect(Buffer.compare(zurueck[2]!.inhalt, bin)).toBe(0);
    // Wiederholter Text wird komprimiert
    expect(zip.length).toBeLessThan(text.length + bin.length);
  });

  it("leeres Archiv ist gültig", () => {
    const zip = erzeugeZip([]);
    expect(zip.length).toBe(22);
    expect(liesZip(zip)).toEqual([]);
  });
});
