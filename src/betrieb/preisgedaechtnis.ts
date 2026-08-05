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
export async function schlagePreiseVor(
  prisma: PrismaClient,
  handwerkerId: string,
  positionen: Position[],
): Promise<{ positionen: Position[]; vorschlaege: GedaechtnisVorschlag[] }> {
  const vorschlaege: GedaechtnisVorschlag[] = [];
  const ergebnis: Position[] = [];
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
      ergebnis.push({ ...p, einzelpreis: treffer.letzterPreis, preisquelle: "PREISGEDAECHTNIS" });
      vorschlaege.push({ beschreibung: p.beschreibung, preis: treffer.letzterPreis, zuletztAm: treffer.zuletztAm });
    } else {
      ergebnis.push(p);
    }
  }
  return { positionen: ergebnis, vorschlaege };
}
