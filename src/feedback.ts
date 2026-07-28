// Feedback-Erkennung für den WhatsApp-Weg.
//
// Bewusst tolerant, aber mit klarem Signal (führendes Feedback-Wort oder das
// Wort „feedback" irgendwo), damit ein normales Auftrags-Diktat NICHT
// versehentlich als Feedback gewertet wird. Die eigentliche Speicherung
// passiert direkt dort, wo sie gebraucht wird (pipeline.ts / web/routes.ts).

/** Wie lange nach „Feedback" wir die nächste Nachricht als Rückmeldung werten. */
export const FEEDBACK_FENSTER_MINUTEN = 30;

const FEEDBACK_WORT = /(feedback|rückmeldung|verbesserung|vorschlag|idee|problem)/i;

/** Erkennt eine Feedback-Absicht in einer Textnachricht. */
export function willFeedback(text: string): boolean {
  const t = text.trim();
  if (t.length > 280) return false; // ein langes Diktat ist kein Feedback-Wunsch
  // Klares Signal: beginnt mit einem Feedback-Wort ODER enthält „feedback".
  return new RegExp(`^\\s*${FEEDBACK_WORT.source}\\b`, "i").test(t) || /\bfeedback\b/i.test(t);
}

/**
 * Zieht das eigentliche Feedback aus einer Nachricht wie „Feedback: die App
 * ist super" heraus (entfernt das führende Schlüsselwort samt Trennzeichen).
 */
export function extrahiereFeedback(text: string): string {
  return text
    .replace(new RegExp(`^\\s*${FEEDBACK_WORT.source}\\s*[:,\\-–]?\\s*`, "i"), "")
    .trim();
}
