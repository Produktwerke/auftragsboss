// Selbst-Registrierung: Ein WhatsApp-verifiziertes Test-Konto wird zum echten
// Betrieb. Hinter dem Feature-Flag FEATURE_SELBSTREGISTRIERUNG.
//
//   GET  /registrieren/:token        → Anmelde-Formular (Stammdaten)
//   POST /api/registrieren/:token    → Test-Konto zum echten Betrieb aufwerten
//
// Der Token ist der einstellungenToken des (Test-)Betriebs — den bekommt der
// Interessent per WhatsApp, nachdem er "anmelden" geschrieben hat. Weil er uns
// von SEINER Nummer geschrieben hat, ist die Nummer verifiziert (keine Kaperung).
import type { FastifyInstance } from "fastify";
import { prisma } from "../pipeline.js";
import { featureConfig, smtpKonfiguriert } from "../config.js";
import { registrierungSeite } from "./registrierungSeite.js";
import { einstellungenTokenBereit } from "../betrieb/betriebsdaten.js";
import { cockpitLink } from "./tokens.js";
import { sendeMail } from "../email/send.js";
import { sendeWhatsAppText } from "../whatsapp/send.js";

const TEAM_MAIL = process.env.TEAM_MAIL?.trim() || "kontakt@auftragsboss.de";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Hübsche Handynummer fürs Anzeigen: 491749364823 → +49 174 9364823 */
function nummerHuebsch(n: string): string {
  const d = (n ?? "").replace(/\D/g, "");
  if (d.startsWith("49") && d.length > 4) return `+49 ${d.slice(2, 5)} ${d.slice(5)}`;
  return n;
}

