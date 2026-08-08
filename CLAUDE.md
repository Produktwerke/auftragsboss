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

## Stand (August 2026)

> **Update 08.08.2026 (Feierabend) — Landingpage-Ausbau + komplettes Cockpit-Redesign:**
> - **Landingpage (`marketing/`, → IONOS):** Hero weiter verfeinert (2-Spalten, **runder Mikro-CTA „Jetzt live testen"** + WhatsApp-Sekundärbutton + Nummer, Chat als **handy-schmales** Produkt-Window mit warmem Glow, Ober-/Unterkante exakt zur Copy, Abschnitt zentriert). Neuer Abschnitt **„Speziell für Maler"** (Vergleich Allround-Software ✕ vs. AuftragsBoss ✓). „Einsprechen-senden-fertig"-Block **entfernt** (doppelte sich). Demo rechts = **echtes DIN-A4-Angebot mit Klick-Zoom** (Lightbox). **Tablet** im Screenshot-Abschnitt („Handy oder Büro"). **Hintergrund-Textur** (dezente Glows + kleines/großes Karo) über alle Abschnitte. **Kleines Favicon** gebaut (`favicon.ico` → Web-Root + `auftragsboss-favicon-32/180.png`) statt der 430-KB-Datei. Kleinfixes: „Keine App"-Kachel (Symbol 💬 + Border), Sprach-Blasen-Padding, „speziell auf Malerbetriebe" fett/hell.
> - **Cockpit komplett neu (moderne App-Shell):** gemeinsame Shell in **`src/web/navigation.ts`** (`appShell()` + `dashStyles()`): feste **dunkle Anthrazit-Sidebar** (AuftragsBoss-Logo oben, klickbar → Übersicht; Punkte Übersicht/Angebote/Importieren/Einstellungen), sticky **Topbar** (Kontext + Account), Mobile-Drawer. Wiederverwendbar: panel, section, stat, dtable, btn, field, badge, toolbar. **Chrome bewusst OHNE Kundenfarbe** — die Akzentfarbe (`--akzent`) erscheint NUR in der Angebotsvorschau. `cockpitSeite.ts` (Begrüßung, KPI-Zeile, Such-/Filter-Toolbar, moderne Tabelle), `einstellungenSeite.ts` (58/42 + **sticky A4-Vorschau**), `importRoutes.ts` (**Drag-&-Drop-Dropzone**) neu auf der Shell. Routen/Signaturen unverändert.
> - **Cockpit-Funktionen:** Angebote **löschen** (`POST /api/a/:token/loeschen`, räumt Gewährleistung mit ab). **„Versendet"-Status** (neues Feld **`Dokument.versendetAm`**, Toggle `POST /api/a/:token/versendet`): versendete Angebote **ausgegraut** + Badge + Filter und **schreibgeschützt** (Editor sperrt Eingaben + Banner, Speicher-Route liefert 409; **Ansehen/Export bleiben**). Aufhebbar → wieder editierbar. **Angebotsvolumen** voll ausgeschrieben/gerundet. Empfehlungs-Panel prominenter (Badge „1 Monat gratis"). **65 Tests grün.**
> - **/testen-Loop:** Code ist längst korrekt (kein Loop) — war nur **nie deployt**; verschwindet mit dem VPS-Deploy.
> - **⏳ OFFEN (Feierabend 08.08.):** (1) **VPS-Deploy** `scratchpad/deploy.tar.gz` → `scp` + `ssh "... tar xzf ... && npx prisma db push && pm2 restart auftragsboss"` — **`prisma db push` diesmal PFLICHT** (neues Feld `versendetAm`). (2) **IONOS-Upload** `index.html`, `chat-animation.html`, `favicon.ico` (→ Root), `auftragsboss-favicon-32.png`, `auftragsboss-favicon-180.png`. Siehe [[offene-deploys]].

