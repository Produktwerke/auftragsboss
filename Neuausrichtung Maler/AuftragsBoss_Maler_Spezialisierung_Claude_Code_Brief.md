# AuftragsBoss – Neuausrichtung auf Maler- und Lackiererbetriebe
## Masterbriefing für Claude Code

**Zweck dieser Datei:**  
Diese Datei ist die verbindliche Produkt-, Architektur-, UX-, Daten- und Marketingvorgabe für den Umbau von AuftragsBoss. Claude Code soll zunächst das bestehende Repository analysieren, daraus einen konkreten Migrations- und Implementierungsplan ableiten und anschließend die priorisierten Änderungen schrittweise umsetzen.

---

# 1. Ausgangslage

AuftragsBoss ist ein B2B-SaaS für kleine Handwerksbetriebe. Der bestehende Kernprozess funktioniert bereits:

1. Ein Handwerker sendet nach einem Kundentermin eine WhatsApp-Sprachnachricht.
2. Zwei KI-Modelle transkribieren parallel.
3. Eine weitere KI strukturiert daraus ein Angebot.
4. Fehlende Angaben werden automatisch per WhatsApp nachgefragt.
5. Der Nutzer erhält einen Link zu einem mobilen Webeditor.
6. Preise, Positionen und Texte können angepasst werden.
7. Das Angebot kann als PDF oder Word exportiert werden.
8. Nachträge können erneut per Sprachnachricht ergänzt werden.
9. Logo, Briefkopf, Standardtexte, Materialvorschläge, Feedback und eine interne Auswertung von KI-Original gegen finales Angebot existieren bereits.

Wichtige bestehende Produktprinzipien:

- keine App
- kein Login
- keine Installation
- Identität über WhatsApp-Nummer
- mobil nutzbar
- eigener Briefkopf und eigenes Logo
- PDF- und Word-Export
- automatische Rückfragen
- Nachträge per Sprache
- drei kostenlose Testangebote
- Preise werden niemals von der KI erfunden
- nur ausdrücklich genannte oder vom Betrieb hinterlegte Preise dürfen verwendet werden
- unbekannte Preise bleiben leer

---

# 2. Strategische Neuausrichtung

AuftragsBoss soll nicht mehr als generische „KI-Angebotssoftware für alle Handwerker“ entwickelt und vermarktet werden.

Die neue strategische Ausrichtung lautet:

> **AuftragsBoss wird zunächst zur spezialisierten Angebots- und Wissensplattform für Maler- und Lackiererbetriebe.**

Der erste Produktfokus ist noch enger:

> **Renovierungsangebote für Innenräume von Malerbetrieben.**

Die Spezialisierung ist kein reines Marketingetikett. Sie muss tief in Datenmodell, Rückfragen, Positionslogik, Wissensbasis, Onboarding, Editor, Qualitätsprüfung und Website verankert werden.

Die langfristige Positionierung lautet:

> **AuftragsBoss versteht nicht nur Sprache. AuftragsBoss versteht, wie ein Malerbetrieb Angebote erstellt.**

Die stärkste Differenzierung entsteht aus der Verbindung von:

1. gewerkspezifischem Malerwissen,
2. kundenspezifischem Lernen aus alten Angeboten,
3. kontinuierlichem Lernen aus späteren Korrekturen,
4. vollständiger Nachvollziehbarkeit jeder vorgeschlagenen Position, Menge und jedes Preises,
5. Nutzung ohne App und ohne Login über WhatsApp.

---

# 3. Zielgruppe der ersten Produktversion

Primäre Zielgruppe:

- Maler- und Lackiererbetriebe in Deutschland
- ungefähr 1 bis 15 Mitarbeiter
- ideal zunächst 2 bis 8 Mitarbeiter
- inhabergeführt
- Inhaber arbeitet teilweise selbst auf Baustellen
- kein vollwertiges Angebots- oder Kalkulationsteam
- Angebote werden häufig abends oder am Wochenende erstellt
- WhatsApp wird täglich verwendet
- Word, Excel, Papiernotizen oder einfache Handwerkersoftware sind üblich
- Schwerpunkt zunächst Privatkunden, Hausverwaltungen und kleinere Gewerbekunden
- häufige Innenrenovierungsangebote

Nicht primär für Version 1:

- große Betriebe mit komplexem ERP
- öffentliche Ausschreibungen und GAEB-zentrierte Prozesse
- umfangreiche Fassadensanierungen
- WDVS
- Korrosionsschutz
- Betoninstandsetzung
- Brandschutzbeschichtungen
- Denkmalpflege
- Bodenbeschichtungen
- Schimmel- und Schadstoffsanierung
- industrielle Lackierprozesse

Diese Bereiche dürfen später ergänzt werden, sollen aber die erste Architektur nicht unnötig verkomplizieren.

---

# 4. Neues Kernversprechen

Die bisherige Aussage „Diktieren statt tippen“ bleibt verständlich, ist aber allein nicht mehr ausreichend differenzierend.

Neue Kernbotschaft:

> **Das Angebot ist fertig, bevor Sie vom Hof fahren. Ihre Preise bleiben Ihre Preise.**

Zusätzliche differenzierende Botschaft:

> **Laden Sie Ihre bisherigen Angebote hoch. AuftragsBoss erstellt neue Angebote von Anfang an im Stil Ihres Betriebs.**

