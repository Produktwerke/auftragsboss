// Download von WhatsApp-Sprachnachrichten über die Meta Graph API.
// Zwei Schritte: (1) Media-URL per Media-ID abfragen, (2) Binärdaten laden.
// Beide Requests brauchen den Bearer-Token.
import { whatsappConfig } from "../config.js";

export async function ladeAudio(mediaId: string): Promise<Buffer> {
  const cfg = whatsappConfig();
  const authHeader = { Authorization: `Bearer ${cfg.WHATSAPP_ACCESS_TOKEN}` };
  const base = `https://graph.facebook.com/${cfg.GRAPH_API_VERSION}`;

  // 1. Media-Metadaten (enthält die kurzlebige Download-URL)
  const metaRes = await fetch(`${base}/${mediaId}`, { headers: authHeader });
  if (!metaRes.ok) {
    throw new Error(`Media-Metadaten fehlgeschlagen (${metaRes.status}): ${await metaRes.text()}`);
  }
  const meta = (await metaRes.json()) as { url: string; mime_type: string };

  // 2. Eigentlicher Audio-Download
  const audioRes = await fetch(meta.url, { headers: authHeader });
  if (!audioRes.ok) {
    throw new Error(`Audio-Download fehlgeschlagen (${audioRes.status})`);
  }
  return Buffer.from(await audioRes.arrayBuffer());
}
