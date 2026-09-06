# Video-Test Foto-Aufmaß (06.09.2026)

Frage von Dirk: Bringt ein Rundum-Video (Nutzer filmt den Raum, gibt nur die Raumhöhe an; Einzelbilder + Multi-View-Geometrie + Tiefenschätzung) bessere Maße als Einzelfotos?

Testmaterial: 5 Videos (Raum 5, 4, 1, 3, 6), jeweils Original (1080×1920 Hochformat, HEVC, 30 fps, 34 Mbit/s, 11–38 s) und WhatsApp-Fassung. Werkzeuge: ffmpeg (Einzelbilder mit 2 fps), Harris-Eckendetektor (Node) für die Merkmalsdichte.

## Befund 1: WhatsApp macht aus dem Video ein 478×850-Bild

WhatsApp komprimiert Videos auf **478×850 Pixel bei 1,36 Mbit/s** (Faktor 20–25 kleiner). Zum Vergleich: WhatsApp-Fotos hatten 1600×739. Ein Videoframe hat also nur ein Viertel der linearen Auflösung eines Fotos. Kanten (Türzarge, Fußleiste) bleiben erkennbar, sind aber weich; ±2 px Annotationsfehler entsprechen 0,4 % der Bildbreite, das wäre noch tragbar.

## Befund 2: Im Hochformat passt keine Wand in ein Frame

Rechnerisch (Brennweiten-Prior 0,70 × lange Seite): horizontales Sichtfeld im Hochformat **≈ 44°**, im Querformat-Foto ≈ 71°. Eine 4-m-Wand aus 2,2 m Abstand braucht ≈ 85°. Ergebnis in den Kontaktabzügen: Bei den vier Standardwänden je Raum (3,5–4,3 m) gibt es in keinem der Videos ein Frame mit beiden Ecken und Boden. Die Einzelbild-Messung, die bei Fotos funktioniert hat, ist auf diese Videoframes deshalb gar nicht anwendbar. Video hilft nur, wenn man Frames zusammensetzt.

## Befund 3: Alle fünf Videos sind Schwenks vom Stand, kaum Bewegung

Multi-View-Geometrie (Struktur aus Bewegung, Tiefe aus Parallaxe) braucht **Kameraversatz**. Reine Drehung vom Stand ist mathematisch entartet: alle Frames sind per Homographie ineinander überführbar, es entsteht keine Tiefe. Nur im 38-s-Video (Raum 3) gibt es etwas Bewegung. Die naheliegende Nutzeraktion „ich drehe mich einmal im Kreis“ liefert also genau die Daten, die eine 3D-Rekonstruktion nicht verwerten kann. Umgekehrt ist ein Schwenk ideal für **Panorama-Stitching**: daraus ließe sich ein virtuelles Weitwinkelbild bauen, auf das unser Einzelbild-Verfahren wieder passt (Raumhöhe als Maßstab).

## Befund 4: Malerwände sind merkmalsarm

Harris-Merkmale je Frame (feste Schwelle, Raster oben→unten):

| Frame | Merkmale | Verteilung |
|---|---|---|
| R05 Türwand Original 1080p | 284 | oberes Drittel: 0–3 pro Zelle; Möbelzone unten: 30–56 |
| R05 Türwand WhatsApp 478p | 322 | gleiches Muster, zusätzlich Kompressionsartefakte |
| R04 Türwand WhatsApp | **48** | fast leer, Merkmale nur an Tür und Bild |
| R03 Wohnzimmer WhatsApp | 418 | fast alle auf Sofa/Fenstern, Wandflächen leer |

Merkmale sitzen auf Möbeln, Bildern, Fenstern; die zu messenden Wandflächen selbst liefern nichts. Feature-basierte Rekonstruktion (COLMAP & Co.) würde die Möbel rekonstruieren und die Wände raten. Dazu kommen Rolling Shutter, Bewegungsunschärfe und der fehlende Zugriff auf Sensordaten (Gyroskop, Beschleunigung), die Handy-AR-Apps (ARCore/ARKit, RoomPlan) gerade deshalb nutzen.

## Einordnung

Die Video-Idee ist im Kern die Idee „RoomPlan über WhatsApp“. Was diese Apps stark macht (Sensorposen, LiDAR beim iPhone Pro, volle Auflösung, Echtzeit-Feedback beim Gehen), geht durch den WhatsApp-Kanal komplett verloren. Ohne eigene App ist Video gegenüber Fotos ein Rückschritt: weniger Auflösung, schmaleres Sichtfeld, und die Nutzer drehen sich statt zu gehen.

Was aus dem Test trotzdem bleibt:

1. **Panorama statt Video** wäre der einzige billige Gewinn: der Schwenk als Panoramabild (Handy-Panoramamodus oder serverseitiges Stitching der Frames) löst das Problem „lange Wand passt nicht ins Bild“ und liefert alle Wände eines Raums mit einem Aufnahmevorgang. Möbel vor Ecken und Bodenlinie löst es nicht. Vorbehalt: WhatsApp skaliert Fotos auf 1600 px lange Seite, ein 360°-Panorama wäre damit nur ~1600×300 Pixel, also unbrauchbar; ein Panorama je Wand (≈ 90°) bleibt dagegen brauchbar.
2. **Echte Multi-View-Messung** braucht eine eigene Aufnahme-App mit Sensordaten und Nutzerführung („gehe langsam an der Wand entlang“), plus GPU-Server oder On-Device-AR. Das ist ein eigenes Produkt, kein WhatsApp-Feature, und es konkurriert mit kostenlosen Herstellerlösungen.
3. Die Produktentscheidung vom 04.09. bleibt bestätigt: Maße vom Maler per Sprache, Fotos für Öffnungen, VOB und Dokumentation.
