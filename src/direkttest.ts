// Test-Funktion "Direkt testen".
//
// Ein Interessent klickt auf der Landingpage auf "Jetzt testen", landet per
// wa.me-Link in WhatsApp bei UNSERER Nummer und schickt eine Sprachnachricht.
// Er bekommt sofort ein fertiges Beispiel-Angebot zurück — ohne Anmeldung.
// Dafür wird seine (unbekannte) Nummer automatisch zu einem Test-Konto
// (Handwerker mit istTest = true), das die normale Pipeline durchläuft.
//
// Kommuniziert wird nach außen NUR: "14 Tage kostenlos testen". Intern gibt es
// zusätzlich einen stillen Angebots-Deckel — wer den vor Tag 14 reißt, bekommt
// dieselbe "Testphase abgelaufen"-Nachricht wie nach Zeitablauf.
//
// Missbrauchsschutz, mehrschichtig. Grundschutz ist WhatsApp selbst (man
// braucht ein echtes Konto). Darüber:
//   1. Not-Aus:  DIREKTTEST_AKTIV schaltet die ganze Funktion an/aus.
//   2. Testphase: DIREKTTEST_TAGE ab Konto-Anlage (Standard 14 Tage).
//   3. Stiller Angebots-Deckel pro Nummer (Standard 10 fertige Test-Angebote).
//   4. Nachrichten-Deckel pro Nummer: fängt Dauer-Kauderwelsch ab (Standard 60).
//   5. Tages-Gesamtdeckel über alle Nummern: Kostenobergrenze (Standard 80).
//   6. Tempo-Limit pro Nummer: Mindestabstand zwischen Nachrichten (Standard 3s).
//
// Persistenz: Kontingent und Nachrichten-Deckel liegen PRO NUMMER in der DB und
// überstehen einen Neustart — das sind die harten Grenzen. Tages-Deckel und
// Tempo-Limit laufen im Arbeitsspeicher; das reicht als Kostenbremse, denn nach
// einem (seltenen) Neustart greifen die DB-Grenzen pro Nummer ohnehin weiter.
import type { Handwerker, PrismaClient } from "@prisma/client";
import { direkttestConfig, featureConfig } from "./config.js";
import { einstellungenTokenBereit } from "./betrieb/betriebsdaten.js";
import { registrierLink } from "./web/tokens.js";

const KONTAKT = "Melde dich beim AuftragsBoss-Team, dann richten wir dir dein eigenes Konto ein.";

/**
 * Einheitliche Abschluss-Nachricht, wenn die Testphase vorbei ist — egal ob
 * durch Zeitablauf oder den stillen Angebots-Deckel (der Deckel wird bewusst
 * nicht verraten, kommuniziert ist nur "14 Tage kostenlos testen").
 */
async function testphaseAbgelaufen(prisma: PrismaClient, handwerker: Handwerker): Promise<string> {
  const basis = "🎉 Deine kostenlose Testphase ist abgelaufen. Stark, dass du AuftragsBoss ausprobiert hast!";
  if (featureConfig().FEATURE_SELBSTREGISTRIERUNG) {
    const token = await einstellungenTokenBereit(prisma, handwerker);
    return (
      `${basis}\n\n` +
      `Melde jetzt in 1 Minute deinen Betrieb an. Dann gehören dir Logo, Adresse und alle Angebote, und du legst richtig los:\n${registrierLink(token)}`
    );
  }
  return `${basis} Wenn du damit richtig arbeiten willst: ${KONTAKT}`;
}

// Tempo-Limit: Nummer → Zeitpunkt der letzten verarbeiteten Nachricht (ms).
const letzteNachricht = new Map<string, number>();

// Tages-Gesamtzähler (Arbeitsspeicher). Nullt sich beim Datumswechsel.
let tagesDatum = "";
let tagesZaehler = 0;

function heuteStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Aktueller Tagesstand — setzt bei neuem Kalendertag automatisch zurück. */
function tagesStand(): number {
  const heute = heuteStr();
  if (heute !== tagesDatum) {
    tagesDatum = heute;
    tagesZaehler = 0;
  }
  return tagesZaehler;
}

/**
 * Für eine UNBEKANNTE Nummer aufgerufen: Ist die Test-Funktion an und der
 * Tages-Deckel nicht erreicht, wird ein Test-Konto angelegt und zurückgegeben.
 * Sonst kommt eine fertige Ablehnungsnachricht zum Versenden zurück.
 *
 * Bewusst mit leeren Stammdaten (firma/name/email = ""): So greifen in
 * betrieb/betriebsdaten.ts die Vorgaben aus preisliste.json, und das
 * Beispiel-Angebot sieht wie ein sauberer, zusammenhängender Muster-Briefkopf
 * aus — genau das, was ein Interessent sehen soll.
 */
/** Nummer (nur Ziffern, mit Landeskennung, z.B. 4917…) gegen die Länderliste prüfen. */
export function nummerAusFreigegebenemLand(nummer: string, laender: readonly string[]): boolean {
  const ziffern = String(nummer ?? "").replace(/\D/g, "");
  if (!ziffern) return false;
  if (laender.length === 0) return true; // Liste leer = keine Sperre
  return laender.some((land) => ziffern.startsWith(land));
}

export async function starteTestFuerNeueNummer(
  prisma: PrismaClient,
  vonNummer: string,
): Promise<{ handwerker: Handwerker } | { ablehnung: string }> {
  const cfg = direkttestConfig();

  if (!cfg.DIREKTTEST_AKTIV) {
    return {
      ablehnung:
        "👋 Diese Nummer ist noch nicht registriert. Melde dich beim AuftragsBoss-Team, um deinen Betrieb freizuschalten.",
    };
  }

  if (tagesStand() >= cfg.DIREKTTEST_MAX_PRO_TAG) {
    return {
      ablehnung:
        "🙏 Unser kostenloser Test ist heute sehr gefragt und für heute ausgebucht. Probier es morgen noch einmal, oder melde dich direkt beim AuftragsBoss-Team.",
    };
  }

  // Ländersperre (12.09.2026): Nur Nummern aus den freigegebenen Ländern (Standard
  // Deutschland) bekommen automatisch ein Test-Konto. Alles andere kostet nur
  // KI-Geld und ist nicht unsere Zielgruppe. Kein Datensatz, keine Verarbeitung.
  if (!nummerAusFreigegebenemLand(vonNummer, cfg.DIREKTTEST_LAENDER)) {
    return {
      ablehnung:
        "👋 AuftragsBoss ist aktuell nur für Handwerksbetriebe in Deutschland verfügbar. " +
        "AuftragsBoss is currently available for businesses in Germany only.",
    };
  }

  const handwerker = await prisma.handwerker.create({
    data: { whatsappNummer: vonNummer, name: "", firma: "", email: "", istTest: true },
  });
  return { handwerker };
}

/**
 * Vor JEDER Nachricht eines bestehenden Test-Kontos aufgerufen. Greift eine
 * Grenze, kommt eine Nachricht zum Versenden zurück (dann NICHT weiterverarbeiten).
 * Ist alles frei, kommt null zurück und die Zähler werden fortgeschrieben
 * (Tempo-Limit, Nachrichten pro Nummer, Tagesdeckel).
 */
