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
  z.object({
    PORT: z.coerce.number().default(3000),
    // Lauschadresse. Standard: NUR localhost — sicher fürs lokale Testen
    // (auch mit Tunnel, der ja auf demselben Rechner läuft). Fürs Hosting
    // HOST=0.0.0.0 in der .env setzen, damit der Server von außen erreichbar ist.
    HOST: z.string().default("127.0.0.1"),
  }),
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
    // Graph-API-Version — konfigurierbar, damit man ohne Codeänderung auf die
    // im Meta-Dashboard aktuelle Version wechseln kann. Standard: eine aktuelle
    // Version; im Dashboard siehst du, welche deine App nutzt (z.B. v25.0) und
    // kannst sie hier per .env angleichen.
    GRAPH_API_VERSION: z
      .string()
      .regex(/^v\d+\.\d+$/, "Format wie v23.0")
      .default("v23.0"),
  }),
);

// Test-Funktion "Direkt testen": Steuert, ob unbekannte Nummern von der
// Landingpage aus ein kostenloses Beispiel-Angebot bekommen — und die Grenzen
// dagegen. Alle Werte haben Vorgaben, damit ohne .env-Eintrag nichts anläuft
// (DIREKTTEST_AKTIV standardmäßig aus). Details siehe direkttest.ts.
export const direkttestConfig = lade(
  "Direkt-Test",
  z.object({
    // Not-Aus. Nur "true"/"1"/"ja"/"on" schaltet die Funktion an — sonst aus.
    DIREKTTEST_AKTIV: z
      .string()
      .default("false")
      .transform((v) => ["true", "1", "ja", "on"].includes(v.trim().toLowerCase())),
    // Gratis-Angebote pro Nummer (fertige Test-Angebote), danach Einladung zur Anmeldung.
    DIREKTTEST_GRATIS_ANGEBOTE: z.coerce.number().int().min(0).default(2),
    // Harte Obergrenze verarbeiteter Nachrichten pro Nummer (fängt Dauer-Kauderwelsch ab).
    DIREKTTEST_MAX_NACHRICHTEN: z.coerce.number().int().min(1).default(12),
    // Tages-Gesamtdeckel über alle Nummern (Kostenobergrenze).
    DIREKTTEST_MAX_PRO_TAG: z.coerce.number().int().min(1).default(80),
    // Mindestabstand zwischen zwei Nachrichten derselben Nummer, in Sekunden.
    DIREKTTEST_MIN_ABSTAND_SEKUNDEN: z.coerce.number().int().min(0).default(3),
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