Mögliche Website-Hauptaussage:

> **Ihre Angebote. Ihr Stil. Ihre Preise. Nur nicht mehr selbst getippt.**

Alternative:

> **20 alte Angebote hochladen. Danach schreibt AuftragsBoss wie Ihr Betrieb.**

Wichtig: Es darf nicht behauptet werden, die KI könne vollständig autonom, fehlerfrei oder rechtssicher kalkulieren. AuftragsBoss erstellt einen kontrollierbaren Entwurf, fragt bei fehlenden Angaben nach und markiert Unsicherheiten.

---

# 5. Der tatsächliche Produktvorteil

Der Upload alter Angebote ist nur die Oberfläche. Der eigentliche Wettbewerbsvorteil ist ein strukturiertes, isoliertes Betriebsprofil.

AuftragsBoss soll aus alten Angeboten nicht nur Textstil übernehmen, sondern folgende Kategorien erkennen:

## 5.1 Dokumentstil

- Gliederung
- Überschriften
- Positionierungslogik
- Nummerierung
- Länge der Leistungsbeschreibungen
- Einleitung
- Schlussformulierung
- Zahlungsbedingungen
- Gültigkeitsdauer
- Ausschluss- und Hinweistexte
- Darstellung von Material und Arbeitsleistung
- Netto-/Brutto-Darstellung
- bevorzugte Reihenfolge von Leistungen

## 5.2 Betriebseigene Leistungsbibliothek

- häufig verwendete Positionen
- eigene Positionstitel
- eigene Leistungsbeschreibungen
- typische Einheiten
- typische Kombinationen von Positionen
- Pauschal- oder Mengenpositionen
- betriebliche Standardtexte
- kundenspezifische Varianten
- bevorzugte Materialbezeichnungen
- eigene Kalkulationsstruktur

## 5.3 Entscheidungslogik

Beispiele:

- Bei möblierten Räumen wird häufig eine separate Abdeckposition verwendet.
- Bei Tapetenentfernung wird Entsorgung häufig separat ausgewiesen.
- Bei starkem Farbwechsel werden mehrere Beschichtungsarbeitsgänge berücksichtigt.
- Fensterlaibungen werden je nach Betrieb separat oder innerhalb der Wandfläche behandelt.
- Zargen, Sockelleisten oder Heizkörper werden nicht automatisch als enthalten angenommen.
- Bei unbekanntem oder schadhaftem Untergrund wird eine Rückfrage ausgelöst.
- Material ist je nach Betrieb enthalten, separat oder kundenseitig gestellt.
- Bestimmte Nebenleistungen werden regelmäßig ergänzt.

AuftragsBoss darf solche Muster nicht blind als Wahrheit übernehmen. Es soll daraus bestätigbare Regeln erzeugen:

> „In 14 von 17 ähnlichen Angeboten wurde bei möblierten Räumen eine separate Abdeckposition verwendet. Soll AuftragsBoss diese künftig automatisch vorschlagen?“

---

# 6. Drei strikt getrennte Lernebenen

## 6.1 Allgemeines Sprachmodell

Aufgaben:

- Sprache verstehen
- Transkription interpretieren
- Informationen extrahieren
- Texte natürlich formulieren
- Rückfragen verständlich stellen

Das allgemeine Sprachmodell darf nicht die alleinige Quelle fachlicher Entscheidungen sein.

## 6.2 Gewerkspezifische Maler-Fachengine

Aufgaben:

- typische Auftragssituationen erkennen
- relevante Angaben definieren
- fachlich sinnvolle Rückfragen bestimmen
- mögliche Positionstypen vorschlagen
- unzulässige Annahmen verhindern
- Widersprüche erkennen
- malerspezifische Begriffe und Zusammenhänge modellieren

Diese Wissensbasis gilt gewerksweit, darf aber keine individuellen Kundendaten, Preise oder Textbausteine anderer Betriebe offenlegen.

## 6.3 Privates Betriebsprofil

Nur für den jeweiligen Betrieb:

- eigene Preise
- eigene Positionen
- eigene Formulierungen
- eigene Kalkulationslogik
- eigene Standardtexte
- eigene Materialpräferenzen
- eigene Angebotsstruktur
- eigene bestätigte Regeln
- eigene Korrekturhistorie

Betriebsprofile müssen technisch und logisch strikt voneinander getrennt sein.

---

# 7. Kein unkontrolliertes Modelltraining

Für die ersten Versionen soll kein eigenes Modell pro Kunde feinjustiert werden.

Stattdessen soll die Architektur bevorzugt auf folgenden Bausteinen beruhen:

- strukturierte Extraktion
- Dokumentenanalyse
- normalisierte Datenbank
- Retrieval
- regelbasierte Prüfung
- bestätigbare Betriebsregeln
- Vorlagenbibliothek
- Quellen- und Herkunftsnachweis
- Validator vor Ausgabe

Begründung:

- besser kontrollierbar
- nachvollziehbar
- datenschutzfreundlicher
- leichter korrigierbar
- kein verborgenes Vermischen von Betrieben
- einfacher exportierbar
- unabhängig vom eingesetzten Sprachmodell

---

# 8. Onboarding durch alte Angebote

Das neue Onboarding soll einen optionalen, aber prominenten Angebotsimport enthalten.

