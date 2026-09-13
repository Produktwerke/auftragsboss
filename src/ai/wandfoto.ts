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
        art: z.enum(["Tuer", "Fenster", "Fenstertuer", "Haustuer", "Durchgang", "Sonstige"]),
        inNachbarwand: z
          .boolean()
          .describe(
            "true, wenn die Öffnung NICHT in der frontal gezeigten Wand liegt, sondern in einer am linken oder rechten " +
              "Bildrand schräg ins Bild laufenden Nachbarwand (perspektivisch verkürzt, Decken-/Bodenlinie läuft diagonal). " +
              "Solche Öffnungen bitte hier eintragen, damit sie sauber aussortiert werden können.",
          ),
        offen: z.boolean().describe("true, wenn Türblatt/Fensterflügel sichtbar geöffnet ist."),
        breiteM: z.number().nullable().describe("Geschätzte lichte Breite in Metern (Innenkante Rahmen/Loch), null wenn nicht schätzbar."),
        hoeheM: z.number().nullable().describe("Geschätzte lichte Höhe in Metern, null wenn nicht schätzbar."),
        sicherheit: z.enum(["hoch", "mittel", "niedrig"]),
      }),
    )
    .describe("Alle sichtbaren Öffnungen (Nachbarwände mit inNachbarwand=true markieren; keine Bilder/Spiegel/Schränke). Leer, wenn keine."),
  besonderheiten: z
    .array(z.string())
    .describe(
      "Kurz: z.B. 'Heizkörper', 'Dachschräge', 'Tapete', 'Spachtelstellen'. Bei halbhohen Verkleidungen (Lambris, Holzpaneele, Fliesenspiegel) " +
        "die Oberkante in Metern schätzen und so notieren: 'Lambris bis ca. 1,10 m'. Ein bloßer Farbwechsel (unten weiß, oben farbig, ohne Material-, Profil- oder Fugenwechsel) " +
        "ist KEINE Verkleidung und heißt 'zweifarbiger Anstrich, Sockelzone bis ca. 1,10 m'. Leer, wenn nichts.",
    ),
});

export type WandfotoAnalyse = z.infer<typeof WandfotoSchema>;

