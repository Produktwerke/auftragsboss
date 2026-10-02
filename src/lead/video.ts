// Erklärvideo in der Erstnachricht (29.09.2026, Dirk: Aktivierungsproblem).
//
// Von elf eingeladenen Leads hat einer etwas eingesprochen. Die Einladung mit den zwei
// Knöpfen [Ja, los geht's] [Kurz erklären] entfällt deshalb: Jeder bekommt zuerst ein
// kurzes Video, und wer es nicht ansehen will, schickt direkt seine Sprachnachricht.
//
//   • Einladung nach Telefonat und von der Website: Meta-Vorlage mit Video-Kopf, ohne Knöpfe.
//   • Wer uns zuerst anschreibt: Video als normale Nachricht zur Begrüßung (Fenster ist offen).
//   • Erinnerung nach zwei Tagen: kurzer Text ohne Knöpfe (leadErinnerung.ts).
//   • Bereits eingeladene Leads, die gelesen, aber nichts eingesprochen haben: einmalig
//     die Vorlage „video_nachfassen", ausgelöst im Cockpit.
//
// Umschalten ohne Handgriff auf dem Server: Das Video wird nur verwendet, wenn es unter
// seiner Adresse erreichbar ist UND das richtige Format hat (MP4 mit H.264, höchstens
// 16 MB; H.265 lehnt Meta ab). Nimmt Meta die Video-Vorlage nicht an (noch nicht
// genehmigt, pausiert), geht die bisherige Einladung mit Knöpfen raus. Abschalten:
// EINLADUNG_VIDEO_URL=aus in der .env.
import type { PrismaClient } from "@prisma/client";
import { sendeWhatsAppVorlage } from "../whatsapp/send.js";
import { spurEvent } from "../analytics/event.js";

export const VIDEO_URL_STANDARD = "https://auftragsboss.de/auftragsboss-video.mp4";
export const VIDEO_MAX_BYTES = 16 * 1024 * 1024;

/** Adresse des Erklärvideos; `null` = abgeschaltet oder unbrauchbar konfiguriert. */
export function videoUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const roh = env.EINLADUNG_VIDEO_URL?.trim();
  if (!roh) return VIDEO_URL_STANDARD;
  if (/^(aus|0|nein|off|false)$/i.test(roh)) return null;
  return /^https:\/\/\S+$/i.test(roh) ? roh : null;
}

// Namen der Meta-Vorlagen (überschreibbar per .env). Anlegen: src/lead-vorlagen-anlegen.ts
export const vorlageVideoTelefon = (env: NodeJS.ProcessEnv = process.env) => env.LEAD_VORLAGE_VIDEO?.trim() || "einladung_video";
export const vorlageVideoWebsite = (env: NodeJS.ProcessEnv = process.env) => env.TEST_VORLAGE_VIDEO?.trim() || "test_starten_video";
export const vorlageVideoNachfassen = (env: NodeJS.ProcessEnv = process.env) => env.LEAD_VORLAGE_VIDEO_NACHFASSEN?.trim() || "video_nachfassen";
export const vorlageErinnerungKurz = (env: NodeJS.ProcessEnv = process.env) => env.LEAD_VORLAGE_ERINNERUNG_KURZ?.trim() || "lead_erinnerung_kurz";

// Texte der Vorlagen (eine Quelle für das Anlege-Skript). Bewusst ohne Platzhalter und ohne
// „du" oder „Sie": Anna siezt am Telefon, AuftragsBoss duzt im Chat, die Einladung steht dazwischen.
// Hausregel: keine Gedankenstriche. Meta-Grenze: 1024 Zeichen.
// 29.09.2026 (Dirk): ohne Zeitangabe „in unter einer Minute".
const VIDEO_SATZ = "Im Video oben sieht man, wie aus einer Sprachnachricht ein fertiger Angebotsentwurf wird.";
export const VIDEO_TEXT_TELEFON =
  "Hallo, danke für das nette Telefonat!\n\n" +
  VIDEO_SATZ +
  "\n\nZum Ausprobieren einfach hier eine Sprachnachricht mit dem nächsten Auftrag schicken: Kunde, Adresse und was gemacht werden soll. Der Test ist 14 Tage kostenlos.";
export const VIDEO_TEXT_WEBSITE =
  "Hallo, hier ist AuftragsBoss. Der kostenlose Test von auftragsboss.de ist startklar.\n\n" +
  VIDEO_SATZ +
  "\n\nZum Loslegen einfach hier eine Sprachnachricht mit dem nächsten Auftrag schicken: Kunde, Adresse und was gemacht werden soll.";
