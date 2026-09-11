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
import { PrismaClient, type Handwerker, type Vorgang } from "@prisma/client";
import { ladeAudio, ladeBild, MediumZuGross, BILD_MAX_BYTES, AUDIO_MAX_BYTES } from "./whatsapp/media.js";
import { erkenneBildTyp } from "./betrieb/bildpruefung.js";
import { sendeWhatsAppText } from "./whatsapp/send.js";
import { transkribiereAudio } from "./ai/transcribe.js";
import { liesBildNotiz } from "./ai/bildLesen.js";
import { analysiereWandfoto, bereinigeAnalyse, fotoAlsDialogText, fotoFeedback, type WandfotoAnalyse } from "./ai/wandfoto.js";
import { floskel } from "./whatsapp/floskeln.js";
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
import {
  MAX_RUNDEN,
  alsDialog,
  baueZusammenfassung,
  ergaenzeNachricht,
  holeNachtragsVorgang,
  holeOffenenVorgang,
  istBestaetigung,
  istFertigWunsch,
  nachrichtenLesen,
  raumBilanz,
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

  // Wartet eine verzögerte Foto-Auswertung? Die neue Nachricht übernimmt.
  brichFotoAuswertungAb(vonNummer);

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
      await sendeWhatsAppText(vonNummer, floskel("foto", vonNummer));
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
    vorgang = await ergaenzeNachricht(prisma, vorgang, {
      rolle: "handwerker",
      text: inhalt,
      art,
      ...(zweitfassung ? { zweitfassung } : {}),
    });

    await werteVorgangAus({ handwerker, vorgang, vonNummer, inhalt, stumm: !!mediaId || !!bildMediaId });
  } catch (err) {
    console.error("Pipeline-Fehler:", err);
    await sendeWhatsAppText(
      vonNummer,
      "⚠️ Da ist etwas schiefgelaufen, deine Nachricht konnte nicht verarbeitet werden. Bitte versuche es in ein paar Minuten noch einmal.",
    );
    throw err;
  }
}


/**
 * Schritte 4–6: gesamten Verlauf auswerten, nachfragen, zusammenfassen oder
 * das Dokument erstellen. Wird von der Nachrichtenverarbeitung UND von der
 * verzögerten Foto-Auswertung genutzt (Teiletappe 2).
 * stumm = Eingangsbestätigung wurde schon gesendet (Sprache/Foto).
 */
