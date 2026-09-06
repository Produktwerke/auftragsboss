// Betreiber-Cockpit (Stufe 1) — Routen.
//
//   GET  /stasi/betriebe            → Kundenliste (Filter: ?filter=…)
//   GET  /stasi/betrieb/:id         → Kundendetail
//   POST /stasi/betrieb/:id/kontakt     { nummer, email }
//   POST /stasi/betrieb/:id/blockieren  { grund }
//   POST /stasi/betrieb/:id/entsperren  {}
//   POST /stasi/betrieb/:id/gutschrift  { monate, grund }
//   POST /stasi/betrieb/:id/loeschen    { bestaetigung }  ← Firmenname
//
// Schutz: /stasi-Login-Cookie (adminAuth.ts), sonst 404. Jede schreibende
// Aktion landet im AdminLog (Nachvollziehbarkeit).
import { loescheFotosVonBetrieb } from "../betrieb/fotoAblage.js";
import type { FastifyInstance } from "fastify";
import { unlink } from "node:fs/promises";
import { prisma } from "../pipeline.js";
import {
  betreiberListe,
  betreiberDetail,
  betreiberUmsatz,
  istInaktiv,
  type BetriebZeile,
  type BetriebsFilter,
} from "./betreiberSeite.js";
import {
  TARIF_PRESETS,
  istTarif,
  istZeitraum,
  monatsZeitraum,
  mrr,
  einnahmenImZeitraum,
  gesamtUmsatz,
  umsatzJeKunde,
  monatsverlauf,
} from "../betrieb/abrechnung.js";
import { summiereKostenCent } from "../analytics/kikosten.js";
import { direkttestConfig } from "../config.js";
import { einstellungenTokenBereit } from "../betrieb/betriebsdaten.js";
import { cockpitLink, einstellungenLink } from "./tokens.js";
import { hatAdminSitzung } from "./adminAuth.js";
import { legeLeadAnUndLadeEin } from "../lead/onboarding.js";
import { WEBTEST_NUMMER } from "./webtest.js";
import type { FastifyRequest } from "fastify";

// Der alte Notfall-Zugang /admin/<ADMIN_TOKEN>/… ist ABGESCHALTET (Audit
// AB-H06: nicht timing-sicher, ungedrosselt, Token stand in URLs und Logs).
// Zugang nur noch über den /stasi-Login mit E-Mail + Passwort. Der Helfer
// bleibt als Liste, damit die Routen-Registrierung unverändert lesbar ist.
const beide = (rest: string): string[] => [`/stasi${rest}`];

/** Zugangsprüfung + Link-Basis für die gerenderte Seite. */
function zugang(req: FastifyRequest): { ok: boolean; basis: string } {
  return { ok: hatAdminSitzung(req), basis: "/stasi" };
}

function nichtGefunden(): string {
  return `<!doctype html><meta charset="utf-8"><title>Nicht gefunden</title>
    <body style="font-family:sans-serif;text-align:center;padding:60px;color:#555;">
    <h1 style="color:#0b5cad;">AuftragsBoss</h1>
    <p>Dieser Link ist ungültig oder abgelaufen.</p></body>`;
}

/** Ein AdminLog-Eintrag; Firma wird mitgeschrieben, damit er auch nach dem Löschen lesbar bleibt. */
async function protokolliere(handwerkerId: string | null, betrieb: string | null, aktion: string, detail: string): Promise<void> {
  await prisma.adminLog.create({ data: { aktion, handwerkerId, betrieb, detail } });
}