## 8.1 Nutzerführung

### Schritt 1: Upload

Der Nutzer kann vorzugsweise 10 bis 30 alte, finale Angebote hochladen.

Unterstützte Formate, soweit technisch realistisch:

- PDF
- DOCX
- mehrere Dateien
- ZIP
- optional gescannte PDF mit gesonderter Kennzeichnung geringerer Erkennungsqualität

### Schritt 2: Analyse

Das System analysiert:

- Briefkopf und Layout
- Dokumentstruktur
- Standardtexte
- Positionen
- Einheiten
- Preisfelder
- wiederkehrende Leistungsbausteine
- Varianten ähnlicher Positionen
- typische Kombinationen
- mögliche betriebliche Regeln
- möglicherweise veraltete Preise
- sensible Kunden- und Objektdaten

### Schritt 3: Bestätigung

Der Nutzer erhält eine einfache Zusammenfassung:

> **Das hat AuftragsBoss über Ihren Betrieb gelernt**

Beispiel:

- Sie verwenden überwiegend einzelne Leistungspositionen.
- Material ist meistens im Einheitspreis enthalten.
- Zahlungsziel: 14 Tage.
- Abdeckarbeiten werden separat ausgewiesen.
- Nicht genannte Preise bleiben leer.
- Wand- und Deckenarbeiten werden getrennt aufgeführt.
- Türen und Zargen sind nie automatisch enthalten.

Jede Regel muss bestätigbar, korrigierbar oder deaktivierbar sein.

### Schritt 4: Soforttest

Der Nutzer diktiert einen echten oder alten Auftrag. Der Entwurf wird im Stil des Betriebs erzeugt.

Die Oberfläche kann anzeigen:

> **Erstellt auf Basis Ihrer bisherigen Angebote**

---

# 9. Umgang mit Preisen

Dieses Prinzip ist absolut unverhandelbar:

> **AuftragsBoss erfindet niemals Preise.**

Zulässige Preisquellen:

1. Preis wurde in der aktuellen Sprachnachricht ausdrücklich genannt.
2. Preis stammt aus einem vom Betrieb bestätigten Preisbuch.
3. Preis stammt aus einer bestätigten Position des privaten Betriebsprofils.
4. Preis wurde im Editor manuell ergänzt und als künftiger Standard bestätigt.

Nicht zulässig:

- Schätzung aus Marktpreisen
- Übernahme aus einem anderen Betrieb
- Ableitung aus allgemeinen Trainingsdaten
- versteckte Hochrechnung ohne Bestätigung
- automatische Nutzung historischer Preise ohne Kennzeichnung ihrer Aktualität

Bei historischen Preisen muss angezeigt werden:

- Quelle
- Datum
- letztes Bestätigungsdatum
- optional Warnung „möglicherweise veraltet“

Beispiel:

> 6,80 €/m²  
> Quelle: betriebliche Position „Bodenflächen abdecken“  
> zuletzt bestätigt: 12.06.2026

Oder:

> Preis fehlt. AuftragsBoss setzt keinen Schätzwert ein.

---

# 10. Herkunftsnachweis jeder Information

Jede relevante Information soll intern eine Herkunftskategorie erhalten.

## Kategorien

### A. Explizit genannt

Beispiel: „45 Quadratmeter Wandfläche“

Darf direkt übernommen werden.

### B. Aus privatem Betriebsprofil

Beispiel: Standardzahlungsziel, bestätigte Position, freigegebener Preis.

Darf übernommen werden, muss aber intern nachvollziehbar bleiben.

### C. Fachlich vorgeschlagen

Beispiel: mögliche Abdeckposition bei möbliertem Raum.

Muss sichtbar als Vorschlag behandelt oder vom Nutzer bestätigt werden.

### D. Unbekannt

Beispiel: Zustand des Untergrunds.

Bleibt offen oder löst eine Rückfrage aus.

### E. Widersprüchlich

Beispiel: zunächst 80 m², später 120 m².

Muss zwingend geklärt werden.

Der Editor sollte diese Herkunft möglichst verständlich darstellen, ohne den Nutzer mit technischen Details zu überfordern.

---

# 11. Maler-Ontologie für Version 1

Claude Code soll ein erweiterbares, strukturiertes Datenmodell für Maleraufträge vorsehen.

## 11.1 Objektarten

- Wohnung
- Einfamilienhaus
- Mehrfamilienhaus
- einzelner Raum
- Treppenhaus
- Büro
- Ladenlokal
- Gewerbeeinheit
- Neubau
- Bestand
- bewohnt
- unbewohnt

## 11.2 Bauteile

- Wand
- Decke
- Tür
- Zarge
- Fenster
- Fensterlaibung
- Heizkörper
- Rohr
- Sockelleiste
- Treppe
- Geländer
- Nische
- Stütze
- Einbaumöbel

## 11.3 Untergründe

- vorhandene Dispersionsbeschichtung
- Raufaser
- Glattvlies
- Tapete unbekannter Art
- Gipskarton
- Innenputz
- Beton
- Holz
- Metall
- Altbeschichtung unbekannt
- nicht ausreichend beschrieben

## 11.4 Zustände

- tragfähig
- kreidend
- saugend
- verschmutzt
- fettig
- gerissen
- uneben
- schadhaft
- fleckig
- Nikotinbelastung
- Wasserflecken
- Schimmelverdacht
- unbekannt

