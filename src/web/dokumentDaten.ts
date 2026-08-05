// Wandelt einen Datenbank-Datensatz zurück in die Struktur, die die
// Word-/E-Mail-Erzeugung erwartet. Editor und Export teilen sich so denselben
// Datenweg — was im Browser bearbeitet wird, landet unverändert im Dokument.
import type { Dokument } from "@prisma/client";
import type { DokumentDaten, Position, Preisquelle } from "../ai/structure.js";
import type { EingabePosition } from "../angebot/berechnung.js";

export function dokumentZuDaten(dok: Dokument): DokumentDaten {
  const positionen = JSON.parse(dok.positionenJson) as Position[];
  return {
    art: dok.art as DokumentDaten["art"],
    kunde: { name: dok.kundeName, strasse: dok.kundeStrasse, plzOrt: dok.kundePlzOrt },
    gewerk: dok.gewerk,
    objekt: dok.objekt,
    positionen,
    aufmassNotizen: dok.aufmassNotizen,
    besonderheiten: dok.besonderheiten,
    folgetermin: dok.folgetermin,
    einleitung: dok.einleitung,
    schlusstext: dok.schlusstext,
    rueckfragen: JSON.parse(dok.rueckfragenJson) as string[],
    // Diese beiden Felder steuern nur den Dialog, nicht das Dokument —
    // beim erneuten Erzeugen aus dem Editor sind sie ohne Belang.
    dialog: { aktion: "ABSCHLIESSEN", nachricht: "" },
    fehlendeInfos: [],
    gewaehrleistung: null,
  };
}

/** Die vom Editor gesendeten Felder zurück in Position-Objekte. */
export interface EditorPosition {
  kategorie: string; // frei — der Handwerker darf eigene Kategorien anlegen
  beschreibung: string;
  menge: number | null;
  einheit: string | null; // aus der Liste ODER eigene Einheit ("Andere…")
  einzelpreis: number | null;
  // Herkunft wird jetzt vom Editor MITGELIEFERT und bleibt erhalten. Früher hat
  // diese Funktion sie fest überschrieben, wodurch die echte Quelle (Diktat,
  // Preisliste, Vorschlag) beim ersten Speichern verloren ging. Optional, damit
  // ältere Clients ohne diese Felder weiter funktionieren (Fallback unten).
  preisquelle?: Preisquelle;
  vorschlag?: boolean;
  mengeUnsicher?: boolean;
}

export function editorZuPositionen(eingabe: EditorPosition[]): EingabePosition[] {
  return eingabe.map((p) => ({
    kategorie: p.kategorie,
    vorschlag: p.vorschlag ?? false,
    beschreibung: p.beschreibung,
    menge: p.menge,
    einheit: p.einheit,
    einzelpreis: p.einzelpreis,
    // Vom Editor gelieferte Herkunft übernehmen. Fehlt sie (Altbestand), aus dem
    // Preis ableiten: ein von Hand vorhandener Preis gilt als MANUELL, kein Preis
    // als UNBEKANNT. Nie mehr fälschlich als DIKTAT ausweisen.
    preisquelle: p.preisquelle ?? (p.einzelpreis !== null ? "MANUELL" : "UNBEKANNT"),
    mengeUnsicher: p.mengeUnsicher ?? false,
  }));
}
