# Foto-Aufmaß: Wandflächen aus Smartphone-Fotos — Analyse & Konzept

> Stand 31.08.2026. Diskussionsergebnis Dirk + Claude. **Noch KEINE Implementierung** —
> erst Messbank (Abschnitt 7), dann Go-/No-Go-Entscheidung (Abschnitt 9).

## 1. Die Idee (Kurzfassung)

Der Maler fotografiert beim Kunden den Raum mit dem normalen Smartphone, gibt nur die
**Raumhöhe** an, und AuftragsBoss berechnet daraus Wandlängen, Brutto-/Netto-Wandfläche
und Öffnungen (Fenster/Türen) — direkt übernehmbar ins Angebot. Erweiterung: aus der
Geometrie automatisch Materialbedarf rechnen (Tapetenrollen, Farbe, Sockelleisten …).

## 2. Zentrale Erkenntnisse der Analyse (kritisch)

1. **„Einmal rundherum drehen" funktioniert NICHT.** Photogrammetrie braucht Parallaxe
   (Kamera muss sich BEWEGEN). Drehen auf der Stelle = reine Rotation = mathematisch
   keine Tiefenrekonstruktion möglich. Größter Denkfehler der ursprünglichen Idee.
2. **Weiße, glatte Wände sind der Worst Case klassischer Photogrammetrie** (SfM/COLMAP
   braucht wiedererkennbare Bildpunkte — frisch zu streichende Wände haben keine).
   Neuere Dense-Modelle (DUSt3R/MASt3R-Klasse) sind robuster, brauchen aber GPU-Server
   (VPS kann das nicht), werfen DSGVO-Fragen auf (Fotos aus Privatwohnungen) und
   garantieren keine metrische Genauigkeit.
3. **Der erste Test (21 Fotos, Umfang 24,0 m fast getroffen, Balkontür 1,70 m → 1,40 m
   geschätzt = 18 % Fehler) ist richtig zu lesen als:** Umfang = Glück + Weltwissen der
   Vision-KI (Einzelfehler mitteln sich); das ehrliche Signal ist der 18-%-Fehler auf
   das Einzelmaß. Eine reine Vision-KI, die Fotos „anschaut", reicht NICHT.
4. **Der robuste Weg: Wand-für-Wand-Einzelbildmessung** (Single-View-Metrologie) statt
   globaler 3D-Rekonstruktion — siehe Abschnitt 3.
5. **VOB-Geschenk (DIN 18363): Öffnungen ≤ 2,5 m² werden übermessen** (nicht abgezogen).
   Kleine Fenster/Türen müssen also nur als „≤ 2,5 m²" klassifiziert werden, nicht
   zentimetergenau vermessen. Nur größere Öffnungen (Balkontür 1,70×2,10 = 3,57 m²)
   werden abgezogen (ggf. + Leibungen). Senkt die Genauigkeitsanforderung massiv.
6. **Der Zollstock als Zweitreferenz:** „Leg den ausgeklappten Zollstock an die Wand" —
   handwerker-nativ, 2 m, gut sichtbar. Plan B, wenn Boden-/Deckenkante verdeckt ist.
   Raumhöhe als alleinige Referenz REICHT, wenn beide Kanten im Bild sind.

## 3. Empfohlene Zielarchitektur

**Stufe 1 (das Produkt): Geführtes Wand-für-Wand-Aufmaß im bestehenden WhatsApp-Dialog.**

Ablauf: Maler sagt „Aufmaß" + Raumhöhe → System führt: „Foto von Wand 1 — ganze Wand,
Boden und Decke mit drauf" → pro Foto:
- Segmentierung Wand/Fenster/Tür (Grounding-DINO/SAM-Klasse, gehostete Inferenz),
- Kanten + Fluchtpunkte → Wand rechnerisch entzerren (OpenCV, läuft auf dem VPS),
- Raumhöhe = Maßstab im entzerrten Bild → Breiten/Öffnungen MESSEN (nicht schätzen),
- **Confidence pro Wand**; schlechtes Foto → sofortige gezielte Rückfrage (Selbstheilung
  ist pro Wand trivial, global wäre sie unlösbar),
- „Nächste Wand" … „fertig" → Summen, VOB-Öffnungsregel, Ergebnis als Positionen mit
  Mengen in den Editor (Quelle `AUFMASS_FOTO`, editierbar; Mengen werden GERECHNET,
  nie erfunden — Preise sowieso nie).

