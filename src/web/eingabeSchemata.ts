// Laufzeit-Validierung der Request-Bodies (Audit-Maßnahme 3, AB-K03).
//
// Die TypeScript-Interfaces der Routen existieren zur Laufzeit nicht — ohne
// diese Schemata nimmt der Server Strings statt Zahlen, Infinity/NaN,
// kilometerlange Texte und falsche Typen an und schreibt sie in die DB,
// in PDFs und ins HTML (XSS-Träger, kaputte Summen, Admin-Crash).
//
// Grundsatz: großzügige Grenzen für echte Nutzung, hart gegen Unsinn.
// Alle Felder bleiben optional (die Routen füllen fehlende Werte aus dem
// Bestand auf) — aber WENN ein Feld kommt, muss Typ und Grenze stimmen.
import { z } from "zod";
import type { FastifyReply } from "fastify";

const text = (max: number) => z.string().max(max, `höchstens ${max} Zeichen`);

// Menge: immer positiv (eine negative Menge ist nie legitim), endlich,
// mit sinnvoller Obergrenze — killt Infinity/NaN/1e308 und Strings.
const menge = z.number().finite().positive().max(1_000_000).nullable();

// Einzelpreis: negativ ERLAUBT (Nachlass-/Rabatt-Positionen sind im
// Handwerk üblich), aber endlich und begrenzt.
const einzelpreis = z.number().finite().min(-1_000_000).max(1_000_000).nullable();

export const positionSchema = z.object({
  kategorie: text(60),
  beschreibung: text(2000), // mehrzeilig (zusammengefasste Positionen)
  menge,
  einheit: text(30).nullable(),
  einzelpreis,
  preisquelle: z.enum(["DIKTAT", "PREISLISTE", "PREISGEDAECHTNIS", "MANUELL", "UNBEKANNT"]).optional(),
  vorschlag: z.boolean().optional(),
  mengeUnsicher: z.boolean().optional(),
  gedSperre: z.boolean().optional(),
});

export const speicherSchema = z.object({
  kundeName: text(200).optional(),
  kundenNummer: text(60).optional(),
  kundeStrasse: text(200).optional(),
  kundePlzOrt: text(200).optional(),
  nummer: text(60).optional(),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als JJJJ-MM-TT").optional(),
  objekt: text(500).optional(),
  einleitung: text(4000).optional(),
  schlusstext: text(4000).optional(),
  positionen: z.array(positionSchema).max(200, "höchstens 200 Positionen").optional(),
});

// Genau EINE Adresse — keine Leerzeichen/Kommas/Semikolons, sonst würde
// nodemailer daraus eine Empfängerliste machen.
export const eineEmail = z.string().regex(/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/, "ungültige E-Mail-Adresse").max(200);

export const einstellungenSchema = z.object({
  firma: text(120).optional(),
  name: text(120).optional(),
  strasse: text(200).optional(),
  plz: text(10).optional(),
  ort: text(120).optional(),
  telefon: text(40).optional(),
  email: z.union([eineEmail, z.literal("")]).optional(),
  ustIdNr: text(40).optional(),
  bank: text(120).optional(),
  iban: text(50).optional(),
  farbe: text(10).optional(), // Hex-Prüfung macht die Route zusätzlich
  standardEinleitung: text(4000).optional(),
  standardSchlusstext: text(4000).optional(),
  preisGedaechtnisAktiv: z.boolean().optional(),
  zusammenfassungAktiv: z.boolean().optional(),
  angebotGueltigTage: z.union([z.string().max(5), z.number().int().min(0).max(365)]).optional(),
  zahlungsziel: text(160).optional(),
});

export const registrierungSchema = z.object({
  firma: text(120),
  name: text(120),
  email: eineEmail,
});

export const feedbackSchema = z.object({ text: text(4000) });

export const empfehlungMailSchema = z.object({
  email: eineEmail,
  name: text(100).optional(),
});

/**
 * Prüft einen Body gegen ein Schema. Bei Fehler: schickt selbst die
 * 400-Antwort (deutsche Meldung mit Feldpfad) und gibt null zurück —
 * die Route bricht dann einfach mit `return` ab.
 */
export function pruefeEingabe<S extends z.ZodType>(
  schema: S,
  body: unknown,
  reply: FastifyReply,
): z.infer<S> | null {
  const erg = schema.safeParse(body);
  if (erg.success) return erg.data;
  const erste = erg.error.issues[0];
  const pfad = erste?.path.join(".") || "Eingabe";
  void reply.code(400).send({ fehler: `Ungültige Eingabe bei "${pfad}": ${erste?.message ?? "falscher Typ"}` });
  return null;
}
