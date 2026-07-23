// Wandelt einen Datenbank-Datensatz zurück in die Struktur, die die
// Word-/E-Mail-Erzeugung erwartet. Editor und Export teilen sich so denselben
// Datenweg — was im Browser bearbeitet wird, landet unverändert im Dokument.
import type { Dokument } from "@prisma/client";
import type { DokumentDaten, Position } from "../ai/structure.js";

export function dokumentZuDaten(dok: Dokument): DokumentDaten {
  const positionen = JSON.parse(dok.positionenJson) as Position[];
  return {
    art: dok.art as DokumentDaten["art"],
    kunde: { name: dok.kundeName, adresse: dok.kundeAdresse },
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
  kategorie: "LEISTUNG" | "MATERIAL";
  beschreibung: string;
  menge: number | null;
  einheit: Position["einheit"];
  einzelpreis: number | null;
}

export function editorZuPositionen(eingabe: EditorPosition[]): Position[] {
  return eingabe.map((p) => ({
    kategorie: p.kategorie,
    vorschlag: false, // im Editor bestätigt der Handwerker jede Zeile bewusst
    beschreibung: p.beschreibung,
    menge: p.menge,
    einheit: p.einheit,
    einzelpreis: p.einzelpreis,
    preisquelle: p.einzelpreis !== null ? "DIKTAT" : "UNBEKANNT",
    mengeUnsicher: false,
  }));
}
