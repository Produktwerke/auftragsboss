// Schritt 1 der KI-Pipeline: Sprachnachricht → Text.
//
// DOPPELTE TRANSKRIPTION — der Grund dafür ist gemessen, nicht vermutet:
//
//   whisper-1 mit Fachbegriffen  erkennt "tapezieren", "Balkontüren", "schleifen",
//                                verschluckt dafür "vorher Tapete runter machen"
//   gpt-4o-transcribe            erkennt den verschluckten Arbeitsschritt,
//                                patzt dafür bei "Balkontüren"
//
// Beide scheitern an unterschiedlichen Stellen. Zusammen decken sie den Inhalt
// vollständig ab; die Zusammenführung übernimmt Claude im nächsten Schritt.
// Ein verlorener Arbeitsschritt kostet den Handwerker bares Geld — die paar
// Cent für die zweite Transkription sind dagegen nichts.
//
// Nachmessen mit eigenen Aufnahmen: npm run test:whisper -- datei.mp3
import OpenAI, { toFile } from "openai";
import { openaiConfig } from "../config.js";

const MIME_TYPEN: Record<string, string> = {
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  webm: "audio/webm",
};

// Bewusst kurz gehalten: Je mehr Vokabular im Prompt steht, desto stärker
// zieht Whisper Gesprochenes auf die erwarteten Formulierungen zusammen —
// und lässt dabei Passagen weg. Nur die Begriffe, die messbar helfen.
const FACHBEGRIFFE =
  "Diktat eines Handwerkers: Aufmaß und Auftragsdetails. " +
  "Begriffe: tapezieren, Balkontüren, spachteln, schleifen, Malervlies, " +
  "Kabelkanäle, Deckenhöhe, Quadratmeter.";

export interface Transkription {
  /** Alle Fassungen — Grundlage für die Zusammenführung durch Claude. */
  varianten: string[];
  /** Beste Einzelfassung, z.B. für Anzeige und Archiv. */
  haupttext: string;
}

async function einmalTranskribieren(
  openai: OpenAI,
  audio: Buffer,
  dateiname: string,
  modell: string,
  prompt?: string,
): Promise<string> {
  const endung = dateiname.split(".").pop()?.toLowerCase() ?? "ogg";
  const file = await toFile(audio, dateiname, { type: MIME_TYPEN[endung] ?? "audio/ogg" });
  const res = await openai.audio.transcriptions.create({
    file,
    model: modell,
    language: "de", // Deutsch priorisieren — robust auch bei Dialekt
    ...(prompt ? { prompt } : {}),
  });
  return res.text.trim();
}

export async function transkribiereAudio(
  audio: Buffer,
  dateiname = "sprachnachricht.ogg",
): Promise<Transkription> {
  const openai = new OpenAI({ apiKey: openaiConfig().OPENAI_API_KEY });

  // Parallel — die zweite Fassung kostet so keine zusätzliche Wartezeit.
  const [whisper, gpt4o] = await Promise.allSettled([
    einmalTranskribieren(openai, audio, dateiname, "whisper-1", FACHBEGRIFFE),
    einmalTranskribieren(openai, audio, dateiname, "gpt-4o-transcribe"),
  ]);

  const varianten: string[] = [];
  if (whisper.status === "fulfilled" && whisper.value) varianten.push(whisper.value);
  if (gpt4o.status === "fulfilled" && gpt4o.value) varianten.push(gpt4o.value);

  if (varianten.length === 0) {
    const grund =
      whisper.status === "rejected" ? whisper.reason : (gpt4o as PromiseRejectedResult).reason;
    throw new Error(`Transkription fehlgeschlagen: ${grund}`);
  }

  return { varianten, haupttext: varianten[0]! };
}
