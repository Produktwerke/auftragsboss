// Lädt das Firmenlogo und bestimmt die Anzeigegröße.
//
// Handwerkerlogos kommen in allen Formaten — quadratisch, breit, hochkant.
// Deshalb wird nie fest skaliert, sondern immer in einen Rahmen eingepasst:
// die Höhe begrenzt hochformatige Logos, die Breite die breiten. So sieht
// der Briefkopf mit jedem hochgeladenen Logo ordentlich aus.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Maximale Ausmaße im Briefkopf, in Pixeln bei 96 dpi (Word-Maßstab). */
const MAX_BREITE = 190; // ca. 50 mm
const MAX_HOEHE = 90; // ca. 24 mm

export type LogoTyp = "jpg" | "png" | "gif" | "bmp";

export interface Logo {
  daten: Buffer;
  typ: LogoTyp;
  breite: number;
  hoehe: number;
  /** Base64-Data-URL für die Anzeige im Browser und in E-Mails. */
  dataUrl: string;
}

const MIME: Record<LogoTyp, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  bmp: "image/bmp",
};

/** Liest die Bildmaße direkt aus dem Dateikopf — ohne zusätzliche Bibliothek. */
function leseMasse(daten: Buffer, typ: LogoTyp): { breite: number; hoehe: number } | null {
  try {
    if (typ === "png") {
      // PNG: IHDR-Block ab Byte 16, je 4 Byte Breite und Höhe
      return { breite: daten.readUInt32BE(16), hoehe: daten.readUInt32BE(20) };
    }
    if (typ === "jpg") {
      // JPEG: Segmente durchlaufen, bis ein SOF-Marker kommt (enthält die Maße)
      let pos = 2;
      while (pos < daten.length - 9) {
        if (daten[pos] !== 0xff) {
          pos++;
          continue;
        }
        const marker = daten[pos + 1]!;
        // SOF0..SOF15, ohne DHT (c4), DNL (c8) und DAC (cc)
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { hoehe: daten.readUInt16BE(pos + 5), breite: daten.readUInt16BE(pos + 7) };
        }
        pos += 2 + daten.readUInt16BE(pos + 2);
      }
    }
  } catch {
    // Kaputter Header — dann eben mit dem Standardmaß weiterarbeiten
  }
  return null;
}

/** Passt das Logo unter Beibehaltung des Seitenverhältnisses in den Rahmen ein. */
function passeEin(breite: number, hoehe: number): { breite: number; hoehe: number } {
  const faktor = Math.min(MAX_BREITE / breite, MAX_HOEHE / hoehe, 1);
  return {
    breite: Math.round(breite * faktor),
    hoehe: Math.round(hoehe * faktor),
  };
}

/**
 * Lädt das Logo. Gibt null zurück, wenn keins hinterlegt ist oder die Datei
 * fehlt — der Briefkopf funktioniert auch ohne, nur mit dem Firmennamen.
 */
export function ladeLogo(dateiname: string): Logo | null {
  if (!dateiname.trim()) return null;

  const pfad = resolve(dateiname);
  if (!existsSync(pfad)) {
    console.warn(`⚠️  Logo nicht gefunden: ${pfad} — Briefkopf wird ohne Logo erzeugt.`);
    return null;
  }

  const endung = dateiname.split(".").pop()?.toLowerCase() ?? "";
  const typ: LogoTyp | null =
    endung === "jpg" || endung === "jpeg"
      ? "jpg"
      : endung === "png"
        ? "png"
        : endung === "gif"
          ? "gif"
          : endung === "bmp"
            ? "bmp"
            : null;

  if (!typ) {
    console.warn(`⚠️  Logo-Format "${endung}" wird nicht unterstützt (jpg, png, gif, bmp).`);
    return null;
  }

  const daten = readFileSync(pfad);
  const masse = leseMasse(daten, typ) ?? { breite: MAX_BREITE, hoehe: MAX_HOEHE };
  const { breite, hoehe } = passeEin(masse.breite, masse.hoehe);

  return {
    daten,
    typ,
    breite,
    hoehe,
    dataUrl: `data:${MIME[typ]};base64,${daten.toString("base64")}`,
  };
}
