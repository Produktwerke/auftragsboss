# Messbank-Erkenntnisse (Stand 04.09.2026)

Ergebnis des ersten vollständigen Durchlaufs: **NO-GO für das naive Ein-Foto-Verfahren** — aber mit klarem Befund, WORAN es liegt und was ein Produkt daraus machen müsste. Der Messkern selbst ist bewiesen korrekt.

## Was bewiesen ist

1. **Die Mathematik stimmt.** Selbsttest mit synthetischer Kamera: exakt bei bekannter Brennweite, ≤ 0,56 % systematischer Fehler mit Brennweiten-Prior (0,70 × lange Bildseite) bis 48° Blickwinkel, Rauschtest ±3 px → P90 0,65 %.
2. **Unter guten Bedingungen funktioniert es auch an echten WhatsApp-Fotos.** Wände mit frei sichtbaren Ecken und Bodenlinie: 0,0-6 % Fehler (12 der 32 messbaren Wände unter 5 %; z. B. R01 W2 0,0 %, R04 W2 0,3 %, R09 W4 1,3 %, R07 W4 0,2 %).
3. **VOB-Klassifikation (> 2,5 m² übermessen ja/nein) ist robust:** 23/24 = 96 % korrekt, trotz Maßfehlern.

## Woran es scheitert (Fehlerquellen nach Häufigkeit)

1. **Möbel verdecken Ecken oder die komplette Bodenlinie** (Sofa, Einbauschrank, Eckschrank, Hochbett). Folge: Ecke muss geschätzt/extrapoliert werden → Fehler 10-20 %, oder ehrliches „nicht messbar“. Betroffen: ~15 von 42 Wänden.
2. **Lange Wände (> 5,5 m) passen nicht in ein Foto** (R03 10,49 m, R11 10,38 m, R08 2× 5,49 m im engen Flur). Ein-Foto-Verfahren prinzipbedingt am Ende.
3. **Nicht-ebene Wände** (Knick/Rücksprung R05 W4, Installations-Vorwand im Bad R07 W2). Planare Einzelbildmessung nicht anwendbar.
4. **Kamera zu hoch gerichtet** → Bodenlinie unter dem Bildrand (R03 W4). Ohne Boden kein Höhenmaßstab.
5. **Offene Türblätter und bodentiefe Glaselemente** verdecken die lichten Kanten (R10: Netto-Fläche 17,6 % daneben, obwohl Wandbreiten < 6 %).

## Wichtigste Einsicht fürs Produkt

Der Fehler ist fast immer eine **Sichtbarkeits**-, keine Messfrage. Ein Produkt braucht deshalb:

- **Sofort-Check im Chat:** „Sind beide Wandecken UND der Boden an beiden Ecken im Bild? Sonst neu fotografieren.“ Das allein hätte hier ~2/3 der Ausreißer verhindert oder ehrlich zu Nachfass gemacht.
- **Raum-Logik statt Einzelwand:** Gegenüberliegende Wände sind gleich lang, Umfang schließt sich (Polygonschluss). R01: eine Wand nicht messbar, Raumfehler trotzdem 0,8 %. Auf Raumebene sind bereits 7/10 Räume ≤ 8 % Netto-Fläche.
- **Mehrbild für lange Wände** oder Wandlänge aus den Nachbarwänden ableiten.
- **Türen/Fenster vor dem Foto schließen** lassen (eine Zeile in der Anleitung).

## Zahlen (Details in REPORT.md)

- 32/42 Wände messbar, 10 ehrlich „nicht messbar“ (0,9 Nachfass/Raum → unter der 1,0-Grenze).
- Wandbreiten: Median 6,4 % · P90 17,0 % (Ziel: ≤ 5 % / ≤ 10 %).
- Netto-Wandfläche je Raum: 7/10 Räume ≤ 8 % (Ziel: 8/10).
- Öffnungsflächen: Median 8,6 % Fehler; 0 fälschlich erkannte Öffnungen; 15 verpasst (meist auf nicht messbaren Wänden bzw. hinter offenen Türblättern).

## Bewertung der Annotationsquelle

Die Eckpunkte wurden von Claude aus den WhatsApp-Fotos annotiert (mit Zoom-Ausschnitten). Das entspricht dem, was ein Bild-KI-Modul im Produkt leisten müsste — die hier gemessenen Fehler sind also eine realistische obere Schranke für „Foto rein, Maß raus“ ohne Nutzerführung. Mit den oben genannten Produkt-Maßnahmen (Sichtbarkeits-Check, Polygonschluss, geschlossene Türen) ist der Weg zu GO auf Raumebene realistisch; auf Einzelwand-Ebene bleibt ±5 % ambitioniert.
