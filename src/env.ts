// Lädt die .env-Zugangsdaten. Suchreihenfolge (erster Treffer gewinnt):
//   1. .env im Projektordner (so läuft der Server: /root/app/.env)
//   2. ~/Dropbox/AuftragsBoss/.env — Dirks privater, zwischen seinen Rechnern
//      synchronisierter Ablageort (bewusst NICHT im Firmen-OneDrive)
//   3. ~/.auftragsboss/.env — Reserve für Rechner ohne Dropbox
import { config as ladeUmgebung } from "dotenv";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const kandidaten = [
  join(process.cwd(), ".env"),
  join(homedir(), "Dropbox", "AuftragsBoss", ".env"),
  join(homedir(), ".auftragsboss", ".env"),
];
const gefunden = kandidaten.find((pfad) => existsSync(pfad));
if (gefunden) ladeUmgebung({ path: gefunden, quiet: true });
