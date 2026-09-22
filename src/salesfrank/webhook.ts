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
    call: { id: "{{call.id}}", duration: "{{call.duration}}", outcome: "{{call.outcome}}", reach: "{{call.reach}}", result: "{{call.result}}", detail: "{{call.detail}}", summary: "{{call.summary}}", transcript: "{{call.transcript}}" },
    lead: { name: "{{lead.name}}", phone: "{{lead.phone}}", email: "{{lead.email}}", company: "{{lead.company}}" },
    campaign: { id: "{{campaign.id}}", name: "{{campaign.name}}" },
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

/** Feldnamen eines Objekts bis Tiefe 2, ohne Werte (fürs Log). */
export function feldnamen(body: unknown): string[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [typeof body];
  const aus: string[] = [];
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (v && typeof v === "object" && !Array.isArray(v)) for (const k2 of Object.keys(v as object)) aus.push(`${k}.${k2}`);
    else aus.push(k);
  }
  return aus.slice(0, 60);
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
      // Nur die Feldnamen (keine Werte) ins Log, damit sich ein unbekanntes Format zuordnen lässt.
      req.log.warn({ felder: feldnamen(req.body) }, "SalesFrank-Webhook: Body ohne call.id");
      return reply.code(400).send({ fehler: "call.id fehlt" });
    }
    req.log.info({ callId: payload.callId, transkript: payload.transkript.length, zusammenfassung: payload.zusammenfassung.length, telefon: !!payload.telefon, firma: !!payload.firma }, "SalesFrank-Webhook angenommen");
    void verarbeiteSalesFrankAnruf(prisma, payload)
      .then((e) => req.log.info({ callId: payload.callId, ...e }, "SalesFrank-Anruf verarbeitet"))
      .catch((err) => req.log.error({ err, callId: payload.callId }, "SalesFrank-Anruf: Verarbeitung fehlgeschlagen"));
    return reply.send({ ok: true, angenommen: payload.callId });
  });
}
