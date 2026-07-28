// Web-Routen für den Angebots-Editor.
//
//   GET  /a/:token             → Bearbeitungsseite für den Handwerker
//   PUT  /api/a/:token         → Änderungen speichern
//   GET  /api/a/:token/export.word|pdf → Datei herunterladen
//
// Kein Login: Der Zufallstoken IST die Zugangsberechtigung.
import type { FastifyInstance } from "fastify";
import { prisma } from "../pipeline.js";
import { ladePreisliste } from "../preisliste.js";
import { berechneAngebot } from "../angebot/berechnung.js";
import { erzeugeAngebotWord, wordDateiname } from "../angebot/word.js";
import { erzeugeAngebotPdf } from "../angebot/pdf.js";
import { editorSeite } from "./editorSeite.js";
import { einstellungenSeite, type DokUebersicht } from "./einstellungenSeite.js";
import { adminSeite } from "./adminSeite.js";
import { dokumentZuDaten, editorZuPositionen, type EditorPosition } from "./dokumentDaten.js";
import { effektivePreisliste, einstellungenTokenBereit } from "../betrieb/betriebsdaten.js";
import { einstellungenLink } from "./tokens.js";
import { ladeLogo } from "../betrieb/logo.js";
import { speichereLogo, entferneLogo, LogoFehler } from "../betrieb/logoUpload.js";

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
  farbe?: string; // Hex ohne #
  standardEinleitung?: string;
  standardSchlusstext?: string;
}

export async function editorRoutes(app: FastifyInstance): Promise<void> {
  // ── Bearbeitungsseite ─────────────────────────────────
  app.get<{ Params: { token: string } }>("/a/:token", async (req, reply) => {
    const dokument = await prisma.dokument.findUnique({
      where: { bearbeitenToken: req.params.token },
    });
    if (!dokument) return reply.code(404).type("text/html").send(nichtGefunden());

    const handwerker = await prisma.handwerker.findUniqueOrThrow({
      where: { id: dokument.handwerkerId },
    });
    // Betriebsdaten des Handwerkers über die Vorgaben legen — so erscheinen
    // sein Logo, seine Farbe und seine Adresse im Editor-Briefkopf.
    const preisliste = effektivePreisliste(handwerker, ladePreisliste());

    // Rückweg zu den Einstellungen (dort liegt auch die Angebotsübersicht).
    const einstToken = await einstellungenTokenBereit(prisma, handwerker);

    return reply.type("text/html; charset=utf-8").send(
      editorSeite({ dokument, handwerker, preisliste, einstellungenUrl: einstellungenLink(einstToken) }),
    );
  });

  // ── Speichern ─────────────────────────────────────────
  app.put<{ Params: { token: string }; Body: SpeicherKoerper }>("/api/a/:token", async (req, reply) => {
    const dokument = await prisma.dokument.findUnique({
      where: { bearbeitenToken: req.params.token },
    });
    if (!dokument) return reply.code(404).send({ fehler: "nicht gefunden" });
    if (dokument.eingefroren) return reply.code(409).send({ fehler: "angenommen, eingefroren" });

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

    return reply.send({ ok: true });
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
    }));

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
          farbe,
          standardEinleitung: text(k.standardEinleitung),
          standardSchlusstext: text(k.standardSchlusstext),
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
    return reply.type("text/html; charset=utf-8").send(adminSeite({ dokumente }));
  });
}

function dateiname(art: string, nummer: string, endung: string): string {
  return `${art === "ANGEBOT" ? "Angebot" : "Protokoll"}_${nummer}.${endung}`;
}

function nichtGefunden(): string {
  return `<!doctype html><meta charset="utf-8"><title>Nicht gefunden</title>
    <body style="font-family:sans-serif;text-align:center;padding:60px;color:#555;">
    <h1 style="color:#0b5cad;">Angebotsblitz</h1>
    <p>Dieser Link ist ungültig oder abgelaufen.</p></body>`;
}
