// Vorprüfung einer DOCX-Datei (= Zip-Archiv), Nach-Audit 10.09., D-06.
//
// Ein 15-MB-Upload darf entpackt nicht beliebig groß werden („Zip-Bombe"):
// Vor dem Auslesen durch mammoth wird das zentrale Inhaltsverzeichnis des
// Archivs gelesen (nur Kopfdaten, nichts wird entpackt) und die angekündigte
// Gesamtgröße samt Anzahl der Einträge gegen feste Grenzen geprüft. Zip64-
// Archive (Größen jenseits 4 GB, Marker 0xFFFFFFFF) werden grundsätzlich abgewiesen.

export const DOCX_MAX_ENTPACKT_BYTES = 50 * 1024 * 1024;
export const DOCX_MAX_EINTRAEGE = 2000;

export type ZipPruefung =
  | { ok: true; eintraege: number; entpacktBytes: number }
  | { ok: false; grund: string };

const EOCD_SIGNATUR = 0x06054b50;
const CD_SIGNATUR = 0x02014b50;

export function pruefeDocxArchiv(daten: Buffer): ZipPruefung {
  if (daten.length < 22 || daten.readUInt16LE(0) !== 0x4b50) {
    return { ok: false, grund: "Die Datei ist keine gültige Word-Datei (.docx)." };
  }
  // Ende-Verzeichnis-Satz: 22 Byte fest + bis zu 65535 Byte Kommentar, von hinten suchen.
  const start = Math.max(0, daten.length - 22 - 65535);
  let eocd = -1;
  for (let i = daten.length - 22; i >= start; i--) {
    if (daten.readUInt32LE(i) === EOCD_SIGNATUR) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { ok: false, grund: "Die Word-Datei ist beschädigt (kein Archiv-Ende gefunden)." };

  const eintraege = daten.readUInt16LE(eocd + 10);
  const cdGroesse = daten.readUInt32LE(eocd + 12);
  const cdStart = daten.readUInt32LE(eocd + 16);
  if (eintraege === 0xffff || cdGroesse === 0xffffffff || cdStart === 0xffffffff) {
    return { ok: false, grund: "Zip64-Archive werden nicht unterstützt." };
  }
  if (eintraege > DOCX_MAX_EINTRAEGE) {
    return { ok: false, grund: `Die Word-Datei enthält zu viele Teile (${eintraege}, max. ${DOCX_MAX_EINTRAEGE}).` };
  }
  if (cdStart + cdGroesse > daten.length) {
    return { ok: false, grund: "Die Word-Datei ist beschädigt (Inhaltsverzeichnis außerhalb der Datei)." };
  }

  let pos = cdStart;
  let summe = 0;
  for (let i = 0; i < eintraege; i++) {
    if (pos + 46 > daten.length || daten.readUInt32LE(pos) !== CD_SIGNATUR) {
      return { ok: false, grund: "Die Word-Datei ist beschädigt (Inhaltsverzeichnis unlesbar)." };
    }
    const komprimiert = daten.readUInt32LE(pos + 20);
    const entpackt = daten.readUInt32LE(pos + 24);
    if (komprimiert === 0xffffffff || entpackt === 0xffffffff) {
      return { ok: false, grund: "Zip64-Archive werden nicht unterstützt." };
    }
    summe += entpackt;
    if (summe > DOCX_MAX_ENTPACKT_BYTES) {
      return {
        ok: false,
        grund: `Die Word-Datei wäre entpackt zu groß (mehr als ${Math.round(DOCX_MAX_ENTPACKT_BYTES / 1024 / 1024)} MB).`,
      };
    }
    const nameLen = daten.readUInt16LE(pos + 28);
    const extraLen = daten.readUInt16LE(pos + 30);
    const kommentarLen = daten.readUInt16LE(pos + 32);
    pos += 46 + nameLen + extraLen + kommentarLen;
  }
  return { ok: true, eintraege, entpacktBytes: summe };
}
