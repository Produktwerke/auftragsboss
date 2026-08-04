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
import { dokumentMail, logoAnhang } from "./email/templates.js";
import { sendeMail, WORD_MIME } from "./email/send.js";
import { bearbeitenLink, einstellungenLink, erzeugeToken, kundenLink, werbeLink } from "./web/tokens.js";
import { effektivePreisliste, einstellungenTokenBereit } from "./betrieb/betriebsdaten.js";
import { willFeedback, extrahiereFeedback, FEEDBACK_FENSTER_MINUTEN } from "./feedback.js";
import { werbeCodeBereit, EMPFEHLUNG_AB_ANGEBOT } from "./empfehlung.js";
import { starteTestFuerNeueNummer, testNachrichtBlockiert } from "./direkttest.js";
import { direkttestConfig } from "./config.js";
import {
  MAX_RUNDEN,
  alsDialog,
  ergaenzeNachricht,
  holeNachtragsVorgang,
  holeOffenenVorgang,
} from "./dialog.js";

/** Erkennt, ob eine Nachricht nach den Betriebseinstellungen fragt. Bewusst
 *  tolerant (kein Zauberwort) — deckt die üblichen Formulierungen ab. */
function willEinstellungen(text: string): boolean {
  const t = text.toLowerCase();
  if (t.length > 60) return false; // ein Diktat ist kein Einstellungswunsch
  return /(einstellung|einricht|profil|stammdaten|mein logo|logo (ändern|hochladen| hoch)|(meine |unsere )?adresse ändern|briefkopf)/.test(
    t,
  );
}

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

/**
 * Fortlaufende Nummer pro Betrieb und Dokumentart, z.B. ANG-2026-0007.
 * Zählt nur Erstfassungen — Nachträge behalten ihre Nummer.
 */
