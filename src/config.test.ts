import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { pruefeStartKonfiguration, bekannteSchluessel, emailConfig, KonfigFehler } from "./config.js";

const PFLICHT = {
  OPENAI_API_KEY: "sk-openai-testschluessel",
  ANTHROPIC_API_KEY: "sk-ant-testschluessel",
  WHATSAPP_ACCESS_TOKEN: "EAAB-testtoken-lang",
  WHATSAPP_PHONE_NUMBER_ID: "123456789",
  WHATSAPP_VERIFY_TOKEN: "verify-token-12",
  WHATSAPP_APP_SECRET: "app-secret-mindestens-16",
  SESSION_SECRET: "session-secret-mindestens-16",
  DATABASE_URL: "file:./test.db",
};

let sicherung: Record<string, string | undefined>;
beforeEach(() => {
  sicherung = {};
  for (const k of [...Object.keys(PFLICHT), "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]) sicherung[k] = process.env[k];
});
afterEach(() => {
  for (const [k, v] of Object.entries(sicherung)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("Boot-Gate (D-04)", () => {
  it("meldet alle fehlenden Pflichtwerte gesammelt", () => {
    for (const k of Object.keys(PFLICHT)) delete process.env[k];
    const probleme = pruefeStartKonfiguration();
    const text = probleme.join("\n");
    expect(text).toMatch(/OpenAI/);
    expect(text).toMatch(/Anthropic/);
    expect(text).toMatch(/WhatsApp/);
    expect(text).toMatch(/WHATSAPP_APP_SECRET/);
    expect(text).toMatch(/SESSION_SECRET/);
    expect(text).toMatch(/DATABASE_URL/);
  });

  it("gibt den Start frei, wenn alles gesetzt ist, und bemängelt zu kurze Geheimnisse", () => {
    Object.assign(process.env, PFLICHT);
    expect(pruefeStartKonfiguration()).toEqual([]);
    process.env.SESSION_SECRET = "kurz";
    expect(pruefeStartKonfiguration().join(" ")).toMatch(/SESSION_SECRET.*16/);
  });

  it("optionale Bereiche werfen KonfigFehler statt den Prozess zu beenden", () => {
    for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]) delete process.env[k];
    expect(() => emailConfig()).toThrow(KonfigFehler);
  });
});

describe("bekannteSchluessel (D-05)", () => {
  it("enthält Schema-Schlüssel und direkt gelesene Schlüssel", () => {
    const menge = bekannteSchluessel();
    for (const k of ["PORT", "OPENAI_API_KEY", "GRAPH_API_VERSION", "FEATURE_IMPORT", "WEBTEST_MAX_AUDIO_MB", "SMTP_FROM", "STRIPE_WEBHOOK_SECRET", "BETREIBER_HANDY", "DIREKTTEST_TAGE", "SESSION_SECRET", "UPLOADS_DIR", "ADMIN_PASSWORT_HASH"]) {
      expect(menge.has(k), k).toBe(true);
    }
    expect(menge.has("OPENAI_KEY")).toBe(false);
  });
});
