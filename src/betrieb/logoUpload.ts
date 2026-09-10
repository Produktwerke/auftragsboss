// Speichert ein vom Handwerker hochgeladenes Logo.
//
// Der Browser liest die Datei und schickt sie als data-URL (Base64) — so
// braucht der Server keine zusätzliche Upload-Bibliothek. Wir prüfen Format
// und Größe, entfernen ein evtl. vorhandenes altes Logo desselben Betriebs
// und legen die Datei unter uploads/ ab. Zurück kommt der Pfad, der in
// Handwerker.logoDatei gespeichert wird (ladeLogo() findet ihn dort wieder).
import { mkdirSync, writeFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { UPLOADS_DIR } from "./ablage.js";

const UPLOAD_DIR = UPLOADS_DIR;
const MAX_BYTES = 3 * 1024 * 1024; // 3 MB — reicht für ein Logo mit Reserve

const ENDUNG_JE_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
};

export class LogoFehler extends Error {}

/**
 * Nimmt eine data-URL entgegen und speichert das Logo. Wirft LogoFehler mit
 * einer für den Handwerker verständlichen Meldung, wenn etwas nicht stimmt.
 */
export function speichereLogo(handwerkerId: string, dataUrl: string): string {
  const treffer = /^data:([^;]+);base64,(.+)$/s.exec((dataUrl ?? "").trim());
  if (!treffer) throw new LogoFehler("Das war kein gültiges Bild.");

  const endung = ENDUNG_JE_MIME[treffer[1]!.toLowerCase()];
  if (!endung) throw new LogoFehler("Bitte ein PNG- oder JPG-Bild verwenden.");

  const daten = Buffer.from(treffer[2]!, "base64");
  if (daten.length < 50) throw new LogoFehler("Das Bild ist leer.");
  if (daten.length > MAX_BYTES) throw new LogoFehler("Das Bild ist zu groß (höchstens 3 MB).");

  mkdirSync(UPLOAD_DIR, { recursive: true });

  // Altes Logo dieses Betriebs entfernen — es könnte ein anderes Format haben.
  for (const f of readdirSync(UPLOAD_DIR)) {
    if (f.startsWith(`logo_${handwerkerId}.`)) {
      try {
        unlinkSync(join(UPLOAD_DIR, f));
      } catch {
        // Datei schon weg oder gesperrt — nicht schlimm, wird überschrieben.
      }
    }
  }

  const name = `logo_${handwerkerId}.${endung}`;
  writeFileSync(join(UPLOAD_DIR, name), daten);
  return `uploads/${name}`;
}

/** Entfernt das Logo eines Betriebs (für den „Logo entfernen"-Knopf). */
export function entferneLogo(handwerkerId: string): void {
  if (!existsSync(UPLOAD_DIR)) return;
  for (const f of readdirSync(UPLOAD_DIR)) {
    if (f.startsWith(`logo_${handwerkerId}.`)) {
      try {
        unlinkSync(join(UPLOAD_DIR, f));
      } catch {
        // ignorieren
      }
    }
  }
}
