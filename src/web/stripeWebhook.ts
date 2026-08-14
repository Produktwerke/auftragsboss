// Stripe-Webhook: nimmt Abrechnungs-Ereignisse entgegen (Abo gebucht,
// Rechnung bezahlt, Abo gekündigt, Zahlung geplatzt) und übersetzt sie über
// stripeVerarbeitung.ts in Abo + Buchungs-Ledger.
//
// Sicherheit: Stripe signiert jeden Aufruf (Stripe-Signature-Header); die
// Prüfung braucht den ROHEN Body, deshalb hat dieses Plugin einen eigenen
// Body-Parser (Buffer statt geparstem JSON) — dank Fastify-Kapselung gilt der
// nur für diese Route. Ohne Stripe-Zugangsdaten in der .env: 404 (fail closed).
import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { stripeConfig, stripeKonfiguriert } from "../config.js";
import { prisma } from "../pipeline.js";
import { verarbeiteStripeEvent } from "../betrieb/stripeVerarbeitung.js";

export async function stripeWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) =>
    done(null, body),
  );

  app.post("/webhook/stripe", async (req, reply) => {
    if (!stripeKonfiguriert()) return reply.code(404).send({ fehler: "Nicht konfiguriert" });
    const cfg = stripeConfig();
    const stripe = new Stripe(cfg.STRIPE_SECRET_KEY);

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body as Buffer,
        String(req.headers["stripe-signature"] ?? ""),
        cfg.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      req.log.warn({ err }, "Stripe-Webhook: Signaturprüfung fehlgeschlagen");
      return reply.code(400).send({ fehler: "Ungültige Signatur" });
    }

    try {
      const ergebnis = await verarbeiteStripeEvent(prisma, event as never);
      req.log.info({ typ: event.type, ...ergebnis }, "Stripe-Webhook verarbeitet");
      return reply.send({ ok: true, aktion: ergebnis.aktion });
    } catch (err) {
      // 500 → Stripe stellt das Ereignis später erneut zu (unsere Verarbeitung
      // ist idempotent, doppelte Zustellung ist also unschädlich).
      req.log.error({ err, typ: event.type }, "Stripe-Webhook: Verarbeitung fehlgeschlagen");
      return reply.code(500).send({ fehler: "Verarbeitung fehlgeschlagen" });
    }
  });
}
