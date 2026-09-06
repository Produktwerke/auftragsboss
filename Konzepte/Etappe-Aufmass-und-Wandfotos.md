# Etappe „Drei Zahlen und vier Fotos“: Aufmaßrechner + Wandfotos mit Sofort-Feedback

Stand 06.09.2026, zur Freigabe durch Dirk. Grundlage: Messbank-Ergebnis (Fotos erkennen Öffnungen und die VOB-Klasse zu 96 %, Wandmaße kommen vom Maler) und Produktentscheidung vom 04.09.

## Das Versprechen

„Miss wie immer, sprich die Maße, schick ein Foto pro Wand, den Rest mache ich.“

Der Maler nennt je Raum Höhe und Wandlängen (bei Rechteckräumen zwei Zahlen), schickt ein Foto je Wand, und im Angebot steht die VOB-saubere Netto-Wandfläche: Öffnungen bis 2,5 m² übermessen, größere abgezogen, alles nachvollziehbar aufgeschlüsselt. Die Fotos bleiben als Dokumentation am Vorgang.

## Ablauf aus Sicht des Malers

1. **Sprachnachricht wie bisher**, jetzt mit Raummaßen: „Wohnzimmer, Höhe 2,52, 4,49 mal 4,36, Wände und Decke streichen. Küche, Höhe 2,49, Wände 10,38 und 3,20 und 5,10, nur Wände.“ Rechteck = zwei Zahlen, sonst alle Wandlängen einzeln.
2. **Ein Foto je Wand**, direkt im selben Chat, in beliebiger Reihenfolge. Wände, die nicht gestrichen werden (Schrankwand), werden einfach nicht fotografiert. Optional als Bildunterschrift „Wohnzimmer Wand 2“; ohne Unterschrift gehört das Foto zum zuletzt genannten Raum.
3. **Sofort-Antwort zu jedem Foto** (Sekunden, keine Knöpfe nötig):
   - „✅ Wohnzimmer, Wand 1: Fenster erkannt (ca. 1,1 × 1,2 m, wird übermessen).“
   - „✅ Wand 2: Fenstertür erkannt (ca. 1,7 × 2,2 m = 3,7 m², wird abgezogen).“
   - „⚠️ Wand 3: Tür steht offen, bitte schließen und nochmal fotografieren.“
   - „⚠️ Foto zu dunkel / Wand nicht ganz im Bild, bitte einen Schritt zurück.“
4. **Eine einzige Rückfrage-Art**: liegt eine Öffnung rechnerisch in der Grauzone (2,2 bis 2,8 m²), fragt die App einmal: „Das Fenster in Wand 2 liegt nah an der 2,5-m²-Grenze. Miss kurz Breite und Höhe nach?“ Antwort per Sprache oder Text. Alles andere läuft ohne Rückfrage.
5. **Nach dem letzten Foto** (oder wenn der Maler „fertig“ sagt) kommt wie heute Zusammenfassung bzw. Angebotsentwurf mit Editor-Link. Neu darin: je Raum eine Aufmaßzeile „Wohnzimmer: 44,6 m² brutto, 1 Fenstertür abgezogen (3,7 m²), 2 Öffnungen übermessen, netto 40,9 m²“.

Wenn der Maler keine Fotos schickt, funktioniert alles trotzdem: dann Bruttofläche ohne Abzüge, mit Hinweis „keine Öffnungen erfasst“.

## Was gebaut wird (drei Teiletappen)

### Teiletappe 1: Aufmaßrechner aus drei Zahlen (ohne Fotos)

- **Neues reines Rechenmodul** `src/maler/aufmass.ts` (mit Tests): Eingabe je Raum Höhe, Wandlängen, Decke ja/nein, Öffnungen (Breite × Höhe); Ausgabe Brutto, Abzug, Netto, Deckenfläche und ein lesbarer Erklärtext. VOB-Regel: Öffnungen bis 2,5 m² übermessen, darüber abziehen; Fensterbänke/Laibungen kommen später.
- **Sprach-Extraktion**: das Protokoll-Schema (`src/ai/structure.ts`) bekommt einen Block `raeume` (Name, Höhe, Wandlängen, Decke, was gestrichen wird). Die KI darf weiterhin nichts rechnen, sie liest nur Zahlen aus. Fehlt eine Zahl, wird sie wie heute nachgefragt (bestehende Rückfragelogik, Regel `ask_flaeche_pflicht` wird dadurch meist überflüssig).
- **Berechnung**: die Position „Wandflächen streichen, Wohnzimmer“ bekommt die Menge aus dem Rechenmodul, Preis wie heute aus Preisgedächtnis oder Diktat. Herkunft wird markiert (neue Preisquelle-Art „AUFMASS“), damit im Editor sichtbar bleibt, dass die Zahl gerechnet ist.
- Ergebnis nach Teiletappe 1: „Drei Zahlen, fertige m²“ funktioniert schon ohne ein einziges Foto.

