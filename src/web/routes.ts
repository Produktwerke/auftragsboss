// Web-Routen für den Angebots-Editor.
//
//   GET  /a/:token             → Bearbeitungsseite für den Handwerker
//   PUT  /api/a/:token         → Änderungen speichern
//   GET  /api/a/:token/export.word|pdf → Datei herunterladen
//
// Kein Login: Der Zufallstoken IST die Zugangsberechtigung.
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../pipeline.js";
import { ladePreisliste } from "../preisliste.js";
import { berechneAngebot } from "../angebot/berechnung.js";
import { erzeugeAngebotWord, wordDateiname } from "../angebot/word.js";
import { erzeugeAngebotPdf } from "../angebot/pdf.js";
import { editorSeite } from "./editorSeite.js";
import { einstellungenSeite, type DokUebersicht } from "./einstellungenSeite.js";
import { cockpitSeite } from "./cockpitSeite.js";
import { adminSeite } from "./adminSeite.js";
import { einladungSeite } from "./einladungSeite.js";
import { dokumentZuDaten, editorZuPositionen, type EditorPosition } from "./dokumentDaten.js";
import { effektivePreisliste, einstellungenTokenBereit } from "../betrieb/betriebsdaten.js";
import { bearbeitenLink, einstellungenLink, cockpitLink, werbeLink } from "./tokens.js";
import { werbeCodeBereit, empfehlungsEinladungMail } from "../empfehlung.js";
import { ladeLogo } from "../betrieb/logo.js";
import { speichereLogo, entferneLogo, LogoFehler } from "../betrieb/logoUpload.js";
import { smtpKonfiguriert, featureConfig, webtestConfig } from "../config.js";
import { sendeMail, WORD_MIME } from "../email/send.js";
import { dokumentMail, logoAnhang } from "../email/templates.js";
import { merkePreise, vergissPreis } from "../betrieb/preisgedaechtnis.js";
import { spurEvent, geraetAusUA } from "../analytics/event.js";
import { findePlz } from "../betrieb/plzLookup.js";
import { testSeite } from "./testSeite.js";
import { testErlaubt, testAngebotAusAudio, testAngebotBeispiel, pruefeAudio } from "./webtest.js";
import { schleuseSeite } from "./schleuseSeite.js";
import {
  darfZugreifen,
  hatGeraetevertrauen,
  setzeGeraetevertrauen,
  nummerPasst,
  zugangGesperrt,
  merkeFehlversuch,
  setzeVersucheZurueck,
} from "./geraetevertrauen.js";

interface SpeicherKoerper {
  kundeName?: string;
  kundenNummer?: string;
  kundeStrasse?: string;
  kundePlzOrt?: string;
  nummer?: string;
  datum?: string; // YYYY-MM-DD
  objekt?: string;
  einleitung?: string;
  schlusstext?: string;
  positionen?: EditorPosition[];
}

/** Felder, die die Einstellungsseite speichert. */
interface EinstellungenKoerper {
  firma?: string;
  name?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  telefon?: string;
  email?: string;
  ustIdNr?: string;
  bank?: string;
  iban?: string;
  farbe?: string; // Hex ohne #
  standardEinleitung?: string;
  preisGedaechtnisAktiv?: boolean;
  zusammenfassungAktiv?: boolean;
  standardSchlusstext?: string;
  angebotGueltigTage?: string | number; // Eingabefeld liefert einen String
  zahlungsziel?: string;
}

