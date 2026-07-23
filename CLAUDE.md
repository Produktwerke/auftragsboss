# Angebotsblitz — Projektgedächtnis

> Diese Datei wird beim Start automatisch gelesen. Sie fasst zusammen, was
> das Projekt ist, wie es aufgebaut ist und was fertig bzw. offen ist — damit
> jede Session sofort weiterarbeiten kann.

## Der Nutzer

Dirk (nicht-programmierend). **Erkläre auf Deutsch, ohne Fachchinesisch.**
Ergebnisse zeigen (Screenshots, geöffnete Dateien, Browser), nicht nur Code
beschreiben. Bei Entscheidungen, die Dirk besser beurteilen kann (z. B. wie
Handwerker wirklich kalkulieren), nachfragen statt raten.

## Was das Produkt ist

**Angebotsblitz** — der Handwerker diktiert nach dem Kundentermin im Auto eine
**WhatsApp-Sprachnachricht**, das System erzeugt daraus ein **fertiges Angebot**.
Kein App-Download, kein Login. Das ist der Kernvorteil gegenüber dem Vorbild
`buridans.com` (analysiert zu Sessionbeginn): die verlangen eine Android-App +
500 € Setup.

Ablauf:
```
WhatsApp-Sprachnachricht
  → Whisper + gpt-4o-transcribe (zwei Transkriptionen parallel)
  → Claude Fable 5 führt zusammen + strukturiert (Angebot ODER Protokoll erkannt)
  → Positionen sortiert, Material vorgeschlagen, Rückfragen bei Pflichtlücken
  → WhatsApp-Antwort mit Link zum Web-Editor
  → E-Mail mit Word-Anhang
  → Web-Editor: Preise/Positionen bearbeiten, Export als Word oder PDF
```

Das System erkennt automatisch **Angebot** (vor Auftrag, mit Preisen/Platzhaltern)
vs. **Protokoll** (nach getaner Arbeit, mit Gewährleistungs-Tracking § 634a BGB).

## Wichtige Design-Entscheidungen (nicht rückgängig machen ohne Grund)

- **Preise werden NIE von der KI erfunden.** Nur was diktiert wurde oder in
  `preisliste.json` steht. Fehlende Preise sind der Normalfall (Diktat im Auto)
  und erscheinen als neutrale Platzhalter `___ €`, nicht als Fehler.
- **Die KI rechnet nicht.** Alle Summen berechnet der Code (`angebot/berechnung.ts`),
  centgenau. LLMs rechnen unzuverlässig.
- **Doppelte Transkription.** Whisper und gpt-4o-transcribe lassen unterschiedliche
  Stellen weg (gemessen mit `npm run test:whisper`). Claude führt beide zusammen.
- **Dialog-Ende entscheidet die KI**, nicht Triggerwörter — der Handwerker soll
  kein Zauberwort lernen ("mach ich später" = abschließen). Wortliste in
  `dialog.ts` ist nur Notfallnetz bei KI-Ausfall.
- **Word/PDF = Kundendokument, E-Mail = für den Handwerker.** Arbeitsnotizen
  (Aufmaß, "bitte prüfen") stehen nur in der E-Mail, nie im Kundendokument.
- **Kein Login.** Identität = WhatsApp-Nummer (Betrieb) bzw. Zufallstoken (Editor).

## Projektstruktur (`src/`)

| Bereich | Datei | Zweck |
|---|---|---|
| Einstieg | `server.ts` | Fastify-Server, Webhook + Editor-Routen + Cron-Jobs |
| Konfig | `config.ts` | Lazy-validierte .env-Zugänge, bereichsweise |
| | `preisliste.ts` + `preisliste.json` | Betriebsdaten, Konditionen, optionale Standardpreise |
| WhatsApp | `whatsapp/webhook.ts` | Meta Cloud API: Verify + Nachrichten (Sprache & Text) |
| | `whatsapp/media.ts` / `send.ts` | Audio-Download / Text senden |
| KI | `ai/transcribe.ts` | Doppelte Transkription (Whisper + gpt-4o) |
| | `ai/structure.ts` | **Claude Fable 5**, Structured Outputs (Zod), Systemprompt |
| Pipeline | `pipeline.ts` | Kern: Nachricht → Dialog → Dokument erzeugen |
| | `dialog.ts` | Vorgangs-Verwaltung, Nachtrag, Notfall-Wortliste |
| Angebot | `angebot/berechnung.ts` | Summen, Blöcke/Kategorien, Zwischensummen |
| | `angebot/word.ts` | .docx-Erzeugung (Briefkopf, Logo, Tabelle) |
| | `angebot/pdf.ts` | PDF via pdfkit (gleiches Layout wie Word) |
| Betrieb | `betrieb/logo.ts` | Logo laden, Maße aus Header, in Rahmen einpassen |
| E-Mail | `email/templates.ts` / `send.ts` | HTML-Mail (dark-mode-fest) + SMTP-Versand |
| Web-Editor | `web/editorSeite.ts` | Bearbeitungsseite (HTML+JS, kein Framework) |
| | `web/routes.ts` | GET /a/:token, PUT speichern, export.word/pdf |
| | `web/devServer.ts` | Editor-Vorschau ohne Keys (`npm run dev:editor`) |
| | `web/tokens.ts` / `dokumentDaten.ts` | Tokens + DB↔Editor-Konvertierung |
| Jobs | `jobs/warrantyReminders.ts` | Täglich: Gewährleistungs-Erinnerungen |
| | `jobs/vorgangTimeout.ts` | Alle 5 Min: offene Vorgänge nach 20 Min abschließen |

