// KI-Kosten je Betrieb (Betreiber-Cockpit Stufe 3).
//
// Jeder KI-Aufruf wird als Event "KI_AUFRUF" mit geschätzten Kosten in
// EUR-CENT festgehalten (Ganzzahl-Cent vermeiden Gleitkomma-Drift beim
// Summieren). Die Preise hier sind bewusst eine PREISTABELLE ZUM ANPASSEN —
// bei Preisänderungen der Anbieter nur diese Konstanten aktualisieren.
// Es geht um die Größenordnung je Kunde ("kostet mich ein 49-€-Kunde 80 €?"),
// nicht um centgenaue Anbieterabrechnung.

/** EUR je 1 Mio. Token für Claude Fable 5 (Listenpreis 10 $ / 50 $, Kurs 0,92 €/$; Stand 15.09.2026).
 *  Vorher stand hier fälschlich die Sonnet-Klasse (2,80/14,00), das Cockpit zeigte ein Viertel der echten Kosten. */
export const PREIS_CLAUDE_EIN_JE_1M_EUR = 9.2;
export const PREIS_CLAUDE_AUS_JE_1M_EUR = 46.0;
/** Prompt-Caching: gelesene Token kosten 0,1×, in den 1-Stunden-Cache geschriebene 2× des Eingabepreises. */
export const PREIS_CLAUDE_CACHE_LESEN_JE_1M_EUR = PREIS_CLAUDE_EIN_JE_1M_EUR * 0.1;
export const PREIS_CLAUDE_CACHE_SCHREIBEN_JE_1M_EUR = PREIS_CLAUDE_EIN_JE_1M_EUR * 2;

/** EUR je Audiominute — BEIDE Transkriptionen zusammen (whisper-1 + gpt-4o-transcribe,
 *  je ~0,55 ct/min). Wer die Doppel-Transkription abschaltet, halbiert den Wert. */
export const PREIS_TRANSKRIPTION_JE_MINUTE_EUR = 0.011;

/** WhatsApp-Sprachnachrichten sind Opus mit ~16 kbit/s → ~2000 Bytes je Sekunde.
 *  Die Transcription-API liefert keine Dauer zurück, deshalb diese Schätzung. */
export function schaetzeAudioSekunden(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return Math.max(1, Math.round(bytes / 2000));
}

/** Kosten eines Claude-Aufrufs in EUR-Cent (aufgerundet, min. 1 Cent bei Nutzung). */
export function kostenClaudeCent(tokensEin: number, tokensAus: number, cache?: { gelesen: number; geschrieben: number }): number {
  const ein = Math.max(0, tokensEin || 0);
  const aus = Math.max(0, tokensAus || 0);
  const gelesen = Math.max(0, cache?.gelesen || 0);
  const geschrieben = Math.max(0, cache?.geschrieben || 0);
  if (ein + aus + gelesen + geschrieben === 0) return 0;
  const eur =
    (ein / 1_000_000) * PREIS_CLAUDE_EIN_JE_1M_EUR +
    (aus / 1_000_000) * PREIS_CLAUDE_AUS_JE_1M_EUR +
    (gelesen / 1_000_000) * PREIS_CLAUDE_CACHE_LESEN_JE_1M_EUR +
    (geschrieben / 1_000_000) * PREIS_CLAUDE_CACHE_SCHREIBEN_JE_1M_EUR;
  return Math.max(1, Math.ceil(eur * 100));
}

/** Kosten der (doppelten) Transkription in EUR-Cent. */
export function kostenAudioCent(sekunden: number): number {
  const s = Math.max(0, sekunden || 0);
  if (s === 0) return 0;
  return Math.max(1, Math.ceil((s / 60) * PREIS_TRANSKRIPTION_JE_MINUTE_EUR * 100));
}

/** Summiert kostenCent aus KI_AUFRUF-Events (dataJson-Feld "kostenCent"). */
export function summiereKostenCent(events: Array<{ dataJson: string }>): number {
  let summe = 0;
  for (const e of events) {
    try {
      const d = JSON.parse(e.dataJson) as { kostenCent?: unknown };
      if (typeof d.kostenCent === "number" && Number.isFinite(d.kostenCent)) summe += Math.max(0, Math.trunc(d.kostenCent));
    } catch {
      /* fehlerhafte Altdaten ignorieren */
    }
  }
  return summe;
}

/** Cent → EUR (für Anzeige mit euroDE). */
export function centZuEuro(cent: number): number {
  return Math.round(cent) / 100;
}
