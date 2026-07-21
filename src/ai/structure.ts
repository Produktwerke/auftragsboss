// Schritt 2 der KI-Pipeline: Transkript → strukturiertes Protokoll.
// Claude Opus 4.8 mit Structured Outputs (Zod-Schema) — die Antwort ist
// GARANTIERT valides JSON im erwarteten Format, kein Parsing-Risiko.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { config } from "../config.js";

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

export const ProtokollSchema = z.object({
  kunde: z.object({
    name: z.string().nullable().describe("Name des Kunden, z.B. 'Familie Müller'. null wenn nicht genannt."),
    adresse: z.string().nullable().describe("Adresse/Ort des Einsatzes, falls genannt."),
  }),
  auftrag: z.object({
    gewerk: z.string().nullable().describe("Gewerk, z.B. 'Sanitär', 'Elektrik', 'Malerei'."),
    leistungen: z
      .array(
        z.object({
          beschreibung: z.string().describe("Eine erledigte bzw. vereinbarte Arbeit."),
          menge: z.string().nullable().describe("Menge/Umfang, z.B. '20 m²', '3 Stück'. null wenn nicht genannt."),
        }),
      )
      .describe("Alle im Diktat genannten Arbeiten, einzeln aufgeschlüsselt."),
    material: z.array(z.string()).describe("Verwendetes oder zu bestellendes Material."),
    arbeitszeit: z.string().nullable().describe("Genannte Arbeitszeit, z.B. '4 Stunden'."),
    besonderheiten: z
      .string()
      .nullable()
      .describe("Absprachen, Mängel-Hinweise, offene Punkte, Zusagen an den Kunden — alles Haftungsrelevante!"),
    folgetermin: z.string().nullable().describe("Vereinbarter Folgetermin, falls genannt."),
  }),
  gewaehrleistung: z.object({
    typ: z
      .enum(["WERK_2_JAHRE", "BAUWERK_5_JAHRE"])
      .describe(
        "§ 634a BGB: BAUWERK_5_JAHRE bei Arbeiten, die für Errichtung/Bestand eines Bauwerks wesentlich sind " +
          "(z.B. Dach, Rohbau, fest verbaute Heizungsanlage). Sonst WERK_2_JAHRE (Standard, im Zweifel wählen).",
      ),
    begruendung: z.string().describe("Ein Satz: warum diese Frist gewählt wurde."),
  }),
  protokoll_text: z
    .string()
    .describe(
      "Fertig formuliertes Auftrags-/Arbeitsprotokoll, das der Handwerker unverändert an den Kunden " +
        "weiterleiten kann. Professionell, freundlich, Sie-Form. Struktur: Anrede, Datum/Ort, " +
        "durchgeführte Arbeiten (Liste), Material, Besonderheiten/Absprachen, ggf. Folgetermin, Gruß mit Firmenname. " +
        "KEINE Preise erfinden — nur nennen, was diktiert wurde.",
    ),
});

export type ProtokollDaten = z.infer<typeof ProtokollSchema>;

const SYSTEM_PROMPT = `Du bist das Backend von "VoiceProtokoll Guard", einem Dokumentations-Tool für deutsche Handwerksbetriebe.

Du erhältst das Roh-Transkript einer WhatsApp-Sprachnachricht, die ein Handwerker direkt nach einem Kundentermin im Auto diktiert hat. Transkripte sind umgangssprachlich, enthalten Füllwörter, Dialekt-Reste und Transkriptionsfehler bei Fachbegriffen — korrigiere offensichtliche Hörfehler sinnvoll (z.B. "Kupferrohr fünfzehner" → "Kupferrohr 15 mm").

Deine Aufgabe:
1. Extrahiere alle Auftrags-Fakten präzise. Erfinde NICHTS dazu — was nicht diktiert wurde, ist null bzw. leer.
2. Achte besonders auf haftungsrelevante Aussagen (Mängel, Hinweise an den Kunden, Absprachen) — sie gehören in "besonderheiten".
3. Ordne die Gewährleistungsfrist nach § 634a BGB ein (im Zweifel WERK_2_JAHRE).
4. Formuliere ein kundenfähiges Protokoll in professionellem Deutsch.`;

export async function strukturiereTranskript(
  transkript: string,
  kontext: { firma: string; name: string; gewerk?: string | null },
): Promise<ProtokollDaten> {
  const response = await anthropic.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `Betrieb: ${kontext.firma} (Inhaber: ${kontext.name}` +
          (kontext.gewerk ? `, Gewerk: ${kontext.gewerk}` : "") +
          `)\n\nTranskript der Sprachnachricht:\n"""\n${transkript}\n"""`,
      },
    ],
    output_config: { format: zodOutputFormat(ProtokollSchema) },
  });

  if (!response.parsed_output) {
    throw new Error(`Strukturierung fehlgeschlagen (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}
