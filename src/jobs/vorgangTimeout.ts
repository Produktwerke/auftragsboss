// Schließt Vorgänge, bei denen der Handwerker nicht mehr geantwortet hat.
//
// Ohne das würde ein Angebot nie erstellt, wenn er das Handy einfach weglegt —
// aus seiner Sicht wäre das Diktat verloren. Stattdessen wird nach kurzer
// Funkstille mit den vorhandenen Angaben fertiggestellt.
import cron from "node-cron";
import { prisma, erstelleDokument } from "../pipeline.js";
import { strukturiereDialog } from "../ai/structure.js";
import { ladePreisliste } from "../preisliste.js";
import { sendeWhatsAppText } from "../whatsapp/send.js";
import { TIMEOUT_MINUTEN, alsDialog } from "../dialog.js";

async function schliesseAbgelaufeneVorgaenge(): Promise<void> {
  const grenze = new Date(Date.now() - TIMEOUT_MINUTEN * 60_000);

  const abgelaufen = await prisma.vorgang.findMany({
    where: { status: "OFFEN", letzteAktivitaet: { lt: grenze } },
    include: { handwerker: true },
  });

  for (const vorgang of abgelaufen) {
    const dialog = alsDialog(vorgang);

    // Leerer Vorgang (nur begonnen, nie diktiert) — einfach verwerfen
    if (dialog.filter((n) => n.rolle === "handwerker").length === 0) {
      await prisma.vorgang.update({
        where: { id: vorgang.id },
        data: { status: "ABGESCHLOSSEN" },
      });
      continue;
    }

    try {
      const preisliste = ladePreisliste();
      const daten = await strukturiereDialog(dialog, preisliste);
      await sendeWhatsAppText(
        vorgang.handwerker.whatsappNummer,
        "⏱️ Ich habe nichts mehr von dir gehört — ich mache das Angebot mit den vorhandenen Angaben fertig.",
      );
      await erstelleDokument({
        vorgang,
        handwerkerId: vorgang.handwerkerId,
        vonNummer: vorgang.handwerker.whatsappNummer,
        daten,
        preisliste,
      });
      console.log(`⏱️ Vorgang ${vorgang.id} nach Zeitablauf fertiggestellt.`);
    } catch (err) {
      console.error(`Zeitablauf-Abschluss fehlgeschlagen (${vorgang.id}):`, err);
      // Nicht endlos wiederholen — sonst läuft bei einem Dauerfehler jede
      // Minute ein kostenpflichtiger KI-Aufruf ins Leere.
      await prisma.vorgang.update({
        where: { id: vorgang.id },
        data: { status: "ABGESCHLOSSEN" },
      });
    }
  }
}

export function starteVorgangTimeoutJob(): void {
  // Alle 5 Minuten prüfen
  cron.schedule("*/5 * * * *", () => {
    schliesseAbgelaufeneVorgaenge().catch((err) =>
      console.error("Vorgang-Timeout-Job fehlgeschlagen:", err),
    );
  });
  console.log(`⏱️  Vorgang-Timeout-Job geplant (alle 5 Min, Grenze ${TIMEOUT_MINUTEN} Min).`);
}
