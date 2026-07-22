// KI-Testlauf OHNE WhatsApp, ohne E-Mail, ohne Datenbank.
//
// Zeigt, was Claude aus einem Diktat macht — das ist die Kernfrage:
// Ist das Ergebnis gut genug, um damit zum Kunden zu gehen?
//
// Aufruf:
//   npm run test:ki                      → mit eingebautem Beispiel-Diktat
//   npm run test:ki -- mein-text.txt     → mit eigenem getippten Text
//   npm run test:ki -- sprachmemo.m4a    → mit echter Sprachaufnahme (braucht OpenAI-Key)
import { readFileSync } from "node:fs";
import { strukturiereTranskript } from "./ai/structure.js";
import { transkribiereAudio } from "./ai/transcribe.js";

// ── Hier kannst du deinen eigenen Betrieb eintragen ────────
const TEST_BETRIEB = {
  firma: "Mustermann Haustechnik GmbH",
  name: "Max Mustermann",
  gewerk: "Sanitär / Heizung",
};

const BEISPIEL_DIKTAT = `
So, ich bin gerade bei Familie Müller in der Gartenstraße 12 fertig geworden.
Wir haben heute die Gastherme gewartet, also Brenner gereinigt, Düsen kontrolliert
und das Ausdehnungsgefäß getauscht, das war komplett hinüber. Ähm, waren
ungefähr zweieinhalb Stunden. Material war das neue Ausdehnungsgefäß 18 Liter
und zwei Dichtungen. Wichtig: Ich hab die Frau Müller drauf hingewiesen, dass
das Eckventil im Gäste-WC tropft, das müsste eigentlich auch gemacht werden,
das wollte sie sich aber noch überlegen. Und wir haben ausgemacht, nächste
Woche Dienstag komme ich nochmal vorbei wegen dem Heizkörper im Schlafzimmer,
der wird nicht richtig warm.
`.trim();

const AUDIO_ENDUNGEN = ["ogg", "oga", "opus", "m4a", "mp3", "wav", "webm", "mp4"];
const linie = (z = "─") => z.repeat(64);

async function main(): Promise<void> {
  const arg = process.argv[2];
  let transkript: string;

  if (!arg) {
    console.log("ℹ️  Kein Argument übergeben — nutze das eingebaute Beispiel-Diktat.\n");
    transkript = BEISPIEL_DIKTAT;
  } else {
    const endung = arg.split(".").pop()?.toLowerCase() ?? "";
    if (AUDIO_ENDUNGEN.includes(endung)) {
      console.log(`🎙️  Transkribiere Audiodatei: ${arg} …`);
      const start = Date.now();
      transkript = await transkribiereAudio(readFileSync(arg), arg);
      console.log(`   fertig in ${((Date.now() - start) / 1000).toFixed(1)}s\n`);
    } else {
      console.log(`📄 Lese Textdatei: ${arg}\n`);
      transkript = readFileSync(arg, "utf-8").trim();
    }
  }

  console.log(linie("═"));
  console.log("EINGABE — so kommt es rein (Rohtext des Diktats)");
  console.log(linie("═"));
  console.log(transkript);

  console.log("\n🤖 Claude strukturiert das Diktat …");
  const start = Date.now();
  const d = await strukturiereTranskript(transkript, TEST_BETRIEB);
  const dauer = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`   fertig in ${dauer}s\n`);

  console.log(linie("═"));
  console.log("ERGEBNIS 1 — Protokoll zum Weiterleiten an den Kunden");
  console.log(linie("═"));
  console.log(d.protokoll_text);

  console.log("\n" + linie("═"));
  console.log("ERGEBNIS 2 — Interner Archiv-Eintrag");
  console.log(linie("═"));
  console.log(`Kunde:          ${d.kunde.name ?? "—"}`);
  console.log(`Adresse:        ${d.kunde.adresse ?? "—"}`);
  console.log(`Gewerk:         ${d.auftrag.gewerk ?? "—"}`);
  console.log(`Arbeitszeit:    ${d.auftrag.arbeitszeit ?? "—"}`);
  console.log("Leistungen:");
  for (const l of d.auftrag.leistungen) {
    console.log(`   • ${l.beschreibung}${l.menge ? ` (${l.menge})` : ""}`);
  }
  console.log(`Material:       ${d.auftrag.material.join(", ") || "—"}`);
  console.log(`⚠️  Besonderheiten: ${d.auftrag.besonderheiten ?? "—"}`);
  console.log(`📅 Folgetermin:  ${d.auftrag.folgetermin ?? "—"}`);

  const jahre = d.gewaehrleistung.typ === "BAUWERK_5_JAHRE" ? 5 : 2;
  const ablauf = new Date();
  ablauf.setFullYear(ablauf.getFullYear() + jahre);
  const vorwarnung = new Date(ablauf);
  vorwarnung.setMonth(vorwarnung.getMonth() - 3);
  const alsDatum = (dt: Date) => dt.toLocaleDateString("de-DE");

  console.log("\n" + linie("═"));
  console.log("ERGEBNIS 3 — Gewährleistungs-Tracking");
  console.log(linie("═"));
  console.log(`Frist:          ${jahre} Jahre (§ 634a BGB)`);
  console.log(`Begründung:     ${d.gewaehrleistung.begruendung}`);
  console.log(`Läuft ab:       ${alsDatum(ablauf)}`);
  console.log(`🔔 Erinnerung:  ${alsDatum(vorwarnung)} — Wartungsangebot machen!`);

  console.log("\n" + linie());
  console.log("✅ Testlauf erfolgreich. Kosten: ca. 5–15 Cent.");
  console.log(linie());
}

main().catch((err) => {
  console.error("\n❌ Testlauf fehlgeschlagen:\n");
  console.error(err instanceof Error ? err.message : err);
  if (String(err).includes("authentication") || String(err).includes("401")) {
    console.error("\n→ Der API-Key in der .env-Datei scheint falsch zu sein.");
  }
  process.exit(1);
});
