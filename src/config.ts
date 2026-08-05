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

// Feature-Flags für den schrittweisen Maler-Umbau. Jede neue Fähigkeit liegt
// hinter einem Schalter, der standardmäßig AUS ist — so verändert der Umbau das
// Live-Verhalten erst, wenn der jeweilige Baustein bewusst aktiviert wird
// (Rollback = Flag in der .env auf "false"). Bricht nie ab (alles hat Vorgaben).
const flagge = (vorgabe: boolean) =>
  z
    .string()
    .default(String(vorgabe))
    .transform((v) => ["true", "1", "ja", "on"].includes(v.trim().toLowerCase()));

export const featureConfig = lade(
  "Feature-Flags",
  z.object({
    // Deterministischer Validator vor jeder Ausgabe (erzwingt: keine erfundenen
    // Preise/Fakten, Herkunft je Position, keine Fremd-Betriebsdaten).
    FEATURE_VALIDATOR: flagge(false),
    // Preisgedächtnis: merkt sich (opt-in je Betrieb), wie ähnliche Leistungen
    // zuletzt kalkuliert wurden, und schlägt sie datiert vor.
    FEATURE_PREISGEDAECHTNIS: flagge(false),
    // Maler-Scope: Gewerk als explizites Objekt, Maler-Fachlogik greift.
    FEATURE_MALER_SCOPE: flagge(false),
    // Zusammenfassung "das habe ich verstanden" vor dem Angebot (mit Skip).
    FEATURE_ZUSAMMENFASSUNG: flagge(false),
  }),
);

// Öffentlicher "Jetzt testen"-Aufnahmeknopf auf der Website: anonyme Besucher
// diktieren im Browser und bekommen ein echtes Angebot im Editor. Missbrauchs-
// und Kostenschutz IP-basiert. Standardmäßig aus (WEBTEST_AKTIV).
export const webtestConfig = lade(
  "Web-Test (Aufnahmeknopf)",
  z.object({
    WEBTEST_AKTIV: flagge(false),
    // Kostenlose Test-Angebote pro IP (danach Hinweis auf Anmeldung).
    WEBTEST_MAX_PRO_IP: z.coerce.number().int().min(1).default(3),
    // Tages-Gesamtdeckel über alle Besucher (Kostenobergrenze).
    WEBTEST_MAX_PRO_TAG: z.coerce.number().int().min(1).default(100),
    // Mindestabstand zwischen zwei Versuchen derselben IP, in Sekunden.
    WEBTEST_MIN_ABSTAND_SEKUNDEN: z.coerce.number().int().min(0).default(5),
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

/**
 * Prüft, OB SMTP hinterlegt ist — ohne bei Fehlen den Server zu beenden
 * (anders als emailConfig(), das hart abbricht). So kann der Editor den
 * "auch als E-Mail senden"-Weg sauber mit einer Meldung ablehnen, statt
 * den Prozess mitzureißen.
 */
export function smtpKonfiguriert(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim() &&
      process.env.SMTP_FROM?.trim(),
  );
}
