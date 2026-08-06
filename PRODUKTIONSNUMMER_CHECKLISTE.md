# Produktionsnummer live schalten + Tester einladen

Nummer: **+49 174 936 4823** · Anzeigename **AuftragsBoss**

## 1. Bei Meta (dein Teil)

> **WICHTIG:** Das aktuelle Konto ist ein **„Test WhatsApp Business Account"** mit
> Limit von 1 Nummer (US-Testnummer). Deshalb ist „Telefonnummer hinzufügen"
> ausgegraut. Die **US-Testnummer NICHT löschen** — die Produktionsnummer gehört
> in ein **echtes (Produktions-)WABA**, nicht ins Test-Konto.

1. **Produktions-WABA anlegen** (falls noch keins da):
   - Weg A: `developers.facebook.com` → deine App → **WhatsApp → API-Einrichtung**
     → **Telefonnummer hinzufügen** (führt durch WABA-Anlage + Nummer, da Firma verifiziert).
   - Weg B: `business.facebook.com/settings` → **Konten → WhatsApp-Konten** →
     **Hinzufügen** → neues WABA anlegen.
2. Im WhatsApp-Manager oben rechts vom **Test**- aufs **Produktions-Konto** umschalten.
   Dann **Telefonnummern → Telefonnummer hinzufügen** → +49 174 936 4823 → per
   **SMS/Anruf-Code** verifizieren.
3. **Anzeigename** „AuftragsBoss" setzen.
4. **Zahlungsmethode** beim Produktions-WABA hinterlegen — ohne sendet die Nummer nicht.
5. Die **Phone Number ID** dieser Nummer kopieren (lange Zahl, im WhatsApp-Manager
   bzw. unter Developers → App → WhatsApp → API-Einrichtung).

> **Umzug vom Test- aufs Produktions-WABA:** Die App muss mit dem neuen WABA
> verbunden werden (`subscribed_apps`) und der Systembenutzer-Token muss das neue
> WABA abdecken. Webhook bleibt `https://api.auftragsboss.de/webhook/whatsapp`.
> Bei diesem Schritt gemeinsam durchgehen.

## 2. Server-Konfig (dein Teil, 2 Zeilen)

Die **Phone Number ID** aus Schritt 1.5 in die Server-`.env` eintragen und neu starten:

```bash
ssh root@87.106.165.151 "cd /root/app && sed -i '/^WHATSAPP_PHONE_NUMBER_ID=/d' .env && echo 'WHATSAPP_PHONE_NUMBER_ID=<DEINE_PHONE_NUMBER_ID>' >> .env && pm2 restart auftragsboss"
```

(`<DEINE_PHONE_NUMBER_ID>` ersetzen.) Der Zugangstoken (`WHATSAPP_ACCESS_TOKEN`,
Systembenutzer, Ablauf „Nie") ist schon gesetzt und deckt die WABA ab.

**Test:** dein Handy → Sprachnachricht an +49 174 936 4823 → es sollte kurz
darauf ein Angebot-Link zurückkommen.

## 3. Landingpage (schon vorbereitet)

`marketing/index.html` ist bereits auf die neue Nummer umgestellt (beide
WhatsApp-Buttons + echter QR-Code auf `wa.me/491749364823`).
→ **Nur noch die aktualisierte `index.html` bei IONOS in den `public`-Ordner hochladen.**

## 4. Tester einladen

Pro Tester einmal auf dem Server ausführen (legt ein echtes Konto an und druckt
Cockpit-/Import-Link + einen fertigen Einladungstext):

```bash
ssh root@87.106.165.151 "cd /root/app && npx tsx src/tester-einladen.ts 4917xxxxxxx 'Malerbetrieb Muster' 'Max Muster' mail@firma.de"
```

Nur die Nummer ist Pflicht; Firma/Name/E-Mail optional. Den ausgegebenen
Einladungstext an den Tester schicken (WhatsApp/E-Mail).

## Reihenfolge

1 (Meta) → 2 (Server-.env) → Test-Sprachnachricht → 3 (Landingpage hochladen) → 4 (Tester einladen).
