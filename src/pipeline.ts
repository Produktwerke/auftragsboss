// Die Kern-Pipeline als Dialog:
//
//   Sprachnachricht ──► Transkript ──► KI wertet gesamten Verlauf aus
//                                            │
//                          fehlt Pflichtangabe? ──ja──► Rückfrage per WhatsApp
//                                            │                    (Vorgang bleibt offen)
//                                           nein
//                                            ▼
//                        Word-Datei + E-Mail + Archiv + Gewährleistung
//
// Abgeschlossen wird außerdem bei Stichwort ("weiter", "später"),
// nach MAX_RUNDEN Rückfragen oder bei Zeitablauf (siehe jobs/vorgangTimeout.ts).
import { PrismaClient, type Vorgang } from "@prisma/client";
import { ladeAudio } from "./whatsapp/media.js";
import { sendeWhatsAppText } from "./whatsapp/send.js";
import { transkribiereAudio } from "./ai/transcribe.js";
import { strukturiereDialog } from "./ai/structure.js";
import { berechneAngebot, euro } from "./angebot/berechnung.js";
import { erzeugeAngebotWord, wordDateiname } from "./angebot/word.js";
import { ladePreisliste } from "./preisliste.js";
import { dokumentMail } from "./email/templates.js";
import { sendeMail, WORD_MIME } from "./email/send.js";
import {
  MAX_RUNDEN,
  alsDialog,
  ergaenzeNachricht,
  holeOffenenVorgang,
  istAbschluss,
  rueckfragenText,
} from "./dialog.js";

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
  return `${art === "ANGEBOT" ? "ANG" : "PRO"}-${datum.getFullYear()}-${String(bisher + 1).padStart(4, "0")}`;
}

/**
 * Nimmt eine eingehende Nachricht entgegen (Sprache oder Text) und treibt
 * den Dialog einen Schritt weiter.
 */
export async function verarbeiteNachricht(args: {
  vonNummer: string;
  mediaId?: string; // Sprachnachricht
  text?: string; // Textnachricht
}): Promise<void> {
  const { vonNummer, mediaId, text } = args;

  // 1. Absender kennen wir? (Kein Login — die Nummer IST die Identität)
  const handwerker = await prisma.handwerker.findUnique({ where: { whatsappNummer: vonNummer } });
  if (!handwerker) {
    await sendeWhatsAppText(
      vonNummer,
      "👋 Diese Nummer ist noch nicht registriert. Melde dich beim Angebotsblitz-Team, um deinen Betrieb freizuschalten.",
    );
    return;
  }

  try {
    // 2. Eingabe zu Text machen
    let inhalt: string;
    let art: "sprache" | "text";
    if (mediaId) {
      inhalt = await transkribiereAudio(await ladeAudio(mediaId));
      art = "sprache";
    } else {
      inhalt = (text ?? "").trim();
      art = "text";
    }

    let vorgang = await holeOffenenVorgang(prisma, handwerker.id);
    const willAbschliessen = istAbschluss(inhalt);

    // Zu kurze Nachricht nur abweisen, wenn sie kein Gesprächsbeitrag sein kann
    if (inhalt.length < 3) {
      await sendeWhatsAppText(
        vonNummer,
        "🤔 Da war nichts Verständliches dabei. Schick mir die Details bitte noch einmal.",
      );
      return;
    }
    if (!vorgang && inhalt.length < 20 && !willAbschliessen) {
      await sendeWhatsAppText(
        vonNummer,
        "🎙️ Schick mir eine *Sprachnachricht* mit den Auftragsdetails — Kunde, Adresse, was gemacht werden soll. Ich mache ein fertiges Angebot daraus.",
      );
      return;
    }

    // 3. Vorgang anlegen oder fortführen
    if (!vorgang) {
      vorgang = await prisma.vorgang.create({ data: { handwerkerId: handwerker.id } });
    }
    // "weiter" ist ein Steuerbefehl, kein Inhalt — nicht in den Verlauf aufnehmen
    if (!willAbschliessen) {
      vorgang = await ergaenzeNachricht(prisma, vorgang, { rolle: "handwerker", text: inhalt, art });
    }

    // 4. Gesamten Verlauf auswerten
    const preisliste = ladePreisliste();
    const dialog = alsDialog(vorgang);
    if (dialog.length === 0) {
      await sendeWhatsAppText(vonNummer, "🎙️ Mir fehlt noch der Auftrag — diktier mir kurz, worum es geht.");
      return;
    }
    const daten = await strukturiereDialog(dialog, preisliste);

    // 5. Rückfragen nötig?
    const pflichtFragen = daten.fehlendeInfos.filter((f) => f.wichtigkeit === "PFLICHT");
    const nochRundenFrei = vorgang.runde < MAX_RUNDEN;

    if (pflichtFragen.length > 0 && nochRundenFrei && !willAbschliessen) {
      const frageText = rueckfragenText(
        pflichtFragen.slice(0, 3).map((f) => f.frage),
        vorgang.runde,
        vorgang.runde + 1 >= MAX_RUNDEN,
      );
      await sendeWhatsAppText(vonNummer, frageText);
      await prisma.vorgang.update({
        where: { id: vorgang.id },
        data: {
          runde: vorgang.runde + 1,
          nachrichtenJson: JSON.stringify([
            ...JSON.parse(vorgang.nachrichtenJson),
            { rolle: "assistent", text: frageText, art: "text", zeit: new Date().toISOString() },
          ]),
          letzteAktivitaet: new Date(),
        },
      });
      console.log(`❓ ${pflichtFragen.length} Rückfrage(n) an ${handwerker.firma} (Runde ${vorgang.runde + 1}).`);
      return;
    }

    // 6. Abschließen
    await erstelleDokument({ vorgang, handwerkerId: handwerker.id, vonNummer, daten, preisliste });
  } catch (err) {
    console.error("Pipeline-Fehler:", err);
    await sendeWhatsAppText(
      vonNummer,
      "⚠️ Da ist etwas schiefgelaufen — deine Nachricht konnte nicht verarbeitet werden. Bitte versuche es in ein paar Minuten noch einmal.",
    );
    throw err;
  }
}