export const VIDEO_TEXT_NACHFASSEN =
  "Hallo, hier ist noch einmal AuftragsBoss.\n\n" +
  VIDEO_SATZ +
  "\n\nZum Ausprobieren einfach hier eine Sprachnachricht mit dem nächsten Auftrag schicken. Der Test ist kostenlos und endet von selbst.";
export const ERINNERUNG_KURZ_TEXT =
  "Hallo, kurze Erinnerung von AuftragsBoss: Der kostenlose Test wartet noch.\n\n" +
  "Einfach hier eine Sprachnachricht mit dem nächsten Auftrag schicken, der Angebotsentwurf kommt nach etwa zwei Minuten.";
/** Bildunterschrift, wenn das Video als normale Nachricht zur Begrüßung rausgeht. */
export const VIDEO_BEGRUESSUNG_TEXT = "🎬 So funktioniert AuftragsBoss.";

/** Blöcke der obersten Ebene einer MP4-Datei, in Dateireihenfolge. `null` = nicht sauber aufgebaut. */
export function mp4Bloecke(puffer: Buffer): string[] | null {
  const typen: string[] = [];
  let o = 0;
  while (o + 8 <= puffer.length) {
    let groesse = puffer.readUInt32BE(o);
    let kopf = 8;
    if (groesse === 1) {
      if (o + 16 > puffer.length) return null;
      groesse = Number(puffer.readBigUInt64BE(o + 8));
      kopf = 16;
    } else if (groesse === 0) {
      groesse = puffer.length - o;
    }
    if (groesse < kopf || o + groesse > puffer.length) return null;
    typen.push(puffer.toString("latin1", o + 4, o + 8));
    o += groesse;
  }
  return o === puffer.length && typen.length > 0 ? typen : null;
}

/** Blöcke, die auf oberster Ebene vorkommen dürfen (free/skip/wide sind leere Füllblöcke). */
const MP4_ERLAUBT = new Set(["ftyp", "moov", "mdat", "free", "skip", "wide"]);

/**
 * Prüft die Bytes einer Videodatei gegen Metas Vorgaben UND gegen die strenge Prüfung der
 * WhatsApp-App auf dem Handy. Rein, testbar.
 *
 * 02.10.2026: Die mit Windows umgewandelte Datei (H.264 + AAC, von Meta angenommen und zugestellt)
 * ließ sich auf dem Handy nicht abspielen: „Dieses Video ist nicht verfügbar, da mit der Videodatei
 * etwas nicht stimmt". Ihr Aufbau war ftyp, uuid, mdat, moov: ein Windows-eigener Zusatzblock und
 * das Inhaltsverzeichnis am Dateiende. Verlangt wird deshalb: ftyp zuerst, moov vor mdat, keine
 * fremden Blöcke. scripts/video-whatsapp-fix.cjs baut eine Datei entsprechend um.
 */
export function pruefeVideoBytes(bytes: Uint8Array): { ok: boolean; grund?: string } {
  if (bytes.length === 0) return { ok: false, grund: "Datei ist leer" };
  if (bytes.length > VIDEO_MAX_BYTES) return { ok: false, grund: `Datei hat ${(bytes.length / 1024 / 1024).toFixed(1)} MB, Meta erlaubt 16 MB` };
  const puffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const hat = (marke: string) => puffer.includes(marke, 0, "latin1");
  const bloecke = mp4Bloecke(puffer);
  if (!bloecke || bloecke[0] !== "ftyp") return { ok: false, grund: "keine MP4-Datei" };
  if (hat("hvc1") || hat("hev1")) return { ok: false, grund: "Bildformat H.265 (HEVC), WhatsApp verlangt H.264. Umwandeln mit scripts/video-h264.ps1" };
  if (!hat("avc1")) return { ok: false, grund: "kein H.264-Bild gefunden, WhatsApp verlangt MP4 mit H.264 und AAC" };
  const moov = bloecke.indexOf("moov");
  const mdat = bloecke.indexOf("mdat");
  if (moov < 0 || mdat < 0) return { ok: false, grund: "unvollständige MP4-Datei (Inhaltsverzeichnis oder Daten fehlen)" };
  const fremd = bloecke.filter((t) => !MP4_ERLAUBT.has(t));
  if (fremd.length > 0 || moov > mdat) {
    const was = fremd.length > 0 ? `Zusatzblock ${[...new Set(fremd)].join(", ")}` : "Inhaltsverzeichnis am Dateiende";
    return { ok: false, grund: `Aufbau der Datei passt nicht für WhatsApp (${was}), Handys melden dann einen Fehler in der Videodatei. Umbauen mit scripts/video-whatsapp-fix.cjs` };
  }
  return { ok: true };
}

