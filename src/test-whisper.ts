// Vergleicht Whisper-Prompt-Varianten an derselben Audiodatei.
//
// Hintergrund: Der "prompt" bei Whisper ist kein Befehl, sondern ein
// Erwartungshorizont — er beeinflusst, welche Wörter das Modell bevorzugt
// hört. Eine lange Fachbegriffsliste kann Hörfehler beheben, aber auch dazu
// führen, dass gesprochene Passagen ÜBERGANGEN werden. Beides muss man messen.
//
// Aufruf: npm run test:whisper -- Sprachnachricht_Test.mp3
import { readFileSync } from "node:fs";
import OpenAI, { toFile } from "openai";
import { openaiConfig } from "./config.js";

const KURZ_PROMPT =
  "Diktat eines Handwerkers: Aufmaß und Auftragsdetails. " +
  "Begriffe: tapezieren, Balkontüren, spachteln, schleifen, Malervlies.";

const LANG_PROMPT =
  "Diktat eines Handwerkers nach einem Kundentermin: Aufmaß, Auftragsdetails, " +
  "Material, Mengen, Arbeitszeiten, Kundendaten. Verwendete Fachbegriffe: " +
  "Aufmaß, Quadratmeter, laufende Meter, Deckenhöhe, Balkontüren, Fensterlaibung, " +
  "tapezieren, Raufaser, Malervlies, Renoviervlies, spachteln, Spachtelmasse, " +
  "schleifen, grundieren, Dispersionsfarbe, Anstrich, Kabelkanäle, Dübellöcher, " +
  "Sanitär, Heizung, Gastherme, Ausdehnungsgefäß, Eckventil, Kupferrohr, " +
  "Elektrik, Steckdose, Dachdeckerei, Trockenbau, Rigips.";

interface Variante {
  modell: string;
  prompt?: string;
}

const VARIANTEN: Record<string, Variante> = {
  "A  whisper-1, ohne Prompt": { modell: "whisper-1" },
  "B  whisper-1, nur Kontext": {
    modell: "whisper-1",
    prompt: "Diktat eines Handwerkers nach einem Kundentermin: Aufmaß, Auftragsdetails, Material, Mengen.",
  },
  "C  whisper-1, wenige Kernbegriffe": { modell: "whisper-1", prompt: KURZ_PROMPT },
  "D  whisper-1, lange Wortliste": { modell: "whisper-1", prompt: LANG_PROMPT },
  "E  gpt-4o-transcribe, ohne Prompt": { modell: "gpt-4o-transcribe" },
  "F  gpt-4o-transcribe, wenige Begriffe": { modell: "gpt-4o-transcribe", prompt: KURZ_PROMPT },
  "G  gpt-4o-mini-transcribe, ohne Prompt": { modell: "gpt-4o-mini-transcribe" },
};

// Stichproben: Was soll erkannt werden? Bei eigenen Audiodateien anpassen.
const PRUEFUNGEN = [
  { was: "Tapete entfernen", muster: /runter|entfern|abmach/i },
  { was: "tapezieren", muster: /tapezieren/i },
  { was: "Balkontüren", muster: /balkontüren/i },
  { was: "schleifen", muster: /schleifen/i },
];

const linie = (z = "─") => z.repeat(70);

async function main(): Promise<void> {
  const pfad = process.argv[2] ?? "Sprachnachricht_Test.mp3";
  const audio = readFileSync(pfad);
  const openai = new OpenAI({ apiKey: openaiConfig().OPENAI_API_KEY });

  console.log(linie("═"));
  console.log(`WHISPER-VERGLEICH — ${pfad}`);
  console.log(linie("═"));
  console.log("Der Prompt lenkt die Erkennung. Zu viel Vokabular kann Passagen verschlucken.\n");

  for (const [name, variante] of Object.entries(VARIANTEN)) {
    try {
      const file = await toFile(audio, "vergleich.mp3", { type: "audio/mpeg" });
      const res = await openai.audio.transcriptions.create({
        file,
        model: variante.modell,
        language: "de",
        ...(variante.prompt ? { prompt: variante.prompt } : {}),
      });
      const text = res.text.trim();
      const treffer = PRUEFUNGEN.map((p) => `${p.muster.test(text) ? "✅" : "❌"} ${p.was}`).join("   ");
      const punkte = PRUEFUNGEN.filter((p) => p.muster.test(text)).length;

      console.log(`${name}   →  ${punkte}/${PRUEFUNGEN.length} Treffer`);
      console.log(`   ${treffer}`);
      console.log(`   ${text.slice(0, 230)}${text.length > 230 ? "…" : ""}\n`);
    } catch (err) {
      console.log(`${name}   →  nicht verfügbar`);
      console.log(`   ${err instanceof Error ? err.message.slice(0, 150) : err}\n`);
    }
  }

  console.log(linie("═"));
  console.log("Die beste Variante gehört in den prompt in src/ai/transcribe.ts.");
  console.log(linie("═"));
}

main().catch((err) => {
  console.error("\n❌ Vergleich fehlgeschlagen:\n", err instanceof Error ? err.message : err);
  process.exit(1);
});
