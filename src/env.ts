// Lädt die .env-Zugangsdaten. Suchreihenfolge:
//   1. .env im Projektordner (so läuft der Server: /root/app/.env)
//   2. .env im privaten Nutzerordner ~/.auftragsboss/ — für Rechner, auf denen
//      die Schlüssel NICHT im (z. B. per OneDrive synchronisierten)
//      Projektordner liegen sollen.
import { config as ladeUmgebung } from "dotenv";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const imProjekt = join(process.cwd(), ".env");
const imNutzerordner = join(homedir(), ".auftragsboss", ".env");
ladeUmgebung({ path: existsSync(imProjekt) ? imProjekt : imNutzerordner, quiet: true });