type Pruefstand = { url: string; signatur: string; ok: boolean; geprueftAm: number };
let stand: Pruefstand | null = null;
const FRISCH_OK_MS = 10 * 60_000;
const FRISCH_FEHLER_MS = 2 * 60_000;

/** Nur für Tests: gemerkten Prüfstand verwerfen. */
export function vergissVideoPruefung(): void {
  stand = null;
}

/**
 * Adresse des Videos, wenn es erreichbar und verwendbar ist, sonst `null`.
 * Alle zehn Minuten eine kurze Kopfabfrage; die Datei selbst wird nur geladen und
 * geprüft, wenn sie neu ist oder sich geändert hat (Größe, Änderungsdatum).
 */
export async function videoBereit(opts: { url?: string | null; fetchFn?: typeof fetch; jetzt?: number } = {}): Promise<string | null> {
  // Tests gehen nie von selbst ins Netz: ohne eingeschobenes fetch gibt es dort kein Video.
  if (!opts.fetchFn && process.env.VITEST) return null;
  const url = opts.url === undefined ? videoUrl() : opts.url;
  if (!url) return null;
  const jetzt = opts.jetzt ?? Date.now();
  if (stand && stand.url === url && jetzt - stand.geprueftAm < (stand.ok ? FRISCH_OK_MS : FRISCH_FEHLER_MS)) {
    return stand.ok ? url : null;
  }
  const hole = opts.fetchFn ?? fetch;
  const merke = (ok: boolean, signatur: string, grund?: string): string | null => {
    const vorher = stand && stand.url === url ? stand.ok : null;
    stand = { url, signatur, ok, geprueftAm: jetzt };
    if (ok && vorher !== true) console.log(`🎬 Erklärvideo bereit: ${url}`);
    if (!ok && vorher !== false) console.warn(`🎬 Erklärvideo nicht verwendbar (${grund ?? "unbekannt"}): ${url}. Einladungen gehen ohne Video raus.`);
    return ok ? url : null;
  };
  try {
    const kopf = await hole(url, { method: "HEAD", signal: AbortSignal.timeout(8_000) });
    if (!kopf.ok) return merke(false, "", `Adresse antwortet mit ${kopf.status}`);
    const laenge = Number(kopf.headers.get("content-length") ?? "0");
    if (laenge > VIDEO_MAX_BYTES) return merke(false, "", "Datei größer als 16 MB");
    const signatur = [kopf.headers.get("etag") ?? "", kopf.headers.get("last-modified") ?? "", laenge].join("|");
    if (stand && stand.url === url && stand.signatur === signatur && signatur !== "||0") {
      stand.geprueftAm = jetzt;
      return stand.ok ? url : null;
    }
    const antwort = await hole(url, { signal: AbortSignal.timeout(60_000) });
    if (!antwort.ok) return merke(false, signatur, `Adresse antwortet mit ${antwort.status}`);
    const pruefung = pruefeVideoBytes(new Uint8Array(await antwort.arrayBuffer()));
    return merke(pruefung.ok, signatur, pruefung.grund);
  } catch (err) {
    return merke(false, "", err instanceof Error ? err.message : String(err));
  }
}

// ── Einmaliges Nachfassen bei bereits eingeladenen Leads ─────────────────

/** Gelesen, aber nichts eingesprochen (Dirk, 29.09.2026). Ein Knopfklick zählt als gelesen. */
export const NACHFASS_ZUSTAENDE = new Set(["GELESEN", "ERKLAERT", "WARTET_AUF_AUFTRAG"]);

const istVideoEinladung = (dataJson: string): boolean => {
  try {
    return (JSON.parse(dataJson) as { video?: unknown }).video === true;
  } catch {
    return false;
  }
};

