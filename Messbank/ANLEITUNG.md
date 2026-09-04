# Messbank-Anleitung: So sammelst du die Testdaten fürs Foto-Aufmaß

> Ziel: Du lieferst Fotos + echte Messwerte von ca. 10 Räumen. Claude baut daraus die
> Auswertung und wir sehen mit Zahlen, ob das Foto-Aufmaß genau genug für echte
> Angebote ist. **Pro Raum brauchst du ca. 20–30 Minuten.**

---

## Was du brauchst

- [ ] Laser-Entfernungsmesser (ideal) oder Zollstock
- [ ] Dein normales Smartphone
- [ ] Kreppband (ein Stück, für den Split-Trick bei großen Wänden)
- [ ] Zettel/Handy-Notiz zum Mitschreiben (oder direkt die CSV-Tabellen, siehe unten)

## Die Regeln fürs Zählen (bitte in JEDEM Raum gleich machen)

- **Wand 1** = die Wand, die **links neben der Tür** beginnt, durch die du reinkommst.
- Dann **im Uhrzeigersinn** weiterzählen: Wand 2, Wand 3, …
- Jede Nische/jeder Vorsprung zählt als eigene Wand (kurze Wandstücke einzeln messen).
- Raumnamen: **Raum01, Raum02, …** (egal welcher Raum das echt ist — Details kommen in
  die Tabelle).

---

## Schritt für Schritt — pro Raum

### Schritt 1: Messen (die „Wahrheit")

Mit Laser/Zollstock messen und notieren:

- [ ] **Raumhöhe** (Boden bis Decke, an einer normalen Stelle)
- [ ] **Jede Wandlänge** einzeln (Wand 1, 2, 3, … im Uhrzeigersinn)
- [ ] **Jede Öffnung**: Breite × Höhe, und an welcher Wand sie sitzt
      (Fenster, Tür, Balkontür, Durchgang — Rahmen außen messen, so wie ein Maler
      es fürs Abziehen messen würde)

### Schritt 2: Fotos machen — eine Wand nach der anderen

Für **jede Wand ein Foto**, so:

- [ ] **Hochformat** (Handy senkrecht halten)
- [ ] **1×-Kamera** (kein Zoom, kein Weitwinkel — außer bei den Spezialfällen unten)
- [ ] So weit weg wie möglich stehen
- [ ] **Die ganze Wand muss drauf sein — WICHTIG: Bodenkante UND Deckenkante sichtbar**
- [ ] Normale Beleuchtung, nicht direkt gegen ein grelles Fenster fotografieren

Reihenfolge: Wand 1, Wand 2, … (gleiche Zählung wie beim Messen!).

### Schritt 3: Spezialfälle — Wände, die NICHT komplett aufs Bild passen

Das ist ein wichtiger Teil des Tests! Bei **mindestens 3–4 Wänden** (z. B. lange
Wohnzimmerwand, Flurwand, kleines Bad), die du aus normaler Entfernung nicht ganz
draufkriegst, machst du **ZUSÄTZLICH alle drei Tricks** (also 3 Extra-Fotos bzw. 4
beim Split):

1. **Diagonal-Trick:** Stell dich in die gegenüberliegende Raumecke und fotografiere
   die Wand schräg (Hochformat, ganze Wand inkl. Boden + Decke).
2. **Weitwinkel-Trick:** Gleiche Wand nochmal mit **0,5×** (Ultraweitwinkel) frontal.
3. **Kreppband-Trick:** Klebe einen senkrechten Kreppband-Streifen ungefähr in die
   Wandmitte. Dann **zwei Fotos**: eins von der linken Hälfte (Band mit drauf), eins
   von der rechten Hälfte (Band mit drauf). Beide mit Boden- und Deckenkante.

### Schritt 4: Jedes Foto in ZWEI Fassungen sichern

Wir müssen wissen, wie viel die WhatsApp-Kompression kaputt macht. Darum:

1. **Original:** Fotos vom Handy unverändert auf den PC kopieren (Kabel oder OneDrive —
   NICHT über WhatsApp).
2. **WhatsApp-Fassung:** Dieselben Fotos in WhatsApp **an dich selbst** schicken
   (Chat „Du"/„Nachricht an mich selbst") — als **normales Foto**, NICHT als „HD" und
   NICHT als Dokument (so schicken es die Maler später auch). Danach die Bilder aus
   WhatsApp wieder herunterladen/speichern und auf den PC kopieren.

### Schritt 5: Ablegen — genau diese Ordnerstruktur

Im Projektordner unter `Messbank/`:

```
Messbank/
  Raum01/
    original/    w01.jpg  w02.jpg  w03.jpg  w03_diag.jpg  w03_uww.jpg
                 w03_splitL.jpg  w03_splitR.jpg  w04.jpg ...
    whatsapp/    (dieselben Dateinamen, nur eben die WhatsApp-Fassungen)
  Raum02/
    ...
```

Dateinamen: `w01.jpg` = Wand 1, `w02.jpg` = Wand 2 …
Spezialfotos: `w03_diag.jpg` (Diagonal), `w03_uww.jpg` (0,5×),
`w03_splitL.jpg` + `w03_splitR.jpg` (Kreppband links/rechts).

### Schritt 6: Messwerte in die Tabellen eintragen

Im Ordner `Messbank/` liegen drei vorbereitete CSV-Dateien (öffnen sich in Excel):

- **wahrheit-raeume.csv** — eine Zeile pro Raum (Höhe, möbliert?, Farbe, Raumart)
- **wahrheit-waende.csv** — eine Zeile pro Wand (Länge)
- **wahrheit-oeffnungen.csv** — eine Zeile pro Fenster/Tür/Durchgang (Breite, Höhe)

Beispielzeilen stehen schon drin — einfach ersetzen/ergänzen und **als CSV speichern**
(Excel fragt beim Speichern — Format beibehalten mit „Ja").

---

## Der richtige Raum-Mix (ca. 10 Räume)

Damit der Test die Realität abbildet, bitte mischen:

- [ ] mindestens 3 **möblierte** Räume (Möbel dürfen ruhig die Wand teilweise verdecken
      — genau das wollen wir testen!)
- [ ] mindestens 2 **leere/fast leere** Räume
- [ ] **weiße** UND **farbige** Wände
- [ ] mindestens 1 **kleines Bad oder Flur** (enge Verhältnisse)
- [ ] mindestens 1 **großer Raum** mit einer Wand über 5 m
- [ ] 1 Raum mit **Dachschräge** (als Härtetest — da erwarten wir, dass es NICHT geht,
      das System soll das später erkennen und ehrlich sagen)

## Häufige Fehler (bitte vermeiden)

- ❌ Querformat statt Hochformat (dann fehlt oft Boden oder Decke)
- ❌ Boden- oder Deckenkante abgeschnitten → Foto ist für die Messung wertlos
- ❌ Fotos per WhatsApp „HD" oder als Dokument schicken (verfälscht den Kompressionstest)
- ❌ Zählrichtung mittendrin wechseln (dann passen Fotos und Tabelle nicht zusammen)
- ❌ Öffnungen vergessen zu messen (jede einzelne bitte, auch kleine Fenster)

## Fertig?

Wenn alles in `Messbank/` liegt (Ordner + drei ausgefüllte CSVs), sag Claude einfach:
**„Messbank ist fertig"** — dann wird das Auswertungsskript gebaut und gegen deine
Wahrheitswerte gerechnet. Entscheidung nach der Go-/No-Go-Tabelle in
`Konzepte/Foto-Aufmass_Analyse.md` (Abschnitt 9).