## 11.5 Leistungen

- Baustelle einrichten
- Bodenflächen schützen
- Möbel abdecken
- Möbel bewegen
- Bauteile abkleben
- Altbelag entfernen
- Tapete entfernen
- reinigen
- Untergrund prüfen
- grundieren
- absperren
- spachteln
- schleifen
- Risse bearbeiten
- tapezieren
- Vlies kleben
- Wand beschichten
- Decke beschichten
- Türen lackieren
- Zargen lackieren
- Heizkörper lackieren
- Sockelleisten beschichten
- Material bereitstellen
- Abfall entsorgen
- Abschlussreinigung
- Anfahrt

## 11.6 Ausführungsparameter

- Fläche
- Anzahl
- Länge
- Raumhöhe
- Qualitätsstufe
- Farbton
- Farbwechsel
- Glanzgrad
- Anzahl Arbeitsgänge
- Möblierungszustand
- Zugänglichkeit
- Schutzbedarf
- Materialstellung
- Ausführungstermin
- Trocknungsbedingungen
- Kundenwunsch
- Ausführungsrisiko

Das Datenmodell muss später erweiterbar sein und darf nicht als starre Liste direkt in Prompts eingebrannt werden.

---

# 12. Rückfragenlogik

Die KI soll nicht möglichst viele Fragen stellen, sondern die wenigen wirtschaftlich und fachlich relevanten Fragen.

## Prioritätsklassen

### Stufe A: Ohne diese Angabe kein sinnvoller Entwurf

Beispiele:

- keine erkennbare Leistung
- keine Menge oder kein abgrenzbarer Umfang
- unklare Zuordnung zu Wand, Decke oder Bauteil
- widersprüchliche Mengen

### Stufe B: Kann Leistungsumfang oder Preis erheblich verändern

Beispiele:

- Zustand des Untergrunds
- Altbelag entfernen oder erhalten
- möbliert oder leer
- starker Farbwechsel
- Abdeckarbeiten enthalten oder separat
- Ausbesserungen erforderlich
- Materialstellung
- Raumhöhe
- Türen, Zargen, Heizkörper oder Sockelleisten enthalten
- Entsorgung enthalten

### Stufe C: Kann aus bestätigtem Betriebsstandard stammen

Beispiele:

- Zahlungsziel
- Gültigkeitsdauer
- Standardausschlüsse
- Angebotsstruktur
- typische Formulierung
- Standardposition „Baustelleneinrichtung“

## Beispiel für gebündelte Rückfrage

> Ich habe 45 m² Wandfläche, weißen Anstrich und ein möbliertes Wohnzimmer erfasst. Noch offen sind der Zustand des Untergrunds sowie die Frage, ob Abdeckarbeiten und kleinere Ausbesserungen separat angeboten werden sollen.

Keine langen Fragebögen. Keine zehn einzelnen WhatsApp-Nachrichten, wenn eine gebündelte Rückfrage möglich ist.

---

# 13. Positionsbibliothek

Positionen sollen als strukturierte Objekte modelliert werden, nicht nur als freie Texte.

Beispiel:

```yaml
position_id: innen_boden_schuetzen
trade: maler
category: schutzarbeiten
default_title: Bodenflächen schützen
applicable_when:
  work_area: interior
suggest_when:
  room_status:
    - furnished
    - occupied
quantity_sources:
  - floor_area
  - room_dimensions
allowed_units:
  - m2
  - pauschal
price_policy:
  allowed_sources:
    - explicit_current_input
    - confirmed_private_pricebook
    - confirmed_private_history
  fallback: empty
confirmation_required_when:
  - inclusion_unknown
```

Weiteres Beispiel:

```yaml
position_id: innen_wandanstrich
trade: maler
category: beschichtung
required_fields:
  - component
  - quantity
  - unit
important_fields:
  - substrate
  - substrate_condition
  - target_color
  - number_of_coats
forbidden_inferences:
  - substrate_is_sound
  - one_coat_is_sufficient
  - fixed_material_consumption
price_policy:
  fallback: empty
```

Claude Code soll prüfen, wie dieses Konzept mit der bestehenden Datenstruktur kompatibel umgesetzt werden kann.

---

# 14. Technische Zielarchitektur

Die Zielarchitektur soll mindestens folgende logische Komponenten trennen:

## 14.1 Speech Parser

Aufgabe:

- Transkript in strukturierte Fakten überführen
- keine Angebotstexte erzeugen
- Unsicherheiten und Widersprüche markieren

Beispiel:

```json
{
  "trade": "maler",
  "job_type": "interior_renovation",
  "object_type": "living_room",
  "room_status": "furnished",
  "surfaces": [
    {
      "component": "wall",
      "quantity": 45,
      "unit": "m2",
      "substrate": "raufaser",
      "condition": null,
      "target_color": "white",
      "source": "explicit_input"
    }
  ],
  "explicit_prices": []
}
```

## 14.2 Maler Rule Engine

Aufgabe:

- fehlende Pflichtangaben erkennen
- relevante Rückfragen priorisieren
- Widersprüche erkennen
- mögliche Positionen bestimmen
- verbotene Annahmen blockieren
- betriebliche Regeln anwenden

