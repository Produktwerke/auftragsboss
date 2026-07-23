// Einstiegspunkt: Fastify-Server + Webhook-Routen + Cron-Jobs.
import Fastify from "fastify";
import { serverConfig } from "./config.js";
import { whatsappRoutes } from "./whatsapp/webhook.js";
import { editorRoutes } from "./web/routes.js";
import { starteGewaehrleistungsJob } from "./jobs/warrantyReminders.js";
import { starteVorgangTimeoutJob } from "./jobs/vorgangTimeout.js";

const app = Fastify({ logger: true });

// Health-Check (für Hosting/Uptime-Monitoring)
app.get("/health", async () => ({ status: "ok", service: "voiceprotokoll-guard" }));

await app.register(whatsappRoutes);
await app.register(editorRoutes);

starteGewaehrleistungsJob();
starteVorgangTimeoutJob();

const port = serverConfig().PORT;

try {
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`🚀 VoiceProtokoll Guard läuft auf Port ${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
