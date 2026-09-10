import { describe, it, expect } from "vitest";
import { erkenneBildTyp } from "./bildpruefung.js";

const auffuellen = (kopf: number[] | Buffer) => Buffer.concat([Buffer.from(kopf), Buffer.alloc(64, 7)]);

describe("erkenneBildTyp (Magic Bytes, F-04)", () => {
  it("erkennt JPEG, PNG, WebP und GIF an den ersten Bytes", () => {
    expect(erkenneBildTyp(auffuellen([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(erkenneBildTyp(auffuellen([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
    expect(erkenneBildTyp(auffuellen(webp))).toBe("image/webp");
    expect(erkenneBildTyp(auffuellen(Buffer.from("GIF89a")))).toBe("image/gif");
  });

  it("weist HTML, SVG, PDF und umbenannte Dateien ab", () => {
    expect(erkenneBildTyp(auffuellen(Buffer.from("<!doctype html><script>")))).toBeNull();
    expect(erkenneBildTyp(auffuellen(Buffer.from("<svg xmlns=")))).toBeNull();
    expect(erkenneBildTyp(auffuellen(Buffer.from("%PDF-1.7")))).toBeNull();
    expect(erkenneBildTyp(auffuellen(Buffer.from("RIFF....WAVE")))).toBeNull(); // RIFF, aber kein WebP
    expect(erkenneBildTyp(Buffer.from([0xff, 0xd8]))).toBeNull(); // zu kurz
  });
});
