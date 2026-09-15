// Zentrale, validierte Konfiguration — aufgeteilt in Bereiche.
//
// Jeder Bereich wird ERST GEPRÜFT, WENN ER GEBRAUCHT WIRD (lazy). Dadurch
// läuft z.B. das KI-Test-Skript allein mit dem Anthropic-Key, ohne dass
// WhatsApp- oder SMTP-Zugangsdaten vorhanden sein müssen.
import "./env.js";
import { z } from "zod";

/** Fehlende oder ungültige Zugangsdaten. Wird GEWORFEN, nicht mit process.exit
 *  beantwortet (Nach-Audit 10.09., D-04): Ein fehlender SMTP-Wert soll eine
 *  einzelne Anfrage scheitern lassen, nicht den laufenden Server mitreißen.
 *  Nur der Startpfad (pruefeStartKonfiguration in server.ts) beendet den Prozess. */
export class KonfigFehler extends Error {
  constructor(
    readonly bereich: string,
    readonly punkte: string[],
  ) {
    super(`Fehlende oder ungültige Zugangsdaten für: ${bereich}\n${punkte.map((p) => `   • ${p}`).join("\n")}\n→ Trage die Werte in die Datei .env ein (Vorlage: .env.example).`);
    this.name = "KonfigFehler";
  }
}

// Alle Bereiche merken, damit env-check.ts die gültigen Schlüssel aus den
// Schemata ableiten kann statt aus einer handgepflegten Liste (D-05).
const BEREICHE: Array<{ name: string; schema: z.ZodObject<z.ZodRawShape> }> = [];

function lade<T extends z.ZodObject<z.ZodRawShape>>(name: string, schema: T): () => z.infer<T> {
  BEREICHE.push({ name, schema });
  let cache: z.infer<T> | undefined;
  return () => {
    if (cache) return cache;
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new KonfigFehler(
        name,
        parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      );
    }
    cache = parsed.data;
    return cache;
  };
}

// Schlüssel, die nicht über ein Schema laufen, sondern direkt gelesen werden
// (Signaturen, Cookies, Admin-Zugang, Pfade). Mit aufgeführt, damit env-check
// sie nicht als Tippfehler meldet.
export const DIREKT_GELESENE_SCHLUESSEL = [
  "DATABASE_URL", "BASE_URL", "ADMIN_TOKEN", "ADMIN_EMAIL", "ADMIN_PASSWORT_HASH",
  "SESSION_SECRET", "WHATSAPP_APP_SECRET", "LEAD_VORLAGE", "TEST_VORLAGE", "TEAM_MAIL", "UPLOADS_DIR",
] as const;

/** Alle gültigen .env-Schlüssel: aus den Schemata abgeleitet plus die direkt gelesenen. */
export function bekannteSchluessel(): Set<string> {
  const menge = new Set<string>(DIREKT_GELESENE_SCHLUESSEL);
  for (const b of BEREICHE) for (const k of Object.keys(b.schema.shape)) menge.add(k);
  return menge;
}

/**
 * Boot-Gate (D-04): prüft beim Serverstart ALLE Bereiche, ohne die der Betrieb
 * nicht laufen kann, plus die direkt gelesenen Geheimnisse. Liefert die Liste
 * der Probleme; leer = start frei. Optionale Bereiche (SMTP, Stripe, Betreiber)
 * bleiben lazy, damit ein Testsystem ohne sie läuft.
 */
