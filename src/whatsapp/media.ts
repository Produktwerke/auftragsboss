// Download von WhatsApp-Medien (Sprachnachrichten UND Bilder) über die Meta
// Graph API. Zwei Schritte: (1) Media-URL per Media-ID abfragen, (2) Binärdaten
// laden. Beide Requests brauchen den Bearer-Token.
import { whatsappConfig } from "../config.js";

/** Lädt beliebige WhatsApp-Medien und liefert Bytes samt MIME-Typ. */
async function ladeMedia(mediaId: string): Promise<{ daten: Buffer; mimeType: string }> {
  const cfg = whatsappConfig();
  const authHeader = { Authorization: `Bearer ${cfg.WHATSAPP_ACCESS_TOKEN}` };
  const base = `https://graph.facebook.com/${cfg.GRAPH_API_VERSION}`;

  // 1. Media-Metadaten (enthält die kurzlebige Download-URL)
  const metaRes = await fetch(`${base}/${mediaId}`, { headers: authHeader });
  if (!metaRes.ok) {
    throw new Error(`Media-Metadaten fehlgeschlagen (${metaRes.status}): ${await metaRes.text()}`);
  }
  const meta = (await metaRes.json()) as { url: string; mime_type: string };

  // 2. Eigentlicher Download
  const res = await fetch(meta.url, { headers: authHeader });
  if (!res.ok) {
    throw new Error(`Media-Download fehlgeschlagen (${res.status})`);
  }
  return { daten: Buffer.from(await res.arrayBuffer()), mimeType: meta.mime_type };
}

/** Sprachnachricht als Buffer (für die Transkription). */
export async function ladeAudio(mediaId: string): Promise<Buffer> {
  return (await ladeMedia(mediaId)).daten;
}

/** Bild als Buffer + MIME-Typ (für die Vision-Auswertung). */
export async function ladeBild(mediaId: string): Promise<{ daten: Buffer; mimeType: string }> {
  return ladeMedia(mediaId);
}
