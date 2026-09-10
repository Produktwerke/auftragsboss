// Ablageort für hochgeladene Dateien (Logos, Wandfotos).
//
// Standard ist uploads/ im Projektordner (lokal, Tests). Auf dem Server zeigt
// UPLOADS_DIR auf ein eigenes Datenverzeichnis AUSSERHALB des App-Ordners
// (/home/auftragsboss/daten/uploads), genau wie die Datenbank. Grund: Ein
// Deploy-Paket wird in den App-Ordner entpackt; Kundendaten, die dort nicht
// liegen, kann es strukturell nicht beschädigen (Nach-Audit 10.09.2026, S-01).
//
// In der Datenbank stehen die Pfade weiterhin als "uploads/<…>" (so waren sie
// schon immer); uploadPfad() bildet das auf den echten Ordner ab.
import { resolve, join, sep } from "node:path";

export const UPLOADS_DIR = resolve(process.env.UPLOADS_DIR?.trim() || "uploads");

/** "uploads/fotos/a/b/c.jpg" → absoluter Pfad im echten Ablageordner. */
export function uploadPfad(relPfad: string): string {
  const rel = relPfad.replace(/\\/g, "/").replace(/^\.?\/?uploads\//, "");
  return join(UPLOADS_DIR, ...rel.split("/").filter(Boolean));
}

/** true, wenn der DB-Pfad in die Upload-Ablage zeigt (statt z.B. auf das Demo-Logo im Projektordner). */
export function istUploadPfad(relPfad: string): boolean {
  return /^\.?\/?uploads\//.test(relPfad.replace(/\\/g, "/"));
}

/** Pfad liegt innerhalb des Ordners (kein Ausbruch per ".." oder Präfix-Trick wie "uploads-x"). */
export function liegtUnter(pfad: string, ordner: string): boolean {
  return pfad === ordner || pfad.startsWith(ordner + sep);
}
