// Erzeugt das Angebot als bearbeitbare Word-Datei (.docx).
//
// Bewusst kundenfertig gehalten: Briefkopf, Anschreiben, Positionstabelle,
// Summenblock, Grußformel. Interne Notizen und Rückfragen gehören NICHT
// hier hinein — die stehen in der E-Mail an den Handwerker.
//
// Leere Preiszellen sind Absicht: der Handwerker klickt in Word hinein und
// tippt den Betrag. Sind Preise bekannt (diktiert oder aus der Preisliste),
// stehen sie bereits drin.
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { DokumentDaten } from "../ai/structure.js";
import type { Angebotssumme, BerechnetePosition } from "./berechnung.js";
import { euro, mengeMitEinheit } from "./berechnung.js";
import type { Preisliste } from "../preisliste.js";

const AKZENT = "0B5CAD";
const GRAU = "666666";

const datumDE = (d: Date) =>
  d.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });

/** Absatz aus mehrzeiligem Text — Word kennt kein \n innerhalb eines Runs. */
function textAbsaetze(text: string, groesse = 20): Paragraph[] {
  return text.split("\n").map(
    (zeile) =>
      new Paragraph({
        spacing: { after: zeile.trim() === "" ? 0 : 120 },
        children: [new TextRun({ text: zeile, size: groesse })],
      }),
  );
}

function zelle(opts: {
  text: string;
  fett?: boolean;
  rechts?: boolean;
  farbe?: string;
  hintergrund?: string;
  spalten?: number;
  obenLinie?: boolean;
}): TableCell {
  return new TableCell({
    columnSpan: opts.spalten,
    shading: opts.hintergrund ? { fill: opts.hintergrund } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    borders: opts.obenLinie
      ? { top: { style: BorderStyle.SINGLE, size: 12, color: AKZENT } }
      : undefined,
    children: [
      new Paragraph({
        alignment: opts.rechts ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [
          new TextRun({
            text: opts.text,
            bold: opts.fett,
            size: 19,
            color: opts.farbe,
          }),
        ],
      }),
    ],
  });
}

function positionsZeile(p: BerechnetePosition): TableRow {
  const menge =
    p.menge !== null || p.einheit === "pauschal"
      ? mengeMitEinheit(p.menge, p.einheit)
      : ""; // leer lassen — der Handwerker trägt die Menge in Word ein

  const beschreibung = p.mengeUnsicher
    ? `${p.beschreibung}  (Menge bitte prüfen)`
    : p.beschreibung;

  return new TableRow({
    children: [
      zelle({ text: String(p.nummer), rechts: true, farbe: GRAU }),
      zelle({ text: beschreibung }),
      zelle({ text: menge, rechts: true }),
      zelle({ text: p.einzelpreis !== null ? euro(p.einzelpreis) : "", rechts: true }),
      zelle({ text: p.gesamt !== null ? euro(p.gesamt) : "", rechts: true, fett: p.gesamt !== null }),
    ],
  });
}

function positionsTabelle(summe: Angebotssumme): Table {
  const kopf = new TableRow({
    tableHeader: true,
    children: (["Pos.", "Leistung", "Menge", "Einzelpreis", "Gesamt"] as const).map((t, i) =>
      zelle({
        text: t,
        fett: true,
        farbe: "FFFFFF",
        hintergrund: AKZENT,
        rechts: i !== 1,
      }),
    ),
  });

  // Summen nur ausweisen, wenn wirklich alle Preise stehen — sonst leer
  const betrag = (wert: number) => (summe.vollstaendig ? euro(wert) : "");

  const summenZeilen = [
    new TableRow({
      children: [
        zelle({ text: "Nettosumme", spalten: 4, rechts: true }),
        zelle({ text: betrag(summe.netto), rechts: true }),
      ],
    }),
    new TableRow({
      children: [
        zelle({ text: `zzgl. ${summe.mwstSatz} % MwSt.`, spalten: 4, rechts: true, farbe: GRAU }),
        zelle({ text: betrag(summe.mwstBetrag), rechts: true, farbe: GRAU }),
      ],
    }),
    new TableRow({
      children: [
        zelle({ text: "Gesamtbetrag", spalten: 4, rechts: true, fett: true, obenLinie: true }),
        zelle({ text: betrag(summe.brutto), rechts: true, fett: true, farbe: AKZENT, obenLinie: true }),
      ],
    }),
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [600, 4600, 1400, 1600, 1600],
    rows: [kopf, ...summe.positionen.map(positionsZeile), ...summenZeilen],
  });
}