Die Rule Engine soll so deterministisch wie praktikabel sein. Das Sprachmodell darf Vorschläge machen, die Rule Engine muss aber kontrollieren.

## 14.3 Knowledge Retrieval

Liefert passende:

- Maler-Positionstypen
- fachliche Prüflogik
- private Betriebspositionen
- bestätigte Regeln
- frühere ähnliche Angebote
- Standardtexte
- freigegebene Preisquellen

## 14.4 Angebotsgenerator

Formuliert auf Basis freigegebener Fakten und Regeln:

- Positionstitel
- Leistungsbeschreibungen
- Einleitung
- Schluss
- Hinweise
- Angebot im Stil des Betriebs

## 14.5 Validator

Prüft vor jeder Ausgabe:

- Hat jede Menge eine Quelle?
- Hat jeder Preis eine zulässige Quelle?
- Wurden unbekannte Tatsachen erfunden?
- Sind Vorschläge als Vorschläge behandelt?
- Gibt es widersprüchliche Angaben?
- Fehlen kritische Angaben?
- Wurde privates Wissen eines anderen Betriebs verwendet?
- Sind historische Preise ausreichend gekennzeichnet?
- Entspricht der Output dem aktuellen Gewerk und Produktscope?

Keine finale Ausgabe darf den Validator umgehen.

---

# 15. Wissensaufbau vor den ersten Kundenangeboten

Da zu Beginn noch keine realen Kundenangebote verfügbar sind, soll die Maler-Fachengine aus kontrollierten Quellen und Expertenfällen aufgebaut werden.

## Quellenklassen

- öffentlich zugängliche Ausbildungsinhalte als Themenlandkarte
- selbst entwickelte Ontologie
- selbst formulierte Positionslogik
- fachlich geprüfte Entscheidungsbäume
- lizenzierte oder zulässig abstrahierte Fachregeln
- Herstellerunterlagen mit klarer Quellen- und Geltungsbereichskennzeichnung
- durch Malermeister erstellte und geprüfte Fallbeispiele
- synthetische Sprachvarianten auf Basis geprüfter Fälle

Keine urheberrechtlich geschützten Norm- oder Fachregeltexte ungeprüft vollständig in das System übernehmen.

## Experten-Goldstandard

Geplant werden soll ein Goldstandard von zunächst etwa 100 geprüften Fällen:

- 40 normale Innenanstriche
- 15 Tapetenentfernungen oder Tapezierarbeiten
- 15 Spachtel- und Untergrundfälle
- 10 Lackierarbeiten an Türen und Zargen
- 10 möblierte oder bewohnte Objekte
- 10 problematische, unvollständige oder widersprüchliche Fälle

Für jeden Fall:

- erwartete Faktenextraktion
- zwingende Rückfragen
- optionale Rückfragen
- mögliche Positionen
- unzulässige Annahmen
- erwartete Warnungen
- zulässige Preisquellen
- Beispiel eines guten Angebotsentwurfs

---

# 16. Lernen aus laufender Nutzung

Die bestehende Auswertung „KI-Original gegen finales Angebot“ ist strategisch sehr wertvoll und soll ausgebaut werden.

Das System soll Unterschiede klassifizieren:

- Position hinzugefügt
- Position entfernt
- Menge geändert
- Einheit geändert
- Text geändert
- Preis ergänzt
- Preis geändert
- Reihenfolge geändert
- Standardtext geändert
- Rückfrage hätte nötig sein sollen
- Rückfrage war unnötig
- fachlicher Vorschlag bestätigt
- fachlicher Vorschlag abgelehnt

Diese Änderungen dürfen nicht blind global gelernt werden.

## Lernprozess

1. Änderung erkennen.
2. Änderung klassifizieren.
3. Prüfen, ob sie nur für diesen Betrieb gilt.
4. Bei wiederkehrenden Mustern eine Betriebsregel vorschlagen.
5. Nutzer bestätigt oder verwirft die Regel.
6. Erst bestätigte Regeln werden automatisiert angewendet.
7. Gewerkspezifische Muster dürfen nur abstrahiert und datenschutzkonform in die allgemeine Maler-Engine einfließen.

Beispiel:

> „Sie haben bei vier vergleichbaren Angeboten die Position ‚Bodenflächen schützen‘ ergänzt. Soll AuftragsBoss diese bei möblierten Innenräumen künftig automatisch vorschlagen?“

---

# 17. Datenschutz und Mandantentrennung

Alte Angebote enthalten regelmäßig:

- Kundennamen
- Anschriften
- Objektadressen
- Kontaktdaten
- Leistungsdaten
- Preise
- betriebliche Kalkulationslogik

Daraus folgen verbindliche Anforderungen:

- strikte Mandantentrennung
- keine Nutzung eines Betriebsprofils für einen anderen Betrieb
- keine Weitergabe konkreter Preise
- keine Weitergabe individueller Formulierungen
- keine automatische gemeinsame Modellschulung mit Originaldokumenten
- klare Löschmöglichkeit
- klare Exportmöglichkeit
- nachvollziehbare Herkunft
- dokumentierte Verarbeitungszwecke
- minimierte Speicherung personenbezogener Daten
- Prüfung, welche Daten für das Lernen wirklich benötigt werden
- optionales Opt-in für abstrahierte gewerkspezifische Verbesserung
- keine Behauptung vollständiger Anonymität ohne technische Grundlage

