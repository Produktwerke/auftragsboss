// Einstiegspunkt: Fastify-Server + Webhook-Routen + Cron-Jobs.
import Fastify from "fastify";
import { serverConfig } from "./config.js";
import { whatsappRoutes } from "./whatsapp/webhook.js";
import { editorRoutes } from "./web/routes.js";
import { importRoutes } from "./web/importRoutes.js";
import { registrierungRoutes } from "./web/registrierungRoutes.js";
import { betreiberRoutes } from "./web/betreiberRoutes.js";
import { adminAuthRoutes } from "./web/adminAuth.js";
import { stripeWebhookRoutes } from "./web/stripeWebhook.js";
import { starteGewaehrleistungsJob } from "./jobs/warrantyReminders.js";
import { starteVorgangTimeoutJob } from "./jobs/vorgangTimeout.js";

const app = Fastify({ logger: true });

// Health-Check (für Hosting/Uptime-Monitoring)
app.get("/health", async () => ({ status: "ok", service: "voiceprotokoll-guard" }));

await app.register(whatsappRoutes);
await app.register(editorRoutes);
await app.register(importRoutes);
await app.register(registrierungRoutes);
await app.register(betreiberRoutes);
await app.register(adminAuthRoutes);
await app.register(stripeWebhookRoutes);

starteGewaehrleistungsJob();
starteVorgangTimeoutJob();

const { PORT, HOST } = serverConfig();

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`🚀 VoiceProtokoll Guard läuft auf ${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