Doppelzählung per Design ausgeschlossen (Dialog nummeriert die Wände).
Erwartbare Genauigkeit Wandbreite: **2–5 %** (statt 18 % bei Vision-Schätzung).
WhatsApp-Kompression (~1600 px, EXIF weg) reicht dafür: ~4 mm/Pixel auf 6-m-Wand;
das Verfahren braucht weder EXIF-Brennweite noch Bildüberlappung.

**Confidence, messbar:** (a) Fluchtpunkt-Stabilität/Kantenschärfe je Wand,
(b) Segmentierungs-Score je Öffnung, (c) **Polygonschluss** als Königs-Check: gemessene
Wandlängen müssen einen geschlossenen Grundriss ergeben; Schließfehler > ~3 % →
Nachfrage bei der unsichersten Wand. Stufen: hoch = auto übernehmen · mittel =
„45,8 m² — übernehmen?" · niedrig = gezielte Rückfrage/neues Foto.

**Stufe 2 (optional, später):** Multi-View-Modell (DUSt3R-Klasse) nur als GEGENPRÜFUNG
und für Grundriss-Skizzen — erst wenn Stufe 1 sich bewährt. Web-Capture-Workflow
(Link → Kamera → Original-Upload, wie /testen) nur, falls die Messbank zeigt, dass
Originalauflösung deutlich mehr bringt. **WhatsApp-first ist die Produktentscheidung.**

## 4. Rückfall-Leiter: „Wand passt nicht aufs Bild" (häufigster Praxisfall!)

1×-Kamera sieht ~65–70°; 6-m-Wand braucht ~4,5 m Abstand → in normalen Räumen oft
unmöglich. Das System erkennt fehlende Boden-/Deckenkante selbst und eskaliert PRO WAND:

1. **Diagonal-Trick:** „Stell dich in die gegenüberliegende Ecke, fotografier die Wand
   schräg, Hochformat." (Entzerrung kann schräg; Raumdiagonale = ~60 % mehr Abstand;
   fernes Wandende gröber → fließt in Confidence ein.)
2. **Ultraweitwinkel 0,5×:** ~120° Sichtfeld, 6-m-Wand aus ~1,7 m. Verzerrung wird aus
   dem Bild selbst korrigiert (Plumb-Line-Kalibrierung: Decken-/Bodenkante/Türrahmen
   MÜSSEN gerade sein → daran auch automatische Weitwinkel-Erkennung, EXIF fehlt ja).
3. **Kreppband-Trick:** senkrechter Kreppband-Streifen mitten auf die Wand, Foto links
   davon + rechts davon (Band jeweils drauf). Jede Hälfte einzeln entzerrt/gemessen
   (Raumhöhe in beiden als Maßstab), Band = eindeutige Naht → keine Doppelzählung.
   (Fehler zweier Segmente addieren sich leicht → in Messbank prüfen.)
4. **Ehrliche Kapitulation:** „Miss die Wand kurz selbst und sag mir die Länge." —
   diktierte und fotografierte Maße mischen sich im selben Vorgang (Dialog kann das).

