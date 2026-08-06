// Lädt und VALIDIERT die Maler-Wissensbasis aus knowledge/maler/*.yaml.
//
// Wissen lebt als YAML (von Malern les-/gegenlesbar), wird aber beim Laden per
// Zod streng geprüft — so ist es zugleich typsicher. Fehlt eine Datei oder ist
// sie fehlerhaft, bricht der Start mit klarer Meldung ab, statt später kryptisch
// zu scheitern. Ergebnis wird gecacht.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { z } from "zod";

const WISSEN_DIR = resolve("knowledge", "maler");

/** Liest eine YAML-Datei, entfernt ein evtl. BOM und parst sie. */
function ladeYaml(datei: string): unknown {
  const roh = readFileSync(resolve(WISSEN_DIR, datei), "utf-8").replace(/^﻿/, "");
  return yaml.load(roh);
}

// ── Ontologie ──────────────────────────────────────────
const OntologieEintrag = z.object({
  id: z.string().min(1),
  de: z.string().min(1),
  synonyme: z.array(z.string()).default([]),
  umgangssprache: z.array(z.string()).default([]),
  verwechslung: z.array(z.string()).default([]),
  folgeinfos: z.array(z.string()).default([]),
});
export type OntologieEintrag = z.infer<typeof OntologieEintrag>;

const OntologieSchema = z.object({
  objektarten: z.array(OntologieEintrag),
  raumtypen: z.array(OntologieEintrag),
  bauteile: z.array(OntologieEintrag),
  untergruende: z.array(OntologieEintrag),
  zustaende: z.array(OntologieEintrag),
  leistungen: z.array(OntologieEintrag),
  parameter: z.array(OntologieEintrag),
});
export type Ontologie = z.infer<typeof OntologieSchema>;

// ── Positionsbibliothek ────────────────────────────────
const VALIDIERUNG = z.enum(["OK", "FACHLICHE_VALIDIERUNG_ERFORDERLICH"]).default("OK");

const PositionSchema = z.object({
  position_id: z.string().min(1),
  kategorie: z.string().min(1),
  titel: z.string().min(1),
  alt_titel: z.array(z.string()).default([]),
  beschreibung: z.string().default(""),
  einheiten: z.array(z.string()).min(1),
  mengenquellen: z.array(z.string()).default([]),
  erforderliche_fakten: z.array(z.string()).default([]),
  wichtige_parameter: z.array(z.string()).default([]),
  vorschlag_wenn: z.array(z.string()).default([]),
  bestaetigung_wenn: z.array(z.string()).default([]),
  nicht_enthalten: z.array(z.string()).default([]),
  vorgaenger: z.array(z.string()).default([]),
  folgepositionen: z.array(z.string()).default([]),
  preisquellen: z.array(z.string()).default([]),
  scope_risiko: z.string().default("none"),
  validierung: VALIDIERUNG,
});
export type MalerPosition = z.infer<typeof PositionSchema>;

const PositionenSchema = z.object({ positionen: z.array(PositionSchema).min(1) });

// ── Scope-Regeln ───────────────────────────────────────
const ScopeSchema = z.object({
  inside_v0: z.array(z.string()),
  eingeschraenkt: z.array(z.string()).default([]),
  outside_v0: z.array(z.string()),
  outside_keywords: z.array(z.string()).default([]),
  eingeschraenkt_keywords: z.array(z.string()).default([]),
});
export type ScopeRegeln = z.infer<typeof ScopeSchema>;

// ── Rückfrageregeln ────────────────────────────────────
const QuestionRuleSchema = z.object({
  question_id: z.string().min(1),
  prioritaet: z.enum(["A", "B", "C"]),
  zweck: z.string().default(""),
  short_message: z.string().min(1),
  trigger: z.record(z.string(), z.any()).default({}),
  can_be_skipped_when: z.array(z.string()).default([]),
  bundle: z.array(z.string()).default([]),
});
export type QuestionRule = z.infer<typeof QuestionRuleSchema>;
const FragenSchema = z.object({ fragen: z.array(QuestionRuleSchema).min(1) });

