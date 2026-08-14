-- Räumt die Stripe-TESTMODUS-Spuren aus dem Ledger (einmalig nach dem
-- Testmodus-Durchstich vom 14.08.2026). Betrifft NUR Stripe-Buchungen und
-- Stripe-Abos — manuell erfasste Zahlungen und Abos bleiben unberührt.
DELETE FROM Buchung WHERE notiz LIKE 'Stripe-Rechnung%' OR notiz LIKE 'Stripe-Erstattung%';
DELETE FROM Abo WHERE stripeSubscriptionId IS NOT NULL;