export async function werteVorgangAus(args: {
  handwerker: Handwerker;
  vorgang: Vorgang;
  vonNummer: string;
  inhalt: string;
  stumm: boolean;
  /** true = Zeitablauf: keine Rückfrage, keine Zusammenfassung, Angebot mit dem, was da ist. */
  erzwungen?: boolean;
}): Promise<void> {
  const { handwerker, vorgang, vonNummer, inhalt, stumm, erzwungen = false } = args;
    // 4. Gesamten Verlauf auswerten
    const preisliste = ladePreisliste();
    const dialog = alsDialog(vorgang);
    if (dialog.length === 0) {
      await sendeWhatsAppText(vonNummer, "🎙️ Mir fehlt noch der Auftrag, diktier mir kurz, worum es geht.");
      return;
    }
    // Kurze Eingangsbestätigung bei TEXT-Nachrichten. Sprache/Foto sind oben schon
    // bestätigt; eine Textantwort (Rückfrage beantworten oder Zusammenfassung mit
    // "ja" bestätigen) lief bisher stumm in die mehrsekündige KI-Auswertung, das
    // wirkt schnell wie eingefroren. Nach der Zusammenfassung folgt meist das
    // Angebot, deshalb dort eine passendere Formulierung.
    if (!stumm) {
      await sendeWhatsAppText(
        vonNummer,
        vorgang.zusammenfassungGezeigt && istBestaetigung(inhalt)
          ? "⏳ Super, ich stelle dein Angebot jetzt fertig, einen kurzen Moment …"
          : floskel("text", vonNummer),
      );
    }
    const daten = await strukturiereDialog(dialog, preisliste, (ein, aus) => {
      void spurEvent(prisma, "KI_AUFRUF", {
        handwerkerId: handwerker.id,
        data: { dienst: "struktur", tokensEin: ein, tokensAus: aus, kostenCent: kostenClaudeCent(ein, aus) },
      });
    });

    // 4b. Aufmaß aus Raummaßen: Die KI hat nur Zahlen ausgelesen, gerechnet wird
    //     hier (VOB: Öffnungen bis 2,5 m² übermessen, größere abgezogen). Vor der
    //     Zusammenfassung, damit der Handwerker die Flächen schon dort sieht.
    await prisma.vorgang.updateMany({ where: { id: vorgang.id }, data: { raeumeText: daten.raeumeText ?? null } });
    const aufmass = berechneAufmass(parseRaeumeText(daten.raeumeText));
    if (aufmass.raeume.length > 0 || aufmass.uebersprungen.length > 0) {
      daten.positionen = wendeAufmassAn(daten.positionen, aufmass);
      daten.aufmassNotizen = [aufmassText(aufmass), daten.aufmassNotizen?.trim()].filter(Boolean).join("\n");
      daten.rueckfragen = [...daten.rueckfragen, ...aufmass.rueckfragen];
      console.log(`📐 Aufmaß: ${aufmass.raeume.length} Raum/Räume berechnet, ${aufmass.uebersprungen.length} übersprungen (${handwerker.firma}).`);
    }

    // SAMMELMODUS (Live-Test 11.09.2026): Sobald Räume im Spiel sind, geht der
    // Maler Raum für Raum durch (Maße sprechen, Wände fotografieren). Das Angebot
    // entsteht dann erst auf „fertig", auf die Bestätigung der Zusammenfassung
    // oder per Zeitablauf. Bis dahin bekommt er nach jedem Schritt eine Raumbilanz
    // mit der Frage „nächster Raum oder fertig?". Vorher wurde die nächste
    // Nachricht nach der Zusammenfassung als Bestätigung gewertet und ein halbes
    // Angebot verschickt, während die Fotos des zweiten Raums noch hochluden.
    const sammelModus = aufmass.raeume.length > 0 || aufmass.uebersprungen.length > 0;
    const fertigGesagt = istFertigWunsch(inhalt);
    const bestaetigt = vorgang.zusammenfassungGezeigt && istBestaetigung(inhalt);
    const abschliessen = erzwungen || fertigGesagt || bestaetigt;

    // 5. Nachfragen oder abschließen? Das entscheidet die KI aus dem Verlauf —
    //    kein Stichwort, das der Handwerker kennen müsste. Das Rundenlimit ist
    //    nur ein Sicherheitsnetz gegen Endlosschleifen (im Sammelmodus großzügiger:
    //    jeder Raum darf eine Rückfrage brauchen).
    const nachfragen =
      !erzwungen &&
      daten.dialog.aktion === "NACHFRAGEN" &&
      vorgang.runde < (sammelModus ? MAX_RUNDEN + 4 : MAX_RUNDEN) &&
      daten.dialog.nachricht.trim().length > 0;

    // Zusammenfassung gezeigt, aber statt „ja" kommt neuer Inhalt (weiterer Raum,
    // Korrektur): das ist eine Fortsetzung, keine Bestätigung. Die Zusammenfassung
    // kommt später aktualisiert noch einmal.
    if (sammelModus && vorgang.zusammenfassungGezeigt && !abschliessen && !nachfragen) {
      await prisma.vorgang.updateMany({ where: { id: vorgang.id }, data: { zusammenfassungGezeigt: false } });
      vorgang.zusammenfassungGezeigt = false;
    }

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
      await spurEvent(prisma, "RUECKFRAGE", { handwerkerId: handwerker.id, data: { runde: vorgang.runde + 1 } });
      return;
    }

    // 5b. Zusammenfassung "das habe ich verstanden" vor dem Angebot — einmal je
    //     Vorgang, sofern der Betrieb sie nicht abgeschaltet hat. Der Handwerker
    //     bestätigt mit "ja" oder korrigiert per Sprache; ohne Antwort stellt der
    //     Timeout-Job das Angebot ohnehin fertig. Dauerhaft abschaltbar per
    //     Stichwort ("ohne Zusammenfassung") oder in den Einstellungen.
    const willKeineZusammenfassung = /ohne zusammenfassung|keine zusammenfassung|zusammenfassung aus/i.test(inhalt);
    if (willKeineZusammenfassung && handwerker.zusammenfassungAktiv) {
      await prisma.handwerker.update({ where: { id: handwerker.id }, data: { zusammenfassungAktiv: false } });
      handwerker.zusammenfassungAktiv = false;
    }

    // 5a. Sammelmodus ohne Abschlusswunsch: Raumbilanz statt Angebot. Immer mit
    //     der Aufforderung, weiterzumachen oder „fertig" zu sagen, damit nie der
    //     Eindruck entsteht, das Programm hänge.
    if (sammelModus && !abschliessen) {
      const letzterRaum = aufmass.raeume[aufmass.raeume.length - 1]?.name;
      const hatFotos =
        !!letzterRaum && nachrichtenLesen(vorgang).some((n) => n.art === "foto" && n.text.includes(`(Raum: ${letzterRaum})`));
      const bilanz = raumBilanz(daten.raeumeText, floskel(hatFotos ? "weiterOderFertig" : "fotosOderWeiter", vonNummer));
      if (bilanz) {
        await sendeWhatsAppText(vonNummer, bilanz);
        await prisma.vorgang.updateMany({
          where: { id: vorgang.id },
          data: {
            letzteAktivitaet: new Date(),
            erinnertAm: null,
            nachrichtenJson: JSON.stringify([
              ...JSON.parse(vorgang.nachrichtenJson),
              { rolle: "assistent", text: "(Raumbilanz gesendet, warte auf nächsten Raum oder das Wort fertig)", art: "text", zeit: new Date().toISOString() },
            ]),
          },
        });
        await spurEvent(prisma, "RAUMBILANZ", { handwerkerId: handwerker.id, data: { raeume: aufmass.raeume.length } });
        return;
      }
    }

    if (
      featureConfig().FEATURE_ZUSAMMENFASSUNG &&
      handwerker.zusammenfassungAktiv &&
      !vorgang.zusammenfassungGezeigt &&
      !willKeineZusammenfassung &&
      !erzwungen
    ) {
      const zusammenfassung = baueZusammenfassung(daten);
      await sendeWhatsAppText(
        vonNummer,
        zusammenfassung +
          `\n\nPasst das? Antworte mit *ja*, oder korrigier's einfach per Sprache oder Text.` +
          `\n_Zusammenfassung künftig weglassen: schreib „ohne Zusammenfassung"._`,
      );
      await prisma.vorgang.updateMany({
        where: { id: vorgang.id },
        data: {
          zusammenfassungGezeigt: true,
          letzteAktivitaet: new Date(),
          nachrichtenJson: JSON.stringify([
            ...JSON.parse(vorgang.nachrichtenJson),
            { rolle: "assistent", text: zusammenfassung, art: "text", zeit: new Date().toISOString() },
          ]),
        },
      });
      await spurEvent(prisma, "ZUSAMMENFASSUNG_GEZEIGT", { handwerkerId: handwerker.id });
      return;
    }

    // 6. Abschließen. Hat der Handwerker etwas vertagt, greift die KI das
    //    kurz auf ("Alles klar, ich schick dir schon mal einen Entwurf…") —
    //    danach folgt die Fertigmeldung des Programms.
    if (daten.dialog.nachricht.trim().length > 0) {
      await sendeWhatsAppText(vonNummer, daten.dialog.nachricht.trim());
    }
    await erstelleDokument({ vorgang, handwerkerId: handwerker.id, vonNummer, daten, preisliste });
}

