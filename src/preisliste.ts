// Lädt und validiert preisliste.json — die vom Handwerker pflegbare
// Stammdatendatei (Betriebsdaten, Konditionen, Standardpositionen).
//
// Die Datei darf unvollständig sein: fehlende Positionen führen dazu,
// dass die KI keinen Preis zuordnet und die Zeile im Angebot als
// "Preis prüfen" markiert wird — statt einen Preis zu erfinden.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

export const EINHEITEN = ["m2", "lfm", "Stk", "Std", "pauschal"] as const;
export type Einheit = (typeof EINHEITEN)[number];

const PreislistenSchema = z.object({
  betrieb: z.object({
    firma: z.string(),
    inhaber: z.string(),
    strasse: z.string().default(""),
    plz: z.string().default(""),
    ort: z.string().default(""),
    telefon: z.string().default(""),
    email: z.string().default(""),
    gewerk: z.string().default(""),
    ustIdNr: z.string().default(""),
    /** Pfad zur Logodatei (PNG/JPG), relativ zum Projektordner. Leer = kein Logo. */
    logo: z.string().default(""),
    /** Akzentfarbe für Briefkopf und Tabellenkopf, als Hex ohne #. */
    farbe: z
      .string()
      .regex(/^[0-9a-fA-F]{6}$/, "sechsstelliger Hex-Wert ohne #, z.B. 0B5CAD")
      .default("0B5CAD"),
    /** Bankverbindung für die Fußzeile (optional). */
    bank: z.string().default(""),
  }),
  konditionen: z.object({
    // 0 = kein Stundensatz hinterlegt → Stundenpositionen bleiben Platzhalter
    stundensatz: z.number().min(0).default(0),
    mwstSatz: z.number().min(0).max(100).default(19),
    angebotGueltigTage: z.number().int().positive().default(30),
    anfahrtPauschale: z.number().min(0).default(0),
    zahlungsziel: z.string().default("14 Tage netto"),
  }),
  positionen: z
    .array(
      z.object({
        suchbegriffe: z.array(z.string()).min(1),
        beschreibung: z.string(),
        einheit: z.enum(EINHEITEN),
        preis: z.number().min(0),
      }),
    )
    .default([]),
});

export type Preisliste = z.infer<typeof PreislistenSchema>;

const PFAD = resolve("preisliste.json");
let cache: Preisliste | undefined;

export function ladePreisliste(): Preisliste {
  if (cache) return cache;

  if (!existsSync(PFAD)) {
    console.error(`\n❌ Datei nicht gefunden: ${PFAD}`);
    console.error("→ preisliste.json im Projektordner anlegen (Vorlage liegt im Repo).\n");
    process.exit(1);
  }

  let roh: unknown;
  try {
    roh = JSON.parse(readFileSync(PFAD, "utf-8"));
  } catch (err) {
    console.error(`\n❌ preisliste.json ist kein gültiges JSON.`);
    console.error(`   ${err instanceof Error ? err.message : err}`);
    console.error("\n→ Häufigste Ursache: ein Komma zu viel oder zu wenig.\n");
    process.exit(1);
  }

  const parsed = PreislistenSchema.safeParse(roh);
  if (!parsed.success) {
    console.error("\n❌ preisliste.json enthält ungültige Werte:\n");
    for (const issue of parsed.error.issues) {
      console.error(`   • ${issue.path.join(".")}: ${issue.message}`);
    }
    console.error("");
    process.exit(1);
  }

  cache = parsed.data;
  return cache;
}

/** Kompakte Darstellung der Preisliste für den KI-Prompt. */
export function preislisteAlsText(p: Preisliste): string {
  const zeilen = p.positionen.map(
    (pos) =>
      `- ${pos.beschreibung} | ${pos.preis.toFixed(2)} € pro ${pos.einheit}` +
      ` | erkennbar an: ${pos.suchbegriffe.join(", ")}`,
  );
  if (p.konditionen.stundensatz > 0) {
    zeilen.unshift(`- Stundensatz: ${p.konditionen.stundensatz.toFixed(2)} € pro Std`);
  }
  if (zeilen.length === 0) {
    return (
      "(Keine Standardpreise hinterlegt — das ist der Normalfall. Setze einen Einzelpreis " +
      "ausschließlich dann, wenn er im Diktat ausdrücklich genannt wurde. Sonst bleibt der " +
      "Preis offen und der Handwerker trägt ihn später ein.)"
    );
  }
  return zeilen.join("\n");
}
