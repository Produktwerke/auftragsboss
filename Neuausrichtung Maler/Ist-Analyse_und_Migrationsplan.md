# AuftragsBoss → Maler-Spezialisierung
## Ist-Analyse, Gap-Analyse und Migrationsplan (Phase-0-Antwort)

> Erstellt als Antwort auf `AuftragsBoss_Maler_Spezialisierung_Claude_Code_Brief.md`.
> Quelle der Wahrheit ist der bestehende Code; jede Aussage ist mit Datei:Zeile belegt.
> Stand der Analyse: 05.08.2026. **Noch keine Code-Änderung** — nur Befund und Plan.

---

## 1. Verstandener Strategiewechsel (Kurzfassung)

AuftragsBoss wird vom **generischen Handwerker-Angebotstool** zur **spezialisierten Angebots- und Wissensplattform für Maler- und Lackiererbetriebe**, mit erstem, eng gefasstem Fokus **Renovierungsangebote für Innenräume**.

Die Spezialisierung ist kein Marketing-Etikett, sondern muss tief verankert werden in: Datenmodell, KI-Pipeline (getrennte Stufen statt einem Mega-Prompt), Maler-Fachwissen als strukturierte Ontologie, Rückfragenlogik, Positionsbibliothek, Preislogik mit lückenlosem Herkunftsnachweis, **Altangebots-Import** (der eigentliche Wettbewerbsvorteil: ein privates, isoliertes Betriebsprofil), Lernen aus Korrekturen (nur als **bestätigbare** Betriebsregeln), Editor, WhatsApp-Ablauf, Website, Analytics und strikter Mandantentrennung.

**Unverhandelbar bleibt:** AuftragsBoss erfindet niemals Preise. Zulässig sind nur (1) im aktuellen Diktat genannte, (2) aus bestätigtem privatem Preisbuch, (3) aus bestätigter Betriebsprofil-Position, (4) manuell ergänzt und freigegeben. Historische Preise nur mit Quelle + Datum. Unbekannt bleibt leer.

**Leitprinzipien** (aus §26 des Briefings): Nachvollziehbarkeit vor Magie · Mandantentrennung vor globalem Lernen · strukturierte Daten vor langen Prompts · bestätigte Regeln vor stillen Annahmen · Produktstabilität vor Komplettumbau · Maler-Tiefe vor Gewerksbreite.

---

## 2. Bestandsaufnahme des bestehenden Systems

Verifizierte Architektur (Node.js/TypeScript ESM, Fastify, Prisma + SQLite, Claude Fable 5, WhatsApp Cloud API; läuft live auf IONOS-VPS `api.auftragsboss.de`).

### 2.1 KI-Pipeline — heute EIN monolithischer Schritt
- [`src/ai/structure.ts`](../src/ai/structure.ts): Ein einziger Claude-Fable-5-Aufruf (`strukturiereDialog`, Zeile 316) erledigt **alles gleichzeitig**: Hörfehler-Korrektur, Zusammenführung der zwei Transkripte, Dokumentart-Erkennung, Positionsbildung **inkl. Preisen**, Material-Vorschläge, Dialog-Entscheidung, `fehlendeInfos`, Einleitung/Schlusstext, Rückfragen, Gewährleistung.
- Das gesamte Fachwissen steckt in **langen Prompt-Texten**: `systemPrompt` (Zeile 225–299) und dem Wörterbuch `MATERIAL_HINWEISE` (Zeile 191–211, Maler/Sanitär/Elektrik als Freitext). Genau die vom Briefing abgelehnte „alles im Prompt"-Architektur.
- **Kein getrennter Speech Parser / Rule Engine / Angebotsgenerator / Validator.** Die vom Briefing (§14) geforderte Trennung existiert nicht.
- Modell fest verdrahtet: `model: "claude-fable-5"` (Zeile 339).

