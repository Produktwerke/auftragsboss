# Offsite-Backup einrichten (IONOS S3 Object Storage)

Einmalige Einrichtung. Danach läuft die verschlüsselte Kopie außer Haus
automatisch jede Nacht mit dem bestehenden Backup mit.

**Merkregel wie beim Deploy:**
`PS C:\…>` = dein PC · `root@…:~#` = der Server (per SSH).

---

## Schritt 1 — Bei IONOS den Speicher anlegen (im Browser)

1. IONOS-Kundenbereich → **Object Storage (S3)** dazubuchen (EU-Region, z. B.
   Frankfurt/Berlin — Hauptsache Deutschland/EU).
2. Einen **Bucket** anlegen, Name: **`auftragsboss-backup`**.
3. **Zugangsschlüssel** erzeugen und beide Werte notieren:
   - **Access Key** (öffentlicher Teil)
   - **Secret Key** (geheim — wird nur einmal angezeigt!)
4. Den **Endpoint** deiner Region notieren, IONOS zeigt ihn beim Bucket an, z. B.
   `s3-eu-central-1.ionoscloud.com` (Frankfurt) oder `s3-eu-central-2.ionoscloud.com` (Berlin).

> Diese 3 Werte (Access Key, Secret, Endpoint) brauchst du gleich in Schritt 3.

---

## Schritt 2 — rclone auf dem Server installieren

Auf dem Server (`ssh root@87.106.165.151`):

```bash
apt update && apt install -y rclone openssl sqlite3
```

---

## Schritt 3 — Zugang zu IONOS eintragen (rclone-Konfig)

Auf dem Server. Ersetze die drei GROSS geschriebenen Platzhalter durch deine
Werte aus Schritt 1, dann alles auf einmal einfügen:

```bash
mkdir -p /root/.config/rclone
cat > /root/.config/rclone/rclone.conf <<'EOF'
[offsite]
type = s3
provider = IONOS
access_key_id = DEIN_ACCESS_KEY
secret_access_key = DEIN_SECRET_KEY
endpoint = s3-eu-central-1.ionoscloud.com
EOF
chmod 600 /root/.config/rclone/rclone.conf
```

Test, ob der Zugang klappt (muss den Bucket auflisten, keine Fehlermeldung):

```bash
rclone lsd offsite:
```

---

## Schritt 4 — Backup-Passwort setzen ⚠️ WICHTIG

Das Passwort verschlüsselt die Offsite-Kopie. **Ohne dieses Passwort ist die
Kopie außer Haus im Ernstfall unlesbar.** Deshalb: erzeugen **und an einem
zweiten Ort sichern** (Passwort-Manager, NICHT nur auf dem Server).

```bash
openssl rand -base64 32 > /root/backup-passphrase.txt
chmod 600 /root/backup-passphrase.txt
cat /root/backup-passphrase.txt
```

Den ausgegebenen Wert **kopiere in deinen Passwort-Manager** (Eintrag z. B.
„AuftragsBoss Backup-Passwort"). Erledigt? Weiter.

---

## Schritt 5 — Das neue Backup-Skript auf den Server bringen

Vom PC (das aktualisierte Skript liegt im Projekt unter `scripts/backup.sh`):

```bash
scp "scripts/backup.sh" root@87.106.165.151:/root/backup-auftragsboss.sh
```

Auf dem Server ausführbar machen:

```bash
chmod +x /root/backup-auftragsboss.sh
```

> Der Cron-Job (`15 3 * * * /root/backup-auftragsboss.sh …`) läuft schon von
> vorher — du musst nichts an der Uhrzeit ändern.

---

## Schritt 6 — Einmal testen

Auf dem Server einmal von Hand starten und die Ausgabe ansehen:

```bash
/root/backup-auftragsboss.sh
```

Du solltest zwei Erfolgszeilen sehen:
```
… Lokales Backup OK: /root/backups/auftragsboss_….tar.gz (…)
… Offsite-Kopie OK: offsite:auftragsboss-backup/daily/auftragsboss_….tar.gz.enc
```

Und die Datei am Ziel prüfen:

```bash
rclone ls offsite:auftragsboss-backup/daily
```

Fertig. Ab jetzt liegt jede Nacht eine verschlüsselte Kopie außer Haus (30 Tage
Aufbewahrung), zusätzlich zu den lokalen 14 Tagen.

---

## Im Ernstfall wiederherstellen (aus der Offsite-Kopie)

```bash
# 1) Datei herunterladen
rclone copy offsite:auftragsboss-backup/daily/auftragsboss_DATUM.tar.gz.enc .
# 2) entschlüsseln (Passwort-Datei bzw. den Wert aus dem Passwort-Manager)
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in auftragsboss_DATUM.tar.gz.enc -out auftragsboss_DATUM.tar.gz \
  -pass file:/root/backup-passphrase.txt
# 3) entpacken → dev.db nach /root/app/prisma/, uploads/ nach /root/app/, dann:
pm2 restart auftragsboss
```
