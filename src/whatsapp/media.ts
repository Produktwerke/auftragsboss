// Download von WhatsApp-Medien (Sprachnachrichten UND Bilder) über die Meta
// Graph API. Zwei Schritte: (1) Media-URL per Media-ID abfragen, (2) Binärdaten
// laden. Beide Requests brauchen den Bearer-Token.
//
// Größenkappung (Nach-Audit 10.09., F-03): Was Meta liefert, ist Fremdinhalt.
// Vor dem Download zählt Content-Length, beim Download wird der Strom nach der
// Grenze abgebrochen, damit ein manipuliertes Medium nie ungebremst in den
// Arbeitsspeicher oder an die KI läuft.
import { whatsappConfig } from "../config.js";

/** Obergrenzen je Medientyp. Bilder: Anthropic nimmt max. 5 MB je Bild, WhatsApp
 *  komprimiert Fotos ohnehin auf < 1 MB. Audio: WhatsApp-Limit 16 MB. */
export const BILD_MAX_BYTES = 5 * 1024 * 1024;
export const AUDIO_MAX_BYTES = 16 * 1024 * 1024;

export class MediumZuGross extends Error {
  constructor(readonly maxBytes: number) {
    super(`Medium überschreitet ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    this.name = "MediumZuGross";
  }
}

/** Liest einen Antwortkörper mit harter Obergrenze; bricht bei Überschreitung ab. */
export async function liesBegrenzt(res: Response, maxBytes: number): Promise<Buffer> {
  const angekuendigt = Number(res.headers.get("content-length") ?? "0");
  if (angekuendigt > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw new MediumZuGross(maxBytes);
  }
  if (!res.body) return Buffer.from(await res.arrayBuffer());
  const teile: Uint8Array[] = [];
  let summe = 0;
  const leser = res.body.getReader();
  for (;;) {
    const { done, value } = await leser.read();
    if (done) break;
    summe += value.byteLength;
    if (summe > maxBytes) {
      await leser.cancel().catch(() => undefined);
      throw new MediumZuGross(maxBytes);
    }
    teile.push(value);
  }
  return Buffer.concat(teile);
}

/** Lädt beliebige WhatsApp-Medien und liefert Bytes samt MIME-Typ. */
async function ladeMedia(mediaId: string, maxBytes: number): Promise<{ daten: Buffer; mimeType: string }> {
  const cfg = whatsappConfig();
  const authHeader = { Authorization: `Bearer ${cfg.WHATSAPP_ACCESS_TOKEN}` };
  const base = `https://graph.facebook.com/${cfg.GRAPH_API_VERSION}`;

  // 1. Media-Metadaten (enthält die kurzlebige Download-URL und die Dateigröße)
  const metaRes = await fetch(`${base}/${mediaId}`, { headers: authHeader });
  if (!metaRes.ok) {
    throw new Error(`Media-Metadaten fehlgeschlagen (${metaRes.status}): ${await metaRes.text()}`);
  }
  const meta = (await metaRes.json()) as { url: string; mime_type: string; file_size?: number };
  if (typeof meta.file_size === "number" && meta.file_size > maxBytes) throw new MediumZuGross(maxBytes);

  // 2. Eigentlicher Download, gekappt
  const res = await fetch(meta.url, { headers: authHeader });
  if (!res.ok) {
    throw new Error(`Media-Download fehlgeschlagen (${res.status})`);
  }
  return { daten: await liesBegrenzt(res, maxBytes), mimeType: meta.mime_type };
}

/** Sprachnachricht als Buffer (für die Transkription). */
export async function ladeAudio(mediaId: string): Promise<Buffer> {
  return (await ladeMedia(mediaId, AUDIO_MAX_BYTES)).daten;
}

/** Bild als Buffer + MIME-Typ (für die Vision-Auswertung). */
export async function ladeBild(mediaId: string): Promise<{ daten: Buffer; mimeType: string }> {
  return ladeMedia(mediaId, BILD_MAX_BYTES);
}
