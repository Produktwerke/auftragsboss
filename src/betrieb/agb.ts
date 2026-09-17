// AGB- und AVV-Einbeziehung (17.09.2026). Zwei Wege, beide schreiben dieselben
// Felder am Handwerker (agbAkzeptiertAm, agbVersion, agbQuelle):
//   • Registrierung: Pflicht-Kontrollkästchen (kommt, sobald agb.html live ist)
//   • Stripe Checkout: Häkchen „Ich akzeptiere die AGB …" im Bezahlfenster
//     (consent_collection.terms_of_service). Stripe verlangt dafür eine
//     hinterlegte AGB-Adresse in den Dashboard-Einstellungen (Öffentliche
//     Unternehmensdaten → Nutzungsbedingungen), sonst lehnt es die Session ab.
//
// Alles per .env schaltbar, damit nichts auf eine noch nicht existierende Seite verlinkt:
//   AGB_URL=https://auftragsboss.de/agb.html      Pflicht für das Häkchen
//   AVV_URL=https://auftragsboss.de/avv.html      optional, wird im Häkchentext mit verlinkt
//   AGB_VERSION=2026-10                            Versionskennung, wird am Betrieb gespeichert
//   STRIPE_AGB_HAEKCHEN=1                          Häkchen im Checkout an (Standard aus)
import type Stripe from "stripe";

export interface AgbKonfig {
  url: string;
  avvUrl: string;
  version: string;
  stripeHaekchen: boolean;
}

export function agbKonfig(env: NodeJS.ProcessEnv = process.env): AgbKonfig {
  return {
    url: env.AGB_URL?.trim() ?? "",
    avvUrl: env.AVV_URL?.trim() ?? "",
    version: env.AGB_VERSION?.trim() || "unversioniert",
    stripeHaekchen: /^(1|true|ja)$/i.test(env.STRIPE_AGB_HAEKCHEN?.trim() ?? ""),
  };
}

/** Text neben dem Häkchen im Stripe-Bezahlfenster (Stripe erlaubt Links in eckigen Klammern). */
export function haekchenText(k: AgbKonfig): string {
  const agb = `[Allgemeinen Geschäftsbedingungen](${k.url})`;
  const avv = k.avvUrl ? ` und den [Auftragsverarbeitungsvertrag](${k.avvUrl})` : "";
  return `Ich akzeptiere die ${agb}${avv} der DAG Deutsche Automotive GmbH.`;
}

/**
 * Zusatzfelder für checkout.sessions.create: leer, solange das Häkchen aus ist
 * oder keine AGB-Adresse hinterlegt ist (dann verhält sich der Checkout wie bisher).
 */
export function stripeConsentFelder(k: AgbKonfig = agbKonfig()): Pick<Stripe.Checkout.SessionCreateParams, "consent_collection" | "custom_text"> {
  if (!k.stripeHaekchen || !k.url) return {};
  return {
    consent_collection: { terms_of_service: "required" },
    custom_text: { terms_of_service_acceptance: { message: haekchenText(k) } },
  };
}

/** Hat der Kunde im Checkout das Häkchen gesetzt? (Stripe meldet es in session.consent.) */
export function checkoutAgbAkzeptiert(session: unknown): boolean {
  const s = session as { consent?: { terms_of_service?: string | null } | null } | null | undefined;
  return s?.consent?.terms_of_service === "accepted";
}
