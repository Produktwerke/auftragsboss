// Bildprüfung anhand der ersten Bytes (Magic Bytes), Nach-Audit 10.09., F-04.
//
// Der MIME-Typ, den WhatsApp oder ein Upload mitschickt, ist eine Behauptung.
// Maßgeblich ist, was in der Datei steht: Nur JPEG, PNG, WebP und GIF werden
// gespeichert und an die KI geschickt, und zwar mit dem Typ, den die Bytes
// belegen. Alles andere (HTML, SVG, PDF, umbenannte Dateien) wird abgewiesen.

export type BildTyp = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export const ENDUNG_JE_BILDTYP: Record<BildTyp, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Liefert den belegten Bildtyp oder null, wenn die Bytes zu keinem erlaubten Format passen. */
export function erkenneBildTyp(daten: Buffer): BildTyp | null {
  if (daten.length < 12) return null;
  if (daten[0] === 0xff && daten[1] === 0xd8 && daten[2] === 0xff) return "image/jpeg";
  if (daten[0] === 0x89 && daten[1] === 0x50 && daten[2] === 0x4e && daten[3] === 0x47 && daten[4] === 0x0d && daten[5] === 0x0a && daten[6] === 0x1a && daten[7] === 0x0a) return "image/png";
  if (daten.toString("latin1", 0, 4) === "RIFF" && daten.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  const gif = daten.toString("latin1", 0, 6);
  if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";
  return null;
}
