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

// ── AGB-Zustimmung beim Start des kostenlosen Tests (17.09.2026, Rechts-KI) ──
//
// Bevor AuftragsBoss die erste Sprachnachricht, das erste Foto oder den ersten
// Text eines Betriebs verarbeitet (und damit Endkundendaten im Auftrag), muss
// der Betrieb einmalig die AGB einschließlich der darin enthaltenen Vereinbarung
// zur Auftragsverarbeitung akzeptieren. Das passiert im WhatsApp-Dialog mit
// einem Knopf; gespeichert werden Zeitpunkt, Nummer und AGB-Version. Danach
// bleibt es beim Prinzip „kein Login, einfach WhatsApp".
//
//   AGB_GATE=1                       Zustimmungspflicht an (Standard aus, bis agb.html live ist)
//   DATENSCHUTZ_URL=…                Standard https://auftragsboss.de/datenschutz.html
//
// „Kurz erklären" (Lead-Knopf) geht ohne Zustimmung, dabei werden keine Daten verarbeitet.
export const KNOPF_AGB = "AGB_AKZEPTIEREN";
export const KNOPF_AGB_ERKLAEREN_AUSNAHME = "LEAD_ERKLAEREN";

export function agbGateAktiv(env: NodeJS.ProcessEnv = process.env): boolean {
  const k = agbKonfig(env);
  return /^(1|true|ja)$/i.test(env.AGB_GATE?.trim() ?? "") && !!k.url;
}

export function datenschutzUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.DATENSCHUTZ_URL?.trim() || "https://auftragsboss.de/datenschutz.html";
}

/** Text der Zustimmungsnachricht (WhatsApp, mit einem Knopf). */
export function agbGateText(istTest: boolean, env: NodeJS.ProcessEnv = process.env): { text: string; knopf: { id: string; titel: string } } {
  const k = agbKonfig(env);
  const titel = istTest ? "Kostenlos testen" : "Akzeptieren";
  return {
    knopf: { id: KNOPF_AGB, titel },
    text:
      `📄 Einmalig, bevor es losgeht: Mit Tipp auf „${titel}" handelst du als Unternehmer, bist berechtigt, das für deinen Betrieb zu erklären, und akzeptierst unsere Allgemeinen Geschäftsbedingungen einschließlich der darin enthaltenen Vereinbarung zur Auftragsverarbeitung (Art. 28 DSGVO).\n\n` +
      `AGB: ${k.url}\nDatenschutz: ${datenschutzUrl(env)}\n\n` +
      `Danach ${istTest ? "startet dein kostenloser Test und " : ""}du schickst einfach deine Sprachnachricht.`,
  };
}

export type GateEntscheidung = "DURCH" | "AKZEPTIEREN" | "FRAGEN";

/**
 * Was passiert mit einer eingehenden Nachricht? Rein, testbar.
 *   DURCH        verarbeiten wie bisher (Gate aus, schon akzeptiert, Mitarbeiter, „Kurz erklären")
 *   AKZEPTIEREN  Knopf „Kostenlos testen" gedrückt → Zustimmung speichern, dann weiter
 *   FRAGEN       Zustimmung fehlt → Zustimmungsnachricht schicken, Eingabe merken
 */
export function gateEntscheidung(args: { aktiv: boolean; istMitarbeiter: boolean; akzeptiertAm: Date | null; knopfPayload?: string }): GateEntscheidung {
  if (!args.aktiv || args.istMitarbeiter || args.akzeptiertAm) return "DURCH";
  if (args.knopfPayload === KNOPF_AGB) return "AKZEPTIEREN";
  if (args.knopfPayload === KNOPF_AGB_ERKLAEREN_AUSNAHME) return "DURCH";
  return "FRAGEN";
}
