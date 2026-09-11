// Schließt Vorgänge, bei denen der Handwerker nicht mehr geantwortet hat.
//
// Ohne das würde ein Angebot nie erstellt, wenn er das Handy einfach weglegt —
// aus seiner Sicht wäre das Diktat verloren. Stattdessen wird nach kurzer
// Funkstille mit den vorhandenen Angaben fertiggestellt.
//
// Sammelmodus (Räume + Wandfotos, seit 11.09.2026): Nach ERINNERUNG_MINUTEN Stille
// einmal nachfragen „noch ein Raum, oder fertig?", nach TIMEOUT_MINUTEN das Angebot
// erzwingen. Der Abschluss läuft über werteVorgangAus (erzwungen), damit Aufmaß,
// Validator und Preisgedächtnis genauso greifen wie beim normalen Weg.
import cron from "node-cron";
import { prisma, inReiheProNummer, werteVorgangAus } from "../pipeline.js";
import { sendeWhatsAppText } from "../whatsapp/send.js";
import { TIMEOUT_MINUTEN, ERINNERUNG_MINUTEN, alsDialog } from "../dialog.js";

async function schliesseAbgelaufeneVorgaenge(): Promise<void> {
  const jetzt = Date.now();
  const erinnerungsGrenze = new Date(jetzt - ERINNERUNG_MINUTEN * 60_000);
  const abschlussGrenze = new Date(jetzt - TIMEOUT_MINUTEN * 60_000);

  const still = await prisma.vorgang.findMany({
    where: { status: "OFFEN", letzteAktivitaet: { lt: erinnerungsGrenze } },
    include: { handwerker: true },
  });

  for (const vorgang of still) {
    const dialog = alsDialog(vorgang);
    const nummer = vorgang.handwerker.whatsappNummer;

    // Leerer Vorgang (nur begonnen, nie diktiert) — einfach verwerfen
    if (dialog.filter((n) => n.rolle === "handwerker").length === 0) {
      await prisma.vorgang.update({ where: { id: vorgang.id }, data: { status: "ABGESCHLOSSEN" } });
      continue;
    }

    const abgelaufen = vorgang.letzteAktivitaet < abschlussGrenze;

    // Noch nicht abgelaufen: im Sammelmodus einmal erinnern, sonst nichts tun.
    if (!abgelaufen) {
      if (!vorgang.raeumeText || vorgang.erinnertAm) continue;
      try {
        await inReiheProNummer(nummer, async () => {
          const frisch = await prisma.vorgang.findUnique({ where: { id: vorgang.id } });
          if (!frisch || frisch.status !== "OFFEN" || frisch.erinnertAm || frisch.letzteAktivitaet >= erinnerungsGrenze) return;
          const rest = Math.max(1, TIMEOUT_MINUTEN - ERINNERUNG_MINUTEN);
          await sendeWhatsAppText(
            nummer,
            `⏳ Noch ein Raum, oder fertig? Sag *fertig*, dann mache ich das Angebot sofort. Kommt nichts mehr, mache ich es in ${rest} Minuten mit dem, was ich habe.`,
          );
          // Bewusst NICHT letzteAktivitaet anfassen: die Erinnerung verlängert die Frist nicht.
          await prisma.vorgang.updateMany({ where: { id: vorgang.id }, data: { erinnertAm: new Date() } });
        });
      } catch (err) {
        console.error(`Erinnerung fehlgeschlagen (${vorgang.id}):`, err);
      }
      continue;
    }

    try {
      // In die Warteschlange DIESER Nummer einreihen (Audit AB-M03): so kann
      // der Job nie parallel zu einer gerade eintreffenden Nachricht laufen.
      // Nach dem Warten den Vorgang FRISCH prüfen — hat der Handwerker
      // inzwischen geantwortet (oder die Pipeline ihn abgeschlossen), ist
      // hier nichts mehr zu tun.
      await inReiheProNummer(nummer, async () => {
        const frisch = await prisma.vorgang.findUnique({ where: { id: vorgang.id } });
        const grenzeJetzt = new Date(Date.now() - TIMEOUT_MINUTEN * 60_000);
        if (!frisch || frisch.status !== "OFFEN" || frisch.letzteAktivitaet >= grenzeJetzt) {
          return;
        }
        await sendeWhatsAppText(nummer, "⏱️ Ich habe nichts mehr von dir gehört, ich mache das Angebot mit den vorhandenen Angaben fertig.");
        await werteVorgangAus({ handwerker: vorgang.handwerker, vorgang: frisch, vonNummer: nummer, inhalt: "", stumm: true, erzwungen: true });
        console.log(`⏱️ Vorgang ${vorgang.id} nach Zeitablauf fertiggestellt.`);
      });
    } catch (err) {
      console.error(`Zeitablauf-Abschluss fehlgeschlagen (${vorgang.id}):`, err);
      // Nicht endlos wiederholen — sonst läuft bei einem Dauerfehler alle
      // zwei Minuten ein kostenpflichtiger KI-Aufruf ins Leere.
      await prisma.vorgang.update({ where: { id: vorgang.id }, data: { status: "ABGESCHLOSSEN" } });
    }
  }
}

export function starteVorgangTimeoutJob(): void {
  // Alle 2 Minuten prüfen (Erinnerung nach 5, Abschluss nach 15 Minuten Stille)
  cron.schedule("*/2 * * * *", () => {
    schliesseAbgelaufeneVorgaenge().catch((err) => console.error("Vorgang-Timeout-Job fehlgeschlagen:", err));
  });
  console.log(`⏱️  Vorgang-Timeout-Job geplant (alle 2 Min, Erinnerung ${ERINNERUNG_MINUTEN} Min, Abschluss ${TIMEOUT_MINUTEN} Min).`);
}
