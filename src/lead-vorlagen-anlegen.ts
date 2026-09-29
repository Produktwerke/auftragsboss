// Legt die Vorlagen für das Lead-Onboarding bei Meta an.
//
// Rückfall-Vorlagen (24.09.2026), beginnen mit einer kurzen Entschuldigung:
//   lead_erklaerung       Erklärung nach „Kurz erklären", mit Knopf „Angebot ausprobieren"
//   lead_aufforderung     Aufforderung zur Sprachnachricht nach „Ja, los geht's"
// Erklärvideo statt Knöpfe (29.09.2026, Dirk: Aktivierungsproblem):
//   einladung_video       Einladung nach Telefonat, Video-Kopf, ohne Knöpfe
//   test_starten_video    Einladung von der Website, Video-Kopf, ohne Knöpfe
//   video_nachfassen      einmalig für Leads, die gelesen, aber nichts eingesprochen haben
//   lead_erinnerung_kurz  Erinnerung nach zwei Tagen, kurzer Text ohne Knöpfe
//
// Läuft auf dem Server (Token aus der .env), VERÄNDERT etwas bei Meta → nur mit Dirks Freigabe:
//   cd /home/auftragsboss/app && npx tsx src/lead-vorlagen-anlegen.ts          # anlegen (idempotent)
//   cd /home/auftragsboss/app && npx tsx src/lead-vorlagen-anlegen.ts status   # nur Status abfragen
//
// Für die Video-Vorlagen muss das Video online sein (Standard https://auftragsboss.de/auftragsboss-video.mp4,
// MP4 mit H.264 und AAC, höchstens 16 MB). Das Skript lädt es von dort, prüft das Format und gibt es Meta
// als Muster für die Prüfung mit. Beim Versand holt Meta das Video jedes Mal von der Adresse ab.
// Texte kommen aus src/lead/onboarding.ts und src/lead/video.ts (eine Quelle). Nach der Genehmigung ist
// nichts weiter nötig: der Code nimmt die neuen Vorlagen von selbst, sobald Meta sie annimmt.
import "./env.js";
import { whatsappConfig } from "./config.js";
import {
  VORLAGE_ERKLAERUNG_TEXT,
  VORLAGE_AUFFORDERUNG_TEXT,
  VORLAGEN_FUSSZEILE,
  VORLAGE_ERKLAERUNG_KNOPF,
  vorlageErklaerungName,
  vorlageAufforderungName,
} from "./lead/onboarding.js";
import {
  ERINNERUNG_KURZ_TEXT,
  VIDEO_TEXT_NACHFASSEN,
  VIDEO_TEXT_TELEFON,
  VIDEO_TEXT_WEBSITE,
  pruefeVideoBytes,
  videoUrl,
  vorlageErinnerungKurz,
  vorlageVideoNachfassen,
  vorlageVideoTelefon,
  vorlageVideoWebsite,
} from "./lead/video.js";

const WABA_ID = process.env.WHATSAPP_WABA_ID?.trim() || "1680177866376806"; // Produktions-WABA „AuftragsBoss"
const nurStatus = process.argv.includes("status");

type Vorlage = { name: string; text: string; knopf?: string; video?: boolean };
const vorlagen: Vorlage[] = [
  { name: vorlageErklaerungName(), text: VORLAGE_ERKLAERUNG_TEXT, knopf: VORLAGE_ERKLAERUNG_KNOPF },
  { name: vorlageAufforderungName(), text: VORLAGE_AUFFORDERUNG_TEXT },
  { name: vorlageVideoTelefon(), text: VIDEO_TEXT_TELEFON, video: true },
  { name: vorlageVideoWebsite(), text: VIDEO_TEXT_WEBSITE, video: true },
  { name: vorlageVideoNachfassen(), text: VIDEO_TEXT_NACHFASSEN, video: true },
  { name: vorlageErinnerungKurz(), text: ERINNERUNG_KURZ_TEXT },
];

const cfg = whatsappConfig();
const graph = `https://graph.facebook.com/${cfg.GRAPH_API_VERSION}`;
const basis = `${graph}/${WABA_ID}/message_templates`;
const kopf = { Authorization: `Bearer ${cfg.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" };

type Stand = { id: string; name: string; status: string; language: string; category: string; rejected_reason?: string };

async function status(name: string): Promise<Stand[]> {
  const res = await fetch(`${basis}?name=${encodeURIComponent(name)}&fields=id,name,status,language,category,rejected_reason`, { headers: kopf });
  if (!res.ok) throw new Error(`Statusabfrage ${name}: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { data?: Stand[] };
  return (j.data ?? []).filter((v) => v.name === name);
}

/**
 * Mustervideo für Metas Prüfung hochladen (Resumable Upload der Graph-API) und die Kennung
 * zurückgeben, die in die Vorlage gehört. Einmal je Lauf. `null` = Video-Vorlagen auslassen.
 */