export async function betreiberRoutes(app: FastifyInstance): Promise<void> {
  // ── Kundenliste ───────────────────────────────────────
  for (const pfad of beide("/betriebe")) app.get<{ Params: { token?: string }; Querystring: { filter?: string } }>(
    pfad,
    async (req, reply) => {
      const z = zugang(req);
      if (!z.ok) return z.basis === "/stasi" ? reply.redirect("/stasi") : reply.code(404).type("text/html").send(nichtGefunden());
      const basis = z.basis;

      const betriebe = await prisma.handwerker.findMany({ orderBy: { erstelltAm: "desc" } });

      // Nutzung + Abrechnung in Sammelabfragen (statt N+1)
      const [anzahlen, letzte, abos, buchungen] = await Promise.all([
        prisma.dokument.groupBy({ by: ["handwerkerId"], where: { art: "ANGEBOT" }, _count: { _all: true } }),
        prisma.dokument.groupBy({ by: ["handwerkerId"], _max: { erstelltAm: true } }),
        prisma.abo.findMany(),
        prisma.buchung.findMany({ select: { handwerkerId: true, betrag: true, zeitraum: true } }),
      ]);
      const anzahlMap = new Map(anzahlen.map((a) => [a.handwerkerId, a._count._all]));
      const letzteMap = new Map(letzte.map((l) => [l.handwerkerId, l._max.erstelltAm]));
      const aboMap = new Map(abos.map((a) => [a.handwerkerId, a]));
      const umsatzMap = umsatzJeKunde(buchungen);

      const zeilen: BetriebZeile[] = betriebe.map((h) => ({
        id: h.id,
        firma: h.firma,
        name: h.name,
        whatsappNummer: h.whatsappNummer,
        email: h.email,
        istTest: h.istTest,
        blockiert: h.blockiert,
        erstelltAm: h.erstelltAm,
        freimonate: h.freimonate,
        angebote: anzahlMap.get(h.id) ?? 0,
        letzteAktivitaet: letzteMap.get(h.id) ?? null,
        tarif: aboMap.get(h.id)?.tarif ?? null,
        aboStatus: aboMap.get(h.id)?.status ?? null,
        umsatz: umsatzMap.get(h.id) ?? 0,
      }));

      const vor7Tagen = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const vor14Tagen = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const monatsbeginn = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const [angebote7Tage, kiEventsMonat, rueckfragenDoks] = await Promise.all([
        prisma.dokument.count({ where: { art: "ANGEBOT", erstelltAm: { gte: vor7Tagen } } }),
        prisma.event.findMany({ where: { typ: "KI_AUFRUF", erstelltAm: { gte: monatsbeginn } }, select: { dataJson: true } }),
        prisma.dokument.findMany({
          where: { kundenRueckfrageAm: { gte: vor14Tagen } },
          select: { handwerkerId: true, nummer: true, kundenRueckfrageAm: true },
          orderBy: { kundenRueckfrageAm: "desc" },
        }),
      ]);

      const kpis = {
        gesamt: zeilen.length,
        kunden: zeilen.filter((z) => !z.istTest).length,
        test: zeilen.filter((z) => z.istTest).length,
        blockiert: zeilen.filter((z) => z.blockiert).length,
        angeboteGesamt: [...anzahlMap.values()].reduce((s, n) => s + n, 0),
        angebote7Tage,
        mrr: mrr(abos),
        einnahmenMonat: einnahmenImZeitraum(buchungen, monatsZeitraum()),
        gesamtUmsatz: gesamtUmsatz(buchungen),
        kiKostenMonatCent: summiereKostenCent(kiEventsMonat),
      };

      // Warnsignale
      const firmaVon = new Map(betriebe.map((b) => [b.id, b.firma]));
      const testLimit = direkttestConfig().DIREKTTEST_MAX_NACHRICHTEN;
      const alarme = {
        inaktiveKunden: zeilen
          .filter((z) => !z.istTest && !z.blockiert && istInaktiv(z))
          .map((z) => ({
            id: z.id,
            firma: z.firma,
            tage: Math.floor((Date.now() - (z.letzteAktivitaet ?? z.erstelltAm).getTime()) / (24 * 60 * 60 * 1000)),
          })),
        testAmLimit: betriebe
          .filter((h) => h.istTest && h.testNachrichten >= testLimit)
          .map((h) => ({ id: h.id, firma: h.firma || `+${h.whatsappNummer}`, nachrichten: h.testNachrichten, limit: testLimit })),
        rueckfragen: rueckfragenDoks.map((d) => ({
          id: d.handwerkerId,
          firma: firmaVon.get(d.handwerkerId) ?? "Unbekannt",
          nummer: d.nummer,
          datum: d.kundenRueckfrageAm as Date,
        })),
      };

      const f = (req.query.filter ?? "alle") as BetriebsFilter;
      const gefiltert =
        f === "kunden"
          ? zeilen.filter((z) => !z.istTest)
          : f === "test"
            ? zeilen.filter((z) => z.istTest)
            : f === "blockiert"
              ? zeilen.filter((z) => z.blockiert)
              : f === "inaktiv"
                ? zeilen.filter((z) => !z.istTest && !z.blockiert && istInaktiv(z))
                : zeilen;

      return reply.type("text/html; charset=utf-8").send(betreiberListe({ basis, filter: f, zeilen: gefiltert, kpis, alarme }));
    },
  );

  // ── Kundendetail ──────────────────────────────────────
  for (const pfad of beide("/betrieb/:id")) app.get<{ Params: { token?: string; id: string } }>(pfad, async (req, reply) => {
    const z = zugang(req);
    if (!z.ok) return z.basis === "/stasi" ? reply.redirect("/stasi") : reply.code(404).type("text/html").send(nichtGefunden());
    const basis = z.basis;

    const h = await prisma.handwerker.findUnique({ where: { id: req.params.id } });
    if (!h) return reply.code(404).type("text/html").send(nichtGefunden());

    const [dokumente, empfehlungen, logs, abo, buchungen] = await Promise.all([
      prisma.dokument.findMany({
        where: { handwerkerId: h.id },
        orderBy: { erstelltAm: "desc" },
        select: { art: true, nummer: true, datum: true, brutto: true, anzahlOffen: true, versendetAm: true, erstelltAm: true },
      }),
      prisma.empfehlung.findMany({ where: { werberId: h.id }, orderBy: { erstelltAm: "desc" } }),
      prisma.adminLog.findMany({ where: { handwerkerId: h.id }, orderBy: { erstelltAm: "desc" }, take: 30 }),
      prisma.abo.findUnique({ where: { handwerkerId: h.id } }),
      prisma.buchung.findMany({ where: { handwerkerId: h.id }, orderBy: [{ zeitraum: "desc" }, { erstelltAm: "desc" }] }),
    ]);

    // KI-Kosten aus den KI_AUFRUF-Events (30 Tage + gesamt)
    const kiEvents = await prisma.event.findMany({
      where: { typ: "KI_AUFRUF", handwerkerId: h.id },
      select: { dataJson: true, erstelltAm: true },
    });
    const vor30Tagen = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const kiKosten = {
      cent30Tage: summiereKostenCent(kiEvents.filter((e) => e.erstelltAm >= vor30Tagen)),
      centGesamt: summiereKostenCent(kiEvents),
    };

    const angebote = dokumente.filter((d) => d.art === "ANGEBOT");
    const usage = {
      versandbereit: angebote.filter((d) => !d.versendetAm && d.anzahlOffen === 0).length,
      offenePreise: angebote.filter((d) => !d.versendetAm && d.anzahlOffen > 0).length,
      versendet: angebote.filter((d) => !!d.versendetAm).length,
      protokolle: dokumente.length - angebote.length,
    };

    const html = betreiberDetail({
      basis,
      betrieb: {
        id: h.id,
        firma: h.firma,
        name: h.name,
        whatsappNummer: h.whatsappNummer,
        email: h.email,
        istTest: h.istTest,
        blockiert: h.blockiert,
        blockiertGrund: h.blockiertGrund,
        blockiertAm: h.blockiertAm,
        erstelltAm: h.erstelltAm,
        freimonate: h.freimonate,
        gewerkTyp: h.gewerkTyp,
        ort: h.ort,
        angebote: angebote.length,
        letzteAktivitaet: dokumente[0]?.erstelltAm ?? null,
        tarif: abo?.tarif ?? null,
        aboStatus: abo?.status ?? null,
        umsatz: gesamtUmsatz(buchungen),
      },
      usage,
      angebote: angebote.slice(0, 15).map((d) => ({
        nummer: d.nummer,
        datum: d.datum,
        brutto: d.brutto,
        anzahlOffen: d.anzahlOffen,
        versendet: !!d.versendetAm,
      })),
      empfehlungen: empfehlungen.map((e) => ({ firma: e.firma, name: e.name, status: e.status, erstelltAm: e.erstelltAm })),
      logs: logs.map((l) => ({ aktion: l.aktion, detail: l.detail, erstelltAm: l.erstelltAm })),
      abo: abo
        ? { tarif: abo.tarif, monatspreis: abo.monatspreis, status: abo.status, beginntAm: abo.beginntAm, gekuendigtAm: abo.gekuendigtAm }
        : null,
      buchungen: buchungen.map((bu) => ({ typ: bu.typ, betrag: bu.betrag, zeitraum: bu.zeitraum, notiz: bu.notiz, erstelltAm: bu.erstelltAm })),
      aktuellerZeitraum: monatsZeitraum(),
      tarifPresets: TARIF_PRESETS,
      kiKosten,
    });
    return reply.type("text/html; charset=utf-8").send(html);
  });

  // ── Kontakt ändern (Nummer / E-Mail) ──────────────────
  for (const pfad of beide("/betrieb/:id/kontakt")) app.post<{ Params: { token?: string; id: string }; Body: { nummer?: string; email?: string } }>(
    pfad,
    async (req, reply) => {
      if (!zugang(req).ok) return reply.code(404).send({ fehler: "nicht gefunden" });
      const h = await prisma.handwerker.findUnique({ where: { id: req.params.id } });
      if (!h) return reply.code(404).send({ fehler: "Betrieb nicht gefunden" });

      const nummer = (req.body.nummer ?? "").replace(/\D/g, "");
      const email = (req.body.email ?? "").trim();
      if (nummer.length < 6 || nummer.length > 16) return reply.code(400).send({ fehler: "Nummer unvollständig (6–16 Ziffern, mit Ländervorwahl)" });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply.code(400).send({ fehler: "E-Mail-Adresse ungültig" });

      if (nummer !== h.whatsappNummer) {
        const belegt = await prisma.handwerker.findUnique({ where: { whatsappNummer: nummer } });
        if (belegt) return reply.code(409).send({ fehler: `Nummer gehört bereits zu „${belegt.firma}"` });
      }

      const aenderungen: string[] = [];
      if (nummer !== h.whatsappNummer) aenderungen.push(`Nummer ${h.whatsappNummer} → ${nummer}`);
      if (email !== h.email) aenderungen.push(`E-Mail ${h.email} → ${email}`);
      if (!aenderungen.length) return reply.send({ ok: true, meldung: "Nichts geändert." });

      await prisma.handwerker.update({ where: { id: h.id }, data: { whatsappNummer: nummer, email } });
      await protokolliere(h.id, h.firma, "KONTAKT_GEAENDERT", aenderungen.join("; "));
      return reply.send({ ok: true, meldung: "Kontakt aktualisiert." });
    },
  );

  // ── Blockieren / Entsperren ───────────────────────────
  for (const pfad of beide("/betrieb/:id/blockieren")) app.post<{ Params: { token?: string; id: string }; Body: { grund?: string } }>(
    pfad,
    async (req, reply) => {
      if (!zugang(req).ok) return reply.code(404).send({ fehler: "nicht gefunden" });
      const h = await prisma.handwerker.findUnique({ where: { id: req.params.id } });
      if (!h) return reply.code(404).send({ fehler: "Betrieb nicht gefunden" });
      const grund = (req.body.grund ?? "").trim();
      if (grund.length < 3) return reply.code(400).send({ fehler: "Bitte einen Grund angeben." });

      await prisma.handwerker.update({
        where: { id: h.id },
        data: { blockiert: true, blockiertGrund: grund, blockiertAm: new Date() },
      });
      await protokolliere(h.id, h.firma, "BLOCKIERT", grund);
      return reply.send({ ok: true, meldung: "Konto blockiert." });
    },
  );

  for (const pfad of beide("/betrieb/:id/entsperren")) app.post<{ Params: { token?: string; id: string } }>(pfad, async (req, reply) => {
    if (!zugang(req).ok) return reply.code(404).send({ fehler: "nicht gefunden" });
    const h = await prisma.handwerker.findUnique({ where: { id: req.params.id } });
    if (!h) return reply.code(404).send({ fehler: "Betrieb nicht gefunden" });

    await prisma.handwerker.update({
      where: { id: h.id },
      data: { blockiert: false, blockiertGrund: null, blockiertAm: null },
    });
    await protokolliere(h.id, h.firma, "ENTSPERRT", h.blockiertGrund ? `war blockiert wegen: ${h.blockiertGrund}` : "Konto wieder frei");
    return reply.send({ ok: true, meldung: "Konto entsperrt." });
  });

  // ── Telefon-Lead einladen (Akquise mit dokumentiertem WhatsApp-Opt-in) ─
  for (const pfad of beide("/lead-einladen")) app.post<{
    Params: { token?: string };
    Body: { nummer?: string; anrede?: string; firma?: string; quelle?: string };
  }>(pfad, async (req, reply) => {
    if (!zugang(req).ok) return reply.code(404).send({ fehler: "nicht gefunden" });
    const ergebnis = await legeLeadAnUndLadeEin(prisma, {
      nummer: req.body.nummer ?? "",
      anrede: req.body.anrede ?? "",
      firma: req.body.firma,
      optInQuelle: req.body.quelle,
    });
    if ("fehler" in ergebnis) return reply.code(400).send({ fehler: ergebnis.fehler });
    await protokolliere(
      ergebnis.handwerker.id,
      ergebnis.handwerker.firma || ergebnis.handwerker.name,
      "LEAD_EINGELADEN",
      `WhatsApp-Einladung an ${ergebnis.handwerker.whatsappNummer} (Opt-in: ${ergebnis.handwerker.optInQuelle})`,
    );
    return reply.send({ ok: true, meldung: `Einladung an ${ergebnis.handwerker.whatsappNummer} gesendet.` });
  });

  // ── Gutschrift (Freimonate) ───────────────────────────
  for (const pfad of beide("/betrieb/:id/gutschrift")) app.post<{ Params: { token?: string; id: string }; Body: { monate?: string | number; grund?: string } }>(
    pfad,
    async (req, reply) => {
      if (!zugang(req).ok) return reply.code(404).send({ fehler: "nicht gefunden" });
      const h = await prisma.handwerker.findUnique({ where: { id: req.params.id } });
      if (!h) return reply.code(404).send({ fehler: "Betrieb nicht gefunden" });

      const monate = Math.trunc(Number(req.body.monate));
      const grund = (req.body.grund ?? "").trim();
      if (!Number.isFinite(monate) || monate < 1 || monate > 12) return reply.code(400).send({ fehler: "Monate: 1 bis 12" });
      if (grund.length < 3) return reply.code(400).send({ fehler: "Bitte einen Grund angeben." });

      await prisma.handwerker.update({ where: { id: h.id }, data: { freimonate: { increment: monate } } });
      await protokolliere(h.id, h.firma, "GUTSCHRIFT", `${monate} Freimonat(e): ${grund}`);
      return reply.send({ ok: true, meldung: `${monate} Freimonat(e) gutgeschrieben.` });
    },
  );

  // ── Als Kunde ansehen (Weiterleitung + Protokoll) ─────
  for (const pfad of beide("/betrieb/:id/als-kunde")) app.get<{ Params: { token?: string; id: string }; Querystring: { ziel?: string } }>(
    pfad,
    async (req, reply) => {
      const z = zugang(req);
      if (!z.ok) return z.basis === "/stasi" ? reply.redirect("/stasi") : reply.code(404).type("text/html").send(nichtGefunden());
      const h = await prisma.handwerker.findUnique({ where: { id: req.params.id } });
      if (!h) return reply.code(404).type("text/html").send(nichtGefunden());
      // Für das anonyme Webtest-Sammelkonto darf NIE ein Einstellungs-Token
      // entstehen — sein Cockpit würde die Diktate aller Tester bündeln (AB-M05).
      if (h.whatsappNummer === WEBTEST_NUMMER) {
        return reply.code(400).type("text/html").send(nichtGefunden());
      }

      const kundenToken = await einstellungenTokenBereit(prisma, h);
      const ziel = req.query.ziel === "einstellungen" ? einstellungenLink(kundenToken) : cockpitLink(kundenToken);
      await protokolliere(h.id, h.firma, "ALS_KUNDE", req.query.ziel === "einstellungen" ? "Einstellungen geöffnet" : "Cockpit geöffnet");
      return reply.redirect(ziel);
    },
  );

  // ── Abo anlegen / ändern / reaktivieren ───────────────
  for (const pfad of beide("/betrieb/:id/abo")) app.post<{ Params: { token?: string; id: string }; Body: { tarif?: string; monatspreis?: string | number } }>(
    pfad,
    async (req, reply) => {
      if (!zugang(req).ok) return reply.code(404).send({ fehler: "nicht gefunden" });
      const h = await prisma.handwerker.findUnique({ where: { id: req.params.id } });
      if (!h) return reply.code(404).send({ fehler: "Betrieb nicht gefunden" });

      const tarif = (req.body.tarif ?? "").trim().toUpperCase();
      const monatspreis = Number(req.body.monatspreis);
      if (!istTarif(tarif)) return reply.code(400).send({ fehler: "Unbekannter Tarif" });
      if (!Number.isFinite(monatspreis) || monatspreis < 0 || monatspreis > 10000) {
        return reply.code(400).send({ fehler: "Monatspreis ungültig" });
      }

      const vorher = await prisma.abo.findUnique({ where: { handwerkerId: h.id } });
      await prisma.abo.upsert({
        where: { handwerkerId: h.id },
        create: { handwerkerId: h.id, tarif, monatspreis, status: "AKTIV" },
        update: { tarif, monatspreis, status: "AKTIV", gekuendigtAm: null },
      });
      const detail = vorher
        ? `${vorher.tarif} ${vorher.monatspreis} € → ${tarif} ${monatspreis} €${vorher.status === "GEKUENDIGT" ? " (reaktiviert)" : ""}`
        : `Abo angelegt: ${tarif}, ${monatspreis} €/Monat`;
      await protokolliere(h.id, h.firma, "ABO_GESETZT", detail);
      return reply.send({ ok: true, meldung: "Abo gespeichert." });
    },
  );

  // ── Abo kündigen ──────────────────────────────────────
  for (const pfad of beide("/betrieb/:id/abo-kuendigen")) app.post<{ Params: { token?: string; id: string } }>(pfad, async (req, reply) => {
    if (!zugang(req).ok) return reply.code(404).send({ fehler: "nicht gefunden" });
    const h = await prisma.handwerker.findUnique({ where: { id: req.params.id } });
    if (!h) return reply.code(404).send({ fehler: "Betrieb nicht gefunden" });
    const abo = await prisma.abo.findUnique({ where: { handwerkerId: h.id } });
    if (!abo || abo.status !== "AKTIV") return reply.code(400).send({ fehler: "Kein aktives Abo vorhanden" });

    await prisma.abo.update({ where: { handwerkerId: h.id }, data: { status: "GEKUENDIGT", gekuendigtAm: new Date() } });
    await protokolliere(h.id, h.firma, "ABO_GEKUENDIGT", `${abo.tarif}, ${abo.monatspreis} €/Monat`);
    return reply.send({ ok: true, meldung: "Abo gekündigt." });
  });

  // ── Zahlung erfassen (manuelles Ledger) ───────────────
  for (const pfad of beide("/betrieb/:id/zahlung")) app.post<{ Params: { token?: string; id: string }; Body: { betrag?: string | number; zeitraum?: string; notiz?: string } }>(
    pfad,
    async (req, reply) => {
      if (!zugang(req).ok) return reply.code(404).send({ fehler: "nicht gefunden" });
      const h = await prisma.handwerker.findUnique({ where: { id: req.params.id } });
      if (!h) return reply.code(404).send({ fehler: "Betrieb nicht gefunden" });

      const betrag = Math.round(Number(req.body.betrag) * 100) / 100;
      const zeitraum = (req.body.zeitraum ?? "").trim();
      const notiz = (req.body.notiz ?? "").trim();
      if (!Number.isFinite(betrag) || betrag <= 0 || betrag > 100000) return reply.code(400).send({ fehler: "Betrag ungültig" });
      if (!istZeitraum(zeitraum)) return reply.code(400).send({ fehler: "Monat bitte als JJJJ-MM angeben" });

      await prisma.buchung.create({
        data: { handwerkerId: h.id, betrieb: h.firma, typ: "ZAHLUNG", betrag, zeitraum, notiz },
      });
      await protokolliere(h.id, h.firma, "ZAHLUNG", `${betrag} € für ${zeitraum}${notiz ? ` (${notiz})` : ""}`);
      return reply.send({ ok: true, meldung: `${betrag} € für ${zeitraum} gebucht.` });
    },
  );

  // ── Freimonat einlösen (0-€-Buchung + Zähler runter) ──
  for (const pfad of beide("/betrieb/:id/freimonat")) app.post<{ Params: { token?: string; id: string }; Body: { zeitraum?: string } }>(
    pfad,
    async (req, reply) => {
      if (!zugang(req).ok) return reply.code(404).send({ fehler: "nicht gefunden" });
      const h = await prisma.handwerker.findUnique({ where: { id: req.params.id } });
      if (!h) return reply.code(404).send({ fehler: "Betrieb nicht gefunden" });
      const zeitraum = (req.body.zeitraum ?? "").trim();
      if (!istZeitraum(zeitraum)) return reply.code(400).send({ fehler: "Monat bitte als JJJJ-MM angeben" });

      // Bedingung IN der Abzieh-Operation (Audit AB-M03): ein Doppelklick
      // fand vorher zweimal freimonate=1 vor und buchte ins Minus. Jetzt
      // zieht nur ab, wer wirklich noch >= 1 vorfindet — atomar.
      const eingeloest = await prisma.$transaction(async (tx) => {
        const abgezogen = await tx.handwerker.updateMany({
          where: { id: h.id, freimonate: { gte: 1 } },
          data: { freimonate: { decrement: 1 } },
        });
        if (abgezogen.count === 0) return false;
        await tx.buchung.create({
          data: { handwerkerId: h.id, betrieb: h.firma, typ: "FREIMONAT", betrag: 0, zeitraum, notiz: "Freimonat eingelöst" },
        });
        return true;
      });
      if (!eingeloest) return reply.code(400).send({ fehler: "Keine Freimonate übrig" });
      await protokolliere(h.id, h.firma, "FREIMONAT", `eingelöst für ${zeitraum} (Rest: ${h.freimonate - 1})`);
      return reply.send({ ok: true, meldung: `Freimonat für ${zeitraum} eingelöst.` });
    },
  );

  // ── Umsatz-Übersicht ──────────────────────────────────
  for (const pfad of beide("/umsatz")) app.get<{ Params: { token?: string } }>(pfad, async (req, reply) => {
    const z = zugang(req);
    if (!z.ok) return z.basis === "/stasi" ? reply.redirect("/stasi") : reply.code(404).type("text/html").send(nichtGefunden());
    const basis = z.basis;

    const [abos, buchungen, betriebe] = await Promise.all([
      prisma.abo.findMany(),
      prisma.buchung.findMany(),
      prisma.handwerker.findMany({ select: { id: true, firma: true, freimonate: true } }),
    ]);
    const firmaMap = new Map(betriebe.map((b) => [b.id, b.firma]));
    const aboMap = new Map(abos.map((a) => [a.handwerkerId, a]));

    // Umsatz je Kunde; gelöschte Betriebe erscheinen mit dem Firmennamen aus der Buchung.
    const umsatzMap = umsatzJeKunde(buchungen);
    const betriebNameAusBuchung = new Map(buchungen.map((b) => [b.handwerkerId, b.betrieb]));
    const topKunden = [...umsatzMap.entries()]
      .map(([id, umsatz]) => ({
        id,
        firma: firmaMap.get(id) ?? `${betriebNameAusBuchung.get(id) ?? "Unbekannt"} (gelöscht)`,
        tarif: aboMap.get(id)?.tarif ?? null,
        umsatz,
      }))
      .sort((a, b) => b.umsatz - a.umsatz);

    const tarifZaehler = new Map<string, number>();
    for (const a of abos) if (a.status === "AKTIV") tarifZaehler.set(a.tarif, (tarifZaehler.get(a.tarif) ?? 0) + 1);

    const html = betreiberUmsatz({
      basis,
      kpis: {
        mrr: mrr(abos),
        einnahmenMonat: einnahmenImZeitraum(buchungen, monatsZeitraum()),
        gesamtUmsatz: gesamtUmsatz(buchungen),
        zahlendeKunden: abos.filter((a) => a.status === "AKTIV").length,
        offeneFreimonate: betriebe.reduce((s, b) => s + b.freimonate, 0),
      },
      verlauf: monatsverlauf(buchungen),
      tarife: [...tarifZaehler.entries()].map(([tarif, anzahl]) => ({ tarif, anzahl })).sort((a, b) => b.anzahl - a.anzahl),
      topKunden,
      aktuellerZeitraum: monatsZeitraum(),
    });
    return reply.type("text/html; charset=utf-8").send(html);
  });

  // ── Löschen (DSGVO-Kaskade) ───────────────────────────
  for (const pfad of beide("/betrieb/:id/loeschen")) app.post<{ Params: { token?: string; id: string }; Body: { bestaetigung?: string } }>(
    pfad,
    async (req, reply) => {
      if (!zugang(req).ok) return reply.code(404).send({ fehler: "nicht gefunden" });
      const h = await prisma.handwerker.findUnique({ where: { id: req.params.id } });
      if (!h) return reply.code(404).send({ fehler: "Betrieb nicht gefunden" });

      if ((req.body.bestaetigung ?? "").trim() !== h.firma) {
        return reply.code(400).send({ fehler: `Zur Bestätigung bitte exakt „${h.firma}" eintippen.` });
      }

      // Alles Fachliche in EINER Transaktion; Events (PII-frei) bleiben für
      // Produktmetriken, AdminLog bleibt als Nachweis (mit Firma im Klartext).
      await prisma.$transaction([
        prisma.gewaehrleistung.deleteMany({ where: { dokument: { handwerkerId: h.id } } }),
        prisma.dokument.deleteMany({ where: { handwerkerId: h.id } }),
        prisma.vorgang.deleteMany({ where: { handwerkerId: h.id } }),
        prisma.feedback.deleteMany({ where: { handwerkerId: h.id } }),
        prisma.empfehlung.deleteMany({ where: { werberId: h.id } }),
        prisma.preisgedaechtnis.deleteMany({ where: { handwerkerId: h.id } }),
        prisma.importDokument.deleteMany({ where: { handwerkerId: h.id } }), // Positionen kaskadieren
        prisma.foto.deleteMany({ where: { handwerkerId: h.id } }),
        prisma.handwerker.delete({ where: { id: h.id } }),
      ]);

      // Foto-Ordner und Logo-Datei aufräumen (best effort — DB-Löschung ist da schon durch).
      loescheFotosVonBetrieb(h.id);
      if (h.logoDatei) {
        try {
          await unlink(h.logoDatei);
        } catch {
          /* Datei fehlt schon oder Pfad ungültig — egal */
        }
      }

      await protokolliere(h.id, h.firma, "GELOESCHT", `Betrieb ${h.firma} (+${h.whatsappNummer}) mit allen Daten gelöscht`);
      return reply.send({ ok: true, meldung: "Betrieb gelöscht." });
    },
  );
}
