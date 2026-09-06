// Baut aus der Maler-Wissensbasis (knowledge/maler/*) einen kompakten
// Fachwissen-Block für den KI-Systemprompt. So ist die YAML-Wissensbasis die
// EINE Quelle der Wahrheit — Änderungen dort wirken direkt auf die Angebote,
// ohne den Prompt von Hand zu pflegen.
//
// Wird nur eingespeist, wenn FEATURE_MALER_SCOPE an ist und der Betrieb ein
// Maler ist (siehe structure.ts). Der Block ist bewusst knapp: er gibt der KI
// die Fach-Benennungen, die fachliche Reihenfolge, die wichtigsten
// Pflicht-Rückfragen und die Scope-Grenzen — er ersetzt nicht den Systemprompt.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ladeWissen } from "./wissen.js";

let cache: string | undefined;

/** Materialregel aus knowledge/maler/materialregel.md (Dirks Vorgabe, 06.09.2026): Hauptmaterial separat, Kleinmaterial gebündelt. */
function materialregel(): string {
  try {
    return readFileSync(resolve("knowledge", "maler", "materialregel.md"), "utf8").trim();
  } catch {
    return "";
  }
}

/** Kompakter Maler-Fachwissen-Block für den Systemprompt (gecacht). */
export function malerFachwissen(): string {
  if (cache) return cache;
  const w = ladeWissen();

  // Positionen in fachlicher Reihenfolge, gruppiert nach Kategorie.
  const nachKategorie = new Map<string, string[]>();
  for (const p of w.positionen) {
    const liste = nachKategorie.get(p.kategorie) ?? [];
    liste.push(p.titel);
    nachKategorie.set(p.kategorie, liste);
  }
  const kategorieName: Record<string, string> = {
    schutz: "Schutz & Vorbereitung",
    vorbereitung: "Schutz & Vorbereitung",
    untergrund: "Untergrundarbeiten",
    tapezieren: "Tapezieren",
    beschichtung: "Anstrich / Beschichtung",
    lackieren: "Lackierarbeiten",
    nebenleistung: "Nebenleistungen",
  };
  const positionsKanon = [...nachKategorie.entries()]
    .map(([kat, titel]) => `- ${kategorieName[kat] ?? kat}: ${titel.join(", ")}`)
    .join("\n");

  // Wichtigste Pflicht-Rückfragen (A), knapp.
  const pflichtfragen = w.fragen
    .filter((f) => f.prioritaet === "A")
    .map((f) => `- ${f.short_message}`)
    .join("\n");

  cache = `## Maler-Fachwissen (Innenraum-Renovierung)

Du bearbeitest ein Diktat eines MALERBETRIEBS. Nutze die folgenden Fach-Benennungen und die fachlich richtige Reihenfolge beim Aufbau der Positionen. Erfinde keine Leistungen dazu — ordne nur, was diktiert wurde, sauber ein.

**Positionsbibliothek (Benennung + Reihenfolge eines Fachmanns):**
${positionsKanon}

Reihenfolge grundsätzlich: erst Schutz/Vorbereitung, dann Untergrund (entfernen, reinigen, grundieren, spachteln, schleifen), dann Tapezieren, dann Anstrich, dann Lackierarbeiten, zuletzt Nebenleistungen (Entsorgung, Abschlussreinigung, Anfahrt).

**Pflicht-Rückfragen (nur stellen, wenn wirklich nötig — höchstens die zwei wichtigsten):**
${pflichtfragen}
Ohne die Wandfläche lassen sich mehrere Positionen (Streichen, Tapezieren, Spachteln, Schleifen) nicht berechnen — dann ist die Fläche eine PFLICHT-Angabe.

**Umfang (v0 = Innenraum-Renovierung):**
- Drinnen: ${w.scope.inside_v0.slice(0, 12).join(", ")}.
- NICHT in diesem Umfang: ${w.scope.outside_v0.slice(0, 10).join(", ")}. Kommt so etwas im Diktat vor, weise in "rueckfragen" freundlich darauf hin (nicht raten, nicht einfach weglassen).

${materialregel()}`;
  return cache;
}
