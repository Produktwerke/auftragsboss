// Mandantentrennung (Brief §3.1): Jede betriebsbezogene Abfrage, Vektor-/
// Ähnlichkeitssuche und jedes Retrieval MUSS den Tenant (handwerkerId) tragen.
// Eine fehlende Tenant-ID führt zu einem HARTEN Fehler, niemals zu einer
// globalen Suche. Dieser Guard wird vor jeder tenantbezogenen Operation der
// Maler-Fachengine v1 aufgerufen.

export class FehlenderTenantError extends Error {
  constructor(kontext: string) {
    super(`Mandantentrennung verletzt: fehlende handwerkerId bei "${kontext}".`);
    this.name = "FehlenderTenantError";
  }
}

/**
 * Prüft, dass eine gültige Tenant-ID vorliegt, und gibt sie zurück.
 * Wirft FehlenderTenantError bei leerer/fehlender ID — bewusst KEIN Fallback
 * auf eine ungefilterte Abfrage.
 */
export function erzwingeTenant(handwerkerId: string | null | undefined, kontext: string): string {
  if (typeof handwerkerId !== "string" || !handwerkerId.trim()) {
    throw new FehlenderTenantError(kontext);
  }
  return handwerkerId;
}
