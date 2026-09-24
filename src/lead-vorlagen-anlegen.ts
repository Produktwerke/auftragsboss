// Legt die beiden Rückfall-Vorlagen für das Lead-Onboarding bei Meta an (24.09.2026):
//   lead_erklaerung   (Erklärung nach „Kurz erklären", mit Knopf „Angebot ausprobieren")
//   lead_aufforderung (Aufforderung zur Sprachnachricht nach „Ja, los geht's")
// Beide beginnen mit einer kurzen Entschuldigung, weil sie nur rausgehen, wenn Meta unsere
// freie Antwort abgewiesen hat (131047) oder der Betreiber sie im Cockpit auslöst.
//
// Läuft auf dem Server (Token aus der .env), VERÄNDERT etwas bei Meta → nur mit Dirks Freigabe:
//   cd /home/auftragsboss/app && npx tsx src/lead-vorlagen-anlegen.ts          # anlegen (idempotent)
//   cd /home/auftragsboss/app && npx tsx src/lead-vorlagen-anlegen.ts status   # nur Status abfragen
// Texte kommen aus src/lead/onboarding.ts (eine Quelle). Nach Genehmigung durch Meta nichts
// weiter nötig: die Standardnamen sind im Code hinterlegt (überschreibbar per
// LEAD_VORLAGE_ERKLAERUNG / LEAD_VORLAGE_AUFFORDERUNG in der .env).
import "./env.js";
import { whatsappConfig } from "./config.js";
import {
  VORLAGE_ERKLAERUNG_TEXT,
  VORLAGE_AUFFORDERUNG_TEXT,
  VORLAGEN_FUSSZEILE,
  VORLAGE_ERKLAERUNG_KNOPF,
  vorlageErklaerungName,
  vorlageAufforderungName,
} from "./lead/onboarding.js";

const WABA_ID = process.env.WHATSAPP_WABA_ID?.trim() || "1680177866376806"; // Produktions-WABA „AuftragsBoss"
const nurStatus = process.argv.includes("status");

type Vorlage = { name: string; text: string; knopf?: string };
const vorlagen: Vorlage[] = [
  { name: vorlageErklaerungName(), text: VORLAGE_ERKLAERUNG_TEXT, knopf: VORLAGE_ERKLAERUNG_KNOPF },
  { name: vorlageAufforderungName(), text: VORLAGE_AUFFORDERUNG_TEXT },
];

const cfg = whatsappConfig();
const basis = `https://graph.facebook.com/${cfg.GRAPH_API_VERSION}/${WABA_ID}/message_templates`;
const kopf = { Authorization: `Bearer ${cfg.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" };

async function status(name: string): Promise<Array<{ id: string; status: string; language: string; category: string }>> {
  const res = await fetch(`${basis}?name=${encodeURIComponent(name)}&fields=id,name,status,language,category`, { headers: kopf });
  if (!res.ok) throw new Error(`Statusabfrage ${name}: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { data?: Array<{ id: string; name: string; status: string; language: string; category: string }> };
  return (j.data ?? []).filter((v) => v.name === name);
}

async function anlegen(v: Vorlage): Promise<string> {
  const components: unknown[] = [{ type: "BODY", text: v.text }, { type: "FOOTER", text: VORLAGEN_FUSSZEILE }];
  if (v.knopf) components.push({ type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: v.knopf }] });
  const res = await fetch(basis, {
    method: "POST",
    headers: kopf,
    body: JSON.stringify({ name: v.name, language: "de", category: "MARKETING", components }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Anlegen ${v.name}: ${res.status} ${text}`);
  return text;
}

for (const v of vorlagen) {
  if (v.text.length > 1024) {
    console.error(`✗ ${v.name}: Text hat ${v.text.length} Zeichen, Meta erlaubt 1024.`);
    process.exitCode = 1;
    continue;
  }
  const vorhanden = await status(v.name);
  if (vorhanden.length) {
    for (const s of vorhanden) console.log(`• ${v.name} (${s.language}, ${s.category}): ${s.status}, Meta-ID ${s.id}`);
    continue;
  }
  if (nurStatus) {
    console.log(`• ${v.name}: bei Meta nicht vorhanden`);
    continue;
  }
  console.log(`→ lege ${v.name} an (${v.text.length} Zeichen${v.knopf ? `, Knopf „${v.knopf}"` : ""}) …`);
  console.log(`  ${await anlegen(v)}`);
}
