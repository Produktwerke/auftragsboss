// Preisgedächtnis (opt-in je Betrieb).
//
// KEIN gepflegtes Preisbuch. AuftragsBoss merkt sich nur, wie DIESER Betrieb
// ähnliche Leistungen zuletzt kalkuliert hat, und schlägt den Preis beim nächsten
// Mal DATIERT vor. Nie global, nie automatisch als endgültig gesetzt, nie
// erfunden: Es ist immer ein Preis, den der Betrieb selbst schon eingetragen hat.
//
// Strikte Mandantentrennung: Jeder Zugriff ist an handwerkerId gebunden. Ein
// Betrieb sieht ausschließlich sein eigenes Gedächtnis.
import type { PrismaClient } from "@prisma/client";
import type { Position } from "../ai/structure.js";
import { erzwingeTenant } from "../mandant.js";

/**
 * Normalisierter Wiedererkennungs-Schlüssel aus Beschreibung + Einheit.
 * Bewusst simpel für Phase 1 (exakte Wiedererkennung nach Normalisierung);
 * später ersetzbar durch echte Ähnlichkeitssuche über die Positionsbibliothek.
 */
export function leistungSchluessel(beschreibung: string, einheit: string | null): string {
  const norm = beschreibung
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return `${norm}|${(einheit ?? "").toLowerCase()}`;
}

/** Minimalform einer Position, die zum Merken genügt. */
interface MerkbarePosition {
  beschreibung: string;
  einheit: string | null;
  einzelpreis: number | null;
  preisquelle: string;
  /** true = bewusst „vergessen" (Knopf im Editor) — Automatik überspringt sie,
   *  sonst würde der nächste Speichervorgang das Vergessen sofort rückgängig
   *  machen. Der Merken-Knopf hebt die Sperre wieder auf. */
  gedSperre?: boolean;
}

/**
 * Merkt sich die bepreisten Positionen dieses Betriebs (nur wenn opt-in aktiv;
 * der Aufrufer prüft das). Aus dem Gedächtnis stammende, unbestätigte Preise
 * (PREISGEDAECHTNIS) werden NICHT zurückgemerkt, um sich nicht selbst zu
 * verstärken. Gibt die Anzahl gemerkter Positionen zurück.
 */
export async function merkePreise(
  prisma: PrismaClient,
  handwerkerId: string,
  positionen: ReadonlyArray<MerkbarePosition>,
): Promise<number> {
  let gemerkt = 0;
  for (const p of positionen) {
    if (p.einzelpreis == null) continue;
    if (!p.beschreibung.trim()) continue;
    if (p.preisquelle === "PREISGEDAECHTNIS") continue; // nicht selbst verstärken
    if (p.gedSperre) continue; // bewusst vergessen — nicht wieder lernen
    const schluessel = leistungSchluessel(p.beschreibung, p.einheit);
    await prisma.preisgedaechtnis.upsert({
      where: { handwerkerId_leistungSchluessel: { handwerkerId, leistungSchluessel: schluessel } },
      update: {
        letzterPreis: p.einzelpreis,
        einheit: p.einheit,
        beschreibung: p.beschreibung,
        zuletztAm: new Date(),
        quelle: "EDITOR",
      },
      create: {
        handwerkerId,
        leistungSchluessel: schluessel,
        beschreibung: p.beschreibung,
        einheit: p.einheit,
        letzterPreis: p.einzelpreis,
        quelle: "EDITOR",
      },
    });
    gemerkt++;
  }
  return gemerkt;
}

/**
 * Übernimmt die Preise eines BESTÄTIGTEN Alt-Angebots ins Preisgedächtnis
 * dieses Betriebs ("kontrolliertes Lernen": erst nach Bestätigung, nie schon
 * beim Hochladen). Streng tenant-gebunden. Besonderheiten gegenüber merkePreise:
 *   • DATIERT auf das Angebotsdatum (nicht "heute") — der Vorschlag bleibt
 *     ehrlich als alter Preis erkennbar.
 *   • FRISCHE-SCHUTZ: ein bereits gespeicherter, NEUERER Preis (z.B. eine
 *     frische Editor-Eingabe) wird NICHT von einem älteren Import überschrieben.
 *   • Nur ausgewiesene Einzelpreise mit belastbarer Konfidenz (nicht "low")
 *     werden übernommen — nichts wird gerechnet oder geraten.
 * @returns Anzahl übernommener Preise.
 */