> **Update 07.08.2026 (Feierabend) — Landingpage-Hero komplett neu aufgebaut (Maler-Fokus, SaaS-Niveau):**
> - **Hero von `marketing/index.html` neu** (viele Iterationen mit Dirk): **2-Spalten** (~1400px, 1.1/0.9). Headline „Du bist der Boss. Nicht der Papierkram." **bewusst behalten** (emotionaler Haken); Maler-Positionierung in **Eyebrow „Speziell für Malerbetriebe"** + längerem Lead (statt Headline zu tauschen).
> - **CTA-Bereich neu:** runder gelber **Mikro-Hauptbutton „Jetzt live testen"** (→ https://api.auftragsboss.de/testen, Puls-Animation) als Hauptelement, daneben „oder" + **WhatsApp-Sekundärbutton** + **Telefonnummer** darunter. Kein zweiter rechteckiger Primary. Trust-Zeile darunter (3 Angebote gratis / Keine Anmeldung / Keine Kreditkarte). Zeit-Badge als lesbare Pill.
> - **Chat-Demo** (`chat-animation.html`) als großes **rechtsbündiges Produkt-Window** (~35 % größer), **warmer dezenter gelb/oranger Glow** dahinter, Grid zurückhaltend. Pixel-genau ausgerichtet: **Chat-Oberkante = Headline**, **Unterkante/Caption = Trust-Zeile**, **Nav rechtsbündig zur Animation**, **Logo linksbündig zur Copy** (Header/Trennlinie auf Hero-Breite 1400).
> - **Trust-Strip** (Keine App/Login/EU/DSGVO/kündbar) aus dem Hero **nach unten vor den Schluss-CTA** verschoben; dezente Trennlinie Hero↔erster Abschnitt; toter Schwarzraum unter dem Hero entfernt.
> - Animation im iframe **oben+rechts** ausgerichtet (`align-items:flex-start;justify-content:flex-end`), Body-Höhe steuert das Alignment. In der **statischen Vorschau teils leer** — läuft nur im echten Browser (JS).
> - **MUSS bei IONOS hochgeladen werden:** `index.html`, `chat-animation.html` (Zettel.jpg/Logo liegen schon dort). Memory `[[hero-redesign-brief]]` = **erledigt**.
>
> **Update 07.08.2026 — Produktionsnummer LIVE, Landingpage-Ausbau, Test-Schutz, Empfehlung, Helfer:**
> - **Produktionsnummer +49 174 9364823 ist LIVE und funktioniert end-to-end** (Sprachnachricht → Angebot am 07.08. echt verifiziert). Meta: Produktions-WABA „AuftragsBoss" (WABA-ID 1680177866376806) angelegt, Nummer **registriert**, **Webhooks abonniert**, **Zahlungsmethode** gesetzt. Server-`.env`: `WHATSAPP_PHONE_NUMBER_ID=1186887661184567`. **`FEATURE_MALER_SCOPE` ist AN** (Maler-Fachqualität live).
> - **Display-Name „AuftragsBoss" von Meta ABGELEHNT** (Marke↔Firma-Beziehung nicht offensichtlich, WABA/Business = DAG Deutsche Automotive GmbH). **Fix:** „AuftragsBoss ist eine Marke der DAG Deutsche Automotive GmbH." steht jetzt auf **Startseite + Footer + Impressum** (`marketing/index.html`, `impressum.html`). → Nummer erneut einreichen (Fallback-Name: „AuftragsBoss von DAG Deutsche Automotive GmbH").
> - **Landingpage stark ausgebaut** (`marketing/`): Hero mit **rundem Aufnahme-Knopf** (→ /testen) + **animierter Chat-Demo** (`chat-animation.html`, reines HTML/CSS/JS als iframe, frei fliegend), echtes WhatsApp-Logo, QR/Nummer, fetter Lead, **verlinkte Studien-Belege** (FirstKnock „bis zu 50 %", InsideSales „21× häufiger"). Foto `Zettel.jpg` im Chat. **MUSS bei IONOS hochgeladen werden:** `index.html`, `chat-animation.html`, `Zettel.jpg`.
> - **Test-Angebot (Website-Knopf, istTest):** PDF/Word-Download + E-Mail **gesperrt** → Hinweis „nur über WhatsApp/registrierte Betriebe" + Nummer + WhatsApp-CTA (auch serverseitig 403). **Warte-Animation** auf `/testen` (Meldungen laufen EINMAL durch, kein Loop). **Missbrauchsschutz gehärtet** (`webtest.ts`): Audio-Prüfung (Größe/Typ), **Monats-Deckel**, engere Limits — `WEBTEST` Defaults 2/IP · 50/Tag · 800/Monat · 12 MB. Website-Test = **IP-basiert**; WhatsApp-Direkttest = **nummernbasiert** (`DIREKTTEST_*`).
> - **Empfehlung:** Cockpit-Bereich „Kollegen empfehlen" — Teilen-Knöpfe (WhatsApp/E-Mail/Kopieren, aus eigener App) + Formular „per E-Mail einladen" (`POST /api/empfehlung/:token/email`). Grund: WhatsApp darf niemanden **kalt** anschreiben.
> - **Helfer-Skripte:** `src/env-check.ts` (prüft `.env`: Pflichtfelder/Tippfehler/Format, Werte maskiert), `src/tester-einladen.ts` (Tester-Konto + Einladungstext), `src/import-link.ts`. `.env.example` auf **reines ASCII** umgestellt (Mojibake-Fix bei Windows-Editoren).
> - ~~OFFEN: großer Hero-Redesign~~ → **ERLEDIGT**, siehe Update „Feierabend" oben.

> **Update 06.08.2026 — Maler-Fachengine v1 (Import + Preisgedächtnis), Cockpit, Fachwissen ins Angebot, Produktionsnummer vorbereitet:**
> - **Altangebots-Import** (`src/maler/import/`, hinter `FEATURE_IMPORT`, **live an**): Upload mehrerer PDF/DOCX
>   (`web/importRoutes.ts`, `@fastify/multipart`, je 15 MB), Textextraktion (`extraktion.ts`: **unpdf** für PDF,
>   **mammoth** für DOCX; Scans erkannt → „prüfen"). Auslese per **Claude** (`kiAuslese.ts`, wie `structure.ts`) —
>   erfindet/rechnet nichts; Regel-Parser (`parser.ts`) als Fallback ohne Key. An **14 echten Angeboten** verifiziert.
>   Ergebnis → `ImportDokument`/`ImportPosition`, streng tenant-gebunden (`src/mandant.ts`). Deps: mammoth, unpdf,
>   @fastify/multipart (pdfjs-dist raus wg. **Smart App Control** — nicht ändern). **Math.sumPrecise-Polyfill** in extraktion.ts.
> - **Preisgedächtnis aus Import** (kontrolliertes Lernen): erst **nach Bestätigung** wandern Preise ins Gedächtnis,
>   **datiert aufs Angebotsdatum**, mit **Frische-Schutz** (neuerer eigener Preis wird nicht überschrieben), `quelle IMPORT`
>   (`merkePreiseAusImport`). Wirkungskette Import→bestätigt→neues Angebot schlägt eigenen Preis vor: gegen echte DB verifiziert.
> - **Cockpit** `/start/<token>` (`web/cockpitSeite.ts`, `navigation.ts`): Startseite für registrierte Betriebe mit
>   Kennzahlen + durchsuchbarer Angebotsliste; gemeinsame Reiter-Navigation (Übersicht/Import/Einstellungen). Die
>   Angebotsliste ist aus den Einstellungen ins Cockpit gewandert; Editor-„Zurück"-Link zeigt aufs Cockpit.
> - **Einstellungen**: zweispaltige **Live-Angebotsvorschau** (ganzes Blatt inkl. Summen + Fußzeile, färbt sich live);
>   **Hex-Farbeingabe**; **Feld-Hinweise** (wo jedes Feld im Angebot erscheint). **Word + PDF Fußzeile** konsistent
>   **zweizeilig** (Firma/Anschrift/Ansprechpartner // USt-IdNr. + Bank) — Ansprechpartner + Bank jetzt in **beiden** Formaten.
> - **Maler-Fachwissen ins Angebot** (`src/maler/prompt.ts`, hinter `FEATURE_MALER_SCOPE`, **noch AUS**): speist die
>   YAML-Wissensbasis in den KI-Systemprompt (Positionsbibliothek + fachliche Reihenfolge, A-Pflicht-Rückfragen, Scope).
>   An einem Maler-Diktat verifiziert (korrekte Reihenfolge/Benennung, Materialketten, Fassade korrekt ausgelassen).
> - **Deploy:** tar enthält jetzt den **`knowledge/`-Ordner** + neue Deps. `npx prisma db push` für die Import-Tabellen nötig.
>   **65 Tests grün.** Registrierter-Tester-Konten: `src/import-link.ts` / `src/tester-einladen.ts` (entfernen `istTest`).
> - **Produktionsnummer +49 174 936 4823 vorbereitet:** Landingpage (`marketing/index.html`) auf `wa.me/491749364823`
>   + echter QR-Code (**muss noch bei IONOS hoch**). `src/tester-einladen.ts` + `PRODUKTIONSNUMMER_CHECKLISTE.md`.
>   **Meta-Stand:** Produktions-WABA „AuftragsBoss" (WABA-ID `1680177866376806`, Phone-Number-ID `1186887661184567`)
>   angelegt. Offen bei Meta: Nummer **registrieren**, **Webhooks abonnieren**, **Zahlungsmethode** (Test-WABA/US-Nummer
>   NICHT löschen). Server-`.env`: `WHATSAPP_PHONE_NUMBER_ID=1186887661184567` (+ Systembenutzer-Token muss neues WABA abdecken).

> **Update 05.08.2026 (abends) — Eingabewege, Zusammenfassung, Aufnahme-Knopf (live auf VPS):**
> - **Foto/Screenshot-Upload:** WhatsApp-Bildnachricht (Aufmaß-Zettel, Handy-Notiz) → Claude Vision
>   (`src/ai/bildLesen.ts`) liest den Inhalt als Text → dieselbe Pipeline wie beim Diktat.
>   `whatsapp/media.ts` lädt jetzt Bild UND Audio. Drei gleichwertige Eingabewege: Sprache, Text, Foto.
> - **Zusammenfassung „das habe ich verstanden"** vor dem Angebot (`baueZusammenfassung` in `dialog.ts`),
>   mit Skip: einmalig „ja"/„passt"; dauerhaft per Einstellungs-Schalter „Ablauf"
>   (`Handwerker.zusammenfassungAktiv`, Default an) ODER Stichwort „ohne Zusammenfassung"
>   (Text und Sprache). Format: FETT-Überschriften (keine Emojis), Leistungen als Aufzählung, keine
>   doppelte Maß-Zeile. Einmal je Vorgang (`Vorgang.zusammenfassungGezeigt`); ohne Antwort finalisiert
>   der Timeout-Job. **FIX:** kurze Textantwort „Ja" (2 Zeichen) wurde von der Kürze-Sperre abgewiesen —
>   die greift jetzt nur ohne laufenden Vorgang; „ja/jo/genau…" zusätzlich im Notfallnetz.
> - **Aufnahme-Knopf (Website):** Seite `/testen` (`src/web/testSeite.ts`) mit Mikrofon-Aufnahme +
>   „Beispiel ansehen"; öffentliche Endpunkte `/api/testen/audio` + `/api/testen/beispiel`
>   (`src/web/webtest.ts`) nutzen die Pipeline OHNE WhatsApp/E-Mail → mündet direkt im echten Editor.
>   IP-Missbrauchs-/Kostenschutz (`webtestConfig`: WEBTEST_MAX_PRO_IP/PRO_TAG/MIN_ABSTAND, im
>   Arbeitsspeicher). Landingpage-Test-CTAs (`marketing/index.html`) verlinken jetzt auf `/testen`
>   (index.html bei IONOS hochgeladen).
> - **Feature-Flags auf dem VPS jetzt AKTIV:** `FEATURE_VALIDATOR`, `FEATURE_PREISGEDAECHTNIS`,
>   `FEATURE_ZUSAMMENFASSUNG`, `WEBTEST_AKTIV`. Weiterhin AUS: `FEATURE_MALER_SCOPE`.
> - **Tests:** vitest **33 grün**; Vision- und Web-Test-Durchstich lokal echt verifiziert.
> - ⏳ **Live-Nachtest offen** (05.08. Feierabend): Zusammenfassung mit „Ja" (Text), Foto-Upload,
>   `auftragsboss.de` → „Jetzt im Browser testen". Follow-ups im Ideen-Backlog (Bild-Caption, mehrere
>   Fotos, mobile Mikrofon-Details iOS/Safari, Platzhalter-Nummer/QR im Hero).

> **Update 05.08.2026 — Maler-Neuausrichtung Phase 1 (deployt, Feature-Flags AUS) + Meta durch:**
> - **Strategiewechsel:** AuftragsBoss wird spezialisierte Plattform je Gewerk, Start **Maler
>   (Innenraum-Renovierung)**, Go-to-Market regional dicht. **Ein Codebase**, austauschbare Fachpakete.
>   Vollständige Ist-Analyse + Migrationsplan: `Neuausrichtung Maler/Ist-Analyse_und_Migrationsplan.md`.
>   Leitprinzip bleibt: **erfindet nie Preise**, strikte Mandantentrennung.
> - **Phase 1 live auf dem VPS, alle Flags standardmäßig AUS (Live-Verhalten unverändert):**
>   - **Feature-Flags** (`config.ts`): `FEATURE_VALIDATOR`, `FEATURE_PREISGEDAECHTNIS`, `FEATURE_MALER_SCOPE`.
>   - **Validator** (`src/validierung/validator.ts`): erzwingt maschinell „keine erfundenen Preise"
>     (entfernt jeden Preis ohne belegbare Herkunft), hinter Flag in der Pipeline.
>   - **Herkunft bleibt erhalten** (`dokumentDaten.ts` überschreibt `preisquelle` nicht mehr; Editor gibt
>     die Quelle zurück, Handänderung → MANUELL). Quellen: DIKTAT/PREISLISTE/**PREISGEDAECHTNIS**/**MANUELL**/UNBEKANNT.
>   - **Preisgedächtnis statt Preisbuch** (`src/betrieb/preisgedaechtnis.ts`): merkt sich (opt-in je Betrieb,
>     Feld `preisGedaechtnisAktiv`) frühere Preise und schlägt sie DATIERT vor, streng pro `handwerkerId`.
>     KEIN globales Preisbuch (bewusst gestrichen).
>   - **Eventtracking** (`src/analytics/event.ts`): `ANGEBOT_ERSTELLT`, `RUECKFRAGE`.
>   - **Datenmodell:** `Handwerker.gewerkTyp` (Default MALER), `preisGedaechtnisAktiv`; Tabellen
>     `Preisgedaechtnis`, `Event`. Auf den VPS via `prisma db push` gebracht (additiv).
>   - **Testnetz:** vitest (`npm test`), 27 Tests grün; Herkunft + Preisgedächtnis zusätzlich lokal mit
>     aktivierten Flags im Browser verifiziert.
> - ✅ **Meta-Firmenverifizierung DURCH** — Produktionsnummer **+49 174 936 4823** kann jetzt eingebunden
>   werden: bei Meta hinzufügen (Anzeigename „AuftragsBoss") + Zahlungsmethode → `WHATSAPP_PHONE_NUMBER_ID`
>   in Server-`.env` → `pm2 restart` → `wa.me`/Nummer/QR auf der Landingpage setzen (Platzhalter `+4915123456789`).

> **Update 04.08.2026 — alles live auf VPS + Website:**
> - **E-Mail komplett überarbeitet** (`email/templates.ts`): EINE einheitliche Vorlage (`dokumentMail`)
>   für alle Mails — Anthrazit-Kopfbanner mit Logo, Outlook-fester Tabellen-Button „Jetzt bearbeiten",
>   Vorschau, „Vor dem Versand prüfen", Signatur mit Logo. **Logo als CID-Anhang**
>   (`src/assets/auftragsboss-logo-mail.png`, `logoAnhang()`) → sichtbar ohne „Bilder anzeigen".
>   **E-Mail nur noch bei gesetztem Haken `mailStandard`** (kein ungefragter Auto-Versand mehr); der
>   Editor-Versand nutzt dieselbe volle Vorlage (`anhangFormat` pdf/word steuert nur den Anhang-Hinweis).
>   Frühere kurze `dateiMail` wieder entfernt.
> - **Keine Gedankenstriche** in Nutzertexten (E-Mail + WhatsApp); die KI ist im Systemprompt
>   (`ai/structure.ts`) angewiesen, keine zu erzeugen.
> - **Editor:** Kategorie-Kopfzeile trägt Name + Spaltenlabels in EINER blauen Zeile (keine separate
>   „Leistung"-Zeile; Name größer, weight 700; `td.k-name`/`td.k-sp`); Einheit „pauschal" setzt Menge
>   automatisch auf 1; Zurück-Link zu Einstellungen für Test-Konten entfernt.
> - **WhatsApp-Erstkontakt** (Test + Betrieb) enthält den **KI-Ersthinweis** (EU AI Act):
>   „AuftragsBoss ist ein KI-gestützter Dienst …".
> - **Datenschutz / AI Act:** `marketing/datenschutz.html` ergänzt — 6: KI-Kennzeichnung; 6.1: zwei
>   Transkriptionsmodelle DESSELBEN Anbieters (OpenAI, kein zweiter Anbieter), Original-Audio nur im
>   Arbeitsspeicher, nicht dauerhaft gespeichert; 6.3: Anbieterfristen (OpenAI/Anthropic); **6.4 NEU**
>   interne Qualitätsauswertung (Art. 6 f, Widerspruch, kein Trainings-Transfer); **6.5 NEU** keine
>   Biometrie/Stimmerkennung, keine Art.-22-Entscheidung. Passend im Code: **`kiOriginalJson`
>   datensparsam** (nur Positionen, keine Namen/Anschriften/Freitexte); **Admin-Lernauswertung
>   `/admin/<TOKEN>` zeigt keine Kundennamen mehr** (nur Gewerk/Datum + Positionen).
> - **Rechtstexte + Website live** (IONOS `public`): `datenschutz.html` (Vollfassung) + `impressum.html`
>   (Tel. **+49 174 936 4823**, **kontakt@auftragsboss.de**). „Kostenlos testen"-Button oben rechts
>   entfernt. Kontakt-Adresse bewusst `kontakt@auftragsboss.de` (nicht deutsche-automotive.de) —
>   Postfach/Weiterleitung bei IONOS einrichten.
> - **Tägliches DB-Backup LIVE** (`scripts/backup.sh` → Cron 03:15 auf dem VPS, `/root/backups`, 14 Tage,
>   DB via sqlite3 `.backup` + `uploads/`). **Offen: Kopie außer Haus** (Backups liegen nur auf dem VPS
>   → Memory-Notiz `offsite-backup-todo`).
> - **Robustheit:** `prisma.vorgang.update` → `updateMany` (kein P2025-Absturz mehr, wenn ein Vorgang
>   während der Verarbeitung wegfällt, z. B. Test-Konto-Reset).
> - ⏳ **Extern offen:** Meta-Firmenverifizierung → dann Produktionsnummer **+49 174 936 4823**
>   einbinden. **Nächste große Themen:** Selbst-Registrierung, Stripe/Abo (schaltet u. a. den
>   Empfehlungs-Gratis-Monat frei), PostgreSQL, Offsite-Backup.

**Fertig und getestet:**
- ✅ Sprachnachricht → Angebot (echte Pipeline mit Dirks Testaudio verifiziert)
- ✅ Doppelte Transkription, Zusammenführung, Hörfehler-Korrektur
- ✅ Angebot/Protokoll-Auto-Erkennung, Materialvorschläge, Rückfragen-Dialog
- ✅ Nachtrag per Sprachnachricht (Positionen/Preise ergänzen ohne Word)
- ✅ Word- + PDF-Export mit Logo, Betriebsfarbe, Zwischensummen je Kategorie
- ✅ Web-Editor: vorbefüllt, Live-Summen, eigene Kategorien, mobil getestet
- ✅ **Angebots-Feinschliff (04.08.2026):** (a) **Material steht vor Arbeitsaufwand** —
  zentral in `angebot/berechnung.ts` sortiert (MATERIAL→LEISTUNG→eigene, stabil), Positions-
  nummern folgen der Anzeige-Reihenfolge; Editor `kategorien()` spiegelt dieselbe Ordnung, damit
  Editor/PDF/Word/Nummerierung übereinstimmen. (b) **Arbeitsleistungen sind standardmäßig
  Pauschale (Menge 1)** — KI-Prompt + Schema in `ai/structure.ts` (m²/Stk/Std nur bei ausdrücklich
  diktierter Menge; keine aus Raummaßen abgeleiteten m² mehr für Leistungen); neue Leistungs-Position
  im Editor startet ebenfalls `pauschal`/1; `mengeMitEinheit` zeigt Pauschale schlicht als „pauschal".
  (c) **Klebende Kategorie-Überschriften auf dem Handy** — jede Kategorie ist ein eigener `<tbody>`
  (eigener Klebe-Bereich); die Überschrift bleibt oben kleben, wird per `.klebt` größer/prominenter
  (Signalfarbe), und die nächste schiebt die vorige hinaus. JS `stickyAktualisieren()` togglet `.klebt`
  über `getBoundingClientRect().top<=1`; nur im Handy-Media-Query (`#postab`, max-width:640px).
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
  Bearbeitungsquote — nur mit geheimem Token erreichbar. **Datensparsam** (seit 04.08.2026):
  nur Positionen, keine Kundennamen/Anschriften (`kiOriginalJson` = nur Positionen).
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
  `/webhook/whatsapp`, Verify-Token aus der `.env` (`WHATSAPP_VERIFY_TOKEN` — nach
  dem versehentlichen Leak am 30.07.2026 rotiert; NIE den Klartext hier ablegen);
  `messages` abonnieren;
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
- **Landingpage** unter `marketing/` (deploybare Seite: `index.html` + `fonts/` +
  `auftragsboss-logo.png` + `impressum.html` + `datenschutz.html`). Dunkler Industrie-Look
  Anthrazit + Signalgelb; eigenes Logo als Favicon/Marke; Hausschriften **Inter + Space Mono**
  DSGVO-sicher self-hosted (kein Google-CDN). Impressum/Datenschutz auf DAG Deutsche Automotive
  GmbH. Wird bei **IONOS-Webhosting** unter **auftragsboss.de** hochgeladen (Domain war reine
  Zusatz-Domain ohne Webspace → Webhosting Plus dazugebucht 31.07.2026).
  Platzhalter noch offen: Video, echte Telefonnummer im `wa.me`-CTA (`+4915123456789` ist Dummy,
  bis Produktionsnummer da), QR, App-Screenshots. Auch als Artifact veröffentlicht (Vorschau) —
  Repo-Datei und Artifact getrennt pflegen.
- **„Direkt testen"-Ablauf — ✅ gebaut** (`src/direkttest.ts`, scharf, siehe „Fertig").
  Offen bleibt nur das Verdrahten auf der Landingpage (wa.me-Link/QR, braucht die
  Produktionsnummer) und die eigene verifizierte Nummer fürs echte Öffentlich-Testen.
- **Go-Live-Stand (01.08.2026):**
  - ✅ **Website live** unter **auftragsboss.de** (IONOS-Webhosting Plus, Vertrag 113188648,
    SSL aktiv). Deploy = Inhalt von `marketing/` in den Webroot-Ordner `public` hochladen.
  - ✅ **Meta-Firmenverifizierung DURCH (05.08.2026)** (DAG Deutsche Automotive GmbH). Der frühere
    Blocker ist weg: die Produktionsnummer kann jetzt hinzugefügt werden (siehe Update 05.08.2026 oben).
  - ✅ **Servicenummer bereit:** eSIM **+49 174 936 4823** eingerichtet, wartet auf die Verifizierung.
    Sobald durch: Nummer bei Meta hinzufügen (Anzeigename „AuftragsBoss") + Zahlungsmethode →
    Phone-Number-ID in Server-`.env` (`WHATSAPP_PHONE_NUMBER_ID`) → `pm2 restart auftragsboss` →
    `wa.me`-CTA + angezeigte Nummer + QR auf der Landingpage setzen (aktuell Platzhalter `+4915123456789`).
  - ✅ **Backend-Hosting LIVE (02.08.2026):** IONOS **VPS** (Ubuntu 24.04, Deutschland, VPS S+
    2 GB RAM), **IP `87.106.165.151`**, root-Login per SSH/Passwort. Node 24 installiert.
    - App liegt in **`/root/app`**, läuft per **pm2** (Name `auftragsboss`, Skript `start:prod`
      = `tsx src/server.ts`), Autostart nach Reboot aktiv (`systemctl enable pm2-root`).
    - **Caddy** als Reverse-Proxy: `api.auftragsboss.de` → `127.0.0.1:3000`, HTTPS via
      Let's Encrypt automatisch (Caddyfile in `/etc/caddy/Caddyfile`). Von außen 200/403 bestätigt.
    - `.env` liegt auf dem Server (per scp, an mir vorbei), `BASE_URL=https://api.auftragsboss.de`.
      DB = SQLite `prisma/dev.db` (per `prisma db push` angelegt). `uploads/` angelegt.
    - **Deploy-Weg** (kein GitHub): lokal `tar` vom Quellcode (ohne `node_modules`/`.env`/db),
      per `scp` hoch, `npm install` + `prisma db push`, dann `pm2 restart auftragsboss`.
    - **Cloudflared-Tunnel wird nicht mehr gebraucht** (war nur für den lokalen Test).
    - ✅ **Meta-Webhook** auf `https://api.auftragsboss.de/webhook/whatsapp` umgestellt (Verify-Token
      aus `.env`), Handshake bestätigt. **Dry-Run mit der US-Test-Nummer über den Produktionsserver
      erfolgreich** (Sprache → Angebot → Editor speichern/PDF/Word/E-Mail — alles auf dem VPS).
    - **REDEPLOY bei Code-Änderung** (2 Zeilen, beide im PC-Fenster `PS C:\…>`): lokal neu tarpacken
      (Quellcode ohne `node_modules`/`.env`/db → `scratchpad/deploy.tar.gz`), dann
      `scp …\deploy.tar.gz root@87.106.165.151:/root/` und
      `ssh root@87.106.165.151 "tar xzf /root/deploy.tar.gz -C /root/app && pm2 restart auftragsboss"`.
      Merkregel: `PS C:\…>` = PC (scp/ssh), `root@ubuntu:~#` = Server (Linux-Befehle) — nicht vertauschen!
    - **Server-Kommandos:** `pm2 status` / `pm2 logs auftragsboss` (Live-Log, Strg+C beendet) /
      `pm2 restart auftragsboss`. `.env` am Server ändern → danach `pm2 restart`.
    - **Test-Konten zurücksetzen** (Kontingent frei): per `ssh … npx prisma db execute --stdin` je ein
      `DELETE FROM Dokument|Vorgang|Handwerker WHERE …istTest=1`. Betrifft nur Test-Konten.
    - **Feinschliff aus dem Dry-Run (02.08.2026, deployt):** (1) Sprachnachricht wird SOFORT kurz
      bestätigt („🎙️ Hab ich! …") vor Transkription. (2) **Serielle Verarbeitung pro Nummer** —
      schnell aufeinanderfolgende Sprachnachrichten erzeugen nicht mehr zwei Angebote, die zweite wird
      als Nachtrag erkannt. (3) Test-Kontingent zählt nur eigenständige Angebote (`version=1`), Nachträge
      sind frei; Kontingent auf **5**, Nachrichten-Deckel auf **20** (Server-`.env`). (4) **Kein
      Fremd-Logo** mehr: ohne eigenes Logo zeigt der Editor „Ihr Logo"-Platzhalter, Kunden-PDF/Word
      bleiben schlicht. (5) **Privatadresse entfernt** (Platzhalter jetzt „Musterstraße 5").
    - ⏳ Offene Editor-Idee: PLZ automatisch aus Ort+Straße ergänzen (braucht einen Adress-Lookup-Dienst,
      z. B. OpenPLZ/Nominatim EU-gehostet; Ort allein reicht nicht — viele PLZ pro Stadt).
  - ⏳ **TODO nach VPS:** **tägliches DB-Backup** selbst bauen (kleiner Cron-Job, der die SQLite
    `dev.db` + `uploads/` sichert, rotierende Kopien; bewusst KEIN teures Acronis-Paket gebucht).
  - ⚠️ **Weiterhin offen:** PostgreSQL (statt SQLite) + DSGVO-Erweiterung der Datenschutzerklärung
    (KI-Verarbeitung der Sprachdaten via OpenAI/Anthropic).
- **#2 Empfehlungsprogramm — Mechanik gebaut.** Offen: **Abo/Abrechnung**
  (z. B. Stripe), damit der „1 Monat gratis" wirklich eingelöst wird, plus
  Aktivierung der Leads (heute manuell durch das Team, Status OFFEN→AKTIVIERT).
- **Härtung:** ✅ erledigt (`X-Hub-Signature-256` + Systembenutzer-Token).
  Verbleibend für Produktion: Hosting/Domain (statt Tunnel), PostgreSQL, DSGVO,
  eigene deutsche Nummer + Firmenverifizierung, Selbst-Registrierung.
