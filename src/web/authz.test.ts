// Autorisierungs-Testsuite (Audit-Maßnahme 17, AB-M14).
//
// Prüft auf ROUTEN-EBENE gegen eine echte (Wegwerf-)Datenbank, dass jede
// Tür verschlossen ist: Zugangs-Schleuse, Mandantentrennung, Cockpit-Login,
// Webtest-Abschottung, Webhook-Signatur, Eingabe-Validierung. Genau die
// Testklasse, deren Fehlen die Audit-Funde K01/K02 durchrutschen ließ —
// entfernt jemand künftig eine Prüfzeile, wird dieser Lauf rot.
//
// WICHTIG: Die Umgebung wird VOR den App-Importen gesetzt (pipeline.ts
// erzeugt den Prisma-Client beim Import) — deshalb ausschließlich
// dynamische Importe im beforeAll.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { createHmac } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";

// Datenbankname je Testprozess eindeutig — ein hängender Vorläufer-Prozess
// (Windows-Dateisperre) kann so nie in einen frischen Lauf hineinfunken.
const DB_DATEI = `prisma/test-authz-${process.pid}.db`;
process.env.DATABASE_URL = `file:./${DB_DATEI}`;
process.env.SESSION_SECRET = "test-session-geheimnis-mindestens-16-zeichen";
process.env.ADMIN_EMAIL = "admin@test.de";
process.env.FEATURE_SELBSTREGISTRIERUNG = "true";
delete process.env.WHATSAPP_APP_SECRET;
delete process.env.ADMIN_TOKEN;

const NUMMER_A = "4917611111111";
const NUMMER_B = "4917622222222";
const TOK_A = "tok-dok-betrieb-a-000000001";
const TOK_B = "tok-dok-betrieb-b-000000001";
const TOK_TEST = "tok-dok-webtest-0000000001";
const TOK_VERSANDT = "tok-dok-versendet-00000001";
const EINST_A = "einst-token-betrieb-a-0001";
const EINST_W = "einst-token-webtest-000001";

let app: FastifyInstance;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any;
let cookieA = ""; // Geräte-Vertrauen für Betrieb A (echter Schleusen-Durchlauf)
let adminCookie = "";

async function dokument(hwId: string, bearbeitenToken: string, extra: Record<string, unknown> = {}) {
  return prisma.dokument.create({
    data: {
      handwerkerId: hwId,
      art: "ANGEBOT",
      nummer: `ANG-2026-${bearbeitenToken.slice(-4)}`,
      bearbeitenToken,
      kundenToken: `k-${bearbeitenToken}`,
      transkript: "",
      positionenJson: JSON.stringify([
        { kategorie: "LEISTUNG", beschreibung: "Wände streichen", menge: 10, einheit: "m2", einzelpreis: 12.5, vorschlag: false, preisquelle: "DIKTAT", mengeUnsicher: false },
      ]),
      einleitung: "",
      schlusstext: "",
      netto: 125,
      mwstSatz: 19,
      mwstBetrag: 23.75,
      brutto: 148.75,
      ...extra,
    },
  });
}

beforeAll(async () => {
  // Frische Wegwerf-Datenbank: Datei vorher löschen, dann legt db push sie
  // neu an — bewusst OHNE --force-reset (keine Reset-Flags nötig, wenn es
  // nichts zurückzusetzen gibt).
  for (const endung of ["", "-wal", "-shm"]) {
    rmSync(`${DB_DATEI}${endung}`, { force: true });
  }
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", {
    stdio: "pipe",
    env: process.env,
  });

  const pipeline = await import("../pipeline.js");
  prisma = pipeline.prisma;

  const { passwortHashErzeugen, adminAuthRoutes } = await import("./adminAuth.js");
  process.env.ADMIN_PASSWORT_HASH = passwortHashErzeugen("test-passwort");

  const { editorRoutes } = await import("./routes.js");
  const { betreiberRoutes } = await import("./betreiberRoutes.js");
  const { registrierungRoutes } = await import("./registrierungRoutes.js");
  const { whatsappRoutes } = await import("../whatsapp/webhook.js");
  const { WEBTEST_NUMMER } = await import("./webtest.js");

  // Mandanten: A und B (echt), W (das anonyme Webtest-Sammelkonto).
  const a = await prisma.handwerker.create({
    data: { whatsappNummer: NUMMER_A, name: "Anna A", firma: "Betrieb A", email: "a@test.de", einstellungenToken: EINST_A },
  });
  const b = await prisma.handwerker.create({
    data: { whatsappNummer: NUMMER_B, name: "Bernd B", firma: "Betrieb B", email: "b@test.de" },
  });
  const w = await prisma.handwerker.create({
    data: { whatsappNummer: WEBTEST_NUMMER, name: "Testbetrieb", firma: "Ihr Malerbetrieb", email: "", istTest: true, einstellungenToken: EINST_W },
  });

  await dokument(a.id, TOK_A);
  await dokument(b.id, TOK_B);
  await dokument(w.id, TOK_TEST);
  await dokument(a.id, TOK_VERSANDT, { versendetAm: new Date() });

  app = Fastify();
  await app.register(whatsappRoutes);
  await app.register(editorRoutes);
  await app.register(registrierungRoutes);
  await app.register(betreiberRoutes);
  await app.register(adminAuthRoutes);
  await app.ready();
}, 120_000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  for (const endung of ["", "-wal", "-shm"]) {
    rmSync(`${DB_DATEI}${endung}`, { force: true });
  }
});

