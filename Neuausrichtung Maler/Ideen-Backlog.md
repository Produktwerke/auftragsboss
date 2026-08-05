# AuftragsBoss — Ideen-Backlog

> Gesammelt aus der Wettbewerbsanalyse (13 Seiten, 05.08.2026) und Dirks
> Bewertung. Zweck: nichts vergessen. Priorisiert; jede Zeile mit Aufwand,
> Dirks Entscheidung und Status. Umsetzung erfolgt schrittweise, nicht alles
> auf einmal. Status: OFFEN, sofern nicht anders vermerkt.

## Dirks Priorisierung (Kurzfassung)
- **Top-Wunsch:** Login-freier Aufnahme-Knopf auf der Website (Sofort-Test).
- **Ausdrücklich praktisch:** Foto/Screenshot hochladen (Zettel abfotografieren, Handy-Notiz-Screenshot).
- **Gut, aber optional/skippbar:** Zusammenfassung „das habe ich verstanden" vor dem Angebot.
- **Bewusst nur Nebenbotschaft:** „keine erfundenen Preise" (man kontrolliert ohnehin vor Versand).
- **Sofort übernehmbar:** „mit echten Malern entwickelt" (Dirk hat Maler-Tester).

---

## 1. Hoch — als Nächstes umsetzen

