// Maler-Fachengine v1 — Textextraktion aus hochgeladenen Alt-Angeboten.
//
// Grundsatz: Wir lesen NUR die TEXTE, nie das Layout (das Angebot wird später
// immer im AuftragsBoss-Stil neu erzeugt). DOCX über mammoth, PDF über unpdf
// (reines JS/WASM — bewusst KEIN pdfjs-dist, dessen unsignierte native Canvas-
// Binary von Windows Smart App Control blockiert wird).
//
// OCR/Scans werden in v1 NICHT gelesen. Ein PDF, das kaum Text liefert, ist
// vermutlich ein Scan: wir markieren es als prüfbedürftig, statt es still als
// sicher zu behandeln (Dokumentqualität nie überschätzen).
import mammoth from "mammoth";

// Polyfill: das in unpdf gebündelte pdf.js nutzt Math.sumPrecise (sehr neuer
// JS-Vorschlag), das Node 24 noch nicht kennt. Ohne Polyfill flutet es die Logs
// mit Warnungen und lässt manche PDFs sogar hart scheitern. Präzise genug für
// die Textextraktion ist eine einfache Summe.
const M = Math as unknown as { sumPrecise?: (werte: Iterable<number>) => number };
if (typeof M.sumPrecise !== "function") {
  M.sumPrecise = (werte: Iterable<number>) => {
    let summe = 0;
    for (const w of werte) summe += w;
    return summe;
  };
}

/** Woher der Text stammt und wie sicher die Extraktion war. */
export type Extraktionsmethode = "text" | "ocr";
export type Konfidenz = "high" | "medium" | "low" | "unknown";

export interface ExtraktionsErgebnis {
  text: string;
  methode: Extraktionsmethode;
  konfidenz: Konfidenz;
  seitenzahl: number | null;
  /** true, wenn ein Mensch das Ergebnis gegenlesen sollte (z.B. Scan/leerer Text). */
  manuellePruefungNoetig: boolean;
  /** Kurzer Klartext-Hinweis für Log/Anzeige, warum die Prüfung nötig ist. */
  hinweis?: string;
}

export class ImportFormatFehler extends Error {
  constructor(nachricht: string) {
    super(nachricht);
    this.name = "ImportFormatFehler";
  }
}

/** Erkennt das Dateiformat aus Dateiname und (optional) MIME-Typ. */
export function erkenneFormat(dateiname: string, mimetype?: string): "docx" | "pdf" {
  const name = dateiname.toLowerCase();
  if (name.endsWith(".docx") || mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return "docx";
  }
  if (name.endsWith(".pdf") || mimetype === "application/pdf") {
    return "pdf";
  }
  throw new ImportFormatFehler(
    `Nicht unterstütztes Format: "${dateiname}". Bitte als PDF oder Word (.docx) hochladen.`,
  );
}

/** Extrahiert reinen Text aus einer DOCX-Datei (mammoth, reines JS). */
async function ausDocx(buffer: Buffer): Promise<ExtraktionsErgebnis> {
  const { value } = await mammoth.extractRawText({ buffer });
  const text = value.trim();
  const leer = text.replace(/\s/g, "").length < 10;
  return {
    text,
    methode: "text",
    konfidenz: leer ? "low" : "high",
    seitenzahl: null, // DOCX hat kein festes Seitenkonzept
    manuellePruefungNoetig: leer,
    hinweis: leer ? "Word-Datei enthält kaum Text — bitte prüfen." : undefined,
  };
}

/** Extrahiert reinen Text aus einer PDF-Datei (unpdf, reines JS/WASM). */
async function ausPdf(buffer: Buffer): Promise<ExtraktionsErgebnis> {
  // Dynamischer Import: unpdf lädt seine WASM-Ressourcen erst bei Bedarf.
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const sauber = text.trim();

  // Faustregel für Scans: Ein textbasiertes Angebot hat pro Seite reichlich
  // Zeichen. Bleibt der Ertrag winzig, ist es vermutlich ein Scan (nur Bilder).
  const zeichenProSeite = totalPages > 0 ? sauber.length / totalPages : sauber.length;
  const vermutlichScan = sauber.length < 40 || zeichenProSeite < 25;

  return {
    text: sauber,
    methode: "text",
    konfidenz: vermutlichScan ? "low" : "high",
    seitenzahl: totalPages,
    manuellePruefungNoetig: vermutlichScan,
    hinweis: vermutlichScan
      ? "PDF liefert kaum Text — vermutlich ein Scan. In v1 nicht automatisch lesbar, bitte manuell prüfen."
      : undefined,
  };
}

/**
 * Extrahiert den reinen Text aus einem hochgeladenen Alt-Angebot.
 * Wirft ImportFormatFehler bei unbekanntem Format.
 */
export async function extrahiereText(
  buffer: Buffer,
  dateiname: string,
  mimetype?: string,
): Promise<ExtraktionsErgebnis> {
  const format = erkenneFormat(dateiname, mimetype);
  return format === "docx" ? ausDocx(buffer) : ausPdf(buffer);
}
