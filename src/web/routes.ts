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
import { fotoBeschreibung, ladeAufmassAnlage } from "../angebot/aufmassblatt.js";
import { liesFoto, loescheFotoDatei } from "../betrieb/fotoAblage.js";
import { editorSeite } from "./editorSeite.js";
import { einstellungenSeite, type DokUebersicht } from "./einstellungenSeite.js";
import { cockpitSeite } from "./cockpitSeite.js";
import { adminSeite } from "./adminSeite.js";
import { einladungSeite } from "./einladungSeite.js";
import { dokumentZuDaten, editorZuPositionen, type EditorPosition } from "./dokumentDaten.js";
import { effektivePreisliste, einstellungenTokenBereit } from "../betrieb/betriebsdaten.js";
import { erstelleDatenexport } from "../betrieb/datenexport.js";
import { erlaubteNummern, fuegeMitarbeiterHinzu, entferneMitarbeiter, erlaubteMitarbeiter, tarifLabelFuerNummern } from "../betrieb/mitarbeiter.js";
import { loescheBetrieb } from "../betrieb/loeschung.js";
import { ladeKontingent } from "../betrieb/kontingent.js";
import { bearbeitenLink, einstellungenLink, cockpitLink, werbeLink } from "./tokens.js";
import { werbeCodeBereit, empfehlungsEinladungMail } from "../empfehlung.js";
import { ladeLogo } from "../betrieb/logo.js";
import { speichereLogo, entferneLogo, LogoFehler } from "../betrieb/logoUpload.js";
import { smtpKonfiguriert, stripeKonfiguriert, featureConfig, webtestConfig } from "../config.js";
import { sendeMail, WORD_MIME } from "../email/send.js";
import { dokumentMail, logoAnhang } from "../email/templates.js";
import { merkePreise, vergissPreis } from "../betrieb/preisgedaechtnis.js";
import { spurEvent, geraetAusUA } from "../analytics/event.js";
import { findePlz } from "../betrieb/plzLookup.js";
import { testSeite } from "./testSeite.js";
import { testErlaubt, testAngebotAusAudio, testAngebotBeispiel, pruefeAudio, WEBTEST_NUMMER } from "./webtest.js";
import { schleuseSeite } from "./schleuseSeite.js";
import { hatAdminSitzung } from "./adminAuth.js";
import {
  darfZugreifen,
  hatGeraetevertrauen,
  setzeGeraetevertrauen,
  nummerPasst,
  zugangGesperrt,
  merkeFehlversuch,
  setzeVersucheZurueck,
} from "./geraetevertrauen.js";
import {
  pruefeEingabe,
  speicherSchema,
  einstellungenSchema,
  feedbackSchema,
  empfehlungMailSchema,
} from "./eingabeSchemata.js";

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
  aufmassNotizen?: string;
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
  materialGetrennt?: boolean;
  zeige35a?: boolean;
  lohnanteilProzent?: string | number;
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
    const einstellungenToken = handwerker.istTest ? null : await einstellungenTokenBereit(prisma, handwerker);
    const einstellungenUrl = einstellungenToken ? cockpitLink(einstellungenToken) : undefined;
    // Direktsprung zum Abschnitt „Angebotsaufbau" (Lohnanteil, § 35a-Zeile) aus dem Editor.
    const angebotsaufbauUrl = einstellungenToken ? `${einstellungenLink(einstellungenToken)}#angebotsaufbau` : undefined;

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

    // Aufmaß (Teiletappe 3): Notizen und Belegfotos, im Editor nur zum Ansehen.
    const belegfotos = await prisma.foto.findMany({
      where: { dokumentId: dokument.id },
      orderBy: [{ raum: "asc" }, { wandNr: "asc" }, { erstelltAm: "asc" }],
      select: { id: true, raum: true, wandNr: true, erkennungJson: true },
    });

    return reply.type("text/html; charset=utf-8").send(
      editorSeite({
        dokument,
        handwerker,
        preisliste,
        einstellungenUrl,
        angebotsaufbauUrl,
        plzLookup: featureConfig().FEATURE_PLZ_LOOKUP,
        gedaechtnis,
        aufmass: {
          notizen: dokument.aufmassNotizen,
          fotos: belegfotos.map((f) => ({ id: f.id, raum: f.raum, wandNr: f.wandNr, beschreibung: fotoBeschreibung(f.erkennungJson) })),
        },
      }),
    );
  };
  app.get<{ Params: { token: string } }>("/a/:token", editorAnzeigen);
  app.get<{ Params: { token: string } }>("/:token", editorAnzeigen);

  // ── Belegfoto anzeigen (nur mit Bearbeiten-Link und vertrautem Gerät) ──
  app.get<{ Params: { token: string; fotoId: string } }>("/api/a/:token/foto/:fotoId", async (req, reply) => {
    const dokument = await prisma.dokument.findUnique({ where: { bearbeitenToken: req.params.token } });
    if (!dokument) return reply.code(404).send("nicht gefunden");
    const handwerker = await prisma.handwerker.findUniqueOrThrow({ where: { id: dokument.handwerkerId } });
    if (!darfZugreifen(req, handwerker.id, handwerker.istTest)) return reply.code(403).send("kein Zugriff");
    // Das Foto muss zu GENAU diesem Dokument gehören, sonst ließe sich mit einem
    // fremden Bearbeiten-Link durch Foto-IDs raten.
    const foto = await prisma.foto.findFirst({ where: { id: req.params.fotoId, dokumentId: dokument.id } });
    if (!foto) return reply.code(404).send("nicht gefunden");
    const daten = liesFoto(foto.datei);
    if (!daten) return reply.code(404).send("Datei fehlt");
    // inline + nosniff (globaler Hook): der Browser zeigt es als Bild oder gar nicht.
    return reply
      .type(foto.mimeType)
      .header("Cache-Control", "private, max-age=3600")
      .header("Content-Disposition", "inline")
      .send(daten);
  });

  // ── Belegfoto löschen (Bild + Bildunterschrift), seit 11.09.2026 ──
  // Gleiche Prüfkette wie beim Anzeigen: Bearbeiten-Link, vertrautes Gerät,
  // Foto muss zu GENAU diesem Dokument gehören. Datei und Zeile werden entfernt.
  app.delete<{ Params: { token: string; fotoId: string } }>("/api/a/:token/foto/:fotoId", async (req, reply) => {
    const dokument = await prisma.dokument.findUnique({ where: { bearbeitenToken: req.params.token } });
    if (!dokument) return reply.code(404).send({ fehler: "nicht gefunden" });
    const handwerker = await prisma.handwerker.findUniqueOrThrow({ where: { id: dokument.handwerkerId } });
    if (!darfZugreifen(req, handwerker.id, handwerker.istTest)) return reply.code(403).send({ fehler: "kein Zugriff" });
    const foto = await prisma.foto.findFirst({ where: { id: req.params.fotoId, dokumentId: dokument.id } });
    if (!foto) return reply.code(404).send({ fehler: "nicht gefunden" });
    loescheFotoDatei(foto.datei);
    await prisma.foto.delete({ where: { id: foto.id } });
    return reply.send({ ok: true });
  });

  // ── Zugang bestätigen (Schleuse) ──────────────────────
  // Nimmt die eingegebene Handynummer, vergleicht sie mit der WhatsApp-Nummer
  // des Betriebs. Passt sie, wird das Gerät dauerhaft vertraut (Cookie).
  app.post<{ Params: { token: string }; Body: { nummer?: string } }>(
    "/a/:token/zugang",
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
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

      const erlaubt = await erlaubteNummern(prisma, handwerker.id, handwerker.whatsappNummer);
      if (!erlaubt.some((n) => nummerPasst(req.body?.nummer ?? "", n))) {
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

    // Laufzeit-Validierung: Typen, Grenzen, keine NaN/Infinity — die
    // TypeScript-Typen allein prüfen zur Laufzeit nichts (Audit AB-K03).
    const k = pruefeEingabe(speicherSchema, req.body, reply);
    if (!k) return;
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
        // Seite 2 (Anlage Aufmaß) frei editierbar; leer = keine Notizen mehr.
        ...(typeof k.aufmassNotizen === "string" ? { aufmassNotizen: k.aufmassNotizen.trim() || null } : {}),
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
    // Belegfotos (Kundeninnenräume!) mit löschen: Zeilen UND Dateien, auch die
    // Fotos des zugehörigen Vorgangs, die (noch) an keinem Dokument hängen.
    // Nach-Audit 10.09. (F-01): vorher blieben sie als Waisen auf der Platte und im Backup.
    const vorgaenge = await prisma.vorgang.findMany({ where: { dokumentId: dokument.id }, select: { id: true } });
    const fotos = await prisma.foto.findMany({
      where: { handwerkerId: dokument.handwerkerId, OR: [{ dokumentId: dokument.id }, { vorgangId: { in: vorgaenge.map((v) => v.id) } }] },
      select: { id: true, datei: true },
    });
    for (const f of fotos) loescheFotoDatei(f.datei);
    await prisma.foto.deleteMany({ where: { id: { in: fotos.map((f) => f.id) } } });
    // Abhängige Datensätze zuerst entfernen (FK), dann das Dokument.
    await prisma.gewaehrleistung.deleteMany({ where: { dokumentId: dokument.id } });
    await prisma.dokument.delete({ where: { id: dokument.id } });
    return reply.send({ ok: true, fotosGeloescht: fotos.length });
  });

  // ── PLZ-Nachschlag (OpenPLZ, EU/DE) ───────────────────
  // Manueller Knopf im Editor: liefert die PLZ zu Straße + Ort. Hinter Flag.
  app.get<{ Querystring: { strasse?: string; ort?: string } }>("/api/plz", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
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
    { bodyLimit: 25 * 1024 * 1024, config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (req, reply) => {
      // req.ip ist dank trustProxy die ECHTE Client-IP (von Caddy angehängt);
      // den X-Forwarded-For-Header selbst zu lesen wäre fälschbar (AB-H02).
      const ip = req.ip;
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

  app.post("/api/testen/beispiel", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req, reply) => {
    // req.ip = echte Client-IP dank trustProxy (siehe /api/testen/audio).
    const ip = req.ip;
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
          aufmass: await ladeAufmassAnlage(prisma, dokument),
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
        aufmass: await ladeAufmassAnlage(prisma, dokument),
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
    { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const dokument = await prisma.dokument.findUnique({
        where: { bearbeitenToken: req.params.token },
      });
      if (!dokument) return reply.code(404).send({ fehler: "nicht gefunden" });
      const handwerker = await prisma.handwerker.findUniqueOrThrow({
        where: { id: dokument.handwerkerId },
      });
      // Test-Konten dürfen die (beim Webtest geteilte) Konto-E-Mail nicht ändern.
      if (handwerker.istTest) return reply.code(403).send({ fehler: "Im Test nicht verfügbar, nur über WhatsApp." });
      // Zugangs-Schleuse: Die Konto-E-Mail ist mandantenweit — ohne vertrautes
      // Gerät darf sie weder gelesen noch geändert werden (sonst könnte ein
      // weitergeleiteter Bearbeiten-Link alle künftigen Angebote umleiten).
      if (!darfZugreifen(req, handwerker.id, handwerker.istTest)) {
        return reply.code(401).send({ fehler: "Bitte zuerst den Zugang bestätigen." });
      }

      const daten: { email?: string; mailStandard?: boolean } = {};
      if (typeof req.body.email === "string") {
        const e = req.body.email.trim();
        // Genau EINE Adresse: keine Leerzeichen, Kommas oder Semikolons —
        // nodemailer würde "a@x.de, b@y.de" sonst als Empfängerliste deuten.
        if (e && !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(e)) {
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
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
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
      // Zugangs-Schleuse: gleicher Schutz wie Export und mail-link — sonst
      // könnte ein weitergeleiteter Link das Angebot per E-Mail abziehen.
      if (!darfZugreifen(req, handwerker.id, handwerker.istTest)) {
        return reply.code(401).send({ fehler: "Bitte zuerst den Zugang bestätigen." });
      }

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
          aufmass: await ladeAufmassAnlage(prisma, dokument),
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
          aufmass: await ladeAufmassAnlage(prisma, dokument),
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
  app.post<{ Params: { token: string } }>("/api/a/:token/mail-link", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req, reply) => {
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
    // Das gemeinsame anonyme Webtest-Konto hat KEIN Cockpit: die Liste würde
    // die Diktate (und Bearbeiten-Tokens!) aller Website-Tester zeigen (AB-M05).
    if (handwerker.whatsappNummer === WEBTEST_NUMMER) return reply.code(404).type("text/html").send(nichtGefunden());

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
    const stand = handwerker.istTest ? null : await ladeKontingent(prisma, handwerker.id);
    const kennzahlen = {
      anzahl: dokumente.length,
      offen: dokumente.filter((d) => d.anzahlOffen > 0).length,
      volumen: dokumente.reduce((s, d) => s + (d.anzahlOffen === 0 ? d.brutto : 0), 0),
      kontingent: stand ? { genutzt: stand.genutzt, limit: stand.limit, tarif: stand.tarif } : null,
    };
    // Wer den Einstellungs-/Cockpit-Link hat, ist nachweislich der Betrieb:
    // Gerät als vertraut markieren, damit Angebote von hier aus ohne Schleuse
    // öffnen und die Cockpit-Aktionen (Löschen/Versendet) greifen.
    setzeGeraetevertrauen(reply, handwerker.id);

    await spurEvent(prisma, "LINK_GEOEFFNET", {
      handwerkerId: handwerker.id,
      data: { ziel: "cockpit", geraet: geraetAusUA(req.headers["user-agent"]) },
    });

    // Offene Abo-Zahlung (Stripe Etappe 3, Teil 2): Hinweis mit Portal-Link.
    const aboStand = await prisma.abo.findUnique({ where: { handwerkerId: handwerker.id } });
    const zahlungOffen = aboStand?.zahlungOffenSeit
      ? { seit: aboStand.zahlungOffenSeit, portalUrl: `/abo/verwalten/${req.params.token}`, rechnungUrl: aboStand.zahlungOffeneRechnung }
      : null;

    return reply.type("text/html; charset=utf-8").send(
      cockpitSeite({
        handwerker, logoDataUrl: logo?.dataUrl ?? null, akzent,
        dokumente: uebersicht, kennzahlen, token: req.params.token, zahlungOffen,
      }),
    );
  });

  // ── Empfehlung: Kollege per E-Mail einladen (aus dem Cockpit) ──
  // Wir dürfen niemanden per WhatsApp kalt anschreiben — deshalb E-Mail.
  // Einmalige, klar gekennzeichnete persönliche Empfehlung.
  app.post<{ Params: { token: string }; Body: { name?: string; email?: string } }>(
    "/api/empfehlung/:token/email",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const handwerker = await prisma.handwerker.findUnique({
        where: { einstellungenToken: req.params.token },
      });
      if (!handwerker) return reply.code(404).send({ fehler: "nicht gefunden" });
      if (!smtpKonfiguriert()) return reply.code(503).send({ fehler: "E-Mail-Versand ist nicht eingerichtet." });

      // Genau EINE Empfänger-Adresse (keine Kommas → keine nodemailer-Liste).
      const koerper = pruefeEingabe(empfehlungMailSchema, req.body, reply);
      if (!koerper) return;
      const name = (koerper.name ?? "").trim();
      const email = koerper.email.trim();
      if (name.length < 2) {
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
  // ── Datenexport (Data Act / DSGVO Art. 20): ZIP mit allen Daten des Betriebs ──
  app.get<{ Params: { token: string } }>("/export/:token", async (req, reply) => {
    const handwerker = await prisma.handwerker.findUnique({ where: { einstellungenToken: req.params.token } });
    if (!handwerker || handwerker.whatsappNummer === WEBTEST_NUMMER) return reply.code(404).type("text/html").send(nichtGefunden());
    if (!darfZugreifen(req, handwerker.id, handwerker.istTest)) {
      return reply.type("text/html; charset=utf-8").send(schleuseSeite({ token: req.params.token }));
    }
    const e = await erstelleDatenexport(prisma, handwerker);
    await spurEvent(prisma, "EXPORT_ZIP", {
      handwerkerId: handwerker.id,
      data: { dokumente: e.anzahlDokumente, pdf: e.anzahlPdf, fotos: e.anzahlFotos, bytes: e.zip.length, geraet: geraetAusUA(req.headers["user-agent"]) },
    });
    return reply
      .type("application/zip")
      .header("Content-Disposition", `attachment; filename="${e.dateiname}"`)
      .send(e.zip);
  });

  app.get<{ Params: { token: string } }>("/einstellungen/:token", async (req, reply) => {
    const handwerker = await prisma.handwerker.findUnique({
      where: { einstellungenToken: req.params.token },
    });
    if (!handwerker) return reply.code(404).type("text/html").send(nichtGefunden());
    // Webtest-Sammelkonto: keine Einstellungen (AB-M05).
    if (handwerker.whatsappNummer === WEBTEST_NUMMER) return reply.code(404).type("text/html").send(nichtGefunden());

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

    // Mitarbeiter-Nummern und Tarifgrenze (17.09.2026)
    const aboStand = await prisma.abo.findUnique({ where: { handwerkerId: handwerker.id } });
    const mitarbeiterListe = await prisma.mitarbeiter.findMany({ where: { handwerkerId: handwerker.id }, orderBy: { erstelltAm: "asc" }, select: { id: true, name: true, whatsappNummer: true } });
    const mitarbeiterFrei = Math.max(0, erlaubteMitarbeiter(aboStand, handwerker.istTest) - mitarbeiterListe.length);

    return reply.type("text/html; charset=utf-8").send(
      einstellungenSeite({
        handwerker,
        vorgabe,
        logoDataUrl: logo?.dataUrl ?? null,
        akzent,
        dokumente: uebersicht,
        token: req.params.token,
        mitarbeiter: mitarbeiterListe,
        mitarbeiterFrei,
        mitarbeiterHinweis: tarifLabelFuerNummern(aboStand, handwerker.istTest),
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

      // Laufzeit-Validierung (Typen, Längen, E-Mail-Format) — Audit AB-K03.
      const k = pruefeEingabe(einstellungenSchema, req.body, reply);
      if (!k) return;
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
          // Angebotsaufbau (11.09.2026): Material getrennt, § 35a-Zeile, Lohnanteil 0 bis 100.
          ...(typeof k.materialGetrennt === "boolean" ? { materialGetrennt: k.materialGetrennt } : {}),
          ...(typeof k.zeige35a === "boolean" ? { zeige35a: k.zeige35a } : {}),
          ...(() => {
            const n = Math.round(Number(String(k.lohnanteilProzent ?? "").trim()));
            return Number.isFinite(n) && n >= 0 && n <= 100 ? { lohnanteilProzent: n } : {};
          })(),
        },
      });
      return reply.send({ ok: true });
    },
  );

  // ── Logo hochladen oder entfernen ─────────────────────
  app.post<{ Params: { token: string }; Body: { dataUrl?: string; entfernen?: boolean } }>(
    "/api/einstellungen/:token/logo",
    { bodyLimit: 8 * 1024 * 1024, config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, // Base64 bläht das Bild auf — Grenze hochsetzen
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
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const handwerker = await prisma.handwerker.findUnique({
        where: { einstellungenToken: req.params.token },
      });
      if (!handwerker) return reply.code(404).send({ fehler: "nicht gefunden" });

      const koerper = pruefeEingabe(feedbackSchema, req.body, reply);
      if (!koerper) return;
      const text = koerper.text.trim();
      if (text.length < 3) return reply.code(400).send({ fehler: "leer" });

      await prisma.feedback.create({
        data: { handwerkerId: handwerker.id, text, quelle: "WEB" },
      });
      return reply.send({ ok: true });
    },
  );

  // ── Mitarbeiter-Nummern (Einstellungen) ─────────────────────────────
  app.post<{ Params: { token: string }; Body: { name?: string; nummer?: string } }>(
    "/api/einstellungen/:token/mitarbeiter",
    { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const handwerker = await prisma.handwerker.findUnique({ where: { einstellungenToken: req.params.token } });
      if (!handwerker || handwerker.whatsappNummer === WEBTEST_NUMMER) return reply.code(404).send({ fehler: "nicht gefunden" });
      const abo = await prisma.abo.findUnique({ where: { handwerkerId: handwerker.id } });
      const e = await fuegeMitarbeiterHinzu(prisma, handwerker, abo, { name: String(req.body?.name ?? ""), nummer: String(req.body?.nummer ?? "") });
      if (!e.ok) return reply.code(400).send({ fehler: e.fehler });
      await spurEvent(prisma, "MITARBEITER_HINZU", { handwerkerId: handwerker.id });
      return reply.send({ ok: true, id: e.mitarbeiter.id });
    },
  );
  app.delete<{ Params: { token: string; id: string } }>("/api/einstellungen/:token/mitarbeiter/:id", async (req, reply) => {
    const handwerker = await prisma.handwerker.findUnique({ where: { einstellungenToken: req.params.token } });
    if (!handwerker) return reply.code(404).send({ fehler: "nicht gefunden" });
    const ok = await entferneMitarbeiter(prisma, handwerker, req.params.id);
    if (!ok) return reply.code(404).send({ fehler: "nicht gefunden" });
    await spurEvent(prisma, "MITARBEITER_ENTFERNT", { handwerkerId: handwerker.id });
    return reply.send({ ok: true });
  });

  // ── Konto selbst löschen (DSGVO, Einstellungen) ─────────────────────
  app.post<{ Params: { token: string }; Body: { bestaetigung?: string } }>(
    "/api/einstellungen/:token/loeschen",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const handwerker = await prisma.handwerker.findUnique({ where: { einstellungenToken: req.params.token } });
      if (!handwerker || handwerker.whatsappNummer === WEBTEST_NUMMER) return reply.code(404).send({ fehler: "nicht gefunden" });
      const wort = String(req.body?.bestaetigung ?? "").trim().toLowerCase();
      if (wort !== "löschen" && wort !== "loeschen") return reply.code(400).send({ fehler: `Zur Bestätigung bitte „löschen" eintippen.` });
      const abo = await prisma.abo.findUnique({ where: { handwerkerId: handwerker.id } });
      if (abo?.status === "AKTIV" && abo.stripeSubscriptionId) {
        return reply.code(400).send({ fehler: `Dein Abo läuft noch. Bitte kündige es zuerst unter „Abo & Abrechnung", danach kannst du dein Konto löschen.` });
      }
      await spurEvent(prisma, "KONTO_SELBST_GELOESCHT", { data: { istTest: handwerker.istTest } });
      await loescheBetrieb(prisma, handwerker, "Selbstlöschung in den Einstellungen");
      return reply.send({ ok: true });
    },
  );
  app.get("/geloescht", async (_req, reply) =>
    reply.type("text/html; charset=utf-8").send(
      `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Konto gelöscht · AuftragsBoss</title>
      <body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:60px auto;padding:0 20px;color:#333;text-align:center;line-height:1.6;">
      <h1 style="color:#0b5cad;font-size:22px;">Dein Konto ist gelöscht</h1>
      <p>Alle Angebote, Kundendaten, Fotos und Einstellungen sind entfernt. Danke, dass du AuftragsBoss ausprobiert hast.</p>
      <p style="color:#666;font-size:14px;">Wenn du zurückkommen willst: Schreib einfach wieder an +49 174 9364823.</p>
      </body></html>`,
    ),
  );

  // Der alte Token-Weg /admin/<ADMIN_TOKEN> für die Lern-Auswertung ist
  // ABGESCHALTET (Audit AB-H06) — die Auswertung gibt es nur noch unter
  // /stasi/auswertung nach dem Login. ADMIN_TOKEN in der .env ist damit
  // wirkungslos und kann dort entfernt werden.

  // Lern-Auswertung unter /stasi/auswertung
  // (Sitzungs-Cookie statt Token in der URL).
  app.get("/stasi/auswertung", async (req, reply) => {
    if (!hatAdminSitzung(req)) return reply.redirect("/stasi");
    const dokumente = await prisma.dokument.findMany({
      orderBy: { erstelltAm: "desc" },
      take: 50,
    });
    return reply.type("text/html; charset=utf-8").send(adminSeite({ dokumente, basis: "/stasi" }));
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
    { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } },
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