function prompt(kontext: { raumhoeheM?: number | null; raumName?: string | null }): string {
  const hoehe = kontext.raumhoeheM
    ? `Die Raumhöhe beträgt ${kontext.raumhoeheM.toString().replace(".", ",")} m. Nutze sie als Maßstab für die Öffnungsmaße.`
    : "Die Raumhöhe ist unbekannt; nimm 2,50 m als Maßstab und markiere Maße dann höchstens mit Sicherheit 'mittel'.";
  const raum = kontext.raumName ? `Das Foto gehört vermutlich zum Raum „${kontext.raumName}".` : "";
  return `Du bist die Bildauswertung eines Angebots-Assistenten für Malerbetriebe. Ein Maler hat eine Raumwand fotografiert, um Öffnungen (Türen, Fenster) für das Aufmaß zu erfassen. ${raum} ${hoehe}

Beantworte das Formular. Regeln:
- Bewertet wird die Wand, die das Bild frontal oder nahezu frontal zeigt. Wände, die am linken oder rechten Bildrand schräg ins Bild laufen (Decken- und Bodenlinie verlaufen dort diagonal, Türen wirken schmal und verzerrt), sind NACHBARWÄNDE: ihre Öffnungen mit inNachbarwand=true markieren, auch wenn sie groß oder gut sichtbar sind. wandKomplett bezieht sich nur auf die frontale Wand.
- Eine Haustür mit festem Seitenteil (Glas) ist EINE Öffnung der Art Haustuer mit der Gesamtbreite von Tür plus Seitenteil.
- Bilder, Spiegel, Schränke, Heizkörper, Regale sind KEINE Öffnungen. Achtung Spiegel: Ein großer Wand- oder Standspiegel zeigt einen Raum oder Flur und sieht wie ein Durchgang aus, ist aber keiner (Rahmen, gespiegelte Möbel, gespiegeltes Licht).
- Öffnungen, die am äußersten linken oder rechten Bildrand ANGESCHNITTEN sind (weniger als etwa zwei Drittel sichtbar), gehören fast immer zur Nachbarwand: inNachbarwand=true. Eine VOLLSTÄNDIG sichtbare Tür oder ein vollständig sichtbares Fenster mit senkrechter Zarge, parallel zu den übrigen Kanten der frontalen Wand, gehört dagegen zur frontalen Wand, auch wenn es nah am Bildrand liegt: inNachbarwand=false.
- Lichte Maße schätzen (Innenkante des Lochs bzw. der Zarge), nicht die Rahmen-Außenkante. Typische Werte: Zimmertür 0,7 bis 0,9 × 2,0 m; Fenster 0,6 bis 2,0 m breit; Fenstertür 0,8 bis 2,0 × 2,1 bis 2,3 m.
- Ist eine Öffnung nur teilweise sichtbar (angeschnitten, hinter Vorhang), schätze trotzdem und setze Sicherheit 'niedrig'.
- Eine geöffnete Tür oder ein geöffneter Fensterflügel: offen = true.
- Jede Öffnung genau EINMAL eintragen. Ein Türblatt und seine Zarge sind eine Öffnung, nicht zwei.
- Das Foto zeigt oft nur einen AUSSCHNITT der Wand (hochkant, eine Öffnung mit Boden und Decke). Das ist normal und kein Mangel: Öffnungen darin mit normaler Sicherheit schätzen, solange der Boden oder die Decke als Maßstab zu sehen ist.
- Ist es KEIN Wandfoto (z.B. handschriftlicher Zettel, Handy-Notiz, Screenshot): istWandfoto false, den lesbaren Inhalt wörtlich in notizText, alles andere leer/false.
- Halbhohe Verkleidung (Lambris, Holzpaneele, Fliesenspiegel) nur melden, wenn ein echter Materialwechsel sichtbar ist: Holzmaserung, Nut-und-Feder-Fugen, Fliesenfugen, eine Abschlussleiste oder ein Profil an der Oberkante. Ist die Wand unten nur in einer anderen Farbe gestrichen (glatte Fläche, gleiche Struktur, nur ein Farbwechsel), ist das ein zweifarbiger Anstrich und KEINE Verkleidung. Im Zweifel: zweifarbiger Anstrich.
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
  Haustuer: "Haustür",
  Durchgang: "Durchgang",
  Sonstige: "Öffnung",
};
const m = (x: number) => (Math.round(x * 100) / 100).toString().replace(".", ",");
const m2 = (x: number) => x.toFixed(2).replace(".", ",");

/** Nur die Öffnungen der frontal gezeigten Wand (Nachbarwände aussortiert). */
export function relevanteOeffnungen(a: WandfotoAnalyse): WandfotoAnalyse["oeffnungen"] {
  return a.oeffnungen.filter((o) => !o.inNachbarwand);
}

/** Öffnungen, die das Modell einer Nachbarwand zuordnet: unsicher, werden nachgefragt statt verworfen. */
export function unsichereOeffnungen(a: WandfotoAnalyse): WandfotoAnalyse["oeffnungen"] {
  return a.oeffnungen.filter((o) => o.inNachbarwand);
}

/**
 * Bildrand-Öffnungen, bei denen sich die Nachfrage lohnt (Live-Test 11.09.2026:
 * die Frage kam bei 6 von 8 Fotos und nervte). Nachgefragt wird nur, wenn die
 * Öffnung nach VOB abgezogen würde (> 2,5 m², Grauzone ab 2,2 m²) oder ihre
 * Größe unbekannt ist und die Art typischerweise groß ist. Kleine Fenster und
 * Zimmertüren werden ohnehin übermessen, ändern also nichts am Preis.
 */
export function nachfragewuerdigeRandoeffnungen(a: WandfotoAnalyse): WandfotoAnalyse["oeffnungen"] {
  const grosseArten = new Set<WandfotoAnalyse["oeffnungen"][number]["art"]>(["Fenstertuer", "Haustuer", "Durchgang"]);
  return unsichereOeffnungen(a).filter((o) => {
    if (o.breiteM === null || o.hoeheM === null) return grosseArten.has(o.art);
    return o.breiteM * o.hoeheM >= 2.2;
  });
}

/**
 * Doppelt gemeldete Öffnungen zusammenführen (Live-Test 11.09.2026: „Tür 0,85 × 2 m;
 * Tür 0,85 × 2 m" auf EINEM Foto). Gleiche Art, gleiche Wandseite und Maße auf
 * 5 cm gleich gilt als dieselbe Öffnung. Zwei wirklich gleiche Türen nebeneinander
 * sind selten und lassen sich diktieren.
 */
export function bereinigeAnalyse(a: WandfotoAnalyse): WandfotoAnalyse {
  const behalten: WandfotoAnalyse["oeffnungen"] = [];
  for (const o of a.oeffnungen) {
    const doppelt = behalten.some(
      (b) =>
        b.art === o.art &&
        b.inNachbarwand === o.inNachbarwand &&
        b.breiteM !== null && o.breiteM !== null && Math.abs(b.breiteM - o.breiteM) <= 0.05 &&
        b.hoeheM !== null && o.hoeheM !== null && Math.abs(b.hoeheM - o.hoeheM) <= 0.05,
    );
    if (!doppelt) behalten.push(o);
  }
  return behalten.length === a.oeffnungen.length ? a : { ...a, oeffnungen: behalten };
}

export interface FotoProblem {
  schwere: "nachfassen" | "hinweis";
  text: string;
}

/** Mängel des Fotos aus Sicht des Aufmaßes (Nachfass-Bitte oder bloßer Hinweis). */
export function fotoProbleme(a: WandfotoAnalyse): FotoProblem[] {
  const p: FotoProblem[] = [];
  if (!a.hellGenug) p.push({ schwere: "nachfassen", text: "Das Foto ist zu dunkel oder überstrahlt." });
  // Die ganze Wand muss NICHT im Bild sein (11.09.2026, Dirk: die WhatsApp-Kamera
  // hat kein Weitwinkel). Ein Ausschnitt mit der Öffnung reicht, solange der
  // Boden als Maßstab zu sehen ist. Nur dessen Fehlen ist einen Hinweis wert.
  if (!a.bodenSichtbar) p.push({ schwere: "hinweis", text: "Der Boden ist nicht im Bild, dann werden die Maße ungenauer. Hochkant mit Boden und Decke reicht." });
  const offen = relevanteOeffnungen(a).filter((o) => o.offen);
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
  return relevanteOeffnungen(a).map((o) => {
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
  const unsicher = nachfragewuerdigeRandoeffnungen(a);
  if (unsicher.length) {
    const namen = unsicher.map((o) => ART_NAME[o.art]).join(", ");
    zeilen.push(`❓ Am Bildrand noch: ${namen}. Sieht nach Nachbarwand aus, deshalb nicht mitgezählt. Gehört das doch zu dieser Wand? Dann sag kurz Bescheid.`);
  }
  return zeilen.join("\n");
}

/** Textzeile für den Dialogverlauf, damit die Auswertungs-KI das Foto einordnen kann. */
export function fotoAlsDialogText(a: WandfotoAnalyse, wandNr: number, raumName: string | null, unterschrift?: string | null): string {
  const teile: string[] = [];
  teile.push(`FOTO Wand ${wandNr}${raumName ? ` (Raum: ${raumName})` : ""}${unterschrift?.trim() ? ` [Bildunterschrift: ${unterschrift.trim()}]` : ""}:`);
  const oeff = relevanteOeffnungen(a).map((o) => {
    const name = ART_NAME[o.art];
    const mass = o.breiteM !== null && o.hoeheM !== null ? ` ca. ${m(o.breiteM)} x ${m(o.hoeheM)} m` : " (Maß unklar)";
    return `${name}${mass}${o.offen ? " (offen)" : ""}${o.sicherheit === "niedrig" ? " (unsicher)" : ""}`;
  });
  teile.push(oeff.length ? `Öffnungen: ${oeff.join(", ")}.` : "Keine Öffnungen.");
  const unsicher = unsichereOeffnungen(a);
  if (unsicher.length) {
    teile.push(
      `Am Bildrand, vermutlich Nachbarwand (nur übernehmen, wenn der Handwerker es bestätigt): ${unsicher
        .map((o) => `${ART_NAME[o.art]}${o.breiteM !== null && o.hoeheM !== null ? ` ca. ${m(o.breiteM)} x ${m(o.hoeheM)} m` : ""}`)
        .join(", ")}.`,
    );
  }
  if (!a.bodenSichtbar) teile.push("Boden nicht im Bild (Maße ungenauer).");
  if (a.besonderheiten.length) teile.push(`Besonderheiten: ${a.besonderheiten.join(", ")}.`);
  return teile.join(" ");
}

/**
 * Sofort-Hinweis NUR bei Mängeln, die ein neues Foto brauchen (zu dunkel,
 * offene Tür). Alles andere (Öffnungsliste, fehlender Boden, Bildrand) wird
 * seit dem Umbau 13.09.2026 nicht mehr je Foto gemeldet, sondern gesammelt in
 * der Fertigmeldung des Angebots. Gibt null zurück, wenn nichts nachzufassen ist.
 */
export function fotoNachfassHinweis(a: WandfotoAnalyse, wandNr: number, raumName: string | null): string | null {
  const nachfassen = fotoProbleme(a).filter((p) => p.schwere === "nachfassen");
  if (!nachfassen.length) return null;
  void wandNr;
  // Kommt direkt nach dem Foto, deshalb „dein letztes Foto" statt einer Wandnummer.
  return `⚠️ Dein letztes Foto${raumName ? ` (${raumName})` : ""}: ${nachfassen.map((p) => p.text).join(" ")}`;
}

/**
 * Beschreibt ein Foto so, wie der Maler es wiedererkennt: nach dem, was darauf
 * zu sehen ist, nicht nach einer Wandnummer (Dirk 13.09.2026: „Wand 3" sagt ihm
 * nichts). Beispiel: „Foto mit Fenster ca. 1,1 x 1,2 m (Kinderzimmer)".
 */
export function fotoBeschreibung(a: WandfotoAnalyse, raumName: string | null): string {
  const oeff = relevanteOeffnungen(a).map((o) => {
    const name = ART_NAME[o.art];
    return o.breiteM !== null && o.hoeheM !== null ? `${name} ca. ${m(o.breiteM)} x ${m(o.hoeheM)} m` : name;
  });
  let was: string;
  if (oeff.length) was = `Foto mit ${oeff.join(" und ")}`;
  else if (a.besonderheiten.length) was = `Foto mit ${a.besonderheiten[0]}`;
  else was = "Foto ohne Öffnung";
  return raumName ? `${was} (${raumName})` : was;
}

/** Kurze Hinweise je Foto für die Fertigmeldung: fehlender Boden, Öffnungen am Bildrand. */
export function fotoHinweiseKurz(a: WandfotoAnalyse, wandNr: number, raumName: string | null): string[] {
  void wandNr;
  const wo = fotoBeschreibung(a, raumName);
  const zeilen: string[] = [];
  if (!a.bodenSichtbar) zeilen.push(`ℹ️ ${wo}: Boden nicht im Bild, Maße ungenauer.`);
  const unsicher = nachfragewuerdigeRandoeffnungen(a);
  if (unsicher.length) {
    zeilen.push(`❓ ${wo}: am Bildrand noch ${unsicher.map((o) => ART_NAME[o.art]).join(", ")}, nicht mitgezählt. Gehört das dazu? Sag kurz Bescheid.`);
  }
  return zeilen;
}
