# Wiederherstellung nach Server-Ausfall (Restore-Runbook)

Stand 03.09.2026 (nach Audit-Maßnahme 11). Für den Fall, dass der VPS
beschädigt, gelöscht oder kompromittiert ist.

## Ziele (festgelegt)

- **RPO (maximaler Datenverlust): 24 Stunden** — das nächtliche Backup von
  03:15 ist der älteste akzeptierte Stand. Angebote des laufenden Tages
  können verloren gehen; die Handwerker haben ihre WhatsApp-Verläufe.
- **RTO (maximale Ausfallzeit): 4 Stunden** ab Entscheidung „wir bauen neu".

## Was das Backup enthält (seit v2, 03.09.2026)

Jede Nacht 03:15 → `/root/backups/auftragsboss_*.tar.gz` (14 Tage) und
verschlüsselt nach IONOS S3 `auftragsboss-backup/daily/` (30 Tage):

| Inhalt | Zweck |
|---|---|
| `dev.db` | komplette Datenbank (konsistente Momentaufnahme) |
| `uploads/` | Kunden-Logos |
| `konfig/app.env` | **alle Produktions-Geheimnisse** (Meta, Stripe, SMTP, Session…) |
| `konfig/Caddyfile` | Reverse-Proxy inkl. Security-Header |
| `konfig/00-hardening.conf` | SSH-Härtung |
| `konfig/crontab-root.txt` | Cron-Einträge (Backup, Wachhund) |
| `konfig/ufw-status.txt` | Firewall-Regeln zum Nachbauen |

