import { describe, it, expect } from "vitest";
import { pruefeDocxArchiv, DOCX_MAX_ENTPACKT_BYTES, DOCX_MAX_EINTRAEGE } from "./zipPruefung.js";
import { kappeText, TEXT_MAX_ZEICHEN } from "./extraktion.js";

/** Baut ein minimales Zip nur aus zentralem Verzeichnis + Ende-Satz (die Prüfung
 *  liest nichts anderes). Größen sind frei wählbar, so lässt sich eine „Bombe" nachstellen. */
function bauZip(eintraege: Array<{ name: string; entpackt: number; komprimiert?: number }>, optionen: { zip64?: boolean } = {}): Buffer {
  const lokal = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // Platzhalter für einen lokalen Kopf
  const cd: Buffer[] = [];
  for (const e of eintraege) {
    const kopf = Buffer.alloc(46);
    kopf.writeUInt32LE(0x02014b50, 0);
    kopf.writeUInt32LE(optionen.zip64 ? 0xffffffff : (e.komprimiert ?? e.entpackt), 20);
    kopf.writeUInt32LE(optionen.zip64 ? 0xffffffff : e.entpackt, 24);
    kopf.writeUInt16LE(Buffer.byteLength(e.name), 28);
    cd.push(kopf, Buffer.from(e.name));
  }
  const cdBuf = Buffer.concat(cd);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(eintraege.length, 8);
  eocd.writeUInt16LE(eintraege.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(lokal.length, 16);
  return Buffer.concat([lokal, cdBuf, eocd]);
}

describe("pruefeDocxArchiv (Zip-Vorprüfung, D-06)", () => {
  it("akzeptiert ein normales DOCX-Archiv", () => {
    const zip = bauZip([
      { name: "[Content_Types].xml", entpackt: 1500 },
      { name: "word/document.xml", entpackt: 120_000, komprimiert: 9_000 },
      { name: "word/styles.xml", entpackt: 30_000 },
    ]);
    expect(pruefeDocxArchiv(zip)).toEqual({ ok: true, eintraege: 3, entpacktBytes: 151_500 });
  });

  it("weist eine Zip-Bombe anhand der angekündigten Entpackgröße ab", () => {
    const zip = bauZip([
      { name: "word/document.xml", entpackt: DOCX_MAX_ENTPACKT_BYTES - 10 },
      { name: "word/media/image1.png", entpackt: 1000 },
    ]);
    const p = pruefeDocxArchiv(zip);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.grund).toMatch(/entpackt zu groß/);
  });

  it("weist Zip64 und zu viele Einträge ab", () => {
    const z64 = pruefeDocxArchiv(bauZip([{ name: "a", entpackt: 5 }], { zip64: true }));
    expect(z64.ok).toBe(false);
    if (!z64.ok) expect(z64.grund).toMatch(/Zip64/);
    const viele = bauZip(Array.from({ length: DOCX_MAX_EINTRAEGE + 1 }, (_, i) => ({ name: `f${i}`, entpackt: 1 })));
    const v = pruefeDocxArchiv(viele);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.grund).toMatch(/zu viele Teile/);
  });

  it("weist Nicht-Archive und kaputte Verzeichnisse ab", () => {
    expect(pruefeDocxArchiv(Buffer.from("%PDF-1.7 ......................")).ok).toBe(false);
    expect(pruefeDocxArchiv(Buffer.from("PK kein Ende-Satz hier drin, nur Text")).ok).toBe(false);
    const zip = bauZip([{ name: "a", entpackt: 5 }]);
    zip.writeUInt32LE(0xdeadbeef, 4); // zentrales Verzeichnis überschreiben → Signatur falsch
    expect(pruefeDocxArchiv(zip).ok).toBe(false);
  });
});

describe("kappeText", () => {
  it("kürzt überlangen Text und markiert das Ergebnis als prüfbedürftig", () => {
    const lang = "x".repeat(TEXT_MAX_ZEICHEN + 500);
    const e = kappeText({ text: lang, methode: "text", konfidenz: "high", seitenzahl: 3, manuellePruefungNoetig: false });
    expect(e.text.length).toBe(TEXT_MAX_ZEICHEN);
    expect(e.manuellePruefungNoetig).toBe(true);
    expect(e.hinweis).toMatch(/abgeschnitten/);
  });
  it("lässt kurzen Text unverändert", () => {
    const e = { text: "kurz", methode: "text" as const, konfidenz: "high" as const, seitenzahl: 1, manuellePruefungNoetig: false };
    expect(kappeText(e)).toBe(e);
  });
});