describe("Zugangs-Schleuse am Editor", () => {
  it("ohne vertrautes Gerät: Seite zeigt die Schleuse, nie den Editor", async () => {
    const res = await app.inject({ method: "GET", url: `/${TOK_A}` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Zugang bestätigen");
    expect(res.body).not.toContain("const START");
  });

  it("ohne vertrautes Gerät sind ALLE schreibenden/lesenden API-Wege zu", async () => {
    const faelle = [
      { method: "PUT" as const, url: `/api/a/${TOK_A}`, payload: { kundeName: "X" } },
      { method: "PUT" as const, url: `/api/a/${TOK_A}/mail-einstellung`, payload: { email: "boese@evil.tld", aktiv: true } },
      { method: "POST" as const, url: `/api/a/${TOK_A}/mail.pdf` },
      { method: "POST" as const, url: `/api/a/${TOK_A}/mail-link` },
      { method: "POST" as const, url: `/api/a/${TOK_A}/preis-merken`, payload: { beschreibung: "x", einzelpreis: 1 } },
      { method: "POST" as const, url: `/api/a/${TOK_A}/versendet`, payload: { versendet: true } },
      { method: "POST" as const, url: `/api/a/${TOK_A}/loeschen` },
    ];
    for (const fall of faelle) {
      const res = await app.inject(fall);
      expect(res.statusCode, `${fall.method} ${fall.url}`).toBeGreaterThanOrEqual(401);
    }
    const exp = await app.inject({ method: "GET", url: `/api/a/${TOK_A}/export.pdf` });
    expect(exp.body).toContain("Zugang bestätigen"); // Schleusenseite statt PDF
  });

  it("falsche Nummer öffnet nicht, richtige Nummer öffnet (und setzt das Cookie)", async () => {
    const falsch = await app.inject({ method: "POST", url: `/a/${TOK_A}/zugang`, payload: { nummer: "017699999999" } });
    expect(falsch.statusCode).toBeGreaterThanOrEqual(401);

    const richtig = await app.inject({ method: "POST", url: `/a/${TOK_A}/zugang`, payload: { nummer: "017611111111" } });
    expect(richtig.statusCode).toBe(200);
    const cookie = richtig.headers["set-cookie"];
    expect(cookie).toBeTruthy();
    cookieA = String(Array.isArray(cookie) ? cookie[0] : cookie).split(";")[0]!;
  });

  it("MANDANTENTRENNUNG: das Vertrauens-Cookie von A öffnet KEIN Dokument von B", async () => {
    const seite = await app.inject({ method: "GET", url: `/${TOK_B}`, headers: { cookie: cookieA } });
    expect(seite.body).toContain("Zugang bestätigen");
    expect(seite.body).not.toContain("const START");

    const put = await app.inject({ method: "PUT", url: `/api/a/${TOK_B}`, headers: { cookie: cookieA }, payload: { kundeName: "Gekapert" } });
    expect(put.statusCode).toBeGreaterThanOrEqual(401);
  });

  it("mit Cookie A: Editor offen, valides Speichern 200, invalide Typen 400", async () => {
    const seite = await app.inject({ method: "GET", url: `/${TOK_A}`, headers: { cookie: cookieA } });
    expect(seite.body).toContain("const START");

    const ok = await app.inject({ method: "PUT", url: `/api/a/${TOK_A}`, headers: { cookie: cookieA }, payload: { kundeName: "Familie Mustermann" } });
    expect(ok.statusCode).toBe(200);

    const boese = await app.inject({
      method: "PUT", url: `/api/a/${TOK_A}`, headers: { cookie: cookieA },
      payload: { positionen: [{ kategorie: "LEISTUNG", beschreibung: "x", menge: "<img src=x>", einheit: null, einzelpreis: null }] },
    });
    expect(boese.statusCode).toBe(400);
  });

  it("versendetes Dokument bleibt auch MIT Cookie schreibgeschützt (409)", async () => {
    const res = await app.inject({ method: "PUT", url: `/api/a/${TOK_VERSANDT}`, headers: { cookie: cookieA }, payload: { kundeName: "X" } });
    expect(res.statusCode).toBe(409);
  });

  it("Test-Dokumente: Editor ohne Schleuse, aber Export und Mail-Versand gesperrt", async () => {
    const seite = await app.inject({ method: "GET", url: `/${TOK_TEST}` });
    expect(seite.body).toContain("const START");

    const mail = await app.inject({ method: "POST", url: `/api/a/${TOK_TEST}/mail.pdf` });
    expect(mail.statusCode).toBe(403);
    const mailEinst = await app.inject({ method: "PUT", url: `/api/a/${TOK_TEST}/mail-einstellung`, payload: { email: "boese@evil.tld" } });
    expect(mailEinst.statusCode).toBe(403);
  });
});

describe("Betreiber-Cockpit", () => {
  it("ohne Sitzung: Seiten leiten zum Login, JSON-Aktionen sind 404", async () => {
    const liste = await app.inject({ method: "GET", url: "/stasi/betriebe" });
    expect(liste.statusCode).toBe(302);

    const aktion = await app.inject({ method: "POST", url: "/stasi/betrieb/irgendwas/kontakt", payload: { nummer: "123456" } });
    expect(aktion.statusCode).toBe(404);
  });

  it("der alte /admin/<TOKEN>-Weg existiert nicht mehr", async () => {
    for (const url of ["/admin/super-geheimes-token/betriebe", "/admin/super-geheimes-token"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode, url).toBe(404);
    }
  });

  it("falsches Passwort scheitert, richtiges öffnet Kundenliste und Auswertung", async () => {
    const falsch = await app.inject({ method: "POST", url: "/stasi/login", payload: { email: "admin@test.de", passwort: "falsch" } });
    expect(falsch.statusCode).toBeGreaterThanOrEqual(400);

    const richtig = await app.inject({ method: "POST", url: "/stasi/login", payload: { email: "admin@test.de", passwort: "test-passwort" } });
    const cookie = richtig.headers["set-cookie"];
    expect(cookie).toBeTruthy();
    adminCookie = String(Array.isArray(cookie) ? cookie[0] : cookie).split(";")[0]!;

    const liste = await app.inject({ method: "GET", url: "/stasi/betriebe", headers: { cookie: adminCookie } });
    expect(liste.statusCode).toBe(200);
    expect(liste.body).toContain("Betrieb A");

    const auswertung = await app.inject({ method: "GET", url: "/stasi/auswertung", headers: { cookie: adminCookie } });
    expect(auswertung.statusCode).toBe(200);
  });
});

describe("Webtest-Sammelkonto ist abgeschottet", () => {
  it("kein Cockpit, keine Einstellungen, keine Registrierung — auch mit gültigem Token", async () => {
    for (const url of [`/start/${EINST_W}`, `/einstellungen/${EINST_W}`]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode, url).toBe(404);
    }
    const reg = await app.inject({ method: "POST", url: `/api/registrieren/${EINST_W}`, payload: { firma: "Kaperfirma", name: "Kap Kaper", email: "kap@evil.tld" } });
    expect(reg.statusCode).toBe(404);
  });

  it("ein echter Betrieb erreicht sein Cockpit weiterhin", async () => {
    const res = await app.inject({ method: "GET", url: `/start/${EINST_A}` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Betrieb A");
  });
});

describe("WhatsApp-Webhook", () => {
  const payload = JSON.stringify({ entry: [] });

  it("FAIL CLOSED: ohne konfiguriertes App-Secret wird alles abgelehnt", async () => {
    delete process.env.WHATSAPP_APP_SECRET;
    const res = await app.inject({ method: "POST", url: "/webhook/whatsapp", payload, headers: { "content-type": "application/json" } });
    expect(res.statusCode).toBe(401);
  });

  it("falsche Signatur 401, korrekte Signatur 200", async () => {
    process.env.WHATSAPP_APP_SECRET = "test-app-secret";
    try {
      const falsch = await app.inject({
        method: "POST", url: "/webhook/whatsapp", payload,
        headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=deadbeef" },
      });
      expect(falsch.statusCode).toBe(401);

      const sig = "sha256=" + createHmac("sha256", "test-app-secret").update(payload).digest("hex");
      const richtig = await app.inject({
        method: "POST", url: "/webhook/whatsapp", payload,
        headers: { "content-type": "application/json", "x-hub-signature-256": sig },
      });
      expect(richtig.statusCode).toBe(200);
    } finally {
      delete process.env.WHATSAPP_APP_SECRET;
    }
  });
});