### 2.2 Gewerk — nur ein Freitext-String, kein Domänenobjekt
- `Handwerker.gewerk String?` ([`schema.prisma:24`](../prisma/schema.prisma)), `Dokument.gewerk String?` (Zeile 179), `preisliste.betrieb.gewerk` (Default `""`).
- Material-Hinweise werden per **Substring-Vergleich** auf diesen Freitext ausgewählt (`materialHinweis`, `structure.ts:213–223`). Es gibt keinen Gewerk-Scope, kein Enum, keine Validierung „ist das ein Maler-Auftrag".

### 2.3 Preislogik — Prinzip nur im Prompt, Herkunft nicht dauerhaft
- Es existiert bereits ein **Herkunfts-Ansatz**: `preisquelle ∈ {DIKTAT, PREISLISTE, UNBEKANNT}` und die Flags `vorschlag`, `mengeUnsicher` im Schema (`structure.ts:57–62`). Diese werden in der E-Mail (`templates.ts:113,144`) und im Testskript (`test-ki.ts:99`) genutzt. **Guter Ausgangspunkt.**
- **Aber es gibt keinen Validator.** „Erfinde niemals Preise" ist ausschließlich eine Prompt-Anweisung (`structure.ts:283`). Kein deterministischer Code prüft vor der Ausgabe, ob jeder Preis/jede Menge eine zulässige Quelle hat.
- **Die Herkunft geht beim Editor-Roundtrip verloren:** [`dokumentDaten.ts:47`](../src/web/dokumentDaten.ts) setzt beim Laden `preisquelle` neu auf `einzelpreis !== null ? "DIKTAT" : "UNBEKANNT"` und erzwingt `vorschlag:false` (Zeile 42). Ein Preis aus der Preisliste wird so fälschlich „DIKTAT"; ein Vorschlag verliert seinen Vorschlags-Charakter. Nach dem ersten Speichern ist die echte Herkunft weg.
- **Nur 3 Quellen statt der geforderten 4**, keine historischen Preise mit Datum/„zuletzt bestätigt"/„möglicherweise veraltet".

### 2.4 Preisbuch / Betriebsprofil — global statt pro Betrieb
- [`preisliste.json`](../preisliste.json) ist **eine einzige globale Datei**: `positionen` (Standardpreise) und `konditionen` gelten für **alle** Betriebe. Validiert in [`preisliste.ts`](../src/preisliste.ts) (Cache global, Zeile 62).
- Das Betriebs-Overlay [`betriebsdaten.ts` `effektivePreisliste`](../src/betrieb/betriebsdaten.ts) legt **nur Stammdaten** (Firma, Adresse, Logo, Farbe, Standardtexte) über die Vorgabe — **nicht Preise oder Positionen**. Es gibt heute **kein per-Betrieb-Preisbuch in der Datenbank**. Das vom Briefing zentrale „privates, bestätigtes Preisbuch" fehlt strukturell.
- **Faktischer Ist-Zustand:** In der globalen JSON liegen bisher nur Demo-/Platzhalterpreise; echte Betriebe haben noch keine eigenen Preise gespeichert (nichts ist vermischt). Es fehlt aber schlicht der **Ort**, an dem ein echter Betriebspreis pro Betrieb sicher liegen könnte.

> **FESTE ANFORDERUNG (Dirk, 05.08.2026): Kein Preisbuch, sondern ein Preisgedächtnis — und niemals global.** Es gibt **keine** gepflegte Preisliste. Stattdessen merkt sich AuftragsBoss **auf Wunsch (opt-in)** pro Betrieb, wie dieser ähnliche Leistungen bisher kalkuliert hat (aus tatsächlich im Editor eingetragenen/freigegebenen Preisen), und schlägt sie beim nächsten ähnlichen Auftrag **mit Datum** vor — nie automatisch gesetzt, nie geteilt, nie erfunden. Fehlt Historie oder ist sie unsicher, bleibt der Preis leer. `preisliste.json` entfällt für echte Betriebe (nur noch Demo für Test-Konten); Konditionen wie MwSt/Zahlungsziel/Gültigkeit wandern in die **Betriebsstammdaten** (pro Betrieb). Umzusetzen **vor** dem ersten gespeicherten echten Preis → **Phase 1**.