Claude Code soll die bestehende Datenhaltung auf diese Anforderungen prüfen und notwendige Migrationen vorschlagen.

---

# 18. Website-Neupositionierung

Die Website muss den Wechsel von einem generischen Handwerkerprodukt zu einer spezialisierten Malerlösung deutlich zeigen.

## 18.1 Hero

Empfohlene Hauptüberschrift:

> **Das Angebot ist fertig, bevor Sie vom Hof fahren.**

Unterzeile:

> Diktieren Sie den Auftrag per WhatsApp. AuftragsBoss erstellt einen Angebotsentwurf für Ihren Malerbetrieb, mit Ihrem Briefkopf, Ihren Positionen und Ihren Preisen.

Vertrauenssatz:

> Nicht genannte Preise bleiben leer. AuftragsBoss erfindet keine Preise.

CTA:

> **Erstes Malerangebot kostenlos diktieren**

Sekundärer CTA:

> **Alte Angebote hochladen**

## 18.2 Neue zentrale Sektion

Überschrift:

> **AuftragsBoss lernt, wie Ihr Betrieb Angebote schreibt.**

Inhalt:

1. Zehn bis 30 alte Angebote hochladen.
2. AuftragsBoss erkennt Aufbau, Positionen und Standardtexte.
3. Sie bestätigen die erkannten Regeln.
4. Neue Angebote entstehen von Anfang an im Stil Ihres Betriebs.

## 18.3 Spezialisierungssektion

Keine lange Liste aller Gewerke.

Stattdessen:

> **Entwickelt für Maler- und Lackiererbetriebe**

Konkrete Beispiele:

- Wände und Decken
- Abdeckarbeiten
- Tapeten entfernen
- Spachteln und Schleifen
- Grundieren
- Tapezieren
- Türen und Zargen
- Heizkörper und Sockelleisten
- bewohnte Räume
- Nachträge und Zusatzarbeiten

## 18.4 Vertrauenssektion

- Keine App
- Kein Login
- Keine Schulung
- Nutzung über WhatsApp
- Eigener Briefkopf
- PDF und Word
- Nicht genannte Preise bleiben leer
- Jede vorgeschlagene Position bleibt kontrollierbar
- Betriebsdaten werden nicht mit anderen Betrieben vermischt

## 18.5 Vorher/Nachher

Vorher:

- Notizen im Auto
- Angebot abends schreiben
- Positionen vergessen
- alten Text suchen
- Preise zusammensuchen

Nachher:

- Auftrag diktieren
- offene Punkte beantworten
- Entwurf prüfen
- Preis ergänzen oder aus eigenem Preisbuch übernehmen
- versenden

## 18.6 Website-Tonalität

- keine abstrakte KI-Sprache
- kein „revolutionär“
- keine generische Digitalisierungskommunikation
- keine lange Funktionsliste im Hero
- konkrete Malerbeispiele
- konservativ, professionell, nachvollziehbar
- Nutzen vor Technik
- Kontrolle vor Vollautomatisierung

---

# 19. Editor-Umbau

Der Editor soll weiterhin einfach bleiben, aber die neue Logik sichtbar machen.

Mögliche Ergänzungen:

- Herkunft einer Position anzeigen
- Quelle eines Preises anzeigen
- „aus Ihrem Betriebsprofil“
- „aus aktuellem Diktat“
- „fachlicher Vorschlag“
- „Angabe fehlt“
- „historischer Preis, bitte prüfen“
- Regel für künftig merken
- Vorschlag künftig nicht mehr anzeigen
- ähnliche eigene Position auswählen
- ursprüngliches Altangebot als Referenz öffnen
- Abweichungen zwischen KI-Entwurf und finalem Angebot intern protokollieren

Diese Informationen sollen bei Bedarf sichtbar sein, aber die Hauptoberfläche nicht überladen.

---

# 20. WhatsApp-Flow

Der WhatsApp-Prozess bleibt der primäre Nutzungskanal.

## Neuer Erstkontakt

Option A: Sofort diktieren

> Schicken Sie eine Sprachnachricht zu einem echten oder alten Malerauftrag.

Option B: Betriebsstil importieren

> Laden Sie zehn bis 30 bisherige Angebote hoch. AuftragsBoss erkennt daraus Ihren Aufbau, Ihre Positionen und Ihre Standardtexte.

## Rückfragen

- möglichst gebündelt
- fachlich priorisiert
- keine unnötigen Fragen
- keine Annahme unbekannter Fakten
- klare Markierung von Vorschlägen
- kurze, handwerkliche Sprache

## Nach erfolgreichem Angebot

Optional:

> Soll AuftragsBoss die heute ergänzte Position künftig bei ähnlichen Aufträgen vorschlagen?

Später:

> Sie haben jetzt drei Angebote mit AuftragsBoss erstellt. Möchten Sie einen Malerkollegen einladen? Beide Betriebe erhalten einen Freimonat.

---

# 21. Neue Produktmetriken

Claude Code soll prüfen, ob folgende Ereignisse bereits messbar sind, und fehlende Instrumentierung ergänzen.

## Aktivierung

- erstes echtes Angebot innerhalb von 24 Stunden
- erster Import alter Angebote
- Betriebsprofil bestätigt
- erstes Angebot auf Basis des Betriebsprofils

