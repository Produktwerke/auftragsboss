import { describe, it, expect } from "vitest";
import { agbKonfig, stripeConsentFelder, haekchenText, checkoutAgbAkzeptiert } from "./agb.js";

describe("AGB-Häkchen im Stripe-Checkout", () => {
  it("bleibt aus ohne Schalter oder ohne AGB-Adresse", () => {
    expect(stripeConsentFelder(agbKonfig({}))).toEqual({});
    expect(stripeConsentFelder(agbKonfig({ STRIPE_AGB_HAEKCHEN: "1" }))).toEqual({});
    expect(stripeConsentFelder(agbKonfig({ AGB_URL: "https://auftragsboss.de/agb.html" }))).toEqual({});
  });

  it("liefert Pflicht-Häkchen mit Link auf AGB und AVV", () => {
    const k = agbKonfig({ STRIPE_AGB_HAEKCHEN: "true", AGB_URL: "https://auftragsboss.de/agb.html", AVV_URL: "https://auftragsboss.de/avv.html", AGB_VERSION: "2026-10" });
    const f = stripeConsentFelder(k);
    expect(f.consent_collection).toEqual({ terms_of_service: "required" });
    expect((f.custom_text?.terms_of_service_acceptance as { message: string }).message).toContain("[Allgemeinen Geschäftsbedingungen](https://auftragsboss.de/agb.html)");
    expect((f.custom_text?.terms_of_service_acceptance as { message: string }).message).toContain("[Auftragsverarbeitungsvertrag](https://auftragsboss.de/avv.html)");
    expect(k.version).toBe("2026-10");
    expect(haekchenText(agbKonfig({ AGB_URL: "https://x/agb" }))).not.toContain("Auftragsverarbeitungsvertrag");
  });

  it("erkennt die Zustimmung in der Checkout-Session", () => {
    expect(checkoutAgbAkzeptiert({ consent: { terms_of_service: "accepted" } })).toBe(true);
    expect(checkoutAgbAkzeptiert({ consent: null })).toBe(false);
    expect(checkoutAgbAkzeptiert({})).toBe(false);
    expect(checkoutAgbAkzeptiert(undefined)).toBe(false);
  });
});