### 2.5 Positionen — freier JSON-Blob, keine strukturierten Fakten
- Positionen liegen als `Dokument.positionenJson String` (`schema.prisma:181`), geschrieben in `pipeline.ts:381`. Keine normalisierte **Positionsbibliothek**, keine `position_id`, keine wiederverwendbaren Positionsobjekte.
- Das „Objekt" ist ein einzelner Freitext (`Dokument.objekt`, z. B. „Wohnzimmer, ca. 45 m²"). Es gibt **keine strukturierten Maler-Fakten** (Bauteil / Untergrund / Zustand / Ausführungsparameter aus §11 des Briefings).

### 2.6 Mandantentrennung — heute solide auf Zeilenebene, aber neue Features öffnen Risiken
- Alle Kerndaten sind sauber pro Betrieb geschlüsselt: `Dokument/Vorgang/Feedback/Empfehlung` je `handwerkerId` (`schema.prisma`, jeweils Relation + Index).
- **Zwei latente Stellen:** (a) `preisliste.json` ist global — sobald echte Betriebspreise hineinkämen, würden sie für alle gelten. (b) Die Lern-Ansicht [`adminSeite.ts`](../src/web/adminSeite.ts) liest **betriebsübergreifend** alle Dokumente (nur intern, per Admin-Token). Für das neue „Lernen aus Korrekturen" muss die Regelanwendung **strikt pro Betrieb** bleiben.

### 2.7 Datei-Upload / Dokument-Einlesen — existiert nicht
- Nur **Logo-Bild-Upload**: [`logoUpload.ts`](../src/betrieb/logoUpload.ts) akzeptiert ausschließlich PNG/JPG (Zeile 14–18, 31), max. 3 MB, als Base64-Data-URL im JSON-Body (Route `routes.ts:377`). **Kein Multipart, keine `@fastify/multipart`-Abhängigkeit.**
- **Keine PDF/DOCX-Lese-Bibliothek installiert.** `pdfkit` und `docx` sind vorhanden, aber **nur zum Schreiben** (Export). Der Altangebots-Import ist damit komplett neu und braucht eine neue Abhängigkeit + Upload-Weg.

### 2.8 Analytics / Event-Tracking — nicht vorhanden
- Keine Analytics-Bibliothek, kein Event-Store. Geschäftsereignisse landen nur als `console.log` (z. B. „Angebot erstellt" `pipeline.ts:511`). Zählungen (z. B. „3. Angebot" für die Empfehlung, `pipeline.ts:505`) werden live aus `Dokument`-Zeilen abgeleitet. Keine Aktivierungs-/Funnel-/Qualitätsmetriken aus §21.

### 2.9 Tests — nur manuelle Demoskripte, keine Automatik
- Kein Test-Framework (kein vitest/jest). Alle `test:*`-Skripte sind `tsx`-Runner, die auf die Konsole schreiben und **per Auge** beurteilt werden. **Keine Regression** für den WhatsApp→Angebot-Weg; die Webhook-/Routen-Schicht ist von keinem Test berührt.