export function pruefeStartKonfiguration(): string[] {
  const probleme: string[] = [];
  for (const bereich of [serverConfig, openaiConfig, anthropicConfig, whatsappConfig, featureConfig, direkttestConfig, webtestConfig]) {
    try {
      bereich();
    } catch (err) {
      probleme.push(err instanceof KonfigFehler ? `${err.bereich}: ${err.punkte.join("; ")}` : String(err));
    }
  }
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim() ?? "";
  if (appSecret.length < 16) probleme.push("WHATSAPP_APP_SECRET fehlt oder ist kürzer als 16 Zeichen (Webhook-Signaturprüfung).");
  const session = process.env.SESSION_SECRET?.trim() ?? "";
  if (session.length < 16) probleme.push("SESSION_SECRET fehlt oder ist kürzer als 16 Zeichen (Cookies überleben sonst keinen Neustart).");
  if (!process.env.DATABASE_URL?.trim()) probleme.push("DATABASE_URL fehlt.");
  return probleme;
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
    // Angebots-KI (15.09.2026, Kostenproben): Modell und Denktiefe ohne Deploy umstellbar.
    ANGEBOT_MODELL: z.string().trim().min(1).default("claude-fable-5"),
    ANGEBOT_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("high"),
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
    // Länge der Testphase in Tagen ab Anlage des Test-Kontos. Kommuniziert wird
    // NUR diese Zahl ("14 Tage kostenlos testen").
    DIREKTTEST_TAGE: z.coerce.number().int().min(1).default(14),
    // Stiller Angebots-Deckel innerhalb der Testphase (fertige Test-Angebote pro
    // Nummer). Wird bewusst NICHT kommuniziert — wer ihn vor Ablauf der Tage
    // reißt, bekommt dieselbe "Testphase abgelaufen"-Nachricht.
    DIREKTTEST_GRATIS_ANGEBOTE: z.coerce.number().int().min(0).default(10),
    // Harte Obergrenze verarbeiteter Nachrichten pro Nummer (fängt Dauer-Kauderwelsch
    // ab). Muss zum Angebots-Deckel passen: ~6 Nachrichten je Angebot einplanen.
    DIREKTTEST_MAX_NACHRICHTEN: z.coerce.number().int().min(1).default(60),
    // Tages-Gesamtdeckel über alle Nummern (Kostenobergrenze).
    DIREKTTEST_MAX_PRO_TAG: z.coerce.number().int().min(1).default(80),
    // Mindestabstand zwischen zwei Nachrichten derselben Nummer, in Sekunden.
    DIREKTTEST_MIN_ABSTAND_SEKUNDEN: z.coerce.number().int().min(0).default(3),
    // Länderkennungen, aus denen unbekannte Nummern ein Test-Konto bekommen (ohne +,
    // Komma-getrennt). Standard: nur Deutschland. Andere Nummern werden freundlich
    // abgewiesen und verursachen keine KI-Kosten. Betreibt der Betreiber einen Lead
    // über das Cockpit (dokumentiertes Opt-in), gilt die Sperre nicht.
    DIREKTTEST_LAENDER: z
      .string()
      .default("49")
      .transform((v) => v.split(",").map((s) => s.trim().replace(/^\+/, "")).filter((s) => /^\d{1,4}$/.test(s))),
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
    // Selbst-Registrierung: Ein Test-Konto kann sich per Web-Formular selbst zum
    // echten Betrieb aufwerten (WhatsApp-verifizierte Nummer). Standardmäßig aus.
    FEATURE_SELBSTREGISTRIERUNG: flagge(false),
    // PLZ-Nachschlag im Editor über OpenPLZ (EU/DE). Manueller Knopf, serverseitig.
    // Erst scharfschalten, wenn der OpenPLZ-Hinweis in der Datenschutzerklärung steht.
    FEATURE_PLZ_LOOKUP: flagge(false),
    // Maler-Fachengine v1 — je Baustein einzeln scharfschaltbar.
    FEATURE_IMPORT: flagge(false), // Altangebots-Import
    FEATURE_BETRIEBSPROFIL: flagge(false), // privates Betriebsprofil + Retrieval
    FEATURE_LERNEN: flagge(false), // Lernen aus Korrekturen (Regelkandidaten)
    // Umgang mit historischen Preisen. v1-Sicherheit: nur vorschlagen, nie
    // automatisch setzen (erst eine bestätigte Betriebsregel dürfte "auto" erlauben).
    HISTORICAL_PRICE_BEHAVIOR: z.enum(["suggest_only", "auto"]).default("suggest_only"),
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
    WEBTEST_MAX_PRO_IP: z.coerce.number().int().min(1).default(2),
    // Tages-Gesamtdeckel über alle Besucher (Kostenobergrenze).
    WEBTEST_MAX_PRO_TAG: z.coerce.number().int().min(1).default(50),
    // Monats-Gesamtdeckel über alle Besucher (zusätzliche Kostenobergrenze).
    WEBTEST_MAX_PRO_MONAT: z.coerce.number().int().min(1).default(800),
    // Mindestabstand zwischen zwei Versuchen derselben IP, in Sekunden.
    WEBTEST_MIN_ABSTAND_SEKUNDEN: z.coerce.number().int().min(0).default(5),
    // Größenobergrenze für eine Test-Aufnahme (dekodiert), in MB.
    WEBTEST_MAX_AUDIO_MB: z.coerce.number().min(1).default(12),
  }),
);

