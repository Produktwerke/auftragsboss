// Aufmaßblatt als Anlage zum Word-Angebot (Teiletappe 3).
//
// Je Raum die Maße und die VOB-Behandlung der Öffnungen (aus den Aufmaßnotizen)
// und darunter die Wandfotos als Belegbilder mit dem, was darauf erkannt wurde.
// So kann der Kunde die Flächen nachvollziehen, und der Maler hat sein Aufmaß
// mit Fotos dokumentiert, falls es später Diskussionen gibt.
//
// Die Fotos sind Kundendaten: sie liegen unter uploads/ und werden hier nur
// gelesen. Fehlt eine Datei (z.B. nach DSGVO-Löschung), fällt sie still weg.
import type { Foto, PrismaClient } from "@prisma/client";
import {
  BorderStyle,
  HeadingLevel,
  ImageRun,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { liesFoto } from "../betrieb/fotoAblage.js";
import { leseMasse } from "../betrieb/logo.js";
import { fotoProbleme, oeffnungenBeschreibung, unsichereOeffnungen, type WandfotoAnalyse } from "../ai/wandfoto.js";

export interface Belegfoto {
  id: string;
  raum: string | null;
  wandNr: number;
  /** Was die Bildauswertung gesehen hat, ein kurzer Satz für die Bildunterschrift. */
  beschreibung: string;
  daten: Buffer;
  typ: "jpg" | "png";
  breite: number;
  hoehe: number;
}

export interface AufmassAnlage {
  notizen: string | null;
  fotos: Belegfoto[];
}

/** Bildunterschrift aus der gespeicherten Erkennung, ohne Rechnen. */
export function fotoBeschreibung(erkennungJson: string): string {
  let a: WandfotoAnalyse;
  try {
    a = JSON.parse(erkennungJson) as WandfotoAnalyse;
  } catch {
    return "";
  }
  if (!a || !Array.isArray(a.oeffnungen)) return "";
  const teile: string[] = [];
  const oeff = oeffnungenBeschreibung(a);
  teile.push(oeff.length ? oeff.join("; ") : "keine Öffnungen");
  const rand = unsichereOeffnungen(a);
  if (rand.length) teile.push(`am Bildrand: ${rand.length} Öffnung${rand.length > 1 ? "en" : ""} der Nachbarwand`);
  if (Array.isArray(a.besonderheiten) && a.besonderheiten.length) teile.push(a.besonderheiten.join(", "));
  for (const p of fotoProbleme(a)) if (p.schwere === "hinweis") teile.push(p.text.replace(/\.$/, ""));
  return teile.join(". ");
}

const TYP_JE_MIME: Record<string, Belegfoto["typ"]> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
};

/** Liest die Belegfotos eines Dokuments von der Platte; fehlende oder unlesbare Dateien fallen weg. */
export function belegfotosAus(fotos: Foto[]): Belegfoto[] {
  const ergebnis: Belegfoto[] = [];
  for (const f of fotos) {
    const typ = TYP_JE_MIME[f.mimeType.toLowerCase()];
    if (!typ || !f.datei) continue; // Word kennt kein WebP; solche Fotos bleiben im Editor sichtbar
    const daten = liesFoto(f.datei);
    if (!daten) continue;
    const masse = leseMasse(daten, typ) ?? { breite: 4, hoehe: 3 };
    ergebnis.push({
      id: f.id,
      raum: f.raum,
      wandNr: f.wandNr,
      beschreibung: fotoBeschreibung(f.erkennungJson),
      daten,
      typ,
      breite: masse.breite,
      hoehe: masse.hoehe,
    });
  }
  return ergebnis;
}

/** Lädt Notizen und Belegfotos eines Dokuments für Word-Export und Editor. */
export async function ladeAufmassAnlage(
  prisma: PrismaClient,
  dokument: { id: string; aufmassNotizen: string | null },
): Promise<AufmassAnlage> {
  const fotos = await prisma.foto.findMany({
    where: { dokumentId: dokument.id },
    orderBy: [{ raum: "asc" }, { wandNr: "asc" }, { erstelltAm: "asc" }],
  });
  return { notizen: dokument.aufmassNotizen, fotos: belegfotosAus(fotos) };
}

