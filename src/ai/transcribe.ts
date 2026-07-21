// Schritt 1 der KI-Pipeline: Sprachnachricht → Text.
// WhatsApp liefert Sprachnachrichten als OGG/Opus — Whisper verarbeitet
// das Format direkt, ohne Konvertierung.
import OpenAI, { toFile } from "openai";
import { config } from "../config.js";

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

export async function transkribiereAudio(audio: Buffer, dateiname = "sprachnachricht.ogg"): Promise<string> {
  const file = await toFile(audio, dateiname, { type: "audio/ogg" });

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
