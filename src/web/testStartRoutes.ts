// Test starten von der Landingpage aus (15.09.2026, Dirk: „Was macht jemand am PC?").
//
// Auf auftragsboss.de klickt ein Besucher auf „14 Tage gratis testen". Am Handy
// öffnet sich WhatsApp direkt. Am PC bekommt er ein kleines Fenster: QR-Code
// fürs Handy ODER Vorname + Handynummer eintragen. Dann schreibt AuftragsBoss
// ihn selbst per WhatsApp an (genehmigte Meta-Vorlage `test_starten` mit den
// Knöpfen „Ja, los geht's" / „Kurz erklären", gleicher Weg wie die Telefon-Leads).
//
// Das Formular auf der Landingpage postet klassisch hierher (kein JSON, kein
// CORS): AuftragsBoss antwortet mit einer kleinen Seite „Schau auf dein Handy".
// Opt-in ist dokumentiert: die Nummer hat der Besucher selbst eingetragen
// (optInQuelle "website:<tarif>"). Ist die Vorlage bei Meta noch nicht genehmigt,
// bleibt der Lead angelegt und die Seite zeigt den WhatsApp-Weg als Ausweg.
import type { FastifyInstance } from "fastify";
import { prisma } from "../pipeline.js";
import { direkttestConfig, normalisiereHandy, smtpKonfiguriert } from "../config.js";
import { nummerAusFreigegebenemLand } from "../direkttest.js";
import { legeLeadAnUndLadeEin, testVorlagenName } from "../lead/onboarding.js";
import { spurEvent } from "../analytics/event.js";
import { sendeMail } from "../email/send.js";

export const LANDINGPAGE = "https://auftragsboss.de";
export const WHATSAPP_NUMMER_ANZEIGE = "+49 174 9364823";
export const WHATSAPP_LINK = "https://wa.me/491749364823?text=" + encodeURIComponent("Hallo AuftragsBoss, ich möchte 14 Tage kostenlos testen.");

