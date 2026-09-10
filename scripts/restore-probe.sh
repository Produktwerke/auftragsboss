#!/bin/bash
# Restore-Probe: beweist, dass die Backups WIRKLICH wiederherstellbar sind.
# (Audit AB-H07: "Ein Backup ohne getesteten Restore ist eine Hoffnung.")
#
# Prüft das NEUESTE lokale Archiv (entpacken, DB-Integrität, Zeilen zählen,
# Konfig-Dateien vorhanden) und die NEUESTE Offsite-Kopie (herunterladen,
# entschlüsseln, Inhalt listen). Verändert nichts am laufenden System.
#
# Seit 10.09.2026 (Nach-Audit S-04) läuft die Probe MONATLICH per Cron und
# meldet sich bei healthchecks.io: steht in /root/restore-probe-heartbeat-url.txt
# eine Ping-URL, wird sie nach Erfolg aufgerufen, bei Fehlschlag mit /fail.
#   Cron:  45 4 1 * * /root/restore-probe.sh >> /root/restore-probe.log 2>&1
# Von Hand jederzeit:  /root/restore-probe.sh
set -euo pipefail

DEST=/root/backups
HEARTBEAT=/root/restore-probe-heartbeat-url.txt
TMP=$(mktemp -d)

ping_hb() { # $1 = ok | fail
  [ -s "$HEARTBEAT" ] || return 0
  local url; url=$(head -1 "$HEARTBEAT")
  [ "$1" = ok ] || url="$url/fail"
  curl -fsS --max-time 10 -o /dev/null "$url" \
    && echo "$(date '+%F %T')  Heartbeat gemeldet ($1)." \
    || echo "$(date '+%F %T')  WARNUNG: Heartbeat-Ping fehlgeschlagen ($1)."
}
aufraeumen() {
  local rc=$?
  rm -rf "$TMP"
  if [ "$rc" -eq 0 ]; then
    ping_hb ok
  else
    echo "── RESTORE-PROBE FEHLGESCHLAGEN (Schritt-Status $rc, $(date '+%F %T'))"
    ping_hb fail
  fi
}
trap aufraeumen EXIT

echo "══ Restore-Probe $(date '+%F %T')"
NEU=$(ls -t "$DEST"/auftragsboss_*.tar.gz 2>/dev/null | head -1)
[ -n "$NEU" ] || { echo "FEHLER: kein lokales Backup gefunden."; exit 1; }

echo "── Lokales Archiv: $NEU"
tar xzf "$NEU" -C "$TMP"
INTEGRITAET=$(sqlite3 "$TMP/dev.db" 'PRAGMA integrity_check;')
echo "DB-Integrität:  $INTEGRITAET"
[ "$INTEGRITAET" = "ok" ] || { echo "FEHLER: Datenbank im Backup ist nicht integer."; exit 1; }
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
  # Und die Offsite-Kopie muss dieselbe intakte Datenbank enthalten.
  mkdir -p "$TMP/off" && tar xzf "$TMP/off.tar.gz" -C "$TMP/off"
  OFF_INTEGRITAET=$(sqlite3 "$TMP/off/dev.db" 'PRAGMA integrity_check;')
  echo "Offsite-DB:     $OFF_INTEGRITAET"
  [ "$OFF_INTEGRITAET" = "ok" ] || { echo "FEHLER: Datenbank in der Offsite-Kopie ist nicht integer."; exit 1; }
else
  echo "FEHLER: rclone oder Passphrase fehlt — Offsite-Kopie nicht prüfbar."
  exit 1
fi

echo "── RESTORE-PROBE OK ($(date '+%F %T'))"