async function naechsteNummer(handwerkerId: string, art: string, datum: Date): Promise<string> {
  const jahresBeginn = new Date(datum.getFullYear(), 0, 1);
  const bisher = await prisma.dokument.count({
    where: { handwerkerId, art, version: 1, datum: { gte: jahresBeginn } },
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
  let handwerker = await prisma.handwerker.findUnique({ where: { whatsappNummer: vonNummer } });

  // Unbekannte Nummer: Ist die Test-Funktion an, wird daraus ein automatisches
  // Test-Konto ("Direkt testen" von der Landingpage). Sonst die gewohnte
  // Abweisung (die Ablehnungsnachricht kommt aus starteTestFuerNeueNummer).
  if (!handwerker) {
    const start = await starteTestFuerNeueNummer(prisma, vonNummer);
    if ("ablehnung" in start) {
      await sendeWhatsAppText(vonNummer, start.ablehnung);
      return;
    }
    handwerker = start.handwerker;
  }

  // Test-Konten: vor JEDER Nachricht die Grenzen prüfen (Kostenschutz). Beim
  // ersten Kontakt einmal begrüßen und dann normal weiterverarbeiten — schickt
  // der Interessent gleich einen Auftrag, entsteht sofort ein Beispiel-Angebot.
  if (handwerker.istTest) {
    const blockiert = await testNachrichtBlockiert(prisma, handwerker);
    if (blockiert) {
      await sendeWhatsAppText(vonNummer, blockiert);
      return;
    }
    // handwerker.testNachrichten trägt hier noch den Stand VOR dieser Nachricht:
    // 0 = allererste Nachricht dieser Nummer → einmal begrüßen.
    if (handwerker.testNachrichten === 0) {
      await sendeWhatsAppText(
        vonNummer,
        `🤖 AuftragsBoss ist ein KI-gestützter Dienst. Deine Sprach- oder Textnachricht wird automatisiert verarbeitet, um daraus ein Angebot zu erstellen.\n\n` +
          `👋 Willkommen beim AuftragsBoss-Test!\n\nSprich einfach eine kurze *Sprachnachricht*: Kunde, Adresse und was gemacht werden soll. Ich mache in Sekunden ein fertiges Angebot draus.\n\nDu hast ${direkttestConfig().DIREKTTEST_GRATIS_ANGEBOTE} Gratis-Tests frei. 🎙️`,
      );
      // kein return — die eigentliche Nachricht wird gleich weiterverarbeitet
    }
  }

  // Feedback per WhatsApp. (a) Warten wir schon auf eine Rückmeldung, ist DIESE
  // Nachricht das Feedback. (b) Sonst prüfen, ob eine Feedback-Absicht vorliegt.
  // (Test-Konten bleiben bewusst außen vor — sie sollen nur das Angebot erleben.)
  if (text && !handwerker.istTest) {
    const wartetSeit = handwerker.feedbackWartetSeit;
    const imFenster =
      wartetSeit !== null && Date.now() - wartetSeit.getTime() < FEEDBACK_FENSTER_MINUTEN * 60_000;
    if (imFenster) {
      await prisma.feedback.create({
        data: { handwerkerId: handwerker.id, text: text.trim(), quelle: "WHATSAPP" },
      });
      await prisma.handwerker.update({ where: { id: handwerker.id }, data: { feedbackWartetSeit: null } });
      await sendeWhatsAppText(vonNummer, "🙏 Danke für deine Rückmeldung, ist notiert!");
      return;
    }
    if (willFeedback(text)) {
      const direkt = extrahiereFeedback(text);
      if (direkt.length >= 15) {
        await prisma.feedback.create({
          data: { handwerkerId: handwerker.id, text: direkt, quelle: "WHATSAPP" },
        });
        await sendeWhatsAppText(vonNummer, "🙏 Danke für deine Rückmeldung, ist notiert!");
      } else {
        await prisma.handwerker.update({
          where: { id: handwerker.id },
          data: { feedbackWartetSeit: new Date() },
        });
        await sendeWhatsAppText(
          vonNummer,
          "Gern! 💬 Schreib mir einfach in der nächsten Nachricht, was dir auffällt, fehlt oder gefällt.",
        );
      }
      return;
    }
  }

  // Weg 3: Fragt der Handwerker nach seinen Einstellungen (Logo, Adresse …),
  // schicken wir direkt den persönlichen Link — kein exaktes Stichwort nötig.
  if (text && !handwerker.istTest && willEinstellungen(text)) {
    const token = await einstellungenTokenBereit(prisma, handwerker);
    await sendeWhatsAppText(
      vonNummer,
      `⚙️ Hier stellst du Logo, Adresse und Standardtexte ein und siehst deine bisherigen Angebote:\n${einstellungenLink(token)}`,
    );
    return;
  }

  // Weg 1: Beim allerersten Auftrag begrüßen und einmalig auf die Einrichtung
  // hinweisen — damit Logo und Adresse gleich auf dem ersten Angebot stehen.
  const istErsterAuftrag = (await prisma.dokument.count({ where: { handwerkerId: handwerker.id } })) === 0;
  if (
    !handwerker.istTest &&
    istErsterAuftrag &&
    !(await prisma.vorgang.findFirst({ where: { handwerkerId: handwerker.id } }))
  ) {
    const token = await einstellungenTokenBereit(prisma, handwerker);
    await sendeWhatsAppText(
      vonNummer,
      `🤖 AuftragsBoss ist ein KI-gestützter Dienst. Deine Sprach- oder Textnachricht wird automatisiert verarbeitet, um daraus ein Angebot oder Protokoll zu erstellen.\n\n` +
        `👋 Willkommen bei AuftragsBoss, ${handwerker.name}!\n\nDamit dein Logo und deine Adresse gleich auf dem Angebot stehen, richte einmal deinen Betrieb ein:\n${einstellungenLink(token)}\n\nDanach einfach eine Sprachnachricht mit den Auftragsdetails schicken, ich mache ein fertiges Angebot daraus. 🎙️`,
    );
    // Kein return: Wir verarbeiten die eigentliche Nachricht gleich weiter.
  }

  try {
    // 2. Eingabe zu Text machen. Sprachnachrichten werden von zwei Modellen
    //    transkribiert — sie lassen unterschiedliche Stellen weg (siehe
    //    ai/transcribe.ts); Claude führt die Fassungen später zusammen.
    let inhalt: string;
    let zweitfassung: string | undefined;
    let art: "sprache" | "text";
    if (mediaId) {
      // Sprachnachricht sofort kurz bestätigen — Transkription + KI brauchen ein
      // paar Sekunden; so weiß der Absender, dass im Hintergrund schon gearbeitet
      // wird, und wartet nicht auf eine scheinbar stumme Leitung.
      await sendeWhatsAppText(vonNummer, "🎙️ Hab' ich! Ich erstelle dein Angebot, einen kurzen Moment …");
      const t = await transkribiereAudio(await ladeAudio(mediaId));
      inhalt = t.haupttext;
      zweitfassung = t.varianten[1];
      art = "sprache";
    } else {
      inhalt = (text ?? "").trim();
      art = "text";
    }

    // Laufender Dialog? Sonst prüfen, ob es ein Nachtrag zum eben erstellten
    // Dokument ist ("ach, die Fenster auch noch…").
    let vorgang = await holeOffenenVorgang(prisma, handwerker.id);
    if (!vorgang) vorgang = await holeNachtragsVorgang(prisma, handwerker.id);

    if (inhalt.length < 3) {
      await sendeWhatsAppText(
        vonNummer,
        "🤔 Da war nichts Verständliches dabei. Schick mir die Details bitte noch einmal.",
      );
      return;
    }
    // Ohne laufenden Vorgang ist eine Zwei-Wort-Nachricht kein Auftrag
    if (!vorgang && inhalt.length < 20) {
      await sendeWhatsAppText(
        vonNummer,
        "🎙️ Schick mir eine *Sprachnachricht* mit den Auftragsdetails: Kunde, Adresse, was gemacht werden soll. Ich mache ein fertiges Angebot daraus.",
      );
      return;
    }

    // 3. Vorgang anlegen oder fortführen. Auch ein "mach ich später" gehört in
    //    den Verlauf — die KI liest daraus die Absicht ab.
    if (!vorgang) {
      vorgang = await prisma.vorgang.create({ data: { handwerkerId: handwerker.id } });
    }
    vorgang = await ergaenzeNachricht(prisma, vorgang, {
      rolle: "handwerker",
      text: inhalt,
      art,
      ...(zweitfassung ? { zweitfassung } : {}),
    });

    // 4. Gesamten Verlauf auswerten
    const preisliste = ladePreisliste();
    const dialog = alsDialog(vorgang);
    if (dialog.length === 0) {
      await sendeWhatsAppText(vonNummer, "🎙️ Mir fehlt noch der Auftrag, diktier mir kurz, worum es geht.");
      return;
    }
    const daten = await strukturiereDialog(dialog, preisliste);

    // 5. Nachfragen oder abschließen? Das entscheidet die KI aus dem Verlauf —
    //    kein Stichwort, das der Handwerker kennen müsste. Das Rundenlimit ist
    //    nur ein Sicherheitsnetz gegen Endlosschleifen.
    const nachfragen =
      daten.dialog.aktion === "NACHFRAGEN" &&
      vorgang.runde < MAX_RUNDEN &&
      daten.dialog.nachricht.trim().length > 0;

    if (nachfragen) {
      const frageText = daten.dialog.nachricht.trim();
      await sendeWhatsAppText(vonNummer, frageText);
      // updateMany statt update: Zwischen dem Laden des Vorgangs und hier liegt
      // der (mehrere Sekunden dauernde) KI-Aufruf. Wird der Vorgang in dieser
      // Zeit entfernt (z.B. Test-Konto zurückgesetzt), darf das kein Fehler
      // sein — updateMany trifft dann einfach 0 Zeilen, statt P2025 zu werfen.
      await prisma.vorgang.updateMany({
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
      console.log(`❓ Rückfrage an ${handwerker.firma} (Runde ${vorgang.runde + 1}).`);
      return;
    }

    // 6. Abschließen. Hat der Handwerker etwas vertagt, greift die KI das
    //    kurz auf ("Alles klar, ich schick dir schon mal einen Entwurf…") —
    //    danach folgt die Fertigmeldung des Programms.
    if (daten.dialog.nachricht.trim().length > 0) {
      await sendeWhatsAppText(vonNummer, daten.dialog.nachricht.trim());
    }
    await erstelleDokument({ vorgang, handwerkerId: handwerker.id, vonNummer, daten, preisliste });
  } catch (err) {
    console.error("Pipeline-Fehler:", err);
    await sendeWhatsAppText(
      vonNummer,
      "⚠️ Da ist etwas schiefgelaufen, deine Nachricht konnte nicht verarbeitet werden. Bitte versuche es in ein paar Minuten noch einmal.",
    );
    throw err;
  }
}

// ── Serielle Verarbeitung pro Nummer ──────────────────────────────────
// Der Webhook ruft die Verarbeitung "fire-and-forget" auf. Kämen zwei
// Sprachnachrichten DERSELBEN Nummer dicht hintereinander, liefen sie PARALLEL
// und jede legte einen eigenen Vorgang (= ein eigenes Angebot) an — der Kunde
// bekäme zwei getrennte Angebote, obwohl er nur eins meinte. Deshalb: pro Nummer
// eine Warteschlange. Nachricht 2 wartet, bis Nachricht 1 fertig ist, und wird
// dann korrekt als Nachtrag zum selben Angebot erkannt (siehe holeNachtragsVorgang).
const laufendeVerarbeitung = new Map<string, Promise<unknown>>();

export function verarbeiteNachrichtSeriell(args: {
  vonNummer: string;
  mediaId?: string;
  text?: string;
}): Promise<void> {
  const key = args.vonNummer;
  const vorher = laufendeVerarbeitung.get(key) ?? Promise.resolve();
  const lauf = vorher.catch(() => {}).then(() => verarbeiteNachricht(args));
  laufendeVerarbeitung.set(key, lauf);
  // Aufräumen, sobald diese Nachricht durch ist (Fehler hier ignorieren — der
  // Aufrufer im Webhook behandelt Fehler des zurückgegebenen Promise selbst).
  lauf.catch(() => {}).finally(() => {
    if (laufendeVerarbeitung.get(key) === lauf) laufendeVerarbeitung.delete(key);
  });
  return lauf;
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
  // Betriebsdaten des Handwerkers (Logo, Adresse, Farbe) über die Vorgaben
  // legen — sie erscheinen so auf Word/PDF und in der E-Mail.
  const eff = effektivePreisliste(handwerker, preisliste);
  const datum = new Date();
  const summe = berechneAngebot(daten.positionen, eff, datum);

  // Standardtexte des Betriebs einweben: fehlt ein Anschreiben, nimm die
  // Vorgabe; der feste Schlusstext (z.B. Haftungshinweis) wird angehängt.
  if (!daten.einleitung?.trim() && handwerker.standardEinleitung?.trim()) {
    daten.einleitung = handwerker.standardEinleitung.trim();
  }
  if (handwerker.standardSchlusstext?.trim()) {
    const bestehend = daten.schlusstext?.trim();
    daten.schlusstext = (bestehend ? bestehend + "\n\n" : "") + handwerker.standardSchlusstext.trim();
  }

  // Nachtrag? Dann Nummer behalten und die Fassung hochzählen. Die alte
  // Fassung bleibt im Archiv stehen — nachvollziehbar, was wann galt.
  const vorher = vorgang.dokumentId
    ? await prisma.dokument.findUnique({ where: { id: vorgang.dokumentId } })
    : null;
  const istNachtrag = vorher !== null && vorher.art === daten.art;
  const nummer = istNachtrag ? vorher.nummer : await naechsteNummer(handwerkerId, daten.art, datum);
  const version = istNachtrag ? vorher.version + 1 : 1;

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
      version,
      ersetztId: istNachtrag ? vorher.id : null,
      bearbeitenToken: erzeugeToken(),
      kundenToken: erzeugeToken(),
      transkript,
      kundeName: daten.kunde.name,
      kundeStrasse: daten.kunde.strasse,
      kundePlzOrt: daten.kunde.plzOrt,
      gewerk: daten.gewerk,
      objekt: daten.objekt,
      positionenJson: JSON.stringify(summe.positionen),
      // KI-Original festhalten (unveränderlich) — Basis für die interne
      // Qualitätsauswertung. DATENSPARSAM: nur die Positionen, KEINE direkten
      // Identifikatoren (Kundenname, Anschrift, Anschreiben-Freitexte). So
      // vergleicht die Auswertung nur abstrakte Korrekturen (z.B. 40 m² -> 45 m²).
      kiOriginalJson: JSON.stringify({
        positionen: summe.positionen,
      }),
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
  const word = await erzeugeAngebotWord({ daten, summe, preisliste: eff, nummer, datum });
  const dateiname = wordDateiname(daten.art, nummer, daten.kunde.name);
  const mail = dokumentMail({
    daten,
    summe,
    preisliste: eff,
    transkript,
    nummer,
    datum,
    gewaehrleistungAblauf: istProtokoll ? ablauf : undefined,
    wordDateiname: dateiname,
    version,
    bearbeitenUrl: bearbeitenLink(dokument.bearbeitenToken),
    kundenUrl: kundenLink(dokument.kundenToken),
  });
  // E-Mail NUR, wenn der Betrieb das ausdrücklich will: Haken „auch als E-Mail
  // senden" (gespeichert in mailStandard). Ohne Haken keine ungefragte Mail, der
  // Editor-Link in der WhatsApp-Antwort reicht. Fehlt SMTP oder schlägt der
  // Versand fehl, läuft der Rest trotzdem durch. Test-Konten haben ohnehin weder
  // Adresse noch Haken.
  if (handwerker.email && handwerker.mailStandard) {
    try {
      await sendeMail(handwerker.email, mail.betreff, mail.html, [
        { filename: dateiname, content: word, contentType: WORD_MIME },
        logoAnhang(),
      ]);
    } catch (err) {
      console.warn(
        `⚠️  E-Mail an ${handwerker.email} nicht versendet (${err instanceof Error ? err.message : err}) — WhatsApp-Antwort folgt trotzdem.`,
      );
    }
  }

  // updateMany statt update aus demselben Grund wie oben: Der Vorgang kann
  // während Dokument-Erstellung/E-Mail-Versand entfernt worden sein. Dann soll
  // der Abschluss-Vermerk still ins Leere laufen statt zu scheitern.
  await prisma.vorgang.updateMany({
    where: { id: vorgang.id },
    data: { status: "ABGESCHLOSSEN", dokumentId: dokument.id },
  });

  // Bestätigung auf WhatsApp
  const kunde = daten.kunde.name ?? "deinen Auftrag";
  const bezeichnung = daten.art === "ANGEBOT" ? "Angebot" : "Protokoll";
  const anzahlMaterial = summe.positionen.filter((p) => p.kategorie === "MATERIAL").length;

  const zeilen = [
    istNachtrag
      ? `✅ ${bezeichnung} ${nummer} aktualisiert (Fassung ${version}), ${summe.positionen.length} Positionen`
      : `✅ ${bezeichnung} ${nummer} für *${kunde}* ist fertig`,
    ``,
    `👉 ${bearbeitenLink(dokument.bearbeitenToken)}`,
    `Dort Preise eintragen, Positionen anpassen und an den Kunden schicken.`,
    ``,
    summe.vollstaendig
      ? `Gesamt: ${euro(summe.brutto)} brutto`
      : `✏️ Preise kannst du auch einfach durchsagen, ich rechne und aktualisiere.`,
  ];
  if (!istNachtrag && anzahlMaterial > 0) {
    zeilen.push(`📦 ${anzahlMaterial} Materialposten vorgeschlagen, bitte prüfen`);
  }
  if (istProtokoll) zeilen.push(`Gewährleistung: ${fristJahre} Jahre, ich erinnere dich vor Ablauf.`);

  if (handwerker.istTest) {
    // Test-Interessent: kein Einstellungslink, sondern ein kurzer Hinweis, dass
    // dasselbe mit seinem eigenen Briefkopf entsteht — und dass er alles ändern kann.
    zeilen.push(
      ``,
      `👆 Das war ein Test. Öffne den Link oben: dort kannst du jede Position, Menge und jeden Preis anpassen.`,
      `Als AuftragsBoss-Nutzer hinterlegst du einmal dein Logo, deine Adresse und deine Preise, dann trägt AuftragsBoss sie automatisch in jedes Angebot ein.`,
    );
  } else {
    // Weg 2: Der Zugang zu Einstellungen & Angebotsübersicht steht unauffällig
    // unter jedem Angebot — so ist er immer auffindbar, ohne aufdringlich zu sein.
    const einstToken = await einstellungenTokenBereit(prisma, handwerker);
    zeilen.push(``, `⚙️ Betriebsdaten, Logo & alle Angebote: ${einstellungenLink(einstToken)}`);
  }

  await sendeWhatsAppText(vonNummer, zeilen.join("\n"));

  // Nach dem 3. Angebot einmalig zum Weiterempfehlen einladen (nur Erstfassungen;
  // Test-Konten sind hier ausgenommen).
  if (!handwerker.istTest && !handwerker.empfehlungGenudgt && !istNachtrag) {
    const anzahl = await prisma.dokument.count({ where: { handwerkerId, version: 1 } });
    if (anzahl >= EMPFEHLUNG_AB_ANGEBOT) {
      const code = await werbeCodeBereit(prisma, handwerker);
      await prisma.handwerker.update({ where: { id: handwerkerId }, data: { empfehlungGenudgt: true } });
      await sendeWhatsAppText(
        vonNummer,
        `🎉 Schon ${anzahl} Angebote mit AuftragsBoss! Kennst du Kollegen, die auch ständig Angebote schreiben?\n\n` +
          `Lade sie ein, *ihr bekommt beide 1 Monat gratis*:\n${werbeLink(code)}`,
      );
    }
  }

  console.log(
    `✅ ${daten.art} ${nummer}${version > 1 ? ` (Fassung ${version})` : ""} für ${handwerker.firma} erstellt (${dokument.id}).`,
  );
}