// ── Validierungsregeln ─────────────────────────────────
const ValidationRuleSchema = z.object({
  rule_id: z.string().min(1),
  kategorie: z.string().min(1),
  beschreibung: z.string().min(1),
  schwere: z.enum(["block", "korrigiert", "hinweis"]),
});
export type ValidationRule = z.infer<typeof ValidationRuleSchema>;
const ValidationSchema = z.object({ regeln: z.array(ValidationRuleSchema).min(1) });

// ── Auftragstypen ──────────────────────────────────────
const JobTypeSchema = z.object({
  id: z.string().min(1),
  eingangsaussagen: z.array(z.string()).default([]),
  zwingende_angaben: z.array(z.string()).default([]),
  wichtige_angaben: z.array(z.string()).default([]),
  optionale_angaben: z.array(z.string()).default([]),
  typische_positionen: z.array(z.string()).default([]),
  zusatzpositionen: z.array(z.string()).default([]),
  haeufig_vergessen: z.array(z.string()).default([]),
  unzulaessige_annahmen: z.array(z.string()).default([]),
  warnungen: z.array(z.string()).default([]),
  scope_grenzen: z.array(z.string()).default([]),
});
export type JobType = z.infer<typeof JobTypeSchema>;
const JobTypesSchema = z.object({ auftragstypen: z.array(JobTypeSchema).min(1) });

// ── Sprachmuster ───────────────────────────────────────
const LanguagePatternSchema = z.object({
  muster: z.string().min(1),
  bedeutung: z.string().min(1),
  mehrdeutig: z.boolean().default(false),
  rueckfrage: z.string().default(""),
  effekt: z.enum(["normal", "negation", "ausschluss", "ergaenzung", "korrektur"]).default("normal"),
  zuordnung: z.string().default(""),
});
export type LanguagePattern = z.infer<typeof LanguagePatternSchema>;
const SprachmusterSchema = z.object({ muster: z.array(LanguagePatternSchema).min(1) });

// ── Laden mit Cache ────────────────────────────────────
interface Wissensbasis {
  ontologie: Ontologie;
  positionen: MalerPosition[];
  scope: ScopeRegeln;
  fragen: QuestionRule[];
  validierungsregeln: ValidationRule[];
  auftragstypen: JobType[];
  sprachmuster: LanguagePattern[];
}
let cache: Wissensbasis | undefined;

function pruefe<T>(schema: z.ZodType<T>, datei: string, roh: unknown): T {
  const parsed = schema.safeParse(roh);
  if (!parsed.success) {
    const fehler = parsed.error.issues.map((i) => `   • ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Maler-Wissensdatei "${datei}" ist ungültig:\n${fehler}`);
  }
  return parsed.data;
}

export function ladeWissen(): Wissensbasis {
  if (cache) return cache;
  const ontologie = pruefe(OntologieSchema, "ontology.yaml", ladeYaml("ontology.yaml"));
  const positionen = pruefe(PositionenSchema, "positions.yaml", ladeYaml("positions.yaml")).positionen;
  const scope = pruefe(ScopeSchema, "scope_rules.yaml", ladeYaml("scope_rules.yaml"));
  const fragen = pruefe(FragenSchema, "question_rules.yaml", ladeYaml("question_rules.yaml")).fragen;
  const validierungsregeln = pruefe(ValidationSchema, "validation_rules.yaml", ladeYaml("validation_rules.yaml")).regeln;
  const auftragstypen = pruefe(JobTypesSchema, "job_types.yaml", ladeYaml("job_types.yaml")).auftragstypen;
  const sprachmuster = pruefe(SprachmusterSchema, "language_patterns.yaml", ladeYaml("language_patterns.yaml")).muster;

  // Konsistenz: keine doppelten Positions-IDs.
  const ids = positionen.map((p) => p.position_id);
  const doppelt = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (doppelt.length) throw new Error(`Doppelte position_id in positions.yaml: ${[...new Set(doppelt)].join(", ")}`);

  cache = { ontologie, positionen, scope, fragen, validierungsregeln, auftragstypen, sprachmuster };
  return cache;
}

/** Schnellzugriff auf einen Positionstyp per position_id. */
export function positionJeId(id: string): MalerPosition | undefined {
  return ladeWissen().positionen.find((p) => p.position_id === id);
}