const TARIFE = new Set(["basis", "profi", "team"]);

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Kleine, selbsttragende Antwortseite im Landingpage-Look. */
function seite(titel: string, text: string, knopf?: { href: string; label: string }, zusatz = ""): string {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(titel)} · AuftragsBoss</title>
<style>
  body{margin:0;font-family:-apple-system,"Segoe UI",Roboto,sans-serif;background:#181a1e;color:#f0f1f3;
       display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;box-sizing:border-box;}
  .karte{background:#22252b;border:1px solid #32363e;border-radius:14px;max-width:520px;width:100%;
         padding:34px 30px;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.4);}
  .logo{font-weight:800;letter-spacing:.02em;color:#ffd166;font-size:15px;margin-bottom:18px;}
  h1{font-size:22px;margin:0 0 12px;}
  p{color:#aab0ba;line-height:1.6;margin:0 0 18px;font-size:15px;}
  a.btn{display:inline-block;background:#25D366;color:#0b1a10;font-weight:800;text-decoration:none;
        padding:12px 22px;border-radius:10px;font-size:15px;}
  a.leise{color:#aab0ba;font-size:13px;}
  .nr{font-weight:700;color:#f0f1f3;}
</style></head><body>
<div class="karte">
  <div class="logo">AUFTRAGSBOSS</div>
  <h1>${escapeHtml(titel)}</h1>
  <p>${text}</p>
  ${knopf ? `<p><a class="btn" href="${escapeHtml(knopf.href)}">${escapeHtml(knopf.label)}</a></p>` : ""}
  ${zusatz}
  <p style="margin-top:22px;"><a class="leise" href="${LANDINGPAGE}">Zurück zu auftragsboss.de</a></p>
</div>
</body></html>`;
}

const WHATSAPP_AUSWEG = `<p>Oder schreib uns direkt per WhatsApp an <span class="nr">${WHATSAPP_NUMMER_ANZEIGE}</span>.</p>`;

/** Sauberer Tarifwunsch aus dem Formular (basis/profi/team) oder null. */
export function tarifAusFormular(wert: unknown): string | null {
  const t = String(wert ?? "").trim().toLowerCase();
  return TARIFE.has(t) ? t : null;
}

export async function testStartRoutes(app: FastifyInstance): Promise<void> {
  // Klassisches HTML-Formular (application/x-www-form-urlencoded) lesen.
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    try {
      done(null, Object.fromEntries(new URLSearchParams(String(body))));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Jemand öffnet die Adresse direkt: zurück zu den Preisen.
  app.get("/test-starten", async (_req, reply) => reply.redirect(`${LANDINGPAGE}/#preise`));

  app.post<{ Body: { name?: string; nummer?: string; tarif?: string; firma2?: string } }>(
    "/test-starten",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const body = req.body ?? {};
      // Honigtopf: das Feld sieht nur ein Bot.
      if ((body.firma2 ?? "").trim()) return reply.redirect(`${LANDINGPAGE}/`);

      const name = (body.name ?? "").trim().slice(0, 60);
      const nummer = normalisiereHandy(body.nummer);
      const tarif = tarifAusFormular(body.tarif);
      const html = (h: string) => reply.type("text/html; charset=utf-8").send(h);

      if (name.length < 2 || !nummer) {
        return html(seite(
          "Da fehlt noch etwas",
          "Bitte Vorname und eine gültige Handynummer angeben, zum Beispiel 0176 1234567.",
          { href: `${LANDINGPAGE}/#preise`, label: "Noch einmal versuchen" },
        ));
      }
      if (!nummerAusFreigegebenemLand(nummer, direkttestConfig().DIREKTTEST_LAENDER)) {
        return html(seite(
          "Nur für Betriebe in Deutschland",
          "AuftragsBoss ist aktuell nur für Handwerksbetriebe in Deutschland verfügbar. AuftragsBoss is currently available for businesses in Germany only.",
        ));
      }

      // Nummer schon bekannt (Test läuft oder Betrieb registriert): einfach weiter per WhatsApp.
      const bekannt = await prisma.handwerker.findUnique({ where: { whatsappNummer: nummer } });
      if (bekannt) {
        return html(seite(
          "Du bist schon dabei",
          "Diese Nummer kennt AuftragsBoss bereits. Schick einfach deine nächste Sprachnachricht per WhatsApp, dann geht es sofort weiter.",
          { href: WHATSAPP_LINK, label: "WhatsApp öffnen" },
          `<p>Nummer: <span class="nr">${WHATSAPP_NUMMER_ANZEIGE}</span></p>`,
        ));
      }

      const ergebnis = await legeLeadAnUndLadeEin(prisma, {
        nummer,
        anrede: name,
        optInQuelle: `website:${tarif ?? "ohne-tarif"}`,
        leadQuelle: "WEBSITE",
        vorlage: testVorlagenName(),
      });

      // Betreiber informieren (E-Mail, ohne Kundendaten in Logs)
      if ("handwerker" in ergebnis || "fehler" in ergebnis) {
        void spurEvent(prisma, "TEST_ANGEFORDERT", { data: { quelle: "website", tarif: tarif ?? null } });
        const adminMail = process.env.ADMIN_EMAIL?.trim();
        if (adminMail && smtpKonfiguriert()) {
          sendeMail(
            adminMail,
            `Neuer Test-Interessent von der Website${tarif ? ` (Tarif ${tarif})` : ""}`,
            `<p><b>${escapeHtml(name)}</b>, ${escapeHtml(nummer)}${tarif ? `, Tarifwunsch ${escapeHtml(tarif)}` : ""}.</p>` +
              (`fehler` in ergebnis ? `<p style="color:#b7791f;">WhatsApp-Einladung NICHT gesendet: ${escapeHtml(ergebnis.fehler)}</p>` : `<p>WhatsApp-Einladung gesendet.</p>`),
          ).catch((err) => console.warn("Betreiber-Mail Test-Interessent fehlgeschlagen:", err instanceof Error ? err.message : err));
        }
      }

      if ("fehler" in ergebnis) {
        // Nummer ungültig oder Vorlage (noch) nicht genehmigt: Lead ist notiert, der
        // Interessent bekommt den direkten Weg.
        req.log.warn({ fehler: ergebnis.fehler }, "Test-Start von der Website: Einladung nicht gesendet");
        return html(seite(
          "Fast geschafft",
          "Wir konnten dich gerade nicht automatisch anschreiben. Schick uns einfach selbst eine WhatsApp, dann startet dein Test sofort.",
          { href: WHATSAPP_LINK, label: "WhatsApp öffnen" },
          `<p>Nummer: <span class="nr">${WHATSAPP_NUMMER_ANZEIGE}</span></p>`,
        ));
      }

      return html(seite(
        "📲 Schau auf dein Handy",
        `AuftragsBoss hat dir gerade eine WhatsApp an <span class="nr">${escapeHtml(nummer.replace(/^49/, "+49 "))}</span> geschickt. Tipp dort auf <b>„Ja, los geht's"</b> und sprich deinen ersten Auftrag ein. Dein Test läuft ${direkttestConfig().DIREKTTEST_TAGE} Tage kostenlos.`,
        undefined,
        WHATSAPP_AUSWEG,
      ));
    },
  );
}
