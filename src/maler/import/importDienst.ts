// Maler-Fachengine v1 — Import-Dienst: verbindet Extraktion, Parser und
// Typzuordnung und legt das Ergebnis STRENG pro Betrieb (handwerkerId) ab.
//
// Mandantentrennung ist Pflicht (erzwingeTenant): ohne gültige handwerkerId
// harter Fehler, niemals eine betriebsübergreifende Ablage. Es wird nichts
// erfunden — nur gespeichert, was Extraktion/Parser aus der Datei gelesen haben.
import type { PrismaClient } from "@prisma/client";
import { erzwingeTenant } from "../../mandant.js";
import { anthropicKonfiguriert } from "../../config.js";
import { spurEvent } from "../../analytics/event.js";
import { extrahiereText } from "./extraktion.js";
import { parseAngebotstext, type ParseErgebnis, type ParsePosition } from "./parser.js";
import { kiAusleseAngebotstext } from "./kiAuslese.js";
import { ordneTypZu } from "./typzuordnung.js";

export interface ImportErgebnis {
  importDokumentId: string;
  anzahlPositionen: number;
  manuellePruefungNoetig: boolean;
  warnungen: string[];
}

/**
 * Importiert ein hochgeladenes Alt-Angebot für EINEN Betrieb.
 * @throws FehlenderTenantError wenn handwerkerId fehlt.
 * @throws ImportFormatFehler bei unbekanntem Dateiformat.
 */
export async function importiereAltangebot(
  prisma: PrismaClient,
  handwerkerId: string,
  buffer: Buffer,
  dateiname: string,
  mimetype?: string,
): Promise<ImportErgebnis> {
  const tenant = erzwingeTenant(handwerkerId, "importiereAltangebot");

  // 1) Reinen Text aus der Datei holen (DOCX/PDF; kein Layout).
  const extraktion = await extrahiereText(buffer, dateiname, mimetype);

  // 2) Text in Kopfdaten + Positionen zerlegen. Bevorzugt per Claude (robust
  //    bei echten, mehrspaltigen Angeboten); ohne API-Key oder bei KI-Fehler
  //    fällt es auf den deterministischen Regel-Parser zurück. Leerer Text
  //    (Scan) wird gar nicht erst an die KI geschickt.
  let zerlegung: ParseErgebnis;
  let ausleseMethode: "ki" | "regel" = "regel";
  const hatText = extraktion.text.replace(/\s/g, "").length >= 10;
  if (hatText && anthropicKonfiguriert()) {
    try {
      zerlegung = await kiAusleseAngebotstext(extraktion.text);
      ausleseMethode = "ki";
    } catch (err) {
      console.error("KI-Auslese fehlgeschlagen, nutze Regel-Parser:", err);
      zerlegung = parseAngebotstext(extraktion.text);
    }
  } else {
    zerlegung = parseAngebotstext(extraktion.text);
  }
  const { kopf, positionen, warnungen } = zerlegung;

  // Gesamtkonfidenz konservativ: die schwächere von Extraktion und Parser.
  const parserKonfidenz = positionsKonfidenz(positionen);
  const gesamtKonfidenz = schwaechere(extraktion.konfidenz, parserKonfidenz);
  const pruefenNoetig = extraktion.manuellePruefungNoetig || positionen.length === 0 || gesamtKonfidenz === "low";

  const alleWarnungen = [...warnungen];
  if (extraktion.hinweis) alleWarnungen.push(extraktion.hinweis);

  // 3) Tenant-sicher persistieren: Dokument + Positionen in einer Transaktion.
  const dok = await prisma.importDokument.create({
    data: {
      handwerkerId: tenant,
      originalDateiname: dateiname,
      dokumentDatum: kopf.dokumentDatum,
      angebotsnummer: kopf.angebotsnummer,
      mwstSatz: kopf.mwstSatz,
      nettoSumme: kopf.nettoSumme,
      mwstSumme: kopf.mwstSumme,
      bruttoSumme: kopf.bruttoSumme,
      extraktionsMethode: extraktion.methode,
      extraktionsKonfidenz: gesamtKonfidenz,
      manuellePruefungNoetig: pruefenNoetig,
      seitenzahl: extraktion.seitenzahl,
      status: "IMPORTIERT",
      positionen: {
        create: positionen.map((p) => ({
          handwerkerId: tenant, // denormalisiert: jede Positionsabfrage filtert direkt nach Tenant
          originalNummer: p.originalNummer,
          originalTitel: p.originalTitel,
          normalisierterTyp: ordneTypZu(p.originalTitel),
          menge: p.menge,
          einheit: p.einheit,
          einzelpreis: p.einzelpreis,
          gesamtpreis: p.gesamtpreis,
          extraktionsKonfidenz: p.konfidenz,
        })),
      },
    },
    include: { positionen: false },
  });

  // 4) Datensparsames Produkt-Event (nur Zahlen, kein Inhalt).
  await spurEvent(prisma, "IMPORT_START", {
    handwerkerId: tenant,
    data: {
      positionen: positionen.length,
      methode: extraktion.methode,
      auslese: ausleseMethode,
      konfidenz: gesamtKonfidenz,
      pruefenNoetig,
    },
  });

  return {
    importDokumentId: dok.id,
    anzahlPositionen: positionen.length,
    manuellePruefungNoetig: pruefenNoetig,
    warnungen: alleWarnungen,
  };
}

/** Grobkonfidenz über alle Positionen: schlechteste zählt (konservativ). */
function positionsKonfidenz(positionen: ParsePosition[]): "high" | "medium" | "low" | "unknown" {
  if (positionen.length === 0) return "low";
  if (positionen.some((p) => p.konfidenz === "low")) return "low";
  if (positionen.some((p) => p.konfidenz === "medium")) return "medium";
  return "high";
}

const RANG: Record<string, number> = { low: 0, unknown: 1, medium: 2, high: 3 };
function schwaechere(a: string, b: string): "high" | "medium" | "low" | "unknown" {
  return ((RANG[a] ?? 1) <= (RANG[b] ?? 1) ? a : b) as "high" | "medium" | "low" | "unknown";
}
