# AuftragsBoss — Projektgedächtnis

> Diese Datei wird beim Start automatisch gelesen. Sie fasst zusammen, was
> das Projekt ist, wie es aufgebaut ist und was fertig bzw. offen ist — damit
> jede Session sofort weiterarbeiten kann.

## Der Nutzer

Dirk (nicht-programmierend). **Erkläre auf Deutsch, ohne Fachchinesisch.**
Ergebnisse zeigen (Screenshots, geöffnete Dateien, Browser), nicht nur Code
beschreiben. Bei Entscheidungen, die Dirk besser beurteilen kann (z. B. wie
Handwerker wirklich kalkulieren), nachfragen statt raten.

## Was das Produkt ist

**AuftragsBoss** (Domain: AuftragsBoss.de; früher „Angebotsblitz" genannt — der
Projektordner heißt aus historischen Gründen noch `voiceprotokoll-guard`).
Der Handwerker diktiert nach dem Kundentermin im Auto eine
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
- **Kein Passwort.** Identität = WhatsApp-Nummer (Betrieb) bzw. Zufallstoken
  (Editor, Einstellungen). Auch der "Login" zur Einstellungsseite ist nur ein
  persönlicher Zufallslink (`einstellungenToken`) — kein Passwort, keine Hürde.
- **Betriebsdaten liegen am Handwerker, nicht mehr fest in preisliste.json.**
  `betrieb/betriebsdaten.ts` legt die Handwerker-Werte (Logo, Adresse, Farbe,
  Standardtexte) über die Vorgaben aus `preisliste.json`. Jeder Betrieb pflegt
  sein eigenes Profil über die Einstellungsseite; die JSON ist nur noch Vorgabe.

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
| Pipeline | `pipeline.ts` | Kern: Nachricht → Dialog → Dokument erzeugen; Feedback/Einstellungs-Stichworte |
| | `dialog.ts` | Vorgangs-Verwaltung, Nachtrag, Notfall-Wortliste |
| | `feedback.ts` | Tolerante Feedback-Erkennung für den WhatsApp-Weg |
| | `empfehlung.ts` | Empfehlungsprogramm: Einladungscode je Betrieb, „ab 3. Angebot" |
| | `direkttest.ts` | „Direkt testen": unbekannte Nummer → Test-Konto + mehrschichtiger Missbrauchsschutz |
| Angebot | `angebot/berechnung.ts` | Summen, Blöcke/Kategorien, Zwischensummen |
| | `angebot/word.ts` | .docx-Erzeugung (Briefkopf, Logo, Tabelle) |
| | `angebot/pdf.ts` | PDF via pdfkit (gleiches Layout wie Word) |
| Betrieb | `betrieb/logo.ts` | Logo laden, Maße aus Header, in Rahmen einpassen |
| | `betrieb/betriebsdaten.ts` | Handwerker-Stammdaten über preisliste.json legen; einstellungenToken |
| | `betrieb/logoUpload.ts` | Hochgeladenes Logo (Base64) prüfen + in uploads/ speichern |
| E-Mail | `email/templates.ts` / `send.ts` | HTML-Mail (dark-mode-fest) + SMTP-Versand |
| Web-Editor | `web/editorSeite.ts` | Bearbeitungsseite (HTML+JS, kein Framework) |
| | `web/einstellungenSeite.ts` | Betriebseinstellungen: Logo, Adresse, Standardtexte, Angebotsübersicht, Feedback-Box |
| | `web/adminSeite.ts` | Interne Lern-Auswertung: KI-Original vs. finales Angebot (nur mit ADMIN_TOKEN) |
| | `web/einladungSeite.ts` | Empfehlungs-Landingpage `/einladung/:code` (Kollege trägt sich als Lead ein) |
| | `web/routes.ts` | Editor, Einstellungen, Logo/Feedback-API, Mail-Versand (`mail-einstellung`, `mail.:format`), `/admin/:token`, `/einladung/:code` |
| | `web/devServer.ts` | Editor-Vorschau ohne Keys (`npm run dev:editor`) |
| | `web/tokens.ts` / `dokumentDaten.ts` | Tokens + DB↔Editor-Konvertierung |
| Jobs | `jobs/warrantyReminders.ts` | Täglich: Gewährleistungs-Erinnerungen |
| | `jobs/vorgangTimeout.ts` | Alle 5 Min: offene Vorgänge nach 20 Min abschließen |

