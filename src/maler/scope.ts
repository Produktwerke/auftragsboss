// Scope-Erkennung: liegt der Auftrag im sicheren v0-Bereich (Innenrenovierung),
// nur eingeschränkt (Vorsicht/Rückfrage) oder klar außerhalb (WDVS, Schadstoff,
// Ausschreibung …)? Rein deterministisch über die Stichwörter aus scope_rules.yaml.
// Außer-Scope-Fälle werden markiert statt fachlich halluziniert (Brief §2/§7).
import { ladeWissen } from "./wissen.js";

export type ScopeStatus = "inside_v0" | "eingeschraenkt" | "outside_v0";

export interface ScopeErgebnis {
  status: ScopeStatus;
  /** true, wenn ein Mensch drüberschauen sollte (outside_v0). */
  requiresManualReview: boolean;
  /** Welche Stichwörter die Einstufung ausgelöst haben (Nachvollziehbarkeit). */
  treffer: string[];
}

export function pruefeScope(transkript: string): ScopeErgebnis {
  const { scope } = ladeWissen();
  const t = transkript.toLowerCase();

  const outside = scope.outside_keywords.filter((k) => t.includes(k.toLowerCase()));
  if (outside.length) return { status: "outside_v0", requiresManualReview: true, treffer: outside };

  const eingeschraenkt = scope.eingeschraenkt_keywords.filter((k) => t.includes(k.toLowerCase()));
  if (eingeschraenkt.length) return { status: "eingeschraenkt", requiresManualReview: false, treffer: eingeschraenkt };

  return { status: "inside_v0", requiresManualReview: false, treffer: [] };
}
