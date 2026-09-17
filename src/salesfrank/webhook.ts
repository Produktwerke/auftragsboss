// Webhook für SalesFrank (KI-Telefonakquise): POST /webhook/salesfrank/<geheimnis>
//
// SalesFrank signiert seine Webhooks nicht; der Schutz ist das Geheimnis im Pfad
// (SALESFRANK_WEBHOOK_SECRET in der .env, Anzeige im Betreiber-Cockpit). Ohne
// Geheimnis in der .env: 404 (fail closed). Die Verarbeitung (Claude-Bewertung,
// WhatsApp-Einladung) dauert Sekunden, deshalb antworten wir sofort mit 200 und
// arbeiten im Hintergrund; doppelte Zustellung ist über call.id unschädlich.
import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "../pipeline.js";
import { liesPayload, verarbeiteSalesFrankAnruf } from "./verarbeitung.js";

/** JSON-Vorlage für den Post-Call-Webhook in SalesFrank (Platzhalter von SalesFrank). */
export const SALESFRANK_WEBHOOK_VORLAGE = JSON.stringify(
  {
    event: "call.completed",
    call: { id: "{{call.id}}", outcome: "{{call.outcome}}", reach: "{{call.reach}}", result: "{{call.result}}", summary: "{{call.summary}}", transcript: "{{call.transcript}}" },
    lead: { name: "{{lead.name}}", phone: "{{lead.phone}}", company: "{{lead.company}}", custom_variables: { firma: "{{firma}}", anrede: "{{anrede}}" } },
  },
  null,
  2,
);

export function salesfrankSecret(env: NodeJS.ProcessEnv = process.env): string {
  return env.SALESFRANK_WEBHOOK_SECRET?.trim() ?? "";
}

export function salesfrankWebhookUrl(baseUrl: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const s = salesfrankSecret(env);
  return s ? `${baseUrl.replace(/\/$/, "")}/webhook/salesfrank/${s}` : null;
}

function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function salesfrankRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { secret: string } }>("/webhook/salesfrank/:secret", async (req, reply) => {
    const secret = salesfrankSecret();
    if (!secret || !gleich(req.params.secret, secret)) return reply.code(404).send({ fehler: "nicht gefunden" });
    const payload = liesPayload(req.body);
    if (!payload) {
      req.log.warn("SalesFrank-Webhook: Body ohne call.id");
      return reply.code(400).send({ fehler: "call.id fehlt" });
    }
    void verarbeiteSalesFrankAnruf(prisma, payload)
      .then((e) => req.log.info({ callId: payload.callId, ...e }, "SalesFrank-Anruf verarbeitet"))
      .catch((err) => req.log.error({ err, callId: payload.callId }, "SalesFrank-Anruf: Verarbeitung fehlgeschlagen"));
    return reply.send({ ok: true, angenommen: payload.callId });
  });
}
