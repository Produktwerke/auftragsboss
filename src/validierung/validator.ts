// Deterministischer Validator — das technische Sicherheitsnetz hinter dem
// unverhandelbaren Prinzip: AuftragsBoss erfindet niemals Preise.
//
// Bisher hing dieses Versprechen allein am KI-Prompt. Der Validator prüft die
// KI-Ausgabe MASCHINELL, bevor daraus ein Angebot wird, und entfernt jeden
// Preis, dessen Herkunft sich nicht belegen lässt. Ein entfernter Preis ist
// harmlos (der Handwerker trägt ihn am Schreibtisch ein); ein erfundener Preis,
// der beim Kunden landet, ist ein rechtliches Problem. Im Zweifel also leeren.
//
// Der Validator RECHNET nicht und FORMULIERT nicht — er prüft nur Herkunft und
// Konsistenz. Semantische Widersprüche (z.B. erst 80, später 120 m²) gehören in
// die Faktenebene der Maler-Fachengine (Phase 2) und sind hier bewusst offen.
import type { Position, Preisquelle } from "../ai/structure.js";
import type { Preisliste } from "../preisliste.js";

export type BefundSchwere = "korrigiert" | "hinweis";

export interface Befund {
  /** Index der betroffenen Position in der übergebenen Liste. */
  index: number;
  schwere: BefundSchwere;
  /** Für den Handwerker lesbare Meldung (ohne Gedankenstriche). */
  meldung: string;
}

export interface ValidierungsErgebnis {
  /** Bereinigte Positionen (unbelegte Preise geleert, Quelle auf UNBEKANNT). */
  positionen: Position[];
  befunde: Befund[];
  /** Anzahl tatsächlich vorgenommener Korrekturen (entfernte Preise). */
  korrigiert: number;
}

export interface ValidierungsKontext {
  /** Das Roh-Diktat (alle Handwerker-Nachrichten), um DIKTAT-Preise zu belegen. */
  transkript: string;
  /** Die effektive Preisliste DIESES Betriebs, um PREISLISTE-Preise zu belegen. */
  preisliste: Preisliste;
  /**
   * Preisquellen, die in diesem Kontext für einen gesetzten Preis zulässig sind.
   * KI-Ausgabe (Standard): DIKTAT + PREISLISTE. Der Editor-Weg erlaubt zusätzlich
   * MANUELL und PREISGEDAECHTNIS (beides von der Anwendung gesetzt, nicht erfunden).
   */
  erlaubteQuellen?: Preisquelle[];
}

const KI_QUELLEN: Preisquelle[] = ["DIKTAT", "PREISLISTE"];

/** Cent-genaue Gleichheit zweier Beträge (Fließkomma-tolerant). */
const gleich = (a: number, b: number): boolean => Math.abs(a - b) < 0.005;

/**
 * Belegt ein Preis sich im Diktat? Sucht die Zahl in gängigen Schreibweisen
 * (Ganzzahl, ein/zwei Nachkommastellen, Komma ODER Punkt als Dezimaltrenner).
 * Bewusst konservativ: findet die Zahl NICHT, gilt der Preis als unbelegt.
 */
export function preisImText(preis: number, text: string): boolean {
  const t = text.replace(/\s+/g, " ");
  const ganz = Math.round(preis);
  const kandidaten = new Set<string>();
  if (Number.isInteger(preis)) kandidaten.add(String(ganz));
  const zwei = preis.toFixed(2); // "9.80"
  kandidaten.add(zwei);
  kandidaten.add(zwei.replace(".", ","));
  const eins = preis.toFixed(1); // "9.8"
  kandidaten.add(eins);
  kandidaten.add(eins.replace(".", ","));
  for (const k of kandidaten) {
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Keine Ziffer/Trennzeichen direkt daneben, damit 14 nicht in 140 oder
    // 6,80 nicht in 16,80 fälschlich "gefunden" wird.
    const re = new RegExp(`(?<![\\d.,])${esc}(?![\\d.,])`);
    if (re.test(t)) return true;
  }
  return false;
}

/** Steht der Preis in der hinterlegten Preisliste DIESES Betriebs? */
function preisInListe(preis: number, preisliste: Preisliste): boolean {
  if (preisliste.positionen.some((p) => gleich(p.preis, preis))) return true;
  if (preisliste.konditionen.stundensatz > 0 && gleich(preisliste.konditionen.stundensatz, preis)) return true;
  if (preisliste.konditionen.anfahrtPauschale > 0 && gleich(preisliste.konditionen.anfahrtPauschale, preis)) return true;
  return false;
}

/**
 * Prüft eine Positionsliste und gibt eine bereinigte Liste zurück. Jeder Preis
 * ohne belegbare, zulässige Herkunft wird geleert (einzelpreis null, Quelle
 * UNBEKANNT) und als Korrektur vermerkt. Die Funktion verändert die Eingabe
 * NICHT (reine Kopie), damit sie sich gefahrlos testen lässt.
 */
export function validierePositionen(
  positionen: Position[],
  kontext: ValidierungsKontext,
): ValidierungsErgebnis {
  const erlaubt = new Set<Preisquelle>(kontext.erlaubteQuellen ?? KI_QUELLEN);
  const befunde: Befund[] = [];

  const bereinigt = positionen.map((p, index) => {
    let einzelpreis = p.einzelpreis;
    let preisquelle: Preisquelle = p.preisquelle;

    if (einzelpreis === null) {
      // Kein Preis gesetzt: Herkunft ist definitionsgemäß UNBEKANNT.
      preisquelle = "UNBEKANNT";
    } else {
      let grund = "";
      if (preisquelle === "UNBEKANNT") {
        grund = "ist ohne Herkunft gesetzt";
      } else if (!erlaubt.has(preisquelle)) {
        grund = `ist mit einer hier unzulässigen Quelle gesetzt (${preisquelle})`;
      } else if (preisquelle === "PREISLISTE" && !preisInListe(einzelpreis, kontext.preisliste)) {
        grund = "ist als Preislisten-Preis ausgewiesen, steht aber nicht in der hinterlegten Preisliste";
      } else if (preisquelle === "DIKTAT" && !preisImText(einzelpreis, kontext.transkript)) {
        grund = "ist als Diktat-Preis ausgewiesen, kommt im Diktat aber nicht vor";
      }

      if (grund) {
        befunde.push({
          index,
          schwere: "korrigiert",
          meldung: `Preis für „${p.beschreibung}" ${grund}. Entfernt, bitte selbst eintragen.`,
        });
        einzelpreis = null;
        preisquelle = "UNBEKANNT";
      }
    }

    return { ...p, einzelpreis, preisquelle };
  });

  return {
    positionen: bereinigt,
    befunde,
    korrigiert: befunde.filter((b) => b.schwere === "korrigiert").length,
  };
}