let videoKennung: string | null | undefined;
async function holeVideoKennung(): Promise<string | null> {
  if (videoKennung !== undefined) return videoKennung;
  videoKennung = null;
  const url = videoUrl();
  if (!url) {
    console.error("✗ Erklärvideo ist abgeschaltet (EINLADUNG_VIDEO_URL).");
    return null;
  }
  const geladen = await fetch(url).catch((err: unknown) => err as Error);
  if (geladen instanceof Error || !geladen.ok) {
    console.error(`✗ Video nicht erreichbar (${geladen instanceof Error ? geladen.message : geladen.status}): ${url}`);
    console.error("  Erst bei IONOS hochladen, dann dieses Skript noch einmal starten.");
    return null;
  }
  const bytes = new Uint8Array(await geladen.arrayBuffer());
  const pruefung = pruefeVideoBytes(bytes);
  if (!pruefung.ok) {
    console.error(`✗ Video nicht verwendbar: ${pruefung.grund}`);
    return null;
  }
  console.log(`✓ Video geladen und geprüft: ${(bytes.length / 1024 / 1024).toFixed(2)} MB, MP4 mit H.264 (${url})`);

  let appId = process.env.META_APP_ID?.trim();
  if (!appId) {
    const r = await fetch(`${graph}/app?fields=id`, { headers: kopf });
    if (r.ok) appId = ((await r.json()) as { id?: string }).id;
    if (!appId) {
      console.error(`✗ App-Kennung nicht ermittelbar (${r.status}). META_APP_ID in der .env setzen (Zahl aus der App-Übersicht bei developers.facebook.com).`);
      return null;
    }
  }

  const dateiname = url.split("/").pop() || "auftragsboss-video.mp4";
  const sitzung = await fetch(
    `${graph}/${appId}/uploads?file_name=${encodeURIComponent(dateiname)}&file_length=${bytes.length}&file_type=${encodeURIComponent("video/mp4")}`,
    { method: "POST", headers: kopf },
  );
  const sitzungText = await sitzung.text();
  if (!sitzung.ok) {
    console.error(`✗ Upload-Sitzung bei Meta abgelehnt: ${sitzung.status} ${sitzungText}`);
    return null;
  }
  const sitzungId = (JSON.parse(sitzungText) as { id?: string }).id;
  if (!sitzungId) {
    console.error(`✗ Upload-Sitzung ohne Kennung: ${sitzungText}`);
    return null;
  }
  const hoch = await fetch(`${graph}/${sitzungId}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${cfg.WHATSAPP_ACCESS_TOKEN}`, file_offset: "0" },
    body: Buffer.from(bytes),
  });
  const hochText = await hoch.text();
  if (!hoch.ok) {
    console.error(`✗ Hochladen des Mustervideos abgelehnt: ${hoch.status} ${hochText}`);
    return null;
  }
  const h = (JSON.parse(hochText) as { h?: string }).h;
  if (!h) {
    console.error(`✗ Meta hat keine Kennung für das Mustervideo geliefert: ${hochText}`);
    return null;
  }
  console.log("✓ Mustervideo bei Meta hochgeladen.");
  videoKennung = h;
  return h;
}

async function anlegen(v: Vorlage, video: string | null): Promise<string> {
  const components: unknown[] = [];
  if (video) components.push({ type: "HEADER", format: "VIDEO", example: { header_handle: [video] } });
  components.push({ type: "BODY", text: v.text }, { type: "FOOTER", text: VORLAGEN_FUSSZEILE });
  if (v.knopf) components.push({ type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: v.knopf }] });
  const res = await fetch(basis, {
    method: "POST",
    headers: kopf,
    body: JSON.stringify({ name: v.name, language: "de", category: "MARKETING", components }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Anlegen ${v.name}: ${res.status} ${text}`);
  return text;
}

for (const v of vorlagen) {
  if (v.text.length > 1024) {
    console.error(`✗ ${v.name}: Text hat ${v.text.length} Zeichen, Meta erlaubt 1024.`);
    process.exitCode = 1;
    continue;
  }
  const vorhanden = await status(v.name);
  if (vorhanden.length) {
    for (const s of vorhanden) {
      const grund = s.rejected_reason && s.rejected_reason !== "NONE" ? `, Ablehnungsgrund ${s.rejected_reason}` : "";
      console.log(`• ${v.name} (${s.language}, ${s.category}): ${s.status}${grund}, Meta-ID ${s.id}`);
    }
    continue;
  }
  if (nurStatus) {
    console.log(`• ${v.name}: bei Meta nicht vorhanden`);
    continue;
  }
  let video: string | null = null;
  if (v.video) {
    video = await holeVideoKennung();
    if (!video) {
      console.error(`✗ ${v.name}: ausgelassen, weil das Mustervideo fehlt.`);
      process.exitCode = 1;
      continue;
    }
  }
  console.log(`→ lege ${v.name} an (${v.text.length} Zeichen${v.video ? ", mit Video-Kopf" : ""}${v.knopf ? `, Knopf „${v.knopf}"` : ""}) …`);
  try {
    console.log(`  ${await anlegen(v, video)}`);
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