## Produktqualität

- Zeit vom KI-Entwurf bis versandfähig
- Anzahl manueller Textänderungen
- Anzahl hinzugefügter Positionen
- Anzahl entfernter Positionen
- Mengenänderungen
- Preisergänzungen
- unnötige Rückfragen
- fehlende Rückfragen
- Halluzinationen oder unzulässige Annahmen
- Anteil bestätigter Fachvorschläge

## Bindung

- drei Angebote in 14 Tagen
- aktive Nutzung im zweiten Monat
- Zahl bestätigter Betriebsregeln
- Wiederverwendung eigener Positionen
- Anteil der Angebote, die aus dem Betriebsprofil profitieren

## Wachstum

- Empfehlungsrate nach drittem Angebot
- geworbene Tester
- geworbene Zahler
- Conversion nach Altangebotsimport gegenüber normalem Onboarding

---

# 22. Priorisierte Umsetzung

## Phase 1: Strategische und technische Grundlage

1. Bestehendes Repository analysieren.
2. Aktuelle Datenflüsse und Promptlogik dokumentieren.
3. Mandanten- und Preistrennung prüfen.
4. Gewerk als explizites Domänenobjekt einführen.
5. Maler-Innenrenovierung als ersten Scope definieren.
6. Quellenkategorien für Fakten, Positionen, Mengen und Preise einführen.
7. Validator für Preis- und Faktenerfindungen härten.
8. Eventtracking ergänzen.

## Phase 2: Maler-Fachengine

1. Maler-Ontologie implementieren.
2. strukturierte Auftragsextraktion erweitern.
3. Rückfragen-Matrix einführen.
4. erste 20 bis 30 Positionstypen implementieren.
5. Widerspruchs- und Pflichtfeldprüfung.
6. Testfall-Framework für Goldstandard schaffen.
7. bestehende generische Prompts auf gewerkspezifische Module aufteilen.

## Phase 3: Altangebotsimport

1. Mehrfachupload.
2. Dokumentanalyse.
3. Extraktion von Positionen, Einheiten, Standardtexten und Struktur.
4. Bildung eines privaten Betriebsprofils.
5. Nutzeroberfläche zur Bestätigung erkannter Regeln.
6. Retrieval ähnlicher eigener Positionen.
7. Preisquellen und Aktualitätsprüfung.
8. strikte Mandantentrennung testen.

## Phase 4: Lernen aus Korrekturen

1. Diff-Klassifikation ausbauen.
2. wiederkehrende Änderungen erkennen.
3. bestätigbare Betriebsregeln vorschlagen.
4. Regeln aktivieren/deaktivieren.
5. abstrahierte gewerkspezifische Erkenntnisse getrennt behandeln.
6. Qualitätsdashboard intern erweitern.

## Phase 5: Website und Vermarktung

1. Website ausschließlich auf Malerbetriebe ausrichten.
2. generische Gewerkslisten entfernen.
3. Altangebotsimport als zentralen Nutzen zeigen.
4. Malerbeispiele integrieren.
5. Kernversprechen und Preisvertrauen hervorheben.
6. Demo- und Upload-CTA trennen.
7. alle Screenshots und Beispiele auf Malerfälle umstellen.
8. SEO- und Metadaten entsprechend anpassen.

---

# 23. Nicht bauen oder nicht priorisieren

Folgende Themen dürfen den Umbau nicht verwässern:

- vollständiges ERP
- allgemeines CRM
- Kalender als Hauptprodukt
- generischer Telefonassistent
- Mahnwesen als Kernfunktion
- beliebig viele Gewerke gleichzeitig
- automatische Marktpreise
- unkontrollierte Foto-zu-Preis-Kalkulation
- vollständige autonome Angebotserstellung ohne Bestätigung
- große Zahl von Integrationen vor Product-Market-Fit
- globale Vermischung von Kundendaten
- komplette Neuentwicklung nur aus architektonischer Eleganz

Bestehende funktionierende Abläufe sollen nach Möglichkeit schrittweise migriert und nicht leichtfertig ersetzt werden.

---

# 24. Konkreter Arbeitsauftrag an Claude Code

## Schritt 1: Repository-Audit

Analysiere das gesamte bestehende Repository und dokumentiere:

- aktuelle Architektur
- Datenmodell
- WhatsApp-Verarbeitung
- Transkriptionspipeline
- Prompt- und Modelllogik
- Angebotsdatenmodell
- Editor
- Export
- Einstellungen
- Uploads
- Feedback- und Diff-System
- Mandantentrennung
- Preislogik
- Website-Struktur
- Analytics und Eventtracking
- bestehende Tests
- technische Risiken

Erfinde keine Komponenten, die nicht existieren. Nenne konkrete Dateien, Module und Datenbanktabellen.

## Schritt 2: Gap-Analyse

Vergleiche den Ist-Zustand mit dieser Spezifikation.

Ordne jede Lücke ein:

- bereits vorhanden
- teilweise vorhanden
- fehlt
- technisch riskant
- datenschutzrelevant
- blockiert andere Schritte

## Schritt 3: Migrationsplan

Erstelle einen umsetzbaren Plan mit:

