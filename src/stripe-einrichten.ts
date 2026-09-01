// Richtet die AuftragsBoss-Tarife in Stripe ein (idempotent — mehrfaches
// Ausführen legt nichts doppelt an):
//   • Produkte + monatliche Preise: Basis 29 / Profi 79 / Team 149 € NETTO
//     (Steuerverhalten "exclusive" = MwSt kommt obendrauf), lookup_keys
//     basis/profi/team — darüber findet der Code die Preise ohne IDs in der .env.
//   • Preisänderung: Stripe-Preise sind unveränderlich — das Skript legt dann
//     einen NEUEN Preis am selben Produkt an, nimmt den lookup_key mit
//     (transfer_lookup_key) und deaktiviert den alten. Bestehende Abos behalten
//     ihren alten Preis; neue Checkouts nutzen automatisch den neuen.
//   • Steuersatz 19 % MwSt (Deutschland, nicht inklusive).
//
// Aufruf (nutzt STRIPE_SECRET_KEY aus der .env — Testmodus sk_test_… zuerst!):
//   npx tsx src/stripe-einrichten.ts
//
// Nach dem Lauf im Stripe-Dashboard unter Produkte kontrollierbar.
import "./env.js";
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key?.startsWith("sk_")) {
  console.error("STRIPE_SECRET_KEY fehlt in der .env (Testmodus: beginnt mit sk_test_).");
  process.exit(1);
}
const modus = key.startsWith("sk_test_") ? "TESTMODUS" : "LIVE";
const stripe = new Stripe(key);

// Kontingente müssen zur Preisseite der Landingpage passen (50/120/300);
// Preise müssen zu TARIF_PRESETS in betrieb/abrechnung.ts passen (29/79/149).
const TARIFE = [
  { lookup: "basis", name: "AuftragsBoss Basis", nettoCent: 2900, angebote: 50 },
  { lookup: "profi", name: "AuftragsBoss Profi", nettoCent: 7900, angebote: 120 },
  { lookup: "team", name: "AuftragsBoss Team", nettoCent: 14900, angebote: 300 },
];

console.log(`Stripe-Einrichtung (${modus}) …\n`);

// Preise über lookup_key suchen — gibt es sie schon, ist nichts zu tun.
const vorhandene = await stripe.prices.list({
  lookup_keys: TARIFE.map((t) => t.lookup),
  limit: 10,
});

for (const tarif of TARIFE) {
  const beschreibung = `AuftragsBoss-Abo ${tarif.name.split(" ")[1]}: bis zu ${tarif.angebote} Angebote pro Monat. Preis zzgl. MwSt.`;
  const preis = vorhandene.data.find((p) => p.lookup_key === tarif.lookup);
  if (preis && preis.unit_amount === tarif.nettoCent) {
    // Betrag stimmt schon — nur Produkt-Beschreibung nachziehen
    // (z. B. geänderte Kontingente).
    await stripe.products.update(String(preis.product), { name: tarif.name, description: beschreibung });
    console.log(`✓ ${tarif.name}: Preis existiert schon (${preis.id}), Beschreibung aktualisiert`);
    continue;
  }
  if (preis) {
    // Betrag hat sich geändert: neuen Preis am selben Produkt anlegen, den
    // lookup_key mitnehmen und den alten Preis deaktivieren. Laufende Abos
    // behalten ihren alten Preis; neue Checkouts finden über den lookup_key
    // automatisch den neuen.
    await stripe.products.update(String(preis.product), { name: tarif.name, description: beschreibung });
    const neu = await stripe.prices.create({
      product: String(preis.product),
      currency: "eur",
      unit_amount: tarif.nettoCent,
      tax_behavior: "exclusive",
      recurring: { interval: "month" },
      lookup_key: tarif.lookup,
      transfer_lookup_key: true,
    });
    await stripe.prices.update(preis.id, { active: false });
    console.log(
      `↻ ${tarif.name}: Preis geändert ${(preis.unit_amount ?? 0) / 100} → ${tarif.nettoCent / 100} €/Monat netto ` +
        `(neu ${neu.id}, alt ${preis.id} deaktiviert)`,
    );
    continue;
  }
  const produkt = await stripe.products.create({
    name: tarif.name,
    description: beschreibung,
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