### 2.10 Lernen aus Korrekturen — Rohmaterial vorhanden, Auswertung binär
- `Dokument.kiOriginalJson` hält die KI-Erst-Positionen fest (datensparsam nur Positionen, `pipeline.ts:386`). [`adminSeite.ts`](../src/web/adminSeite.ts) vergleicht KI-Original vs. final — aber nur **binär** („bearbeitet/unverändert", Zeile 45). Keine Diff-Klassifikation, keine Mustererkennung, keine bestätigbaren Regeln.

---

## 3. Gap-Analyse (Ist vs. Spezifikation)

Legende: ✅ vorhanden · 🟡 teilweise · ❌ fehlt · ⚠️ Risiko/Blocker.

| # | Anforderung (Briefing) | Status | Beleg / Lücke |
|---|---|---|---|
| G1 | „Erfindet nie Preise" **technisch** erzwungen (Validator §14.5) | ❌ | Nur Prompt (`structure.ts:283`); kein Validator-Modul |
| G2 | Durchgängiger Herkunftsnachweis je Preis/Faktum (§10) | 🟡 | `preisquelle`-Enum da, aber beim Laden überschrieben (`dokumentDaten.ts:47`); nur 3 statt 4 Quellen |
| G3 | Historische Preise mit Quelle + Datum + „veraltet"-Warnung (§9) | ❌ | Kein Datum/Bestätigungsdatum-Feld an Positionen |
| G4 | Gewerk als explizites Domänenobjekt + Maler-Scope (§22.4/5) | ❌ | `gewerk` nur Freitext-String; Substring-Match |
| G5 | Getrennte Stufen: Speech Parser · Rule Engine · Generator · Validator (§14) | ❌ | Ein monolithischer LLM-Aufruf |
| G6 | Strukturierte Maler-Fakten (Bauteil/Untergrund/Zustand/Parameter §11) | ❌ | Nur Freitext `objekt` + `aufmassNotizen` |
| G7 | Maler-Ontologie, nicht in Prompts eingebrannt (§11, §26.3) | ❌ | Wissen liegt als Prompt-Text vor |
| G8 | Rückfragen-Matrix mit Prioritätsklassen A/B/C (§12) | 🟡 | `fehlendeInfos` mit PFLICHT/HILFREICH da, aber generisch, keine Maler-Fachlogik |
| G9 | Strukturierte Positionsbibliothek mit `position_id` (§13) | ❌ | Positionen sind freier JSON-Blob |
| G10 | Privates Betriebsprofil in der DB (§5, §6.3) | 🟡 | Nur Stammdaten-Overlay; keine Positionen/Regeln/Preise pro Betrieb |
| G11 | Preisgedächtnis statt (globalem) Preisbuch (§9.2, Dirk) | ❌ | `preisliste.json` global — **entfällt; opt-in Preisgedächtnis pro Betrieb, Phase 1 (R1)** |
| G12 | Altangebots-Import (Upload + Parsing PDF/DOCX/ZIP) (§8) | ❌ | Nur Logo-Bild-Upload; keine Parse-Bibliothek |
| G13 | „Das hat AuftragsBoss gelernt" — bestätigbare Regeln (§8.3, §16) | ❌ | Kein Regel-Modell, kein Bestätigungs-UI |
| G14 | Diff-Klassifikation + Mustererkennung + Regelvorschlag (§16) | 🟡 | Nur binärer Diff in `adminSeite.ts` |
| G15 | Bestätigbare Betriebsregeln, erst nach Bestätigung aktiv (§6, §16) | ❌ | Kein Regelmodell/Zustand |
| G16 | Strikte Mandantentrennung für neue Wissensdaten (§17) | ⚠️ | Zeilenebene ok; global JSON + betriebsübergreifende Admin-Sicht sind zu härten, **bevor** private Preise/Texte gespeichert werden |
| G17 | Löschen/Export eines Betriebsprofils (DSGVO §17) | ❌ | Kein Export/Lösch-Endpunkt für ein ganzes Profil |
| G18 | Event-/Metrik-Instrumentierung (§21) | ❌ | Nur console.log |
| G19 | Automatisierte Regressionstests (§24.5) | ❌ | Nur manuelle Skripte |
| G20 | Goldstandard ~100 geprüfte Maler-Fälle (§15) | ❌ | Nicht vorhanden |
| G21 | Website auf Maler fokussiert (§18) | ❌ | `marketing/index.html` generisch „Für Handwerksbetriebe" (Zeile 289–291) |
| G22 | WhatsApp-Erstkontakt mit Import-Option „B" (§20) | 🟡 | Erstkontakt existiert (inkl. KI-Hinweis); Import-Zweig fehlt |
| G23 | Editor zeigt Herkunft/Quelle/Vorschlag sichtbar (§19) | ❌ | Editor zeigt keine Herkunft |
| G24 | Bestehender WhatsApp→Angebot-Weg bleibt erhalten (§22, §24) | ✅ | Läuft live; muss durch Regressionstest geschützt werden |

---

## 4. Kritische Datenschutz- und Mandantentrennungsrisiken

1. **R1 — Keine globalen und keine erfundenen Preise; Preisgedächtnis statt Preisbuch.** **Unverhandelbare Anforderung.** Kein geteilter Preis-/Positionsspeicher. Preise stammen nur aus dem Diktat, dem **opt-in Preisgedächtnis** des Betriebs (datiert) oder manueller Eingabe — sonst leer. Der per-Betrieb-Speicher (DB, `handwerkerId`) muss existieren, **bevor** ein echter Preis gespeichert wird; `preisliste.json` entfällt für echte Betriebe. Blocker für G10/G12/G13 → **in Phase 1 vorgezogen.**
2. **R2 — Altangebote enthalten Fremd-PII** (Kundennamen, Objektadressen, Preise). Beim Import (§8) müssen: getrennte Ablage je `handwerkerId`, PII-Minimierung für das Lernen (nur strukturell Nötiges), Lösch- und Exportweg (G17), klarer Verarbeitungszweck. **Retrieval darf niemals betriebsübergreifend** treffen.
3. **R3 — Lernregeln dürfen nicht global lecken.** Aus Korrekturen abgeleitete Regeln gelten **nur** für den Betrieb; nur ausdrücklich freigegebene, **abstrahierte** Erkenntnisse dürfen (Opt-in) in die gewerksweite Maler-Engine. Heutige betriebsübergreifende Admin-Sicht (`adminSeite.ts`) ist als reine interne Analyse ok, darf aber **nie** zur automatischen Regelquelle für andere Betriebe werden.
4. **R4 — Keine falschen Anonymitäts-Versprechen.** DSE muss die neue Verarbeitung (Import, Profilbildung, Retrieval) sauber abbilden; keine Behauptung vollständiger Anonymität ohne technische Grundlage.

---

## 5. Priorisierter Migrationsplan (kein Big-Bang)

Grundregeln für alle Phasen: **additiv** (neue Module/Spalten neben den alten), **Feature-Flags** je Fähigkeit, **Rückwärtskompatibilität** (Altdaten bleiben lesbar), **Rollback** = Flag aus. Der bestehende WhatsApp→Angebot-Weg läuft durchgehend weiter.

> **✅ Phase 1 umgesetzt (05.08.2026), lokal, hinter Feature-Flags (alle default AUS), Live-Verhalten unverändert:**
> - Flags in `config.ts` (`FEATURE_VALIDATOR`, `FEATURE_PREISGEDAECHTNIS`, `FEATURE_MALER_SCOPE`).
> - Schema: `Handwerker.gewerkTyp` (default `MALER`), `Handwerker.preisGedaechtnisAktiv`; neue Tabellen `Preisgedaechtnis` (pro `handwerkerId`) + `Event`. (lokal via `db push`; auf dem VPS beim Deploy nachziehen).
> - **Validator** `src/validierung/validator.ts` (hinter Flag in `pipeline.ts`): entfernt jeden Preis ohne belegbare Herkunft. Quellen erweitert: DIKTAT/PREISLISTE/**PREISGEDAECHTNIS**/**MANUELL**/UNBEKANNT.
> - **Herkunft bleibt erhalten**: `dokumentDaten.ts` überschreibt `preisquelle` nicht mehr; Editor gibt Quelle zurück und setzt bei Handänderung `MANUELL`.
> - **Preisgedächtnis** `src/betrieb/preisgedaechtnis.ts`: Merken beim Speichern (opt-in) + datierter Vorschlag in der Pipeline; strikt pro Betrieb.
> - **Eventtracking** `src/analytics/event.ts` (`ANGEBOT_ERSTELLT`, `RUECKFRAGE`).
> - **Testnetz** vitest: 27 Tests grün (Validator, Preisgedächtnis inkl. Mandantentrennung, Herkunft-Roundtrip, Berechnungs-Regression); Typecheck grün; Demo-Kette grün.
> - **Noch offen in Phase 1-Nachlauf:** Editor-Herkunftsanzeige (§19, Daten liegen vor, UI fehlt); Konditionen in Betriebsstammdaten verschieben; DIKTAT-Beleg ist heuristisch (ausgeschriebene Zahlen).

### Phase 1 — Fundament: Wahrheit, Herkunft, Mandantentrennung, Scope, Testnetz  *(Komplexität: M–L)*
Sichert das unverhandelbare Prinzip technisch ab, **trennt die Betriebe sauber** und legt die Datengrundlage, **ohne** die KI-Logik umzubauen.
1. **Preisgedächtnis statt Preisbuch (vorgezogen aus R1 — Pflicht):** neue DB-Tabelle „Preisgedächtnis" je `handwerkerId`, die auf Wunsch festhält, wie der Betrieb ähnliche Leistungen bisher kalkuliert hat (Beschreibung/Einheit → zuletzt genutzter Preis + Datum). Beim nächsten ähnlichen Auftrag als **datierter Vorschlag**, nie automatisch. Konditionen (MwSt/Zahlungsziel/Gültigkeit) wandern in die Betriebsstammdaten. `preisliste.json` entfällt für echte Betriebe (nur Demo). **Kein echter Preis wird gespeichert, bevor dieser Ort existiert.**
2. **Validator-Modul** (neu, deterministisch): prüft jede Ausgabe — hat jede Menge/jeder Preis eine zulässige Quelle? Wurde nichts erfunden? Sind Vorschläge als Vorschläge markiert? Widersprüche? **Fremd-Betriebsdaten** (falscher `handwerkerId`)? Läuft als Gate **nach** der KI, **vor** DB-Schreiben/Ausgabe. Verstoß → Preis wird geleert + intern protokolliert (nie ein erfundener Preis nach außen).
3. **Herkunft durchgängig persistieren:** `preisquelle`/`vorschlag`/`mengeUnsicher` **nicht mehr überschreiben** (`dokumentDaten.ts:47` fixen); Quelle je Position dauerhaft in `positionenJson` halten. Quellenkategorien: Diktat · **Preisgedächtnis** (datiert) · manuell freigegeben · unbekannt/leer.
4. **Gewerk als explizites Feld + Maler-Scope:** `Handwerker.gewerkTyp` (Enum-artig, Start `MALER`), Scope-Prüfung im Validator/Prompt. Bestehende Betriebe defaulten migrationssicher.
5. **Testnetz:** vitest einführen; Regressionstest, der den heutigen Pipeline-Durchlauf (Diktat → Struktur → Berechnung → Dokument) mit fixem Input gegen einen Snapshot absichert. Erste Validator- und Mandantentrennungs-Unit-Tests.
6. **Minimal-Eventtracking:** eine `Event`-Tabelle + `spurEvent()`-Helfer; erste Ereignisse (Angebot erstellt, Rückfrage, Import später). Grundlage für §21.

### Phase 2 — Maler-Fachengine  *(L)*
Ontologie als **strukturierte Daten** (Objektarten/Bauteile/Untergründe/Zustände/Leistungen/Parameter, §11) in einem eigenen Modul, nicht im Prompt. **Speech Parser** (Transkript → strukturierte Fakten, §14.1) von der Textgenerierung trennen. **Rule Engine**: Pflichtfeld-/Widerspruchsprüfung, Rückfragen-Matrix A/B/C (§12), verbotene Annahmen. Erste 20–30 Maler-**Positionstypen** als YAML-artige Objekte (§13). Goldstandard-Testrahmen (§15).

### Phase 3 — Altangebots-Import  *(XL, größter Produktwert)*
Multi-Upload (PDF/DOCX, später ZIP/Scan) + Parse-Bibliothek (neue Abhängigkeit). **Nur Texte/Inhalte auslesen — KEIN Layout nachbauen** (Dirk): extrahiert werden Positionen, Formulierungen, Einheiten, Standardtexte, Reihenfolge, mögliche Regeln. Die Ausgabe bleibt **immer im AuftragsBoss-Stil**, der Betrieb fügt nur sein **Logo** hinzu. Bildung des **privaten Betriebsprofils** (DB, streng pro Betrieb). Bestätigungs-UI „Das hat AuftragsBoss gelernt". Retrieval eigener Positionen. Speisung des **Preisgedächtnisses** (datiert). Mandantentrennungs-Tests (R1–R3).

### Phase 4 — Lernen aus Korrekturen  *(L)*
Diff-Klassifikation ausbauen (Position hinzu/entfernt, Menge/Einheit/Text/Preis/Reihenfolge, §16). Wiederkehrende Muster erkennen → **bestätigbare** Betriebsregel vorschlagen → erst nach Bestätigung aktiv, nur für diesen Betrieb, deaktivierbar. Internes Qualitätsdashboard erweitern.

### Phase 5 — Website & Vermarktung  *(M)*
`marketing/` auf Maler ausrichten (Hero, Import-Sektion, Malerbeispiele, Preisvertrauen), generische Framing entfernen, Demo- vs. Upload-CTA trennen, SEO/Metadaten. Kann teilweise **parallel** früh gezogen werden (kein Kern-Risiko), sollte aber erst live gehen, wenn Import (Phase 3) real ist.

**Abhängigkeiten:** R1/Preisbuch-Isolation ist Voraussetzung für Phase 3/4. Validator (Phase 1) ist Voraussetzung, damit importierte/gelernte Preise sicher behandelt werden. Ontologie (Phase 2) ist Voraussetzung für sinnvolle Import-Extraktion und Rückfragen-Matrix.

---

## 6. Konkret zuerst zu ändernde Dateien/Module (Phase 1)

| Aktion | Datei |
|---|---|
| **Neu (Pflicht):** Preisgedächtnis (opt-in) je Betrieb | `prisma/schema.prisma` (`Preisgedaechtnis` je `handwerkerId`), neue Migration |
| Konditionen zu Betriebsstammdaten; Preise nur aus Diktat/Gedächtnis/manuell; JSON nur Demo | `src/betrieb/betriebsdaten.ts`, `src/preisliste.ts`, `prisma/schema.prisma` (`Handwerker`) |
| **Neu:** Validator (Preis-/Faktenquellen, Widersprüche, Scope, Fremddaten) | `src/validierung/validator.ts` |
| Validator in den Fluss einhängen (nach KI, vor DB) | `src/pipeline.ts` (um Zeile 366 create) |
| Herkunft nicht mehr überschreiben; 4 Quellen + histor. Datum | `src/web/dokumentDaten.ts:42,47`, `src/ai/structure.ts` (Enum `preisquelle`) |
| Gewerk-Typ + Maler-Scope | `prisma/schema.prisma` (`Handwerker.gewerkTyp`), neue Migration |
| **Neu:** Eventtracking-Modell + Helfer | `prisma/schema.prisma` (`Event`), `src/analytics/event.ts` |
| **Neu:** vitest-Konfig + erste Tests | `vitest.config.ts`, `src/**/*.test.ts` |
| Feature-Flags | `src/config.ts` (z. B. `FEATURE_VALIDATOR`, `FEATURE_MALER_SCOPE`) |

Nicht angefasst in Phase 1: Editor-Optik, Word/PDF-Export, WhatsApp-Webhook-Logik, E-Mail-Layout — dadurch bleibt das Live-Produkt stabil.

---

## 7. Notwendige Tests

- **Regression (Pflicht):** heutiger Pipeline-Durchlauf mit fixem Diktat → Snapshot der Positionen/Summen. Schützt G24.
- **Validator-Units:** Preis ohne zulässige Quelle → geleert; erfundene Menge → markiert; Vorschlag bleibt Vorschlag; widersprüchliche Mengen (80 vs. 120 m²) → Konflikt; Fremd-Betriebsdaten → blockiert.
- **Herkunft-Roundtrip:** Position mit `PREISLISTE` bleibt nach Editor-Laden/Speichern `PREISLISTE` (nicht „DIKTAT").
- **Mandantentrennung (Grundstein):** kein DB-Zugriffspfad liefert Positionen/Preise eines anderen `handwerkerId`.
- **Scope:** Nicht-Maler-Diktat wird sauber behandelt (kein Absturz), Maler-Scope greift.

---

## 8. Akzeptanzkriterien Phase 1

1. Ein Diktat mit Preis „nur aus Erfahrung" erzeugt **keinen** Preis im Dokument (Validator erzwingt es, nicht nur der Prompt).
2. Jede Position trägt nach Speichern **und erneutem Laden** ihre **korrekte** Herkunft; ein Preislisten-Preis wird nicht zu „DIKTAT".
3. **Preisgedächtnis pro Betrieb steht (opt-in), kein globales Preisbuch;** `preisliste.json` ist für keinen echten Betrieb mehr Preisquelle. Ein gemerkter Preis erscheint nur als datierter Vorschlag. Ein Test-Zugriff mit fremdem `handwerkerId` liefert keine Preise des anderen Betriebs.
4. Der Betrieb hat einen expliziten Gewerk-Typ; „Maler-Innenrenovierung" ist als Scope benennbar; Altbetriebe funktionieren ohne Datenwanderung weiter.
4. `npm run test` läuft mit vitest grün; der Regressionstest bricht bei einer echten Pipeline-Änderung.
5. Mindestens die Ereignisse „Angebot erstellt" und „Rückfrage gestellt" liegen strukturiert in der `Event`-Tabelle.
6. Der bestehende WhatsApp→Angebot→Editor→PDF/Word/E-Mail-Weg ist unverändert nutzbar (manuell + Regressionstest bestätigt).
7. Alles hinter Feature-Flags; Rollback = Flags aus, ohne Datenverlust.

---

## 9. Empfehlung: erster Implementierungsschritt

**Zuerst Phase 1** — und darin als allererstes **Preisgedächtnis (opt-in, pro Betrieb) + Validator + durchgängige Herkunft + vitest-Testnetz**. Begründung:
- Sichert das **einzige unverhandelbare Produktprinzip** technisch ab (heute hängt es allein am Prompt).
- **Risikoarm additiv:** ändert die KI-Logik nicht, nur ein Gate + korrekte Persistenz. Der Live-Betrieb bleibt unberührt.
- Legt die **Grundlage** für Herkunftsnachweis (Editor), sicheren Import und späteres Lernen — alle folgenden Phasen bauen darauf auf.
- Das **Testnetz** ist Voraussetzung dafür, den bestehenden Prozess über den ganzen Umbau hinweg zu schützen (Kern-Auftrag §22/§24: nicht beschädigen).

Erst danach Phase 2 (Maler-Fachengine) als nächster fachlicher Tiefensprung, dann Phase 3 (Import) als größter sichtbarer Verkaufswert.
