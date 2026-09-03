#!/bin/bash
# Tägliches Backup von AuftragsBoss auf dem VPS — MIT Offsite-Kopie.
# (v2, 03.09.2026 — Audit AB-H07: sichert jetzt auch .env + Server-Konfigs.)
#
# Ablauf:
#   1. Konsistente Kopie der SQLite-Datenbank (sqlite3 .backup, läuft gefahrlos
#      während die App aktiv ist) + uploads/ (Logos) + KONFIGURATION
#      (.env der App, Caddyfile, SSH-Härtung, Cron-Einträge, Firewall-Stand)
#      in EIN tar.gz. Damit ist ein kompletter Server-Wiederaufbau möglich —
#      vorher wären beim Totalverlust alle Produktions-Geheimnisse weg gewesen.
#   2. Lokale Aufbewahrung in /root/backups (nur root lesbar), 14 Tage.
#   3. Verschlüsselt (AES-256, Passwort aus Datei) zu IONOS S3 — dort 30 Tage.
#   4. Optional: Heartbeat-Ping. Steht in /root/heartbeat-url.txt eine URL
#      (z. B. von healthchecks.io), wird sie nach ERFOLG aufgerufen — bleibt
#      der Ping aus, schlägt der Dienst extern Alarm ("Backup lief nicht").
#
# Cron (täglich 03:15):
#   15 3 * * * /root/backup-auftragsboss.sh >> /root/backup.log 2>&1
#
# Wiederherstellen: siehe scripts/RESTORE-RUNBOOK.md (Schritt für Schritt).
# Probe: /root/restore-probe.sh (vierteljährlich laufen lassen!).
set -euo pipefail

APP=/home/auftragsboss/app
DEST=/root/backups
STAMP=$(date +%Y-%m-%d_%H%M)

# ── Offsite-Einstellungen (IONOS S3 via rclone) ──────────────────────────────
OFFSITE_REMOTE=offsite               # Name in ~/.config/rclone/rclone.conf
OFFSITE_BUCKET=auftragsboss-backup   # Bucket bei IONOS
OFFSITE_PREFIX=daily
OFFSITE_TAGE=30
PASSDATEI=/root/backup-passphrase.txt
HEARTBEAT=/root/heartbeat-url.txt    # optional: eine Zeile mit der Ping-URL

mkdir -p "$DEST" "$APP/uploads"
chmod 700 "$DEST"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 1) Konsistente Momentaufnahme der Datenbank (kein Stopp der App nötig).
sqlite3 "$APP/prisma/dev.db" ".backup '$TMP/dev.db'"

# 1b) Konfiguration einsammeln — alles, was ein Wiederaufbau braucht.
mkdir -p "$TMP/konfig"
cp "$APP/.env"                          "$TMP/konfig/app.env"
cp /etc/caddy/Caddyfile                 "$TMP/konfig/Caddyfile"            2>/dev/null || true
cp /etc/ssh/sshd_config.d/00-hardening.conf "$TMP/konfig/00-hardening.conf" 2>/dev/null || true
crontab -l                            > "$TMP/konfig/crontab-root.txt"     2>/dev/null || true
ufw status verbose                    > "$TMP/konfig/ufw-status.txt"       2>/dev/null || true
chmod -R go-rwx "$TMP/konfig"

# 2) Alles in EIN Archiv (lokal; enthält Geheimnisse → nur root lesbar).
ARCHIV="$DEST/auftragsboss_$STAMP.tar.gz"
tar -czf "$ARCHIV" -C "$TMP" dev.db konfig -C "$APP" uploads
chmod 600 "$ARCHIV"

# Lokale Backups älter als 14 Tage entfernen.
find "$DEST" -name 'auftragsboss_*.tar.gz' -mtime +14 -delete

echo "$(date '+%F %T')  Lokales Backup OK: $ARCHIV ($(du -h "$ARCHIV" | cut -f1))"

# 3) Offsite-Kopie: verschlüsseln und zu IONOS S3 hochladen.
if ! command -v rclone >/dev/null 2>&1; then
  echo "$(date '+%F %T')  WARNUNG: rclone nicht installiert — Offsite-Upload übersprungen."
  exit 0
fi
if [ ! -s "$PASSDATEI" ]; then
  echo "$(date '+%F %T')  WARNUNG: $PASSDATEI fehlt/leer — Offsite-Upload übersprungen."
  exit 0
fi

ENC="$TMP/auftragsboss_$STAMP.tar.gz.enc"
openssl enc -aes-256-cbc -pbkdf2 -salt -in "$ARCHIV" -out "$ENC" -pass "file:$PASSDATEI"

ZIEL="$OFFSITE_REMOTE:$OFFSITE_BUCKET/$OFFSITE_PREFIX/auftragsboss_$STAMP.tar.gz.enc"
rclone copyto "$ENC" "$ZIEL"

# Offsite-Kopien älter als N Tage am Ziel entfernen.
rclone delete --min-age "${OFFSITE_TAGE}d" "$OFFSITE_REMOTE:$OFFSITE_BUCKET/$OFFSITE_PREFIX" || true

echo "$(date '+%F %T')  Offsite-Kopie OK: $ZIEL"

# 4) Heartbeat: nur nach VOLLEM Erfolg pingen.
if [ -s "$HEARTBEAT" ]; then
  curl -fsS --max-time 10 "$(head -1 "$HEARTBEAT")" >/dev/null \
    && echo "$(date '+%F %T')  Heartbeat gemeldet." \
    || echo "$(date '+%F %T')  WARNUNG: Heartbeat-Ping fehlgeschlagen."
fi
