// Liest Breite/Höhe aller WhatsApp-JPEGs aus den SOF-Markern (ohne Fremdpakete).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function jpegMasse(datei) {
  const b = readFileSync(datei);
  let i = 2;
  while (i < b.length - 8) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { hoehe: b.readUInt16BE(i + 5), breite: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error("kein SOF-Marker: " + datei);
}

const hier = dirname(fileURLToPath(import.meta.url));
const wurzel = join(hier, "..");
const ergebnis = {};
for (const raum of readdirSync(wurzel).filter((d) => /^Raum\d\d$/.test(d))) {
  const ordner = join(wurzel, raum, "whatsapp");
  for (const datei of readdirSync(ordner).filter((f) => f.endsWith(".jpeg"))) {
    const m = jpegMasse(join(ordner, datei));
    ergebnis[`${raum}/${datei}`] = m;
    console.log(`${raum}/${datei}  ${m.breite}x${m.hoehe}`);
  }
}
writeFileSync(join(hier, "bildmasse.json"), JSON.stringify(ergebnis, null, 2));
console.log("→ bildmasse.json geschrieben");
