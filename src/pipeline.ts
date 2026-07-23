// Die Kern-Pipeline: Sprachnachricht → Transkript → Struktur → Archiv → E-Mail.
// Jeder Schritt loggt; bei Fehlern bekommt der Handwerker eine klare
// WhatsApp-Rückmeldung statt Funkstille.
import { PrismaClient } from "@prisma/client";
import { ladeAudio } from "./whatsapp/media.js";
import { sendeWhatsAppText } from "./whatsapp/send.js";
import { transkribiereAudio } from "./ai/transcribe.js";
import { strukturiereTranskript } from "./ai/structure.js";
import { berechneAngebot, euro } from "./angebot/berechnung.js";
import { ladePreisliste } from "./preisliste.js";
import { dokumentMail } from "./email/templates.js";
import { sendeMail } from "./email/send.js";

export const prisma = new PrismaClient();

function addiereJahre(datum: Date, jahre: number): Date {
  const d = new Date(datum);
  d.setFullYear(d.getFullYear() + jahre);
  return d;
}

function addiereMonate(datum: Date, monate: number): Date {
  const d = new Date(datum);
  d.setMonth(d.getMonth() + monate);
  return d;
}

/** Fortlaufende Nummer pro Betrieb und Dokumentart, z.B. ANG-2026-0007. */
async function naechsteNummer(handwerkerId: string, art: string, datum: Date): Promise<string> {
  const jahresBeginn = new Date(datum.getFullYear(), 0, 1);
  const bisher = await prisma.dokument.count({
    where: { handwerkerId, art, datum: { gte: jahresBeginn } },
  });
  const praefix = art === "ANGEBOT" ? "ANG" : "PRO";
  return `${praefix}-${datum.getFullYear()}-${String(bisher + 1).padStart(4, "0")}`;
}

export async function verarbeiteSprachnachricht(args: {
  vonNummer: string;
  mediaId: string;
}): Promise<void> {
  const { vonNummer, mediaId } = args;

  // 1. Absender kennen wir? (Kein Login — die Nummer IST die Identität)
  const handwerker = await prisma.handwerker.findUnique({
    where: { whatsappNummer: vonNummer },
  });
  if (!handwerker) {
    await sendeWhatsAppText(
      vonNummer,
      "👋 Diese Nummer ist noch nicht registriert. Melde dich beim Angebotsblitz-Team, um deinen Betrieb freizuschalten.",
    );
    return;
  }

  try {
    // 2. Audio laden + transkribieren
    const audio = await ladeAudio(mediaId);
    const transkript = await transkribiereAudio(audio);
    if (transkript.length < 20) {
      await sendeWhatsAppText(
        vonNummer,
        "🤔 Die Sprachnachricht war zu kurz oder unverständlich. Bitte diktiere die Details noch einmal.",
      );
      return;
    }

    // 3. Strukturieren mit Claude (erkennt selbst: Angebot oder Protokoll)
    const preisliste = ladePreisliste();
    const daten = await strukturiereTranskript(transkript, preisliste);

    // 4. Summen im Code berechnen — nicht von der KI
    const datum = new Date();
    const summe = berechneAngebot(daten.positionen, preisliste, datum);
    const nummer = await naechsteNummer(handwerker.id, daten.art, datum);

    // 5. Archiv-Eintrag (+ Gewährleistungsfrist, falls Protokoll)
    const istProtokoll = daten.art === "PROTOKOLL" && daten.gewaehrleistung !== null;
    const fristJahre = daten.gewaehrleistung?.typ === "BAUWERK_5_JAHRE" ? 5 : 2;
    const ablauf = addiereJahre(datum, fristJahre);

    const dokument = await prisma.dokument.create({
      data: {
        handwerkerId: handwerker.id,
        art: daten.art,
        nummer,
        whatsappMediaId: mediaId,
        transkript,
        kundeName: daten.kunde.name,
        kundeAdresse: daten.kunde.adresse,
        gewerk: daten.gewerk,
        objekt: daten.objekt,
        positionenJson: JSON.stringify(summe.positionen),
        aufmassNotizen: daten.aufmassNotizen,
        besonderheiten: daten.besonderheiten,
        folgetermin: daten.folgetermin,
        einleitung: daten.einleitung,
        schlusstext: daten.schlusstext,
        rueckfragenJson: JSON.stringify(daten.rueckfragen),
        netto: summe.netto,
        mwstSatz: summe.mwstSatz,
        mwstBetrag: summe.mwstBetrag,
        brutto: summe.brutto,
        anzahlOffen: summe.anzahlOffen,
        gueltigBis: daten.art === "ANGEBOT" ? summe.gueltigBis : null,
        datum,
        ...(istProtokoll && {
          gewaehrleistung: {
            create: {
              typ: daten.gewaehrleistung!.typ,
              beginn: datum,
              ablauf,
              vorwarnung: addiereMonate(ablauf, -3),
            },
          },
        }),
      },
    });

    // 6. E-Mail an den Handwerker
    const mail = dokumentMail({
      daten,
      summe,
      preisliste,
      transkript,
      nummer,
      datum,
      gewaehrleistungAblauf: istProtokoll ? ablauf : undefined,
    });
    await sendeMail(handwerker.email, mail.betreff, mail.html);

    // 7. Bestätigung auf WhatsApp
    const kunde = daten.kunde.name ?? "deinen Auftrag";
    const kopf =
      daten.art === "ANGEBOT"
        ? `✅ Angebot ${nummer} für *${kunde}* ist fertig`
        : `✅ Protokoll ${nummer} für *${kunde}* ist fertig`;
    const summenZeile = summe.vollstaendig
      ? `Gesamt: ${euro(summe.brutto)} brutto`
      : `⚠️ ${summe.anzahlOffen} Position(en) ohne Preis — bitte vor dem Versand ergänzen`;
    const fristZeile = istProtokoll
      ? `\nGewährleistung: ${fristJahre} Jahre — ich erinnere dich rechtzeitig vor Ablauf.`
      : "";

    await sendeWhatsAppText(
      vonNummer,
      `${kopf} und per E-Mail an ${handwerker.email} unterwegs 📬\n${summenZeile}${fristZeile}`,
    );

    console.log(`✅ ${daten.art} ${nummer} für ${handwerker.firma} erstellt (${dokument.id}).`);
  } catch (err) {
    console.error("Pipeline-Fehler:", err);
    await sendeWhatsAppText(
      vonNummer,
      "⚠️ Da ist etwas schiefgelaufen — deine Sprachnachricht konnte nicht verarbeitet werden. Bitte versuche es in ein paar Minuten noch einmal.",
    );
    throw err;
  }
}
