// Zentrale, validierte Konfiguration — aufgeteilt in Bereiche.
//
// Jeder Bereich wird ERST GEPRÜFT, WENN ER GEBRAUCHT WIRD (lazy). Dadurch
// läuft z.B. das KI-Test-Skript allein mit dem Anthropic-Key, ohne dass
// WhatsApp- oder SMTP-Zugangsdaten vorhanden sein müssen.
import "dotenv/config";
import { z } from "zod";

function lade<T extends z.ZodType>(name: string, schema: T): () => z.infer<T> {
  let cache: z.infer<T> | undefined;
  return () => {
    if (cache) return cache;
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      console.error(`\n❌ Fehlende oder ungültige Zugangsdaten für: ${name}\n`);
      for (const issue of parsed.error.issues) {
        console.error(`   • ${issue.path.join(".")}: ${issue.message}`);
      }
      console.error(`\n→ Trage die Werte in die Datei .env ein (Vorlage: .env.example).\n`);
      process.exit(1);
    }
    cache = parsed.data;
    return cache;
  };
}

export const serverConfig = lade(
  "Server",
  z.object({ PORT: z.coerce.number().default(3000) }),
);

// Nur OpenAI — für die Transkription (Whisper). Bewusst getrennt, damit
// sich eine Sprachnachricht auch ohne Anthropic-Zugang testen lässt.
export const openaiConfig = lade(
  "OpenAI (Whisper)",
  z.object({
    OPENAI_API_KEY: z.string().min(10),
  }),
);

// Nur Anthropic — für die Strukturierung des Transkripts.
export const anthropicConfig = lade(
  "Anthropic",
  z.object({
    ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-", "muss mit 'sk-ant-' beginnen"),
  }),
);

export const whatsappConfig = lade(
  "WhatsApp (Meta Cloud API)",
  z.object({
    WHATSAPP_ACCESS_TOKEN: z.string().min(10),
    WHATSAPP_PHONE_NUMBER_ID: z.string().min(5),
    WHATSAPP_VERIFY_TOKEN: z.string().min(8),
  }),
);

export const emailConfig = lade(
  "E-Mail (SMTP)",
  z.object({
    SMTP_HOST: z.string(),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string(),
    SMTP_PASS: z.string(),
    SMTP_FROM: z.string(),
  }),
);
