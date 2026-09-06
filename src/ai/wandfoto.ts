// Wandfoto-Analyse (Teiletappe 2 „Drei Zahlen und vier Fotos").
//
// Der Maler schickt ein Foto je Wand. Claude Vision beantwortet dazu ein
// FESTES Formular (eigenes kleines Structured-Output-Schema, getrennt vom
// großen Dokument-Schema, das an der Grammatik-Grenze liegt):
//   - Ist das überhaupt ein Wandfoto (oder ein Notizzettel/Screenshot)?
//   - Ist die Wand komplett im Bild, hell genug, Tür/Fenster geschlossen?
//   - Welche Öffnungen sind zu sehen, ungefähr wie groß (Raumhöhe als Maßstab)?
// Die Maße sind SCHÄTZUNGEN für die VOB-Klassifikation (über/unter 2,5 m²);
// die Wandmaße selbst kommen weiterhin vom Maler. Nichts wird gerechnet.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { anthropicConfig } from "../config.js";

type BildMime = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const ERLAUBTE_MIMES: BildMime[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export const WandfotoSchema = z.object({
  istWandfoto: z
    .boolean()
    .describe("true, wenn das Bild eine Raumwand (Innenraum) zeigt. false bei Notizzettel, Screenshot, Dokument, Person, Außenaufnahme."),
  notizText: z
    .string()
    .nullable()
    .describe("Nur wenn istWandfoto false ist und Notizen/Text zu erkennen sind: deren Inhalt wörtlich als Text. Sonst null."),
  wandKomplett: z
    .boolean()
    .describe("true, wenn die Wand von der linken bis zur rechten Raumecke UND von der Decke bis zum Boden im Bild ist."),
  bodenSichtbar: z.boolean().describe("true, wenn die Bodenlinie (Übergang Wand/Boden) wenigstens teilweise sichtbar ist."),
  hellGenug: z.boolean().describe("true, wenn Kanten und Öffnungen klar erkennbar sind (nicht zu dunkel, nicht überstrahlt)."),
  oeffnungen: z
    .array(
      z.object({
        art: z.enum(["Tuer", "Fenster", "Fenstertuer", "Durchgang", "Sonstige"]),
        offen: z.boolean().describe("true, wenn Türblatt/Fensterflügel sichtbar geöffnet ist."),
        breiteM: z.number().nullable().describe("Geschätzte lichte Breite in Metern (Innenkante Rahmen/Loch), null wenn nicht schätzbar."),
        hoeheM: z.number().nullable().describe("Geschätzte lichte Höhe in Metern, null wenn nicht schätzbar."),
        sicherheit: z.enum(["hoch", "mittel", "niedrig"]),
      }),
    )
    .describe("Alle Öffnungen IN DIESER WAND (nicht in Nachbarwänden, nicht Bilder/Spiegel/Schränke). Leer, wenn keine."),
  besonderheiten: z
    .array(z.string())
    .describe("Kurz: z.B. 'Lambris halbhoch', 'Fliesenspiegel', 'Heizkörper', 'Dachschräge', 'Tapete', 'Spachtelstellen'. Leer, wenn nichts."),
});

export type WandfotoAnalyse = z.infer<typeof WandfotoSchema>;

function prompt(kontext: { raumhoeheM?: number | null; raumName?: string | null }): string {
  const hoehe = kontext.raumhoeheM
    ? `Die Raumhöhe beträgt ${kontext.raumhoeheM.toString().replace(".", ",")} m. Nutze sie als Maßstab für die Öffnungsmaße.`
    : "Die Raumhöhe ist unbekannt; nimm 2,50 m als Maßstab und markiere Maße dann höchstens mit Sicherheit 'mittel'.";
  const raum = kontext.raumName ? `Das Foto gehört vermutlich zum Raum „${kontext.raumName}".` : "";
  return `Du bist die Bildauswertung eines Angebots-Assistenten für Malerbetriebe. Ein Maler hat eine Raumwand fotografiert, um Öffnungen (Türen, Fenster) für das Aufmaß zu erfassen. ${raum} ${hoehe}

Beantworte das Formular. Regeln:
- Nur die Wand bewerten, die das Bild frontal oder nahezu frontal zeigt. Öffnungen in angeschnittenen Nachbarwänden gehören NICHT dazu.
- Bilder, Spiegel, Schränke, Heizkörper, Regale sind KEINE Öffnungen.
- Lichte Maße schätzen (Innenkante des Lochs bzw. der Zarge), nicht die Rahmen-Außenkante. Typische Werte: Zimmertür 0,7 bis 0,9 × 2,0 m; Fenster 0,6 bis 2,0 m breit; Fenstertür 0,8 bis 2,0 × 2,1 bis 2,3 m.
- Ist eine Öffnung nur teilweise sichtbar (angeschnitten, hinter Vorhang), schätze trotzdem und setze Sicherheit 'niedrig'.
- Eine geöffnete Tür oder ein geöffneter Fensterflügel: offen = true.
- Ist es KEIN Wandfoto (z.B. handschriftlicher Zettel, Handy-Notiz, Screenshot): istWandfoto false, den lesbaren Inhalt wörtlich in notizText, alles andere leer/false.
- Nichts erfinden. Keine Rechnungen.`;
}

/** Wertet ein Wandfoto aus. Wirft bei API-Fehlern; der Aufrufer entscheidet über den Rückfall. */
export async function analysiereWandfoto(
  bild: { daten: Buffer; mimeType: string },
  kontext: { raumhoeheM?: number | null; raumName?: string | null } = {},
  verbrauch?: (tokensEin: number, tokensAus: number) => void,
): Promise<WandfotoAnalyse> {
  const mime: BildMime = ERLAUBTE_MIMES.includes(bild.mimeType as BildMime) ? (bild.mimeType as BildMime) : "image/jpeg";
  const anthropic = new Anthropic({ apiKey: anthropicConfig().ANTHROPIC_API_KEY });
  const response = await anthropic.messages.parse({
    model: "claude-fable-5",
    max_tokens: 3000,
    thinking: { type: "adaptive" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mime, data: bild.daten.toString("base64") } },
          { type: "text", text: prompt(kontext) },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(WandfotoSchema) },
  });
  verbrauch?.(response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0);
  if (response.stop_reason === "refusal") throw new Error("Bildauswertung abgelehnt (refusal).");
  if (!response.parsed_output) throw new Error(`Bildauswertung fehlgeschlagen (stop_reason: ${response.stop_reason})`);
  return response.parsed_output;
}

