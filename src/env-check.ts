// Prüft die .env auf Korrektheit, OHNE Geheimnisse im Klartext auszugeben.
// Aufruf (auf dem Server):  npx tsx src/env-check.ts   (liest ./.env)
//                     oder:  npx tsx src/env-check.ts /pfad/zur/.env
import { readFileSync } from "node:fs";
import { bekannteSchluessel } from "./config.js";

// Gültige Schlüssel kommen aus den Schemata in config.ts (D-05): neue Werte
// dort anlegen, hier nichts mehr nachpflegen. Alles andere ist vermutlich Tippfehler.
const BEKANNT = bekannteSchluessel();
const PFLICHT = [
  "DATABASE_URL", "ANTHROPIC_API_KEY", "OPENAI_API_KEY",
  "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET",
  "SESSION_SECRET",
];
const SMTP = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"];

const pfad = process.argv[2] || ".env";
let roh: string;
try {
  roh = readFileSync(pfad, "utf-8");
} catch {
  console.error(`❌ .env nicht gefunden unter "${pfad}".`);
  process.exit(1);
}

const wert: Record<string, string> = {};
const probleme: string[] = [];
roh.split(/\r?\n/).forEach((zeile, i) => {
  const t = zeile.trim();
  if (!t || t.startsWith("#")) return;
  const m = t.match(/^([A-Za-z0-9_]+)\s*=(.*)$/);
  if (!m) {
    probleme.push(`Zeile ${i + 1}: keine gültige KEY=VALUE-Zeile → "${zeile.slice(0, 40)}"`);
    return;
  }
  const key = m[1];
  wert[key] = m[2].trim().replace(/^["']|["']$/g, "");
  if (!BEKANNT.has(key)) probleme.push(`Zeile ${i + 1}: unbekannter Schlüssel "${key}" (Tippfehler? falsche Groß/Kleinschreibung?)`);
});

for (const k of PFLICHT) if (!wert[k]) probleme.push(`Pflichtfeld fehlt oder leer: ${k}`);

// Format-Checks
if (wert.ANTHROPIC_API_KEY && !wert.ANTHROPIC_API_KEY.startsWith("sk-ant-"))
  probleme.push("ANTHROPIC_API_KEY sollte mit 'sk-ant-' beginnen.");
if (wert.WHATSAPP_PHONE_NUMBER_ID && !/^\d{5,}$/.test(wert.WHATSAPP_PHONE_NUMBER_ID))
  probleme.push("WHATSAPP_PHONE_NUMBER_ID sollte die lange Zahl (Phone-Number-ID) sein, nicht die Telefonnummer.");
if (wert.WHATSAPP_VERIFY_TOKEN && wert.WHATSAPP_VERIFY_TOKEN.length < 8)
  probleme.push("WHATSAPP_VERIFY_TOKEN ist recht kurz (min. 8 Zeichen empfohlen).");
for (const k of ["WHATSAPP_APP_SECRET", "SESSION_SECRET"])
  if (wert[k] && wert[k].length < 16) probleme.push(`${k} ist kürzer als 16 Zeichen — der Server startet damit nicht (Boot-Gate).`);
if (wert.GRAPH_API_VERSION && !/^v\d+\.\d+$/.test(wert.GRAPH_API_VERSION))
  probleme.push("GRAPH_API_VERSION sollte im Format vXX.0 sein (z.B. v23.0).");
const smtpGesetzt = SMTP.filter((k) => wert[k]);
if (smtpGesetzt.length > 0 && smtpGesetzt.length < SMTP.length)
  probleme.push(`SMTP nur teilweise gesetzt (${smtpGesetzt.length}/5) — für den E-Mail-Versand alle fünf setzen.`);

const maske = (v: string): string =>
  !v ? "(leer)" : v.length <= 6 ? "***" : `${v.slice(0, 3)}…${v.slice(-2)} [${v.length} Zeichen]`;

console.log(`\n.env geprüft: ${pfad}\n${"-".repeat(50)}`);
for (const k of Object.keys(wert)) console.log(`  ${k} = ${maske(wert[k])}`);
console.log("-".repeat(50));
if (probleme.length === 0) {
  console.log("✓ Alles ok: Struktur gültig, Pflichtfelder vorhanden, keine unbekannten Schlüssel.");
} else {
  console.log(`⚠ ${probleme.length} Hinweis(e):`);
  for (const p of probleme) console.log(`  - ${p}`);
}
console.log("");
process.exit(0);