/** Erzeugt Word-Datei, E-Mail und Archiv-Eintrag und schließt den Vorgang. */
export async function erstelleDokument(args: {
  vorgang: Vorgang;
  handwerkerId: string;
  vonNummer: string;
  daten: Awaited<ReturnType<typeof strukturiereDialog>>;
  preisliste: ReturnType<typeof ladePreisliste>;
}): Promise<void> {
  const { vorgang, handwerkerId, vonNummer, daten, preisliste } = args;

  const handwerker = await prisma.handwerker.findUniqueOrThrow({ where: { id: handwerkerId } });
  const datum = new Date();
  const summe = berechneAngebot(daten.positionen, preisliste, datum);
  const nummer = await naechsteNummer(handwerkerId, daten.art, datum);

  const istProtokoll = daten.art === "PROTOKOLL" && daten.gewaehrleistung !== null;
  const fristJahre = daten.gewaehrleistung?.typ === "BAUWERK_5_JAHRE" ? 5 : 2;
  const ablauf = addiereJahre(datum, fristJahre);

  // Vollständiges Diktat aus allen Handwerker-Nachrichten (Beweissicherung)
  const transkript = alsDialog(vorgang)
    .filter((n) => n.rolle === "handwerker")
    .map((n) => n.text)
    .join("\n\n");

  const dokument = await prisma.dokument.create({
    data: {
      handwerkerId,
      art: daten.art,
      nummer,
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

  // Word-Datei + E-Mail
  const word = await erzeugeAngebotWord({ daten, summe, preisliste, nummer, datum });
  const dateiname = wordDateiname(daten.art, nummer, daten.kunde.name);
  const mail = dokumentMail({
    daten,
    summe,
    preisliste,
    transkript,
    nummer,
    datum,
    gewaehrleistungAblauf: istProtokoll ? ablauf : undefined,
    wordDateiname: dateiname,
  });
  await sendeMail(handwerker.email, mail.betreff, mail.html, [
    { filename: dateiname, content: word, contentType: WORD_MIME },
  ]);

  await prisma.vorgang.update({
    where: { id: vorgang.id },
    data: { status: "ABGESCHLOSSEN", dokumentId: dokument.id },
  });

  // Bestätigung auf WhatsApp
  const kunde = daten.kunde.name ?? "deinen Auftrag";
  const anzahlMaterial = summe.positionen.filter((p) => p.kategorie === "MATERIAL").length;
  const zeilen = [
    `✅ ${daten.art === "ANGEBOT" ? "Angebot" : "Protokoll"} ${nummer} für *${kunde}* ist fertig`,
    `📎 Word-Datei per E-Mail an ${handwerker.email}`,
    summe.vollstaendig
      ? `Gesamt: ${euro(summe.brutto)} brutto`
      : `✏️ Preise trägst du in der Word-Datei ein`,
  ];
  if (anzahlMaterial > 0) zeilen.push(`📦 ${anzahlMaterial} Materialposten vorgeschlagen — bitte prüfen`);
  if (istProtokoll) zeilen.push(`Gewährleistung: ${fristJahre} Jahre — ich erinnere dich vor Ablauf.`);

  await sendeWhatsAppText(vonNummer, zeilen.join("\n"));
  console.log(`✅ ${daten.art} ${nummer} für ${handwerker.firma} erstellt (${dokument.id}).`);
}
