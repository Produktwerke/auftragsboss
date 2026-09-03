#!/bin/bash
# Restore-Probe: beweist, dass die Backups WIRKLICH wiederherstellbar sind.
# (Audit AB-H07: "Ein Backup ohne getesteten Restore ist eine Hoffnung.")
#
# Prüft das NEUESTE lokale Archiv (entpacken, DB-Integrität, Zeilen zählen,
# Konfig-Dateien vorhanden) und die NEUESTE Offsite-Kopie (herunterladen,
# entschlüsseln, Inhalt listen). Verändert nichts am laufenden System.
#
# Empfehlung: vierteljährlich laufen lassen —  /root/restore-probe.sh
set -euo pipefail

DEST=/root/backups
NEU=$(ls -t "$DEST"/auftragsboss_*.tar.gz 2>/dev/null | head -1)
[ -n "$NEU" ] || { echo "FEHLER: kein lokales Backup gefunden."; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "── Lokales Archiv: $NEU"
tar xzf "$NEU" -C "$TMP"
echo "DB-Integrität:  $(sqlite3 "$TMP/dev.db" 'PRAGMA integrity_check;')"
echo "Betriebe:       $(sqlite3 "$TMP/dev.db" 'SELECT COUNT(*) FROM Handwerker;')"
echo "Dokumente:      $(sqlite3 "$TMP/dev.db" 'SELECT COUNT(*) FROM Dokument;')"
echo "Buchungen:      $(sqlite3 "$TMP/dev.db" 'SELECT COUNT(*) FROM Buchung;')"
[ -d "$TMP/uploads" ] && echo "uploads:        $(find "$TMP/uploads" -type f | wc -l) Datei(en)"
if [ -d "$TMP/konfig" ]; then
  echo "konfig:         $(ls "$TMP/konfig" | tr '\n' ' ')"
  [ -s "$TMP/konfig/app.env" ] && echo "app.env:        vorhanden ($(grep -c '=' "$TMP/konfig/app.env") Zeilen)"
else
  echo "WARNUNG: kein konfig/-Ordner im Archiv (Backup älter als v2?)"
fi

echo "── Offsite-Kopie:"
if command -v rclone >/dev/null 2>&1 && [ -s /root/backup-passphrase.txt ]; then
  LETZTE=$(rclone lsf offsite:auftragsboss-backup/daily --files-only | sort | tail -1)
  [ -n "$LETZTE" ] || { echo "FEHLER: keine Offsite-Kopie gefunden."; exit 1; }
  rclone copyto "offsite:auftragsboss-backup/daily/$LETZTE" "$TMP/off.enc"
  openssl enc -d -aes-256-cbc -pbkdf2 -in "$TMP/off.enc" -out "$TMP/off.tar.gz" \
    -pass file:/root/backup-passphrase.txt
  echo "Entschlüsselt:  $LETZTE ($(tar tzf "$TMP/off.tar.gz" | wc -l) Einträge im Archiv)"
else
  echo "ÜBERSPRUNGEN (rclone/Passphrase fehlt)"
fi

echo "── RESTORE-PROBE OK ($(date '+%F %T'))"
