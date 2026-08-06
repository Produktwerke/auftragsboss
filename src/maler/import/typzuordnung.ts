// Maler-Fachengine v1 — ordnet eine importierte Positionszeile einem
// normalisierten Positionstyp (position_id aus positions.yaml) zu.
//
// Deterministisch und KONSERVATIV: Es wird nur zugeordnet, wenn ein klares
// Signal vorliegt. Bei Unklarheit/Mehrdeutigkeit bleibt es null — lieber
// "unbekannt" als falsch einsortiert (der Betrieb prüft/bestätigt später).
import { ladeWissen, type MalerPosition } from "../wissen.js";

/** Umlaute/ß falten, klein schreiben, Sonderzeichen zu Leerzeichen. */
function falte(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Generische Wörter, die für sich genommen nichts zuordnen (kein Signal).
const STOPP = new Set([
  "und", "oder", "mit", "fur", "auf", "der", "die", "das", "den", "dem", "ein",
  "eine", "im", "in", "am", "an", "je", "pro", "sowie", "inkl", "incl", "ca",
  "arbeiten", "auftragen", "anbringen", "flachen", "flache", "sonstige", "div",
  "diverse", "zzgl", "gemass", "nach", "vom", "zur", "zum", "bis", "mal",
]);

function inhaltsWorte(s: string): string[] {
  return falte(s)
    .split(" ")
    .filter((w) => w.length >= 3 && !STOPP.has(w));
}

interface Kandidat {
  phrasen: string[][]; // titel + alt_titel, je als Inhaltswort-Liste
  position: MalerPosition;
}
let kandidatenCache: Kandidat[] | undefined;

function kandidaten(): Kandidat[] {
  if (kandidatenCache) return kandidatenCache;
  kandidatenCache = ladeWissen().positionen.map((p) => ({
    position: p,
    phrasen: [p.titel, ...p.alt_titel].map(inhaltsWorte).filter((w) => w.length > 0),
  }));
  return kandidatenCache;
}

/**
 * Ordnet einen Positionstitel einem normalisierten Typ zu.
 * @returns position_id oder null (wenn kein klares Signal / mehrdeutig).
 */
export function ordneTypZu(titel: string): string | null {
  const eingabe = new Set(inhaltsWorte(titel));
  if (eingabe.size === 0) return null;

  let bestScore = 0;
  let bestId: string | null = null;
  let bestMatched = 0;
  let zweitScore = 0;

  for (const k of kandidaten()) {
    // Bester Phrasen-Treffer dieser Position.
    let matched = 0;
    let score = 0;
    for (const phrase of k.phrasen) {
      const treffer = phrase.filter((w) => eingabe.has(w)).length;
      if (treffer === 0) continue;
      // Vollständige Phrase (alle Inhaltswörter vorhanden) = starkes Signal.
      const komplett = treffer === phrase.length;
      const s = treffer + (komplett ? 0.5 : 0);
      if (s > score) {
        score = s;
        matched = treffer;
      }
    }
    if (score > bestScore) {
      zweitScore = bestScore;
      bestScore = score;
      bestId = k.position.position_id;
      bestMatched = matched;
    } else if (score > zweitScore) {
      zweitScore = score;
    }
  }

  // Kein Treffer.
  if (bestScore < 1 || !bestId) return null;
  // Nur ein einzelnes, generisches Wort ("streichen") und ein gleich starker
  // Zweitkandidat → mehrdeutig, lieber offen lassen.
  if (bestMatched < 2 && Math.abs(bestScore - zweitScore) < 0.5) return null;

  return bestId;
}