/** Gibt es überhaupt etwas für eine Anlage? */
export function anlageVorhanden(anlage: AufmassAnlage | undefined | null): anlage is AufmassAnlage {
  return !!anlage && (!!anlage.notizen?.trim() || anlage.fotos.length > 0);
}

const GRAU = "666666";
/** Bildbreite in Pixeln bei 96 dpi (zwei Bilder nebeneinander auf A4 mit den Seitenrändern des Angebots). */
const BILD_BREITE = 300;
const BILD_MAX_HOEHE = 260;

const OHNE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;

function bildZelle(f: Belegfoto | undefined): TableCell {
  if (!f) {
    return new TableCell({ borders: { top: OHNE, bottom: OHNE, left: OHNE, right: OHNE }, children: [new Paragraph({ children: [] })] });
  }
  const faktor = Math.min(BILD_BREITE / f.breite, BILD_MAX_HOEHE / f.hoehe);
  const breite = Math.round(f.breite * faktor);
  const hoehe = Math.round(f.hoehe * faktor);
  const titel = `${f.raum ? f.raum + ", " : ""}Wand ${f.wandNr}`;
  return new TableCell({
    borders: { top: OHNE, bottom: OHNE, left: OHNE, right: OHNE },
    margins: { top: 60, bottom: 160, left: 60, right: 60 },
    children: [
      new Paragraph({
        spacing: { after: 60 },
        children: [new ImageRun({ data: f.daten, type: f.typ, transformation: { width: breite, height: hoehe } })],
      }),
      new Paragraph({
        spacing: { after: 0 },
        children: [
          new TextRun({ text: titel, bold: true, size: 16 }),
          ...(f.beschreibung ? [new TextRun({ text: `: ${f.beschreibung}`, size: 16, color: GRAU })] : []),
        ],
      }),
    ],
  });
}

/** Die Anlage als Word-Absätze: neue Seite, Überschrift, Notizen je Raum, Fotos in zwei Spalten. */
export function aufmassAnlage(anlage: AufmassAnlage, akzent: string): (Paragraph | Table)[] {
  const kinder: (Paragraph | Table)[] = [
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      spacing: { after: 60 },
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "Anlage: Aufmaß", bold: true, size: 26, color: akzent })],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: "Flächen nach VOB/C DIN 18363: Öffnungen bis 2,5 m² werden übermessen, größere abgezogen. Fotomaße sind Schätzungen zur Einordnung.",
          size: 16,
          color: GRAU,
        }),
      ],
    }),
  ];

  for (const zeile of (anlage.notizen ?? "").split(/\r?\n/)) {
    const t = zeile.trim();
    if (!t) continue;
    // "Raum (Höhe …): Details" → Raumname fett, Rest normal
    const i = t.indexOf("): ");
    const kopf = i > 0 ? t.slice(0, i + 1) : "";
    const rest = i > 0 ? t.slice(i + 3) : t;
    kinder.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          ...(kopf ? [new TextRun({ text: kopf + ": ", bold: true, size: 18 })] : []),
          new TextRun({ text: rest, size: 18 }),
        ],
      }),
    );
  }

  if (anlage.fotos.length) {
    kinder.push(
      new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [new TextRun({ text: "Belegfotos", bold: true, size: 18 })],
      }),
    );
    const zeilen: TableRow[] = [];
    for (let i = 0; i < anlage.fotos.length; i += 2) {
      zeilen.push(new TableRow({ cantSplit: true, children: [bildZelle(anlage.fotos[i]), bildZelle(anlage.fotos[i + 1])] }));
    }
    kinder.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [4900, 4900],
        borders: { top: OHNE, bottom: OHNE, left: OHNE, right: OHNE, insideHorizontal: OHNE, insideVertical: OHNE },
        rows: zeilen,
      }),
    );
  }
  return kinder;
}
