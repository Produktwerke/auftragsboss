// Schritt 1 der KI-Pipeline: Sprachnachricht → Text.
// WhatsApp liefert Sprachnachrichten als OGG/Opus — Whisper verarbeitet
// das Format direkt, ohne Konvertierung. Für Tests funktionieren auch
// m4a/mp3/wav (typische Handy-Sprachmemos).
import OpenAI, { toFile } from "openai";
import { aiConfig } from "../config.js";

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

export async function transkribiereAudio(
  audio: Buffer,
  dateiname = "sprachnachricht.ogg",
): Promise<string> {
  const endung = dateiname.split(".").pop()?.toLowerCase() ?? "ogg";
  const openai = new OpenAI({ apiKey: aiConfig().OPENAI_API_KEY });

  const file = await toFile(audio, dateiname, {
    type: MIME_TYPEN[endung] ?? "audio/ogg",
  });

  const result = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "de", // Deutsch priorisieren — robust auch bei Dialekt
    // Fachbegriff-Priming verbessert die Erkennung von Handwerks-Vokabular
    prompt:
      "Diktat eines Handwerkers nach einem Kundentermin: Auftragsdetails, " +
      "Material, Arbeitszeiten, Kundendaten. Fachbegriffe aus Sanitär, " +
      "Heizung, Elektrik, Malerei, Dachdeckerei.",
  });

  return result.text.trim();
}
