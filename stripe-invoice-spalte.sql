ALTER TABLE Buchung ADD COLUMN stripeInvoiceId TEXT;
CREATE UNIQUE INDEX "Buchung_stripeInvoiceId_key" ON "Buchung"("stripeInvoiceId");
