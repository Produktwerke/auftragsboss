// Die Kern-Pipeline: Sprachnachricht → Transkript → Struktur → Archiv → E-Mail.
// Jeder Schritt loggt; bei Fehlern bekommt der Handwerker eine klare
// WhatsApp-Rückmeldung statt Funkstille.
import { PrismaClient } from "@prisma/client";
import { ladeAudio } from "./whatsapp/media.js";
import { sendeWhatsAppText } from "./whatsapp/send.js";
import { transkribiereAudio } from "./ai/transcribe.js";
import { strukturiereTranskript } from "./ai/structure.js";
import { protokollMail } from "./email/templates.js";
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
      "👋 Diese Nummer ist noch nicht registriert. Melde dich beim VoiceProtokoll-Guard-Team, um deinen Betrieb freizuschalten.",
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
        "🤔 Die Sprachnachricht war zu kurz oder unverständlich. Bitte diktiere die Auftragsdetails noch einmal.",
      );
      return;
    }

    // 3. Strukturieren mit Claude
    const daten = await strukturiereTranskript(transkript, {
      firma: handwerker.firma,
      name: handwerker.name,
      gewerk: handwerker.gewerk,
    });

    // 4. Archiv-Eintrag + Gewährleistungs-Frist atomar anlegen
    const auftragsDatum = new Date();
    const fristJahre = daten.gewaehrleistung.typ === "BAUWERK_5_JAHRE" ? 5 : 2;
    const ablauf = addiereJahre(auftragsDatum, fristJahre);

    const protokoll = await prisma.protokoll.create({
      data: {
        handwerkerId: handwerker.id,
        whatsappMediaId: mediaId,
        transkript,
        kundeName: daten.kunde.name,
        kundeAdresse: daten.kunde.adresse,
        gewerk: daten.auftrag.gewerk,
        leistungenJson: JSON.stringify(daten.auftrag.leistungen),
        materialJson: JSON.stringify(daten.auftrag.material),
        arbeitszeit: daten.auftrag.arbeitszeit,
        besonderheiten: daten.auftrag.besonderheiten,
        folgetermin: daten.auftrag.folgetermin,
        protokollText: daten.protokoll_text,
        auftragsDatum,
        gewaehrleistung: {
          create: {
            typ: daten.gewaehrleistung.typ,
            beginn: auftragsDatum,
            ablauf,
            vorwarnung: addiereMonate(ablauf, -3),
          },
        },
      },
    });

    // 5. Protokoll-Mail an den Handwerker
    const mail = protokollMail({
      daten,
      transkript,
      protokollId: protokoll.id,
      auftragsDatum,
      gewaehrleistungAblauf: ablauf,
    });
    await sendeMail(handwerker.email, mail.betreff, mail.html);

    // 6. Bestätigung auf WhatsApp
    await sendeWhatsAppText(
      vonNummer,
      `✅ Protokoll für *${daten.kunde.name ?? "deinen Auftrag"}* ist fertig und per E-Mail an ${handwerker.email} unterwegs 📬\n` +
        `Gewährleistung: ${fristJahre} Jahre — ich erinnere dich rechtzeitig vor Ablauf.`,
    );

    console.log(`✅ Protokoll ${protokoll.id} für ${handwerker.firma} erstellt.`);
  } catch (err) {
    console.error("Pipeline-Fehler:", err);
    await sendeWhatsAppText(
      vonNummer,
      "⚠️ Da ist etwas schiefgelaufen — deine Sprachnachricht konnte nicht verarbeitet werden. Bitte versuche es in ein paar Minuten noch einmal.",
    );
    throw err;
  }
}