/** Soll dieser Lead das Video einmalig nachgeschickt bekommen? Rein, testbar. */
export function faelligFuerVideoNachfassen(
  h: { leadQuelle: string | null; onboardingStatus: string | null; blockiert: boolean },
  ereignisse: ReadonlyArray<{ typ: string; dataJson: string }>,
): boolean {
  if (!h.leadQuelle || h.blockiert) return false;
  if (!h.onboardingStatus || !NACHFASS_ZUSTAENDE.has(h.onboardingStatus)) return false;
  const einladungen = ereignisse.filter((e) => e.typ === "LEAD_EINLADUNG_GESENDET");
  if (einladungen.length === 0) return false; // nie eingeladen: nichts nachzufassen
  if (einladungen.some((e) => istVideoEinladung(e.dataJson))) return false; // hatte das Video schon
  // Wer Marketing-Nachrichten abbestellt hat (Meta 131050), bekommt nichts mehr, auch wenn sein
  // Zustand noch der alte ist: bei Malermeister Fabian kam der Fehler am 25.09.2026, bevor es den
  // Zustand MARKETING_ABBESTELLT gab, er stand am 01.10. trotzdem in der Nachfass-Liste.
  if (ereignisse.some((e) => e.typ === "LEAD_MARKETING_ABBESTELLT" || (e.typ === "NACHRICHT_FEHLGESCHLAGEN" && metaCode(e.dataJson) === 131050))) return false;
  return !ereignisse.some((e) => e.typ === "LEAD_VIDEO_GESENDET");
}

const metaCode = (dataJson: string): number | null => {
  try {
    const code = (JSON.parse(dataJson) as { code?: unknown }).code;
    return typeof code === "number" ? code : null;
  } catch {
    return null;
  }
};

export interface VideoKandidat {
  id: string;
  whatsappNummer: string;
  firma: string;
  name: string;
  onboardingStatus: string | null;
}

export async function ladeVideoNachfassKandidaten(prisma: PrismaClient): Promise<VideoKandidat[]> {
  const leads = await prisma.handwerker.findMany({
    where: { leadQuelle: { not: null }, blockiert: false, onboardingStatus: { in: [...NACHFASS_ZUSTAENDE] } },
    select: { id: true, whatsappNummer: true, firma: true, name: true, onboardingStatus: true, leadQuelle: true, blockiert: true },
    orderBy: { erstelltAm: "asc" },
  });
  if (leads.length === 0) return [];
  const events = await prisma.event.findMany({
    where: { handwerkerId: { in: leads.map((l) => l.id) }, typ: { in: ["LEAD_EINLADUNG_GESENDET", "LEAD_VIDEO_GESENDET", "NACHRICHT_FEHLGESCHLAGEN", "LEAD_MARKETING_ABBESTELLT"] } },
    select: { handwerkerId: true, typ: true, dataJson: true },
  });
  return leads
    .filter((l) => faelligFuerVideoNachfassen(l, events.filter((e) => e.handwerkerId === l.id)))
    .map((l) => ({ id: l.id, whatsappNummer: l.whatsappNummer, firma: l.firma, name: l.name, onboardingStatus: l.onboardingStatus }));
}

export interface VideoAbhaengigkeiten {
  sende?: typeof sendeWhatsAppVorlage;
  video?: () => Promise<string | null>;
}

/** Das Video als Vorlage an EINEN Lead senden (Cockpit). Schreibt Event und Admin-Protokoll. */
export async function sendeVideoAnLead(
  prisma: PrismaClient,
  h: VideoKandidat,
  grund: string,
  deps: VideoAbhaengigkeiten = {},
): Promise<{ ok: true } | { ok: false; fehler: string }> {
  const betrieb = h.firma || h.name || `+${h.whatsappNummer}`;
  if (h.onboardingStatus === "MARKETING_ABBESTELLT") {
    return { ok: false, fehler: "Der Betrieb hat Marketing-Nachrichten von uns in WhatsApp abbestellt (Meta 131050). Vorlagen kommen nicht mehr an." };
  }
  const video = await (deps.video ?? (() => videoBereit()))();
  if (!video) return { ok: false, fehler: "Das Erklärvideo ist nicht erreichbar oder hat das falsche Format (MP4 mit H.264, höchstens 16 MB)." };
  const vorlage = vorlageVideoNachfassen();
  const ok = await (deps.sende ?? sendeWhatsAppVorlage)(h.whatsappNummer, vorlage, [], [], video);
  if (ok) await spurEvent(prisma, "LEAD_VIDEO_GESENDET", { handwerkerId: h.id, data: { art: "nachfassen", grund } });
  await prisma.adminLog.create({
    data: {
      aktion: ok ? "LEAD_VIDEO_GESENDET" : "LEAD_VIDEO_FEHLGESCHLAGEN",
      handwerkerId: h.id,
      betrieb,
      detail: ok ? `Erklärvideo per Vorlage ${vorlage} gesendet (${grund})` : `Vorlage ${vorlage} nicht angenommen (${grund}). Ist sie bei Meta genehmigt?`,
    },
  });
  return ok ? { ok: true } : { ok: false, fehler: `Meta hat die Vorlage ${vorlage} nicht angenommen. Ist sie genehmigt?` };
}

