// Kostenprobe (15.09.2026): dieselben echten Verläufe durch mehrere Modell-/
// Denktiefe-Konfigurationen schicken und Ergebnis, Token und Kosten
// nebeneinanderlegen. Läuft auf dem Server (Schlüssel + Datenbank):
//   su - auftragsboss -c 'cd ~/app && npx tsx scratch/kosten-probe.ts'
// Schreibt scratch/kosten-probe-ergebnis.md (nicht ins Repo).
import "../src/env.js";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { strukturiereDialog, type KiOptionen } from "../src/ai/structure.js";
import { ladePreisliste } from "../src/preisliste.js";
import { alsDialog } from "../src/dialog.js";
import { berechneAufmass, parseRaeumeText, wendeAufmassAn } from "../src/maler/aufmass.js";

/** Listenpreise in $ je 1 Mio. Token: [ein, aus, cacheLesen, cacheSchreiben1h]. */
const PREISE: Record<string, [number, number, number, number]> = {
  "claude-fable-5": [10, 50, 1, 20],
  "claude-opus-5": [5, 25, 0.5, 10],
  "claude-sonnet-5": [2, 10, 0.2, 4],
};
const KONFIGS: Array<{ name: string; optionen: KiOptionen }> = [
  { name: "Fable 5 / high (heute)", optionen: { modell: "claude-fable-5", effort: "high" } },
  { name: "Fable 5 / medium", optionen: { modell: "claude-fable-5", effort: "medium" } },
  { name: "Opus 5 / high", optionen: { modell: "claude-opus-5", effort: "high" } },
  { name: "Opus 5 / medium", optionen: { modell: "claude-opus-5", effort: "medium" } },
];
const ANZAHL = Number(process.argv[2] ?? 5);

const prisma = new PrismaClient();
const vorgaenge = await prisma.vorgang.findMany({
  where: { dokumentId: { not: null } },
  orderBy: { letzteAktivitaet: "desc" },
  take: ANZAHL,
  include: { handwerker: true },
});
await prisma.$disconnect();
const preisliste = ladePreisliste();

const md: string[] = [`# Kostenprobe ${new Date().toLocaleString("de-DE")}`, "", `${vorgaenge.length} Verläufe × ${KONFIGS.length} Konfigurationen.`, ""];
const summen = new Map<string, { usd: number; sek: number; n: number }>();

for (const v of vorgaenge) {
  // Dialog ohne die Abschluss-Vermerke des Programms, wie ihn die KI beim letzten Mal sah
  const dialog = alsDialog(v).filter((n) => !(n.rolle === "assistent" && n.text.startsWith("(")));
  const handwerkerText = dialog.filter((n) => n.rolle === "handwerker").length;
  md.push(`## Verlauf ${v.id.slice(-6)} (${dialog.length} Nachrichten, ${handwerkerText} vom Maler)`, "");
  md.push("```", dialog.map((n) => `${n.rolle}: ${n.text.slice(0, 160).replace(/\n/g, " ")}`).join("\n"), "```", "");
  for (const k of KONFIGS) {
    const start = Date.now();
    let usage = { ein: 0, aus: 0, gelesen: 0, geschrieben: 0 };
    try {
      const daten = await strukturiereDialog(
        dialog,
        preisliste,
        (ein, aus, cache) => {
          usage = { ein, aus, gelesen: cache?.gelesen ?? 0, geschrieben: cache?.geschrieben ?? 0 };
        },
        k.optionen,
      );
      const sek = (Date.now() - start) / 1000;
      const p = PREISE[k.optionen.modell!]!;
      const usd = (usage.ein * p[0] + usage.aus * p[1] + usage.gelesen * p[2] + usage.geschrieben * p[3]) / 1e6;
      const s = summen.get(k.name) ?? { usd: 0, sek: 0, n: 0 };
      summen.set(k.name, { usd: s.usd + usd, sek: s.sek + sek, n: s.n + 1 });
      const aufmass = berechneAufmass(parseRaeumeText(daten.raeumeText));
      const positionen = wendeAufmassAn(daten.positionen, aufmass);
      md.push(`### ${k.name}: ${usd.toFixed(2)} $, ${sek.toFixed(0)} s`);
      md.push(`Token ein ${usage.ein}, Cache gelesen ${usage.gelesen}, geschrieben ${usage.geschrieben}, aus ${usage.aus}`);
      md.push(`Dialog: **${daten.dialog.aktion}** ${daten.dialog.nachricht ? "„" + daten.dialog.nachricht.slice(0, 200).replace(/\n/g, " ") + "“" : ""}`);
      md.push(`Kunde: ${daten.kunde.name ?? "-"}, ${daten.kunde.strasse ?? "-"}, ${daten.kunde.plzOrt ?? "-"} | Objekt: ${daten.objekt ?? "-"}`);
      md.push(`Räume: ${daten.raeumeText ? daten.raeumeText.replace(/\n/g, " ‖ ") : "-"}`);
      md.push(`Fehlende Infos: ${daten.fehlendeInfos.map((f) => `${f.feld} (${f.wichtigkeit})`).join(", ") || "-"}`);
      md.push(`Positionen (${positionen.length}):`);
      for (const pos of positionen) {
        md.push(`- [${pos.kategorie}] ${pos.beschreibung.replace(/\n/g, " ")} | ${pos.menge ?? "?"} ${pos.einheit} | ${pos.einzelpreis ?? "-"} € | ${pos.raumBezug ?? "-"}${pos.vorschlag ? " | Vorschlag" : ""}`);
      }
      md.push("");
    } catch (err) {
      md.push(`### ${k.name}: FEHLER ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`, "");
    }
  }
}

md.push("## Summe", "", "| Konfiguration | Kosten gesamt | je Auswertung | Dauer je Auswertung |", "|---|---|---|---|");
for (const [name, s] of summen) md.push(`| ${name} | ${s.usd.toFixed(2)} $ | ${(s.usd / s.n).toFixed(2)} $ | ${(s.sek / s.n).toFixed(0)} s |`);
writeFileSync("scratch/kosten-probe-ergebnis.md", md.join("\n"));
console.log(md.slice(-KONFIGS.length - 4).join("\n"));
console.log("\nErgebnis: scratch/kosten-probe-ergebnis.md");