**Datenbank:** Prisma + SQLite (`prisma/schema.prisma`). Modelle: `Handwerker`,
`Dokument` (Angebot/Protokoll; `kiOriginalJson` = KI-Momentaufnahme für die
Lern-Auswertung), `Gewaehrleistung`, `Vorgang` (laufender Dialog), `Feedback`,
`Empfehlung` (geworbene Kollegen-Leads). Für Produktion `provider` auf
`postgresql` umstellen.

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
- ✅ **Editor-Verbesserungen (aus Live-Test):** Positionsbeschreibung wächst mit
  (mehrzeilig, kein Überlauf); mehr Einheiten (Liter, kg, Sack, Gebinde, Rolle)
  plus „Andere…" mit Freitext für eine eigene Einheit (im Editor als `string`
  entkoppelt vom KI-Enum, wandert 1:1 in PDF/Word); Haken „Datei auch als E-Mail
  senden" unter PDF/Word — merkt sich Zustand (`Handwerker.mailStandard`) und
  E-Mail-Adresse, schickt PDF/Word an die hinterlegte Adresse. `smtpKonfiguriert()`
  prüft SMTP ohne den Server zu beenden. Mailversand live bestätigt (IONOS).
- ✅ Einstellungsseite (passwortloser Link): Logo-Upload, Betriebsdaten, Farbe,
  Standardtexte (Haftungshinweis), Angebotsübersicht; Daten fließen ins Angebot.
  Link-Wege: Erstkontakt-Begrüßung, Zeile unter jedem Angebot, Stichworterkennung.
- ✅ Gewährleistungs-Tracking + Erinnerungs-Cron
- ✅ **Live über Meta WhatsApp getestet (26.07.2026):** echte Sprachnachricht →
  Angebot → WhatsApp-Antwort mit Link, komplett durchgelaufen (Test-Nummer +
  cloudflared-Tunnel). Auch Material-Vorschläge und Nachtrag (Fassung 2) bestätigt.
- ✅ Web-Editor + Einstellungsseite **mobil-tauglich** (Positionen/Angebote als
  gestapelte Karten, kein Quer-Scrollen; Desktop unverändert).
- ✅ **Feedback** über Einstellungsseite UND WhatsApp-Stichwort (Tabelle `Feedback`).
- ✅ **Lern-Auswertung** `/admin/<ADMIN_TOKEN>`: KI-Original vs. finales Angebot,
  Bearbeitungsquote — nur mit geheimem Token erreichbar (echte Kundendaten!).
- ✅ **Empfehlungsprogramm**: persönlicher Einladungslink, Landingpage +
  Lead-Erfassung (`Empfehlung`), WhatsApp-Aufforderung nach dem 3. Angebot.
  Offen bleibt nur die Einlösung des Gratis-Monats (braucht Abo/Abrechnung).
- ✅ **„Direkt testen"** (`src/direkttest.ts`, scharf geschaltet): Schickt eine
  UNBEKANNTE Nummer eine Nachricht, wird sie zum Test-Konto (`Handwerker.istTest`)
  statt abgewiesen — Sprachnachricht → Beispiel-Angebot im Muster-Briefkopf, ohne
  Anmeldung. Test-Konten sind von echten Betrieben getrennt (keine E-Mail, kein
  Einstellungslink, keine Empfehlung). Missbrauchsschutz mehrschichtig, alles per
  `.env`: Not-Aus `DIREKTTEST_AKTIV`, Gratis-Kontingent pro Nummer (2), Nachrichten-
  Deckel pro Nummer (12), Tages-Gesamtdeckel (80), Tempo-Limit (3s). Grundschutz ist
  WhatsApp selbst (echtes Konto nötig). Kontingent + Nachrichten-Deckel liegen pro
  Nummer in der DB (persistent); Tages-Deckel + Tempo laufen im Arbeitsspeicher.
  Grenzen automatisch getestet. **Offen fürs echte Öffentlich-Testen:** eigene
  verifizierte Produktionsnummer — die Meta-Test-Nummer nimmt nur gelistete
  Absender an, taugt also nicht für fremde Interessenten.
- ✅ **Sicherheits-Härtung**: Webhook-Signaturprüfung (`X-Hub-Signature-256`,
  greift bei gesetztem `WHATSAPP_APP_SECRET`; getestet 200/401/401) + dauerhafter
  **Systembenutzer-Token** (kein 24-h-Ablauf mehr). Beides in der (gitignored)
  `.env` aktiv, Token per Graph-API verifiziert (200).

**Bewusst NICHT gebaut:**
- ❌ Kundenansicht mit „Annehmen"-Knopf — **endgültig gestrichen**. Grund: Ein
  Klick-Vertragsschluss würde Dirk rechtlich verpflichten, die Annahme beweissicher
  zu dokumentieren; das will er nicht. (`kundenToken` + DB-Felder bleiben ungenutzt.)

