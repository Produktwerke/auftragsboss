// Einheitliches Herkunftsmodell (Brief §5): Jede Menge, jeder Preis, jede
// Position und jede relevante Ausführungsinfo trägt eine Herkunft. So bleibt
// nachvollziehbar, was ausdrücklich gesagt, was abgeleitet, was aus dem
// Betriebsprofil und was nur ein fachlicher Vorschlag ist.
//
// Dies ist das REICHERE Engine-Modell. Die bestehende, editor-nahe
// `preisquelle` (DIKTAT/PREISLISTE/PREISGEDAECHTNIS/MANUELL/UNBEKANNT) bleibt für
// das gespeicherte Angebot; `zuPreisquelle()` bildet die Herkunft darauf ab.
import { z } from "zod";
import type { Preisquelle } from "../ai/structure.js";

export const HERKUNFT = z.enum([
  "explicit_current_input", // ausdrücklich in der aktuellen Nachricht genannt
  "derived_from_explicit_measurements", // aus genannten Maßen berechnet (markiert)
  "confirmed_private_business_profile", // bestätigte Betriebsposition/-standard
  "confirmed_private_historical_offer", // bestätigtes früheres Angebot desselben Betriebs
  "manual_current_editor_input", // im Editor manuell eingegeben und freigegeben
  "fachlicher_vorschlag", // fachlicher Vorschlag, muss bestätigt werden
  "unknown", // unbekannt
  "contradictory", // widersprüchlich, muss geklärt werden
]);
export type Herkunft = z.infer<typeof HERKUNFT>;

/** Herkunftsarten, aus denen ein Preis TATSÄCHLICH gesetzt werden darf.
 *  fachlicher_vorschlag/unknown/contradictory dürfen nur vorschlagen, nie setzen. */
export const PREIS_ERLAUBT: ReadonlySet<Herkunft> = new Set<Herkunft>([
  "explicit_current_input",
  "confirmed_private_business_profile",
  "confirmed_private_historical_offer",
  "manual_current_editor_input",
]);

/** Brücke zum gespeicherten Angebot: Engine-Herkunft → editor-nahe preisquelle. */
export function zuPreisquelle(h: Herkunft): Preisquelle {
  switch (h) {
    case "explicit_current_input":
      return "DIKTAT";
    case "confirmed_private_business_profile":
      return "PREISLISTE";
    case "confirmed_private_historical_offer":
      return "PREISGEDAECHTNIS";
    case "manual_current_editor_input":
      return "MANUELL";
    default:
      return "UNBEKANNT";
  }
}