// ── Reine Helfer (testbar, ohne API) ────────────────────────────────────

const ART_NAME: Record<WandfotoAnalyse["oeffnungen"][number]["art"], string> = {
  Tuer: "Tür",
  Fenster: "Fenster",
  Fenstertuer: "Fenstertür",
  Durchgang: "Durchgang",
  Sonstige: "Öffnung",
};
const m = (x: number) => (Math.round(x * 100) / 100).toString().replace(".", ",");
const m2 = (x: number) => x.toFixed(2).replace(".", ",");

export interface FotoProblem {
  schwere: "nachfassen" | "hinweis";
  text: string;
}

/** Mängel des Fotos aus Sicht des Aufmaßes (Nachfass-Bitte oder bloßer Hinweis). */
export function fotoProbleme(a: WandfotoAnalyse): FotoProblem[] {
  const p: FotoProblem[] = [];
  if (!a.hellGenug) p.push({ schwere: "nachfassen", text: "Das Foto ist zu dunkel oder überstrahlt." });
  if (!a.wandKomplett) p.push({ schwere: "hinweis", text: "Die Wand ist nicht ganz im Bild (Ecken oder Boden fehlen)." });
  const offen = a.oeffnungen.filter((o) => o.offen);
  if (offen.length) {
    p.push({
      schwere: "nachfassen",
      text: `${offen.map((o) => ART_NAME[o.art]).join(" und ")} steht offen, bitte schließen und nochmal fotografieren.`,
    });
  }
  return p;
}

/** Eine Zeile je Öffnung für Feedback und Dialog, mit VOB-Einordnung. */
export function oeffnungenBeschreibung(a: WandfotoAnalyse): string[] {
  return a.oeffnungen.map((o) => {
    const name = ART_NAME[o.art];
    if (o.breiteM === null || o.hoeheM === null) return `${name} (Maß nicht schätzbar)`;
    const fl = o.breiteM * o.hoeheM;
    const vob = fl > 2.5 ? "wird abgezogen" : "wird übermessen";
    const grau = fl >= 2.2 && fl <= 2.8 ? ", nahe der 2,5-m²-Grenze: bitte kurz nachmessen" : "";
    return `${name} ca. ${m(o.breiteM)} × ${m(o.hoeheM)} m = ${m2(fl)} m² (${vob}${grau})`;
  });
}

/** WhatsApp-Sofortantwort auf ein Wandfoto. */
export function fotoFeedback(a: WandfotoAnalyse, wandNr: number, raumName: string | null): string {
  const wo = `${raumName ? raumName + ", " : ""}Wand ${wandNr}`;
  const probleme = fotoProbleme(a);
  const nachfassen = probleme.filter((p) => p.schwere === "nachfassen");
  const zeilen: string[] = [];
  if (nachfassen.length) {
    zeilen.push(`⚠️ ${wo}: ${nachfassen.map((p) => p.text).join(" ")}`);
  } else {
    const oeff = oeffnungenBeschreibung(a);
    zeilen.push(oeff.length ? `✅ ${wo}: ${oeff.join("; ")}.` : `✅ ${wo}: keine Öffnungen, notiert.`);
  }
  for (const p of probleme.filter((p) => p.schwere === "hinweis")) zeilen.push(`ℹ️ ${p.text}`);
  return zeilen.join("\n");
}

/** Textzeile für den Dialogverlauf, damit die Auswertungs-KI das Foto einordnen kann. */
export function fotoAlsDialogText(a: WandfotoAnalyse, wandNr: number, raumName: string | null, unterschrift?: string | null): string {
  const teile: string[] = [];
  teile.push(`FOTO Wand ${wandNr}${raumName ? ` (Raum: ${raumName})` : ""}${unterschrift?.trim() ? ` [Bildunterschrift: ${unterschrift.trim()}]` : ""}:`);
  const oeff = a.oeffnungen.map((o) => {
    const name = ART_NAME[o.art];
    const mass = o.breiteM !== null && o.hoeheM !== null ? ` ca. ${m(o.breiteM)} x ${m(o.hoeheM)} m` : " (Maß unklar)";
    return `${name}${mass}${o.offen ? " (offen)" : ""}${o.sicherheit === "niedrig" ? " (unsicher)" : ""}`;
  });
  teile.push(oeff.length ? `Öffnungen: ${oeff.join(", ")}.` : "Keine Öffnungen.");
  if (!a.wandKomplett) teile.push("Wand nicht vollständig im Bild.");
  if (a.besonderheiten.length) teile.push(`Besonderheiten: ${a.besonderheiten.join(", ")}.`);
  return teile.join(" ");
}
