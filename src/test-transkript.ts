// NUR TRANSKRIPTION — wandelt eine Sprachnachricht in Text um.
//
// Braucht ausschließlich den OPENAI_API_KEY (Whisper). Kein Anthropic-Key,
// keine Datenbank, kein E-Mail-Versand. Praktisch, solange der
// Anthropic-Zugang noch fehlt: Text herauskopieren und weiterverwenden.
//
// Aufruf:
//   npm run test:transkript -- sprachnachricht.opus
//   npm run test:transkript -- "C:\Pfad\mit Leerzeichen\memo.m4a"
//
// Unterstützt: .opus .ogg .oga (WhatsApp) · .m4a .mp3 .wav .webm (Handy-Memos)
import { existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { transkribiereAudio } from "./ai/transcribe.js";

const linie = (z = "─") => z.repeat(64);

async function main(): Promise<void> {
  const pfad = process.argv[2];

  if (!pfad) {
    console.error("\n❌ Keine Audiodatei angegeben.\n");
    console.error("Aufruf:  npm run test:transkript -- deine-datei.opus\n");
    console.error("Tipp: Die Datei am einfachsten direkt in den Projektordner legen,");
    console.error("      dann reicht der bloße Dateiname.\n");
    process.exit(1);
  }

  const voll = resolve(pfad);
  if (!existsSync(voll)) {
    console.error(`\n❌ Datei nicht gefunden:\n   ${voll}\n`);
    console.error("→ Stimmt der Dateiname? Groß-/Kleinschreibung beachten.\n");
    process.exit(1);
  }

  const groesseMb = statSync(voll).size / 1024 / 1024;
  if (groesseMb > 25) {
    console.error(`\n❌ Datei zu groß (${groesseMb.toFixed(1)} MB). Whisper erlaubt max. 25 MB.`);
    console.error("→ Kürzere Sprachnachricht aufnehmen (25 MB entsprechen ca. 2 Stunden).\n");
    process.exit(1);
  }

  console.log(`\n🎙️  Datei:  ${basename(voll)}  (${groesseMb.toFixed(2)} MB)`);
  console.log("   Transkribiere …");

  const start = Date.now();
  const transkript = await transkribiereAudio(readFileSync(voll), voll);
  const dauer = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`   fertig in ${dauer}s\n`);
  console.log(linie("═"));
  console.log("TRANSKRIPT — dieser Text geht später an die KI");
  console.log(linie("═"));
  console.log(transkript);
  console.log(linie("═"));

  // Zusätzlich als Datei ablegen — bequemer zum Kopieren als aus der Konsole
  const ausgabe = resolve("transkript.txt");
  writeFileSync(ausgabe, transkript, "utf-8");
  console.log(`\n💾 Auch gespeichert unter: ${ausgabe}`);
  console.log(`   Kosten: ca. ${(0.006 * Math.max(1, Number(dauer) / 6)).toFixed(3)} $ (Whisper: 0,6 ct/Minute)\n`);
}

main().catch((err) => {
  const text = String(err);
  console.error("\n❌ Transkription fehlgeschlagen:\n");
  console.error(err instanceof Error ? err.message : err);
  if (text.includes("401") || text.toLowerCase().includes("api key")) {
    console.error("\n→ Der OPENAI_API_KEY in der .env-Datei fehlt oder ist falsch.");
    console.error("  Holen unter: https://platform.openai.com → API Keys\n");
  } else if (text.includes("insufficient_quota") || text.includes("429")) {
    console.error("\n→ Kein Guthaben auf dem OpenAI-Konto. Unter Billing aufladen.\n");
  }
  process.exit(1);
});
