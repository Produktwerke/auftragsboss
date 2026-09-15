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
// Seit 13.09.2026: Jede Eingabe (Sprache, Text, Foto) plant nach kurzer Pause
// EINE Auswertung; Ergebnis ist sofort ein Angebot (oder eine neue Fassung),
// Rückfragen nur bei Pflichtangaben. Abgeschlossen wird außerdem nach
// MAX_RUNDEN Rückfragen oder bei Zeitablauf (siehe jobs/vorgangTimeout.ts).
import { PrismaClient, type Handwerker, type Vorgang } from "@prisma/client";
import { ladeAudio, ladeBild, MediumZuGross, BILD_MAX_BYTES, AUDIO_MAX_BYTES } from "./whatsapp/media.js";
import { erkenneBildTyp } from "./betrieb/bildpruefung.js";
import { sendeWhatsAppText, sendeWhatsAppKnoepfe } from "./whatsapp/send.js";
import { transkribiereAudio } from "./ai/transcribe.js";
import { liesBildNotiz } from "./ai/bildLesen.js";
import { analysiereWandfoto, bereinigeAnalyse, fotoAlsDialogText, fotoHinweiseKurz, fotoNachfassHinweis, type WandfotoAnalyse } from "./ai/wandfoto.js";
import { floskel } from "./whatsapp/floskeln.js";
import { eingabeStandVon, istUeberholt, merkeEingabe } from "./eingabestand.js";
import { meldeStoerung, meldeEntwarnung } from "./betrieb/betreiberAlarm.js";
import { KUNDEN_SATZ, MALER_AUFGEGEBEN, MALER_HINWEIS_AB_VERSUCH, MALER_ZWISCHENSTAND, naechsteWiederholungMinuten, standText } from "./selbstheilung.js";
import {
  ANGEBOTS_KNOEPFE,
  ANTWORT_KEIN_ANGEBOT,
  ANTWORT_KORRIGIEREN,
  ANTWORT_RAUM_WEITER,
  KNOPF_KORRIGIEREN,
  KNOPF_RAUM_WEITER,
  RUECKFRAGE_ZUSATZ,
  baueFertigmeldung,
  kurzeBilanz,
} from "./angebot/fertigmeldung.js";
import { speichereFoto } from "./betrieb/fotoAblage.js";
import { ladeAufmassAnlage } from "./angebot/aufmassblatt.js";
import { ordneFotoZu } from "./maler/fotoZuordnung.js";
import { strukturiereDialog } from "./ai/structure.js";
import { berechneAngebot, euro } from "./angebot/berechnung.js";
import { erzeugeAngebotWord, wordDateiname } from "./angebot/word.js";
import { ladePreisliste } from "./preisliste.js";
import { dokumentMail, logoAnhang } from "./email/templates.js";
import { sendeMail, WORD_MIME } from "./email/send.js";
import { bearbeitenLink, einstellungenLink, registrierLink, erzeugeToken, erzeugeKurzToken, kundenLink, werbeLink } from "./web/tokens.js";
import { effektivePreisliste, einstellungenTokenBereit } from "./betrieb/betriebsdaten.js";
import { willFeedback, extrahiereFeedback, FEEDBACK_FENSTER_MINUTEN } from "./feedback.js";
import { werbeCodeBereit, EMPFEHLUNG_AB_ANGEBOT } from "./empfehlung.js";
import { starteTestFuerNeueNummer, testNachrichtBlockiert } from "./direkttest.js";
import { verarbeiteOnboardingKnopf, markiereLeadAktiv } from "./lead/onboarding.js";
import { direkttestConfig, featureConfig } from "./config.js";
import { validierePositionen } from "./validierung/validator.js";
import { aufmassText, berechneAufmass, parseRaeumeText, wendeAufmassAn } from "./maler/aufmass.js";
import { schlagePreiseVor } from "./betrieb/preisgedaechtnis.js";
import { spurEvent } from "./analytics/event.js";
import { schaetzeAudioSekunden, kostenAudioCent, kostenClaudeCent } from "./analytics/kikosten.js";
import { MAX_RUNDEN, alsDialog, ergaenzeNachricht, holeNachtragsVorgang, holeOffenenVorgang, nachrichtenLesen } from "./dialog.js";

/** Erkennt, ob eine Nachricht nach den Betriebseinstellungen fragt. Bewusst
 *  tolerant (kein Zauberwort) — deckt die üblichen Formulierungen ab. */
function willEinstellungen(text: string): boolean {
  const t = text.toLowerCase();
  if (t.length > 60) return false; // ein Diktat ist kein Einstellungswunsch
  return /(einstellung|einricht|profil|stammdaten|mein logo|logo (ändern|hochladen| hoch)|(meine |unsere )?adresse ändern|briefkopf)/.test(
    t,
  );
}

/** Erkennt den Wunsch, sich als Betrieb anzumelden (Selbst-Registrierung).
 *  Tolerant, aber kurz — ein Diktat ist keine Anmeldung. */
function willAnmelden(text: string): boolean {
  const t = text.toLowerCase();
  if (t.length > 40) return false;
  return /\b(anmelden|registrieren|registrier|mein konto|eigenes konto|richtig nutzen|betrieb anlegen)\b/.test(t);
}

export const prisma = new PrismaClient();

// Feedback-Nudge & -Erfassung: Nachrichten bis zu dieser Länge gelten als
// kurze Rückmeldung; alles Längere ist ein Diktat (Auftrag) und wird NIE als
// Feedback „verschluckt". Nudge kommt einmalig nach dem 2. Angebot.
const FEEDBACK_MAX_LEN = 400;
const FEEDBACK_NUDGE_AB_ANGEBOT = 2;

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
  // HÖCHSTE vergebene Nummer + 1 — NICHT Anzahl + 1: Nach dem Löschen eines
  // Angebots würde count()+1 eine schon vergebene Nummer erneut ausgeben
  // (doppelte Angebotsnummern = Buchhaltungsproblem, Audit AB-M03).
  // Zero-Padding macht die String-Sortierung zur Zahlensortierung.
  const praefix = `${art === "ANGEBOT" ? "ANG" : "PRO"}-${datum.getFullYear()}-`;
  const letztes = await prisma.dokument.findFirst({
    where: { handwerkerId, art, version: 1, nummer: { startsWith: praefix } },
    orderBy: { nummer: "desc" },
    select: { nummer: true },
  });
  const bisher = letztes ? parseInt(letztes.nummer.slice(praefix.length), 10) : 0;
  return `${praefix}${String((Number.isFinite(bisher) ? bisher : 0) + 1).padStart(4, "0")}`;
}

/**
 * Nimmt eine eingehende Nachricht entgegen (Sprache oder Text) und treibt
 * den Dialog einen Schritt weiter.
 */