// ── Wandfotos (Teiletappe 2) ─────────────────────────────────────────

/** Nach dem letzten Foto so lange warten, bevor die Wände gerechnet werden.
 *  Jedes Foto wird vorher einzeln bestätigt, deshalb reichen 45 s (vorher 90). */
const FOTO_PAUSE_MS = 45_000;
const fotoTimer = new Map<string, NodeJS.Timeout>();

function brichFotoAuswertungAb(vonNummer: string): void {
  const t = fotoTimer.get(vonNummer);
  if (t) {
    clearTimeout(t);
    fotoTimer.delete(vonNummer);
  }
}

/** Speichert das Wandfoto, hängt die Erkennung an den Vorgang, antwortet sofort und plant die Auswertung. */
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
  await sendeWhatsAppText(vonNummer, fotoFeedback(analyse, wandNr, raumName));
  await spurEvent(prisma, "WANDFOTO", {
    handwerkerId: handwerker.id,
    data: { wandNr, oeffnungen: analyse.oeffnungen.length, komplett: analyse.wandKomplett, offen: analyse.oeffnungen.some((o) => o.offen) },
  });
  planeFotoAuswertung(vonNummer, handwerker.id, vorgang.id);
}

/**
 * Fotos kommen meist im Schwung (vier Wände). Statt nach jedem Foto die KI
 * zu bemühen, warten wir eine Pause ab und werten dann einmal aus. Eine neue
 * Nachricht (Sprache/Text/Foto) bricht den Timer ab und übernimmt.
 */
function planeFotoAuswertung(vonNummer: string, handwerkerId: string, vorgangId: string): void {
  brichFotoAuswertungAb(vonNummer);
  const timer = setTimeout(() => {
    fotoTimer.delete(vonNummer);
    inReiheProNummer(vonNummer, async () => {
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
      await sendeWhatsAppText(vonNummer, "📐 Fotos sind komplett, ich rechne die Wände durch …");
      await werteVorgangAus({ handwerker, vorgang: frisch, vonNummer, inhalt: "", stumm: true });
    }).catch((err) => console.error("Verzögerte Foto-Auswertung fehlgeschlagen:", err));
  }, FOTO_PAUSE_MS);
  fotoTimer.set(vonNummer, timer);
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
  return inReiheProNummer(args.vonNummer, () => verarbeiteNachricht(args));
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

  // Wandfotos dieses Vorgangs als Belegfotos ans Dokument hängen.
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