export async function erzeugeAngebotWord(args: {
  daten: DokumentDaten;
  summe: Angebotssumme;
  preisliste: Preisliste;
  nummer: string;
  datum: Date;
}): Promise<Buffer> {
  const { daten, summe, preisliste, nummer, datum } = args;
  const b = preisliste.betrieb;
  const istAngebot = daten.art === "ANGEBOT";
  const titel = istAngebot ? "Angebot" : "Arbeitsprotokoll";

  const adresszeile = [b.strasse, `${b.plz} ${b.ort}`.trim(), b.telefon, b.email]
    .filter(Boolean)
    .join("  ·  ");

  const kinder: (Paragraph | Table)[] = [
    // ── Briefkopf ─────────────────────────────────────────
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: b.firma, bold: true, size: 28, color: AKZENT })],
    }),
    new Paragraph({
      spacing: { after: 400 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: AKZENT } },
      children: [new TextRun({ text: adresszeile, size: 16, color: GRAU })],
    }),

    // ── Empfänger ─────────────────────────────────────────
    ...(daten.kunde.name
      ? [
          new Paragraph({
            spacing: { after: 0 },
            children: [new TextRun({ text: daten.kunde.name, size: 20, bold: true })],
          }),
        ]
      : []),
    ...(daten.kunde.adresse
      ? [
          new Paragraph({
            spacing: { after: 0 },
            children: [new TextRun({ text: daten.kunde.adresse, size: 20 })],
          }),
        ]
      : []),

    // ── Titel + Metadaten ─────────────────────────────────
    new Paragraph({
      spacing: { before: 500, after: 60 },
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: `${titel} ${nummer}`, bold: true, size: 30 })],
    }),
    new Paragraph({
      spacing: { after: 320 },
      children: [
        new TextRun({
          text: `Datum: ${datumDE(datum)}${daten.objekt ? `   ·   Objekt: ${daten.objekt}` : ""}`,
          size: 18,
          color: GRAU,
        }),
      ],
    }),

    // ── Anschreiben ───────────────────────────────────────
    ...textAbsaetze(daten.einleitung),
    new Paragraph({ spacing: { after: 200 }, children: [] }),

    // ── Positionen ────────────────────────────────────────
    positionsTabelle(summe),
    new Paragraph({ spacing: { after: 280 }, children: [] }),

    // ── Schlusstext ───────────────────────────────────────
    ...textAbsaetze(daten.schlusstext),
  ];

  if (istAngebot) {
    kinder.push(
      new Paragraph({
        spacing: { before: 320 },
        children: [
          new TextRun({
            text:
              `Dieses Angebot ist gültig bis ${datumDE(summe.gueltigBis)}. ` +
              `Zahlungsziel: ${preisliste.konditionen.zahlungsziel}.` +
              (b.ustIdNr ? `  USt-IdNr.: ${b.ustIdNr}` : ""),
            size: 16,
            color: GRAU,
          }),
        ],
      }),
    );
  }

  const doc = new Document({
    creator: b.firma,
    title: `${titel} ${nummer}`,
    description: `Erstellt mit Angebotsblitz aus einer Sprachnachricht`,
    styles: {
      default: { document: { run: { font: "Calibri", size: 20 } } },
    },
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
        children: kinder,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

/** Dateiname für den Anhang, z.B. "Angebot_ANG-2026-0001_Familie-Baer.docx" */
export function wordDateiname(art: string, nummer: string, kunde: string | null): string {
  const sauber = (kunde ?? "Kunde")
    .replace(/[äÄöÖüÜß]/g, (z) => ({ ä: "ae", Ä: "Ae", ö: "oe", Ö: "Oe", ü: "ue", Ü: "Ue", ß: "ss" })[z] ?? z)
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${art === "ANGEBOT" ? "Angebot" : "Protokoll"}_${nummer}_${sauber}.docx`;
}