export async function verarbeiteNachricht(args: {
  vonNummer: string;
  mediaId?: string; // Sprachnachricht
  bildMediaId?: string; // Foto/Screenshot (Wandfoto, Aufmaß-Zettel, Handy-Notiz)
  bildText?: string; // Bildunterschrift (z.B. "Wohnzimmer Wand 2")
  text?: string; // Textnachricht
  knopfPayload?: string; // Klick auf einen Antwort-Knopf (Lead-Onboarding)
  unbekannterTyp?: string; // Nachrichtentyp, den wir nicht lesen (Video, PDF, Sticker …)
}): Promise<void> {
  const { vonNummer, mediaId, bildMediaId, bildText, text, knopfPayload, unbekannterTyp } = args;
  const kanal = mediaId ? "sprache" : bildMediaId ? "foto" : knopfPayload ? "knopf" : "text";

  // 1. Absender kennen wir? (Kein Login — die Nummer IST die Identität)
  let handwerker = await prisma.handwerker.findUnique({ where: { whatsappNummer: vonNummer } });

  // Knopf-Klick von einer unbekannten Nummer: kann regulär nicht vorkommen
  // (Knöpfe bekommen nur angelegte Leads) — still ignorieren, KEIN Test-Konto
  // anlegen und keine Verarbeitung anstoßen.
  if (!handwerker && knopfPayload) return;

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

  // Blockierte Konten (Betreiber-Cockpit): freundlicher Hinweis, sonst nichts —
  // keine Transkription, keine KI, kein Kontingent-Verbrauch.
  if (handwerker.blockiert) {
    await spurEvent(prisma, "NACHRICHT_BLOCKIERT", { handwerkerId: handwerker.id, data: { kanal } });
    await sendeWhatsAppText(
      vonNummer,
      "⏸️ Dein AuftragsBoss-Konto ist gerade pausiert. Melde dich bitte kurz bei uns, dann klären wir das: kontakt@auftragsboss.de",
    );
    return;
  }

  // Unlesbarer Nachrichtentyp: kurz sagen, was geht — statt stiller Leitung.
  if (unbekannterTyp) {
    await sendeWhatsAppText(
      vonNummer,
      "🤔 Das Format kann ich nicht lesen. Schick mir bitte eine Sprachnachricht, einen Text oder ein Foto (als Bild, nicht als Video).",
    );
    return;
  }

  // Lead-Onboarding: Klick auf einen Antwort-Knopf (Telefon-Akquise) — kurze,
  // feste Antworten ohne KI, ohne Kontingent-Verbrauch. Danach fertig.
  // Knöpfe unter der Fertigmeldung (13.09.2026): kein KI-Aufruf, nur eine kurze
  // Ansage, und der Vorgang wird für die nächste Eingabe wieder geöffnet.
  if (knopfPayload === KNOPF_RAUM_WEITER || knopfPayload === KNOPF_KORRIGIEREN) {
    await verarbeiteAngebotsKnopf(handwerker, vonNummer, knopfPayload);
    return;
  }
  if (knopfPayload) {
    await verarbeiteOnboardingKnopf(prisma, handwerker, knopfPayload);
    return;
  }
  // Erste echte Eingabe eines eingeladenen Leads (auch ohne Knopfdruck):
  // Onboarding als erledigt markieren, dann ganz normal weiterverarbeiten.
  if (handwerker.onboardingStatus && handwerker.onboardingStatus !== "AKTIV") {
    await markiereLeadAktiv(prisma, handwerker);
  }

  // Produktmetrik (PII-frei): eingehende Nachricht + Kanal (Sprache/Text/Foto).
  // Erlaubt später Auswertungen wie „2./3. Nachricht?", „Sprache vs. Text".
  await spurEvent(prisma, "NACHRICHT_EMPFANGEN", {
    handwerkerId: handwerker.id,
    data: { kanal, istTest: handwerker.istTest },
  });

  // Test-Konten: vor JEDER Nachricht die Grenzen prüfen (Kostenschutz). Beim
  // ersten Kontakt einmal begrüßen und dann normal weiterverarbeiten — schickt
  // der Interessent gleich einen Auftrag, entsteht sofort ein Beispiel-Angebot.
  if (handwerker.istTest) {
    // Selbst-Anmeldung: Schreibt ein Test-Konto „anmelden", schicken wir den
    // persönlichen Registrier-Link — verbraucht bewusst KEIN Test-Kontingent.
    if (text && featureConfig().FEATURE_SELBSTREGISTRIERUNG && willAnmelden(text)) {
      const token = await einstellungenTokenBereit(prisma, handwerker);
      await sendeWhatsAppText(
        vonNummer,
        `👍 Stark! Hier meldest du deinen Betrieb an (Firma, Name, E-Mail). Danach gehören dir Logo, Adresse und alle Angebote:\n${registrierLink(token)}`,
      );
      return;
    }

    const blockiert = await testNachrichtBlockiert(prisma, handwerker);
    if (blockiert) {
      await sendeWhatsAppText(vonNummer, blockiert);
      return;
    }
    // handwerker.testNachrichten trägt hier noch den Stand VOR dieser Nachricht:
    // 0 = allererste Nachricht dieser Nummer → einmal begrüßen. Telefon-Leads
    // NICHT: die wurden per Einladung schon begrüßt (KI-Hinweis steht dort in
    // der Vorlagen-Fußzeile), eine zweite Begrüßung wäre verwirrend.
    if (handwerker.testNachrichten === 0 && !handwerker.leadQuelle) {
      const anmeldeHinweis = featureConfig().FEATURE_SELBSTREGISTRIERUNG
        ? `\n\nWillst du AuftragsBoss richtig nutzen? Schreib einfach *anmelden*.`
        : "";
      await sendeWhatsAppText(
        vonNummer,
        `🤖 AuftragsBoss ist ein KI-gestützter Dienst. Deine Sprach- oder Textnachricht wird automatisiert verarbeitet, um daraus ein Angebot zu erstellen.\n\n` +
          `👋 Willkommen beim AuftragsBoss-Test!\n\nSprich einfach eine kurze *Sprachnachricht*: Kunde, Adresse und was gemacht werden soll. Ich mache in Sekunden ein fertiges Angebot draus.\n\nDu kannst AuftragsBoss ${direkttestConfig().DIREKTTEST_TAGE} Tage kostenlos testen. 🎙️` +
          anmeldeHinweis,
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
      if (text.trim().length <= FEEDBACK_MAX_LEN) {
        await prisma.feedback.create({
          data: { handwerkerId: handwerker.id, text: text.trim(), quelle: "WHATSAPP" },
        });
        await prisma.handwerker.update({ where: { id: handwerker.id }, data: { feedbackWartetSeit: null } });
        await sendeWhatsAppText(vonNummer, "🙏 Danke für deine Rückmeldung, ist notiert!");
        await spurEvent(prisma, "FEEDBACK_ERHALTEN", {
          handwerkerId: handwerker.id,
          data: { kanal: "text", laenge: text.trim().length },
        });
        return;
      }
      // Langer Text trotz offenem Feedback-Fenster = ein Auftrag, kein Feedback:
      // Fenster schließen und normal weiterverarbeiten (nichts „verschlucken").
      await prisma.handwerker.update({ where: { id: handwerker.id }, data: { feedbackWartetSeit: null } });
      handwerker.feedbackWartetSeit = null;
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
    // Läuft schon ein Dialog (offene Rückfrage/Zusammenfassung)? Dann ist diese
    // Nachricht eine Antwort darin, keine neue Bestellung — die Eingangsbestätigung
    // fällt dann neutraler aus ("arbeite weiter" statt "erstelle dein Angebot").
    // Den Vorgang laden wir hier einmal und nutzen ihn unten weiter.
    let vorgang = await holeOffenenVorgang(prisma, handwerker.id);
    const imDialog = !!vorgang;
    if (mediaId) {
      // Sprachnachricht sofort kurz bestätigen — Transkription + KI brauchen ein
      // paar Sekunden; so weiß der Absender, dass im Hintergrund schon gearbeitet
      // wird, und wartet nicht auf eine scheinbar stumme Leitung.
      // Wechselnde Formulierungen (Live-Test 11.09.: nicht jede Antwort mit
      // „Hab ich!"). Bewusst neutral, nicht „erstelle dein Angebot": was die
      // Nachricht ist, weiß erst die KI.
      await sendeWhatsAppText(vonNummer, floskel(imDialog ? "spracheDialog" : "spracheNeu", vonNummer));
      let audio: Buffer;
      try {
        audio = await ladeAudio(mediaId);
      } catch (err) {
        if (!(err instanceof MediumZuGross)) throw err;
        await sendeWhatsAppText(vonNummer, `⚠️ Die Sprachnachricht ist zu groß (mehr als ${Math.round(AUDIO_MAX_BYTES / 1024 / 1024)} MB). Bitte in zwei kürzeren Nachrichten schicken.`);
        return;
      }
      const t = await transkribiereAudio(audio);
      inhalt = t.haupttext;
      zweitfassung = t.varianten[1];
      art = "sprache";
      // Kosten-Tracking: Audiodauer aus der Dateigröße geschätzt (Opus ~16 kbit/s).
      const sekunden = schaetzeAudioSekunden(audio.length);
      await spurEvent(prisma, "KI_AUFRUF", {
        handwerkerId: handwerker.id,
        data: { dienst: "transkription", sekunden, kostenCent: kostenAudioCent(sekunden) },
      });
    } else if (bildMediaId) {
      // Foto: entweder ein WANDFOTO fürs Aufmaß (Teiletappe 2) oder wie bisher
      // ein Notizzettel/Screenshot. EIN Vision-Aufruf entscheidet und liefert
      // bei Notizen gleich den Text mit.
      // Eingangsbestätigung nur einmal je Foto-Schwung (13.09.2026: nicht für
      // jedes einzelne Foto eine Nachricht).
      if (fotoBestaetigungFaellig(vonNummer)) await sendeWhatsAppText(vonNummer, floskel("foto", vonNummer));
      // Größe und Format werden VOR dem KI-Aufruf geprüft (F-03/F-04): der
      // Download ist gekappt, und nur was laut Magic Bytes wirklich ein
      // JPEG/PNG/WebP/GIF ist, geht an die Vision und in die Ablage.
      let bild: { daten: Buffer; mimeType: string };
      try {
        const geladen = await ladeBild(bildMediaId);
        const typ = erkenneBildTyp(geladen.daten);
        if (!typ) {
          await sendeWhatsAppText(vonNummer, "⚠️ Das Bild konnte ich nicht lesen. Bitte als normales Foto (JPG oder PNG) schicken.");
          return;
        }
        bild = { daten: geladen.daten, mimeType: typ };
      } catch (err) {
        if (!(err instanceof MediumZuGross)) throw err;
        await sendeWhatsAppText(vonNummer, `⚠️ Das Bild ist zu groß (mehr als ${Math.round(BILD_MAX_BYTES / 1024 / 1024)} MB). Bitte als normales Foto schicken, nicht als Datei in Originalgröße.`);
        return;
      }
      // Für die Raumzuordnung zählt auch ein eben abgeschlossener Vorgang (Nachtrag):
      // sonst fehlen Raumname und Raumhöhe beim ersten nachgereichten Foto.
      if (!vorgang) vorgang = await holeNachtragsVorgang(prisma, handwerker.id);
      const zuordnung = ordneFotoZu(vorgang, bildText);
      const analyse = bereinigeAnalyse(await analysiereWandfoto(
        bild,
        { raumhoeheM: zuordnung.raumhoeheM, raumName: zuordnung.raumName },
        (ein, aus) => {
          void spurEvent(prisma, "KI_AUFRUF", {
            handwerkerId: handwerker.id,
            data: { dienst: "wandfoto", tokensEin: ein, tokensAus: aus, kostenCent: kostenClaudeCent(ein, aus) },
          });
        },
      ));
      if (analyse.istWandfoto) {
        await verarbeiteWandfoto({ handwerker, vorgang, vonNummer, bild, analyse, bildText, zuordnung });
        return;
      }
      inhalt = analyse.notizText?.trim() ?? "";
      if (!inhalt) {
        // Rückfall: klassisches Notiz-Lesen (zweiter Aufruf, selten)
        inhalt = await liesBildNotiz(bild, (ein, aus) => {
          void spurEvent(prisma, "KI_AUFRUF", {
            handwerkerId: handwerker.id,
            data: { dienst: "bild", tokensEin: ein, tokensAus: aus, kostenCent: kostenClaudeCent(ein, aus) },
          });
        });
      }
      art = "text";
    } else {
      inhalt = (text ?? "").trim();
      art = "text";
    }

    // Kein offener Dialog? Dann prüfen, ob es ein Nachtrag zum eben erstellten
    // Dokument ist ("ach, die Fenster auch noch…"). Den offenen Vorgang haben wir
    // oben für die Eingangsbestätigung schon geladen.
    if (!vorgang) vorgang = await holeNachtragsVorgang(prisma, handwerker.id);

    // Proaktiver Feedback-Reply per Sprache/Foto: Warten wir nach dem Nudge auf
    // Feedback, ist kein Dialog offen und die Nachricht KURZ (kein Diktat), als
    // Feedback erfassen. (Text ist oben schon behandelt.) Langes Diktat oder
    // abgelaufenes Fenster → Fenster schließen und normal als Auftrag weiter.
    if (!handwerker.istTest && !text && !vorgang && handwerker.feedbackWartetSeit) {
      const aktiv =
        Date.now() - handwerker.feedbackWartetSeit.getTime() < FEEDBACK_FENSTER_MINUTEN * 60_000;
      if (aktiv && inhalt.trim().length <= FEEDBACK_MAX_LEN) {
        await prisma.feedback.create({
          data: { handwerkerId: handwerker.id, text: inhalt.trim(), quelle: "WHATSAPP" },
        });
        await prisma.handwerker.update({ where: { id: handwerker.id }, data: { feedbackWartetSeit: null } });
        await sendeWhatsAppText(vonNummer, "🙏 Danke für deine Rückmeldung, ist notiert!");
        await spurEvent(prisma, "FEEDBACK_ERHALTEN", {
          handwerkerId: handwerker.id,
          data: { kanal, laenge: inhalt.trim().length },
        });
        return;
      }
      await prisma.handwerker.update({ where: { id: handwerker.id }, data: { feedbackWartetSeit: null } });
      handwerker.feedbackWartetSeit = null;
    }

    // Kürze-Sperre NUR ohne laufenden Vorgang: Bei einer offenen Rückfrage oder
    // Zusammenfassung ist ein kurzes "ja" (oder "ok") eine gültige Antwort und
    // darf nicht als "nichts Verständliches" abgewiesen werden.
    if (!vorgang && inhalt.length < 3) {
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
    // Textnachricht kurz bestätigen (Sprache und Foto sind oben schon bestätigt).
    if (!mediaId && !bildMediaId) await sendeWhatsAppText(vonNummer, floskel("text", vonNummer));
    vorgang = await ergaenzeNachricht(prisma, vorgang, {
      rolle: "handwerker",
      text: inhalt,
      art,
      ...(zweitfassung ? { zweitfassung } : {}),
    });

    // Nicht sofort auswerten: kurze Pause, in der weitere Eingaben (Fotos, zweite
    // Sprachnachricht) dazukommen können. Dann EINE Auswertung, EIN Angebot.
    planeAuswertung(vonNummer, handwerker.id, vorgang.id, EINGABE_PAUSE_MS);
  } catch (err) {
    console.error("Pipeline-Fehler:", err);
    await sendeWhatsAppText(
      vonNummer,
      "⚠️ Da ist etwas schiefgelaufen, deine Nachricht konnte nicht verarbeitet werden. Bitte versuche es in ein paar Minuten noch einmal.",
    );
    // Hier ist die Eingabe noch nicht im Vorgang (Transkription, Bilddownload …):
    // der Maler muss sie erneut schicken, der Betreiber erfährt es sofort.
    await meldeStoerung({
      schluessel: `nachricht:${handwerker.id}`,
      was: `Nachricht konnte nicht verarbeitet werden (${handwerker.firma || "Test-Konto"}, ${kanal})`,
      stand: "Der Maler wurde gebeten, die Nachricht in ein paar Minuten noch einmal zu schicken. Keine automatische Wiederholung möglich, die Eingabe kam nicht bis zum Vorgang.",
      details: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      kundenSatz: KUNDEN_SATZ,
    });
    throw err;
  }
}

// ── Selbstheilung (13.09.2026) ────────────────────────────────────────

/**
 * Auswertung eines Vorgangs ausführen und Fehler SELBST behandeln: Erfolg nach
 * Fehlversuchen löst eine Entwarnung aus, ein Fehler plant die Wiederholung
 * (src/selbstheilung.ts) und alarmiert den Betreiber. Wirft nie. Wird von der
 * geplanten Auswertung und vom Timeout-Job genutzt.
 */
export async function fuehreAuswertungAus(args: {
  handwerker: Handwerker;
  vorgang: Vorgang;
  vonNummer: string;
  erzwungen?: boolean;
}): Promise<void> {
  const { handwerker, vorgang, vonNummer, erzwungen = false } = args;
  const schluessel = `auswertung:${vorgang.id}`;
  const firma = handwerker.firma || "Test-Konto";
  try {
    await werteVorgangAus({ handwerker, vorgang, vonNummer, erzwungen });
    if (vorgang.fehlversuche > 0) {
      await prisma.vorgang.updateMany({ where: { id: vorgang.id }, data: { fehlversuche: 0, naechsterVersuch: null } });
      await meldeEntwarnung({
        schluessel,
        was: `Angebot ist raus (${firma})`,
        stand: `Nach ${vorgang.fehlversuche} Fehlversuch${vorgang.fehlversuche === 1 ? "" : "en"} geklappt. Nichts zu tun.`,
      });
    }
  } catch (err) {
    const fehlversuche = vorgang.fehlversuche + 1;
    const naechste = naechsteWiederholungMinuten(fehlversuche);
    console.error(`Auswertung fehlgeschlagen (${firma}, Versuch ${fehlversuche}):`, err);
    if (naechste === null) {
      // Aufgeben: Vorgang schließen, der Maler schickt später neu.
      await prisma.vorgang.updateMany({ where: { id: vorgang.id }, data: { status: "ABGESCHLOSSEN", fehlversuche, naechsterVersuch: null } });
      await sendeWhatsAppText(vonNummer, MALER_AUFGEGEBEN).catch(() => {});
    } else {
      await prisma.vorgang.updateMany({
        where: { id: vorgang.id },
        data: { fehlversuche, naechsterVersuch: new Date(Date.now() + naechste * 60_000) },
      });
      if (fehlversuche === MALER_HINWEIS_AB_VERSUCH) await sendeWhatsAppText(vonNummer, MALER_ZWISCHENSTAND).catch(() => {});
    }
    await meldeStoerung({
      schluessel,
      was: `Angebot konnte nicht erstellt werden (${firma})`,
      stand: standText(fehlversuche),
      details: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      kundenSatz: KUNDEN_SATZ,
    });
  }
}


/**
 * Auswertung des gesamten Verlaufs: nachfragen oder das Dokument erstellen.
 * Wird von der geplanten Auswertung (nach jeder Eingabe) und vom Timeout-Job
 * genutzt. Seit 13.09.2026 ohne Zusammenfassung, Raumbilanz und „fertig"-Schritt:
 * jede Ruhephase erzeugt sofort ein Angebot bzw. eine neue Fassung (Dirk: lieber
 * schnell ein Angebot und dann korrigieren, als lange mit WhatsApp interagieren).
 */
export async function werteVorgangAus(args: {
  handwerker: Handwerker;
  vorgang: Vorgang;
  vonNummer: string;
  /** true = Zeitablauf: keine Rückfrage, Angebot mit dem, was da ist. */
  erzwungen?: boolean;
}): Promise<void> {
  const { handwerker, vorgang, vonNummer, erzwungen = false } = args;
  // Stand der Eingaben beim Start: kommt während des KI-Aufrufs eine weitere
  // Eingabe, ist diese Auswertung überholt (die neue hat eine neue geplant).
  const standBeiStart = eingabeStandVon(vonNummer);
  const preisliste = ladePreisliste();
  const dialog = alsDialog(vorgang);
  if (dialog.length === 0) {
    await sendeWhatsAppText(vonNummer, "🎙️ Mir fehlt noch der Auftrag, diktier mir kurz, worum es geht.");
    return;
  }
  const daten = await strukturiereDialog(dialog, preisliste, (ein, aus, cache) => {
    void spurEvent(prisma, "KI_AUFRUF", {
      handwerkerId: handwerker.id,
      data: {
        dienst: "struktur",
        tokensEin: ein,
        tokensAus: aus,
        cacheGelesen: cache?.gelesen ?? 0,
        cacheGeschrieben: cache?.geschrieben ?? 0,
        kostenCent: kostenClaudeCent(ein, aus, cache),
      },
    });
  });
  if (istUeberholt(vonNummer, standBeiStart)) {
    console.log(`⏩ Auswertung überholt, neue Eingabe wartet (${handwerker.firma}).`);
    await spurEvent(prisma, "AUSWERTUNG_UEBERHOLT", { handwerkerId: handwerker.id });
    return;
  }

  // Aufmaß aus Raummaßen: Die KI hat nur Zahlen ausgelesen, gerechnet wird
  // hier (VOB: Öffnungen bis 2,5 m² übermessen, größere abgezogen). Auffälliges
  // (verworfene Öffnungen, unplausible Maße, Grauzone) wandert als Warnhinweis
  // in die Fertigmeldung statt in eine Rückfrage.
  await prisma.vorgang.updateMany({ where: { id: vorgang.id }, data: { raeumeText: daten.raeumeText ?? null } });
  const aufmass = berechneAufmass(parseRaeumeText(daten.raeumeText));
  const hinweise: string[] = [];
  if (aufmass.raeume.length > 0 || aufmass.uebersprungen.length > 0) {
    daten.positionen = wendeAufmassAn(daten.positionen, aufmass);
    // Kundenanlage = nur der gerechnete Aufmaßtext. Der KI-Freitext („aus den Wandfotos …,
    // Hochbett, Aufkleber …") ist Handwerker-Information und wandert in die E-Mail-Notizen (15.09.2026).
    const kiNotiz = daten.aufmassNotizen?.trim();
    if (kiNotiz) daten.rueckfragen = [...daten.rueckfragen, `Aufmaß-Notiz aus dem Diktat: ${kiNotiz}`];
    daten.aufmassNotizen = aufmassText(aufmass);
    daten.rueckfragen = [...daten.rueckfragen, ...aufmass.rueckfragen];
    hinweise.push(...aufmassHinweise(aufmass));
    console.log(`📐 Aufmaß: ${aufmass.raeume.length} Raum/Räume berechnet, ${aufmass.uebersprungen.length} übersprungen (${handwerker.firma}).`);
  }

  // Nachfragen oder abschließen? Das entscheidet die KI aus dem Verlauf (nur
  // Pflichtangaben, kein Stichwort, das der Handwerker kennen müsste). Das
  // Rundenlimit ist ein Sicherheitsnetz gegen Schleifen; je Fassung zählt es
  // neu (holeNachtragsVorgang setzt runde zurück).
  const nachfragen =
    !erzwungen &&
    daten.dialog.aktion === "NACHFRAGEN" &&
    vorgang.runde < MAX_RUNDEN &&
    daten.dialog.nachricht.trim().length > 0;

  if (nachfragen) {
    const frageText = daten.dialog.nachricht.trim();
    // Mit dem Zusatz, dass nichts jetzt beantwortet werden muss (Dirk, 13.09.2026).
    await sendeWhatsAppText(vonNummer, `${frageText}\n\n${RUECKFRAGE_ZUSATZ}`);
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
    await spurEvent(prisma, "RUECKFRAGE", { handwerkerId: handwerker.id, data: { runde: vorgang.runde + 1 } });
    return;
  }

  // Abschließen. Hat der Handwerker etwas vertagt, greift die KI das kurz auf
  // ("Alles klar, ich schick dir schon mal einen Entwurf…"), danach folgt die
  // Fertigmeldung des Programms.
  if (daten.dialog.nachricht.trim().length > 0) {
    await sendeWhatsAppText(vonNummer, daten.dialog.nachricht.trim());
  }
  await erstelleDokument({ vorgang, handwerkerId: handwerker.id, vonNummer, daten, preisliste, hinweise });
}

/** Warnhinweise aus dem Aufmaß für die Fertigmeldung (kurz, mit Symbol). */
function aufmassHinweise(aufmass: ReturnType<typeof berechneAufmass>): string[] {
  const z2 = (x: number) => x.toFixed(2).replace(".", ",");
  const zeilen: string[] = [];
  for (const r of aufmass.raeume) {
    for (const v of r.verworfen) zeilen.push(`⚠️ ${r.name}: ${v}, nicht abgezogen. Bitte Maß prüfen.`);
    for (const w of r.warnungen) zeilen.push(`⚠️ ${r.name}: ${w}.`);
    for (const o of r.oeffnungen) {
      if (o.grauzone) zeilen.push(`⚠️ ${r.name}: ${o.art} ${z2(o.breiteM)} x ${z2(o.hoeheM)} m liegt nahe der 2,5-m²-Grenze, bitte nachmessen.`);
    }
  }
  for (const u of aufmass.uebersprungen) zeilen.push(`⚠️ ${u.name}: nicht berechnet (${u.grund}).`);
  return zeilen;
}

// ── Knöpfe unter der Fertigmeldung ───────────────────────────────────

/**
 * „Nächster Raum" / „Angebot korrigieren": kein KI-Aufruf, nur eine kurze
 * Ansage. Der eben abgeschlossene Vorgang wird wieder geöffnet, damit die
 * nächste Eingabe sicher als neue Fassung DESSELBEN Angebots landet.
 */
async function verarbeiteAngebotsKnopf(handwerker: Handwerker, vonNummer: string, knopf: string): Promise<void> {
  const vorgang = (await holeOffenenVorgang(prisma, handwerker.id)) ?? (await holeNachtragsVorgang(prisma, handwerker.id));
  await spurEvent(prisma, "ANGEBOT_KNOPF", {
    handwerkerId: handwerker.id,
    data: { knopf: knopf === KNOPF_RAUM_WEITER ? "raum_weiter" : "korrigieren", offen: !!vorgang },
  });
  if (!vorgang) {
    await sendeWhatsAppText(vonNummer, ANTWORT_KEIN_ANGEBOT);
    return;
  }
  await sendeWhatsAppText(vonNummer, knopf === KNOPF_RAUM_WEITER ? ANTWORT_RAUM_WEITER : ANTWORT_KORRIGIEREN);
}

// ── Eingaben bündeln und auswerten ───────────────────────────────────
//
// Seit 13.09.2026: JEDE Eingabe (Sprache, Text, Foto) plant die Auswertung mit
// einer kurzen Pause; jede weitere Eingabe verschiebt sie. So wird ein Schwung
// „Sprachnachricht + vier Fotos" einmal ausgewertet, nicht fünfmal. Läuft der
// KI-Aufruf schon und kommt noch etwas, verwirft die Auswertung ihr Ergebnis
// (Eingabestand, siehe eingabestand.ts); die neue Eingabe plant erneut.

/** Pause nach Sprache oder Text: praktisch sofort (Dirk 13.09.: Wartezeit so kurz
 *  wie möglich, Kosten egal). Die Überhol-Logik fängt Nachzügler ab. */
const EINGABE_PAUSE_MS = 3_000;
/** Fotos kommen im Schwung (je Öffnung eins, 10 bis 20 s Abstand): kurz warten,
 *  sonst gäbe es je Foto eine eigene Fassung samt Fertigmeldung. */
const FOTO_PAUSE_MS = 30_000;
/** Foto-Eingangsbestätigung nur einmal je Schwung, nicht für jedes einzelne Foto. */
const FOTO_SCHWUNG_MS = 90_000;
const auswertungTimer = new Map<string, NodeJS.Timeout>();
const letztesFoto = new Map<string, number>();

/** Wartet für diese Nummer eine geplante Auswertung? (Timeout-Job) */
export function auswertungGeplant(nummer: string): boolean {
  return auswertungTimer.has(nummer);
}

function brichAuswertungAb(vonNummer: string): void {
  const t = auswertungTimer.get(vonNummer);
  if (t) {
    clearTimeout(t);
    auswertungTimer.delete(vonNummer);
  }
}

/** Foto-Eingangsbestätigung nur, wenn das letzte Foto dieser Nummer länger her ist. */
function fotoBestaetigungFaellig(vonNummer: string): boolean {
  const jetzt = Date.now();
  const vorher = letztesFoto.get(vonNummer) ?? 0;
  letztesFoto.set(vonNummer, jetzt);
  return jetzt - vorher > FOTO_SCHWUNG_MS;
}

/** Speichert das Wandfoto, hängt die Erkennung an den Vorgang, meldet nur Unlesbares sofort und plant die Auswertung. */
async function verarbeiteWandfoto(args: {
  handwerker: Handwerker;
  vorgang: Vorgang | null;
  vonNummer: string;
  bild: { daten: Buffer; mimeType: string };
  analyse: WandfotoAnalyse;
  bildText: string | undefined;
  zuordnung: ReturnType<typeof ordneFotoZu>;
}): Promise<void> {
  const { handwerker, vonNummer, bild, analyse, bildText, zuordnung } = args;
  let vorgang = args.vorgang;
  if (!vorgang) vorgang = await holeNachtragsVorgang(prisma, handwerker.id);
  if (!vorgang) vorgang = await prisma.vorgang.create({ data: { handwerkerId: handwerker.id } });

  // Wandzähler je Raum: „Wand 3" ist die dritte Wand DIESES Raums, nicht das dritte Foto insgesamt.
  const raumName = zuordnung.raumName;
  const bisher = await prisma.foto.count({ where: { vorgangId: vorgang.id, raum: raumName } });
  const wandNr = zuordnung.wandNrAusText ?? bisher + 1;

  // Keine Datenbankzeile ohne Datei (F-10): scheitert die Ablage, bleibt das
  // Foto ein reiner Dialogbeitrag (die Erkennung fließt trotzdem ins Aufmaß ein),
  // taucht aber nicht als Belegfoto auf.
  try {
    const gespeichert = speichereFoto({ handwerkerId: handwerker.id, vorgangId: vorgang.id, wandNr, daten: bild.daten });
    await prisma.foto.create({
      data: {
        handwerkerId: handwerker.id,
        vorgangId: vorgang.id,
        raum: raumName,
        wandNr,
        datei: gespeichert.datei,
        mimeType: gespeichert.mimeType,
        groesse: bild.daten.length,
        erkennungJson: JSON.stringify(analyse),
      },
    });
  } catch (err) {
    console.warn("Wandfoto nicht gespeichert (kein Belegfoto):", err instanceof Error ? err.message : err);
  }
  vorgang = await ergaenzeNachricht(prisma, vorgang, {
    rolle: "handwerker",
    art: "foto",
    text: fotoAlsDialogText(analyse, wandNr, raumName, bildText),
  });
  // Sofort nur, was ein neues Foto braucht (zu dunkel, Tür offen). Alles andere
  // (Öffnungen, fehlender Boden, Bildrand) steht gesammelt in der Fertigmeldung.
  const nachfassen = fotoNachfassHinweis(analyse, wandNr, raumName);
  if (nachfassen) await sendeWhatsAppText(vonNummer, nachfassen);
  await spurEvent(prisma, "WANDFOTO", {
    handwerkerId: handwerker.id,
    data: { wandNr, oeffnungen: analyse.oeffnungen.length, komplett: analyse.wandKomplett, offen: analyse.oeffnungen.some((o) => o.offen), nachfassen: !!nachfassen },
  });
  planeAuswertung(vonNummer, handwerker.id, vorgang.id, FOTO_PAUSE_MS);
}

/**
 * Auswertung nach einer Pause planen. Jede neue Eingabe derselben Nummer
 * verschiebt sie; feuert der Timer, läuft die Auswertung in der seriellen
 * Warteschlange der Nummer und prüft zuerst, ob sie noch aktuell ist.
 */
function planeAuswertung(vonNummer: string, handwerkerId: string, vorgangId: string, pauseMs: number): void {
  brichAuswertungAb(vonNummer);
  const stand = eingabeStandVon(vonNummer);
  const timer = setTimeout(() => {
    auswertungTimer.delete(vonNummer);
    inReiheProNummer(vonNummer, async () => {
      // Eine neuere Eingabe hat inzwischen neu geplant: diese Auswertung entfällt.
      if (istUeberholt(vonNummer, stand)) return;
      const frisch = await prisma.vorgang.findUnique({ where: { id: vorgangId } });
      if (!frisch || frisch.status !== "OFFEN") return;
      const nachrichten = nachrichtenLesen(frisch);
      // Nur Fotos, noch keine Maße/Leistungen: nichts rechnen, einmal erinnern.
      if (!nachrichten.some((n) => n.rolle === "handwerker" && n.art !== "foto")) {
        if (!nachrichten.some((n) => n.rolle === "assistent")) {
          await sendeWhatsAppText(
            vonNummer,
            "📐 Die Fotos sind drin. Sprich mir jetzt noch Kunde, Raum und Maße ein (z.B. „Wohnzimmer, Höhe 2,52, 4,49 mal 4,36, Wände und Decke streichen“), dann rechne ich das Angebot.",
          );
          await ergaenzeNachricht(prisma, frisch, { rolle: "assistent", art: "text", text: "(Bitte um Raummaße)" });
        }
        return;
      }
      const handwerker = await prisma.handwerker.findUnique({ where: { id: handwerkerId } });
      if (!handwerker) return;
      // Gebündelte Bestätigung der Fotos seit der letzten Antwort (statt je Foto).
      let neueFotos = 0;
      for (let i = nachrichten.length - 1; i >= 0 && nachrichten[i]!.rolle === "handwerker"; i--) {
        if (nachrichten[i]!.art === "foto") neueFotos++;
      }
      if (neueFotos > 0) {
        await sendeWhatsAppText(
          vonNummer,
          neueFotos === 1 ? "📐 Das Foto ist drin, ich rechne das Angebot …" : `📐 ${neueFotos} Fotos sind drin, ich rechne das Angebot …`,
        );
      }
      await fuehreAuswertungAus({ handwerker, vorgang: frisch, vonNummer });
    }).catch(async (err) => {
      // Nur noch Fehler VOR der Auswertung (Datenbank, Versand); die Auswertung
      // selbst behandelt ihre Fehler in fuehreAuswertungAus.
      console.error("Geplante Auswertung fehlgeschlagen:", err);
      await meldeStoerung({
        schluessel: `planung:${vonNummer.slice(-4)}`,
        was: "Geplante Auswertung ist vor dem KI-Aufruf gescheitert",
        stand: "Der Timeout-Job holt die Eingabe in 3 Minuten nach.",
        details: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
    });
  }, pauseMs);
  auswertungTimer.set(vonNummer, timer);
}

// ── Serielle Verarbeitung pro Nummer ──────────────────────────────────
// Der Webhook ruft die Verarbeitung "fire-and-forget" auf. Kämen zwei
// Sprachnachrichten DERSELBEN Nummer dicht hintereinander, liefen sie PARALLEL
// und jede legte einen eigenen Vorgang (= ein eigenes Angebot) an — der Kunde
// bekäme zwei getrennte Angebote, obwohl er nur eins meinte. Deshalb: pro Nummer
// eine Warteschlange. Nachricht 2 wartet, bis Nachricht 1 fertig ist, und wird
// dann korrekt als Nachtrag zum selben Angebot erkannt (siehe holeNachtragsVorgang).
const laufendeVerarbeitung = new Map<string, Promise<unknown>>();

/**
 * Reiht eine Arbeit in die Warteschlange DIESER Nummer ein. Auch der
 * Timeout-Job nutzt das (Audit AB-M03): vorher lief er an der Schlange
 * vorbei und konnte parallel zu einer eintreffenden Nachricht ein
 * zweites Angebot aus demselben Diktat erzeugen.
 */
export function inReiheProNummer(nummer: string, arbeit: () => Promise<void>): Promise<void> {
  const vorher = laufendeVerarbeitung.get(nummer) ?? Promise.resolve();
  const lauf = vorher.catch(() => {}).then(arbeit);
  laufendeVerarbeitung.set(nummer, lauf);
  // Aufräumen, sobald diese Arbeit durch ist (Fehler hier ignorieren — der
  // Aufrufer behandelt Fehler des zurückgegebenen Promise selbst).
  lauf.catch(() => {}).finally(() => {
    if (laufendeVerarbeitung.get(nummer) === lauf) laufendeVerarbeitung.delete(nummer);
  });
  return lauf;
}

export function verarbeiteNachrichtSeriell(args: {
  vonNummer: string;
  mediaId?: string;
  bildMediaId?: string;
  text?: string;
  knopfPayload?: string;
}): Promise<void> {
  // Eingabestand VOR dem Einreihen erhöhen: eine gerade laufende Auswertung
  // sieht so, dass sie überholt ist, und verwirft ihr Ergebnis.
  if (args.mediaId || args.bildMediaId || args.text) merkeEingabe(args.vonNummer);
  return inReiheProNummer(args.vonNummer, () => verarbeiteNachricht(args));
}

/** Erzeugt Word-Datei, E-Mail und Archiv-Eintrag und schließt den Vorgang. */
export async function erstelleDokument(args: {
  vorgang: Vorgang;
  handwerkerId: string;
  vonNummer: string;
  daten: Awaited<ReturnType<typeof strukturiereDialog>>;
  preisliste: ReturnType<typeof ladePreisliste>;
  /** Warnhinweise fürs WhatsApp (Aufmaß), schon mit Symbol. */
  hinweise?: string[];
}): Promise<void> {
  const { vorgang, handwerkerId, vonNummer, daten, preisliste, hinweise = [] } = args;

  const handwerker = await prisma.handwerker.findUniqueOrThrow({ where: { id: handwerkerId } });
  // Betriebsdaten des Handwerkers (Logo, Adresse, Farbe) über die Vorgaben
  // legen — sie erscheinen so auf Word/PDF und in der E-Mail.
  const eff = effektivePreisliste(handwerker, preisliste);
  const datum = new Date();

  // Sicherheitsnetz: Bevor aus der KI-Ausgabe ein Angebot wird, prüft der
  // Validator jeden Preis auf belegbare Herkunft und entfernt Unbelegtes. So
  // ist "AuftragsBoss erfindet keine Preise" technisch erzwungen, nicht nur im
  // Prompt versprochen. Hinter einem Flag, damit sich der Schritt gefahrlos
  // scharfschalten und wieder abschalten lässt.
  if (featureConfig().FEATURE_VALIDATOR) {
    const geprueftesDiktat = alsDialog(vorgang)
      .filter((n) => n.rolle === "handwerker")
      .map((n) => n.text)
      .join("\n\n");
    const pruefung = validierePositionen(daten.positionen, { transkript: geprueftesDiktat, preisliste: eff });
    daten.positionen = pruefung.positionen;
    if (pruefung.korrigiert > 0) {
      // Entfernte Preise für den Handwerker sichtbar machen (erscheinen in den
      // "Notizen für dich" der E-Mail, nicht im Kundendokument).
      daten.rueckfragen = [
        ...daten.rueckfragen,
        ...pruefung.befunde.filter((b) => b.schwere === "korrigiert").map((b) => b.meldung),
      ];
      console.log(`🛡️ Validator: ${pruefung.korrigiert} unbelegte(r) Preis(e) entfernt (${handwerker.firma}).`);
    }
  }

  // Preisgedächtnis (opt-in je Betrieb): NACH dem Validator ausgeführt. Es füllt
  // nur noch OFFENE Preise mit einem datierten Vorschlag aus der eigenen Historie
  // dieses Betriebs. Streng pro handwerkerId, nie global, nie erfunden — der Preis
  // stammt immer aus einem früheren Angebot DESSELBEN Betriebs.
  if (featureConfig().FEATURE_PREISGEDAECHTNIS && handwerker.preisGedaechtnisAktiv) {
    const vor = await schlagePreiseVor(prisma, handwerker.id, daten.positionen);
    daten.positionen = vor.positionen;
    if (vor.vorschlaege.length > 0) {
      daten.rueckfragen = [
        ...daten.rueckfragen,
        ...vor.vorschlaege.map(
          (v) =>
            `Preis für „${v.beschreibung}": ${euro(v.preis)} aus deinem Preisgedächtnis ` +
            `(zuletzt ${v.zuletztAm.toLocaleDateString("de-DE")}), bitte prüfen.`,
        ),
      ];
    }
  }

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
      bearbeitenToken: erzeugeKurzToken(),
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

  // Fotos dieser Fassung (noch ohne Dokument) für die Hinweise merken, dann
  // alle Wandfotos des Vorgangs als Belegfotos ans Dokument hängen.
  const neueFotos = await prisma.foto.findMany({ where: { vorgangId: vorgang.id, dokumentId: null }, orderBy: { erstelltAm: "asc" } });
  const anzahlFotos = await prisma.foto.count({ where: { vorgangId: vorgang.id } });
  await prisma.foto.updateMany({ where: { vorgangId: vorgang.id, dokumentId: null }, data: { dokumentId: dokument.id } });

  // Word-Datei (mit Aufmaßblatt und Belegfotos als Anlage) + E-Mail
  const word = await erzeugeAngebotWord({ daten, summe, preisliste: eff, nummer, datum, aufmass: await ladeAufmassAnlage(prisma, dokument) });
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

  // Abschluss-Vermerk im Verlauf (die KI sieht so, ab wann Nachträge Korrekturen
  // sind; der Timeout-Job erkennt daran, dass nichts mehr offen ist) und Vorgang
  // schließen. updateMany: der Vorgang kann während Dokument-Erstellung und
  // E-Mail-Versand entfernt worden sein, dann läuft das still ins Leere.
  const bezeichnung: "Angebot" | "Protokoll" = daten.art === "ANGEBOT" ? "Angebot" : "Protokoll";
  await prisma.vorgang.updateMany({
    where: { id: vorgang.id },
    data: {
      status: "ABGESCHLOSSEN",
      dokumentId: dokument.id,
      nachrichtenJson: JSON.stringify([
        ...nachrichtenLesen(vorgang),
        { rolle: "assistent", text: `(${bezeichnung} ${nummer}, Fassung ${version}, erstellt und Link gesendet)`, art: "text", zeit: new Date().toISOString() },
      ]),
    },
  });

  // Fertigmeldung (13.09.2026): EINE kompakte Nachricht mit Link, Kurzbilanz,
  // Warnhinweisen (Aufmaß, Fotos, offene Pflichtangaben) und den Knöpfen
  // „Nächster Raum" / „Angebot korrigieren". Schlägt die Knopfnachricht fehl
  // (z.B. 24-h-Fenster), geht derselbe Text ohne Knöpfe raus.
  const bilanz = kurzeBilanz(summe.positionen);
  const fotoHinweise = neueFotos.flatMap((f) => {
    try {
      return fotoHinweiseKurz(JSON.parse(f.erkennungJson) as WandfotoAnalyse, f.wandNr, f.raum);
    } catch {
      return [];
    }
  });
  const fehlende = daten.fehlendeInfos
    .filter((f) => f.wichtigkeit === "PFLICHT")
    .map((f) => f.feld.trim())
    .filter(Boolean);
  const hatRaeume = parseRaeumeText(daten.raeumeText).length > 0;
  const meldung = {
    bezeichnung,
    nummer,
    version,
    kunde: daten.kunde.name,
    link: bearbeitenLink(dokument.bearbeitenToken),
    raeume: bilanz.raeume,
    leistungen: bilanz.leistungen,
    anzahlPositionen: summe.positionen.length,
    gesamtBrutto: summe.vollstaendig ? euro(summe.brutto) : null,
    hinweise: [...hinweise, ...fotoHinweise],
    fehlende,
    fotoTipp: !istNachtrag && hatRaeume && anzahlFotos === 0,
    istTest: handwerker.istTest,
    gewaehrleistungJahre: istProtokoll ? fristJahre : null,
    mitKnoepfen: daten.art === "ANGEBOT",
  };
  let gesendet = false;
  if (meldung.mitKnoepfen) {
    try {
      gesendet = await sendeWhatsAppKnoepfe(vonNummer, baueFertigmeldung(meldung), ANGEBOTS_KNOEPFE);
    } catch (err) {
      console.warn("Fertigmeldung mit Knöpfen fehlgeschlagen, sende Text:", err instanceof Error ? err.message : err);
    }
  }
  if (!gesendet) await sendeWhatsAppText(vonNummer, baueFertigmeldung({ ...meldung, mitKnoepfen: false }));

  await spurEvent(prisma, "ANGEBOT_ERSTELLT", {
    handwerkerId,
    data: {
      art: daten.art,
      version,
      nachtrag: istNachtrag,
      positionen: summe.positionen.length,
      offen: summe.anzahlOffen,
      istTest: handwerker.istTest,
    },
  });

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

  // Nach dem 2. Angebot einmalig um kurzes Feedback bitten — NUR echte (Nicht-
  // Test-)Betriebe, garantiert nur EINMAL (über ein Event gemerkt, kein Schema-
  // Umbau). Setzt das Feedback-Fenster: die nächste kurze Sprach-/Textnachricht
  // wird dann als Feedback erfasst (ein langes Diktat bleibt ein Auftrag).
  if (!handwerker.istTest && !istNachtrag) {
    const anzahlV1 = await prisma.dokument.count({ where: { handwerkerId, version: 1 } });
    if (anzahlV1 === FEEDBACK_NUDGE_AB_ANGEBOT) {
      const schonGefragt = await prisma.event.count({
        where: { handwerkerId, typ: "FEEDBACK_NUDGE" },
      });
      if (schonGefragt === 0) {
        await prisma.handwerker.update({
          where: { id: handwerkerId },
          data: { feedbackWartetSeit: new Date() },
        });
        await sendeWhatsAppText(
          vonNummer,
          `🙏 Kurze Frage: Wie läuft AuftragsBoss bisher für dich? Antworte einfach mit einer kurzen *Sprachnachricht*. Ich lese jede Rückmeldung und verbessere das Produkt damit.`,
        );
        await spurEvent(prisma, "FEEDBACK_NUDGE", { handwerkerId, data: { nachAngebot: anzahlV1 } });
      }
    }
  }

  console.log(
    `✅ ${daten.art} ${nummer}${version > 1 ? ` (Fassung ${version})` : ""} für ${handwerker.firma} erstellt (${dokument.id}).`,
  );
}
