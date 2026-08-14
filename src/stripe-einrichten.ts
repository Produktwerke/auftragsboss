// Richtet die AuftragsBoss-Tarife in Stripe ein (idempotent — mehrfaches
// Ausführen legt nichts doppelt an):
//   • Produkte + monatliche Preise: Basis 49 / Profi 99 / Team 199 € NETTO
//     (Steuerverhalten "exclusive" = MwSt kommt obendrauf), lookup_keys
//     basis/profi/team — darüber findet der Code die Preise ohne IDs in der .env.
//   • Steuersatz 19 % MwSt (Deutschland, nicht inklusive).
//
// Aufruf (nutzt STRIPE_SECRET_KEY aus der .env — Testmodus sk_test_… zuerst!):
//   npx tsx src/stripe-einrichten.ts
//
// Nach dem Lauf im Stripe-Dashboard unter Produkte kontrollierbar.
import "dotenv/config";
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key?.startsWith("sk_")) {
  console.error("STRIPE_SECRET_KEY fehlt in der .env (Testmodus: beginnt mit sk_test_).");
  process.exit(1);
}
const modus = key.startsWith("sk_test_") ? "TESTMODUS" : "LIVE";
const stripe = new Stripe(key);

const TARIFE = [
  { lookup: "basis", name: "AuftragsBoss Basis", nettoCent: 4900, angebote: 20 },
  { lookup: "profi", name: "AuftragsBoss Profi", nettoCent: 9900, angebote: 80 },
  { lookup: "team", name: "AuftragsBoss Team", nettoCent: 19900, angebote: 200 },
];

console.log(`Stripe-Einrichtung (${modus}) …\n`);

// Preise über lookup_key suchen — gibt es sie schon, ist nichts zu tun.
const vorhandene = await stripe.prices.list({
  lookup_keys: TARIFE.map((t) => t.lookup),
  limit: 10,
});

for (const tarif of TARIFE) {
  const preis = vorhandene.data.find((p) => p.lookup_key === tarif.lookup);
  if (preis) {
    console.log(`✓ ${tarif.name}: Preis existiert schon (${preis.id})`);
    continue;
  }
  const produkt = await stripe.products.create({
    name: tarif.name,
    description: `AuftragsBoss-Abo ${tarif.name.split(" ")[1]}: bis zu ${tarif.angebote} Angebote pro Monat. Preis zzgl. MwSt.`,
  });
  const neu = await stripe.prices.create({
    product: produkt.id,
    currency: "eur",
    unit_amount: tarif.nettoCent,
    tax_behavior: "exclusive", // netto — Steuer kommt obendrauf
    recurring: { interval: "month" },
    lookup_key: tarif.lookup,
  });
  console.log(`+ ${tarif.name}: Produkt ${produkt.id}, Preis ${neu.id} (${tarif.nettoCent / 100} €/Monat netto)`);
}

// Steuersatz 19 % MwSt (Deutschland), falls noch nicht vorhanden.
const saetze = await stripe.taxRates.list({ active: true, limit: 100 });
let mwst = saetze.data.find((s) => s.percentage === 19 && !s.inclusive && s.country === "DE");
if (mwst) {
  console.log(`✓ Steuersatz 19 % MwSt existiert schon (${mwst.id})`);
} else {
  mwst = await stripe.taxRates.create({
    display_name: "MwSt",
    percentage: 19,
    inclusive: false,
    country: "DE",
    description: "19 % Mehrwertsteuer (Deutschland)",
  });
  console.log(`+ Steuersatz 19 % MwSt angelegt (${mwst.id})`);
}

console.log(`\nFertig (${modus}). Die Preise sind über ihre lookup_keys basis/profi/team auffindbar.`);
