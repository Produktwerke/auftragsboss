// Minimaler ZIP-Schreiber ohne Abhängigkeit (17.09.2026, Datenexport).
// Erzeugt ein Standard-ZIP (PKZIP 2.0, Deflate) im Speicher. Reicht für den
// Datenexport eines Betriebs (Dateien im MB-Bereich); keine Verschlüsselung,
// kein ZIP64 (Grenze 4 GB je Datei, weit außerhalb unserer Größen).
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

export interface ZipEintrag {
  /** Pfad im Archiv, mit "/" als Trenner, ohne führenden Schrägstrich. */
  pfad: string;
  inhalt: Buffer | string;
  /** Änderungszeit im Archiv (Standard: jetzt). */
  zeit?: Date;
}

function dosZeit(d: Date): { zeit: number; datum: number } {
  const jahr = Math.max(1980, d.getFullYear());
  const datum = ((jahr - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const zeit = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  return { zeit, datum };
}

/** Baut das ZIP-Archiv aus den Einträgen (Reihenfolge bleibt erhalten). */
export function erzeugeZip(eintraege: ZipEintrag[]): Buffer {
  const lokal: Buffer[] = [];
  const zentral: Buffer[] = [];
  let offset = 0;

  for (const e of eintraege) {
    const name = Buffer.from(e.pfad.replace(/\\/g, "/").replace(/^\/+/, ""), "utf8");
    const daten = Buffer.isBuffer(e.inhalt) ? e.inhalt : Buffer.from(e.inhalt, "utf8");
    const gepackt = deflateRawSync(daten);
    // Nur packen, wenn es sich lohnt (Bilder/PDFs sind meist schon komprimiert).
    const deflate = gepackt.length < daten.length;
    const nutz = deflate ? gepackt : daten;
    const methode = deflate ? 8 : 0;
    const pruef = crc32(daten) >>> 0;
    const { zeit, datum } = dosZeit(e.zeit ?? new Date());
    const flags = 0x0800; // UTF-8-Dateinamen

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(flags, 6);
    lh.writeUInt16LE(methode, 8);
    lh.writeUInt16LE(zeit, 10);
    lh.writeUInt16LE(datum, 12);
    lh.writeUInt32LE(pruef, 14);
    lh.writeUInt32LE(nutz.length, 18);
    lh.writeUInt32LE(daten.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(flags, 8);
    ch.writeUInt16LE(methode, 10);
    ch.writeUInt16LE(zeit, 12);
    ch.writeUInt16LE(datum, 14);
    ch.writeUInt32LE(pruef, 16);
    ch.writeUInt32LE(nutz.length, 20);
    ch.writeUInt32LE(daten.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt16LE(0, 30); // extra
    ch.writeUInt16LE(0, 32); // Kommentar
    ch.writeUInt16LE(0, 34); // Disk
    ch.writeUInt16LE(0, 36); // interne Attribute
    ch.writeUInt32LE(0, 38); // externe Attribute
    ch.writeUInt32LE(offset, 42);

    lokal.push(lh, name, nutz);
    zentral.push(ch, name);
    offset += lh.length + name.length + nutz.length;
  }

  const zentralGroesse = zentral.reduce((s, b) => s + b.length, 0);
  const ende = Buffer.alloc(22);
  ende.writeUInt32LE(0x06054b50, 0);
  ende.writeUInt16LE(0, 4);
  ende.writeUInt16LE(0, 6);
  ende.writeUInt16LE(eintraege.length, 8);
  ende.writeUInt16LE(eintraege.length, 10);
  ende.writeUInt32LE(zentralGroesse, 12);
  ende.writeUInt32LE(offset, 16);
  ende.writeUInt16LE(0, 20);

  return Buffer.concat([...lokal, ...zentral, ende]);
}

/** Liest ein von erzeugeZip gebautes Archiv zurück (nur für Tests und Selbstprüfung). */
export function liesZip(zip: Buffer): Array<{ pfad: string; inhalt: Buffer }> {
  const ergebnis: Array<{ pfad: string; inhalt: Buffer }> = [];
  let pos = 0;
  while (pos + 30 <= zip.length && zip.readUInt32LE(pos) === 0x04034b50) {
    const methode = zip.readUInt16LE(pos + 8);
    const groesseGepackt = zip.readUInt32LE(pos + 18);
    const nameLen = zip.readUInt16LE(pos + 26);
    const extraLen = zip.readUInt16LE(pos + 28);
    const pfad = zip.subarray(pos + 30, pos + 30 + nameLen).toString("utf8");
    const start = pos + 30 + nameLen + extraLen;
    const roh = zip.subarray(start, start + groesseGepackt);
    ergebnis.push({ pfad, inhalt: methode === 8 ? inflateRawSync(roh) : Buffer.from(roh) });
    pos = start + groesseGepackt;
  }
  return ergebnis;
}
