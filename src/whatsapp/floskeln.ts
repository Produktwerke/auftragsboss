// Abwechslungsreiche Kurzantworten (Live-Test 11.09.2026, Dirk: nicht jede
// Nachricht mit „Hab ich!" beginnen). Je Art mehrere Varianten; je Nummer wird
// nie zweimal hintereinander dieselbe gewählt.
export type FloskelArt = "spracheNeu" | "spracheDialog" | "foto" | "text" | "weiterOderFertig" | "fotosOderWeiter";

const VARIANTEN: Record<FloskelArt, string[]> = {
  // Erste Sprachnachricht eines Auftrags
  spracheNeu: [
    "🎙️ Sprachnachricht ist da, ich höre sie mir an …",
    "🎙️ Angekommen! Einen Moment, ich schreibe mit …",
    "🎙️ Danke, ich verarbeite das gerade …",
    "🎙️ Läuft, ich höre rein und sortiere …",
  ],
  // Sprachnachricht mitten im Dialog (Antwort, weiterer Raum)
  spracheDialog: [
    "🎙️ Alles klar, ich arbeite das ein …",
    "🎙️ Verstanden, ich ergänze das …",
    "🎙️ Ist drin, einen Moment …",
    "🎙️ Gut, ich nehme das mit auf …",
    "🎙️ Okay, ich höre rein …",
  ],
  foto: [
    "📷 Foto ist da, ich schaue es mir an …",
    "📷 Danke, ich werte die Wand aus …",
    "📷 Angekommen, einen Moment für die Wand …",
    "📷 Foto notiert, ich prüfe die Öffnungen …",
    "📷 Bild ist drin, ich schaue nach Fenstern und Türen …",
  ],
  text: [
    "👍 Verstanden, einen Moment …",
    "👍 Alles klar, ich arbeite das ein …",
    "👍 Notiert, ich rechne weiter …",
    "👍 Gut, einen Moment …",
  ],
  // Schluss jeder Raumbilanz: der Maler muss wissen, dass er weitermachen
  // oder abschließen kann, ohne ein Zauberwort zu kennen.
  weiterOderFertig: [
    "Nächster Raum? Oder sag *fertig*, dann mache ich das Angebot.",
    "Schick mir den nächsten Raum, oder sag *fertig* für das Angebot.",
    "Wenn noch ein Raum kommt, einfach weitermachen. Sonst sag *fertig*.",
    "Weiter mit dem nächsten Raum, oder *fertig* für das Angebot?",
  ],
  // Raum diktiert, aber noch keine Fotos dazu (Kurzform; die ausführliche
  // Anleitung FOTO_ANLEITUNG kommt einmal je Auftrag)
  fotosOderWeiter: [
    "Wenn du magst, jetzt je Fenster oder Tür ein Foto. Sonst nächster Raum, oder *fertig* für das Angebot.",
    "Fotos von Fenstern und Türen? Gern jetzt. Oder weiter mit dem nächsten Raum, oder *fertig*.",
    "Schick mir je Öffnung ein Foto, den nächsten Raum, oder sag *fertig*.",
  ],
};

/**
 * Einmal je Auftrag, beim ersten Raum ohne Fotos: wie fotografiert wird
 * (11.09.2026, Dirk: die WhatsApp-Kamera hat kein Weitwinkel, die ganze Wand
 * passt oft nicht drauf, muss sie aber auch nicht).
 */
export const FOTO_ANLEITUNG =
  "Wenn du magst, jetzt Fotos: je Fenster oder Tür ein Foto, hochkant, Boden und Decke mit drauf. " +
  "Wände ohne Öffnung brauchen kein Foto. Die ganze Wand darfst du fürs Protokoll trotzdem aufnehmen. " +
  "Sonst nächster Raum, oder sag *fertig* für das Angebot.";

const zuletzt = new Map<string, number>();

/** Liefert eine Variante der Art, nie dieselbe wie beim letzten Mal für diese Nummer. */
export function floskel(art: FloskelArt, nummer = ""): string {
  const liste = VARIANTEN[art];
  const schluessel = `${art}:${nummer}`;
  const vorher = zuletzt.get(schluessel);
  let index = Math.floor(Math.random() * liste.length);
  if (liste.length > 1 && index === vorher) index = (index + 1) % liste.length;
  zuletzt.set(schluessel, index);
  return liste[index]!;
}

/** Nur für Tests: alle Varianten einer Art. */
export function floskelVarianten(art: FloskelArt): readonly string[] {
  return VARIANTEN[art];
}
