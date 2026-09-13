// Sicherheitsnetz für offene Vorgänge (alle 2 Minuten).
//
// Seit dem Umbau 13.09.2026 entsteht das Angebot direkt nach jeder Eingabe
// (geplante Auswertung im Speicher, siehe pipeline.ts). Dieser Job fängt nur
// noch ab, was dort liegen bleibt:
//   1. Eingabe ohne Auswertung (z.B. nach einem Neustart ging der Timer
//      verloren): nach NACHHOL_MINUTEN normal auswerten.
//   2. Offene Rückfrage ohne Antwort: nach TIMEOUT_MINUTEN das Angebot mit
//      dem, was da ist, erzwingen.
//   3. Per Knopf wieder geöffneter Vorgang ohne neue Eingabe: still schließen.
//   4. Leerer Vorgang (nie diktiert): verwerfen.
//   5. Selbstheilung: gescheiterte Auswertungen zum geplanten Zeitpunkt
//      (Vorgang.naechsterVersuch) erneut versuchen. Fehler behandelt
//      fuehreAuswertungAus selbst (Wiederholung, Maler-Hinweis, Betreiber-Alarm).
import cron from "node-cron";
import { prisma, inReiheProNummer, fuehreAuswertungAus, auswertungGeplant } from "../pipeline.js";
import { sendeWhatsAppText } from "../whatsapp/send.js";
import { TIMEOUT_MINUTEN, NACHHOL_MINUTEN, nachrichtenLesen } from "../dialog.js";

async function schliesseAbgelaufeneVorgaenge(): Promise<void> {
  const jetzt = Date.now();
  const nachholGrenze = new Date(jetzt - NACHHOL_MINUTEN * 60_000);
  const abschlussGrenze = new Date(jetzt - TIMEOUT_MINUTEN * 60_000);

  const still = await prisma.vorgang.findMany({
    where: {
      status: "OFFEN",
      OR: [
        { naechsterVersuch: null, letzteAktivitaet: { lt: nachholGrenze } },
        { naechsterVersuch: { lte: new Date(jetzt) } },
      ],
    },
    include: { handwerker: true },
  });

  for (const vorgang of still) {
    const nachrichten = nachrichtenLesen(vorgang);
    const nummer = vorgang.handwerker.whatsappNummer;

    // 4. Leerer Vorgang (nur begonnen, nie diktiert): einfach verwerfen
    if (!nachrichten.some((n) => n.rolle === "handwerker")) {
      await prisma.vorgang.update({ where: { id: vorgang.id }, data: { status: "ABGESCHLOSSEN" } });
      continue;
    }

    const letzte = nachrichten[nachrichten.length - 1]!;
    const eingabeWartet = letzte.rolle === "handwerker";
    const abgelaufen = vorgang.letzteAktivitaet < abschlussGrenze;
    const wiederholung = vorgang.fehlversuche > 0;

    // 5. Geplante Wiederholung noch nicht fällig: warten.
    if (wiederholung && vorgang.naechsterVersuch && vorgang.naechsterVersuch.getTime() > jetzt) continue;

    if (!wiederholung) {
      // 3. Wieder geöffnet (Knopf „Nächster Raum"), aber nichts Neues gekommen:
      //    das Angebot existiert schon, nichts zu tun. Erst nach Ablauf schließen,
      //    damit der Nachtrag-Weg so lange offen bleibt.
      if (!eingabeWartet && vorgang.dokumentId && vorgang.runde === 0) {
        if (abgelaufen) await prisma.vorgang.updateMany({ where: { id: vorgang.id, status: "OFFEN" }, data: { status: "ABGESCHLOSSEN" } });
        continue;
      }
      // 2. Offene Rückfrage (oder Bitte um Raummaße): bis zum Ablauf warten.
      if (!eingabeWartet && !abgelaufen) continue;
      // 1. Eingabe wartet: wenn die Pipeline sie noch geplant hat, ihr den Vortritt lassen.
      if (eingabeWartet && !abgelaufen && auswertungGeplant(nummer)) continue;
    }

    try {
      // In die Warteschlange DIESER Nummer einreihen (Audit AB-M03): so kann
      // der Job nie parallel zu einer gerade eintreffenden Nachricht laufen.
      // Nach dem Warten den Vorgang FRISCH prüfen — hat der Handwerker
      // inzwischen geantwortet (oder die Pipeline ihn abgeschlossen), ist
      // hier nichts mehr zu tun.
      await inReiheProNummer(nummer, async () => {
        const frisch = await prisma.vorgang.findUnique({ where: { id: vorgang.id } });
        if (!frisch || frisch.status !== "OFFEN" || frisch.letzteAktivitaet > vorgang.letzteAktivitaet) return;
        if (abgelaufen && !eingabeWartet && !wiederholung) {
          await sendeWhatsAppText(nummer, "⏱️ Ich habe nichts mehr von dir gehört, ich mache das Angebot mit den vorhandenen Angaben fertig.");
        }
        // Bei einer Wiederholung gilt die Regel des ersten Versuchs weiter: nur eine
        // unbeantwortete Rückfrage wird erzwungen, eine wartende Eingabe normal ausgewertet.
        const erzwungen = abgelaufen && !eingabeWartet;
        const grund = wiederholung ? `Wiederholung ${frisch.fehlversuche + 1}` : abgelaufen ? "Zeitablauf" : "nachgeholt (Auswertung war nicht geplant)";
        console.log(`⏱️ Vorgang ${vorgang.id}: ${grund}.`);
        await fuehreAuswertungAus({ handwerker: vorgang.handwerker, vorgang: frisch, vonNummer: nummer, erzwungen });
      });
    } catch (err) {
      // fuehreAuswertungAus wirft nicht; hier landen nur Datenbank-/Versandfehler.
      console.error(`Timeout-Job: Vorgang ${vorgang.id} nicht verarbeitet:`, err);
    }
  }
}

export function starteVorgangTimeoutJob(): void {
  cron.schedule("*/2 * * * *", () => {
    schliesseAbgelaufeneVorgaenge().catch((err) => console.error("Vorgang-Timeout-Job fehlgeschlagen:", err));
  });
  console.log(`⏱️  Vorgang-Timeout-Job geplant (alle 2 Min, Nachholen ${NACHHOL_MINUTEN} Min, Abschluss ${TIMEOUT_MINUTEN} Min, Wiederholungen bei Fehlern).`);
}