Backup-Passwort: `/root/backup-passphrase.txt` **und in 1Password**
(„AuftragsBoss Backup"). Ohne dieses Passwort sind die Offsite-Kopien wertlos!

## Fall A: Server lebt noch, nur Daten kaputt

```bash
ssh root@87.106.165.151
ls -t /root/backups/          # neuestes Archiv wählen
cd $(mktemp -d) && tar xzf /root/backups/auftragsboss_JJJJ-MM-TT_HHMM.tar.gz
su - auftragsboss -c 'pm2 stop auftragsboss'
cp dev.db /home/auftragsboss/daten/dev.db
cp -r uploads/* /home/auftragsboss/daten/uploads/ 2>/dev/null || true
chown -R auftragsboss:auftragsboss /home/auftragsboss/app /home/auftragsboss/daten
su - auftragsboss -c 'pm2 start auftragsboss'
curl -s http://127.0.0.1:3000/health   # muss {"status":"ok"} liefern
```

## Fall B: Totalverlust — neuer VPS

1. **Neuen Ubuntu-24.04-VPS bei IONOS bestellen**, IP notieren.
2. **DNS umstellen:** IONOS-Kundencenter → `api.auftragsboss.de` (A-Record)
   auf die neue IP. (TTL abwarten; Caddy holt das TLS-Zertifikat automatisch,
   sobald DNS zeigt.)
3. **Grundinstallation** (als root):
   ```bash
   apt update && apt install -y nodejs npm caddy sqlite3 rclone fail2ban ufw unattended-upgrades
   # Node 24 ggf. über NodeSource, pm2 global:
   npm install -g pm2 tsx
   adduser --disabled-password --gecos "" auftragsboss
   ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable
   ```
4. **Offsite-Backup holen** (Zugangsdaten für rclone + Passphrase aus
   1Password; rclone-Remote „offsite" wie in OFFSITE-BACKUP-EINRICHTEN.md):
   ```bash
   rclone lsf offsite:auftragsboss-backup/daily | sort | tail -1
   rclone copyto offsite:auftragsboss-backup/daily/DATEI.enc /root/wieder.enc
   openssl enc -d -aes-256-cbc -pbkdf2 -in /root/wieder.enc -out /root/wieder.tar.gz -pass file:/root/backup-passphrase.txt
   mkdir /root/wieder && tar xzf /root/wieder.tar.gz -C /root/wieder
   ```
5. **Code deployen:** vom PC das übliche `deploy.tar.gz` bauen und per scp
   hochladen, nach `/home/auftragsboss/app` entpacken, `npm install`.
6. **Konfiguration zurückspielen:**
   ```bash
   cp /root/wieder/konfig/app.env /home/auftragsboss/app/.env && chmod 600 /home/auftragsboss/app/.env
   cp /root/wieder/dev.db /home/auftragsboss/daten/dev.db
   cp -r /root/wieder/uploads /home/auftragsboss/daten/
   chown -R auftragsboss:auftragsboss /home/auftragsboss/app /home/auftragsboss/daten
   cp /root/wieder/konfig/Caddyfile /etc/caddy/Caddyfile && systemctl reload caddy
   cp /root/wieder/konfig/00-hardening.conf /etc/ssh/sshd_config.d/ && systemctl restart ssh
   # Cron-Einträge aus konfig/crontab-root.txt per crontab -e nachtragen,
   # backup-/wachhund-/restore-probe-Skripte aus dem Repo (scripts/) kopieren.
   ```
7. **App starten:** `su - auftragsboss -c 'cd ~/app && pm2 start npm --name auftragsboss -- run start:prod && pm2 save'`,
   dann als root `pm2 startup systemd -u auftragsboss --hp /home/auftragsboss`.
8. **Verifizieren:** `https://api.auftragsboss.de/health` = 200, /stasi-Login,
   eine Test-Sprachnachricht per WhatsApp, Stripe-Webhook-Ziel prüfen
   (zeigt auf api.auftragsboss.de — bleibt gültig, da nur DNS wechselte).
9. **Nachsorge:** SSH-Schlüssel der zwei PCs neu hinterlegen, dann Passwort-
   Login abschalten (siehe CLAUDE.md „Server-Härtung"); fail2ban prüfen;
   Wachhund-Testlauf `/root/wachhund.sh`.

## Fall C: Kompromittierter Server (Einbruch)

Wie Fall B, aber ZUSÄTZLICH danach: **alle Geheimnisse rotieren**
(Meta-Systemtoken, Stripe-Keys + Webhook-Secret, SMTP-Passwort,
SESSION_SECRET, ADMIN_PASSWORT_HASH neu) — die alte .env gilt als gestohlen.
Stripe/Meta-Dashboards auf fremde Änderungen prüfen. Kunden informieren,
falls Datenabfluss möglich war (DSGVO Art. 33: 72-Stunden-Frist prüfen).

## Externe Überwachung (gehört dazu)

- **UptimeRobot** (kostenlos): HTTPS-Monitor auf
  `https://api.auftragsboss.de/health`, Alarm an Dirks E-Mail —
  meldet den Fall „Server komplett tot", den der interne Wachhund
  naturgemäß nicht melden kann.
- **healthchecks.io** (kostenlos), drei Checks mit je eigener Ping-URL in einer
  Datei unter /root (eine Zeile, nur die URL):
  - „AuftragsBoss Backup", Periode 1 Tag, Kulanz 2 h → `/root/heartbeat-url.txt`
    (meldet ausbleibende Backups, auch wenn sonst alles läuft).
  - „AuftragsBoss Herzschlag", Periode 1 h, Kulanz 30 Min → `/root/wachhund-heartbeat-url.txt`
    (der Wachhund pingt nach jedem Lauf, bei Befund mit /fail; bleibt der Ping aus,
    steht Cron oder der Server).
  - „AuftragsBoss Restore-Probe", Periode 31 Tage, Kulanz 2 Tage → `/root/restore-probe-heartbeat-url.txt`
    (die monatliche Probe meldet Erfolg oder /fail).
- **Bucket-Versionierung** (seit 10.09.2026 EIN, `rclone backend versioning offsite:auftragsboss-backup`):
  Überschreiben oder Löschen im Bucket legt nur eine neue Version an; ein
  kompromittierter Server kann die Offsite-Kopien nicht mehr vernichten. Ältere
  Versionen bleiben liegen (Speicher wächst um ca. 1 MB pro Tag; bei Bedarf in
  der IONOS-Konsole eine Lebenszyklus-Regel für alte Versionen setzen).

## Proben-Kalender

- **Monatlich automatisch:** `/root/restore-probe.sh` am 1. um 04:45 (Cron),
  Protokoll in `/root/restore-probe.log`, Heartbeat s. o. (letzte Probe von Hand: 10.09.2026 ✅).
- **Monatlich von Hand (Dirk), Erinnerung per Mail am 1. um 09:00 (`/root/patchtag-erinnerung.sh`, Cron):** Patch-Tag `apt update && apt full-upgrade -y && reboot`,
  danach prüfen: `curl -s https://api.auftragsboss.de/health` muss `"db":"ok"` liefern.
- **Jährlich:** einmal Fall B gedanklich durchgehen und Runbook aktualisieren.