// Stripe (Abo-Abrechnung). Der geheime Schlüssel liegt NUR in der .env
// (Testmodus sk_test_…, live sk_live_…). STRIPE_WEBHOOK_SECRET (whsec_…)
// stammt aus dem Stripe-Dashboard beim Anlegen des Webhook-Endpunkts und
// sichert die Echtheitsprüfung eingehender Ereignisse ab.
export const stripeConfig = lade(
  "Stripe",
  z.object({
    STRIPE_SECRET_KEY: z.string().startsWith("sk_", "muss mit 'sk_' beginnen"),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_", "muss mit 'whsec_' beginnen"),
  }),
);

/** Prüft, OB Stripe hinterlegt ist — ohne bei Fehlen den Server zu beenden.
 *  Ohne Schlüssel bleibt der Webhook einfach aus (404), alles andere läuft. */
export function stripeKonfiguriert(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.startsWith("sk_") &&
      process.env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_"),
  );
}

/** Handynummer aus der .env ins WhatsApp-Format bringen: nur Ziffern,
 *  deutsche 0-Vorwahl wird zu 49. Leeres/Unbrauchbares ergibt null —
 *  die Betreiber-Benachrichtigung ist dann einfach aus (kein Abbruch). */
export function normalisiereHandy(wert: string | undefined): string | null {
  const ziffern = (wert ?? "").replace(/\D/g, "");
  if (!ziffern) return null;
  const voll = ziffern.startsWith("0") ? "49" + ziffern.slice(1) : ziffern;
  return voll.length >= 8 && voll.length <= 16 ? voll : null;
}

// Betreiber-Benachrichtigung: WhatsApp an den Betreiber (Dirk) bei wichtigen
// Ereignissen — erste Anwendung "neuer Kunde hat ein Abo gebucht" (wird mit
// der Stripe-Anbindung ausgelöst). Ohne BETREIBER_HANDY in der .env ist die
// Funktion aus; die Vorlage muss bei Meta angelegt und genehmigt sein.
export const betreiberConfig = lade(
  "Betreiber-Benachrichtigung",
  z.object({
    BETREIBER_HANDY: z.string().optional().transform(normalisiereHandy),
    BETREIBER_VORLAGE_NEUER_KUNDE: z.string().default("neuer_kunde"),
    // Störungsalarm + Entwarnung (13.09.2026), Vorlage: Verwaltung/Utility, {{1}} was, {{2}} Stand.
    BETREIBER_VORLAGE_ALARM: z.string().default("betreiber_alarm"),
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
/**
 * Prüft, OB ein Anthropic-Key hinterlegt ist — ohne bei Fehlen den Server zu
 * beenden (anders als anthropicConfig()). So kann der Import die KI-Auslese
 * nutzen, wenn ein Key da ist, und sonst sauber auf den Regel-Parser zurückfallen.
 */
export function anthropicKonfiguriert(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.startsWith("sk-ant-"));
}

export function smtpKonfiguriert(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim() &&
      process.env.SMTP_FROM?.trim(),
  );
}