**Offene Schritte für den Echtbetrieb:**
- Meta WhatsApp: Test läuft (siehe oben). Was für den lokalen Test nötig war:
  öffentliche https-Adresse via **cloudflared** (`.\cloudflared.exe tunnel --url
  http://localhost:3000`, portable exe, gitignored); Webhook-Callback = Tunnel +
  `/webhook/whatsapp`, Verify-Token `angebotsblitz-2026`; `messages` abonnieren;
  **und die App per `POST /{WABA_ID}/subscribed_apps` mit dem WABA verbinden** —
  sonst kommen echte Nachrichten NICHT an (Test-Button funktioniert trotzdem).
  Empfänger-Handynummer muss auf der Positivliste stehen (Schritt 1 „Ausprobieren").
  Der 24-h-Test-Token ist inzwischen durch einen **dauerhaften Systembenutzer-
  Token** ersetzt (business.facebook.com → Systembenutzer, App + WABA zuweisen,
  Scopes `whatsapp_business_messaging`+`whatsapp_business_management`, Ablauf „Nie").
  Beim Test die eigene Nummer als Betrieb registrieren: `tsx src/registriere-nummer.ts 49…`.
  Fürs echte Live-Gehen: eigene deutsche Nummer + Firmenverifizierung.
- ✅ `X-Hub-Signature-256`-Prüfung + Dauer-Token erledigt (siehe „Fertig").
- `HOST` (Standard `127.0.0.1`, nur localhost) und `GRAPH_API_VERSION` (Standard
  `v23.0`) sind jetzt per .env konfigurierbar; fürs Hosting `HOST=0.0.0.0`.
- E-Mail-Versand ist unkritisch: schlägt SMTP fehl, läuft der Rest trotzdem
  (WhatsApp-Antwort + Angebot), nur die E-Mail entfällt.
- Hosting/Server, PostgreSQL, DSGVO (AV-Verträge OpenAI/Anthropic)
- Selbst-Registrierung: aktuell legt das Team den Handwerker an (whatsappNummer);
  unbekannte Nummern werden abgewiesen. Der Erstkontakt-Willkommensgruß greift
  erst, sobald der Betrieb im System ist. (Logo lädt jeder Betrieb selbst hoch —
  das alte graue `Logo.jpg` ist nur noch Demo-Vorgabe in preisliste.json.)

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
für den Echtbetrieb. Optional: `ADMIN_TOKEN` (langer Zufallswert) schaltet die
Lern-Auswertung `/admin/<TOKEN>` frei; ohne ihn ist sie aus (404). `HOST`
(Standard localhost) und `GRAPH_API_VERSION` (Standard v23.0) sind konfigurierbar.
Hinweis: Dirks ursprüngliche Claude-Organisation war nur wegen fehlendem Guthaben
deaktiviert (nicht gelöscht) — er bleibt aber bei der neuen Organisation.

## Nächste Ideen (Roadmap)

- **Name entschieden: AuftragsBoss** (Domain AuftragsBoss.de). Alle kundensichtbaren
  Texte umbenannt; interner Ordner bleibt `voiceprotokoll-guard`.
- **Preismodell:** 3 Stufen **49 / 99 / 199 €**, Kontingente 20/80/200 Angebote/Monat,
  Logo/Export in allen Stufen, erste 3 Angebote gratis, **keine Einrichtungsgebühr**.
  Marge ~90 % (API ~5 Cent/Angebot). Noch offen: echte Zahlungsbereitschaft testen.
- **Landingpage** unter `marketing/landingpage.html` (eigenständige HTML, dunkler
  Industrie-Look Anthrazit + Signalgelb). Platzhalter: Video, Telefonnummer, QR,
  App-Screenshots. Auch als Artifact veröffentlicht — Repo-Datei und Artifact getrennt pflegen.
- **„Direkt testen"-Ablauf — ✅ gebaut** (`src/direkttest.ts`, scharf, siehe „Fertig").
  Offen bleibt nur das Verdrahten auf der Landingpage (wa.me-Link/QR, braucht die
  Produktionsnummer) und die eigene verifizierte Nummer fürs echte Öffentlich-Testen.
- **#2 Empfehlungsprogramm — Mechanik gebaut.** Offen: **Abo/Abrechnung**
  (z. B. Stripe), damit der „1 Monat gratis" wirklich eingelöst wird, plus
  Aktivierung der Leads (heute manuell durch das Team, Status OFFEN→AKTIVIERT).
- **Härtung:** ✅ erledigt (`X-Hub-Signature-256` + Systembenutzer-Token).
  Verbleibend für Produktion: Hosting/Domain (statt Tunnel), PostgreSQL, DSGVO,
  eigene deutsche Nummer + Firmenverifizierung, Selbst-Registrierung.
