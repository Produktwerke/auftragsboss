// Download von WhatsApp-Sprachnachrichten über die Meta Graph API.
// Zwei Schritte: (1) Media-URL per Media-ID abfragen, (2) Binärdaten laden.
// Beide Requests brauchen den Bearer-Token.
import { whatsappConfig } from "../config.js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export async function ladeAudio(mediaId: string): Promise<Buffer> {
  const authHeader = { Authorization: `Bearer ${whatsappConfig().WHATSAPP_ACCESS_TOKEN}` };

  // 1. Media-Metadaten (enthält die kurzlebige Download-URL)
  const metaRes = await fetch(`${GRAPH_BASE}/${mediaId}`, { headers: authHeader });
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
