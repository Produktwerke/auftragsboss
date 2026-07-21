// Einstiegspunkt: Fastify-Server + Webhook-Routen + Cron-Jobs.
import Fastify from "fastify";
import { config } from "./config.js";
import { whatsappRoutes } from "./whatsapp/webhook.js";
import { starteGewaehrleistungsJob } from "./jobs/warrantyReminders.js";

const app = Fastify({ logger: true });

// Health-Check (für Hosting/Uptime-Monitoring)
app.get("/health", async () => ({ status: "ok", service: "voiceprotokoll-guard" }));

await app.register(whatsappRoutes);

starteGewaehrleistungsJob();

try {
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  console.log(`🚀 VoiceProtokoll Guard läuft auf Port ${config.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
