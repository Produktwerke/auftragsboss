// Abwechslungsreiche Kurzantworten (Live-Test 11.09.2026, Dirk: nicht jede
// Nachricht mit „Hab ich!" beginnen). Je Art mehrere Varianten; je Nummer wird
// nie zweimal hintereinander dieselbe gewählt.
export type FloskelArt = "spracheNeu" | "spracheDialog" | "foto" | "text";

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
};

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
