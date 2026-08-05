// Liest die Notizen eines Handwerkers aus einem Foto oder Screenshot.
//
// Der Maler fotografiert seinen handschriftlichen Aufmaß-Zettel oder schickt
// einen Screenshot seiner Handy-Notizen. Claude (Vision) gibt den erkennbaren
// INHALT als Text zurück, so als hätte der Handwerker ihn diktiert. Es wird
// NICHT strukturiert und NICHTS erfunden das übernimmt anschließend dieselbe
// Pipeline wie bei einer Sprachnachricht (transcribe -> structure).
import Anthropic from "@anthropic-ai/sdk";
import { anthropicConfig } from "../config.js";

// Von der Anthropic-API akzeptierte Bildformate. WhatsApp liefert i.d.R. JPEG.
type BildMime = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const ERLAUBTE_MIMES: BildMime[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const PROMPT = `Auf diesem Bild sind Notizen eines Malers/Handwerkers zu einem Kundenauftrag, z.B. ein handschriftlicher Aufmaß-Zettel oder ein Screenshot einer Handy-Notiz.

Gib den erkennbaren INHALT vollständig als Text wieder, so wörtlich wie möglich: Räume, Maße und Flächen, Leistungen, ausdrücklich genannte Preise, Kundenname und Adresse, Besonderheiten. Schreib es als zusammenhängende Notiz, wie sie der Handwerker diktiert hätte.

Wichtig:
- Erfinde NICHTS dazu. Gib nur wieder, was auf dem Bild erkennbar ist.
- Rechne nichts aus und ergänze keine Preise.
- Ist etwas unleserlich, lass es weg oder kennzeichne es mit "(unleserlich)".
- Antworte nur mit dem Inhalt, ohne Vorrede.`;

/** Wertet ein Bild aus und liefert den erkannten Notiz-Text. */
export async function liesBildNotiz(bild: { daten: Buffer; mimeType: string }): Promise<string> {
  const mime: BildMime = ERLAUBTE_MIMES.includes(bild.mimeType as BildMime)
    ? (bild.mimeType as BildMime)
    : "image/jpeg";
  const anthropic = new Anthropic({ apiKey: anthropicConfig().ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: "claude-fable-5",
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mime, data: bild.daten.toString("base64") } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
