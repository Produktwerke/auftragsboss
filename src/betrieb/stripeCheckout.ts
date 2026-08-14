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
