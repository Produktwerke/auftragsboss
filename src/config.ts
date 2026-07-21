// Zentrale, validierte Konfiguration.
// Fail-fast: Fehlt eine Variable, stirbt der Server beim Start mit klarer Meldung.
import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string(),
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-"),
  OPENAI_API_KEY: z.string().min(10),
  WHATSAPP_ACCESS_TOKEN: z.string().min(10),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(5),
  WHATSAPP_VERIFY_TOKEN: z.string().min(8),
  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),
  SMTP_FROM: z.string(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Fehlende/ungültige Umgebungsvariablen:");
  for (const issue of parsed.error.issues) {
    console.error(`   ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("→ .env anhand von .env.example anlegen.");
  process.exit(1);
}

export const config = parsed.data;
