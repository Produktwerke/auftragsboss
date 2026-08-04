#!/bin/bash
# Tägliches Backup von AuftragsBoss auf dem VPS.
#
# Sichert die SQLite-Datenbank (konsistente Kopie via sqlite3 .backup, läuft
# gefahrlos während die App aktiv ist) UND den uploads/-Ordner (Logos der
# Betriebe) in ein datiertes tar.gz. Aufbewahrung: 14 Tage, ältere werden
# automatisch gelöscht.
#
# Einrichtung per Cron (täglich 03:15):
#   15 3 * * * /root/backup-auftragsboss.sh >> /root/backup.log 2>&1
#
# Wiederherstellen: Archiv entpacken, dev.db nach prisma/ und uploads/ zurück,
# dann `pm2 restart auftragsboss`.
set -euo pipefail

APP=/root/app
DEST=/root/backups
STAMP=$(date +%Y-%m-%d_%H%M)

mkdir -p "$DEST" "$APP/uploads"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Konsistente Momentaufnahme der Datenbank (kein Stopp der App nötig).
sqlite3 "$APP/prisma/dev.db" ".backup '$TMP/dev.db'"

# DB-Kopie + Logos in EIN Archiv.
tar -czf "$DEST/auftragsboss_$STAMP.tar.gz" -C "$TMP" dev.db -C "$APP" uploads

# Backups älter als 14 Tage entfernen.
find "$DEST" -name 'auftragsboss_*.tar.gz' -mtime +14 -delete

echo "$(date '+%F %T')  Backup OK: $DEST/auftragsboss_$STAMP.tar.gz ($(du -h "$DEST/auftragsboss_$STAMP.tar.gz" | cut -f1))"
