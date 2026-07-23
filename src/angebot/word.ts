// Erzeugt das Angebot als bearbeitbare Word-Datei (.docx).
//
// Bewusst kundenfertig gehalten: Briefkopf, Anschreiben, Positionstabelle,
// Summenblock, Grußformel. Interne Notizen und Rückfragen gehören NICHT
// hier hinein — die stehen in der E-Mail an den Handwerker.
//
// Leere Preiszellen sind Absicht: der Handwerker klickt in Word hinein und
// tippt den Betrag. Sind Preise bekannt (diktiert oder aus der Preisliste),
// stehen sie bereits drin.
import { writeFileSync } from "node:fs";
import { basename } from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { ladeLogo } from "../betrieb/logo.js";
import type { DokumentDaten } from "../ai/structure.js";
import type { Angebotssumme, BerechnetePosition } from "./berechnung.js";
import { euro, mengeMitEinheit } from "./berechnung.js";
import type { Preisliste } from "../preisliste.js";

const GRAU = "666666";
const OHNE_RAHMEN = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
} as const;

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
  /** Farbe der oberen Trennlinie; ohne Angabe keine Linie. */
  obenLinie?: string;
}): TableCell {
  return new TableCell({
    columnSpan: opts.spalten,
    shading: opts.hintergrund ? { fill: opts.hintergrund } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    borders: opts.obenLinie
      ? { top: { style: BorderStyle.SINGLE, size: 12, color: opts.obenLinie } }
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

  // Keine Arbeitsnotizen im Kundendokument — Hinweise auf unsichere Mengen
  // stehen in der E-Mail an den Handwerker, nicht im Angebot.
  return new TableRow({
    children: [
      zelle({ text: String(p.nummer), rechts: true, farbe: GRAU }),
      zelle({ text: p.beschreibung }),
      zelle({ text: menge, rechts: true }),
      zelle({ text: p.einzelpreis !== null ? euro(p.einzelpreis) : "", rechts: true }),
      zelle({ text: p.gesamt !== null ? euro(p.gesamt) : "", rechts: true, fett: p.gesamt !== null }),
    ],
  });
}

/** Zwischenüberschrift innerhalb der Tabelle, z.B. "Material". */
function abschnittsZeile(text: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: 5,
        shading: { fill: "EEF1F4" },
        margins: { top: 120, bottom: 80, left: 100, right: 100 },
        children: [
          new Paragraph({
            children: [new TextRun({ text, bold: true, size: 18, color: GRAU })],
          }),
        ],
      }),
    ],
  });
}

function positionsTabelle(summe: Angebotssumme, akzent: string): Table {
  const kopf = new TableRow({
    tableHeader: true,
    children: (["Pos.", "Leistung", "Menge", "Einzelpreis", "Gesamt"] as const).map((t, i) =>
      zelle({
        text: t,
        fett: true,
        farbe: "FFFFFF",
        hintergrund: akzent,
        rechts: i !== 1,
      }),
    ),
  });

  /** Zwischensummenzeile eines Blocks. Ohne vollständige Preise bleibt sie leer. */
  const zwischensumme = (beschriftung: string, teil: typeof summe.leistungen): TableRow =>
    new TableRow({
      children: [
        zelle({ text: beschriftung, spalten: 4, rechts: true, fett: true, farbe: GRAU }),
        zelle({
          text: teil.vollstaendig ? euro(teil.netto) : "",
          rechts: true,
          fett: true,
          farbe: GRAU,
        }),
      ],
    });

  // Jede Kategorie (Arbeitsaufwand, Material, eigene) als eigener Block mit
  // Überschrift und Zwischensumme — bei nur einem Block ohne beides.
  const mehrereBloecke = summe.bloecke.length > 1;
  const inhaltsZeilen: TableRow[] = summe.bloecke.flatMap((block) => [
    ...(mehrereBloecke ? [abschnittsZeile(block.name)] : []),
    ...block.positionen.map(positionsZeile),
    ...(mehrereBloecke ? [zwischensumme(`Zwischensumme ${block.name}`, block)] : []),
  ]);

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
        zelle({ text: "Gesamtbetrag", spalten: 4, rechts: true, fett: true, obenLinie: akzent }),
        zelle({ text: betrag(summe.brutto), rechts: true, fett: true, farbe: akzent, obenLinie: akzent }),
      ],
    }),
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [600, 4600, 1400, 1600, 1600],
    rows: [kopf, ...inhaltsZeilen, ...summenZeilen],
  });
}