// ── Probe an das Betreiber-Handy ─────────────────────────────────────────
// Dirk, 02.10.2026: „Können wir eine Test-WhatsApp auch an meine Nummer senden?" Der Knopf in der
// Lead-Auswertung schickt eine der vier Vorlagen genau so, wie ein Lead sie bekommt, aber nur an
// BETREIBER_HANDY. Es gibt bewusst kein Nummernfeld: Marketing-Vorlagen an beliebige Nummern
// brauchen eine Einwilligung, die läuft über „Telefon-Lead einladen".
export type ProbeArt = "einladung_telefon" | "einladung_website" | "nachfassen" | "erinnerung";

export const PROBE_ARTEN: ReadonlyArray<{ art: ProbeArt; label: string }> = [
  { art: "einladung_telefon", label: "Einladung nach Telefonat (mit Video)" },
  { art: "einladung_website", label: "Einladung von der Website (mit Video)" },
  { art: "nachfassen", label: "Video nachschicken (mit Video)" },
  { art: "erinnerung", label: "Erinnerung nach zwei Tagen (nur Text)" },
];

export function probeVorlage(art: ProbeArt): { vorlage: string; mitVideo: boolean } {
  switch (art) {
    case "einladung_telefon": return { vorlage: vorlageVideoTelefon(), mitVideo: true };
    case "einladung_website": return { vorlage: vorlageVideoWebsite(), mitVideo: true };
    case "nachfassen": return { vorlage: vorlageVideoNachfassen(), mitVideo: true };
    case "erinnerung": return { vorlage: vorlageErinnerungKurz(), mitVideo: false };
  }
}

export function istProbeArt(wert: unknown): wert is ProbeArt {
  return PROBE_ARTEN.some((p) => p.art === wert);
}

/** Eine Vorlage als Probe an das Betreiber-Handy senden. Schreibt nur ins Admin-Protokoll. */
export async function sendeVorlagenProbe(
  prisma: PrismaClient,
  art: ProbeArt,
  betreiberHandy: string | null | undefined,
  deps: VideoAbhaengigkeiten = {},
): Promise<{ ok: true; vorlage: string } | { ok: false; fehler: string }> {
  if (!betreiberHandy) return { ok: false, fehler: "Keine Betreiber-Nummer hinterlegt (BETREIBER_HANDY in der Server-Konfiguration)." };
  const { vorlage, mitVideo } = probeVorlage(art);
  let video: string | undefined;
  if (mitVideo) {
    const adresse = await (deps.video ?? (() => videoBereit()))();
    if (!adresse) return { ok: false, fehler: "Das Erklärvideo ist nicht erreichbar oder hat das falsche Format (MP4 mit H.264, höchstens 16 MB)." };
    video = adresse;
  }
  const ok = await (deps.sende ?? sendeWhatsAppVorlage)(betreiberHandy, vorlage, [], [], video);
  await prisma.adminLog.create({
    data: {
      aktion: ok ? "VORLAGE_PROBE" : "VORLAGE_PROBE_FEHLGESCHLAGEN",
      detail: ok ? `Probe der Vorlage ${vorlage} an das Betreiber-Handy gesendet` : `Probe der Vorlage ${vorlage} von Meta nicht angenommen. Ist sie genehmigt?`,
    },
  });
  return ok ? { ok: true, vorlage } : { ok: false, fehler: `Meta hat die Vorlage ${vorlage} nicht angenommen. Ist sie genehmigt?` };
}

/** Einmalig an alle, die gelesen, aber nichts eingesprochen haben. */
export async function sendeVideoNachfassen(
  prisma: PrismaClient,
  deps: VideoAbhaengigkeiten = {},
): Promise<{ kandidaten: number; gesendet: number; fehlgeschlagen: number; fehler?: string }> {
  const kandidaten = await ladeVideoNachfassKandidaten(prisma);
  const ergebnis: { kandidaten: number; gesendet: number; fehlgeschlagen: number; fehler?: string } = { kandidaten: kandidaten.length, gesendet: 0, fehlgeschlagen: 0 };
  for (const k of kandidaten) {
    const e = await sendeVideoAnLead(prisma, k, "einmaliges Nachfassen: gelesen, nichts eingesprochen", deps);
    if (e.ok) ergebnis.gesendet++;
    else {
      ergebnis.fehlgeschlagen++;
      ergebnis.fehler = e.fehler;
      // Video fehlt oder Vorlage nicht genehmigt: das trifft alle, nicht weiter versuchen.
      if (ergebnis.gesendet === 0) break;
    }
  }
  return ergebnis;
}
