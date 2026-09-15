// Erzeugt den persönlichen Stripe-Bezahl-Link (Checkout-Session) für ein Abo.
//
// Die Zuordnung Zahlung → Betrieb läuft doppelt: client_reference_id an der
// Session (fürs checkout.session.completed-Ereignis) UND handwerkerId in den
// Abo-Metadaten (damit trägt JEDE spätere Monatsrechnung die Zuordnung).
// Preise werden über ihre lookup_keys (basis/profi/team, siehe
// stripe-einrichten.ts) gefunden — keine Preis-IDs in der .env nötig.
import Stripe from "stripe";
import { stripeConfig } from "../config.js";
import { basisUrl, cockpitLink } from "../web/tokens.js";
import type { Handwerker } from "@prisma/client";

export type BuchbarerTarif = "BASIS" | "PROFI" | "TEAM";
const LOOKUP: Record<BuchbarerTarif, string> = { BASIS: "basis", PROFI: "profi", TEAM: "team" };

let client: Stripe | null = null;
function stripe(): Stripe {
  if (!client) client = new Stripe(stripeConfig().STRIPE_SECRET_KEY);
  return client;
}

// Preis- und Steuersatz-IDs je Prozesslauf merken (ändern sich nie im Betrieb).
const preisCache = new Map<string, string>();
let mwstCache: string | null = null;

async function preisId(tarif: BuchbarerTarif): Promise<string> {
  const lookup = LOOKUP[tarif];
  const bekannt = preisCache.get(lookup);
  if (bekannt) return bekannt;
  const preise = await stripe().prices.list({ lookup_keys: [lookup], active: true, limit: 1 });
  const preis = preise.data[0];
  if (!preis) {
    throw new Error(
      `Stripe-Preis "${lookup}" fehlt — einmal "npx tsx src/stripe-einrichten.ts" ausführen.`,
    );
  }
  preisCache.set(lookup, preis.id);
  return preis.id;
}

async function mwstSatzId(): Promise<string> {
  if (mwstCache) return mwstCache;
  const saetze = await stripe().taxRates.list({ active: true, limit: 100 });
  const mwst = saetze.data.find((s) => s.percentage === 19 && !s.inclusive && s.country === "DE");
  if (!mwst) {
    throw new Error('Steuersatz 19 % MwSt fehlt — einmal "npx tsx src/stripe-einrichten.ts" ausführen.');
  }
  mwstCache = mwst.id;
  return mwst.id;
}

/**
 * Checkout-URL für den Betrieb erzeugen. `cockpitToken` ist der
 * einstellungenToken — dorthin führen Erfolg (Danke-Seite) und Abbruch zurück.
 */
export async function erzeugeAboCheckoutUrl(
  handwerker: Handwerker,
  tarif: BuchbarerTarif,
  cockpitToken: string,
): Promise<string> {
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    locale: "de",
    client_reference_id: handwerker.id,
    customer_email: handwerker.email || undefined,
    line_items: [{ price: await preisId(tarif), quantity: 1, tax_rates: [await mwstSatzId()] }],
    subscription_data: { metadata: { handwerkerId: handwerker.id, tarif } },
    metadata: { handwerkerId: handwerker.id, tarif },
    // B2B: Rechnungsadresse Pflicht, USt-IdNr. kann angegeben werden.
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    success_url: `${basisUrl()}/abo/danke?start=${encodeURIComponent(cockpitToken)}`,
    cancel_url: cockpitLink(cockpitToken),
  });
  if (!session.url) throw new Error("Stripe lieferte keine Checkout-URL.");
  return session.url;
}

/** Eine Rechnung für die Historie auf der "Abo & Abrechnung"-Seite. */
export interface RechnungsZeile {
  nummer: string;
  datum: Date;
  /** Rechnungsbetrag BRUTTO (inkl. MwSt.) — so steht er auf der Rechnung. */
  bruttoEuro: number;
  status: string; // "paid" | "open" | "void" | …
  pdfUrl: string | null;
  webUrl: string | null;
}