function miniSeite(titel: string, text: string, linkUrl?: string, linkText?: string): string {
  const knopf = linkUrl
    ? `<a href="${linkUrl}" style="display:inline-block;margin-top:18px;padding:13px 20px;background:#ffd21e;color:#12151a;font-weight:700;border-radius:11px;text-decoration:none">${linkText ?? "Weiter"}</a>`
    : "";
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${titel} · AuftragsBoss</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
background:#15181e;color:#eef1f5;font-family:-apple-system,"Segoe UI",Roboto,sans-serif}
.k{max-width:460px;background:#1e232b;border:1px solid #2b323d;border-radius:18px;padding:32px 30px;text-align:center}
h1{font-size:21px;margin:0 0 10px}p{color:#9aa4b2;line-height:1.55;margin:0}
.m{font-weight:800;letter-spacing:.5px;margin-bottom:18px}.m span{color:#ffd21e}</style></head>
<body><div class="k"><div class="m">AUFTRAGS<span>BOSS</span></div><h1>${titel}</h1><p>${text}</p>${knopf}</div></body></html>`;
}

export async function registrierungRoutes(app: FastifyInstance): Promise<void> {
  // ── Anmelde-Formular ──────────────────────────────────
  app.get<{ Params: { token: string } }>("/registrieren/:token", async (req, reply) => {
    if (!featureConfig().FEATURE_SELBSTREGISTRIERUNG) {
      return reply.code(404).type("text/html; charset=utf-8").send(miniSeite("Nicht verfügbar", "Die Selbst-Anmeldung ist derzeit nicht aktiv."));
    }
    const handwerker = await prisma.handwerker.findUnique({
      where: { einstellungenToken: req.params.token },
    });
    if (!handwerker) {
      return reply.code(404).type("text/html; charset=utf-8").send(miniSeite("Link ungültig", "Dieser Anmelde-Link ist ungültig oder abgelaufen. Schreib uns per WhatsApp einfach noch einmal „anmelden“."));
    }
    // Schon ein echter Betrieb? Dann zum Cockpit schicken statt neu anmelden.
    if (!handwerker.istTest) {
      return reply.type("text/html; charset=utf-8").send(
        miniSeite(
          "Schon angemeldet",
          `Dein Betrieb <b>${handwerker.firma || ""}</b> ist bereits angemeldet. Hier geht es zu deinen Einstellungen und Angeboten.`,
          cockpitLink(req.params.token),
          "Zu meinem Cockpit",
        ),
      );
    }
    return reply.type("text/html; charset=utf-8").send(
      registrierungSeite({
        token: req.params.token,
        firma: handwerker.firma,
        name: handwerker.name,
        email: handwerker.email,
        nummer: nummerHuebsch(handwerker.whatsappNummer),
      }),
    );
  });

  // ── Anmeldung absenden: Test-Konto → echter Betrieb ──
  app.post<{ Params: { token: string }; Body: { firma?: string; name?: string; email?: string } }>(
    "/api/registrieren/:token",
    async (req, reply) => {
      if (!featureConfig().FEATURE_SELBSTREGISTRIERUNG) {
        return reply.code(404).send({ fehler: "Selbst-Anmeldung ist nicht aktiv." });
      }
      const handwerker = await prisma.handwerker.findUnique({
        where: { einstellungenToken: req.params.token },
      });
      if (!handwerker) return reply.code(404).send({ fehler: "Anmelde-Link ungültig." });
      if (!handwerker.istTest) {
        // Schon echt — idempotent: einfach Erfolg + Cockpit-Link zurückgeben.
        return reply.send({ ok: true, cockpitUrl: cockpitLink(req.params.token) });
      }

      const firma = (req.body?.firma ?? "").trim();
      const name = (req.body?.name ?? "").trim();
      const email = (req.body?.email ?? "").trim();
      if (firma.length < 2 || name.length < 2 || !EMAIL_RE.test(email)) {
        return reply.code(400).send({ fehler: "Bitte Firma, Ansprechpartner und eine gültige E-Mail angeben." });
      }

      // Aufwerten: Test-Konto wird echter Betrieb. Nummer + Verlauf bleiben.
      await prisma.handwerker.update({
        where: { id: handwerker.id },
        data: { firma, name, email, istTest: false, gewerkTyp: "MALER" },
      });

      const cockpitUrl = cockpitLink(req.params.token);

      // Bestätigung per E-Mail (verlässlicher Kanal). Fehler nicht hart werfen —
      // die Anmeldung ist bereits gespeichert.
      if (smtpKonfiguriert()) {
        try {
          await sendeMail(
            email,
            "Willkommen bei AuftragsBoss, dein Betrieb ist angemeldet",
            willkommensMail(name, firma, cockpitUrl),
          );
        } catch (err) {
          req.log.error({ err }, "Willkommens-Mail (Selbstregistrierung) fehlgeschlagen");
        }
        // Team-Benachrichtigung (nur intern, best effort).
        try {
          await sendeMail(
            TEAM_MAIL,
            `Neue Selbst-Anmeldung: ${firma}`,
            `<p>Neuer Betrieb hat sich selbst angemeldet:</p><ul>` +
              `<li>Firma: ${firma}</li><li>Ansprechpartner: ${name}</li>` +
              `<li>E-Mail: ${email}</li><li>WhatsApp: ${handwerker.whatsappNummer}</li></ul>`,
          );
        } catch (err) {
          req.log.error({ err }, "Team-Benachrichtigung (Selbstregistrierung) fehlgeschlagen");
        }
      }

      // Best-effort WhatsApp-Bestätigung (klappt im 24-h-Fenster; sonst egal).
      try {
        await sendeWhatsAppText(
          handwerker.whatsappNummer,
          `🎉 Willkommen bei AuftragsBoss, ${name.split(" ")[0] || ""}!\n\n` +
            `Dein Betrieb *${firma}* ist angemeldet. Richte hier einmal Logo & Adresse ein:\n${cockpitUrl}\n\n` +
            `Danach einfach eine Sprachnachricht mit den Auftragsdetails schicken. Ich mache ein fertiges Angebot daraus. 🎙️`,
        );
      } catch (err) {
        req.log.error({ err }, "WhatsApp-Bestätigung (Selbstregistrierung) fehlgeschlagen");
      }

      return reply.send({ ok: true, cockpitUrl });
    },
  );
}

function willkommensMail(name: string, firma: string, cockpitUrl: string): string {
  const vorname = name.split(" ")[0] || "";
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1a1d22">
    <h2 style="margin:0 0 8px">Willkommen an Bord, ${vorname}! 🎉</h2>
    <p>Dein Betrieb <b>${firma}</b> ist jetzt bei AuftragsBoss angemeldet.</p>
    <p>Richte einmal dein Logo, deine Adresse und deine Standardtexte ein, dann stehen sie
       automatisch auf jedem Angebot:</p>
    <p><a href="${cockpitUrl}" style="display:inline-block;padding:12px 20px;background:#ffd21e;color:#12151a;font-weight:700;border-radius:10px;text-decoration:none">Zu meinen Einstellungen</a></p>
    <p style="color:#666;font-size:13px">Danach diktierst du einfach per WhatsApp, kein Login, kein Passwort.
       Bewahre diese E-Mail auf: der Link ist dein persönlicher Zugang.</p>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
    <p style="color:#999;font-size:12px">AuftragsBoss ist eine Marke der DAG Deutsche Automotive GmbH.
       KI-gestützter Dienst zur Angebotserstellung.</p>
  </div>`;
}