**Datenbank:** Prisma + SQLite (`prisma/schema.prisma`). Modelle: `Handwerker`,
`Dokument` (Angebot/Protokoll), `Gewaehrleistung`, `Vorgang` (laufender Dialog).
Für Produktion `provider` auf `postgresql` umstellen.

## Befehle

```bash
npm run typecheck        # tsc --noEmit — nach JEDER Änderung prüfen
npm run test:demo        # komplette Kette OHNE API-Keys (Demo-Daten, HTML+Word)
npm run test:ki -- Sprachnachricht_Test.mp3   # echte Pipeline (braucht Keys)
npm run test:dialog      # Dialog-Steuerung (ohne Keys)
npm run test:nachtrag    # Nachtrag per Sprache (braucht Anthropic-Key)
npm run test:whisper -- datei.mp3   # Transkriptionsmodelle vergleichen
npm run dev:editor       # Web-Editor im Browser ansehen (ohne Keys)
npm run dev              # voller Server (braucht alle Keys)
npm run db:push          # Schema in DB übernehmen
npm run db:studio        # DB im Browser ansehen
```

**Node.js** liegt unter `C:\Program Files\nodejs` und ist NICHT im PATH der
Tools — in PowerShell voranstellen:
`$env:Path = "$env:ProgramFiles\nodejs;" + $env:Path`

**Prisma-Client sperrt sich**, wenn ein Server läuft — vor `prisma generate`
laufende `dev:editor`/`dev`-Tasks stoppen.

## Stand (Juli 2026)

**Fertig und getestet:**
- ✅ Sprachnachricht → Angebot (echte Pipeline mit Dirks Testaudio verifiziert)
- ✅ Doppelte Transkription, Zusammenführung, Hörfehler-Korrektur
- ✅ Angebot/Protokoll-Auto-Erkennung, Materialvorschläge, Rückfragen-Dialog
- ✅ Nachtrag per Sprachnachricht (Positionen/Preise ergänzen ohne Word)
- ✅ Word- + PDF-Export mit Logo, Betriebsfarbe, Zwischensummen je Kategorie
- ✅ Web-Editor: vorbefüllt, Live-Summen, eigene Kategorien, mobil getestet
- ✅ Gewährleistungs-Tracking + Erinnerungs-Cron

**Bewusst NICHT im MVP** (Basis liegt im Code bereit, nachrüstbar):
- ⏸️ Kundenansicht mit „Annehmen"-Knopf (`kundenToken` + DB-Felder existieren,
  Seite `/k/:token` fehlt) — von Dirk aus MVP herausgenommen

**Noch nie im Echtbetrieb gelaufen (offene Schritte für Produktion):**
- Meta WhatsApp Business einrichten (der zeitliche Engpass — Firmenverifizierung
  dauert Tage). README hat die Anleitung.
- `X-Hub-Signature-256`-Prüfung im Webhook (Sicherheit, TODO im Code)
- Hosting/Server, PostgreSQL, DSGVO (AV-Verträge OpenAI/Anthropic)
- Logo mit transparentem Hintergrund (aktuelles `Logo.jpg` hat grauen Grund)

## Arbeitskonventionen

- Deutsche Domänenbegriffe im Code (Handwerker, Vorgang, Angebot, Gewährleistung).
- ESM mit `.js`-Endung in Imports (obwohl `.ts`-Dateien).
- Nach jeder Änderung `typecheck`, dann verifizieren (Testskript/Browser/PDF
  ansehen — nicht nur behaupten), dann committen. Commits auf Deutsch,
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Commit-Nachrichten mit Aufzählungen per `git commit -F <datei>` schreiben
  (Bindestrich-Zeilen brechen `-m` in dieser Shell).

## Zugangsdaten

`.env` (nicht in Git). Für die KI-Tests reichen `ANTHROPIC_API_KEY` (Claude,
`sk-ant-…`) und `OPENAI_API_KEY` (Whisper, `sk-proj-…`). WhatsApp + SMTP erst
für den Echtbetrieb. Hinweis: Dirks ursprüngliche Claude-Organisation wurde
versehentlich gelöscht — läuft jetzt über eine neue Organisation.