/** Rechnungshistorie eines Betriebs aus Stripe laden (neueste zuerst). */
export async function ladeRechnungen(stripeCustomerId: string, limit = 24): Promise<RechnungsZeile[]> {
  const rechnungen = await stripe().invoices.list({ customer: stripeCustomerId, limit });
  return rechnungen.data.map((r) => ({
    nummer: r.number ?? r.id ?? "—",
    datum: new Date(r.created * 1000),
    bruttoEuro: (r.total ?? 0) / 100,
    status: r.status ?? "",
    pdfUrl: r.invoice_pdf ?? null,
    webUrl: r.hosted_invoice_url ?? null,
  }));
}

// ── Kundenportal (Stripe Etappe 3, 15.09.2026) ────────────────────────
//
// Der Betrieb verwaltet sein Abo selbst: Zahlungsart, Rechnungsadresse und
// USt-IdNr. ändern, Rechnungen einsehen, zum Periodenende kündigen (und die
// Kündigung bis dahin zurücknehmen). Alles auf Stripes gehosteter Seite, in
// unserem Branding. Die Konfiguration wird einmal je Stripe-Umgebung angelegt
// und über ihre Metadaten-Kennung wiedergefunden (Sandbox und Live getrennt).

export const PORTAL_KENNUNG = "auftragsboss-portal-v1";

/** Portal-Konfiguration finden oder anlegen; liefert die Konfigurations-Id. */
export async function portalKonfigurationBereit(s: Stripe = stripe()): Promise<string> {
  const liste = await s.billingPortal.configurations.list({ active: true, limit: 100 });
  const vorhandene = liste.data.find((c) => c.metadata?.kennung === PORTAL_KENNUNG);
  if (vorhandene) return vorhandene.id;
  const neu = await s.billingPortal.configurations.create({
    business_profile: {
      headline: "Dein AuftragsBoss-Abo",
      privacy_policy_url: "https://auftragsboss.de/datenschutz.html",
    },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["email", "address", "name", "tax_id", "phone"] },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        cancellation_reason: {
          enabled: true,
          options: ["too_expensive", "missing_features", "unused", "switched_service", "other"],
        },
      },
    },
    default_return_url: basisUrl(),
    metadata: { kennung: PORTAL_KENNUNG },
  });
  return neu.id;
}

let portalKonfigCache: string | null = null;

/** Persönlichen Link ins Kundenportal erzeugen (kurzlebige Stripe-Sitzung). */
export async function erzeugePortalUrl(stripeCustomerId: string, rueckkehrUrl: string): Promise<string> {
  if (!portalKonfigCache) portalKonfigCache = await portalKonfigurationBereit();
  const session = await stripe().billingPortal.sessions.create({
    customer: stripeCustomerId,
    configuration: portalKonfigCache,
    return_url: rueckkehrUrl,
    locale: "de",
  });
  if (!session.url) throw new Error("Stripe lieferte keine Portal-URL.");
  return session.url;
}

/** Laufzeit-Stand eines Abos direkt aus Stripe (Kündigung zum Periodenende sichtbar machen). */
export interface AboLaufzeit {
  status: string;
  /** Datum, zu dem das Abo endet, wenn eine Kündigung vorgemerkt ist; sonst null. */
  gekuendigtZum: Date | null;
}

export async function ladeAboLaufzeit(stripeSubscriptionId: string): Promise<AboLaufzeit> {
  const sub = await stripe().subscriptions.retrieve(stripeSubscriptionId);
  const vorgemerkt = sub.cancel_at_period_end || sub.cancel_at !== null;
  // cancel_at ist bei cancel_at_period_end gesetzt; zur Sicherheit das Periodenende des ersten Postens.
  const ende = sub.cancel_at ?? sub.items?.data?.[0]?.current_period_end ?? null;
  return { status: sub.status, gekuendigtZum: vorgemerkt && ende ? new Date(ende * 1000) : null };
}