export async function editorRoutes(app: FastifyInstance): Promise<void> {
  // ── Bearbeitungsseite ─────────────────────────────────
  // Kurzer Wurzel-Link "/:token" (neue Angebote) UND weiterhin "/a/:token"
  // (ältere, schon verschickte Links). Beide Pfade, ein Handler. Fastify räumt
  // statischen Routen (/testen, /health) Vorrang vor dem Parameter ein, daher
  // verschluckt "/:token" nichts anderes; unbekannte Pfade landen im 404.
  const editorAnzeigen = async (
    req: FastifyRequest<{ Params: { token: string } }>,
    reply: FastifyReply,
  ) => {
    const dokument = await prisma.dokument.findUnique({
      where: { bearbeitenToken: req.params.token },
    });
    if (!dokument) return reply.code(404).type("text/html").send(nichtGefunden());

    const handwerker = await prisma.handwerker.findUniqueOrThrow({
      where: { id: dokument.handwerkerId },
    });

    // Zugangs-Schleuse (Stufe A): Beim ersten Öffnen auf einem Gerät muss sich
    // der Betrieb per Handynummer ausweisen — schützt den per E-Mail
    // weitergeleiteten Link. Danach vertraut das Gerät dauerhaft (Cookie).
    // Test-Konten werden nie geschleust.
    if (!darfZugreifen(req, handwerker.id, handwerker.istTest)) {
      return reply.type("text/html; charset=utf-8").send(schleuseSeite({ token: req.params.token }));
    }

    // Betriebsdaten des Handwerkers über die Vorgaben legen — so erscheinen
    // sein Logo, seine Farbe und seine Adresse im Editor-Briefkopf.
    const preisliste = effektivePreisliste(handwerker, ladePreisliste());

    // Rückweg zu den Einstellungen (dort liegt auch die Angebotsübersicht).
    // Test-Konten haben KEINE Einstellungsseite und keine Angebotsübersicht —
    // für sie entfällt der Zurück-Link ganz.
    const einstellungenUrl = handwerker.istTest
      ? undefined
      : cockpitLink(await einstellungenTokenBereit(prisma, handwerker));

    // Preisgedächtnis-Stand für die Merken/Vergessen-Knöpfe im Editor:
    // welche Leistungen dieser Betrieb schon gemerkt hat (Schlüssel → Preis).
    // Null = Funktion aus (Flag/Betriebseinstellung), die Knöpfe erscheinen nicht.
    let gedaechtnis: Record<string, number> | null = null;
    if (featureConfig().FEATURE_PREISGEDAECHTNIS && handwerker.preisGedaechtnisAktiv && !handwerker.istTest) {
      const eintraege = await prisma.preisgedaechtnis.findMany({
        where: { handwerkerId: handwerker.id },
        select: { leistungSchluessel: true, letzterPreis: true },
      });
      gedaechtnis = Object.fromEntries(eintraege.map((e) => [e.leistungSchluessel, e.letzterPreis]));
    }

    // Produktmetrik (PII-frei): Bearbeiten-Link geöffnet — Gerät (Handy/Desktop)
    // und Zeitpunkt. Erlaubt „abends am Laptop oder später am Handy?"-Auswertungen.
    await spurEvent(prisma, "LINK_GEOEFFNET", {
      handwerkerId: handwerker.id,
      data: { ziel: "editor", geraet: geraetAusUA(req.headers["user-agent"]), istTest: handwerker.istTest },
    });

    return reply.type("text/html; charset=utf-8").send(
      editorSeite({
        dokument,
        handwerker,
        preisliste,
        einstellungenUrl,
        plzLookup: featureConfig().FEATURE_PLZ_LOOKUP,
        gedaechtnis,
      }),
    );
  };
  app.get<{ Params: { token: string } }>("/a/:token", editorAnzeigen);
  app.get<{ Params: { token: string } }>("/:token", editorAnzeigen);

  // ── Zugang bestätigen (Schleuse) ──────────────────────
  // Nimmt die eingegebene Handynummer, vergleicht sie mit der WhatsApp-Nummer
  // des Betriebs. Passt sie, wird das Gerät dauerhaft vertraut (Cookie).
  app.post<{ Params: { token: string }; Body: { nummer?: string } }>(
    "/a/:token/zugang",
    async (req, reply) => {
      const sperre = zugangGesperrt(req.params.token);
      if (sperre.gesperrt) {
        return reply
          .code(429)
          .send({ fehler: `Zu viele Versuche. Bitte ${Math.ceil(sperre.sekunden / 60)} Min. warten.` });
      }

      const dokument = await prisma.dokument.findUnique({
        where: { bearbeitenToken: req.params.token },
        select: { handwerkerId: true },
      });
      if (!dokument) return reply.code(404).send({ fehler: "nicht gefunden" });

      const handwerker = await prisma.handwerker.findUnique({
        where: { id: dokument.handwerkerId },
        select: { id: true, whatsappNummer: true },
      });
      if (!handwerker) return reply.code(404).send({ fehler: "nicht gefunden" });

      if (!nummerPasst(req.body?.nummer ?? "", handwerker.whatsappNummer)) {
        merkeFehlversuch(req.params.token);
        return reply.code(401).send({ fehler: "Diese Nummer passt nicht zum Betrieb." });
      }

      setzeVersucheZurueck(req.params.token);
      setzeGeraetevertrauen(reply, handwerker.id);
      return reply.send({ ok: true });
    },
  );

  // ── Speichern ─────────────────────────────────────────
  app.put<{ Params: { token: string }; Body: SpeicherKoerper }>("/api/a/:token", async (req, reply) => {
    const dokument = await prisma.dokument.findUnique({
      where: { bearbeitenToken: req.params.token },
    });
    if (!dokument) return reply.code(404).send({ fehler: "nicht gefunden" });

    // Zugangs-Schleuse: nur vertraute Geräte (oder Test-Konten) dürfen speichern.
    const zugangHw = await prisma.handwerker.findUnique({
      where: { id: dokument.handwerkerId },
      select: { istTest: true },
    });
    if (!darfZugreifen(req, dokument.handwerkerId, zugangHw?.istTest ?? false)) {
      return reply.code(401).send({ fehler: "Bitte zuerst den Zugang bestätigen." });
    }

    if (dokument.eingefroren) return reply.code(409).send({ fehler: "angenommen, eingefroren" });
    if (dokument.versendetAm) return reply.code(409).send({ fehler: "versendet, schreibgeschützt" });

    const k = req.body;
    const positionen = k.positionen ? editorZuPositionen(k.positionen) : undefined;
    const preisliste = ladePreisliste();
    const summe = positionen ? berechneAngebot(positionen, preisliste, dokument.datum) : null;

    // Datum nur übernehmen, wenn es plausibel ist — ein leeres oder kaputtes
    // Feld darf das Datum nicht auf "Invalid Date" setzen.
    const neuesDatum = k.datum ? new Date(k.datum) : null;
    const datumGueltig = neuesDatum && !isNaN(neuesDatum.getTime());

    await prisma.dokument.update({
      where: { id: dokument.id },
      data: {
        kundeName: k.kundeName ?? dokument.kundeName,
        kundenNummer: k.kundenNummer ?? dokument.kundenNummer,
        kundeStrasse: k.kundeStrasse ?? dokument.kundeStrasse,
        kundePlzOrt: k.kundePlzOrt ?? dokument.kundePlzOrt,
        nummer: k.nummer?.trim() ? k.nummer.trim() : dokument.nummer,
        ...(datumGueltig ? { datum: neuesDatum } : {}),
        objekt: k.objekt ?? dokument.objekt,
        einleitung: k.einleitung ?? dokument.einleitung,
        schlusstext: k.schlusstext ?? dokument.schlusstext,
        ...(positionen && summe
          ? {
              positionenJson: JSON.stringify(summe.positionen),
              netto: summe.netto,
              mwstBetrag: summe.mwstBetrag,
              brutto: summe.brutto,
              anzahlOffen: summe.anzahlOffen,
            }
          : {}),
      },
    });

    // Preisgedächtnis speisen (opt-in): merkt sich die eingetragenen Preise
    // DIESES Betriebs für ähnliche Leistungen. Nur wenn Flag + Betriebs-
    // einstellung aktiv; sonst passiert nichts. Streng an handwerkerId gebunden.
    if (positionen && featureConfig().FEATURE_PREISGEDAECHTNIS) {
      const betrieb = await prisma.handwerker.findUnique({ where: { id: dokument.handwerkerId } });
      if (betrieb?.preisGedaechtnisAktiv) {
        await merkePreise(prisma, betrieb.id, positionen);
      }
    }

    return reply.send({ ok: true });
  });

  // ── Preisgedächtnis: einzelnen Preis merken / vergessen ──
  // Die Merken/Vergessen-Knöpfe je Position im Editor: der Handwerker
  // entscheidet gezielt, ob ein Einheitspreis ins Gedächtnis wandert
  // (zusätzlich zum automatischen Lernen beim Speichern) oder wieder
  // daraus verschwindet. Streng an den Betrieb des Dokuments gebunden.
  const gedaechtnisBetrieb = async (
    req: FastifyRequest<{ Params: { token: string } }>,
    reply: FastifyReply,
  ): Promise<{ id: string } | null> => {
    const dokument = await prisma.dokument.findUnique({
      where: { bearbeitenToken: req.params.token },
      select: { handwerkerId: true },
    });
    if (!dokument) {
      await reply.code(404).send({ fehler: "nicht gefunden" });
      return null;
    }
    const handwerker = await prisma.handwerker.findUnique({
      where: { id: dokument.handwerkerId },
      select: { id: true, istTest: true, preisGedaechtnisAktiv: true },
    });
    if (!handwerker) {
      await reply.code(404).send({ fehler: "nicht gefunden" });
      return null;
    }
    if (!darfZugreifen(req, handwerker.id, handwerker.istTest)) {
      await reply.code(401).send({ fehler: "Bitte zuerst den Zugang bestätigen." });
      return null;
    }
    if (!featureConfig().FEATURE_PREISGEDAECHTNIS || !handwerker.preisGedaechtnisAktiv || handwerker.istTest) {
      await reply.code(403).send({ fehler: "Das Preisgedächtnis ist für diesen Betrieb nicht aktiv." });
      return null;
    }
    return { id: handwerker.id };
  };

  app.post<{ Params: { token: string }; Body: { beschreibung?: string; einheit?: string | null; einzelpreis?: number } }>(
    "/api/a/:token/preis-merken",
    async (req, reply) => {
      const betrieb = await gedaechtnisBetrieb(req, reply);
      if (!betrieb) return;
      const beschreibung = (req.body?.beschreibung ?? "").trim();
      const einheit = typeof req.body?.einheit === "string" && req.body.einheit.trim() ? req.body.einheit : null;
      const preis = req.body?.einzelpreis;
      if (!beschreibung || beschreibung.length > 500) {
        return reply.code(400).send({ fehler: "Bitte zuerst eine Beschreibung eintragen." });
      }
      if (typeof preis !== "number" || !isFinite(preis) || preis <= 0 || preis > 1_000_000) {
        return reply.code(400).send({ fehler: "Bitte zuerst einen gültigen Preis eintragen." });
      }
      // preisquelle MANUELL: der Knopfdruck ist eine bewusste Bestätigung des
      // Handwerkers — merkePreise übernimmt (nur PREISGEDAECHTNIS würde es
      // überspringen, und dafür zeigt der Editor gar keinen Merken-Knopf).
      await merkePreise(prisma, betrieb.id, [
        { beschreibung, einheit, einzelpreis: Math.round(preis * 100) / 100, preisquelle: "MANUELL" },
      ]);
      return reply.send({ ok: true });
    },
  );

  app.post<{ Params: { token: string }; Body: { beschreibung?: string; einheit?: string | null } }>(
    "/api/a/:token/preis-vergessen",
    async (req, reply) => {
      const betrieb = await gedaechtnisBetrieb(req, reply);
      if (!betrieb) return;
      const beschreibung = (req.body?.beschreibung ?? "").trim();
      if (!beschreibung) return reply.code(400).send({ fehler: "Beschreibung fehlt." });
      const einheit = typeof req.body?.einheit === "string" && req.body.einheit.trim() ? req.body.einheit : null;
      const entfernt = await vergissPreis(prisma, betrieb.id, beschreibung, einheit);
      return reply.send({ ok: true, entfernt });
    },
  );

  // ── Angebot als "versendet" markieren / wieder freigeben ──
  // Markiert schützt das Angebot vor Änderungen (Speichern gibt 409); ansehen
  // und exportieren bleibt möglich. Aufheben macht es wieder editierbar.
  app.post<{ Params: { token: string }; Body: { versendet?: boolean } }>(
    "/api/a/:token/versendet",
    async (req, reply) => {
      const dokument = await prisma.dokument.findUnique({
        where: { bearbeitenToken: req.params.token },
        select: { id: true, handwerkerId: true },
      });
      if (!dokument) return reply.code(404).send({ fehler: "nicht gefunden" });
      if (!hatGeraetevertrauen(req, dokument.handwerkerId)) {
        return reply.code(401).send({ fehler: "Bitte zuerst den Zugang bestätigen." });
      }
      const versendet = req.body?.versendet !== false; // Default: markieren
      await prisma.dokument.update({
        where: { id: dokument.id },
        data: { versendetAm: versendet ? new Date() : null },
      });
      return reply.send({ ok: true, versendet });
    },
  );

  // ── Angebot löschen (der Betrieb selbst, über seinen Bearbeiten-Link) ──
  app.post<{ Params: { token: string } }>("/api/a/:token/loeschen", async (req, reply) => {
    const dokument = await prisma.dokument.findUnique({
      where: { bearbeitenToken: req.params.token },
      select: { id: true, handwerkerId: true },
    });
    if (!dokument) return reply.code(404).send({ fehler: "nicht gefunden" });
    if (!hatGeraetevertrauen(req, dokument.handwerkerId)) {
      return reply.code(401).send({ fehler: "Bitte zuerst den Zugang bestätigen." });
    }
    // Abhängige Datensätze zuerst entfernen (FK), dann das Dokument.
    await prisma.gewaehrleistung.deleteMany({ where: { dokumentId: dokument.id } });
    await prisma.dokument.delete({ where: { id: dokument.id } });
    return reply.send({ ok: true });
  });

  // ── PLZ-Nachschlag (OpenPLZ, EU/DE) ───────────────────
  // Manueller Knopf im Editor: liefert die PLZ zu Straße + Ort. Hinter Flag.
  app.get<{ Querystring: { strasse?: string; ort?: string } }>("/api/plz", async (req, reply) => {
    if (!featureConfig().FEATURE_PLZ_LOOKUP) return reply.code(404).send({ fehler: "nicht aktiv" });
    const plz = await findePlz(req.query.strasse ?? "", req.query.ort ?? "");
    return reply.send({ plz });
  });

  // ── Öffentlicher "Jetzt testen"-Aufnahmeknopf ─────────
  // Anonymer Besucher diktiert im Browser, bekommt ein echtes Angebot im Editor.
  // Nur aktiv bei WEBTEST_AKTIV; Missbrauchs-/Kostenschutz IP-basiert (webtest.ts).
  const endungFuerMime = (mime: string | undefined): string => {
    const m = (mime ?? "").toLowerCase();
    if (m.includes("webm")) return "webm";
    if (m.includes("ogg") || m.includes("opus")) return "ogg";
    if (m.includes("mp4") || m.includes("m4a")) return "mp4";
    if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
    if (m.includes("wav")) return "wav";
    return "webm";
  };

  app.get("/testen", async (_req, reply) => {
    if (!webtestConfig().WEBTEST_AKTIV) return reply.code(404).send("nicht verfügbar");
    return reply.type("text/html; charset=utf-8").send(testSeite());
  });

  app.post<{ Body: { audio?: string; mime?: string } }>(
    "/api/testen/audio",
    { bodyLimit: 25 * 1024 * 1024 },
    async (req, reply) => {
      const ip = (((req.headers["x-forwarded-for"] as string) ?? "").split(",")[0] ?? "").trim() || req.ip;
      const erlaubt = testErlaubt(ip);
      if (!erlaubt.ok) return reply.code(429).send({ fehler: erlaubt.grund });
      const b64 = (req.body?.audio ?? "").split(",").pop() ?? "";
      if (!b64) return reply.code(400).send({ fehler: "Keine Aufnahme empfangen." });
      const audio = Buffer.from(b64, "base64");
      const audioOk = pruefeAudio(audio, req.body?.mime);
      if (!audioOk.ok) return reply.code(400).send({ fehler: audioOk.grund });
      try {
        const editorUrl = await testAngebotAusAudio(audio, "aufnahme." + endungFuerMime(req.body?.mime), ip);
        return reply.send({ editorUrl });
      } catch (err) {
        req.log.error({ err }, "Web-Test (Audio) fehlgeschlagen");
        return reply.code(500).send({ fehler: "Das hat leider nicht geklappt. Versuch es noch einmal." });
      }
    },
  );

  app.post("/api/testen/beispiel", async (req, reply) => {
    const ip = (((req.headers["x-forwarded-for"] as string) ?? "").split(",")[0] ?? "").trim() || req.ip;
    const erlaubt = testErlaubt(ip);
    if (!erlaubt.ok) return reply.code(429).send({ fehler: erlaubt.grund });
    try {
      const editorUrl = await testAngebotBeispiel(ip);
      return reply.send({ editorUrl });
    } catch (err) {
      req.log.error({ err }, "Web-Test (Beispiel) fehlgeschlagen");
      return reply.code(500).send({ fehler: "Das hat leider nicht geklappt. Versuch es noch einmal." });
    }
  });

  // ── Export ────────────────────────────────────────────
  app.get<{ Params: { token: string; format: string } }>(
    "/api/a/:token/export.:format",
    async (req, reply) => {
      const dokument = await prisma.dokument.findUnique({
        where: { bearbeitenToken: req.params.token },
      });
      if (!dokument) return reply.code(404).send("nicht gefunden");

      const handwerker = await prisma.handwerker.findUniqueOrThrow({
        where: { id: dokument.handwerkerId },
      });
      // Zugangs-Schleuse: Ohne vertrautes Gerät kein Direkt-Download der Datei
      // (schützt den Export-Weg genauso wie die Editor-Seite).
      if (!darfZugreifen(req, handwerker.id, handwerker.istTest)) {
        return reply.type("text/html; charset=utf-8").send(schleuseSeite({ token: req.params.token }));
      }
      // Test-Angebote: kein Download. Nur über WhatsApp / für registrierte Betriebe.
      if (handwerker.istTest) return reply.code(403).type("text/html; charset=utf-8").send(nurUeberWhatsApp());

      await spurEvent(prisma, "EXPORT", {
        handwerkerId: handwerker.id,
        data: { format: req.params.format, geraet: geraetAusUA(req.headers["user-agent"]) },
      });

      const preisliste = effektivePreisliste(handwerker, ladePreisliste());
      const daten = dokumentZuDaten(dokument);
      const summe = berechneAngebot(daten.positionen, preisliste, dokument.datum);

      if (req.params.format === "pdf") {
        const pdf = await erzeugeAngebotPdf({
          daten,
          summe,
          preisliste,
          nummer: dokument.nummer,
          datum: dokument.datum,
          kundenNummer: dokument.kundenNummer,
        });
        return reply
          .type("application/pdf")
          .header(
            "Content-Disposition",
            `attachment; filename="${dateiname(dokument.art, dokument.nummer, "pdf")}"`,
          )
          .send(pdf);
      }

      const word = await erzeugeAngebotWord({
        daten,
        summe,
        preisliste,
        nummer: dokument.nummer,
        datum: dokument.datum,
        kundenNummer: dokument.kundenNummer,
      });
      return reply
        .type("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        .header(
          "Content-Disposition",
          `attachment; filename="${wordDateiname(dokument.art, dokument.nummer, dokument.kundeName)}"`,
        )
        .send(word);
    },
  );

  // ── E-Mail-Einstellung des Betriebs (aus dem Editor) ──
  // Speichert die E-Mail-Adresse und/oder den "auch als E-Mail senden"-Haken.
  app.put<{ Params: { token: string }; Body: { email?: string; aktiv?: boolean } }>(
    "/api/a/:token/mail-einstellung",
    async (req, reply) => {
      const dokument = await prisma.dokument.findUnique({
        where: { bearbeitenToken: req.params.token },
      });
      if (!dokument) return reply.code(404).send({ fehler: "nicht gefunden" });
      const handwerker = await prisma.handwerker.findUniqueOrThrow({
        where: { id: dokument.handwerkerId },
      });

      const daten: { email?: string; mailStandard?: boolean } = {};
      if (typeof req.body.email === "string") {
        const e = req.body.email.trim();
        if (e && !/^.+@.+\..+$/.test(e)) {
          return reply.code(400).send({ fehler: "ungültige E-Mail-Adresse" });
        }
        if (e) daten.email = e; // leere Eingabe nicht übernehmen (E-Mail ist Pflichtfeld)
      }
      if (typeof req.body.aktiv === "boolean") daten.mailStandard = req.body.aktiv;

      const akt = Object.keys(daten).length
        ? await prisma.handwerker.update({ where: { id: handwerker.id }, data: daten })
        : handwerker;
      return reply.send({ ok: true, email: akt.email, aktiv: akt.mailStandard });
    },
  );

  // ── Datei per E-Mail an den Betrieb senden ────────────
  // Erzeugt PDF/Word wie beim Export und schickt es an die hinterlegte Adresse.
  app.post<{ Params: { token: string; format: string } }>(
    "/api/a/:token/mail.:format",
    async (req, reply) => {
      const dokument = await prisma.dokument.findUnique({
        where: { bearbeitenToken: req.params.token },
      });
      if (!dokument) return reply.code(404).send({ fehler: "nicht gefunden" });
      const handwerker = await prisma.handwerker.findUniqueOrThrow({
        where: { id: dokument.handwerkerId },
      });
      // Test-Angebote: kein E-Mail-Versand.
      if (handwerker.istTest) return reply.code(403).send({ fehler: "Im Test nicht verfügbar, nur über WhatsApp." });

      // SMTP muss eingerichtet sein — sonst würde emailConfig() den Server
      // beenden. Deshalb hier höflich ablehnen statt abzustürzen.
      if (!smtpKonfiguriert()) {
        return reply.code(400).send({ fehler: "E-Mail-Versand ist noch nicht eingerichtet (SMTP fehlt)." });
      }
      if (!handwerker.email?.trim()) {
        return reply.code(400).send({ fehler: "keine E-Mail-Adresse hinterlegt" });
      }

      const preisliste = effektivePreisliste(handwerker, ladePreisliste());
      const daten = dokumentZuDaten(dokument);
      const summe = berechneAngebot(daten.positionen, preisliste, dokument.datum);
      const istPdf = req.params.format === "pdf";

      let anhangName: string;
      let inhalt: Buffer;
      let mime: string;
      if (istPdf) {
        inhalt = await erzeugeAngebotPdf({
          daten,
          summe,
          preisliste,
          nummer: dokument.nummer,
          datum: dokument.datum,
          kundenNummer: dokument.kundenNummer,
        });
        anhangName = dateiname(dokument.art, dokument.nummer, "pdf");
        mime = "application/pdf";
      } else {
        inhalt = await erzeugeAngebotWord({
          daten,
          summe,
          preisliste,
          nummer: dokument.nummer,
          datum: dokument.datum,
          kundenNummer: dokument.kundenNummer,
        });
        anhangName = wordDateiname(dokument.art, dokument.nummer, dokument.kundeName);
        mime = WORD_MIME;
      }

      // Volle AuftragsBoss-Vorlage — exakt dasselbe Design wie die automatische
      // Mail (Banner, "Online bearbeiten"-Button, Vorschau, Signatur mit Logo).
      // Der Anhang-Hinweis passt sich an PDF/Word an.
      const { betreff, html } = dokumentMail({
        daten,
        summe,
        preisliste,
        nummer: dokument.nummer,
        datum: dokument.datum,
        version: dokument.version,
        bearbeitenUrl: bearbeitenLink(dokument.bearbeitenToken),
        wordDateiname: anhangName,
        anhangFormat: istPdf ? "pdf" : "word",
      });

      try {
        await sendeMail(handwerker.email, betreff, html, [
          { filename: anhangName, content: inhalt, contentType: mime },
          logoAnhang(),
        ]);
      } catch (err) {
        app.log.error({ err }, "Mailversand aus dem Editor fehlgeschlagen");
        return reply.code(502).send({ fehler: "E-Mail konnte nicht versendet werden." });
      }
      return reply.send({ ok: true });
    },
  );

  // ── Nur den Bearbeitungslink per E-Mail senden (ohne Datei) ──
  // Für den Handy→PC-Workflow: unterwegs am Handy vorbereiten, den Link ins
  // Postfach legen, abends am Rechner in Ruhe fertig machen. Gleiche Vorlage
  // wie der Datei-Versand (Vorschau + „Jetzt bearbeiten"-Knopf), nur ohne
  // Anhang — dokumentMail ohne wordDateiname lässt den Anhang-Kasten weg.
  app.post<{ Params: { token: string } }>("/api/a/:token/mail-link", async (req, reply) => {
    const dokument = await prisma.dokument.findUnique({
      where: { bearbeitenToken: req.params.token },
    });
    if (!dokument) return reply.code(404).send({ fehler: "nicht gefunden" });
    const handwerker = await prisma.handwerker.findUniqueOrThrow({
      where: { id: dokument.handwerkerId },
    });
    if (handwerker.istTest) return reply.code(403).send({ fehler: "Im Test nicht verfügbar, nur über WhatsApp." });
    if (!darfZugreifen(req, handwerker.id, handwerker.istTest)) {
      return reply.code(401).send({ fehler: "Bitte zuerst den Zugang bestätigen." });
    }
    if (!smtpKonfiguriert()) {
      return reply.code(400).send({ fehler: "E-Mail-Versand ist noch nicht eingerichtet (SMTP fehlt)." });
    }
    if (!handwerker.email?.trim()) {
      return reply.code(400).send({ fehler: "keine E-Mail-Adresse hinterlegt" });
    }

    const preisliste = effektivePreisliste(handwerker, ladePreisliste());
    const daten = dokumentZuDaten(dokument);
    const summe = berechneAngebot(daten.positionen, preisliste, dokument.datum);
    const { betreff, html } = dokumentMail({
      daten,
      summe,
      preisliste,
      nummer: dokument.nummer,
      datum: dokument.datum,
      version: dokument.version,
      bearbeitenUrl: bearbeitenLink(dokument.bearbeitenToken),
    });
    try {
      await sendeMail(handwerker.email, betreff, html, [logoAnhang()]);
    } catch (err) {
      app.log.error({ err }, "Link-Mail aus dem Editor fehlgeschlagen");
      return reply.code(502).send({ fehler: "E-Mail konnte nicht versendet werden." });
    }
    return reply.send({ ok: true });
  });

  // ── Cockpit / Übersicht (passwortloser Zugang per Token) ─
  app.get<{ Params: { token: string } }>("/start/:token", async (req, reply) => {
    const handwerker = await prisma.handwerker.findUnique({
      where: { einstellungenToken: req.params.token },
    });
    if (!handwerker) return reply.code(404).type("text/html").send(nichtGefunden());

    const eff = effektivePreisliste(handwerker, ladePreisliste());
    const logo = ladeLogo(eff.betrieb.logo);
    const akzent = `#${/^[0-9a-fA-F]{6}$/.test(eff.betrieb.farbe) ? eff.betrieb.farbe : "0B5CAD"}`;

    const dokumente = await prisma.dokument.findMany({
      where: { handwerkerId: handwerker.id },
      orderBy: { datum: "desc" },
      take: 200,
    });
    const uebersicht: DokUebersicht[] = dokumente.map((d) => ({
      art: d.art, nummer: d.nummer, kundeName: d.kundeName, datum: d.datum, brutto: d.brutto,
      vollstaendig: d.anzahlOffen === 0, bearbeitenToken: d.bearbeitenToken, version: d.version,
      versendetAm: d.versendetAm,
    }));
    const kennzahlen = {
      anzahl: dokumente.length,
      offen: dokumente.filter((d) => d.anzahlOffen > 0).length,
      volumen: dokumente.reduce((s, d) => s + (d.anzahlOffen === 0 ? d.brutto : 0), 0),
    };
    const werbeUrl = werbeLink(await werbeCodeBereit(prisma, handwerker));

    // Wer den Einstellungs-/Cockpit-Link hat, ist nachweislich der Betrieb:
    // Gerät als vertraut markieren, damit Angebote von hier aus ohne Schleuse
    // öffnen und die Cockpit-Aktionen (Löschen/Versendet) greifen.
    setzeGeraetevertrauen(reply, handwerker.id);

    await spurEvent(prisma, "LINK_GEOEFFNET", {
      handwerkerId: handwerker.id,
      data: { ziel: "cockpit", geraet: geraetAusUA(req.headers["user-agent"]) },
    });

    return reply.type("text/html; charset=utf-8").send(
      cockpitSeite({
        handwerker, logoDataUrl: logo?.dataUrl ?? null, akzent,
        dokumente: uebersicht, kennzahlen, token: req.params.token, werbeUrl,
      }),
    );
  });

  // ── Empfehlung: Kollege per E-Mail einladen (aus dem Cockpit) ──
  // Wir dürfen niemanden per WhatsApp kalt anschreiben — deshalb E-Mail.
  // Einmalige, klar gekennzeichnete persönliche Empfehlung.
  app.post<{ Params: { token: string }; Body: { name?: string; email?: string } }>(
    "/api/empfehlung/:token/email",
    async (req, reply) => {
      const handwerker = await prisma.handwerker.findUnique({
        where: { einstellungenToken: req.params.token },
      });
      if (!handwerker) return reply.code(404).send({ fehler: "nicht gefunden" });
      if (!smtpKonfiguriert()) return reply.code(503).send({ fehler: "E-Mail-Versand ist nicht eingerichtet." });

      const name = (req.body.name ?? "").trim();
      const email = (req.body.email ?? "").trim();
      if (name.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return reply.code(400).send({ fehler: "Bitte Name und gültige E-Mail angeben." });
      }

      const werbeUrl = werbeLink(await werbeCodeBereit(prisma, handwerker));
      const { betreff, html } = empfehlungsEinladungMail(handwerker.firma, name, werbeUrl);
      try {
        await sendeMail(email, betreff, html);
      } catch (err) {
        req.log.error(err, "Empfehlungs-E-Mail fehlgeschlagen");
        return reply.code(502).send({ fehler: "E-Mail konnte nicht gesendet werden." });
      }

      // Als Lead festhalten (whatsappNummer unbekannt bei E-Mail-Einladung).
      await prisma.empfehlung.create({
        data: { werberId: handwerker.id, firma: "", name, whatsappNummer: "", email },
      });
      return reply.send({ ok: true });
    },
  );

  // ── Einstellungsseite (passwortloser Zugang per Token) ─
  app.get<{ Params: { token: string } }>("/einstellungen/:token", async (req, reply) => {
    const handwerker = await prisma.handwerker.findUnique({
      where: { einstellungenToken: req.params.token },
    });
    if (!handwerker) return reply.code(404).type("text/html").send(nichtGefunden());

    const vorgabe = ladePreisliste();
    const eff = effektivePreisliste(handwerker, vorgabe);
    const logo = ladeLogo(eff.betrieb.logo);
    const akzent = `#${/^[0-9a-fA-F]{6}$/.test(eff.betrieb.farbe) ? eff.betrieb.farbe : "0B5CAD"}`;

    const dokumente = await prisma.dokument.findMany({
      where: { handwerkerId: handwerker.id },
      orderBy: { datum: "desc" },
      take: 100,
    });
    const uebersicht: DokUebersicht[] = dokumente.map((d) => ({
      art: d.art,
      nummer: d.nummer,
      kundeName: d.kundeName,
      datum: d.datum,
      brutto: d.brutto,
      vollstaendig: d.anzahlOffen === 0,
      bearbeitenToken: d.bearbeitenToken,
      version: d.version,
      versendetAm: d.versendetAm,
    }));

    // Einstellungs-Token-Halter = nachweislich der Betrieb → Gerät vertrauen.
    setzeGeraetevertrauen(reply, handwerker.id);

    return reply.type("text/html; charset=utf-8").send(
      einstellungenSeite({
        handwerker,
        vorgabe,
        logoDataUrl: logo?.dataUrl ?? null,
        akzent,
        dokumente: uebersicht,
        token: req.params.token,
      }),
    );
  });

  // ── Einstellungen speichern ───────────────────────────
  app.put<{ Params: { token: string }; Body: EinstellungenKoerper }>(
    "/api/einstellungen/:token",
    async (req, reply) => {
      const handwerker = await prisma.handwerker.findUnique({
        where: { einstellungenToken: req.params.token },
      });
      if (!handwerker) return reply.code(404).send({ fehler: "nicht gefunden" });

      const k = req.body;
      // Leere Texteingaben als "nicht gesetzt" (null) speichern, damit wieder
      // die Vorgabe greift. Farbe nur übernehmen, wenn sie ein gültiger
      // Hex-Wert ist.
      const text = (s: string | undefined): string | null => {
        const t = (s ?? "").trim();
        return t.length ? t : null;
      };
      const farbe =
        k.farbe && /^[0-9a-fA-F]{6}$/.test(k.farbe.replace("#", ""))
          ? k.farbe.replace("#", "")
          : handwerker.farbe;
      // Gültigkeitsdauer: 1–365 Tage; leer oder Unsinn = null → Vorgabe greift.
      const gueltigTage = (() => {
        const n = Math.round(Number(String(k.angebotGueltigTage ?? "").trim()));
        return Number.isFinite(n) && n >= 1 && n <= 365 ? n : null;
      })();

      await prisma.handwerker.update({
        where: { id: handwerker.id },
        data: {
          // Firma, Name und E-Mail dürfen nicht leer werden — sie sind Pflicht.
          firma: text(k.firma) ?? handwerker.firma,
          name: text(k.name) ?? handwerker.name,
          email: text(k.email) ?? handwerker.email,
          strasse: text(k.strasse),
          plz: text(k.plz),
          ort: text(k.ort),
          telefon: text(k.telefon),
          ustIdNr: text(k.ustIdNr),
          bank: text(k.bank),
          iban: text(k.iban),
          farbe,
          standardEinleitung: text(k.standardEinleitung),
          standardSchlusstext: text(k.standardSchlusstext),
          angebotGueltigTage: gueltigTage,
          zahlungsziel: text(k.zahlungsziel)?.slice(0, 160) ?? null,
          ...(typeof k.preisGedaechtnisAktiv === "boolean"
            ? { preisGedaechtnisAktiv: k.preisGedaechtnisAktiv }
            : {}),
          ...(typeof k.zusammenfassungAktiv === "boolean"
            ? { zusammenfassungAktiv: k.zusammenfassungAktiv }
            : {}),
        },
      });
      return reply.send({ ok: true });
    },
  );

  // ── Logo hochladen oder entfernen ─────────────────────
  app.post<{ Params: { token: string }; Body: { dataUrl?: string; entfernen?: boolean } }>(
    "/api/einstellungen/:token/logo",
    { bodyLimit: 8 * 1024 * 1024 }, // Base64 bläht das Bild auf — Grenze hochsetzen
    async (req, reply) => {
      const handwerker = await prisma.handwerker.findUnique({
        where: { einstellungenToken: req.params.token },
      });
      if (!handwerker) return reply.code(404).send({ fehler: "nicht gefunden" });

      if (req.body.entfernen) {
        entferneLogo(handwerker.id);
        await prisma.handwerker.update({ where: { id: handwerker.id }, data: { logoDatei: null } });
        return reply.send({ ok: true, logoDataUrl: null });
      }

      try {
        const pfad = speichereLogo(handwerker.id, req.body.dataUrl ?? "");
        await prisma.handwerker.update({ where: { id: handwerker.id }, data: { logoDatei: pfad } });
        const logo = ladeLogo(pfad);
        return reply.send({ ok: true, logoDataUrl: logo?.dataUrl ?? null });
      } catch (err) {
        const meldung = err instanceof LogoFehler ? err.message : "Logo konnte nicht gespeichert werden.";
        return reply.code(400).send({ fehler: meldung });
      }
    },
  );

  // ── Feedback von der Einstellungsseite ────────────────
  app.post<{ Params: { token: string }; Body: { text?: string } }>(
    "/api/einstellungen/:token/feedback",
    async (req, reply) => {
      const handwerker = await prisma.handwerker.findUnique({
        where: { einstellungenToken: req.params.token },
      });
      if (!handwerker) return reply.code(404).send({ fehler: "nicht gefunden" });

      const text = (req.body.text ?? "").trim();
      if (text.length < 3) return reply.code(400).send({ fehler: "leer" });

      await prisma.feedback.create({
        data: { handwerkerId: handwerker.id, text, quelle: "WEB" },
      });
      return reply.send({ ok: true });
    },
  );

  // ── Interne Lern-Auswertung (nur mit gesetztem ADMIN_TOKEN) ─
  // Ohne ADMIN_TOKEN in der .env ist die Seite komplett aus (404).
  app.get<{ Params: { token: string } }>("/admin/:token", async (req, reply) => {
    const admin = process.env.ADMIN_TOKEN;
    if (!admin || admin.length < 8 || req.params.token !== admin) {
      return reply.code(404).type("text/html").send(nichtGefunden());
    }
    const dokumente = await prisma.dokument.findMany({
      orderBy: { erstelltAm: "desc" },
      take: 50,
    });
    return reply.type("text/html; charset=utf-8").send(adminSeite({ dokumente, basis: `/admin/${req.params.token}` }));
  });

  // ── Empfehlung: Einladungs-Landingpage ────────────────
  app.get<{ Params: { code: string } }>("/einladung/:code", async (req, reply) => {
    const werber = await prisma.handwerker.findUnique({ where: { werbeCode: req.params.code } });
    if (!werber) return reply.code(404).type("text/html").send(nichtGefunden());
    return reply
      .type("text/html; charset=utf-8")
      .send(einladungSeite({ code: req.params.code, werberFirma: werber.firma }));
  });

  // ── Empfehlung: Kollege trägt sich als Lead ein ───────
  app.post<{ Params: { code: string }; Body: { firma?: string; name?: string; nummer?: string; email?: string } }>(
    "/api/einladung/:code",
    async (req, reply) => {
      const werber = await prisma.handwerker.findUnique({ where: { werbeCode: req.params.code } });
      if (!werber) return reply.code(404).send({ fehler: "nicht gefunden" });

      const firma = (req.body.firma ?? "").trim();
      const name = (req.body.name ?? "").trim();
      const nummer = (req.body.nummer ?? "").replace(/\D/g, ""); // nur Ziffern
      const email = (req.body.email ?? "").trim() || null;
      if (firma.length < 2 || name.length < 2 || nummer.length < 6) {
        return reply.code(400).send({ fehler: "unvollständig" });
      }

      await prisma.empfehlung.create({
        data: { werberId: werber.id, firma, name, whatsappNummer: nummer, email },
      });
      return reply.send({ ok: true });
    },
  );
}