### Teiletappe 2: Wandfotos mit Sofort-Feedback und Öffnungserkennung

- **Foto-Weiche**: heute wird jedes Bild als Notizzettel gelesen. Neu entscheidet ein kurzer Vision-Aufruf: Wandfoto oder Notiz/Screenshot. Notizzettel laufen wie bisher.
- **Wandfoto-Analyse** (ein Vision-Aufruf je Foto, Kosten ca. 1 bis 2 Cent): Ergebnis als festes Formular: Wand komplett im Bild ja/nein, Helligkeit ok, Öffnungen (Art, offen/geschlossen, geschätzte Breite × Höhe in Metern mit der bekannten Raumhöhe als Maßstab), Besonderheiten (Lambris, Fliesenspiegel, Heizkörper). Genau diese Schätzung hat die Messbank mit 96 % richtiger VOB-Klasse belegt.
- **Sofort-Antwort** als Text in WhatsApp (bestehende Sendefunktion), Nachfassbitte bei offener Tür, Dunkelheit, abgeschnittener Wand.
- **Zuordnung**: Bildunterschrift, sonst zuletzt genannter Raum; Wandnummer in Reihenfolge des Eingangs. Der Maler kann jederzeit per Text korrigieren („das war Küche“).
- **Grauzonen-Rückfrage** 2,2 bis 2,8 m² wie oben. Maximal eine Rückfrage je Öffnung, gezählt außerhalb der heutigen Zwei-Runden-Grenze des Dialogs, weil sie kein KI-Dialog ist, sondern eine feste Frage.
- **Foto-Ablage**: neues Datenbankmodell `Foto` (Vorgang, Raum, Wandnummer, Datei, Erkennungsergebnis, Zeitpunkt) und Ablage unter `uploads/fotos/<Betrieb>/<Vorgang>/`. Wird beim DSGVO-Löschen des Betriebs mitgelöscht, ist im Nacht-Backup enthalten (uploads/ wird bereits gesichert). Vorschlag Aufbewahrung: solange das Dokument existiert.
- **Kosten** laufen wie alle KI-Aufrufe ins Betreiber-Cockpit.

### Teiletappe 3: Aufmaßblatt und Feinheiten

- Aufmaßblatt als Anhang im Word-Angebot: je Raum Maße, Öffnungen mit Behandlung, Fotos als Belegbilder.
- Sonderfälle: halbhohe Flächen (Lambris, Fliesenspiegel: nur oberer Teil), Dachschrägen, Decke separat, Laibungen.
- Fotos im Editor sichtbar, Erkennung dort korrigierbar.

## Absichtlich nicht enthalten

- Kein Messen von Wandbreiten aus Fotos (Messbank-Ergebnis).
- Keine Endkunden-Variante (WhatsApp-Link, geführte Foto-Website): notiert, kommt nach dem Maler-Flow.
- Keine Knöpfe im Foto-Feedback: Text reicht, weniger Reibung.

## Messbank als Prüfstand

Die 42 Messbank-Fotos mit den 39 vermessenen Öffnungen werden zum automatischen Test für die Öffnungserkennung: Erkennungsrate, VOB-Klasse, Flächenfehler. Ziel vor Freischaltung: Klassifikation ≥ 95 %, keine erfundenen Öffnungen, Grauzonen-Fälle korrekt zur Rückfrage.

## Entscheidungen, die ich getroffen habe (bitte Einspruch, falls anders gewünscht)

1. Türen bis 2,5 m² werden ohne Rückfrage übermessen (VOB-Standard). Wer abziehen will, sagt es per Sprache.
2. Decke wird nur berechnet, wenn der Maler sie nennt („Wände und Decke“).
3. Fotos ohne Bildunterschrift gehören zum zuletzt genannten Raum.
4. Reihenfolge: erst Teiletappe 1 (reiner Rechner, sofort nützlich, risikofrei), dann 2, dann 3.

## Aufwand

Teiletappe 1 etwa eine Session, Teiletappe 2 zwei bis drei Sessions inklusive Messbank-Prüfstand, Teiletappe 3 eine bis zwei Sessions. Deploy nach jeder Teiletappe wie gewohnt, mit Live-Test über deine Testnummer.