### 1.1 Login-freier Aufnahme-Knopf auf der Startseite  ⭐ Dirks Nr. 1
Besucher drückt auf der Website „Aufnahme", diktiert einen Malerauftrag, sieht ~20 Sek. später ein echtes Angebot. **Marktlücke:** Kein Wettbewerber lässt den Besucher es wirklich live erleben (alle nur Video/Animation, dann Login-Wand).
- Technik: Mikro-Aufnahme im Browser → öffentlicher, ratenbegrenzter Endpunkt → bestehende Pipeline (Transkription → Struktur → Angebot). **Missbrauchsschutz aus `src/direkttest.ts` wiederverwenden.**
- Fallback für Zögerliche: vorbefülltes Beispiel per Ein-Klick („Wohnzimmer 25 m², Wände und Decke weiß, zweimal").
- Aufwand: **mittel**. Quelle: profiangebot (Browser-Diktat ohne Login) + angebots-autopilot (eingebettete Chat-Simulation).

### 1.2 Foto/Screenshot als Eingabekanal  ⭐ Dirk: „praktisch"  ✅ GEBAUT (05.08.2026, Deploy ausstehend)
Der Maler fotografiert seinen handschriftlichen Aufmaß-Zettel oder schickt einen Screenshot seiner Handy-Notizen — zusätzlich oder statt Diktat.
- Umgesetzt: WhatsApp-Bildnachricht → `ladeBild` (media.ts) → `liesBildNotiz` (Claude Vision, `src/ai/bildLesen.ts`) → Text → dieselbe Struktur-Pipeline. Sofort-Bestätigung „📷 Foto hab' ich!". Der extrahierte Text dient dem Validator als Beleg (Preise auf dem Zettel bleiben erhalten). Lokal mit echtem Bild verifiziert (Claude las die Notiz korrekt aus).
- **Offene Feinheiten (Follow-up):** (a) Bild-**Caption** (Text zum Foto) wird noch nicht mitgenommen; (b) mehrere Fotos am Stück; (c) sehr unleserliche Handschrift bleibt Qualitätsrisiko. Prinzip gewahrt: Mengen als Vorschlag, **Preise nie erfinden**.
- Quelle: vetron (Foto vom Aufmaßzettel).

### 1.3 „Mit echten Malern entwickelt" + Zahlen-Testimonials  ✅ jetzt belegbar
Website-Vertrauenselement. Dirk hat echte Maler als Tester/Ideengeber → ehrlich verwendbar. Später ergänzen: konkrete Zahlen-Testimonials echter Referenzbetriebe (z. B. „2 Std./Angebot gespart") statt vager Zitate.
- Aufwand: **gering** (Text/Website). Wird in den Website-Durchgang (Abschnitt 4) eingebaut. Quelle: handwerkstool, meisterio.

---

## 2. Trust & Qualität — passt in Phase 2 (Maler-Fachengine)

### 2.1 Zusammenfassung „das habe ich verstanden" — mit Skip-Option
Nach dem Diktat schickt AuftragsBoss das Verstandene per WhatsApp zurück: „Ich habe verstanden: 45 m² Wandfläche, 2× weiß streichen, Anfahrt 40 €. Passt das? Sag ‚ja' oder korrigier's per Sprache."
- **Dirks Auflage:** muss **überspringbar** sein — einmalig („schick einfach") UND **dauerhaft abschaltbar** (Einstellung „Zusammenfassung vor Angebot: an/aus"). Sobald der Handwerker Vertrauen hat, dass es stimmt, will er die Zusammenfassung evtl. dauerhaft weglassen.
- Passt zum Speech-Parser aus Phase 2 (liefert die strukturierten Fakten zum Vorlesen). Aufwand: **mittel**. Quelle: voice-offer (Korrektur-Loop) + handwerker-rechnungen (Verständnis-Beleg).

### 2.2 Maler-Material-/Verbrauchswissen
Realistische Mengen (Farbe, Grundierung, Kleister; m²-Verbrauch) als **markierter Vorschlag** — Preise weiterhin nur aus Diktat/Preisgedächtnis. Ist Teil der Phase-2-Ontologie/Positionsbibliothek. Aufwand: **Teil von Phase 2**. Quelle: vetron.

---

## 3. Günstige Differenzierer (später)

### 3.1 Mehrsprachiges Diktat (DE/PL/TR → deutsches Angebot)
Der polnische/türkische Geselle diktiert in seiner Sprache, das Angebot kommt auf Deutsch. Realer Vorteil im Maler-Alltag; Whisper kann Mehrsprachigkeit großteils schon. Aufwand: **gering-mittel** (Prüfen + bewerben). Quelle: buridans.

---

## 4. Website-Botschaft (eigener Durchgang, Phase 5)

- Hero knapp und konkret: „WhatsApp-Sprachnachricht → fertiges Malerangebot → teilen" (Struktur von handwerks-ki).
- „Keine erfundenen Preise" **nur als Nebenbotschaft erwähnen**, nicht als Held (Dirks Entscheidung: man kontrolliert eh vor Versand).
- „Mit echten Malern entwickelt" + Zahlen-Testimonials (siehe 1.3).
- Falls der Aufnahme-Knopf (1.1) noch nicht steht: als Übergang eine animierte Live-Vorschau „vom Diktat zum Angebot in 30 Sek." (handwerkstool).
- Trust-Zeile „DSGVO-konform, in Deutschland gehostet" als festes Element.

---

## 5. Bewusst NICHT übernehmen (widerspricht früheren Entscheidungen)

- **Kunden-„Annehmen"/Freigabe im Browser** (quotekit): Annehmen-Knopf wurde aus rechtlichen Gründen gestrichen (Klick-Vertragsschluss). Bleibt draußen.
- **Original-Sprachnachricht/Transkript neben dem Ergebnis zeigen** (handwerker-rechnungen): Transkript-Zugriff wurde bewusst entfernt. Der Readback-Loop (2.1) liefert dasselbe Vertrauen ohne Wiedereinblenden.

---

## 6. Beobachtungen (keine Aufgabe)

- **Preisniveau:** Wettbewerb teils 9,99–29 €/Mon (vetron, handwerks-ki, meistio, quotekit). AuftragsBoss 49/99/199 € liegt im oberen Drittel → die Maler-Spezialisierung muss den Aufpreis tragen.
- **`gintix.de`** noch manuell im Browser ansehen (reine JavaScript-Seite, ließ sich nicht auslesen; positioniert sich als „Handwerker-Software mit KI · WhatsApp" — konzeptionell am nächsten an AuftragsBoss).
