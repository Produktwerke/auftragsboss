// Integrationstest der Webhook-Route: echte Fastify-Instanz, echte
// Stripe-Signaturprüfung (generateTestHeaderString), kein Netz.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Stripe from "stripe";

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "sk_test_nur-fuer-tests";
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_nur_fuer_tests";

const { stripeWebhookRoutes } = await import("./stripeWebhook.js");

describe("Stripe-Webhook-Route", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(stripeWebhookRoutes);
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  function signiert(payload: string): string {
    return Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET as string,
    });
  }

  it("gültige Signatur → 200, unbekannter Ereignistyp wird ignoriert", async () => {
    const payload = JSON.stringify({ id: "evt_1", type: "product.created", data: { object: {} } });
    const res = await app.inject({
      method: "POST",
      url: "/webhook/stripe",
      headers: { "content-type": "application/json", "stripe-signature": signiert(payload) },
      payload,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, aktion: "ignoriert" });
  });

  it("falsche/fehlende Signatur → 400", async () => {
    const payload = JSON.stringify({ id: "evt_2", type: "product.created", data: { object: {} } });
    const falsch = await app.inject({
      method: "POST",
      url: "/webhook/stripe",
      headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=kaputt" },
      payload,
    });
    expect(falsch.statusCode).toBe(400);
    const ohne = await app.inject({
      method: "POST",
      url: "/webhook/stripe",
      headers: { "content-type": "application/json" },
      payload,
    });
    expect(ohne.statusCode).toBe(400);
  });
});
