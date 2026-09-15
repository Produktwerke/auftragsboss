// Abo-Buchung für den Betrieb:
//
//   GET /abo/buchen/:token?tarif=basis|profi|team → leitet zum Stripe-Checkout
//   GET /abo/danke?start=<token>                  → Danke-Seite nach der Zahlung
//
// :token ist der einstellungenToken (dieselbe vertraute Tür wie Cockpit und
// Einstellungen). Ohne Stripe-Zugangsdaten in der .env: 404 (fail closed).
// Test-Konten werden zur Registrierung geschickt — erst Betrieb, dann Abo.
import type { FastifyInstance } from "fastify";
import { prisma } from "../pipeline.js";
import { stripeKonfiguriert } from "../config.js";
import {
  erzeugeAboCheckoutUrl,
  erzeugePortalUrl,
  ladeAboLaufzeit,
  ladeRechnungen,
  ladeStripeGuthaben,
  type BuchbarerTarif,
  type RechnungsZeile,
} from "../betrieb/stripeCheckout.js";
import { aboLink, cockpitLink, registrierLink, werbeLink } from "./tokens.js";
import { werbeCodeBereit } from "../empfehlung.js";
import { aboSeite } from "./aboSeite.js";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Schlichte, selbsttragende Hinweisseite im AuftragsBoss-Ton. */
function seite(titel: string, text: string, knopf?: { href: string; label: string }): string {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(titel)} · AuftragsBoss</title>
<style>
  body{margin:0;font-family:-apple-system,"Segoe UI",Roboto,sans-serif;background:#181a1e;color:#f0f1f3;
       display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;box-sizing:border-box;}
  .karte{background:#22252b;border:1px solid #32363e;border-radius:14px;max-width:480px;width:100%;
         padding:34px 30px;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.4);}
  .logo{font-weight:800;letter-spacing:.02em;color:#ffd166;font-size:15px;margin-bottom:18px;}
  h1{font-size:22px;margin:0 0 12px;}
  p{color:#aab0ba;line-height:1.6;margin:0 0 22px;font-size:15px;}
  a.btn{display:inline-block;background:#ffd166;color:#1a1a1a;font-weight:800;text-decoration:none;
        padding:12px 22px;border-radius:10px;font-size:15px;}
</style></head><body>
<div class="karte">
  <div class="logo">AUFTRAGSBOSS</div>
  <h1>${escapeHtml(titel)}</h1>
  <p>${text}</p>
  ${knopf ? `<a class="btn" href="${escapeHtml(knopf.href)}">${escapeHtml(knopf.label)}</a>` : ""}
</div>
</body></html>`;
}

export async function aboRoutes(app: FastifyInstance): Promise<void> {
  // Seite "Abo & Abrechnung" in der App-Shell (Tarif-Stand + Empfehlungs-Panel).
  // Statische Geschwister /abo/danke und /abo/buchen/:token haben Vorrang.
  app.get<{ Params: { token: string } }>("/abo/:token", async (req, reply) => {
    const handwerker = await prisma.handwerker.findUnique({
      where: { einstellungenToken: req.params.token },
    });
    if (!handwerker) return reply.code(404).type("text/html").send(
      seite("Link ungültig", "Dieser Link gehört zu keinem Betrieb. Öffne dein Cockpit über den Link aus WhatsApp."),
    );
    const abo = await prisma.abo.findUnique({ where: { handwerkerId: handwerker.id } });
    const werbeUrl = werbeLink(await werbeCodeBereit(prisma, handwerker));

    // Rechnungshistorie aus Stripe (nur wenn der Betrieb dort Kunde ist).
    // Fehler sind nicht fatal — die Seite zeigt dann einfach keine Liste.
    let rechnungen: RechnungsZeile[] = [];
    let gekuendigtZum: Date | null = null;
    // Offenes Guthaben (Empfehlungsprämie): Stripe-Kunde → Stripe-Saldo, sonst Konto-Guthaben.
    let guthabenEuro = handwerker.guthabenEuro;
    if (abo?.stripeCustomerId && stripeKonfiguriert()) {
      try {
        guthabenEuro += await ladeStripeGuthaben(abo.stripeCustomerId);
      } catch (err) {
        req.log.warn({ err }, "Stripe-Guthaben konnte nicht geladen werden");
      }
      try {
        rechnungen = await ladeRechnungen(abo.stripeCustomerId);
      } catch (err) {
        req.log.warn({ err }, "Stripe-Rechnungen konnten nicht geladen werden");
      }
      // Vorgemerkte Kündigung (Kundenportal) sichtbar machen; Fehler nicht fatal.
      if (abo.stripeSubscriptionId && abo.status === "AKTIV") {
        try {
          gekuendigtZum = (await ladeAboLaufzeit(abo.stripeSubscriptionId)).gekuendigtZum;
        } catch (err) {
          req.log.warn({ err }, "Stripe-Abo-Laufzeit konnte nicht geladen werden");
        }
      }
    }

    return reply.type("text/html; charset=utf-8").send(
      aboSeite({
        handwerker,
        token: req.params.token,
        werbeUrl,
        abo: abo ? { tarif: abo.tarif, monatspreis: abo.monatspreis, status: abo.status } : null,
        aboBuchbar: stripeKonfiguriert() && !handwerker.istTest,
        rechnungen,
        hatStripeKunde: Boolean(abo?.stripeCustomerId),
        portalVerfuegbar: Boolean(abo?.stripeCustomerId) && stripeKonfiguriert(),
        gekuendigtZum,
        guthabenEuro,
        zahlungOffen: abo?.zahlungOffenSeit ? { seit: abo.zahlungOffenSeit, rechnungUrl: abo.zahlungOffeneRechnung } : null,
      }),
    );
  });

  // Kundenportal (Stripe Etappe 3): Zahlungsart, Rechnungsadresse, Rechnungen,
  // Kündigung. Kurzlebige Stripe-Sitzung, zurück geht es auf "Abo & Abrechnung".
  app.get<{ Params: { token: string } }>("/abo/verwalten/:token", async (req, reply) => {
    if (!stripeKonfiguriert()) return reply.code(404).type("text/html").send(
      seite("Noch nicht verfügbar", "Die Abo-Verwaltung ist gerade nicht eingerichtet. Melde dich einfach kurz per WhatsApp, wir kümmern uns."),
    );
    const handwerker = await prisma.handwerker.findUnique({ where: { einstellungenToken: req.params.token } });
    if (!handwerker) return reply.code(404).type("text/html").send(
      seite("Link ungültig", "Dieser Link gehört zu keinem Betrieb. Öffne dein Cockpit über den Link aus WhatsApp."),
    );
    const abo = await prisma.abo.findUnique({ where: { handwerkerId: handwerker.id } });
    if (!abo?.stripeCustomerId) {
      return reply.code(404).type("text/html").send(
        seite("Kein Online-Abo", "Für diesen Betrieb gibt es noch kein online gebuchtes Abo, das sich hier verwalten ließe.",
          { href: aboLink(req.params.token), label: "Zu Abo & Abrechnung" }),
      );
    }
    try {
      const url = await erzeugePortalUrl(abo.stripeCustomerId, aboLink(req.params.token));
      return reply.redirect(url);
    } catch (err) {
      req.log.error({ err }, "Stripe-Kundenportal konnte nicht geöffnet werden");
      return reply.code(502).type("text/html").send(
        seite("Das hat nicht geklappt", "Die Abo-Verwaltung ist gerade nicht erreichbar. Bitte versuch es in ein paar Minuten noch einmal.",
          { href: aboLink(req.params.token), label: "Zurück" }),
      );
    }
  });

  app.get<{ Params: { token: string }; Querystring: { tarif?: string } }>(
    "/abo/buchen/:token",
    async (req, reply) => {
      if (!stripeKonfiguriert()) return reply.code(404).type("text/html").send(
        seite("Buchung noch nicht verfügbar", "Die Online-Buchung ist gerade nicht eingerichtet. Melde dich einfach kurz per WhatsApp, wir kümmern uns."),
      );
      const handwerker = await prisma.handwerker.findUnique({
        where: { einstellungenToken: req.params.token },
      });
      if (!handwerker) return reply.code(404).type("text/html").send(
        seite("Link ungültig", "Dieser Buchungs-Link gehört zu keinem Betrieb. Öffne dein Cockpit über den Link aus WhatsApp und versuch es von dort."),
      );
      if (handwerker.istTest) {
        return reply.type("text/html").send(
          seite(
            "Erst kurz anmelden",
            "Du nutzt gerade das kostenlose Test-Konto. Registriere deinen Betrieb (dauert eine Minute), danach kannst du das Abo buchen.",
            { href: registrierLink(req.params.token), label: "Jetzt Betrieb registrieren" },
          ),
        );
      }

      const wahl = (req.query.tarif ?? "").toLowerCase();
      const tarif: BuchbarerTarif | null =
        wahl === "basis" ? "BASIS" : wahl === "profi" ? "PROFI" : wahl === "team" ? "TEAM" : null;
      if (!tarif) return reply.code(400).type("text/html").send(
        seite("Tarif fehlt", "Bitte wähle den Tarif im Cockpit aus — dort gibt es für jeden Tarif einen eigenen Buchen-Knopf.",
          { href: cockpitLink(req.params.token), label: "Zum Cockpit" }),
      );

      try {
        const url = await erzeugeAboCheckoutUrl(handwerker, tarif, req.params.token);
        return reply.redirect(url);
      } catch (err) {
        req.log.error({ err }, "Stripe-Checkout konnte nicht erzeugt werden");
        return reply.code(502).type("text/html").send(
          seite("Das hat nicht geklappt", "Die Weiterleitung zur Bezahlseite ist gerade fehlgeschlagen. Bitte versuch es in ein paar Minuten noch einmal.",
            { href: cockpitLink(req.params.token), label: "Zurück zum Cockpit" }),
        );
      }
    },
  );

  app.get<{ Querystring: { start?: string } }>("/abo/danke", async (req, reply) => {
    const token = (req.query.start ?? "").trim();
    return reply.type("text/html").send(
      seite(
        "Danke, dein Abo ist unterwegs! 🎉",
        "Die Zahlung ist bei uns angekommen und dein Abo wird in diesem Moment freigeschaltet. Du kannst AuftragsBoss einfach weiter über WhatsApp nutzen, an deinem Ablauf ändert sich nichts.",
        token ? { href: cockpitLink(token), label: "Zurück zum Cockpit" } : undefined,
      ),
    );
  });
}
