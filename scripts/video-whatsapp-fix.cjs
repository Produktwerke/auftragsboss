#!/usr/bin/env node
// Bringt eine MP4-Datei in den Aufbau, den WhatsApp auf dem Handy annimmt, ohne Bild und Ton neu
// zu berechnen: zuerst ftyp, dann das Inhaltsverzeichnis (moov), dann die Daten (mdat). Fremde
// Blöcke auf oberster Ebene (z. B. der „uuid"-Block der Windows-Umwandlung) entfallen.
//
// Anlass (02.10.2026): Das mit scripts/video-h264.ps1 erzeugte Erklärvideo ging an zehn Leads und
// an Dirk. Beim Antippen meldete WhatsApp „Dieses Video ist nicht verfügbar, da mit der Videodatei
// etwas nicht stimmt". Die Datei hatte ftyp, uuid, mdat, moov (Inhaltsverzeichnis am Ende).
//
//   node scripts/video-whatsapp-fix.cjs marketing/eingang.mp4 marketing/auftragsboss-video.mp4
const fs = require("fs");

const [, , ein, aus] = process.argv;
if (!ein || !aus) {
  console.error("Aufruf: node scripts/video-whatsapp-fix.cjs <eingang.mp4> <ausgang.mp4>");
  process.exit(1);
}
const b = fs.readFileSync(ein);

/** Blöcke zwischen start und ende lesen: { typ, o (Anfang), gr (Größe), kopf (Kopflänge) }. */
function bloecke(buf, start, ende) {
  const liste = [];
  let o = start;
  while (o + 8 <= ende) {
    let gr = buf.readUInt32BE(o);
    const typ = buf.toString("latin1", o + 4, o + 8);
    let kopf = 8;
    if (gr === 1) {
      gr = Number(buf.readBigUInt64BE(o + 8));
      kopf = 16;
    } else if (gr === 0) {
      gr = ende - o;
    }
    if (gr < kopf || o + gr > ende) throw new Error(`Block ${JSON.stringify(typ)} bei ${o} ist beschädigt (Größe ${gr}).`);
    liste.push({ typ, o, gr, kopf });
    o += gr;
  }
  return liste;
}

const oben = bloecke(b, 0, b.length);
console.log("Vorher:  " + oben.map((x) => `${x.typ} (${x.gr})`).join(", "));
const nur = (typ) => {
  const treffer = oben.filter((x) => x.typ === typ);
  if (treffer.length !== 1) throw new Error(`Erwartet genau einen Block ${typ}, gefunden: ${treffer.length}.`);
  return treffer[0];
};
const ftyp = nur("ftyp");
const moov = nur("moov");
const mdat = nur("mdat");

const moovNeu = Buffer.from(b.subarray(moov.o, moov.o + moov.gr)); // Kopie, wird angepasst
const mdatNeuAnfang = ftyp.gr + moov.gr;
const verschiebung = mdatNeuAnfang - mdat.o;
const datenVon = mdat.o + mdat.kopf;
const datenBis = mdat.o + mdat.gr;
let angepasst = 0;

/** Im Inhaltsverzeichnis stehen die Fundstellen der Daten als Dateipositionen: alle verschieben. */
function passeAn(buf, start, ende) {
  for (const x of bloecke(buf, start, ende)) {
    if (["trak", "mdia", "minf", "stbl"].includes(x.typ)) {
      passeAn(buf, x.o + x.kopf, x.o + x.gr);
    } else if (x.typ === "stco") {
      const n = buf.readUInt32BE(x.o + x.kopf + 4);
      for (let i = 0; i < n; i++) {
        const p = x.o + x.kopf + 8 + i * 4;
        const alt = buf.readUInt32BE(p);
        if (alt < datenVon || alt >= datenBis) throw new Error(`Fundstelle ${alt} liegt nicht im Datenblock.`);
        buf.writeUInt32BE(alt + verschiebung, p);
        angepasst++;
      }
    } else if (x.typ === "co64") {
      const n = buf.readUInt32BE(x.o + x.kopf + 4);
      for (let i = 0; i < n; i++) {
        const p = x.o + x.kopf + 8 + i * 8;
        const alt = Number(buf.readBigUInt64BE(p));
        if (alt < datenVon || alt >= datenBis) throw new Error(`Fundstelle ${alt} liegt nicht im Datenblock.`);
        buf.writeBigUInt64BE(BigInt(alt + verschiebung), p);
        angepasst++;
      }
    }
  }
}
passeAn(moovNeu, 8, moovNeu.length);
if (angepasst === 0) throw new Error("Keine Fundstellen gefunden (stco/co64 fehlen), Datei nicht umgebaut.");

const ergebnis = Buffer.concat([b.subarray(ftyp.o, ftyp.o + ftyp.gr), moovNeu, b.subarray(mdat.o, mdat.o + mdat.gr)]);
fs.writeFileSync(aus, ergebnis);

const nachher = bloecke(ergebnis, 0, ergebnis.length);
const entfallen = oben.filter((x) => !["ftyp", "moov", "mdat"].includes(x.typ)).map((x) => x.typ);
console.log("Nachher: " + nachher.map((x) => `${x.typ} (${x.gr})`).join(", "));
console.log(`${angepasst} Fundstellen um ${verschiebung} Bytes verschoben${entfallen.length ? `, entfernt: ${entfallen.join(", ")}` : ""}.`);
console.log(`Geschrieben: ${aus} (${(ergebnis.length / 1024 / 1024).toFixed(2)} MB)`);
