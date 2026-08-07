// "Jetzt testen"-Aufnahmeknopf auf der Website.
//
// Ein anonymer Besucher diktiert im Browser einen Malerauftrag und bekommt ein
// ECHTES Angebot im Editor (kein WhatsApp, keine Anmeldung) — der stärkste
// Beweis fürs "keine App, kein Login"-Versprechen. Die eigentliche Pipeline
// (Transkription -> Struktur -> Berechnung -> Dokument) wird wiederverwendet,
// ohne WhatsApp/E-Mail. Missbrauchs- und Kostenschutz ist IP-basiert und liegt
// im Arbeitsspeicher (ein pm2-Prozess).
import { prisma } from "../pipeline.js";
import { ladePreisliste } from "../preisliste.js";
import { transkribiereAudio } from "../ai/transcribe.js";
import { strukturiereDialog } from "../ai/structure.js";
import { berechneAngebot } from "../angebot/berechnung.js";
import { effektivePreisliste } from "../betrieb/betriebsdaten.js";
import { validierePositionen } from "../validierung/validator.js";
import { erzeugeToken, bearbeitenLink } from "./tokens.js";
import { featureConfig, webtestConfig } from "../config.js";
import { spurEvent } from "../analytics/event.js";

// Sentinel-Nummer des gemeinsamen, anonymen Test-Betriebs (istTest).
const WEBTEST_NUMMER = "webtest-anonym";

// Beispiel-Diktat für den "Beispiel"-Knopf (wer nicht selbst sprechen mag).
const BEISPIEL_TEXT =
  "Kunde Familie Bär, Bergstraße 12. Wohnzimmer, ungefähr 45 Quadratmeter Wandfläche, " +
  "vorhandene Raufaser bleibt, weiß streichen, zweimal. Decke auch streichen, etwa 20 Quadratmeter. " +
  "Alte Tapete im Flur entfernen. Anfahrt 40 Euro.";

// ── IP-Limits (im Arbeitsspeicher) ─────────────────────────
interface IpStand {
  anzahl: number;
  letzte: number;
}
const proIp = new Map<string, IpStand>();
let tag = "";
let tagesAnzahl = 0;
let monat = "";
let monatsAnzahl = 0;

