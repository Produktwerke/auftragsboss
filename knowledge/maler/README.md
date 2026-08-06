# Maler-Fachengine — Wissensbasis v0

Dieses Verzeichnis ist das **gewerksweite Malerwissen** von AuftragsBoss als
strukturierte, versionierbare Daten (YAML/JSON) — bewusst **kein** großer Prompt.
Geladen und beim Start streng geprüft von `src/maler/wissen.ts` (Zod).

> **Erster Entwurf.** Der Inhalt stammt aus dem Produktbriefing und allgemein
> belastbarer Angebotslogik, **nicht** aus geprüftem Normwissen. Stellen mit
> `validierung: FACHLICHE_VALIDIERUNG_ERFORDERLICH` bzw. dem Marker
> `FACHLICHE_VALIDIERUNG_ERFORDERLICH` müssen von Malermeistern gegengelesen
> werden. Im Zweifel lieber eine Rückfrage mehr als eine erfundene Tatsache.

## Scope (v0)
Nur **Innenrenovierung** (siehe `scope_rules.yaml`). Außerhalb (WDVS,
Fassadensanierung, Korrosionsschutz, Betoninstandsetzung, Brandschutz,
Denkmalpflege, Schadstoff-/Schimmelsanierung, GAEB/Ausschreibungen, rechtliche
oder verbindliche technische Beurteilung) wird erkannt und als `outside_v0`
markiert (`requires_manual_review`), nicht bearbeitet.

## Dateien
- `ontology.yaml` — Objektarten, Raumtypen, Bauteile, Untergründe, Zustände, Leistungen, Ausführungsparameter (mit Synonymen/Umgangssprache).
- `positions.yaml` — Positionstypen mit Pflichtfakten, `nicht_enthalten` (verbotene Annahmen), Vorschlagsregeln, zulässigen Preisquellen.
- `job_types.yaml` — typische Auftragstypen mit häufig vergessenen Leistungen und Stolperfallen.
- `question_rules.yaml` — Rückfrageregeln mit Priorität A/B/C und Bündelung.
- `validation_rules.yaml` — technische Schutzregeln (block/korrigiert/hinweis).
- `scope_rules.yaml` — inside/eingeschränkt/outside v0 + Erkennungsstichwörter.
- `language_patterns.yaml` — typische Handwerker-Formulierungen (inkl. Negation/Ausschluss/Korrektur).
- `test_cases.json` — Goldstandard (Zielverhalten) für Phase D/E.
- `negative_cases.json` — Was NICHT passieren darf, je mit Schutzregel.

## Sicherheitsprinzipien (unverhandelbar)
1. **Keine erfundenen Preise.** Preis nur aus: aktuellem Diktat, bestätigtem früheren Angebot desselben Betriebs, manueller Eingabe, freigegebener Kalkulationshistorie. Sonst leer. Historische Preise nur **datiert vorgeschlagen**, nie still gesetzt.
2. **Keine erfundenen Mengen.** Nur genannte oder aus genannten Maßen nachvollziehbar berechnete (markierte) Mengen.
3. **Keine stillen fachlichen Annahmen** (Untergrund tragfähig, Anzahl Anstriche, Grundierung nötig/nicht nötig, Material/Abdeckung/Entsorgung enthalten, Türen/Zargen/Heizkörper/Sockelleisten enthalten …). Unbekanntes bleibt unbekannt oder löst eine Rückfrage aus.
4. **Vorschläge sind Vorschläge**, nie beauftragte Leistungen (sichtbar gekennzeichnet).

## Herkunft & Mandantentrennung
Jede Menge/jeder Preis/jede Position trägt eine Herkunft (`src/maler/herkunft.ts`).
Preise, Positionstexte, Standardtexte, Kundendaten, Kalkulationsregeln und
Korrekturhistorie werden **nie** zwischen Betrieben vermischt. Gewerksweit
gespeichert werden nur **abstrahierte Fachmuster** (welche Angaben oft fehlen,
welche Rückfragen typisch sind, welche Annahmen zu verhindern sind).

## Lernprinzip (später)
Aus wiederkehrenden Korrekturen entstehen **betriebsspezifische** Regelvorschläge,
die dem Nutzer vorgeschlagen und erst **nach Bestätigung** aktiv werden
(deaktivierbar). Keine unkontrollierte automatische Lernlogik.

## Erweiterungsprozess
Neue Begriffe/Positionen/Regeln hier ergänzen (nicht in Prompts einbrennen). Der
Loader prüft beim Start per Zod; Konsistenz (z. B. eindeutige IDs,
Querverweise) sichern die Tests in `src/maler/wissen.test.ts`.
