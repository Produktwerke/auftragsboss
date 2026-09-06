// Ablage der Wandfotos je Betrieb und Vorgang.
//
// Fotos sind Kundendaten (Innenräume) und liegen wie das Logo unter uploads/
// (im Nacht-Backup enthalten, nicht in Git). Struktur:
//   uploads/fotos/<handwerkerId>/<vorgangId>/wand<N>_<zeit>.<endung>
// Beim DSGVO-Löschen eines Betriebs wird der ganze Betriebsordner entfernt.
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const FOTO_DIR = resolve("uploads", "fotos");
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
  return join("uploads", "fotos", sicher(args.handwerkerId), sicher(args.vorgangId), name).replace(/\\/g, "/");
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

/**
 * Liest ein gespeichertes Foto anhand des relativen Pfads aus der Datenbank.
 * Nur Pfade unterhalb von uploads/fotos werden bedient (kein Ausbruch per "..").
 */
export function liesFoto(relPfad: string): Buffer | null {
  const pfad = resolve(relPfad);
  if (!pfad.startsWith(FOTO_DIR)) return null;
  if (!existsSync(pfad)) return null;
  try {
    return readFileSync(pfad);
  } catch {
    return null;
  }
}