export async function merkePreiseAusImport(
  prisma: PrismaClient,
  handwerkerId: string,
  importDokumentId: string,
): Promise<number> {
  const tenant = erzwingeTenant(handwerkerId, "merkePreiseAusImport");

  // Tenant-sicher: Dokument NUR laden, wenn es diesem Betrieb gehört.
  const dok = await prisma.importDokument.findFirst({
    where: { id: importDokumentId, handwerkerId: tenant },
    include: { positionen: true },
  });
  if (!dok) return 0;

  // Datum des Preises: das Angebotsdatum, ersatzweise der Importzeitpunkt.
  const stand = dok.dokumentDatum ?? dok.erstelltAm;

  let gemerkt = 0;
  for (const p of dok.positionen) {
    if (p.einzelpreis == null) continue; // nur ausgewiesene Einzelpreise
    if (p.extraktionsKonfidenz === "low") continue; // Unsicheres nicht lernen
    if (!p.originalTitel.trim()) continue;

    const schluessel = leistungSchluessel(p.originalTitel, p.einheit);
    const vorhanden = await prisma.preisgedaechtnis.findUnique({
      where: { handwerkerId_leistungSchluessel: { handwerkerId: tenant, leistungSchluessel: schluessel } },
    });
    // Frische-Schutz: nichts Neueres (oder Gleichaltriges) überschreiben.
    if (vorhanden && vorhanden.zuletztAm >= stand) continue;

    await prisma.preisgedaechtnis.upsert({
      where: { handwerkerId_leistungSchluessel: { handwerkerId: tenant, leistungSchluessel: schluessel } },
      update: { letzterPreis: p.einzelpreis, einheit: p.einheit, beschreibung: p.originalTitel, zuletztAm: stand, quelle: "IMPORT" },
      create: {
        handwerkerId: tenant,
        leistungSchluessel: schluessel,
        beschreibung: p.originalTitel,
        einheit: p.einheit,
        letzterPreis: p.einzelpreis,
        zuletztAm: stand,
        quelle: "IMPORT",
      },
    });
    gemerkt++;
  }
  return gemerkt;
}

/**
 * Entfernt einen gemerkten Preis wieder aus dem Gedächtnis dieses Betriebs
 * („Vergessen"-Knopf im Editor). Gibt zurück, ob ein Eintrag entfernt wurde.
 */
export async function vergissPreis(
  prisma: PrismaClient,
  handwerkerId: string,
  beschreibung: string,
  einheit: string | null,
): Promise<boolean> {
  const schluessel = leistungSchluessel(beschreibung, einheit);
  const r = await prisma.preisgedaechtnis.deleteMany({
    where: { handwerkerId, leistungSchluessel: schluessel },
  });
  return r.count > 0;
}

export interface GedaechtnisVorschlag {
  beschreibung: string;
  preis: number;
  zuletztAm: Date;
}

/**
 * Füllt LEERE Preise aus dem Gedächtnis DIESES Betriebs als datierten Vorschlag
 * (preisquelle PREISGEDAECHTNIS). Positionen mit vorhandenem Preis bleiben
 * unangetastet. Der Aufrufer macht die Vorschläge für den Handwerker sichtbar,
 * damit nichts stillschweigend endgültig wird.
 */
/** Position plus optionalem Datumsstempel des Preisgedächtnis-Vorschlags.
 *  preisStand reist als ISO-Datum bis in den Editor mit (Herkunftsanzeige). */
export type PositionMitStand = Position & { preisStand?: string };

export async function schlagePreiseVor(
  prisma: PrismaClient,
  handwerkerId: string,
  positionen: Position[],
): Promise<{ positionen: PositionMitStand[]; vorschlaege: GedaechtnisVorschlag[] }> {
  const vorschlaege: GedaechtnisVorschlag[] = [];
  const ergebnis: PositionMitStand[] = [];
  for (const p of positionen) {
    if (p.einzelpreis !== null || !p.beschreibung.trim()) {
      ergebnis.push(p);
      continue;
    }
    const schluessel = leistungSchluessel(p.beschreibung, p.einheit);
    const treffer = await prisma.preisgedaechtnis.findUnique({
      where: { handwerkerId_leistungSchluessel: { handwerkerId, leistungSchluessel: schluessel } },
    });
    if (treffer) {
      ergebnis.push({
        ...p,
        einzelpreis: treffer.letzterPreis,
        preisquelle: "PREISGEDAECHTNIS",
        preisStand: treffer.zuletztAm.toISOString(),
      });
      vorschlaege.push({ beschreibung: p.beschreibung, preis: treffer.letzterPreis, zuletztAm: treffer.zuletztAm });
    } else {
      ergebnis.push(p);
    }
  }
  return { positionen: ergebnis, vorschlaege };
}
