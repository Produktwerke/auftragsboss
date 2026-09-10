// Ablage der Wandfotos je Betrieb und Vorgang.
//
// Fotos sind Kundendaten (Innenräume) und liegen wie das Logo in der
// Upload-Ablage (UPLOADS_DIR, siehe ablage.ts; im Nacht-Backup enthalten,
// nicht in Git). Struktur:
//   <UPLOADS_DIR>/fotos/<handwerkerId>/<vorgangId>/wand<N>_<zeit>.<endung>
// In der Datenbank steht der Pfad als "uploads/fotos/…".
// Beim DSGVO-Löschen eines Betriebs wird der ganze Betriebsordner entfernt,
// beim Löschen eines Angebots die zugehörigen Dateien (loescheFotoDatei).
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { UPLOADS_DIR, uploadPfad, liegtUnter } from "./ablage.js";

const FOTO_DIR = join(UPLOADS_DIR, "fotos");
export const FOTO_MAX_BYTES = 12 * 1024 * 1024; // WhatsApp-Bilder sind ≤ ~0,5 MB, Reserve für Originale

const ENDUNG_JE_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Nur sichere Bezeichner in Pfaden (cuid: Buchstaben/Ziffern) — nie Nutzertext.
const sicher = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "");

export class FotoFehler extends Error {}

/** Speichert ein Wandfoto und liefert den relativen Pfad für die Datenbank. */
export function speichereFoto(args: {
  handwerkerId: string;
  vorgangId: string;
  wandNr: number;
  daten: Buffer;
  mimeType: string;
}): string {
  const endung = ENDUNG_JE_MIME[args.mimeType.toLowerCase()];
  if (!endung) throw new FotoFehler("Bildformat wird nicht unterstützt.");
  if (args.daten.length < 100) throw new FotoFehler("Das Bild ist leer.");
  if (args.daten.length > FOTO_MAX_BYTES) throw new FotoFehler("Das Bild ist zu groß.");

  const ordner = join(FOTO_DIR, sicher(args.handwerkerId), sicher(args.vorgangId));
  mkdirSync(ordner, { recursive: true });
  const zeit = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "_");
  const name = `wand${Math.max(1, Math.floor(args.wandNr))}_${zeit}.${endung}`;
  writeFileSync(join(ordner, name), args.daten);
  return ["uploads", "fotos", sicher(args.handwerkerId), sicher(args.vorgangId), name].join("/");
}

/** Entfernt alle Fotos eines Betriebs (DSGVO-Löschkaskade). Best effort. */
export function loescheFotosVonBetrieb(handwerkerId: string): void {
  const ordner = join(FOTO_DIR, sicher(handwerkerId));
  if (!existsSync(ordner)) return;
  try {
    rmSync(ordner, { recursive: true, force: true });
  } catch {
    /* Dateien fehlen schon oder sind gesperrt — DB-Löschung ist maßgeblich */
  }
}

/** Absoluter Pfad zu einem DB-Fotopfad, oder null, wenn er nicht in die Fotoablage zeigt. */
function fotoPfad(relPfad: string): string | null {
  if (!relPfad) return null;
  const pfad = uploadPfad(relPfad);
  return liegtUnter(pfad, FOTO_DIR) ? pfad : null;
}

/**
 * Liest ein gespeichertes Foto anhand des relativen Pfads aus der Datenbank.
 * Nur Pfade unterhalb der Fotoablage werden bedient (kein Ausbruch per "..").
 */
export function liesFoto(relPfad: string): Buffer | null {
  const pfad = fotoPfad(relPfad);
  if (!pfad || !existsSync(pfad)) return null;
  try {
    return readFileSync(pfad);
  } catch {
    return null;
  }
}

/** Löscht die Datei eines Fotos (beim Löschen eines Angebots). Liefert true, wenn etwas gelöscht wurde. */
export function loescheFotoDatei(relPfad: string): boolean {
  const pfad = fotoPfad(relPfad);
  if (!pfad || !existsSync(pfad)) return false;
  try {
    unlinkSync(pfad);
    return true;
  } catch {
    return false;
  }
}