/** Sperr-Seite für Test-Angebote: Export nur über WhatsApp / für registrierte Betriebe. */
function nurUeberWhatsApp(): string {
  return `<!doctype html><html lang="de"><meta charset="utf-8"><title>Nur über WhatsApp</title>
    <body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:60px auto;padding:0 20px;color:#333;text-align:center;line-height:1.6;">
    <h1 style="color:#0b5cad;font-size:22px;">Nur über WhatsApp</h1>
    <p>Der Download als PDF/Word steht im kostenlosen Test nicht zur Verfügung, nur für registrierte Betriebe über WhatsApp.</p>
    <p style="margin:26px 0;"><a href="https://wa.me/491749364823?text=Hallo%20AuftragsBoss%2C%20ich%20m%C3%B6chte%20loslegen." style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:9px;">▶ Jetzt über WhatsApp testen</a></p>
    <p style="color:#666;font-size:14px;">oder schreib direkt an: <b>+49 174 9364823</b></p>
    </body></html>`;
}

function dateiname(art: string, nummer: string, endung: string): string {
  return `${art === "ANGEBOT" ? "Angebot" : "Protokoll"}_${nummer}.${endung}`;
}

function nichtGefunden(): string {
  return `<!doctype html><meta charset="utf-8"><title>Nicht gefunden</title>
    <body style="font-family:sans-serif;text-align:center;padding:60px;color:#555;">
    <h1 style="color:#0b5cad;">AuftragsBoss</h1>
    <p>Dieser Link ist ungültig oder abgelaufen.</p></body>`;
}