function heuteSchluessel(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function monatSchluessel(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}`;
}

/**
 * Prüft eine hochgeladene Test-Aufnahme grob (Größe/Typ), bevor sie teuer
 * transkribiert wird — hält Junk-Spam von der API fern.
 */
export function pruefeAudio(audio: Buffer, mime?: string): { ok: boolean; grund?: string } {
  if (audio.length < 2000) return { ok: false, grund: "Die Aufnahme ist zu kurz. Sprich einen Moment und versuch es noch einmal." };
  const maxBytes = webtestConfig().WEBTEST_MAX_AUDIO_MB * 1024 * 1024;
  if (audio.length > maxBytes) return { ok: false, grund: "Die Aufnahme ist zu groß." };
  if (mime && !/^audio\//i.test(mime)) return { ok: false, grund: "Bitte eine Sprachaufnahme senden." };
  return { ok: true };
}

/** Prüft die IP-Limits (ohne zu zählen). */
export function testErlaubt(ip: string): { ok: boolean; grund?: string } {
  const cfg = webtestConfig();
  if (!cfg.WEBTEST_AKTIV) return { ok: false, grund: "Der Sofort-Test ist gerade nicht verfügbar." };

  const t = heuteSchluessel();
  if (t !== tag) {
    tag = t;
    tagesAnzahl = 0;
  }
  const m = monatSchluessel();
  if (m !== monat) {
    monat = m;
    monatsAnzahl = 0;
  }
  if (tagesAnzahl >= cfg.WEBTEST_MAX_PRO_TAG) {
    return { ok: false, grund: "Das kostenlose Test-Kontingent für heute ist aufgebraucht. Bitte morgen wieder." };
  }
  if (monatsAnzahl >= cfg.WEBTEST_MAX_PRO_MONAT) {
    return { ok: false, grund: "Das kostenlose Test-Kontingent ist gerade aufgebraucht. Leg direkt über WhatsApp los." };
  }
  const stand = proIp.get(ip);
  if (stand) {
    if (Date.now() - stand.letzte < cfg.WEBTEST_MIN_ABSTAND_SEKUNDEN * 1000) {
      return { ok: false, grund: "Einen kurzen Moment bitte, dann noch einmal." };
    }
    if (stand.anzahl >= cfg.WEBTEST_MAX_PRO_IP) {
      return {
        ok: false,
        grund: "Du hast das kostenlose Testkontingent aufgebraucht. Für unbegrenzte Angebote leg mit AuftragsBoss los.",
      };
    }
  }
  return { ok: true };
}

function zaehle(ip: string): void {
  const s = proIp.get(ip) ?? { anzahl: 0, letzte: 0 };
  s.anzahl += 1;
  s.letzte = Date.now();
  proIp.set(ip, s);
  tagesAnzahl += 1;
  monatsAnzahl += 1;
}

async function holeTestBetrieb() {
  return prisma.handwerker.upsert({
    where: { whatsappNummer: WEBTEST_NUMMER },
    update: {},
    create: {
      whatsappNummer: WEBTEST_NUMMER,
      name: "Testbetrieb",
      firma: "Ihr Malerbetrieb",
      email: "",
      istTest: true,
      gewerkTyp: "MALER",
    },
  });
}

/** Struktur -> Berechnung -> Dokument. Gibt den Editor-Link zurück. */
async function erzeugeAusText(haupttext: string, zweitfassung?: string): Promise<string> {
  const preisliste = ladePreisliste();
  const daten = await strukturiereDialog(
    [{ rolle: "handwerker", text: haupttext, ...(zweitfassung ? { zweitfassung } : {}) }],
    preisliste,
  );

  const handwerker = await holeTestBetrieb();
  const eff = effektivePreisliste(handwerker, preisliste);

  if (featureConfig().FEATURE_VALIDATOR) {
    const pruef = validierePositionen(daten.positionen, { transkript: haupttext, preisliste: eff });
    daten.positionen = pruef.positionen;
  }

  const datum = new Date();
  const summe = berechneAngebot(daten.positionen, eff, datum);
  const anzahl = await prisma.dokument.count({ where: { handwerkerId: handwerker.id, art: daten.art } });
  const praefix = daten.art === "PROTOKOLL" ? "PRO" : "ANG";
  const nummer = `${praefix}-${datum.getFullYear()}-${String(anzahl + 1).padStart(4, "0")}`;

  const dok = await prisma.dokument.create({
    data: {
      handwerkerId: handwerker.id,
      art: daten.art,
      nummer,
      bearbeitenToken: erzeugeToken(),
      kundenToken: erzeugeToken(),
      transkript: haupttext,
      kundeName: daten.kunde.name,
      kundeStrasse: daten.kunde.strasse,
      kundePlzOrt: daten.kunde.plzOrt,
      gewerk: daten.gewerk,
      objekt: daten.objekt,
      positionenJson: JSON.stringify(summe.positionen),
      kiOriginalJson: JSON.stringify({ positionen: summe.positionen }),
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
    },
  });
  return bearbeitenLink(dok.bearbeitenToken);
}

/** Aus einer Browser-Aufnahme ein Test-Angebot erzeugen. Zählt gegen das IP-Limit. */
export async function testAngebotAusAudio(audio: Buffer, dateiname: string, ip: string): Promise<string> {
  zaehle(ip);
  const t = await transkribiereAudio(audio, dateiname);
  await spurEvent(prisma, "WEBTEST_ANGEBOT", { data: { quelle: "audio" } });
  return erzeugeAusText(t.haupttext, t.varianten[1]);
}

/** Vorbefülltes Beispiel (kein Mikrofon nötig). Zählt ebenfalls gegen das IP-Limit. */
export async function testAngebotBeispiel(ip: string): Promise<string> {
  zaehle(ip);
  await spurEvent(prisma, "WEBTEST_ANGEBOT", { data: { quelle: "beispiel" } });
  return erzeugeAusText(BEISPIEL_TEXT);
}