export async function erzeugeAngebotWord(args: {
  daten: DokumentDaten;
  summe: Angebotssumme;
  preisliste: Preisliste;
  nummer: string;
  datum: Date;
  kundenNummer?: string | null;
}): Promise<Buffer> {
  const { daten, summe, preisliste, nummer, datum, kundenNummer } = args;
  const b = preisliste.betrieb;
  const akzent = /^[0-9a-fA-F]{6}$/.test(b.farbe) ? b.farbe.toUpperCase() : "0B5CAD";
  const logo = ladeLogo(b.logo);
  const istAngebot = daten.art === "ANGEBOT";
  const titel = istAngebot ? "Angebot" : "Arbeitsprotokoll";

  const adresszeile = [b.strasse, `${b.plz} ${b.ort}`.trim(), b.telefon, b.email]
    .filter(Boolean)
    .join("  ·  ");

  // Briefkopf: Firmendaten links, Logo rechts. Ohne Logo nimmt der Textblock
  // die volle Breite — dann sieht der Kopf aus wie zuvor.
  const firmenBlock = [
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: b.firma, bold: true, size: 28, color: akzent })],
    }),
    new Paragraph({
      children: [new TextRun({ text: adresszeile, size: 16, color: GRAU })],
    }),
  ];

  const briefkopf: (Paragraph | Table)[] = logo
    ? [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths: [6800, 3000],
          borders: {
            top: OHNE_RAHMEN.top,
            bottom: OHNE_RAHMEN.bottom,
            left: OHNE_RAHMEN.left,
            right: OHNE_RAHMEN.right,
            insideHorizontal: OHNE_RAHMEN.top,
            insideVertical: OHNE_RAHMEN.left,
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  borders: OHNE_RAHMEN,
                  verticalAlign: "center",
                  margins: { top: 0, bottom: 0, left: 0, right: 0 },
                  children: firmenBlock,
                }),
                new TableCell({
                  borders: OHNE_RAHMEN,
                  verticalAlign: "center",
                  margins: { top: 0, bottom: 0, left: 0, right: 0 },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.RIGHT,
                      children: [
                        new ImageRun({
                          data: logo.daten,
                          type: logo.typ === "jpg" ? "jpg" : logo.typ,
                          transformation: { width: logo.breite, height: logo.hoehe },
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        new Paragraph({
          spacing: { before: 120, after: 400 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: akzent } },
          children: [],
        }),
      ]
    : [
        ...firmenBlock.slice(0, 1),
        new Paragraph({
          spacing: { after: 400 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: akzent } },
          children: [new TextRun({ text: adresszeile, size: 16, color: GRAU })],
        }),
      ];

  const kinder: (Paragraph | Table)[] = [
    // ── Briefkopf ─────────────────────────────────────────
    ...briefkopf,

    // ── Empfänger ─────────────────────────────────────────
    ...(daten.kunde.name
      ? [
          new Paragraph({
            spacing: { after: 0 },
            children: [new TextRun({ text: daten.kunde.name, size: 20, bold: true })],
          }),
        ]
      : []),
    ...[daten.kunde.strasse, daten.kunde.plzOrt]
      .filter((z): z is string => Boolean(z))
      .map(
        (zeileText) =>
          new Paragraph({
            spacing: { after: 0 },
            children: [new TextRun({ text: zeileText, size: 20 })],
          }),
      ),

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
          text:
            `Datum: ${datumDE(datum)}` +
            (kundenNummer ? `   ·   Kundennummer: ${kundenNummer}` : "") +
            (daten.objekt ? `   ·   Objekt: ${daten.objekt}` : ""),
          size: 18,
          color: GRAU,
        }),
      ],
    }),

    // ── Anschreiben ───────────────────────────────────────
    ...textAbsaetze(daten.einleitung),
    new Paragraph({ spacing: { after: 200 }, children: [] }),

    // ── Positionen ────────────────────────────────────────
    positionsTabelle(summe, akzent),
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

  // Fußzeile mit Firmen- und Bankdaten, falls hinterlegt
  const fusstext = [
    [b.firma, b.strasse, `${b.plz} ${b.ort}`.trim()].filter(Boolean).join(", "),
    b.ustIdNr ? `USt-IdNr.: ${b.ustIdNr}` : "",
    b.bank ? `Bank: ${b.bank}` : "",
  ]
    .filter(Boolean)
    .join("   ·   ");

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
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" } },
                children: [new TextRun({ text: fusstext, size: 14, color: GRAU })],
              }),
            ],
          }),
        },
        children: kinder,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

/**
 * Schreibt die Word-Datei und weicht auf einen alternativen Namen aus, wenn
 * die Datei gerade in Word geöffnet ist (Windows sperrt sie dann).
 * Gibt den tatsächlich verwendeten Pfad zurück.
 */
export function schreibeWordDatei(pfad: string, inhalt: Buffer): string {
  try {
    writeFileSync(pfad, inhalt);
    return pfad;
  } catch (err) {
    const gesperrt =
      err instanceof Error && /EBUSY|EPERM|EACCES/.test((err as NodeJS.ErrnoException).code ?? "");
    if (!gesperrt) throw err;

    const ausweich = pfad.replace(/\.docx$/i, `_${Date.now()}.docx`);
    writeFileSync(ausweich, inhalt);
    console.log(`ℹ️  Datei war in Word geöffnet — gespeichert als ${basename(ausweich)}`);
    return ausweich;
  }
}

/** Dateiname für den Anhang, z.B. "Angebot_ANG-2026-0001_Familie-Baer.docx" */
export function wordDateiname(art: string, nummer: string, kunde: string | null): string {
  const sauber = (kunde ?? "Kunde")
    .replace(/[äÄöÖüÜß]/g, (z) => ({ ä: "ae", Ä: "Ae", ö: "oe", Ö: "Oe", ü: "ue", Ü: "Ue", ß: "ss" })[z] ?? z)
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${art === "ANGEBOT" ? "Angebot" : "Protokoll"}_${nummer}_${sauber}.docx`;
}