export async function testNachrichtBlockiert(
  prisma: PrismaClient,
  handwerker: Handwerker,
): Promise<string | null> {
  const cfg = direkttestConfig();

  // Not-Aus mitten im Betrieb umgelegt? Dann auch bestehende Test-Konten stoppen.
  if (!cfg.DIREKTTEST_AKTIV) {
    return "🔧 Der kostenlose Test ist gerade pausiert. Melde dich gern beim AuftragsBoss-Team.";
  }

  // Testphase abgelaufen? (Zeit läuft ab Anlage des Test-Kontos.)
  const testAlterMs = Date.now() - handwerker.erstelltAm.getTime();
  if (testAlterMs > cfg.DIREKTTEST_TAGE * 24 * 60 * 60 * 1000) {
    return testphaseAbgelaufen(prisma, handwerker);
  }

  // Nachrichten-Deckel pro Nummer (DB, persistent).
  if (handwerker.testNachrichten >= cfg.DIREKTTEST_MAX_NACHRICHTEN) {
    return `Du hast das Test-Limit dieser Nummer erreicht. ${KONTAKT}`;
  }

  // Stiller Angebots-Deckel: nur EIGENSTÄNDIGE Test-Angebote pro Nummer zählen
  // (version === 1). Nachträge/Verbesserungen am selben Angebot (version > 1)
  // zählen NICHT — so kann ein Interessent ruhig ein paar Schleifen drehen, bis
  // ein Angebot passt, ohne dass jede Sprachnachricht das Kontingent verbraucht.
  // Nach außen heißt es auch hier nur "Testphase abgelaufen".
  const fertige = await prisma.dokument.count({
    where: { handwerkerId: handwerker.id, version: 1 },
  });
  if (fertige >= cfg.DIREKTTEST_GRATIS_ANGEBOTE) {
    return testphaseAbgelaufen(prisma, handwerker);
  }

  // Tages-Gesamtdeckel (Arbeitsspeicher).
  if (tagesStand() >= cfg.DIREKTTEST_MAX_PRO_TAG) {
    return "🙏 Unser kostenloser Test ist heute ausgebucht. Probier es morgen noch einmal, oder melde dich beim AuftragsBoss-Team.";
  }

  // Tempo-Limit ZULETZT (Arbeitsspeicher) — so gewinnen die aussagekräftigen
  // Grenzen oben: Wer sein Kontingent aufgebraucht hat, liest das auch, wenn er
  // schnell nochmal schreibt, statt nur "warte kurz".
  const jetzt = Date.now();
  const vorher = letzteNachricht.get(handwerker.whatsappNummer);
  if (vorher !== undefined && jetzt - vorher < cfg.DIREKTTEST_MIN_ABSTAND_SEKUNDEN * 1000) {
    return "⏳ Einen Moment bitte, deine vorige Nachricht wird noch verarbeitet. Schick die nächste in ein paar Sekunden.";
  }

  // Alles frei → Zähler fortschreiben.
  letzteNachricht.set(handwerker.whatsappNummer, jetzt);
  tagesZaehler += 1;
  await prisma.handwerker.update({
    where: { id: handwerker.id },
    data: { testNachrichten: { increment: 1 } },
  });
  return null;
}

/**
 * Erkennt die vorgefüllte Startnachricht von der Landingpage („Hallo AuftragsBoss,
 * ich möchte 14 Tage kostenlos testen (Tarif Profi)"). Sie ist kein Auftrag und
 * darf nicht an die KI: Der Interessent bekommt nur die Begrüßung, der
 * Tarifwunsch wird fürs Cockpit notiert. Liefert null, wenn es keine Startnachricht ist.
 */
export function testStartAusText(text: string | undefined): { tarif: string | null } | null {
  const t = (text ?? "").trim();
  if (!t || t.length > 160) return null;
  if (!/(kostenlos|gratis|14 tage|testen|ausprobieren)/i.test(t)) return null;
  if (!/(test|ausprobier|angebot)/i.test(t)) return null;
  // Ein echtes Diktat enthält Maße, Räume oder Adressen; dann ist es keine Startnachricht.
  if (/\d+[,.]\d+|\bm²|quadrat|wand|decke|zimmer|straße|strasse|weg\b/i.test(t)) return null;
  const m = t.match(/tarif\s*(basis|profi|team)/i);
  return { tarif: m ? m[1]!.toLowerCase() : null };
}