- Reihenfolge
- Abhängigkeiten
- Datenbankmigrationen
- Feature Flags
- Rückwärtskompatibilität
- Tests
- Rollback-Möglichkeit
- geschätzter Komplexität relativ zueinander
- klaren Akzeptanzkriterien

Keine Big-Bang-Neuentwicklung.

## Schritt 4: Sofortige Umsetzung der höchsten Prioritäten

Nach dem Audit sollen zuerst die Änderungen umgesetzt werden, die:

1. keine erfundenen Preise und Fakten technisch absichern,
2. Gewerk und Maler-Scope im Datenmodell verankern,
3. strukturierte Maler-Auftragsextraktion ermöglichen,
4. Quellenkategorien einführen,
5. die Grundlage für Altangebotsimport schaffen,
6. das bestehende Produkt nicht beschädigen.

## Schritt 5: Tests

Erstelle oder erweitere Tests für:

- Mandantentrennung
- Preisquellen
- leere Preise
- widersprüchliche Mengen
- unbekannten Untergrund
- fachliche Vorschläge
- Rückfragen
- Import mehrerer Angebote
- Wiederverwendung eigener Positionen
- Verhinderung fremder Betriebsdaten
- historische Preise
- fehlerhafte oder gescannte Dokumente
- Regression des bestehenden WhatsApp-zu-Angebot-Prozesses

## Schritt 6: Abschlussbericht

Nach jeder Umsetzungsphase ausgeben:

- geänderte Dateien
- Datenbankmigrationen
- neue Konfiguration
- neue Umgebungsvariablen
- Tests und Ergebnisse
- offene Risiken
- bewusst nicht umgesetzte Punkte
- nächste drei Prioritäten

---

# 25. Akzeptanzkriterien für die erste spezialisierte Version

Die erste Maler-Version ist erst dann erfolgreich, wenn folgende Szenarien funktionieren:

## Szenario A: Neuer Betrieb ohne Altangebote

Ein Maler diktiert:

> „Wohnzimmer, ungefähr 45 Quadratmeter Wandfläche, vorhandene Raufaser bleibt, weiß streichen, Raum ist möbliert.“

Das System:

- erkennt Innenrenovierung
- erkennt Wandfläche
- erkennt vorhandene Raufaser
- erkennt Zielton weiß
- erkennt möblierten Raum
- erfindet keinen Untergrundzustand
- erfindet keine Anzahl von Anstrichen
- erfindet keine Preise
- fragt gebündelt nach wirtschaftlich relevanten offenen Punkten
- schlägt Abdeckarbeiten nur als Vorschlag vor

## Szenario B: Betrieb mit Altangeboten

Ein Betrieb lädt 20 alte Angebote hoch.

Das System:

- extrahiert wiederkehrende Positionen
- erkennt Standardtexte
- erkennt Dokumentstruktur
- erkennt typische Einheiten
- hält Preise privat
- zeigt mögliche Regeln zur Bestätigung
- erstellt danach ein neues Angebot im erkannten Stil
- zeigt die Herkunft verwendeter Positionen und Preise

## Szenario C: Laufendes Lernen

Der Nutzer ergänzt in vier ähnlichen Angeboten dieselbe Position.

Das System:

- erkennt das Muster
- schlägt eine private Betriebsregel vor
- aktiviert sie erst nach Bestätigung
- wendet sie nur bei diesem Betrieb an
- erlaubt spätere Deaktivierung

## Szenario D: Sicherheitsprüfung

Das System erhält widersprüchliche oder unvollständige Angaben.

Es:

- markiert Widersprüche
- stellt Rückfragen
- lässt unbekannte Preise leer
- erzeugt keine vermeintlich vollständige Kalkulation
- blockiert fremde Betriebsdaten vollständig

---

# 26. Entscheidungsprinzipien für Claude Code

Bei technischen Entscheidungen gelten diese Prioritäten:

1. Nachvollziehbarkeit vor magischer Automatisierung
2. Mandantentrennung vor globalem Lernen
3. strukturierte Daten vor langen Prompts
4. bestätigte Regeln vor stillen Annahmen
5. Fachlogik vor schöner Formulierung
6. Produktstabilität vor Komplettumbau
7. Maler-Tiefe vor Gewerksbreite
8. realer Nutzerwert vor Funktionsumfang
9. Exportierbarkeit vor Lock-in durch Intransparenz
10. einfache Bedienung vor sichtbarer technischer Komplexität

---

# 27. Erwartete erste Antwort von Claude Code

Claude Code soll nach Einlesen dieser Datei nicht sofort große Mengen Code ändern.

Die erste Antwort soll enthalten:

1. eine kurze Zusammenfassung des verstandenen Strategiewechsels,
2. eine konkrete Bestandsaufnahme des Repositories,
3. eine Liste der wichtigsten Architektur- und Datenmodelllücken,
4. einen priorisierten Umbauplan in Phasen,
5. die ersten Dateien und Module, die geändert werden sollten,
6. die wichtigsten Risiken,
7. konkrete Akzeptanztests,
8. einen Vorschlag, welche Phase unmittelbar umgesetzt wird.

Falls Informationen fehlen, sollen zunächst sinnvolle Annahmen dokumentiert und der bestehende Code als Quelle der Wahrheit verwendet werden. Rückfragen nur dann stellen, wenn eine Entscheidung ohne Nutzerinformation nicht sicher oder nicht reversibel getroffen werden kann.