Grenze ehrlich benannt: **Möblierte Räume** (Schrankwand verdeckt Bodenkante) und
**Dachschrägen** → im MVP erkennen und ablehnen („bitte von Hand"), Stufe 4 als Netz.

## 5. Materialrechner (unabhängiger Sofort-Gewinn — ggf. VOR dem Foto-Aufmaß bauen)

Reine deterministische Mathematik im Stil von `berechnung.ts` (kein KI-Risiko), Maße
kann der Maler heute schon diktieren:
- **Tapete:** Bahnlänge = Raumhöhe + Zuschnitt (~10 cm); bei Rapport auf Rapport
  aufrunden (2,50 m + 0,10 → bei 64er-Rapport 3,20 m Bahn). Bahnen/Rolle =
  ⌊Rollenlänge/Bahnlänge⌋ (10,05/3,20 → 3). Bahnen gesamt = ⌈zu tapezierende
  Wandlänge / Rollenbreite 0,53⌉. Rollen = ⌈Bahnen/Bahnen-pro-Rolle⌉ + Reserve
  (+1 Rolle bzw. 10 %). Öffnungen: volle Bahnen über kleinen Öffnungen mitzählen
  (Praxis), nur raumhohe Durchgänge sparen Bahnen. Halbversetzter Rapport (Rapport/2)
  als Variante.
- **Analog:** Farbe (m² × Verbrauch × Anstriche → Gebinde aufrunden), Grundierung,
  Spachtel, Sockelleisten (Umfang − Türbreiten + Verschnitt), Deckenfläche
  (Grundrissfläche), Abdeckvlies, Kreppband (Umfang + Öffnungsumfänge).
- Produktdaten (Rollenmaß, Rapport, Ergiebigkeit) aus Wissensbasis/Preisliste/Diktat —
  **NIE von der KI erfunden**; Preise sowieso nur aus vorhandenen Quellen.

## 6. Risiken (Kurzliste)

- Vision-Schätzung wirkt im Demo gut, versagt am Einzelmaß (18 %) → nie „Zahlen dichten".
- Klassisches SfM an weißen Wänden praktisch tot; Dense-Modelle = GPU + DSGVO + Kosten.
- WhatsApp: EXIF weg (keine Brennweite), Kompression — für Wand-für-Wand ok (messen!).
- Möbel verdecken Bodenkante; Dachschrägen; Nischen/Vorsprünge → erst manuell.
- Haftung: zu kleines Aufmaß = echter Geldverlust des Malers → Editor-Kennzeichnung
  „aus Foto-Aufmaß, bitte prüfen", Auto-Übernahme NUR bei hoher Confidence.

## 7. Messbank (MVP — erst messen, dann bauen!) — **Dirk baut sie, Stand 31.08. geplant**

**Ziel:** Zahlen statt Bauchgefühl, BEVOR eine Zeile Produkt-Code entsteht.

**Datenerfassungs-Protokoll für Dirk (pro Raum):**
1. **Wahrheit messen** (Laser-Entfernungsmesser): jede Wandlänge, Raumhöhe, jede
   Öffnung (Breite × Höhe), notieren welche Öffnung > 2,5 m² ist.
2. **Fotos Wand für Wand** (im Uhrzeigersinn, Hochformat, ganze Wand inkl. Boden- und
   Deckenkante, 1×-Kamera). Zusätzlich für MINDESTENS 3–4 zu große Wände (Flur, langes
   Wohnzimmer, kleines Bad) je: (a) Diagonal-Trick, (b) 0,5×-Foto, (c) Kreppband-Split.
3. **Jedes Foto in ZWEI Fassungen sichern:** Original (per Kabel/Drive) UND einmal
   durch WhatsApp geschickt (an sich selbst) und wieder gespeichert → Kompressions-
   vergleich gratis.
4. **Ordnerstruktur:** `Messbank/Raum01/original/w1.jpg…`, `Messbank/Raum01/whatsapp/…`,
   Sonderaufnahmen als `w3_diag.jpg`, `w3_uww.jpg`, `w3_split_L.jpg`/`_R.jpg`.
5. **Wahrheit als Tabelle** (`Messbank/wahrheit.xlsx` o. CSV): Raum, Wand-Nr, Länge m,
   Höhe m, Öffnungen (Typ, B×H, an welcher Wand), Bemerkung (möbliert? Farbe? Schräge?).
6. **Testset-Mix (≥ 10 Räume):** möbliert UND leer, weiße UND farbige Wände, klein
   (Bad/Flur) UND groß, mindestens 1 Raum mit Dachschräge (als Negativ-Test).

**Auswertung (Claude, danach):** lokales Skript — Entzerrung + Maße + Öffnungs-
erkennung pro Foto, automatischer Abgleich gegen die Wahrheitstabelle, Report.

## 8. Messwerte des Reports

Je Raum/Wand: Wandbreiten-Fehler (Median + P90, %), Umfangsfehler, Öffnungen gefunden/
übersehen/falsch (Precision/Recall), Öffnungsflächen-Fehler, **>2,5-m²-Klassifikation
korrekt?**, Netto-Flächen-Fehler, Polygonschlussfehler, unbrauchbare Fotos (Nachfass-
quote), Vergleich Original vs. WhatsApp-Fassung, Vergleich Diagonal vs. 0,5× vs. Split.

## 9. Go-/No-Go-Kriterien

| Kriterium | Go | No-Go |
|---|---|---|
| Netto-Wandfläche je Raum | ≤ 8 % Fehler in 8/10 Räumen | ein Raum > 15 % |
| Einzelne Wandbreite | Median ≤ 5 % | P90 > 10 % |
| Öffnungs-Klassifikation > 2,5 m² | ≥ 95 % korrekt | darunter |
| Nachfassquote | ≤ 1 Wiederholungsfoto/Raum | Maler muss „kämpfen" |

Bei No-Go: würdiger Rückfall = „Foto-gestütztes Schätz-Aufmaß" (Vorschlag + Pflicht-
Bestätigung im Editor, nie Auto-Übernahme) — oder nur Materialrechner (Abschnitt 5).
