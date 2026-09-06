// Raumzuordnung eines Wandfotos (Teiletappe 2), rein und testbar.
import { parseRaeumeText, type RaumMasse } from "./aufmass.js";

/**
 * Raumzuordnung eines Fotos: Bildunterschrift (wenn sie einen bekannten Raum
 * nennt oder selbst wie ein Raumname aussieht), sonst der zuletzt genannte
 * Raum aus der letzten KI-Auswertung. Liefert dazu die Raumhöhe als Maßstab.
 */
export function ordneFotoZu(
  vorgang: { raeumeText?: string | null } | null,
  bildText: string | undefined,
): { raumName: string | null; raumhoeheM: number | null; wandNrAusText: number | null } {
  const raeume: RaumMasse[] = parseRaeumeText(vorgang?.raeumeText);
  const text = (bildText ?? "").trim();
  const wandTreffer = /wand\s*(\d{1,2})/i.exec(text);
  const wandNrAusText = wandTreffer ? parseInt(wandTreffer[1]!, 10) : null;
  let raum: RaumMasse | undefined;
  if (text) {
    const t = text.toLowerCase();
    raum = raeume.find((r) => t.includes(r.name.toLowerCase()));
  }
  let raumName: string | null = raum?.name ?? null;
  if (!raumName && text) {
    // Unterschrift ohne bekannten Raum: alles außer "Wand N" als Raumname nehmen
    const rest = text.replace(/wand\s*\d{1,2}/i, "").replace(/[,;:.]/g, " ").trim();
    if (rest && rest.length <= 40 && /[A-Za-zÄÖÜäöüß]/.test(rest)) raumName = rest;
  }
  if (!raumName && raeume.length) {
    raum = raeume[raeume.length - 1];
    raumName = raum!.name;
  }
  return { raumName, raumhoeheM: raum?.hoeheM ?? null, wandNrAusText };
}

