// Lädt die .env-Zugangsdaten, ausschließlich aus dem Projektordner (so läuft
// der Server: /home/auftragsboss/app/.env).
//
// Seit 10.09.2026 gibt es bewusst KEINE lokale Kopie der Schlüssel mehr, auch
// keine in Dropbox oder im Home-Verzeichnis (Entscheidung Dirk: „ganz wie Tyra").
// KI-Proben und Prüfstände laufen auf dem Server; lokal laufen nur Tests und der
// Editor-Vorschau-Server, die keine Schlüssel brauchen. Fehlt die Datei, läuft
// das Programm weiter und meldet fehlende Werte erst dort, wo sie gebraucht werden.
import { config as ladeUmgebung } from "dotenv";
import { existsSync } from "node:fs";
import { join } from "node:path";

const pfad = join(process.cwd(), ".env");
if (existsSync(pfad)) ladeUmgebung({ path: pfad, quiet: true });
