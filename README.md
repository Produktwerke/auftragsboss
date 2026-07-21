# 🎙️ VoiceProtokoll Guard

**WhatsApp-Sprachnachricht rein → professionelle Protokoll-E-Mail raus.**
Keine App. Kein Login. Keine neue Software.

Der Handwerker diktiert nach dem Kundentermin im Auto die Auftragsdetails als
ganz normale WhatsApp-Sprachnachricht und bekommt Minuten später eine E-Mail mit:

1. **Fertigem Protokoll-Text** zum Weiterleiten an den Kunden
2. **Internem Archiv-Eintrag** (Beweissicherung, unveränderlich)
3. **Automatischem Gewährleistungs-Tracking** (§ 634a BGB: 2 J. Werkleistung / 5 J. Bauwerk) mit Erinnerung 3 Monate vor Ablauf — die eingebaute Wartungs-Verkaufschance

## Architektur

```
WhatsApp Voice ──▶ Meta Cloud API Webhook ──▶ Audio-Download
                                                   │
                                          Whisper (Transkript, DE)
                                                   │
                                    Claude Opus 4.8 (Structured Outputs)
                                                   │
              ┌────────────────────────────────────┤
              ▼                                    ▼
     E-Mail an Handwerker              SQLite/Postgres-Archiv
     (Protokoll + Archiv + Frist)      + Gewährleistungs-Frist
                                                   │
                              Cron 07:00 ──▶ Erinnerungs-Mails
```

**Stack:** Node.js 20+ · TypeScript · Fastify · Prisma · `@anthropic-ai/sdk` (Strukturierung) · OpenAI Whisper (Transkription) · Nodemailer (jedes SMTP) · node-cron

## Setup

### 1. Abhängigkeiten & Datenbank

```bash
npm install
cp .env.example .env      # und ausfüllen (siehe Kommentare in der Datei)
npm run db:push           # legt die SQLite-DB an
npm run db:seed           # Test-Handwerker anlegen (vorher Nummer/E-Mail in prisma/seed.ts eintragen!)
```

### 2. Meta WhatsApp Cloud API einrichten

1. [developers.facebook.com](https://developers.facebook.com) → App erstellen → Typ **Business** → Produkt **WhatsApp** hinzufügen
2. Unter *API Setup*: Test-Nummer + `WHATSAPP_PHONE_NUMBER_ID` + temporären `WHATSAPP_ACCESS_TOKEN` in die `.env` übernehmen
3. Server lokal starten und per Tunnel erreichbar machen:
   ```bash
   npm run dev
   npx ngrok http 3000
   ```
4. Unter *Configuration → Webhook*: Callback-URL `https://<ngrok-id>.ngrok.app/webhook/whatsapp`, Verify-Token = dein `WHATSAPP_VERIFY_TOKEN`, Feld **messages** abonnieren

### 3. Testen

Sprachnachricht an die Business-Nummer schicken, z. B.:

> „Erstelle ein Protokoll für Familie Müller in der Gartenstraße 12. Wir haben heute die Gastherme gewartet, den Brenner gereinigt und das Ausdehnungsgefäß getauscht. Zwei Stunden Arbeitszeit. Der Kunde wurde darauf hingewiesen, dass das Eckventil im Bad tropft — Folgetermin nächste Woche Dienstag."

→ WhatsApp-Bestätigung + E-Mail mit Protokoll landet im Postfach.

## Warum zwei KI-Anbieter?

- **Whisper (OpenAI)** transkribiert das Audio — Claude verarbeitet kein Audio-Input.
- **Claude Opus 4.8** strukturiert das Transkript. Structured Outputs garantieren
  valides JSON nach Zod-Schema — kein Parsing-Risiko, keine erfundenen Felder.

## Sicherheit / Produktion (offene Punkte)

- [ ] `X-Hub-Signature-256`-Prüfung im Webhook (App-Secret) — aktuell TODO
- [ ] Permanenten System-User-Token statt temporärem Access Token verwenden
- [ ] `datasource` auf PostgreSQL umstellen + Backups (das Archiv ist der Produktwert!)
- [ ] DSGVO: AVV mit OpenAI/Anthropic, Löschkonzept, Datenschutzerklärung

## Lizenz

Proprietär — internes Projekt.
