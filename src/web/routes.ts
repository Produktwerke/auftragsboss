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
import { dokumentZuDaten, editorZuPositionen, type EditorPosition } from "./dokumentDaten.js";
import { kundenLink } from "./tokens.js";

interface SpeicherKoerper {
  kundeName?: string;
  kundeAdresse?: string;
  objekt?: string;
  einleitung?: string;
  schlusstext?: string;
  positionen?: EditorPosition[];
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
    const preisliste = ladePreisliste();

    return reply.type("text/html; charset=utf-8").send(
      editorSeite({
        dokument,
        handwerker,
        preisliste,
        kundenUrl: kundenLink(dokument.kundenToken),
      }),
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

    await prisma.dokument.update({
      where: { id: dokument.id },
      data: {
        kundeName: k.kundeName ?? dokument.kundeName,
        kundeAdresse: k.kundeAdresse ?? dokument.kundeAdresse,
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

      const preisliste = ladePreisliste();
      const daten = dokumentZuDaten(dokument);
      const summe = berechneAngebot(daten.positionen, preisliste, dokument.datum);

      if (req.params.format === "pdf") {
        const pdf = await erzeugeAngebotPdf({
          daten,
          summe,
          preisliste,
          nummer: dokument.nummer,
          datum: dokument.datum,
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
