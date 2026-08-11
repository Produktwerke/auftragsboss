#!/bin/bash
# Tägliches Backup von AuftragsBoss auf dem VPS — MIT Offsite-Kopie.
#
# Ablauf:
#   1. Konsistente Kopie der SQLite-Datenbank (sqlite3 .backup, läuft gefahrlos
#      während die App aktiv ist) + uploads/-Ordner (Logos) in EIN tar.gz.
#   2. Lokale Aufbewahrung in /root/backups, 14 Tage (ältere werden gelöscht).
#   3. Das Archiv wird VERSCHLÜSSELT (AES-256, Passwort aus einer Datei) und die
#      verschlüsselte Kopie zu IONOS S3 (außer Haus) hochgeladen — dort 30 Tage.
#      Das Ziel sieht nur die verschlüsselte Datei; ohne das Passwort ist sie
#      wertlos. Deshalb enthält die Sicherung gefahrlos echte Kundendaten.
#
# Einrichtung: siehe scripts/OFFSITE-BACKUP-EINRICHTEN.md
# Cron (täglich 03:15):
#   15 3 * * * /root/backup-auftragsboss.sh >> /root/backup.log 2>&1
#
# Wiederherstellen (lokal): Archiv entpacken, dev.db nach prisma/ und uploads/
#   zurück, dann `pm2 restart auftragsboss`.
# Wiederherstellen (aus der Offsite-Kopie): erst entschlüsseln, dann wie oben:
#   openssl enc -d -aes-256-cbc -pbkdf2 -in DATEI.tar.gz.enc -out DATEI.tar.gz \
#     -pass file:/root/backup-passphrase.txt
set -euo pipefail

APP=/root/app
DEST=/root/backups
STAMP=$(date +%Y-%m-%d_%H%M)

# ── Offsite-Einstellungen (IONOS S3 via rclone) ──────────────────────────────
# Name des rclone-Remotes (aus rclone.conf) und Bucket/Prefix am Ziel.
OFFSITE_REMOTE=offsite          # so heißt das Remote in ~/.config/rclone/rclone.conf
OFFSITE_BUCKET=auftragsboss-backup   # dein Bucket-Name bei IONOS
OFFSITE_PREFIX=daily            # Unterordner im Bucket
OFFSITE_TAGE=30                 # so lange die Offsite-Kopien aufbewahrt werden
PASSDATEI=/root/backup-passphrase.txt   # enthält NUR das Backup-Passwort

mkdir -p "$DEST" "$APP/uploads"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 1) Konsistente Momentaufnahme der Datenbank (kein Stopp der App nötig).
sqlite3 "$APP/prisma/dev.db" ".backup '$TMP/dev.db'"

# 2) DB-Kopie + Logos in EIN Archiv (lokal, unverschlüsselt).
ARCHIV="$DEST/auftragsboss_$STAMP.tar.gz"
tar -czf "$ARCHIV" -C "$TMP" dev.db -C "$APP" uploads

# Lokale Backups älter als 14 Tage entfernen.
find "$DEST" -name 'auftragsboss_*.tar.gz' -mtime +14 -delete

echo "$(date '+%F %T')  Lokales Backup OK: $ARCHIV ($(du -h "$ARCHIV" | cut -f1))"

# 3) Offsite-Kopie: verschlüsseln und zu IONOS S3 hochladen.
#    Übersprungen (mit Hinweis), falls rclone oder die Passwort-Datei fehlen —
#    das lokale Backup ist dann trotzdem schon sicher geschrieben.
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
