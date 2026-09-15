# AuftragsBoss — Projektgedächtnis

> Diese Datei wird beim Start automatisch gelesen. Sie fasst zusammen, was
> das Projekt ist, wie es aufgebaut ist und was fertig bzw. offen ist — damit
> jede Session sofort weiterarbeiten kann.

## Der Nutzer

Dirk (nicht-programmierend). **Erkläre auf Deutsch, ohne Fachchinesisch.**
Ergebnisse zeigen (Screenshots, geöffnete Dateien, Browser), nicht nur Code
beschreiben. Bei Entscheidungen, die Dirk besser beurteilen kann (z. B. wie
Handwerker wirklich kalkulieren), nachfragen statt raten.

## Wo der Code liegt (seit 14.09.2026) und wie zwei PCs zusammenarbeiten

- **Firma:** AuftragsBoss gehört der **DAG Deutsche Automotive GmbH**, nicht der Screens GmbH (Tyra, Billo).
- **GitHub:** https://github.com/Produktwerke/auftragsboss — privat, eigenes GitHub-Konto `Produktwerke` (= DAG), getrennt vom Screens-Konto `ScreensGmbH`. Branch `master`.
- **Arbeitskopie auf jedem PC:** `C:\dev\dag\auftragsboss`. **Nicht mehr in OneDrive.** Der alte Ordner `OneDrive…\_Claude\Angebotsblitz\voiceprotokoll-guard` ist stillgelegt (Marker-Datei). Dirks Geschäftsunterlagen (Excel, Word, Datenschutz, Messbank-Fotos, Logos, Videos) liegen weiter dort in OneDrive und waren nie Teil des Repos.
- **Zwei PCs (Büro-PC, Heim-PC):** Abgleich nur über GitHub: PC → GitHub → anderer PC. Nie beide gleichzeitig am Projekt. Heim-PC-Einrichtung: OneDrive `_Claude\Screens-GitHub-Umzug-Heim-PC.md`, Abschnitt AuftragsBoss.
- **Routine:** Sitzungsbeginn `git pull` („hol den aktuellen Stand") und diese Datei erneut lesen; Sitzungsende Stand hier eintragen, committen, `git push` („lade alles hoch"). Für Git-Befehle `GCM_INTERACTIVE=never` setzen, sonst hängt ein unsichtbarer Anmeldedialog.
- **Zwei GitHub-Konten auf einem PC:** Die Remote-URL trägt den Benutzernamen (`https://Produktwerke@github.com/…`), damit der Credential Manager das DAG-Konto wählt. Wenn ein PC noch nicht angemeldet ist, per PowerShell-Tool `$env:GCM_INTERACTIVE="always"; Start-Process "C:\Program Files\Git\mingw64\bin\git-credential-manager.exe" -ArgumentList "github login"` → Fenster „Connect to GitHub" → Dirk meldet sich im Browser als `Produktwerke` an. Kontrolle: `git credential-manager github list`.
- **Sicherheits-Wächter** `.claude/hooks/guard.cjs` + `settings.json` (Modus „auto") liegt seit 14.09.2026 im Repo. Nie umgehen; er sperrt u. a. winget/choco und den Schlüsselordner.
- **Nach dem Klonen:** `npm install`, `npx prisma generate` (npm 11 führt Installationsskripte nicht automatisch aus), `npm run typecheck`, `npm test` (Stand 14.09.2026: 0 Typfehler, 262 Tests grün).
- **Server-Zugang:** Der Büro-PC erreicht den VPS `87.106.165.151` (Schlüssel im Profil, geprüft 14.09.2026). Deploys bleiben ein bewusster Schritt, siehe Abschnitt Deploy — nie als Nebeneffekt.
- **Heim-PC eingerichtet 15.09.2026:** geklont nach `C:\dev\dag\auftragsboss`, Pakete installiert, Typprüfung 0 Fehler, 262 Tests grün. Beide GitHub-Konten (ScreensGmbH, Produktwerke) im Credential Manager gespeichert, Kontrolle `git credential-manager github list` zeigt beide.

## Was das Produkt ist

**AuftragsBoss** (Domain: AuftragsBoss.de; früher „Angebotsblitz" genannt — der
alte Projektordner in OneDrive hieß `voiceprotokoll-guard`, seit 14.09.2026 liegt
die Arbeitskopie unter `C:\dev\dag\auftragsboss`, siehe Abschnitt „Wo der Code liegt").
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
| | `eingabestand.ts` | Eingabezähler je Nummer: laufende Auswertung erkennt, dass sie überholt ist |
| | `angebot/fertigmeldung.ts` | Kompakte WhatsApp-Fertigmeldung mit Warnhinweisen und Knöpfen |
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
| | `jobs/vorgangTimeout.ts` | Alle 2 Min: Sicherheitsnetz (liegengebliebene Eingabe nachholen, offene Rückfrage nach 15 Min erzwingen) |

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

> **Update 13.09.2026 nachm. — SELBSTHEILUNG + BETREIBER-ALARM (Commits 2fd1450, 2f933a2, deployt inkl. db push; 262 Tests):**
> - **Auslöser:** Dirks langer Verlauf (Diktat, Fotos, Rückfrage, 2 Fassungen) → KI-JSON abgeschnitten („Unterminated string"), weil
>   `max_tokens` 16.000 das adaptive Thinking MIT enthält. Jetzt 32.000, als **Stream** (`messages.stream(...).finalMessage()`; das SDK
>   verweigert ab ~21k max_tokens den normalen Aufruf: „Streaming is required …"), plus ein automatischer zweiter Versuch.
> - **Selbstheilung (`src/selbstheilung.ts`, `pipeline.fuehreAuswertungAus`):** scheitert die Auswertung, wird der Vorgang NICHT mehr
>   geschlossen, sondern `Vorgang.fehlversuche`/`naechsterVersuch` gesetzt (3/10/30/60/60/60 Min); der Timeout-Job führt fällige
>   Wiederholungen aus. Ab dem 2. Fehlversuch bekommt der Maler `MALER_ZWISCHENSTAND` („klemmt gerade, Diktat ist gespeichert"), nach
>   dem 6. `MALER_AUFGEGEBEN` (Vorgang zu, später neu schicken). Erfolg nach Fehlversuchen = Entwarnung. Fehler VOR dem Vorgang
>   (Transkription, Download) bleiben „bitte noch einmal schicken" + Alarm.
> - **Betreiber-Alarm (`betrieb/betreiberAlarm.ts` `meldeStoerung`/`meldeEntwarnung`):** E-Mail an ADMIN_EMAIL (App-SMTP, mit Fehlertext,
>   Anleitung und Kundensatz `KUNDEN_SATZ`) UND WhatsApp-Vorlage `betreiber_alarm` ({{1}} was, {{2}} Stand; Meta-Genehmigung von Dirk am
>   13.09. eingereicht; Name per `BETREIBER_VORLAGE_ALARM` überschreibbar) an BETREIBER_HANDY. Höchstens 1 Alarm je Stunde und Schlüssel.
> - **Wachhund Check 5:** offene Vorgänge > 45 Min mit Inhalt oder ≥ 3 Fehlversuche → Alarm-Mail (`/root/wachhund.sh` installiert).
> - Lehre: Ein Job, der bei Fehlern den Vorgang schließt, macht aus einem KI-Aussetzer einen Datenverlust für den Kunden.

> **Update 13.09.2026 — DIREKTANGEBOT STATT SAMMELMODUS (nach Dirks vier Sprachnotizen vom Test am 12.09.; ersetzt den Sammelmodus-Block vom 11.09.):**
> - **Leitsatz (Dirk):** So schnell wie möglich das Angebot anbieten, im Zweifel lieber korrigieren als lange per WhatsApp interagieren.
>   Zusammenfassung „Das habe ich verstanden", Raumbilanz und der „fertig"-Schritt sind WEG (`baueZusammenfassung`, `raumBilanz`,
>   `istFertigWunsch`, `istBestaetigung`, Floskeln `weiterOderFertig`/`fotosOderWeiter`, Einstellungs-Schalter „zusammenfassen" entfernt;
>   DB-Spalten `zusammenfassungAktiv`/`zusammenfassungGezeigt`/`erinnertAm` bleiben ungenutzt stehen, kein db push).
> - **Eingaben bündeln (`planeAuswertung` in pipeline.ts):** JEDE Eingabe (Sprache/Text 3 s, Foto 30 s) plant EINE Auswertung, jede
>   weitere verschiebt sie. **Überholen:** `src/eingabestand.ts` zählt Eingaben je Nummer (Zähler wird in `verarbeiteNachrichtSeriell`
>   VOR dem Einreihen erhöht); `werteVorgangAus` merkt sich den Stand beim Start und verwirft das KI-Ergebnis, wenn er sich geändert hat
>   (Event `AUSWERTUNG_UEBERHOLT`); ein feuernder Timer prüft dasselbe. Fehler in der geplanten Auswertung gehen als Hinweis an den Maler.
> - **Jede Ruhephase = Angebot bzw. neue Fassung.** Nach dem Angebot ist der Vorgang ABGESCHLOSSEN; die nächste Eingabe innerhalb von
>   NACHTRAG_MINUTEN (45) öffnet ihn wieder (`holeNachtragsVorgang`, runde 0) → Fassung n+1. `erstelleDokument` hängt jetzt einen
>   Assistent-Vermerk „(Angebot X, Fassung n, erstellt und Link gesendet)" an den Verlauf (KI sieht Nachtrag-Grenze, Job erkennt „nichts offen").
> - **Fertigmeldung (`src/angebot/fertigmeldung.ts`, rein, 6 Tests):** EINE Knopfnachricht (`sendeWhatsAppKnoepfe`, Fallback Text):
>   Kopf (Kunde bzw. „Fassung n"), Zeile „📋 Räume: Leistungen (n Positionen)" (`kurzeBilanz`), Gesamt nur bei vollständigen Preisen,
>   Link, max. 4 Warnhinweise (Aufmaß: verworfene/unplausible/Grauzonen-Öffnungen; Fotos: Boden fehlt, Bildrand-Öffnung; „✏️ Im Angebot
>   noch ergänzen: …" aus PFLICHT-`fehlendeInfos`), Fototipp einmal (erste Fassung mit Räumen ohne Fotos), Testhinweis; Knöpfe
>   **„Nächster Raum"** (`RAUM_WEITER`) und **„Angebot korrigieren"** (`ANGEBOT_KORRIGIEREN`) → `verarbeiteAngebotsKnopf` (kein KI-Aufruf,
>   öffnet den Vorgang wieder, Event `ANGEBOT_KNOPF`). Kein Materialhinweis, kein Einstellungslink, kein „Preise durchsagen" mehr.
> - **Fotos:** Eingangsbestätigung nur einmal je Schwung (90 s), kein Feedback je Foto; sofort NUR `fotoNachfassHinweis` (zu dunkel,
>   Tür offen). Bei der Auswertung „📐 n Fotos sind drin, ich rechne das Angebot …". Boden/Bildrand-Hinweise kommen aus
>   `Foto.erkennungJson` der neuen Fotos (`fotoHinweiseKurz`) in die Fertigmeldung, beschrieben nach Inhalt statt Wandnummer (`fotoBeschreibung`: „Foto mit Fenster ca. 1,1 x 1,2 m (Kinderzimmer)"; Nachfass-Hinweis „Dein letztes Foto"). `fotoFeedback` bleibt nur für Tests.
> - **Rückfragen** (nur Pflicht, MAX_RUNDEN je Fassung) enden mit `RUECKFRAGE_ZUSATZ` („kannst du später im Angebot ergänzen").
> - **Timeout-Job neu:** alle 2 Min; Eingabe ohne geplante Auswertung (Neustart) nach NACHHOL_MINUTEN (3) auswerten; offene Rückfrage
>   nach 15 Min erzwingen; per Knopf wieder geöffnet ohne neue Eingabe → nach 15 Min still schließen; Erinnerung „noch ein Raum?" entfällt.
> - **Raumüberschrift schon bei EINEM Raum:** `berechneAngebot` `nachRaum` ab 1 Raum, Editor `raumModus()` ab 1, Prompt-Regel
>   „RÄUME (auch bei nur EINEM Raum)". Editor: Vorschau wird nach Ablauf der Lösch-Reue-Frist aufgefrischt (Blocknummern rücken nach).
> - **Lead-Onboarding:** `ERKLAERUNG` nach „Kurz erklären" ausführlicher (3 Eingabewege, was danach passiert), dann Knopf „Angebot ausprobieren".
> - **Decke bei teilweise gestrichenen Wänden (ANG-2026-0018, Arbeitszimmer mit Paneelwand):** stehen in `Wände` nur die zu streichenden Längen (3 statt 4), ist der Raum kein Rechteck mehr und die Decke blieb unberechnet (drei DECKE-Positionen ohne Menge). Jetzt: Prompt schreibt das Grundmaß `Decke: 3,98 x 3,50`, `parseRaeumeText` rechnet daraus `deckeM2Genannt` (Test).
> - 254 Tests grün. ⏳ Dirks dritter Live-Test mit dem neuen Ablauf; danach Chat-Auswertung in zwei Stufen (Memory chat-auswertung-dsgvo,
>   VORHER Datenschutzerklärung/AVV anpassen).

> **Update 11.09.2026 — LIVE-TEST TEILETAPPE 3 + SAMMELMODUS ✅ DEPLOYT (Commits 46df7ca, 97ebd5a, d672716; 251 Tests):**
> - **Live-Test durch Dirk (12:53 bis 13:00):** zwei Kinderzimmer (Paneele 0,97 m / zweifarbig) + Dachzimmer diktiert, 8 Fotos ohne
>   Bildunterschrift. Technisch alles korrekt (Zuordnung, Paneelrückfrage, Kniestock/Schrägen/Restdecke, zweifarbig ohne Paneele,
>   0 Fehler). Befunde: Angebot kam nach Raum 1 (nächste Nachricht nach der Zusammenfassung galt als „ja"), Album-Hülle löste
>   „Format kann ich nicht lesen" aus, Bildrand-Frage bei 6/8 Fotos, Tür doppelt erkannt, Objektzeile mit Maßen zu dicht an der
>   Anrede, Positionen/Material nicht je Raum. Vorab entdeckt und gefixt: gleichnamige Räume (`findeRaum` exakt vor unscharf).
> - **SAMMELMODUS (`werteVorgangAus`, sobald Räume da sind):** Angebot erst auf *fertig* (`istFertigWunsch`), auf „ja" zur
>   Zusammenfassung (`istBestaetigung`) oder per Zeitablauf (`erzwungen`). Sonst nach jedem Schritt `raumBilanz()` (alle Räume,
>   Ergebnis ohne Eingangsmaße) + Aufforderung „nächster Raum oder *fertig*" (`floskel("weiterOderFertig")`, ohne Fotos
>   `FOTO_ANLEITUNG` einmal je Auftrag, danach `fotosOderWeiter`). Neuer Inhalt nach der Zusammenfassung = Fortsetzung
>   (`zusammenfassungGezeigt` zurück auf false). Rückfragen kommen weiter sofort (Rundenlimit im Sammelmodus MAX_RUNDEN+4).
>   Timeout-Job alle 2 Min: Erinnerung nach 5 Min Stille (`Vorgang.erinnertAm`, verlängert die Frist nicht), Abschluss nach
>   15 Min über `werteVorgangAus(erzwungen)` (vorher lief der Job am Aufmaß vorbei). Fotopause 90 → 45 s. Klassischer Modus
>   (Diktat ohne Räume) unverändert. Design-Grundsatz (Dirk): AuftragsBoss schweigt nie, jede Nachricht endet mit Stand + Frage.
> - **Fotos:** Album-Hülle (`type: "unsupported"`) still ignoriert. `bereinigeAnalyse` führt doppelt gemeldete Öffnungen zusammen.
>   Bildrand-Frage nur noch bei abzugsrelevanten Öffnungen (`nachfragewuerdigeRandoeffnungen`: ≥ 2,2 m² oder große Art ohne Maß).
>   **Ganze Wand muss NICHT ins Bild** (WhatsApp-Kamera hat kein Weitwinkel): Standard = ein Foto je Fenster/Tür, hochkant, Boden
>   und Decke drauf; Wände ohne Öffnung ohne Foto; ganze Wand fürs Protokoll erlaubt. Hinweis „Wand nicht ganz im Bild" entfällt,
>   nur fehlender Boden ist ein Hinweis. Landingpage entsprechend („Foto je Fenster oder Tür"), **IONOS-Upload durch Dirk offen**.
> - **Angebot:** Objekt als eigene Zeile, nur Raumnamen (Prompt), Abstand zur Anrede (Word + PDF). `berechneAngebot`: bei ≥ 2
>   Räumen Raumblöcke (Raumname als Überschrift, Material vor Arbeit je Raum, Zwischensumme je Raum, Rest „Klein- und
>   Hilfsmaterial"/„Weitere Leistungen"/„Allgemein" zuletzt; `kategorie: "RAUM:<name>"`). Prompt: Hauptmaterial je Raum mit
>   `raumBezug`, Kleinmaterial einmal ohne. `raumBezug` wird jetzt im Editor mitgeführt (dokumentDaten/editorSeite). Der Editor
>   selbst gruppiert weiter nach Kategorie → Positionsnummern können vom Kundendokument abweichen (Dirk weiß es; später ggf.
>   Editor nach Räumen). Wechselnde Eingangsbestätigungen: `src/whatsapp/floskeln.ts` (nie zweimal dieselbe je Nummer).
> - ✅ **Zweiter Live-Test (11.09. 15:13) bestanden:** Ablauf mit Raumbilanz + „fertig" funktioniert, Fotos aus der WhatsApp-Kamera.
>
> **Update 11.09.2026 nachm. — ANGEBOTSAUFBAU NACH RECHERCHE (Commit 7175f9e, deployt, 252 Tests):** Dirk ließ ChatGPT und Grok
> recherchieren (Prompt von mir); beide + ich einig: Räume als Hauptgruppen, Material im Einheitspreis, § 35a-Zeile. Umgesetzt:
> - **Raumblöcke ÜBERALL** (Editor, Vorschau, Word, PDF, E-Mail): ab zwei Räumen Raum = Hauptgruppe mit Nummer
>   („1  Kinderzimmer links", Positionen 1.1, 1.2 …, Zwischensumme je Raum), Rest als „Allgemeine Leistungen"/„Klein- und
>   Hilfsmaterial"/„Allgemein" zuletzt (`allgemeinName`). `BerechnetePosition.nummerText`, `Kategorieblock.nummer`,
>   `Angebotssumme.nachRaum`. Editor: `gruppen()/gruppenPositionen()`, Knopf „+ Position unter <Raum>" setzt `raumBezug`
>   automatisch, Art-Auswahl Arbeit/Material je Zeile (`.pos-art`, nur im Raummodus), Drag & Drop und ▲/▼ wechseln den Raum;
>   `raumBezug` im Speicher-Schema (`positionSchema`, Zod hatte es gestrichen → Gruppierung ging nach dem ersten Speichern verloren).
>   Ein Raum oder keiner: wie bisher Material/Arbeitsaufwand.
> - **Material im Preis (Standard):** `Handwerker.materialGetrennt` (false). Prompt (`materialRegel`): keine Materialvorschläge,
>   Leistungen „…, inkl. Material", statt Kleinmaterial EINE Leistung „Schutz- und Abdeckarbeiten" (vorschlag, ohne Raum);
>   diktiertes Material bleibt Position. Schalter an = alte Vorschlagslogik je Raum. Einstellungsseite Abschnitt „Angebotsaufbau".
> - **§ 35a EStG:** `Handwerker.zeige35a` (true), `lohnanteilProzent` (75). `lohnanteilFuer`: Material 0 %, Anfahrt/Abdecken/
>   Entsorgung/Gerüst/Reinigung/Montage 100 %, sonst Betriebswert. `Angebotssumme.arbeitskostenBrutto` (nur bei vollständigen
>   Preisen) → Zeile „Voraussichtlicher Arbeitskostenanteil nach § 35a EStG: X € brutto (maßgeblich ist die Schlussrechnung)"
>   nach dem Gesamtbetrag in Word/PDF/E-Mail/Editor/Vorschau. Werte laufen über `Preisliste.konditionen` (effektivePreisliste).
> - Landingpage-A4-Demo auf die neue Struktur umgestellt (Räume, inkl. Material, § 35a) → **IONOS-Upload durch Dirk offen**.
> - Vorschau-Server (`npm run dev:editor`) legt Demo `ANG-2026-DEMO2` mit zwei Räumen an. Im Browser geprüft: Gruppen, Nummern,
>   Hinzufügen je Raum, Speichern + Neuladen, Einstellungen speichern.
> - ⏳ Nächster Schritt: Dirks dritter Live-Test (erste KI-Probe für „inkl. Material" ohne Materialzeilen, Abdeckarbeiten,
>   Raumblöcke im Word).

> **Update 10.09.2026 — NACH-AUDIT + 6 PFLICHTPUNKTE ✅ DEPLOYT (Commits 7327025, Folgecommit deploy.sh; 220 Tests grün; Bericht https://claude.ai/code/artifact/11d0c0f7-c951-4322-9478-69d2c2ffa959):**
> - **NEUES DEPLOY-RITUAL (ersetzt alle älteren Blöcke!):** `bash scripts/deploy-lokal.sh` im Git-Bash. Packt (ohne dev.db*/.env),
>   prüft, lädt nach `/home/auftragsboss/eingang/`, ruft `su - auftragsboss -c '~/deploy.sh'` (Repo-Kopie `scripts/deploy.sh`).
>   Das Skript: Archivprüfung (DB/.env verboten, src/server.ts Pflicht) → DB-Sicherung `~/daten/vor-deploy.db` + integrity_check →
>   Rollback-Stand `~/rollback/app-<stamp>.tar.gz` (letzte 3) → Entpacken als auftragsboss (kein chown mehr) → `npm ci` nur bei
>   geändertem Lockfile → `prisma generate` → `db push` nur bei geändertem Schema (ohne Datenverlust-Flags) → pm2 restart →
>   `/health` 200 + `quick_check ok`, sonst AUTOMATISCHER ROLLBACK. Negativprobe mit vergiftetem Paket bestanden (Abbruch, App unberührt).
>   Nach einer Skriptänderung: `scp scripts/deploy.sh → /root/neu-skripte/`, dann `sed -i 's/$//'` + `install -m 700 -o auftragsboss`.
> - **Datenverzeichnis (S-01):** Datenbank liegt in `/home/auftragsboss/daten/dev.db` (`DATABASE_URL="file:/home/auftragsboss/daten/dev.db?connection_limit=1"`),
>   Fotos/Logos in `/home/auftragsboss/daten/uploads` (`UPLOADS_DIR`, Code: `src/betrieb/ablage.ts`, DB-Pfade bleiben `uploads/…`).
>   Der App-Ordner enthält KEINE Kundendaten mehr; ein Deploy-Paket kann sie strukturell nicht treffen. backup.sh, wachhund.sh,
>   Runbook auf `daten/` umgestellt (Backup prüft die Kopie per integrity_check). Server-Skripte in /root sind Kopien von `scripts/`.
> - **/health mit Datenbankprobe (S-02):** SELECT 1 je Aufruf + gecachter quick_check (10 Min); 503 bei Fehler → UptimeRobot und
>   Wachhund-Check 1 sind jetzt datenbanksensitiv. Antwort: `{"status":"ok","service":…,"db":"ok"}`.
> - **Foto-Löschung (F-01):** `POST /api/a/:token/loeschen` entfernt Foto-Zeilen UND Dateien (auch Vorgangs-Fotos), `loescheFotoDatei`.
> - **Aufmaß (E-01/E-02/E-03/E-13):** Parser verdichtet Whitespace + kappt (20.000/3.000/500 Zeichen), Regex verankert (5.000 Leerzeichen
>   < 200 ms); unplausible/zu große Öffnungen werden in Erklärtext, Rückfragen und WhatsApp-Zusammenfassung AUSGEWIESEN (`verworfen`);
>   Zusammenfassung zeigt Eingangsmaße je Raum; Warnungen (`warnungen`) bei Wand > 15 m, Höhe > 4 m, Fläche > 150 m².
> - **Authz-Suite (D-01):** Zufalls-DB-Name im Ordner prisma/ (vorher PID-Kollision → still übersprungen), eigene Upload-Ablage je Lauf;
>   neue Tests: Foto-Route (Schleuse, Mandantentrennung) und Löschkaskade mit Dateien.
> - **30-TAGE-PUNKTE ✅ UMGESETZT + DEPLOYT (10.09. abends, Commits f56608c + 2d5b817; 239 Tests grün):**
>   - **Boot-Gate (D-04/D-05):** `config.ts` wirft `KonfigFehler` statt `process.exit`; `pruefeStartKonfiguration()` in server.ts
>     prüft VOR dem Start Server/OpenAI/Anthropic/WhatsApp/Feature/Direkttest/Webtest + `WHATSAPP_APP_SECRET` und `SESSION_SECRET`
>     (je ≥ 16 Zeichen) + DATABASE_URL; fehlt etwas, startet der Server nicht (Liste im Log). `env-check.ts` leitet die gültigen
>     Schlüssel per `bekannteSchluessel()` aus den Schemata ab — neue .env-Werte NUR in config.ts (Schema) oder
>     `DIREKT_GELESENE_SCHLUESSEL` eintragen. `.env.example`: beide Geheimnisse sind Pflicht.
>   - **Medien (F-03/F-04/F-10):** `whatsapp/media.ts` kappt Downloads (Bild 5 MB, Audio 16 MB; Content-Length + Strom, `MediumZuGross`
>     → freundlicher WhatsApp-Hinweis). `betrieb/bildpruefung.ts`: Bildtyp NUR aus Magic Bytes (JPEG/PNG/WebP/GIF), geprüft vor
>     Vision und Ablage; `speichereFoto` liefert `{datei, mimeType}` (Endung/Typ aus den Bytes). Keine Foto-Zeile ohne gespeicherte
>     Datei. Global `X-Content-Type-Options: nosniff` (onSend-Hook), Belegfoto-Route zusätzlich `Content-Disposition: inline`.
>   - **Fotowaisen-Job (F-02):** `jobs/fotoWaisen.ts` täglich 04:10: Zeilen ohne Datei, Fotos gelöschter Angebote, Fotos ohne Angebot
>     nach 30 Tagen (`WAISEN_AUFBEWAHRUNG_TAGE`), Dateien ohne Zeile nach 24 h Karenz, leere Ordner. Sofort: `npx tsx src/fotowaisen-jetzt.ts`.
>     Die 5 Test-Waisen vom 06.09. sind damit weg.
>   - **Import-Limits (D-06):** `maler/import/zipPruefung.ts` liest das Zip-Inhaltsverzeichnis VOR mammoth (≤ 50 MB entpackt,
>     ≤ 2.000 Einträge, kein Zip64); PDF ≤ 40 Seiten; Text ≤ 60.000 Zeichen (`kappeText`, markiert prüfbedürftig);
>     Tagesdeckel 40 Importe je Betrieb (`IMPORT_MAX_PRO_TAG`, 429).
>   - **Logs (S-10):** Telefonnummer im Pipeline-Fehlerlog maskiert (`whatsapp/maskierung.ts`, `4917******23`); pm2-logrotate retain 7 + compress.
>   - **Pakete (D-02/D-12):** nodemailer 9.1.1, js-yaml 4.3.2, vitest 4.1.11, fastify 5.12.3, @fastify/multipart, mammoth, unpdf, @types/node 24.
>   - **Server (S-04/S-05/S-12):** Bucket-Versionierung EIN (`rclone backend versioning offsite:auftragsboss-backup` → Enabled);
>     Restore-Probe monatlich (Cron `45 4 1 * *`, Log `/root/restore-probe.log`, prüft jetzt auch die Offsite-DB per integrity_check,
>     Heartbeat aus `/root/restore-probe-heartbeat-url.txt`), Probe 10.09. bestanden; Wachhund pingt am Ende jedes Laufs
>     `/root/wachhund-heartbeat-url.txt` (bei Befund `/fail`); /root aufgeräumt: Vorfallsreste als
>     `/root/vorfall-20260907_loeschen-ab-20261007.tar.gz.enc` (Backup-Passphrase), Klartext + rollback-src-vor-audit + alte tar.gz gelöscht.
>   - **⏳ BEI DIRK:** zwei healthchecks.io-Checks anlegen („AuftragsBoss Herzschlag" 1 h/30 Min, „AuftragsBoss Restore-Probe" 31 Tage/2 Tage)
>     und die Ping-URLs in die beiden Dateien unter /root schreiben (lassen); Reboot/Patch-Tag (S-06); Vorfallsarchiv am 07.10. löschen.

> **⚠️ VORFALL 07.09.2026 — LIVE-DATENBANK DURCH DEPLOY KORRUMPIERT (behoben, kein Kundendatenverlust):**
> - **Was passiert ist:** Das Deploy-Paket schloss nur `prisma/*.db` aus, NICHT `dev.db-wal`/`dev.db-shm`. Lokal lagen beide
>   (vom Seed-Skript/Tests), also wanderten sie mit JEDEM Deploy am 06.09. nachmittags auf den Server und überschrieben die
>   Write-Ahead-Log-Dateien der Live-DB (md5 identisch). Folge: „database disk image is malformed" bei jedem Zugriff ab ~14:50,
>   /health blieb grün (fasst die DB nicht an). Entdeckt erst um 05:20 durch den Wachhund (Backup fehlte, sqlite3 .backup scheiterte)
>   + healthchecks.io „DOWN".
> - **Behebung:** App gestoppt, fremde -wal/-shm nach `/root/db-korrupt-20260907/` verschoben, Hauptdatei `integrity_check ok`
>   (Stand 06.09. 13:23 lokal), WAL-Modus neu gesetzt, App gestartet, Prisma-Probe ok, Backup nachgeholt (Heartbeat gemeldet).
>   **Verloren:** nur Dirks Testdaten ab 13:23 (ANG-2026-0015 mit 4 Fassungen, 6 Foto-Zeilen, Events). Keine fremde Nachricht im Fenster.
> - **REGEL AB SOFORT:** Packen mit `--exclude='prisma/dev.db*'` UND entpacken mit `tar xzf … --exclude='prisma/dev.db*'`
>   (doppelter Schutz). `.gitignore` kennt jetzt auch `*.db-wal`/`*.db-shm`. Vor JEDEM Deploy: `tar -tzf deploy.tar.gz | grep dev.db`
>   muss leer sein. Wachhund prüft zusätzlich stündlich `PRAGMA quick_check` der Live-DB (hätte den Schaden nach 30 Min gemeldet).

> **Update 06.09.2026 (3) — TEILETAPPE 3 ✅ GEBAUT + DEPLOYT (Commit e3ca128; 213 Tests grün; KI-Probe `scratch/paneel-probe.ts` bestanden; ⏳ Live-Test durch Dirk offen):**
> - **Halbhohe Flächen:** Raumzeile kennt `Paneel: 1,10` (Oberkante Lambris/Paneele/Fliesenspiegel). Rechner:
>   brutto = Umfang × (H − Paneelhöhe); Türen/Durchgänge zählen nur mit ihrem Teil über den Paneelen, Fenster voll
>   (höchstens Zonenhöhe); VOB-Klasse auf dem wirksamen Anteil. Prompt: Paneelhöhe fehlt = PFLICHT-Rückfrage, Schätzung
>   aus FOTO-Zeile („Lambris bis ca. 1,10 m", neue Vision-Regel) darf vorläufig rein + normale Rückfrage. Nie selbst schätzen.
> - **Laibungen:** nur bei genannter Tiefe (`Laibung: 0,25`, cm werden erkannt) und nur bei ABGEZOGENEN Öffnungen:
>   Fenster (2h + b) × t, bodenstehende (2h) × t, fließen in netto ein. Ohne Tiefe: Hinweis im Aufmaßtext + Rückfrage
>   in `rueckfragen` (nicht per WhatsApp).
> - **Decke bei Vielecken:** `Decke: 14,2` = direkt genannte Fläche („wie genannt" im Text).
> - **Aufmaßblatt (`src/angebot/aufmassblatt.ts`):** Word bekommt „Anlage: Aufmaß" auf neuer Seite: VOB-Hinweis,
>   Notizen je Raum (Raumkopf fett), Belegfotos in zwei Spalten mit Unterschrift aus `erkennungJson`. Geladen über
>   `ladeAufmassAnlage(prisma, dokument)` in Pipeline, Export-Route und Mail-Export. WebP-Fotos fallen im Word weg.
>   PDF (Kundenweg) bleibt ohne Anlage. Probe: `scratch/aufmassblatt-probe.ts <ziel.docx>` (Messbank-Fotos, ohne KI/DB).
> - **Editor:** Karte „Aufmaß" (nur Ansicht) mit Notizen + Foto-Raster; Fotos über `/api/a/:token/foto/:fotoId`
>   (Schleuse + Foto muss zum Dokument gehören). Lokale Vorschau: `scratch/editor-fotos-seed.ts` hängt zwei Fotos ans Demo-Dokument.
> - **Wandzähler je Raum** (`prisma.foto.count` je Vorgang+Raum) statt je Vorgang.
> - **Lehre:** Regex-Literale nie per Heredoc-Skript in TS einfügen (`\r?\n` wurde zu echten Zeilenumbrüchen); PDF-Sichtprüfung
>   ohne poppler: Word-COM → PDF, dann `Windows.Data.Pdf` in PowerShell rendert Seiten als PNG.
> - **⏳ NÄCHSTES:** Live-Test (Raum mit Paneelen diktieren + Fotos, Word öffnen: Anlage prüfen). Danach Endkunden-Variante
>   (WhatsApp-Link) laut Gedächtnis, nicht MVP.

> **Update 06.09.2026 (2) — WANDFOTOS TEILETAPPE 2 ✅ DEPLOYT + LIVE-BESTÄTIGT (Commits 9ca7910…15b02d8; 208 Tests grün; Prüfstand 3 Läufe; Live-Test Raum 5 komplett: 4 Fotos, Fenstertür 3,91 m² abgezogen, ❓-Randtür per Text geklärt, Fassung 4 = 38,42 m²):**
> - **Ablauf live:** Maler spricht Maße (Teiletappe 1) und schickt ein Foto je Wand. Jedes Foto → EIN Vision-Aufruf
>   (`src/ai/wandfoto.ts`, eigenes kleines Structured-Output-Schema `WandfotoSchema`, Modell claude-fable-5):
>   Wandfoto oder Notizzettel (`istWandfoto`/`notizText`), Öffnungen mit Schätzmaß (Raumhöhe als Maßstab),
>   `inNachbarwand` (wird gefiltert), offen/zu, `wandKomplett`, `hellGenug`, Besonderheiten. **Sofortantwort** per
>   WhatsApp (`fotoFeedback`: ✅ mit VOB-Einordnung je Öffnung / ⚠️ Tür offen, zu dunkel / ℹ️ Wand nicht ganz im Bild).
>   Erkennung wird als Dialogzeile `FOTO Wand N (Raum: …): Öffnungen: …` an den Vorgang gehängt (`art: "foto"`); die
>   Auswertungs-KI ordnet die Öffnungen der Raumzeile zu (Prompt-Regel „Wandfotos": diktierte Maße gewinnen, Dubletten
>   nur einmal). **Verzögerte Auswertung:** 90 s nach dem letzten Foto (`planeFotoAuswertung`, Timer je Nummer, jede
>   neue Nachricht bricht ab) läuft `werteVorgangAus` (Schritte 4–6 der Pipeline, jetzt eigene Funktion); nur Fotos
>   ohne Maße → einmalige Erinnerung „sprich mir Raum und Maße ein".
> - **Zuordnung** (`src/maler/fotoZuordnung.ts`, rein, 4 Tests): Bildunterschrift (bekannter Raumname, „Wand N") sonst
>   zuletzt genannter Raum aus `Vorgang.raeumeText` (neue Spalte, wird bei jeder KI-Auswertung gesetzt). Webhook reicht
>   die Caption jetzt als `bildText` durch. Wandnummer = Zähler je Vorgang oder „Wand N" aus der Unterschrift.
> - **Ablage:** neues Prisma-Modell **`Foto`** (handwerkerId, vorgangId, dokumentId nach Angebotserstellung, raum,
>   wandNr, datei, mimeType, groesse, erkennungJson) + Datei unter `uploads/fotos/<Betrieb>/<Vorgang>/wandN_<zeit>.jpg`
>   (`src/betrieb/fotoAblage.ts`, max 12 MB; im Nacht-Backup enthalten). DSGVO-Kaskade in betreiberRoutes löscht
>   Zeilen + Betriebsordner. Kosten je Foto als `KI_AUFRUF` dienst `wandfoto` (~1 ct) im Cockpit.
> - **Prüfstand** `Messbank/auswertung/pruefstand-vision.ts` (42 WhatsApp-Fotos gegen Laser-Wahrheit, schreibt
>   `PRUEFSTAND-VISION.md`): Lauf 1: 37/39 gefunden, VOB 97,3 %, 9 erfunden → Nachbarwand-Feld + Haustür-Regel →
>   Lauf 2: 36/39, VOB 97,2 %, 4 erfunden → Spiegel- und Bildrand-Regel → Lauf 3: 36/39, VOB 97,2 %, **3 erfunden**
>   (Randfälle wechseln lauf-zu-lauf: angeschnittene Nachbarwand-Türen, Standspiegel als „Durchgang"). Flächenfehler
>   Median ~14 % (für VOB-Klasse unerheblich, Grauzone 2,2–2,8 m² fragt nach). Verpasst: Tür hinter offenem Türblatt
>   (R08 W1), drittes Element außerhalb des Bildes (R03 W3). Ziel VOB ≥ 95 % erfüllt; „0 erfunden" nicht ganz, aber jede
>   Erkennung steht im Sofort-Feedback und ist per Wort korrigierbar. ~40 Cent je Vollauf.
> - **Live-Test (Dirk):** Sprachnachricht mit Maßen → Zusammenfassung → 4 Fotos schicken (je Wand, Tür zu) → je Foto
>   ✅/⚠️-Antwort → nach 90 s Ruhe „📐 Ich rechne …" → Angebot mit Öffnungen aus den Fotos im Aufmaßtext. Im Log:
>   `WANDFOTO`-Events, `uploads/fotos/` füllt sich, Tabelle `Foto`.
> - **Nachbesserungen aus dem Live-Test (deployt):** als Datei gesendete Bilder = Foto, unlesbare Typen bekommen Hinweis,
>   Nachrichtentyp PII-frei geloggt (`WhatsApp-Nachricht`); Randöffnungen (`inNachbarwand`) werden als „❓ Am Bildrand
>   noch: …"-Nachfrage gemeldet statt still gefiltert (KI übernimmt sie nur nach Bestätigung); Nachtrag-Vorgang wird vor
>   der Raumzuordnung geöffnet. Zwei von vier Fotos kamen beim ersten Versuch nie an (Ursache unklar, jetzt sichtbar im Log).
> - **⏳ NÄCHSTES: Teiletappe 3:** halbhohe Flächen (Lambris/Fliesenspiegel: Paneelhöhe diktieren oder schätzen,
>   Aufmaß = Umfang × (H − Paneelhöhe) minus Öffnungsanteile darüber; im Test hieß die Position „oberhalb der Paneele",
>   Menge war aber die volle Wand), Aufmaßblatt im Word mit Belegfotos, Decke, Laibungen; Feinschliff (Foto-Zähler je Raum).

> **Update 06.09.2026 — VIDEO-TEST (NO-GO) + AUFMASSRECHNER TEILETAPPE 1 ✅ DEPLOYT (Commits 615b0c5 + Folgecommit „Raummaße als flache Textzeile"; 199 Tests grün; echte KI-Probe bestanden; ⏳ Live-Test per Sprachnachricht durch Dirk offen):**
> - **Messbank-Ergebnis (04.09., Commit ae608a9):** 42 Wände annotiert und gemessen → Ein-Foto-Verfahren NO-GO
>   (Median 6,4 %, P90 17 %), Ursache Sichtbarkeit (Möbel vor Ecken/Boden, Wände > 5,5 m, unebene Wände);
>   VOB-Klassifikation aber 96 % → Fotos taugen für Öffnungen/VOB, nicht für Wandmaße. `Messbank/auswertung/`.
> - **Video-Test (06.09.):** 5 Rundum-Videos (`Messbank/Videos/`, gitignored). WhatsApp drückt Video auf 478×850;
>   Hochformat-Sichtfeld ≈ 44° (keine Wand komplett im Frame); alle Videos Schwenks vom Stand (keine Parallaxe);
>   Wände merkmalsarm. Fazit `VIDEO-ERKENNTNISSE.md`: Video über WhatsApp ist ein Rückschritt. Idee abgehakt.
> - **PRODUKTENTSCHEIDUNG (Dirk):** Maler-MVP = „Miss wie immer, sprich die Maße, schick ein Foto pro Wand, den
>   Rest mache ich." Etappenplan `Konzepte/Etappe-Aufmass-und-Wandfotos.md` (3 Teiletappen, freigegeben).
>   Endkunden-Variante (WhatsApp-Link + geführte Foto-Website) = später, nicht MVP.
> - **TEILETAPPE 1 GEBAUT + DEPLOYT:** `src/maler/aufmass.ts` (reines Modul, 15 Tests): je Raum Höhe +
>   Wandlängen (2 Zahlen = Rechteck, sonst Summe) → Brutto, VOB-Abzug (Öffnungen > 2,5 m² abziehen, ≤ 2,5
>   übermessen), Netto, Decke (nur Rechteck), Erklärtext; Grauzone 2,2–2,8 m² → Rückfrage-Text.
>   Positionsfelder im KI-Schema: `flaechenArt` (WAND|DECKE) + `raumBezug`; `mengeQuelle` (AUFMASS) setzt nur das
>   Programm (App-Typ). Pipeline Schritt 4b nach `strukturiereDialog`: `wendeAufmassAn` (Menge/m2/mengeQuelle),
>   Aufmaßtext vorn in `aufmassNotizen`, Grauzonen-Rückfragen in `rueckfragen`. Zusammenfassung zeigt „*Flächen
>   (VOB-gerecht gerechnet):*", E-Mail-Zeile grün „Fläche VOB-gerecht aus deinen Raummaßen berechnet".
>   Kein Prisma-Schema-Change (kein db push nötig).
> - **⚠️ WICHTIGE LEHRE (kostete einen Rollback):** Das Structured-Output-Schema (`DokumentSchema`) ist an der
>   Größengrenze der Anthropic-Grammatik. Ein neues verschachteltes Objekt-Array (`raeume`) → 400 „compiled grammar
>   is too large" bei JEDER Sprachnachricht (war ~10 Min live, per `git archive` des Vorgängercommits zurückgerollt).
>   Einfache Felder (String/Enum/Boolean) passen noch. Deshalb liefert die KI die Räume als **`raeumeText`**, EINE
>   Zeile je Raum im festen Format (`Raum: …; Höhe: …; Wände: a x b; Decke: ja; Öffnungen: Fenster 1,10 x 1,20, …`),
>   geparst durch `parseRaeumeText()` (deterministisch, Unbrauchbares wird verworfen). **Künftige Schema-Erweiterungen:
>   nur flache Felder oder zweiter KI-Aufruf mit eigenem kleinen Schema; vor dem Deploy immer die echte KI-Probe
>   `scratch/aufmass-probe.ts` (bzw. ein Äquivalent) laufen lassen.**
> - **⏳ NÄCHSTE SCHRITTE:** Dirk testet per Sprachnachricht („Wohnzimmer, Höhe 2,52, 4,49 mal 4,36, Wände und
>   Decke streichen, Fenstertür 1,70 mal 2,20 …"). Dann Teiletappe 2: Foto-Weiche (Wandfoto vs. Notizzettel),
>   Vision-Analyse je Foto (Öffnungen, offen/zu, Wand komplett, Helligkeit), Sofort-Feedback als Text, Foto-Ablage
>   (neues Prisma-Modell `Foto` + `uploads/fotos/`), Messbank als Prüfstand. Teiletappe 3: Aufmaßblatt im Word.

> **Update 04.09.2026 — 📷 MESSBANK KOMPLETT (Commit 2d61285) — bereit fürs Auswertungsskript (Go/No-Go Foto-Aufmaß):**
> - Dirk hat 11 Räume erfasst: **42 Wand-Fotos** (Original in `Messbank/RaumXX/original/` +
>   **WhatsApp-Fassungen** in `RaumXX/whatsapp/`, wandweise benannt `wandN_<zeit>...`), Laser-Wahrheit in den
>   drei CSVs: **42 Wände** (waende), **39 Öffnungen** (oeffnungen, aus Dirks handschriftlichem Formular-PDF
>   übertragen), **11 Räume** mit Höhe/Farbe/Raumart (raeume). Fotos NICHT in Git (.gitignore), Quelle:
>   Dropbox/ABO (Originale) + `Messbank/Raumfotos Whatsapp/`.
> - **Zuordnungs-Kniffe (für Nachvollzug):** Handschrift-Notizzettel = Foto 20260904_182431 (Spaltenprinzip
>   Höhe über Strich, Wandbreiten darunter; Dirks Korrekturen: R5W2=398, R7 Höhe 255/W3=397/W4=219).
>   WhatsApp-Dateien kamen in 4 Batches ({1-12},{13-24},{25-36},{37-42}); die unnummerierte Datei je Batch
>   ist ein VERSETZTER Startpunkt, (k) zählt ZYKLISCH ab Basis weiter — Modell mit 12 Bildproben verifiziert.
> - **Highlight fürs Malerszenario:** Raum 3 (Wohnzimmer) ist real IN RENOVIERUNG (Spachtelstellen,
>   Farbmuster) — perfekter Testfall. Raum 3 Wand 3 = 10,49 m (Langwand!), R7/R8 haben kleine Wände ≤1,64 m.
> - **⏳ NÄCHSTER SCHRITT:** Auswertungsskript bauen (Foto-Aufmaß vs. Laser-Wahrheit, VOB-Übermessen-Regel
>   ≤2,5 m², Rückfall-Leiter) → Go/No-Go nach Konzept `Konzepte/Foto-Aufmass_Analyse.md` Abschnitt 9.

> **Update 03.09.2026 (4) — HARDENING-TEIL 1: AUTHZ-TESTSUITE + SQLITE-WAL ✅ (Commit 2dff5c6; 184 Tests grün):**
> - **NEU `src/web/authz.test.ts` (Maßnahme 17):** 14 Routen-Tests per `app.inject` gegen eine ECHTE
>   Wegwerf-SQLite (Dateiname je Prozess eindeutig wegen Windows-Sperren; `db push` auf frische Datei —
>   bewusst OHNE --force-reset, Prismas KI-Consent-Sperre umgangen durch Vorher-Löschen). Deckt ab:
>   Schleuse an ALLEN Editor-Wegen (inkl. der zwei Ex-K01-Mailrouten), **Mandantentrennung**
>   (Cookie von Betrieb A öffnet kein Dokument von B), /stasi-Login (falsch/richtig), /admin-Weg tot,
>   Webtest-Konto-Abschottung, Webhook fail-closed + Signaturprüfung, Zod-Validierung (400),
>   versendet-Schreibschutz (409), Test-Konten-Sonderregeln. Entfernt künftig jemand eine Prüfzeile,
>   wird `npm test` rot. Muster: Umgebung VOR den Importen setzen, App-Module nur dynamisch importieren.
> - **SQLite-WAL + connection_limit=1 (Maßnahme 18a):** `PRAGMA journal_mode=WAL` auf Server- UND
>   lokaler DB (persistent); `DATABASE_URL=file:./dev.db?connection_limit=1` in Server- und Dropbox-.env —
>   Prisma serialisiert damit seine Schreibzugriffe (kein SQLITE_BUSY-Nachrichtenverlust mehr).
> - **⏳ Verbleibendes Hardening (18b–20, niedrige Priorität):** prisma migrate statt db push;
>   Import-Limits (Zip-Bomben/Text-Kappung) + Export-Dateinamen + config-Boot-Gate; IONOS-Bucket-
>   Objektversionierung; SPF/DKIM/DMARC-Check; Schleuse Stufe B (WhatsApp-OTP). Plus Routine:
>   monatliche Wartungsrunde (npm audit/outdated), vierteljährlich /root/restore-probe.sh.

> **Update 03.09.2026 (3) — 30-TAGE-PAKET (Audit-Maßnahmen 8–16) ✅ DEPLOYT + SERVER-BETRIEB GEHÄRTET
> (Commits 97139cd + 56793e8; 170 Tests grün; alles live verifiziert):**
> - **Rate-Limiting LIVE** (@fastify/rate-limit): global 300/Min je Client-IP (außer /health + Webhooks),
>   enge Zusatzlimits an 14 Routen (Login 10/15min, Mail 5–10/h, KI-Webtest 10/h, /api/plz 30/min …).
>   Live getestet: /api/plz liefert exakt ab Anfrage 31 den Status 429. Deutsche Fehlermeldung.
> - **Alter /admin/<ADMIN_TOKEN>-Weg ABGESCHALTET** (live 404). ADMIN_TOKEN in der Server-.env ist
>   wirkungslos → kann bei Gelegenheit entfernt werden. Cockpit/Auswertung NUR noch via /stasi-Login.
> - **Races gefixt:** Angebotsnummern jetzt max+1 statt count+1 (keine Doppelnummern nach Löschen; auch im
>   Webtest); Freimonat-Einlösung atomar (kein Minus per Doppelklick); Timeout-Job läuft in der seriellen
>   Warteschlange je Nummer (`inReiheProNummer`) mit Frisch-Prüfung (kein Doppel-Angebot mehr).
> - **Stripe-Idempotenz hart:** neues Unique-Feld `Buchung.stripeInvoiceId` (Spalte per
>   `stripe-invoice-spalte.sql` angelegt — bewusst OHNE --accept-data-loss, der Guard-Hook blockt das Flag;
>   danach ist `db push` in sync). notiz-contains nur noch Altbestands-Fallback mit typ=ZAHLUNG.
> - **Webtest-Sammelkonto abgeschottet** (kein /start-, Einstellungs-, Registrier-Zugang; „Als Kunde
>   ansehen" erzeugt dafür keinen Token).
> - **SERVER-BETRIEB:** prisma/ 750 + dev.db 640; **2-GB-Swap** aktiv (+fstab); **pm2-logrotate**
>   (10 MB/14 Tage/komprimiert); **Backup v2** sichert jetzt auch `.env` + Caddyfile + SSH-Härtung +
>   Crontab + ufw-Stand (Archiv 600, /root/backups 700) und pingt optional `/root/heartbeat-url.txt`;
>   **Wachhund-Cron** (stündlich :20): prüft /health, Platte ≥90 %, Backup <26 h → Alarm-Mail an
>   ADMIN_EMAIL über App-SMTP (max. 1/Problem/12 h; Testmail 03.09. angekommen? bei Dirk prüfen);
>   **Restore-Probe ✅ BESTANDEN** (lokal: Integrität ok, 5 Betriebe/30 Dokumente; offsite: heruntergeladen
>   + entschlüsselt). **NEU `scripts/RESTORE-RUNBOOK.md`** (RPO 24 h / RTO 4 h, Fälle A/B/C) —
>   Repo-`scripts/backup.sh` ist wieder identisch mit dem Server-Stand.
> - **✅ DIRK-PUNKTE ALLE ERLEDIGT (03.09. mittags):** (1) UptimeRobot-Monitor auf
>   https://api.auftragsboss.de/health aktiv (Alarm an d.beer@deutsche-automotive.de). (2) healthchecks.io-
>   Check „AuftragsBoss Backup" (1 Tag/3 h Kulanz) grün, Ping-URL in /root/heartbeat-url.txt, Test-Ping ok.
>   (3) **2FA überall aktiviert** (IONOS, Meta — inkl. Passkey, Stripe, Dropbox, Google, 1Password;
>   Facebook-Login läuft über tooltide.ai@gmail.com — auch gesichert). (4) Alte /admin/-Lesezeichen
>   gelöscht. (5) `.env.bak` auf dem Server gelöscht + ADMIN_TOKEN-Zeile aus der Server-.env entfernt
>   (App-Neustart, Health 200).
> - **Danach offen (Hardening 17–20):** Authz-Testsuite, SQLite WAL/busy_timeout + prisma migrate,
>   Import-Limits, Offsite-Versionierung, Schleuse Stufe B (WhatsApp-OTP).

> **Update 03.09.2026 (2) — SICHERHEITS-AUDIT + ZWINGEND-MASSNAHMEN 1–7 ✅ DEPLOYT (Commits 6438f87 + f237626; 170 Tests grün; live verifiziert):**
> - **Vollständiger Read-only-Audit** (6 parallele Prüf-Agenten + Server-Prüfung): Bericht als Artefakt
>   https://claude.ai/code/artifact/04c0b2c0-a2c9-4c3f-bbce-44a9a893dff5 + PDF im Repo-Root. Gesamt-Reife
>   52/100; 3 kritische Funde — alle noch am selben Tag behoben:
> - **Block A (Commit 6438f87):** (K01) `mail-einstellung` + `mail.:format` prüfen jetzt `darfZugreifen`
>   (401 ohne vertrautes Gerät; mail-einstellung zusätzlich istTest→403) — DB-Check ergab: Lücke wurde NIE
>   ausgenutzt (einzige hinterlegte E-Mail = Dirks eigene). (K02) adminSeite escaped menge/einzelpreis/
>   beschreibung typrobust (kein Stored-XSS/Crash über die Lern-Auswertung mehr). (H01) NEU
>   `web/jsonInsSkript.ts` — alle 12 `${JSON.stringify(…)}`-Einbettungen in Script-Blöcken umgestellt
>   (</script>-Breakout unmöglich).
> - **Block B (Commit f237626):** (K03) NEU `web/eingabeSchemata.ts` — Zod-Laufzeitvalidierung für
>   Editor-Speichern/Einstellungen/Registrierung/Feedback/Empfehlung (Mengen positiv+endlich, Preise
>   begrenzt — Nachlass erlaubt, Texte mit Obergrenzen, E-Mail = genau EINE Adresse). (H04) WhatsApp-
>   Webhook FAIL-CLOSED ohne APP_SECRET + Dedup per msg.id (RAM, 5000). (H02) `trustProxy: "127.0.0.1"` —
>   `req.ip` = echte Client-IP, Webtest-Limits nicht mehr per Header fälschbar. (H05) Logger maskiert
>   Token-URLs als `/[token]` (live verifiziert). (H09) `npm audit fix` + **fastify 5.12.1** — alle 7
>   Server-Schwachstellen zu; übrig nur deepmerge-ts im Prisma-CLI (kein Serverpfad, Fix wäre Downgrade).
> - **(M01) Caddy-Security-Header LIVE** (Caddyfile neu, Backup `Caddyfile.bak-20260903`): HSTS 180 Tage,
>   nosniff, `Referrer-Policy: no-referrer` (Tokens leaken nicht mehr per Referer!), X-Frame-Options DENY,
>   CSP (self + unsafe-inline, connect-src self → eingeschleustes Skript kann nicht exfiltrieren).
>   /testen + /stasi unter CSP fehlerfrei (Konsole leer). Reload via `caddy reload` (ohne systemctl).
> - **⚠️ NEUE STOLPERFALLE:** Lokale Prisma-CLI-Befehle (`db push`, `db execute`, `studio`) finden die
>   DATABASE_URL nicht mehr (lokale .env liegt jetzt in der Dropbox; Prisma-CLI liest nur ./.env) →
>   vorher `$env:DATABASE_URL="file:./dev.db"` setzen. Server unverändert (dort liegt die .env im App-Ordner).
> - **Rollback-Kopie** des alten Server-Codes: `/root/rollback-src-vor-audit` (nach ein paar Tagen löschen).
> - **⏳ OFFEN aus dem Audit (30-Tage-Paket, Maßnahmen 8–16):** Rate-Limiting, Monitoring/Uptime-Alarm,
>   .env ins Backup + Restore-Probe, `/admin/:token` abschalten, 2FA-Check aller Dienst-Konten,
>   Webtest-Konto vom /start-Listing trennen, Freimonat-Race, Stripe-Idempotenz-Feld, Dateirechte/Swap/
>   pm2-Logrotation. Danach Hardening (17–20). Details im Bericht.

> **Update 03.09.2026 — APP LÄUFT NICHT MEHR ALS ROOT ✅ (Umbau von Claude per SSH-Schlüssel ausgeführt,
> Reboot-Feuerprobe bestanden; ✅ End-to-End bestätigt: Dirks Sprachnachricht → Angebot lief unter dem
> neuen Konto fehlerfrei durch):**
> - **Neues Konto `auftragsboss`** (ohne Passwort, kein SSH-Zugang — nur root kann per `su - auftragsboss`
>   hinein). **App liegt jetzt in `/home/auftragsboss/app`** (vorher /root/app), alles chown auftragsboss;
>   `.env` und alte `.env.bak` auf chmod 600. Ein Einbruch über die App erbeutet damit nur noch dieses
>   Konto, nicht mehr den ganzen Server.
> - **pm2 läuft je Benutzer:** eigener Daemon unter auftragsboss (`su - auftragsboss -c 'pm2 …'`),
>   Autostart via `pm2-auftragsboss.service` (enabled, Reboot-getestet); alter `pm2-root` disabled,
>   root-Eintrag gelöscht, root-Daemon gekillt. Backup-Skript `/root/backup-auftragsboss.sh` auf
>   `APP=/home/auftragsboss/app` umgestellt + Testlauf ok (Cron + /root/backups + Offsite unverändert
>   als root — root darf die Nutzer-Dateien lesen).
> - **⚠️ NEUES DEPLOY-RITUAL (ersetzt die /root/app-Befehle in älteren Blöcken!):** tar packen wie gehabt,
>   `scp … root@87.106.165.151:/root/`, dann:
>   `ssh root@87.106.165.151 "tar xzf /root/deploy.tar.gz --exclude='prisma/dev.db*' -C /home/auftragsboss/app && chown -R auftragsboss:auftragsboss /home/auftragsboss/app && su - auftragsboss -c 'pm2 restart auftragsboss'"`
>   **Packen IMMER mit `--exclude='prisma/dev.db*'`** (nicht `*.db`: -wal/-shm müssen mit raus, siehe Vorfall 07.09.).
>   Bei npm install/db push: `su - auftragsboss -c 'cd ~/app && npm install && npx prisma db push && pm2 restart auftragsboss'`.
>   Das `chown` nach dem Entpacken ist PFLICHT (tar als root erzeugt root-Dateien). Server-`.env` liegt
>   jetzt unter `/home/auftragsboss/app/.env`; `pm2 logs/status` immer über `su - auftragsboss -c '…'`.
>   Server-SQL: `su - auftragsboss -c 'cd ~/app && npx prisma db execute --file … --schema prisma/schema.prisma'`.
> - Claude kann Server-Wartung jetzt selbst per SSH-Schlüssel ausführen (Heimrechner-Schlüssel seit Phase B);
>   Dirks Guard-Hook blockiert dabei bewusst `systemctl`-Befehle → die tippt Dirk selbst.

> **Update 02.09.2026 — SERVER-HÄRTUNG Phase A ✅ (von Dirk ausgeführt, Statusausgabe verifiziert):**
> - **SSH-Schlüssel** für den Büro-Rechner erzeugt (`%USERPROFILE%\.ssh\id_ed25519`, ohne Passphrase) und in
>   `authorized_keys` des Servers hinterlegt. ✅ Schlüssel-Login VERIFIZIERT („SCHLUESSEL-LOGIN OK" ohne
>   Passwortfrage, von Dirk bestätigt 02.09.).
> - **ufw-Firewall AKTIV:** nur 22 (SSH) / 80 / 443 offen (v4+v6), Rest deny incoming. **fail2ban AKTIV**
>   (sshd-Jail; sperrte binnen Minuten 3 echte Angreifer-IPs, 25 Fehlversuche — Brute-Force lief also längst).
>   **unattended-upgrades AKTIV** (automatische Sicherheits-Updates).
> - **✅ Phase B DURCH (03.09.2026, von Dirk am Heimrechner ausgeführt, beide Tests verifiziert):**
>   Heimrechner hatte schon einen `id_ed25519` (NICHT überschrieben — Pubkey einfach angehängt), Schlüssel-
>   Login von BEIDEN Rechnern bestätigt. Dann **Passwort-Auth abgeschaltet**: Die Ubuntu-Falle war real
>   (`50-cloud-init.conf` stand auf `PasswordAuthentication yes`) → `/etc/ssh/sshd_config.d/00-hardening.conf`
>   (PasswordAuthentication no, PermitRootLogin prohibit-password) gewinnt als erste Datei; `sshd -T` zeigt
>   effektiv `passwordauthentication no` + `permitrootlogin without-password` (= prohibit-password, alter
>   Anzeigename). Nach `systemctl restart ssh` aus zweitem Fenster verifiziert: Schlüssel-Login ok,
>   Passwort-Versuch „Permission denied (publickey)" ohne Passwortfrage. **Der Server ist jetzt Key-only** —
>   bei Schlüsselverlust beider Rechner hilft nur die IONOS-VNC-Konsole. (Offen/optional: App nicht mehr als
>   root laufen lassen — größerer Umbau; Server-`reboot` wegen anstehender Kernel-Updates.)

> **Update 31.08.2026 (3) — PREISSENKUNG 29/79/149 € + Testphase „14 Tage kostenlos testen" (Commit ee6071f, 156 Tests + Typecheck grün; ✅ DEPLOY DURCH — VPS + .env + Stripe-Skript + IONOS-Upload von Dirk am 31.08. abends erledigt; ⏳ LIVE-VERIFIKATION OFFEN):**
> - **Verifikation:** ✅ (2) auftragsboss.de zeigt 29/79/149 + „14 Tage" (live geprüft 02.09., inkl. „66 Cent
>   je Angebot"-Zeile). ✅ (3) Stripe-Testmodus-Preise stimmen (Skript-Wiederholungslauf 02.09.: dreimal
>   „✓ Preis existiert schon" — ✓ erscheint nur bei exakt passendem Betrag). ⏳ (1) Begrüßung von frischer
>   Nummer nennt „14 Tage" — offen, am besten mit dem Telefon-Akquise-Live-Test kombinieren.
> - **Neue Tarifpreise: Basis 29 / Profi 79 / Team 149 € netto/Monat** (vorher 49/99/199; Kontingente bleiben
>   50/120/300). Zentrale Quelle `TARIF_PRESETS` (abrechnung.ts) — **aboSeite.ts nutzt sie jetzt statt eigener
>   Zahlen** (eine Quelle weniger, die auseinanderlaufen kann). Landingpage-Preiskarten neu; Profi-Unterzeile
>   „nur 66 Cent je Angebot" (79/120 — alter Text „1,41 €" war rechnerisch falsch).
> - **stripe-einrichten.ts beherrscht Preisänderungen:** Stripe-Preise sind unveränderlich → bei geändertem
>   Betrag neuen Preis am selben Produkt anlegen, `transfer_lookup_key: true` (Checkout findet automatisch den
>   neuen), alten deaktivieren. Bestehende (Test-)Abos behalten ihren alten Preis.
> - **Testphase statt Angebots-Zähler (Dirks Entscheidung):** Kommuniziert wird NUR „14 Tage kostenlos testen"
>   (`DIREKTTEST_TAGE`, Zeit ab Test-Konto-Anlage `erstelltAm`). Der Angebots-Deckel bleibt als STILLE Grenze
>   (`DIREKTTEST_GRATIS_ANGEBOTE`, Standard jetzt 10) — Deckel gerissen ODER Zeit um → dieselbe einheitliche
>   „🎉 Deine kostenlose Testphase ist abgelaufen"-Nachricht (mit Anmelde-Link bei Selbstregistrierung).
>   Nachrichten-Deckel-Standard 12→60. Willkommenstext nennt die 14 Tage. Landingpage: Hero-Trust,
>   Preis-Unterzeile, FAQ auf „14 Tage" umgestellt. Achtung: ALTE Test-Konten (>14 Tage, z. B. Dirks Freund)
>   gelten nach dem Deploy sofort als abgelaufen — gewollt.
> - **⏳ DEPLOY-SCHRITTE (Dirk):** (1) tar/scp/pm2 wie üblich (KEIN db push nötig). (2) Server-`.env` anpassen:
>   `DIREKTTEST_GRATIS_ANGEBOTE=10` (stand 5) + `DIREKTTEST_MAX_NACHRICHTEN=60` (stand 20), dann pm2 restart.
>   (3) Auf dem Server `npx tsx src/stripe-einrichten.ts` (legt die neuen Testmodus-Preise an; bei der späteren
>   LIVE-Umstellung dort erneut). (4) `marketing/index.html` bei IONOS hochladen.
>
> **Update 31.08.2026 (2) — NEUE PRODUKTIDEE ANALYSIERT: Foto-Aufmaß (Wandflächen aus Smartphone-Fotos).**
> Vollständige kritische Analyse + Konzept in **`Konzepte/Foto-Aufmass_Analyse.md`** — Kern: keine globale
> 3D-Rekonstruktion („rundherum drehen" geht physikalisch nicht, weiße Wände killen klassisches SfM), sondern
> **geführtes Wand-für-Wand-Aufmaß** im bestehenden WhatsApp-Dialog (Entzerrung + Raumhöhe als Maßstab,
> VOB-Regel „Öffnungen ≤ 2,5 m² übermessen" senkt Anforderungen, Rückfall-Leiter für zu große Wände:
> Diagonal-Trick → 0,5× → Kreppband-Split → selbst messen). **NICHTS implementieren** — ⏳ **Dirk sammelt in
> den nächsten Tagen die MESSBANK-Daten**: Schritt-für-Schritt-Anleitung in **`Messbank/ANLEITUNG.md`**
> (+ drei CSV-Vorlagen `wahrheit-raeume/-waende/-oeffnungen.csv` liegen bereit; ≥10 Räume, Laser-Wahrheit,
> Fotos original + WhatsApp-Fassung, Ordnerschema Raum01/original|whatsapp). Wenn Dirk „Messbank ist fertig"
> meldet → Claude baut das Auswertungsskript → Go-/No-Go (Konzept Abschnitt 9). Unabhängiger
> Sofort-Gewinn-Kandidat: deterministischer **Materialrechner** (Tapetenrollen/Farbe, Abschnitt 5).
>
> **Update 31.08.2026 — Meta-Vorlage `angebot_ausprobieren` GENEHMIGT ✅. ⏳ NÄCHSTER SCHRITT: Live-Test
> der Telefon-Akquise steht noch aus** — Ablauf: altes Test-Konto der Testnummer im /stasi-Cockpit löschen
> (oder frische Nummer nehmen) → Kundenliste-Panel „📞 Telefon-Lead einladen" → Vorlage mit Knöpfen kommt an
> → [Kurz erklären]-Zweig UND [Ja, los geht's] testen → Sprachnachricht → Angebot; im Log auf
> LEAD_EINLADUNG_GESENDET / LEAD_KNOPF / LEAD_ERSTE_EINGABE achten. Außerdem 31.08. bestätigt:
> Server-Root-Passwort geändert + alter geleakter OpenAI-Schlüssel gelöscht (Sicherheits-Nachlese komplett).
>
> **Update 26.08.2026 (2) — TELEFON-AKQUISE-ONBOARDING Etappe 1 (Commit fd87bc2, 156 Tests grün; ✅ 27.08. deployt inkl. db push; Meta-Vorlage eingereicht — finaler Text „Hallo {{1}}, danke für das nette Telefonat eben! Wollen wir direkt loslegen und ein erstes Angebot ausprobieren?"; ✅ Genehmigung durch 31.08.; ⏳ Live-Test mit unregistrierter Nummer):**
> - **Funnel:** Telefonat (mit ausdrücklicher WhatsApp-Einwilligung, rechtliche Prüfung macht Dirk separat) →
>   /stasi-Kundenliste Panel „📞 Telefon-Lead einladen" (Nummer/Anrede/Firma/Opt-in-Quelle) → Handwerker als
>   Test-Konto mit dokumentiertem Opt-in (leadQuelle/optInAm/optInQuelle/onboardingStatus, Schema additiv) →
>   **Meta-Vorlage `angebot_ausprobieren`** ({{1}}=Anrede) mit Quick-Reply-Knöpfen **[Ja, los geht's]
>   [Kurz erklären]** → Klick: JA → EINE Aufforderung zur Sprachnachricht (idempotent); ERKLÄREN → Kurz-
>   Erklärung + interaktiver Knopf „Angebot ausprobieren" → erste echte Eingabe (auch ohne Knopf) → normale
>   Pipeline (Gratis-Kontingent). Bewusst KEINE Erklär-Kaskade — sofortige Interaktion (Dirks Briefing).
> - **Technik:** `src/lead/onboarding.ts` (Sender injizierbar); send.ts Vorlagen mit quick_reply-Payloads +
>   `sendeWhatsAppKnoepfe` (interactive, 24-h-Fenster); webhook `extrahiereEingabe` (pure) erkennt
>   button.payload/interactive.button_reply → pipeline-Abzweig `knopfPayload` (kein KI/Kontingent-Verbrauch;
>   unbekannte Nummer + Knopf still ignoriert). **Leads bekommen die Test-Begrüßung NICHT** (KI-Hinweis
>   gehört in die Vorlagen-Fußzeile!). Vorlagenname via .env `LEAD_VORLAGE` überschreibbar.
>   Events: LEAD_ANGELEGT/-EINLADUNG_GESENDET/-KNOPF/-ERSTE_EINGABE; AdminLog LEAD_EINGELADEN.
> - **Offen:** Meta-Vorlage anlegen/genehmigen (Marketing, Body „Hallo {{1}}, hier ist AuftragsBoss. Wie eben
>   am Telefon besprochen: Wollen wir direkt ein Angebot ausprobieren?", Fußzeile KI-Hinweis, 2 Buttons),
>   Deploy + **db push**, Live-Test. **Etappe 2 später:** Reminder hinter Flag + Funnel-Auswertung je
>   leadQuelle. **Bewusst verschoben:** Eingabe-Bündel-Fenster (Sprache+Foto), Sales-Frank-API.
>
> **Update 26.08.2026 — Positionen zusammenfassen, Beispiel-Angebot komplett, Landingpage-Demo plausibilisiert, Vorschau-Feinschliff, Betreiber-WhatsApp FERTIG (alles ✅ LIVE — VPS deployt + IONOS hochgeladen):**
> - **Editor: Positionen zusammenfassen** (26136e7): Auswahl-Häkchen je Position (Desktop-Spalte vor dem
>   Anfasser, mobil Kachel in der Karten-Fußleiste, synchron) → Leiste „N ausgewählt → Zu einer Position
>   zusammenfassen" (aktiv ab 2). Ergebnis: Beschreibungen als Zeilen untereinander, pauschal/Menge 1,
>   Preis = Summe der Zeilensummen (fehlt eine → offen, nichts wird erfunden), Herkunft MANUELL; 10 s
>   Rückgängig-Fenster stellt alles wieder her. Hintergrund: Maler bieten oft 2-3 große Pauschal-Positionen an;
>   die KI dröselt bewusst weiter fein auf (zusammenfassen = 2 Klicks, auseinanderpflücken = Handarbeit).
>   **Mehrzeilige Beschreibungen** jetzt überall sauber: Word (TextRun-breaks), E-Mail (<br>), Editor-Vorschau
>   (<br>); PDF konnte es schon (pdfkit nativ). Interne Felder `_wahl` (wie `_geloescht`) beim Speichern gefiltert.
> - **Web-Test „Kein Mikro? Beispiel ansehen" liefert jetzt ein VOLLSTÄNDIGES Angebot** (8ae9637): Der Knopf
>   schickt BEISPIEL_TEXT durch die ECHTE KI-Pipeline — Lösung war ein komplett diktiertes Beispiel (volle
>   Adresse „Familie Bär, Bergstraße 12, 67433 Neustadt", alle Preise, große Pauschal-Positionen). Ergebnis
>   (echt verifiziert): 2 Material- + 4 Arbeits-Positionen, 0 Lücken, Gesamt 2.273,50 €.
> - **Landingpage-Demo-Angebot schlüssig zum Diktat** (da5b954, 239706e; index.html BEI IONOS HOCHGELADEN):
>   Diktiertes „Möbel/Boden abdecken" fehlte komplett, dazu Material ergänzt (Folie/Vlies, Weißlack,
>   Tiefengrund/Spachtel — bewusst KEINE neue Tapete: sie kommt nur runter, gestrichen statt tapeziert);
>   Preise plausibilisiert (Wände 10,50 €/m², Sockelleisten 9,50 €/lfm inkl. Montage; Mengen gegen
>   Geometrie/Ergiebigkeit geprüft). Neu: Netto 2.428,50 / Gesamt 2.889,92 €. 10 Positionen, Karte wächst mit.
> - **A4-Vorschau-Bündigkeit** (8f6659d): rechtsbündige Spalten hatten padding-right:0 → „pauschal" klebte am
>   Einzelpreis, „Gesamtbetrag" am Betrag. Jetzt 14 px Luft zwischen Zahlenspalten, letzte Spalte bündig —
>   in Editor- UND Einstellungs-Vorschau.
> - **Betreiber-WhatsApp KOMPLETT FERTIG:** Meta hat `neuer_kunde` genehmigt; Ping-Test kam auf Dirks Handy an
>   (kurzer Schreck: „Musterfirma GmbH / Basis (49 €)" sind die Beispielwerte aus betreiber-ping.ts — keine
>   echte Buchung, Cockpit/Logs leer, verifiziert). Bei echten Buchungen steht der echte Firmenname drin.
> - **Nachmittags-Runde (alles ✅ LIVE, VPS + IONOS):** (a) A4-Vorschau-Bündigkeit: alle Zahlenspalten 14 px
>   Luft, Summenzeilen exakt bündig zur Betragsspalte (eigene tr.sum-Regel übersteuerte den Fix — in Editor-
>   UND Einstellungs-Vorschau). (b) Beispiel-Kunde heißt Familie Mustermann, Musterstraße 5, 12345 Musterstadt.
>   (c) Landingpage-Demo kompakter (engere Zeilen, keine Zweizeiler; Karte 515→463 px). (d) **Zusammenfassen
>   mobil:** Auswahl-Leiste klebt sticky im Sichtfeld (top:8px, z6 über den Kategorie-Bannern), Erklärtext beim
>   ersten Haken, Knopf volle Breite; Bestätigungs-Overlay hat ×-Kreuzchen (wahlLeisteSchliessen). (e) **Alle
>   fünf /testen-Links öffnen im NEUEN Tab** (Dirks finale Entscheidung — Preiskarten-Knöpfe gingen vorher auf
>   toten #testen-Anker). (f) **Kontingente vereinheitlicht auf 50/120/300** (Landingpage gilt, Dirks
>   Entscheidung): Cockpit-Tarifkarten + Stripe-Produktbeschreibungen angepasst; stripe-einrichten.ts zieht
>   Beschreibungen bestehender Produkte jetzt nach (auf dem Server erneut gelaufen).
> - 145 Tests + test:demo grün; Browser-E2E Desktop + 375 px. **Offen: Stripe Etappe 3** (Kundenportal,
>   Zahlungsausfall-UX, LIVE-Umstellung) — dann können echte Kunden zahlen. ✅ Server-Root-Passwort
>   geändert (von Dirk bestätigt, 31.08.).
>
> **Update 14.08.2026 (2) — STRIPE-ABO-ANBINDUNG Etappen 1+2 LIVE, Testmodus-Durchstich ERFOLGREICH (Commits d0a2f95…6acd2f0, 145 Tests grün; deployt inkl. npm install + db push):**
> - **Etappe 1:** `POST /webhook/stripe` (Signaturprüfung auf rohem Body, eigener Buffer-Parser, fail-closed ohne
>   .env-Schlüssel). `stripeVerarbeitung.ts`: checkout.session.completed → Abo AKTIV (+stripeCustomerId/-SubscriptionId,
>   Schema additiv) + AdminLog + **Betreiber-WhatsApp** (`meldeNeuenKunden`); invoice.paid → **NETTO-Buchung** ins Ledger
>   (idempotent via Rechnungs-Id in notiz); subscription.deleted → GEKUENDIGT; payment_failed → AdminLog;
>   **charge.refunded → negative KORREKTUR** (Ziel-Zustands-Idempotenz, Teil-Erstattungen anteilig — Dirks Wunsch nach
>   dem Test). Tarif-Erkennung über Preis-lookup_keys basis/profi/team. `src/stripe-einrichten.ts` legt idempotent
>   Produkte (49/99/199 € NETTO zzgl. 19 % MwSt, Dirks Entscheidung) + Steuersatz an.
> - **Etappe 2:** `stripeCheckout.ts` (personalisierte Checkout-Session: client_reference_id + Metadaten an Session UND
>   Abo; Tax-Rate; Adresse Pflicht + USt-IdNr.; Erfolg /abo/danke, Abbruch Cockpit) + `aboRoutes.ts`
>   (GET /abo/buchen/:einstellungenToken?tarif=…, /abo/danke; Test-Konten → Registrier-Hinweis).
> - **Neuer App-Reiter „Abo & Abrechnung"** (`aboSeite.ts`, /abo/:token, Nav-Punkt unter „Konto"): Abo-Stand bzw.
>   3 Tarif-Karten + **Rechnungs-Panel mit PDF-Download** (ladeRechnungen via stripeCustomerId) + Empfehlungs-Panel —
>   beides RAUS aus der Übersicht (Dirk: dort unerwartet). cockpitSeite entsprechend entschlackt.
> - **Testmodus-Durchstich mit Dirk (in seiner SANDBOX) komplett:** Checkout mit Testkarte → Abo im Cockpit AKTIV →
>   49/99-€-Buchung im Ledger → Kündigung über Stripe-Dashboard korrekt erkannt → Erstattung (Rückkopplung dafür
>   nachgebaut; Dirk hat charge.refunded im Webhook-Endpunkt ergänzt). Nur WhatsApp offen (Meta-Vorlage in Prüfung).
> - **Stripe-Konfig auf dem VPS:** sk_test_ + whsec_ in .env (von Dirk), Webhook-Endpunkt in seiner Sandbox auf
>   api.auftragsboss.de/webhook/stripe mit 5 Ereignissen, Einrichtungs-Skript gelaufen. **BETREIBER_HANDY gesetzt.**
> - **Stripe-Branding:** Wort-Bild-Marke `marketing/auftragsboss-logo-schrift.png` neu gebaut (Symbol + AUFTRAGSBOSS in
>   Inter ExtraBold, „AUFTRAGS" anthrazit / „BOSS" gelb; woff2→ttf konvertiert, GDI+-Skript im Scratchpad).
>   **Stolperfalle: Sandbox zeigt Branding nur an, speichert NICHT** — Upload klappte erst im LIVE-Modus (kontoweit,
>   gilt damit schon für den Echtbetrieb). PayPal aktiviert Dirk unter Einstellungen → Zahlungsmethoden (je Umgebung).
> - **Aufräumen:** `stripe-testdaten-loeschen.sql` im Repo-Root (löscht Stripe-Test-Buchungen/-Abos via
>   `npx prisma db execute --file …`). **Offen:** Meta-Genehmigung `neuer_kunde` → `npx tsx src/betreiber-ping.ts`;
>   **Etappe 3** (Stripe-Kundenportal zum Selbst-Kündigen/Zahlungsmittel-Ändern, Zahlungsausfall-UX,
>   **Live-Umstellung**: sk_live/whsec im Live-Modus + Webhook + Einrichtungs-Skript + PayPal dort erneut).
>
> **Update 14.08.2026 — Editor-UI-Runde + Betreiber-WhatsApp vorbereitet (⏳ committet, Deploy bewusst aufgeschoben — „erst bei der nächsten Änderung"; alles im aktuellen deploy.tar.gz, kein db push nötig):**
> - **Mobile Positions-Karten neu** (514c848): aufgeräumtes Raster je Karte — Beschreibung oben, Menge+Einheit
>   und Einzelpreis+Gesamt paarweise nebeneinander, Feldlabels klein ÜBER den Eingaben; Fußleiste mit Trennlinie
>   (▲/▼ links, Merken-Pille rund, Lösch-Knopf gerahmt rechts). Gelöschte Position = schmale graue Karte.
>   Neue Klassen `pos-zeile`/`c-menge`/`c-preis` statt :not()-Ketten; Desktop-Tabelle unverändert (+ Hover).
>   **Zuklapp-Pfeil der unteren Leiste mobil = großer 42×40-Knopf mit Rahmen** (war winzig, schlecht zu treffen).
> - **Löschen animiert** (dbc2abe): `zeigeGroessenwechsel` (FLIP über die Zeilenhöhe) — Karte schrumpft sichtbar
>   auf die Rückgängig-Zeile (288→63 px im Test), Rückgängig wächst zurück; Desktop (<6 px Unterschied) übersprungen.
> - **Betreiber-Benachrichtigung „neuer Kunde" vorbereitet** (c304b13): Dirk bekommt eine WhatsApp auf
>   BETREIBER_HANDY, wenn eine Firma ein Abo bucht — **Auslöser kommt erst mit der Stripe-Anbindung**
>   (`meldeNeuenKunden` in `betrieb/betreiberAlarm.ts` dort an den Buchungs-Webhook hängen; bewusst KEINE
>   Zwischenlösung). Technik: Meta-**Vorlage** `neuer_kunde` (freier Text ginge nur im 24-h-Fenster);
>   `sendeWhatsAppVorlage` in send.ts, `betreiberConfig` (Handynummer tolerant normalisiert, fehlend = aus).
>   Test-Skript für den Server: `npx tsx src/betreiber-ping.ts`. **Offen (Dirk):** Vorlage im WhatsApp Manager
>   anlegen (Utility, Name exakt `neuer_kunde`, Deutsch, „🎉 Hey Dirk, {{1}} hat gerade ein Abo gebucht: {{2}}.")
>   + `BETREIBER_HANDY=4917662492471` in die VPS-.env + nach Deploy/Genehmigung Ping-Test.
> - **131 Tests grün (4 neu), Typecheck grün; UI-Runde im Browser E2E verifiziert (375 px + 1440 px).**
>
> **Update 13.08.2026 (5) — Betreiber-Login unter /stasi: E-Mail + Passwort statt Token-URL (✅ LIVE, Login von Dirk bestätigt; ADMIN_EMAIL=d.beer@deutsche-automotive.de + scrypt-Hash in VPS-.env):**
> - **Neuer Zugang:** `/stasi` = Login-Seite (E-Mail + Passwort) → signiertes httpOnly-Cookie (30 Tage,
>   `SESSION_SECRET`, gleiche Technik wie die Zugangs-Schleuse) → Cockpit unter sauberen URLs
>   `/stasi/betriebe`, `/stasi/betrieb/:id`, `/stasi/umsatz`, `/stasi/auswertung` (Lern-Auswertung) — kein
>   Geheimnis mehr in URL/Verlauf/Lesezeichen. Abmelden-Link in der Kundenliste. Pfad „stasi" bewusst
>   unauffällig (Dirks Wunsch); Sicherheit kommt vom Login.
> - **Technik (`src/web/adminAuth.ts`):** Passwort als **scrypt-Hash** in der .env (`ADMIN_EMAIL` +
>   `ADMIN_PASSWORT_HASH=scrypt.<salt>.<hash>`; erzeugen mit `npx tsx src/stasi-passwort.ts "PW"`), Vergleich
>   timing-sicher, Passwortprüfung läuft auch bei falscher E-Mail (kein Timing-Orakel); Brute-Force-Sperre
>   5 Versuche → 15 Min (gemeinsamer Zähler aus geraetevertrauen). Fehlt eine der beiden .env-Zeilen → /stasi
>   komplett 404 (fail closed). Ohne Sitzung: HTML-Seiten leiten zum Login um, JSON-Aktionen 404.
> - **Routen:** betreiberRoutes registriert jede Route DOPPELT via `beide()`-Helfer (`/stasi/…` mit Cookie,
>   `/admin/:token/…` mit ADMIN_TOKEN als **Notfall-Zugang, bleibt vorerst**); `zugang(req)` liefert ok+basis.
>   dev:editor setzt Demo-Zugang admin@demo.de / demo-passwort. **E-Mail-Fußzeile: „Eine Marke der DAG …"**
>   (statt „Ein Dienst der", passend zur Website).
> - **127 Tests grün (5 neu: Hash/Cookie), Typecheck grün; Browser-E2E:** Login falsch/richtig, alle Seiten +
>   Aktionsrouten über Cookie, Abmelden, Schutz ohne Sitzung, alter Token-Weg + falscher Token.
> - ✅ **13.08. abends LIVE:** Zugangsdaten in VPS-.env (Stolperfalle unterwegs: erst Platzhalter-E-Mail
>   erwischt → per `sed` beide Zeilen sauber neu geschrieben), Login auf api.auftragsboss.de/stasi bestätigt.
>   **Später (wenn bewährt):** Alt-Weg `/admin/<token>` entfernen; Lesezeichen auf /stasi umstellen.
>
> **Update 13.08.2026 (4) — Editor-Feinschliff-Runde (viele kleine Features, jeweils einzeln deployt; Stand Abend LIVE):**
> - **WhatsApp-Eingangsbestätigung neutral** („Ich verarbeite deine Sprachnachricht" / „Ich lese deine Notizen" statt „erstelle dein Angebot" — Nachricht kann auch eine Frage sein); Bestätigung nach der Zusammenfassung bleibt konkret.
> - **Merken-Knopf Desktop rechtsbündig unter dem Einzelpreis**; Einstellungs-Schalter beginnt mit „Bei WhatsApp …".
> - **A4-Live-Vorschau im Editor in sich scrollbar** (max. Fensterhöhe, Mausrad über der Vorschau, overscroll-contain).
> - **Löschen mit Reue-Frist:** graue Rückgängig-Zeile (8 s, Kreuzchen = sofort weg, `_geloescht`/`_timer` intern; Summen/Vorschau/Speichern filtern sie).
> - **Handy→PC-Workflow:** Tipp unter dem E-Mail-Haken + neuer Knopf „Bearbeitungslink an meine E-Mail senden" (Route POST `/api/a/:token/mail-link`, dokumentMail OHNE wordDateiname = ohne Anhang-Kasten; gleiche Schutzschichten wie Datei-Versand).
> - **Positionen verschieben:** Desktop Drag & Drop am ⠿-Anfasser (nur am Anfasser draggable; Ablage in anderer Kategorie wechselt sie; „+ Position"-Zeile = ans Kategorie-Ende), Handy ▲/▼-Pfeile in der Kreuzchen-Zeile (`verschiebePosition` über `anzeigeListe`). **FLIP-Animation** (Zeile gleitet über `data-i`, blinkt gelb).
> - **Untere Leiste („Herunterladen & E-Mail") am Handy zuklappbar** (Kopfzeile 47 px, Tipp öffnet/schließt, Auto-Aufklappen am Seitenende mit **Flacker-Schutz**: merkt Scroll-Lage beim Öffnen, schließt erst 150 px darüber). **Segment neu designt:** zwei Gruppen „Angebot herunterladen" (große PDF/Word-Knöpfe + Mail-Haken) und „💻 Am PC weitermachen" (Link-Knopf + Erklärsatz), Desktop nebeneinander. `statusSetzen()` null-sicher, Status mobil in der Klapp-Kopfzeile.
> - Jede Stufe im Browser E2E verifiziert (Desktop + 375 px), 122 Tests grün. Deploys ohne `db push`.
>
> **Update 13.08.2026 (3) — Einstellungsseite: Kopf-/Fußzeile getrennt, Bank+IBAN, Vorschau-Markierung; Editor: A4-Live-Vorschau (✅ LIVE, db push wegen `iban` durch):**
> - **Editor bekam eine A4-Live-Vorschau** rechts (nur Desktop ≥1100px, sticky) mit dem ECHTEN Angebot
>   (Positionen/Summen/Gültig-bis/Fußzeile, offene Preise als ___ €); Hook in `markiereGeaendert`.
>   Außerdem Merken-Knopf am Desktop rechtsbündig unter dem Einzelpreis (statt unter der Beschreibung).
> - **Firmendaten in ZWEI Abschnitte getrennt:** „Kopfzeile — oben im Angebot" (Firma, Straße, PLZ/Ort,
>   Telefon, E-Mail) und „Fußzeile — unten im Angebot" (Ansprechpartner, USt-IdNr., Bank, IBAN) — erst
>   oben ausfüllen, dann unten; Firma+Adresse erscheinen automatisch in beiden.
> - **Bank + IBAN getrennt:** neues Feld `Handwerker.iban` (+ `iban` in preisliste.json-Schema mit Default "");
>   `effektivePreisliste` überlagert es; Word-/PDF-/Editor-Vorschau-Fußzeile hängen `IBAN: …` an. Bestandsdaten
>   bleiben im Feld `bank` (Dirk kann die IBAN von Hand ins neue Feld verschieben).
> - **Vorschau-Markierung:** Legende + gelb hinterlegt (`.pv-mein`) = kommt aus den Einstellungen
>   (Briefkopf, Einleitung, Schlusstext, Gültig/Zahlungsziel, Fußzeile); ausgegraut (`.pv-demo`, Pille
>   „Nur Beispiel") = Beispiel-Angebot (Kunde/Positionen/Preise) — macht klar, dass das Angebot selbst
>   NICHT hier, sondern im Angebots-Editor bearbeitet wird.
> - **122 Tests grün (u. a. Bank/IBAN-Überlagerung), Typecheck grün, Browser-E2E:** Abschnitte in neuer
>   Reihenfolge, IBAN tippen → Fußzeile „Bank: … · IBAN: …", nach Reload da, Leeren = Vorgabe.
>
> **Update 13.08.2026 (2) — Angebotsgültigkeit + Zahlungsziel je Betrieb einstellbar (✅ LIVE, db push durch; live in der Einstellungs-Vorschau bestätigt):**
> - Vorher standen beide nur als globale Vorgabe in `preisliste.json` (`angebotGueltigTage` 30, `zahlungsziel`)
>   und landeten von dort in der Schlusszeile von PDF/Word/E-Mail — kein Betrieb konnte sie ändern.
> - **Schema:** `Handwerker.angebotGueltigTage Int?` + `zahlungsziel String?` (null = Vorgabe greift) → **`db push` nötig** (additiv).
> - **`effektivePreisliste` überlagert jetzt auch `konditionen`** (Tage nur wenn >0, Zahlungsziel per `oder()`).
>   Dadurch fließen die Betriebs-Werte ohne Änderung an den Erzeugern in `summe.gueltigBis` (berechnung.ts)
>   und die „Gültig bis … Zahlungsziel: …"-Zeile von PDF/Word/E-Mail; Timeout-Job ist über
>   `erstelleDokument` (pipeline rechnet eff intern) automatisch abgedeckt.
> - **Einstellungsseite:** zwei neue Felder unter „Angebots-Texte" („Angebot gültig für (Tage)" 1–365,
>   „Zahlungsziel" max 160 Zeichen, Platzhalter = Vorgabe, leer = zurück zur Vorgabe); Live-Vorschau-Zeile
>   `#pvGueltig` rechnet beim Tippen mit. Speichern über die bestehende PUT-Route (Validierung serverseitig).
> - **Typecheck grün, 121 Tests grün (4 neu: betriebsdaten.test.ts — Vorgabe/Überlagerung/Unsinnswerte/MwSt).**
>   Browser-E2E: Feld 14 Tage + eigenes Zahlungsziel → Vorschau 27.08. korrekt, gespeichert, nach Reload da;
>   Felder geleert → Vorgabe greift wieder. Lokales `db push` durch.
>
> **Update 13.08.2026 — Preisgedächtnis: Merken/Vergessen-Knöpfe je Position im Editor (✅ LIVE auf dem VPS, pm2 #62, /health ok; Mobil-Feinschliff: Knopf in der Kreuzchen-Zeile — Deploy zusammen mit Update (2)):**
> - **Dirks Idee:** je Position gezielt „Stundensatz merken" / „m²-Preis merken" / „Gebinde-Preis merken" … —
>   und wenn ein Preis schon gemerkt ist, zeigt dieselbe Stelle „✓ gemerkt" + „vergessen". So sieht der Maler
>   sofort, dass ein Preis aus seinem Gedächtnis kommt, und kann ihn mit einem Klick wieder entfernen.
>   Preis ändern = neuen Preis eintippen und wieder „merken" drücken (überschreibt).
> - **Editor (`editorSeite.ts`):** unter jeder Positionsbeschreibung eine `.ged-box`. Beschriftung folgt der
>   Einheit (`gedLabel`: Std→Stundensatz, m2→m²-Preis, pauschal→Pauschalpreis, Stk→Stückpreis, …, sonst „Preis").
>   Zustände: Preis da + nicht gemerkt → „🧠 … merken"; gemerkt + gleicher Preis → „✓ … gemerkt · vergessen";
>   gemerkt + anderer Preis → „🧠 Neuen … merken (bisher X €) · vergessen". **Client-Schlüssel `gedSchluessel()`
>   MUSS der Server-Normalisierung `leistungSchluessel()` entsprechen** (preisgedaechtnis.ts) — im Browser per
>   Reload verifiziert (Server- und Client-Schlüssel identisch). Knöpfe erscheinen nur bei aktivem Preisgedächtnis
>   (Flag + Betriebsschalter, nie bei Test-Konten); bei „versendet" mitgesperrt (`.gesperrt .ged-btn`).
> - **Routen (`routes.ts`):** Editor-GET bettet den Gedächtnis-Stand ein (Schlüssel→Preis); neu
>   POST `/api/a/:token/preis-merken` (Preis-Validierung, upsert via `merkePreise`, quelle MANUELL) und
>   POST `/api/a/:token/preis-vergessen` (neue Funktion `vergissPreis`). Beide hinter der Zugangs-Schleuse,
>   403 wenn Gedächtnis aus.
> - **Automatik bleibt** (Dirks Entscheidung „Beides": Speichern lernt weiter alle bepreisten Positionen).
>   Dafür neue Positions-Sperre **`gedSperre`**: „vergessen" setzt sie — sonst würde das Automatik-Lernen beim
>   nächsten Auto-Speichern den noch eingetragenen Preis sofort wieder merken —, „merken" hebt sie auf.
>   Wandert durchs Editor-JSON (`EditorPosition`/`EingabePosition`/`editorZuPositionen`; das `...p` in
>   berechnung.ts erhält sie in positionenJson); `merkePreise` überspringt gesperrte Zeilen.
> - **Typecheck grün, 117 Tests grün (2 neu: vergissPreis; merkePreise-Test um gedSperre erweitert).**
>   Ende-zu-Ende im Browser (dev:editor, PORT 3010/3011, Flag an, Demo-Betrieb-Schalter an): merken →
>   Persistenz nach Reload, abweichender Preis, vergessen + Sperre hält (Automatik lernte NICHT nach),
>   merken hebt Sperre wieder auf. Demo-Daten danach aufgeräumt, verwaiste Dev-Server per taskkill beendet.
> - ✅ **Deploy 13.08. durch** (kein Schema-Change, kein `db push`; scp + tar + `pm2 restart` von Dirk,
>   `/health` danach ok). `FEATURE_PREISGEDAECHTNIS` ist am VPS schon AN; Betriebe sehen die Knöpfe erst,
>   wenn ihr Preisgedächtnis-Schalter in den Einstellungen an ist (Standard AUS).
>
> **Update 12.08.2026 — VORFALL GELÖST: Anthropic-Guthaben leer → Angebotserstellung fiel aus (11.08. abends bis 12.08. mittags):**
> - **Symptom:** WhatsApp nahm Nachrichten an („Hab ich! …"), danach kam „⚠️ Da ist etwas schiefgelaufen" —
>   bei Dirk UND potenziell bei echten Interessenten. **Ursache:** `strukturiereDialog` (structure.ts) bekam
>   von der Anthropic-API 400 „credit balance too low"; auch der Timeout-Job scheiterte daran.
> - **Wurzel:** Der Server-`ANTHROPIC_API_KEY` gehörte zur ALTEN Organisation (`b602a07f-…`, Guthaben leer),
>   während Dirks aktuelles Console-Konto „Frittenkarl" (`861b4b1f-…`, 100 $ Guthaben) **null API-Schlüssel** hatte.
>   Zwei Kassen: Schlüssel ohne Geld / Geld ohne Schlüssel.
> - **Fix (12.08.):** Neuer Schlüssel `auftragsboss-server` in der aktuellen Organisation (Workspace Default,
>   Schlüssel in 1Password) → in VPS-`.env` `ANTHROPIC_API_KEY` ersetzt → `pm2 restart`. **Auto-Reload
>   (automatisches Aufladen) in der Console AKTIVIERT** — Wiederholung ausgeschlossen. Alte Organisation wird
>   nicht mehr genutzt. (Ausgabenlimit 200 $/Monat + Admin-Mail bei 100 $ waren schon gesetzt.)
> - **Außerdem: OpenAI-Schlüssel ROTIERT** (alter war versehentlich im Klartext in den Claude-Chat geraten —
>   gleiche Sorte Leak wie der Verify-Token am 30.07.; Regel: Schlüssel NIE in Chat/Notizen einfügen, nur
>   Präfix-Checks wie `grep -o '^…=.\{10\}'`). Beim Tausch kurze Stolperfalle: Schlüssel in falscher Zeile →
>   Server-Startprüfung meldete „ANTHROPIC_API_KEY muss mit sk-ant- beginnen" (env-check.ts hat sauber
>   gegriffen!). Beide Zeilen korrekt gesetzt (`sk-ant-…` / `sk-proj-…`) + `pm2 restart` (Merke: .env wird
>   NUR beim Prozessstart gelesen — ohne Restart wirkt keine Änderung).
> - ✅ **12.08. nachmittags LIVE BESTÄTIGT: „jetzt funktioniert alles wieder"** — Sprachnachricht → Angebot
>   läuft mit beiden neuen Schlüsseln.
> - **Lehren:** (1) Bei „schiefgelaufen"-Meldungen zuerst `pm2 logs --err` lesen — der echte Grund steht drin
>   (hier inkl. `anthropic-organization-id`, die die falsche Kasse verriet). (2) Live-Betrieb heißt: BEIDE
>   KI-Konten (Anthropic + OpenAI) brauchen Auto-Reload/Alarm. ✅ **OpenAI Auto-Recharge aktiviert (13.08., Dirk).**
>   ✅ **Alter geleakter OpenAI-Schlüssel entsorgt (bestätigt 31.08.)** — Schlüssel-Thema komplett abgeschlossen.
> - Merkzettel: Server nutzt Claude via API (structure.ts); Guthaben wird durch API-, Claude-Code- und
>   Workbench-Nutzung verbraucht (eine Kasse pro Organisation).
> - 🆕 **STRIPE-KONTO EINGERICHTET (12.08. nachmittags, Dirk selbst):** Live-Konto für DAG Deutsche
>   Automotive GmbH komplett durchs Onboarding (Unternehmensdaten, Bank, Betrugsschutz **Lite/gratis**
>   — bewusst, B2B-Abo mit Stammkunden braucht kein Radar-Standard; Steuerberechnung/Climate übersprungen).
>   Kategorie „Software", Beschreibung = AuftragsBoss-Abo (49/99/199 €, B2B Deutschland).
>   **Zahlungsbeschreibung auf Kontoauszug: `AUFTRAGSBOSS.DE`** (kurz-Variante leer). Öffentliches
>   Stripe-Profil bewusst NICHT erstellt (unnötig, Adresse würde öffentlich). ⏳ Stripe-Prüfung läuft ggf.
>   im Hintergrund (auf E-Mail achten). **NÄCHSTES GROSSES PROJEKT (geplant angehen, nicht nebenbei):**
>   technische Abo-Anbindung an AuftragsBoss — automatische Abbuchung, Tarife ans Cockpit-Abo-Modell
>   (`Abo`/`Buchung`) koppeln, Empfehlungs-Freimonat einlösen. Secret Key (`sk_live_…`) dann NUR direkt
>   in die Server-`.env`, nie in Chat/Notizen.

> **Update 11.08.2026 (Nacht) — Betreiber-Cockpit Stufe 3: KI-Kosten, Alarme, Als-Kunde (✅ LIVE auf dem VPS, kein db push nötig; Kostenzahlen füllen sich ab Deploy):**
> - **KI-Kosten je Kunde:** Jeder KI-Aufruf schreibt ein Event `KI_AUFRUF` mit `kostenCent` (Ganzzahl-Cent). Erfassung: `strukturiereDialog`/`liesBildNotiz`/`kiAusleseAngebotstext` haben einen optionalen `verbrauch`-Callback (input/output-Token aus `response.usage`; wird auch bei refusal gemeldet — Token sind angefallen); Transkription wird über die Audiodauer **geschätzt** (`schaetzeAudioSekunden`: Opus ~16 kbit/s → Bytes/2000). Preistabelle in `src/analytics/kikosten.ts` (**Annahme, zum Anpassen dokumentiert:** Claude Sonnet-Klasse 2,80/14,00 € je 1M Token ein/aus; Transkription 1,1 ct/min für BEIDE Fassungen zusammen) + `summiereKostenCent` (tolerant gegen fremde/kaputte dataJson). Webtest (anonym) bleibt bewusst unerfasst — Kosten je KUNDE. **UI:** Detail-Kacheln „KI-Kosten 30 Tage/gesamt", Listen-KPI „KI-Kosten dieser Monat".
> - **Warnsignale-Box** oben in der Kundenliste (nur wenn vorhanden): 💤 Kunden (nicht Test/blockiert) 7+ Tage inaktiv mit Tageszahl, 🧪 Test-Konten am Limit (`testNachrichten >= DIREKTTEST_MAX_NACHRICHTEN` aus config), ❓ Kundenrückfragen der letzten 14 Tage (`Dokument.kundenRueckfrageAm`) — alle mit Link zur Detailseite.
> - **„Als Kunde ansehen":** GET `betrieb/:id/als-kunde[?ziel=einstellungen]` → AdminLog `ALS_KUNDE` + 302 auf `cockpitLink`/`einstellungenLink` (Token via `einstellungenTokenBereit`, wird bei Bedarf erzeugt). Knöpfe auf der Detailseite (neuer Tab, Hinweis „wirkt wie vom Kunden selbst").
> - **Typecheck grün, 115 Tests grün (13 neu: kikosten 11 + Alarme/Kosten-UI).** Ende-zu-Ende verifiziert: Test-Events 31+1 Cent → 0,32 € auf Kacheln + Monats-KPI; Warnsignal „inaktiv seit N Tagen" live; beide Redirects 302 mit echtem Token. **Kein Schema-Change** → Deploy ohne `db push`.
>
> **Update 11.08.2026 (noch später) — Betreiber-Cockpit Stufe 2: Abo + Umsatz (✅ LIVE auf dem VPS inkl. db push; /umsatz live verifiziert):**
> - **Abrechnung im Betreiber-Cockpit** (manuell, keine Stripe-Anbindung): Neues Model **`Abo`** (1:1 Handwerker, onDelete Cascade: tarif BASIS/PROFI/TEAM/INDIVIDUELL, monatspreis, status AKTIV/GEKUENDIGT, beginntAm, gekuendigtAm) + **`Buchung`**-Ledger (bewusst OHNE Relation + Firma im Klartext → Umsatzhistorie übersteht Betriebs-Löschung; typ ZAHLUNG/FREIMONAT/GUTSCHRIFT/KORREKTUR, betrag, zeitraum "JJJJ-MM", notiz). **Grundsatz: Umsatz IMMER aus dem Ledger (Ist), MRR aus aktiven Abos (Soll).** Kennzahlen-Modul `src/betrieb/abrechnung.ts` (pur, 12 Tests): mrr, einnahmenImZeitraum, gesamtUmsatz, umsatzJeKunde, monatsverlauf (füllt Lücken mit 0-Zeilen, auch über Jahresgrenzen), TARIF_PRESETS 49/99/199 (müssen zur Landingpage-Preisseite passen). **UI:** Detailseite hat „Abo & Abrechnung" (Tarifwahl belegt Preis per JS vor; anlegen/ändern/reaktivieren = ein Upsert-Endpunkt `abo`, kündigen separat), „Zahlung erfassen" (Betrag mit Monatspreis vorbelegt, Zeitraum-Validierung), „Freimonat einlösen" (nur bei freimonate>0; Transaktion: decrement + 0-€-Buchung) und Zahlungshistorie; Kachel „Umsatz seit Beitritt". Liste: Abo-/Umsatz-Spalten + KPIs MRR/Einnahmen-Monat/Gesamtumsatz. **Neue Seite `/admin/:token/umsatz`:** KPIs (+ zahlende Kunden, offene Freimonate), Monatsverlauf als CSS-Balken (neuester oben, aktueller Monat blau), Abos nach Tarif, Kunden nach Umsatz (gelöschte Betriebe erscheinen als „<Firma> (gelöscht)" aus der Buchung). Alle Aktionen im AdminLog. **Typecheck grün, 102 Tests grün (18 neu); alle 9 Aktions-/Fehlerfälle + Umsatz-Seite Ende-zu-Ende im Browser verifiziert (Zahlen auf den Cent konsistent).** Deploy braucht `npx prisma db push` auf dem VPS. **Windows-Falle bestätigt:** `TaskStop` auf `npm run dev:editor` lässt Kindprozesse (Port + DLL) überleben → `taskkill /F /PID …` nötig; Ausweich-Test lief auf PORT=3001.
>
> **Update 11.08.2026 (spät) — Betreiber-Cockpit Stufe 1 (✅ LIVE auf dem VPS; ADMIN_TOKEN neu in VPS-.env gesetzt, Token in 1Password):**
> - **Neues Betreiber-Cockpit für Dirk** unter `/admin/<ADMIN_TOKEN>/betriebe` (gleicher Schutz wie die Lern-Auswertung: `ADMIN_TOKEN` aus `.env`, ≥8 Zeichen, sonst 404; Querverweise beide Richtungen). **Liste** (`betreiberSeite.ts`/`betreiberRoutes.ts`): KPIs (Kunden/Test/Blockiert/Angebote gesamt + 7 Tage), Filter (alle/kunden/test/blockiert/inaktiv 7+ Tage), Tabelle mit Mitglied-seit, Angebotszahl, letzter Aktivität, Freimonaten, Status-Badge; Nutzung über zwei `groupBy` (kein N+1). **Detail:** Usage-Kacheln (**versandbereit** = keine offenen Preise + nicht versendet, **offene Preise** = `anzahlOffen>0`, **versendet** = `versendetAm`), letzte 15 Angebote mit Status, geworbene Kollegen, Admin-Protokoll. **Aktionen** (JSON-POST, Ergebnis inline): Kontakt ändern (Nummer 6–16 Ziffern + Eindeutigkeitsprüfung mit 409, E-Mail-Format), Blockieren mit Grund / Entsperren, Gutschrift 1–12 Freimonate mit Pflicht-Grund (increment auf `freimonate`), **Löschen mit Firmennamen-Bestätigung** → DSGVO-Kaskade in EINER Transaktion (Gewährleistung→Dokumente→Vorgänge→Feedback→Empfehlungen→Preisgedächtnis→Importe→Handwerker; Logo-Datei best-effort; **Events bleiben** als PII-freie Metriken, **AdminLog bleibt** als Nachweis). Schema: `Handwerker.blockiert/blockiertGrund/blockiertAm` + Model **`AdminLog`** (aktion/handwerkerId/betrieb/detail, bewusst ohne Relation — übersteht Löschung); **Pipeline:** blockierte Nummer → „⏸️ Konto pausiert…" ohne Verarbeitung/API-Kosten (+ Event `NACHRICHT_BLOCKIERT`). Registriert in `server.ts` + `devServer.ts` (Dev-Link in Konsole). **93 Tests grün (9 neu), Typecheck grün; Liste/Detail/alle Aktionen + Fehlerfälle Ende-zu-Ende im Browser verifiziert.** Stufe 2 (geplant): Abo-Modell + Buchungs-Ledger → MRR/Kundenumsatz/Gesamtumsatz; Stufe 3: API-Kosten je Kunde, Alarme. **Windows-Falle:** laufender `dev:editor` sperrt die Prisma-Engine-DLL → vor `db push`/`generate` beenden.
>
> **Update 11.08.2026 — Landingpage-Screenshots, Mobil-Feinschliff Cockpit/Einstellungen, WhatsApp-Bestätigungen (alles LIVE, VPS + IONOS):**
> - **Landingpage (`marketing/`, → IONOS, hochgeladen):** Screenshot-Sektion „Handy oder Büro" komplett neu — **echte Screenshots** (statt CSS-Attrappen) in Geräterahmen mit **fester Höhe + Innen-Scroll** (gelbe Scrollbar + wippende „↕ scrollen"-Pille + Verlauf; Pille verschwindet unten/wenn nichts scrollt). **Handys zuerst, Tablet danach**, **gelbe Fluss-Pfeile** zwischen den Handys (→/↓). **Einheitliche schwarze Statusleiste „9:41"** (CSS) oben auf jedem Handy; die echten OS-Leisten sind bei den Bild-JPGs oben **weggeschnitten**. **PDF-Handy: Klick öffnet die echte PDF** (`angebot-beispiel.pdf`) im neuen Tab, nicht mehr der Screenshot (Handler `[data-pdf]`→`window.open`; die A4-Lightbox `[data-zoom]` im Hero-Demo bleibt). **Bilder komprimiert** (System.Drawing/PowerShell, `scratchpad/kompress.ps1`): ~3,7 MB → ~0,9 MB (`shot-whatsapp.jpg` 209 KB, `shot-editor.jpg` 293 KB, `shot-pdf.jpg` 78 KB, `shot-tablet.png` 308 KB). Quellen (unkomprimiert) in `voiceprotokoll-guard/Screenshots/`.
> - **Hero-Animation mobil gefixt:** `chat-animation.html` `.chat` war `width:410px` (fix) → rechtsbündig → links abgeschnitten. Jetzt `width:100%;max-width:410px` → passt. Demo-Block war schon mittig (Flex-Umbau); der abgeschnittene Screenshot war die alte Live-Version.
> - **Cockpit mobil (`cockpitSeite.ts`, `navigation.ts`):** KPI-Kacheln als **2×2-Quartett** (`@media 640`); Angebotsliste als echtes **Karten-Layout** (`.dtable`/tbody `display:block` unter 720px) → Versand-/Papierkorb-Symbol **voll sichtbar**, kein Quer-Scrollen mehr.
> - **Einstellungen mobil (`einstellungenSeite.ts`):** Live-Vorschau als **fixes, scrollbares Panel unten** (`@media 760`, 44vh, sticky „LIVE-VORSCHAU"); Einstellungen scrollen darüber, Vorschau bleibt immer sichtbar. Kopfleiste deckt die **volle Breite** ab (kein Durchblitzen der Vorschau darüber); **Tippen auf die Kopfleiste klappt die Vorschau auf/zu** (Chevron, `.settings-layout.vorschau-zu` → Panel 52 px). Im `dev:editor` verifiziert (Kopf l=0/w=voll; zu=52 px).
> - **WhatsApp: Bestätigung an JEDEM Schritt (`pipeline.ts`)** — behebt „wirkt eingefroren". (1) **Textnachrichten** bekommen vor der KI-Auswertung eine Eingangsbestätigung („👍 Hab ich! …"; nach gezeigter Zusammenfassung „⏳ Super, ich stelle dein Angebot jetzt fertig …"). (2) **Sprach-/Foto-Bestätigung kontextabhängig**: offener Dialog (Rückfrage-Antwort) → neutral „…ich arbeite im Hintergrund weiter", sonst „…ich erstelle dein Angebot". Dafür wird der offene Vorgang **einmal vor der Transkription** geladen und unten weitergenutzt.
> - **„Dein Logo"** statt „Ihr Logo" (Editor-Platzhalter, du-Form) + **Gedankenstrich-Bereinigung** in allen sichtbaren Texten (Komma/Punkt statt — / –, Titel-Trenner „·"); Code-Kommentare, Leer-Zellen-Marker „—" und die KI-Prompt-Regel „KEINE GEDANKENSTRICHE" bewusst unberührt.
> - **Kürzere WhatsApp-Links (Bearbeiten-Link):** Editor-Token **26 → 12 Zeichen** (`erzeugeKurzToken` in `tokens.ts`) **nur** für den Bearbeiten-Link — vertretbar, weil die **Zugangs-Schleuse** (Handynummer) den Editor ohnehin schützt; Einstellungen-/Cockpit-Token bleiben 26 (vertraute Tür ohne Schleuse). Zusätzlich **„/a/" weg**: Editor hört jetzt auf **`/:token`** (Wurzel, neue Angebote) UND weiter auf `/a/:token` (alte, schon verschickte Links) — ein Handler `editorAnzeigen`, beide Pfade (`routes.ts`); statische Routen `/testen`,`/health` behalten Vorrang, `/:token` verschluckt nichts. `bearbeitenLink` → `${basisUrl()}/${token}`; Schleuse leitet nach Erfolg auf `/${token}`. Ergebnis: `api.auftragsboss.de/k7m3rq9x2p8h` statt `…/a/733kayht7j2burwxakeh5tzgup`. Routen live im dev:editor geprüft. **Nur neue Angebote** bekommen kurze Token; alte Links bleiben gültig.
> - **Landingpage Conversion-Umbau** (`marketing/index.html`, nach ChatGPT-Analyse, Variante 1): neue Info-Architektur, CI/Animation/Links unberührt. NEU: **4-Differenzierer-Strip** direkt nach Hero; Maler-Sektion geschärft (Überschrift „Es hört nicht nur zu. Es versteht, worum es geht." + Erklärtext + 3 Mini-Nutzen, Vergleich bleibt); **„Nicht irgendein Angebot. Deins."** (3-Schritt Altangebots-Import); **„Betriebliches Gedächtnis"** (ehrlich = Preisgedächtnis/Vorschlag, du entscheidest); **„Nichts lernen. Einfach WhatsApp."**; FAQ +3 (Maler/Import optional/Preise als Vorschlag). VERSCHOBEN: „Wer zuerst anbietet" (Studien) von oben nach unten; Vertrauen vor Preise. ENTFERNT: 4 generische Kacheln (Inhalt lebt in Differenzierern/WhatsApp-Sektion). Hero-Text verbessert (Foto + „lernt deinen Stil"). Demo-Beispiel Familie Berg/Laminat → **Herr Schmidt/Malerauftrag** (echte Maler-Positionen + Summen). **Bewusst NICHT behauptet:** dass die KI Struktur-Gewohnheiten automatisch anwendet (nur Preisgedächtnis ist real). Bug gefixt: tote alte `.steps`-CSS überschrieb neuen 3-Schritt-Grid → entfernt. Backup: `voiceprotokoll-guard/index.html.bak-landingpage-20260811` (außerhalb `marketing/`). Live Desktop+Mobil geprüft (kein Overflow, keine Konsolenfehler). **⏳ Dirk: `index.html` bei IONOS hochladen; echte Screenshots zeigen noch Bodenauftrag → später gegen Maler-Aufnahmen tauschen (nur 4 Bilddateien).**
> - **75 Tests grün, Typecheck grün. Deploy 11.08.: VPS `pm2 restart` durch (online), IONOS-Upload durch, Landingpage von Dirk bestätigt.** Kein `prisma db push` nötig. (Cockpit/Einstellungen-Mobil-Feinschliff + Link-Kürzung als spätere Server-Deploys am selben Tag.)
>
> **Update 10.08.2026 (abends) — Offsite-Backup live, Nutzungs-Analyse + Feedback-Nudge:**
> - ✅ **Offsite-Backup LIVE:** IONOS Object Storage (Bucket `auftragsboss-backup`, eu-central-3 Berlin),
>   rclone-Remote `offsite`, AES-256-verschlüsselt, Passwort in `/root/backup-passphrase.txt` **+ 1Password**.
>   `scripts/backup.sh` → `/root/backup-auftragsboss.sh` (Cron 03:15 nutzt es), Testlauf ok. Jede Nacht eine
>   verschlüsselte Kopie außer Haus, 30 Tage. Wiederherstellen: `scripts/OFFSITE-BACKUP-EINRICHTEN.md`.
> - ✅ **Selbst-Registrierung live verifiziert** (Browser-Check `/registrieren/test123` → „Link ungültig").
> - ✅ **KI-Kennzeichnung (EU AI Act) war schon da** — WhatsApp-Erstkontakt (Test + Betrieb) nennt „KI-gestützter
>   Dienst" **vor** jeder Verarbeitung (pipeline.ts); nichts zu bauen.
> - 🆕 **Nutzungs-Analyse (PII-frei, berechtigtes Interesse, Datenschutz §6.4):** erweitertes Event-Tracking im
>   bestehenden `Event`-Modell (**kein Schema-Umbau**, dataJson flexibel). Neu: `NACHRICHT_EMPFANGEN` (Kanal
>   Sprache/Text/Foto), `LINK_GEOEFFNET` (Ziel editor/cockpit + Gerät Handy/Desktop aus User-Agent), `EXPORT`
>   (pdf/word), plus bestehende `ANGEBOT_ERSTELLT`/`RUECKFRAGE`. Geräte-Helfer `geraetAusUA` in `analytics/event.ts`.
>   Auswertungs-Dashboard bewusst SPÄTER (erst Daten sammeln).
> - 🆕 **Feedback-Nudge im Chat:** einmalig **nach dem 2. Angebot**, **nur echte (Nicht-Test-)Betriebe**
>   (merkt sich's über ein `FEEDBACK_NUDGE`-Event, kein Schema-Umbau). Bittet um kurze Sprach-/Text-Rückmeldung;
>   setzt `feedbackWartetSeit`. **Sicherheit:** Längen-Check (`FEEDBACK_MAX_LEN=400`) — kurze Nachricht =
>   Feedback, langes Diktat bleibt ein **Auftrag** (wird NIE „verschluckt"), für Sprache UND Text. `FEEDBACK_ERHALTEN`-Event.
> - 🆕 **PLZ-Lookup im Editor** (`FEATURE_PLZ_LOOKUP`, Standard AUS): Knopf „🔍 PLZ" am Feld „PLZ und Ort"
>   sucht per **OpenPLZ** (openplzapi.org, EU/DE, kostenlos) die PLZ aus Straße + Ort. **Serverseitig**
>   (`GET /api/plz`, `src/betrieb/plzLookup.ts`) — Kundenadresse geht über unseren Server, nicht direkt aus
>   dem Browser; nur Straße+Ort, kein Name. Wichtig: OpenPLZ speichert Straßen **abgekürzt** („Hauptstr.")
>   und matcht `name` als **Präfix** → wir kürzen „…straße/…strasse" → „…str" (sonst 0 Treffer). Fallback
>   „nur Straße + nach Ort filtern". Fehlertolerant (kein Treffer → Nutzer tippt selbst). Live verifiziert
>   (Berlin/München/Heidelberg). **⚠️ Vor dem Scharfschalten:** OpenPLZ-Hinweis in `datenschutz.html` ergänzen.
> - **75 Tests grün, Typecheck grün.** ✅ **Alles deployt (10.08. abends):** Analyse + Feedback-Nudge live;
>   PLZ-Lookup deployt **und** `FEATURE_PLZ_LOOKUP=true` gesetzt, im Editor live verifiziert (Knopf ergänzt PLZ).
>   Datenschutzerklärung um **§10.4 (OpenPLZ)** ergänzt, „Stand" 10.08. → **Dirk lädt `marketing/datenschutz.html`
>   noch bei IONOS hoch** (falls nicht schon geschehen). Kein `prisma db push` nötig gewesen.
>
> **Update 10.08.2026 — 🚀 ÖFFENTLICH LIVE: Produktionsnummer eingebunden, fremde Nummer bestätigt:**
> - **Meta-Firmenverifizierung durch, Produktionsnummer +49 174 9364823 im Server eingebunden:**
>   `WHATSAPP_PHONE_NUMBER_ID=1186887661184567` in Server-`.env` gesetzt (alte US-Test-ID ersetzt),
>   `pm2 restart auftragsboss`. Webhooks der Produktions-WABA (`1680177866376806`) empfangen (POST
>   `/webhook/whatsapp` → 200).
> - ✅ **Erster End-to-End-Durchstich über die ECHTE Nummer erfolgreich:** Sprachnachricht → Rückfrage
>   (Runde 1) → **Angebot ANG-2026-0006 für „Beer GmbH" erstellt** und an Dirks Handy zugestellt.
> - ✅ **ÖFFENTLICH LIVE BESTÄTIGT:** Ein **Freund mit fremder, NICHT registrierter Nummer** hat komplett
>   durchgetestet — Rückfrage empfangen UND beantwortet, **Angebot ANG-2026-0001 erstellt**, Bearbeiten-
>   Link geöffnet (`GET /a/… → 200`). Ausgehende Nachrichten erreichen also beliebige Nummern → die
>   `131030`-Test-Modus-Sperre ist weg. **Zahlungsmethode (Weg A) war der entscheidende Schritt.**
> - **131030 trat anfangs auf** (Nummer im Test-Modus), nach Hinterlegen der **Zahlungsmethode** verschwunden.
> - **Alt-Logzeilen sind Altlasten, kein aktueller Fehler:** `P2025` an `pipeline.ts:256` und die zwei
>   `131030` mit **identischen `fbtrace_id`s** (`AWOi82…`, `A8GU…`) stehen in JEDEM Log-Dump — sie stammen
>   aus früheren Läufen (PM2-error.log sammelt über Neustarts). Die heutigen Testläufe waren sauber.
> - **Deployter Code ist ÄLTER als der lokale Stand:** Fehler-Stacktrace zeigt `nachfragen`-Block bei
>   `pipeline.ts:253`/plain `update`, lokal liegt er bei ~294 mit `updateMany`. Der Server läuft also NICHT
>   den neuesten lokalen Code (09.08-Features wie Selbst-Registrierung/Import evtl. nicht/teilweise live).
>   → Vor einem Voll-Redeploy auf Prod: bewusst prüfen (untestete Flags, `prisma db push`), nicht beiläufig.
> - **Display-Name klargestellt:** Feld bleibt **„AuftragsBoss"**. Den Firmenzusatz „von DAG Deutsche
>   Automotive GmbH" hängt WhatsApp selbst an (Echtheitskennzeichen unverifizierter Konten). Manuell den
>   langen Namen eintragen → **„Abgelehnt"**. Sauberes „AuftragsBoss ✔️" nur via Antrag „Offizielles
>   Unternehmenskonto" (blauer Haken, freiwillig, nicht nötig).
> - **QR-Code-Entscheidung:** **KEIN QR-Code auf der Website** (bewusst so entschieden). `index.html` wurde
>   NICHT verändert. Es liegen nur zwei **ungenutzte, nirgends verlinkte** Standalone-Dateien im Ordner:
>   `marketing/auftragsboss-qr.png` (1024², ECC M) + `.svg`, Inhalt `wa.me/491749364823?text=…kostenlos ein
>   Angebot testen.` — evtl. später für Offline/Print (Flyer/Fahrzeug). Erzeugt mit `qrcode` (npm), lokal.
> - **⏳ OFFEN (Dirk):** (1) **Landingpage bei IONOS hochladen:** `marketing/index.html` hat lokal schon die
>   echte Nummer `wa.me/491749364823` (Buttons Zeile 406 + 644), muss nur noch in den IONOS-Webroot `public`
>   (wie beim letzten Website-Deploy). (2) Optionaler kleiner Robustheits-Fix beim nächsten geplanten Deploy:
>   `pipeline.ts`-`update`→`updateMany` (P2025). (3) Optional: Meta-Zahlungsmethode „Indien" ist irrelevant
>   (WhatsApp-Pay, nur IN/BR) — nicht die API-Abrechnung; die wurde separat hinterlegt (= Weg A, wirkte).
> - **Nebenbei verifiziert:** Der Sicherheits-Hook (`.claude/hooks/guard.cjs` + `settings.json`,
>   „auto"-Modus) greift auch in der **Desktop-App** auf dem Zweitrechner (`sudo echo test` → blockiert).

> **Update 09.08.2026 (abends) — Selbst-Registrierung (Betriebe melden sich selbst an):**
> - **WhatsApp-first Upgrade, sicher gegen Nummern-Kaperung:** Ein unbekannter Absender wird wie
>   gehabt Test-Konto (Nummer damit **verifiziert**). Schreibt er **„anmelden"/„registrieren"**,
>   bekommt er seinen persönlichen Link `…/registrieren/<einstellungenToken>` (verbraucht **kein**
>   Test-Kontingent). Formular (Firma/Ansprechpartner/E-Mail) → Test-Konto wird **echter Betrieb**
>   (`istTest=false`, Nummer + Verlauf bleiben). Bestätigung per **E-Mail** (mit Einstellungs-Link) +
>   **WhatsApp** (best effort) + **Team-Mail** an `TEAM_MAIL` (Default `kontakt@auftragsboss.de`).
> - **Anmelde-Link an zwei starken Stellen:** im **Willkommenstext** des Tests und in der
>   **„Gratis-Tests aufgebraucht"**-Nachricht (statt „melde dich beim Team").
> - **Kein Schema-Umbau** (kein `prisma db push`): der vorhandene `einstellungenToken` ist der
>   Anmelde-Token. **Hinter Flag `FEATURE_SELBSTREGISTRIERUNG` (Standard AUS).**
> - Neue Dateien: `src/web/registrierungSeite.ts`, `src/web/registrierungRoutes.ts`
>   (GET `/registrieren/:token`, POST `/api/registrieren/:token`, in `server.ts` registriert);
>   `tokens.ts` (`registrierLink`); `pipeline.ts` (`willAnmelden` + Stichwort-Handling + Willkommens-
>   Hinweis); `direkttest.ts` (Anmelde-Link bei aufgebrauchtem Kontingent); `config.ts` (Flag).
>   **Typecheck grün, 72 Tests grün.**
> - **⏳ OFFEN (Dirk):** `FEATURE_SELBSTREGISTRIERUNG=true` (optional `TEAM_MAIL=…`) in die Server-
>   `.env`, dann Deploy + `pm2 restart`. Kein `prisma db push` nötig. Noch nicht live getestet.
>
> **Update 09.08.2026 — Zugangs-Schleuse (E-Mail-Link-Schutz), Offsite-Backup, Test-Hinweis:**
> - **Zugangs-Schleuse vor dem Editor (Stufe A / A2)** — schützt den per E-Mail weiterleitbaren
>   Bearbeiten-Link. Beim ersten Öffnen auf einem Gerät fragt eine Schleuse die **Handynummer** ab,
>   vergleicht sie mit `Handwerker.whatsappNummer` und setzt bei Treffer ein langlebiges, signiertes
>   **httpOnly-Cookie (180 Tage)** — danach öffnet das Gerät ohne Nachfrage („nur einmal"-Hinweis auf
>   der Seite). **Test-Konten (istTest) werden nie geschleust.** Cockpit/Einstellungen (per
>   einstellungenToken) setzen das Cookie ebenfalls, damit der Cockpit-Weg reibungslos bleibt und die
>   Cockpit-Aktionen greifen. Geschützt: Editor-Seite, Export, Speichern, Versendet-Toggle, Löschen
>   (jeweils vertrautes Gerät oder istTest). Fehlversuch-Sperre (5 Versuche → 15 Min). Kein neues
>   npm-Paket (Node-`crypto`). Neue Dateien `src/web/geraetevertrauen.ts` (+ `.test.ts`),
>   `src/web/schleuseSeite.ts`; Einhängung in `web/routes.ts`. **72 Tests grün, Typecheck grün.**
>   Braucht in der Server-`.env` **`SESSION_SECRET`** (langer Zufallswert; lokal schon gesetzt) —
>   sonst überlebt das Geräte-Vertrauen keinen Neustart. **Stufe B (später):** stärkerer 2. Faktor per
>   **WhatsApp-OTP-Template** (Einmal-Code, außerhalb 24 h erlaubt) statt Nummer-Eingabe.
>   **✅ LIVE (09.08. von Dirk deployt): `SESSION_SECRET` am VPS gesetzt, Redeploy durch, im Inkognito
>   echt verifiziert (Schleuse greift, richtige Nummer öffnet, falsche blockiert, vertraute Geräte frei).**
> - **Offsite-Backup (IONOS S3) im Code fertig:** `scripts/backup.sh` verschlüsselt das Archiv
>   (AES-256, Passwort aus `/root/backup-passphrase.txt`) und lädt es per **rclone** nach IONOS Object
>   Storage (`offsite:auftragsboss-backup/daily`, 30 Tage). EU-Standort + Verschlüsselung wegen der
>   Kundendaten. Fehlt rclone/Passwort, wird der Upload sauber übersprungen (lokales Backup bleibt).
>   Anleitung: `scripts/OFFSITE-BACKUP-EINRICHTEN.md`.
> - **Test-Seite `/testen`:** Datenschutz-/KI-Hinweis am Aufnahmeknopf (Verarbeitung zur Angebots-
>   Erstellung, OpenAI/Anthropic, Audio nur im Arbeitsspeicher, Bitte-Beispieldaten, Link zur
>   Datenschutzerklärung). Bewusst **kein** Cookie-Banner-Zwang: der Zugangs-Cookie ist technisch
>   notwendig (§ 25 II TTDSG, zustimmungsfrei), die Test-Verarbeitung läuft über Art. 6 I b/f.
> - **⏳ OFFEN (Dirk):** (1) `SESSION_SECRET` in die Server-`.env` + **Redeploy** (kein `prisma db push`
>   nötig). (2) Offsite-Backup am VPS einrichten (siehe Anleitung). (3) Meta-Display-Name erneut
>   einreichen — jetzt „AuftragsBoss von DAG Deutsche Automotive GmbH".
>
> **Update 08.08.2026 (Feierabend) — Landingpage-Ausbau + komplettes Cockpit-Redesign:**
> - **Landingpage (`marketing/`, → IONOS):** Hero weiter verfeinert (2-Spalten, **runder Mikro-CTA „Jetzt live testen"** + WhatsApp-Sekundärbutton + Nummer, Chat als **handy-schmales** Produkt-Window mit warmem Glow, Ober-/Unterkante exakt zur Copy, Abschnitt zentriert). Neuer Abschnitt **„Speziell für Maler"** (Vergleich Allround-Software ✕ vs. AuftragsBoss ✓). „Einsprechen-senden-fertig"-Block **entfernt** (doppelte sich). Demo rechts = **echtes DIN-A4-Angebot mit Klick-Zoom** (Lightbox). **Tablet** im Screenshot-Abschnitt („Handy oder Büro"). **Hintergrund-Textur** (dezente Glows + kleines/großes Karo) über alle Abschnitte. **Kleines Favicon** gebaut (`favicon.ico` → Web-Root + `auftragsboss-favicon-32/180.png`) statt der 430-KB-Datei. Kleinfixes: „Keine App"-Kachel (Symbol 💬 + Border), Sprach-Blasen-Padding, „speziell auf Malerbetriebe" fett/hell.
> - **Cockpit komplett neu (moderne App-Shell):** gemeinsame Shell in **`src/web/navigation.ts`** (`appShell()` + `dashStyles()`): feste **dunkle Anthrazit-Sidebar** (AuftragsBoss-Logo oben, klickbar → Übersicht; Punkte Übersicht/Angebote/Importieren/Einstellungen), sticky **Topbar** (Kontext + Account), Mobile-Drawer. Wiederverwendbar: panel, section, stat, dtable, btn, field, badge, toolbar. **Chrome bewusst OHNE Kundenfarbe** — die Akzentfarbe (`--akzent`) erscheint NUR in der Angebotsvorschau. `cockpitSeite.ts` (Begrüßung, KPI-Zeile, Such-/Filter-Toolbar, moderne Tabelle), `einstellungenSeite.ts` (58/42 + **sticky A4-Vorschau**), `importRoutes.ts` (**Drag-&-Drop-Dropzone**) neu auf der Shell. Routen/Signaturen unverändert.
> - **Cockpit-Funktionen:** Angebote **löschen** (`POST /api/a/:token/loeschen`, räumt Gewährleistung mit ab). **„Versendet"-Status** (neues Feld **`Dokument.versendetAm`**, Toggle `POST /api/a/:token/versendet`): versendete Angebote **ausgegraut** + Badge + Filter und **schreibgeschützt** (Editor sperrt Eingaben + Banner, Speicher-Route liefert 409; **Ansehen/Export bleiben**). Aufhebbar → wieder editierbar. **Angebotsvolumen** voll ausgeschrieben/gerundet. Empfehlungs-Panel prominenter (Badge „1 Monat gratis"). **65 Tests grün.**
> - **/testen-Loop:** Code ist längst korrekt (kein Loop) — war nur **nie deployt**; verschwindet mit dem VPS-Deploy.
> - **✅ LIVE (08.08. abends, von Dirk erledigt):** VPS-Deploy (inkl. `npx prisma db push` fürs Feld `versendetAm`) **und** IONOS-Upload durch. Cockpit-Redesign, Löschen, „Versendet"-Sperre und die neue Landingpage sind live; der /testen-Loop ist damit auch weg.

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
> - **Maler-Fachwissen ins Angebot** (`src/maler/prompt.ts`, hinter `FEATURE_MALER_SCOPE`, **noch AUS** — seit
>   07.08. AN, am 26.08. in der VPS-.env erneut bestätigt): speist die
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

**Seit 10.09.2026: KEINE Schlüssel auf Dirks Rechnern** (Entscheidung „ganz wie Tyra", weil
AuftragsBoss künftig viele Kundendaten hält). Die einzige `.env` liegt auf dem Server unter
`/home/auftragsboss/app/.env` (chmod 600, im Nacht-Backup enthalten). `src/env.ts` liest nur
noch `.env` im Projektordner; die früheren Suchpfade (Dropbox, `~/.auftragsboss`) sind entfernt,
die Dropbox-Kopie ist gelöscht. Vorlage ohne Werte: `.env.example`.

**Folgen für die Arbeit:**
- Lokal laufen nur `npm test` (vitest) und `npm run dev:editor` (braucht `DATABASE_URL=file:./dev.db`,
  steht in `.claude/launch.json`). Beides ohne Schlüssel.
- **KI-Proben, Prüfstände, Skripte mit echten Aufrufen laufen auf dem Server:** Skript nach
  `/home/auftragsboss/app/scratch/` kopieren (`scp` per Windows-OpenSSH), dann
  `su - auftragsboss -c 'cd ~/app && npx tsx scratch/<name>.ts'`. Messbank-Fotos für Prüfstände bei
  Bedarf nach `/home/auftragsboss/messbank/` laden (nicht ins Repo, nicht ins Backup nötig).
- Neue `.env`-Werte NUR auf dem Server setzen, danach `pm2 restart auftragsboss`. Werte nie in
  Chat oder Notizen; Präfix-Checks wie `grep -o '^NAME=.{6}'` reichen.
- Optional (Dirk): in den Konsolen von Anthropic/OpenAI prüfen, ob es neben `auftragsboss-server`
  noch einen zweiten Schlüssel gab, der nur lokal genutzt wurde, und den sperren.
- Lokale Prisma-CLI-Befehle brauchen weiterhin `$env:DATABASE_URL="file:./dev.db"`.

Weiter gültig: Optional `ADMIN_EMAIL`/`ADMIN_PASSWORT_HASH` für /stasi, `HOST` (Standard localhost)
und `GRAPH_API_VERSION` (Standard v23.0). Dirks ursprüngliche Claude-Organisation war nur wegen
fehlendem Guthaben deaktiviert; er bleibt bei der neuen Organisation.

## Nächste Ideen (Roadmap)

- **Name entschieden: AuftragsBoss** (Domain AuftragsBoss.de). Alle kundensichtbaren
  Texte umbenannt; interner Ordner bleibt `voiceprotokoll-guard`.
- **Preismodell (Stand 31.08.2026):** 3 Stufen **29 / 79 / 149 €** netto (gesenkt von 49/99/199),
  Kontingente **50/120/300** Angebote/Monat (Dirks Entscheidung 26.08.2026 — die Landingpage-Zahlen gelten),
  Logo/Export in allen Stufen, **14 Tage kostenlos testen** (intern stiller 10-Angebote-Deckel),
  **keine Einrichtungsgebühr**. Marge weiterhin hoch (API ~5 Cent/Angebot).
  Noch offen: echte Zahlungsbereitschaft testen.
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
      **Achtung PowerShell-`tar`:** kennt **kein** `--force-local` (Fehler „Option not supported") →
      weglassen. Packen: `tar --exclude='prisma/dev.db*' -czf deploy.tar.gz src prisma knowledge package.json
      package-lock.json tsconfig.json preisliste.json`. Vorm Hochladen prüfen, dass neue Dateien drin sind:
      `tar -tzf deploy.tar.gz | findstr <dateiname>`. `SCHILY.fflags`-Warnungen beim Entpacken sind harmlos.
      Neue `.env`-Werte (z. B. `SESSION_SECRET`) NUR am Server setzen (`printf … >> /root/app/.env`), nicht
      im tar (die `.env` wird nie mitgepackt).
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
