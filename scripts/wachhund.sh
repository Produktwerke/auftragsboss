#!/bin/bash
# Wachhund: stündliche Selbstprüfung des Servers mit E-Mail-Alarm.
# (Audit AB-H08 — vorher erfuhr niemand von Ausfällen, siehe 16h-Vorfall im August.)
#
# Prüft: 1) App /health  2) Festplatte  3) Backup-Frische (< 26 h).
# Alarm: E-Mail über das SMTP-Konto der App (wachhund-mail.mjs), je Problem
# höchstens eine Mail alle 12 Stunden (sonst Mail-Flut bei Dauerproblem).
#
# Grenze des Verfahrens: Ist der GANZE Server tot, kann er natürlich nicht
# mehr mailen — dafür ist der EXTERNE Uptime-Check da (UptimeRobot auf
# https://api.auftragsboss.de/health, siehe RESTORE-RUNBOOK.md).
#
# Cron (stündlich):  20 * * * * /root/wachhund.sh >> /root/wachhund.log 2>&1
#
# Herzschlag (Nach-Audit 10.09.2026, S-05): Steht in /root/wachhund-heartbeat-url.txt
# eine healthchecks.io-Ping-URL, meldet sich der Wachhund am Ende jedes Laufs —
# ohne Befund an die URL, mit Befund an URL/fail. Bleibt der Ping aus, weil Cron
# oder der ganze Server steht, schlägt healthchecks.io von außen Alarm. Das
# ersetzt den blinden Fleck „der Wächter selbst läuft nicht mehr".
set -u
alarm=0

melde() { # $1=schluessel  $2=betreff  $3=text
  alarm=1
  local sperre="/root/wachhund-zuletzt-$1"
  local jetzt; jetzt=$(date +%s)
  if [ -f "$sperre" ] && [ $((jetzt - $(cat "$sperre" 2>/dev/null || echo 0))) -lt 43200 ]; then
    return 0
  fi
  echo "$jetzt" > "$sperre"
  echo "$(date '+%F %T')  ALARM: $2"
  node /root/wachhund-mail.mjs "$2" "$3" || echo "$(date '+%F %T')  Alarm-Mail fehlgeschlagen ($2)"
}

# 1) Antwortet die App?
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3000/health || echo 000)
if [ "$code" != "200" ]; then
  melde health "ALARM AuftragsBoss: App antwortet nicht (HTTP $code)" \
    "Der /health-Check auf dem Server liefert HTTP $code statt 200.
Prüfen: ssh root@87.106.165.151, dann: su - auftragsboss -c 'pm2 status' und 'pm2 logs auftragsboss --err'."
fi

# 2) Festplatte
voll=$(df -P / | awk 'NR==2{gsub("%","",$5); print $5}')
if [ "${voll:-0}" -ge 90 ]; then
  melde disk "ALARM AuftragsBoss: Festplatte zu ${voll}% voll" \
    "Die Festplatte des VPS ist zu ${voll}% voll. Prüfen: du -sh /home/auftragsboss/app/* /root/backups /home/auftragsboss/.pm2/logs"
fi

# 3) Backup-Frische (jünger als 26 h?)
if [ -z "$(find /root/backups -name 'auftragsboss_*.tar.gz' -mmin -1560 2>/dev/null | head -1)" ]; then
  melde backup "ALARM AuftragsBoss: Nächtliches Backup fehlt" \
    "In /root/backups liegt kein Backup, das jünger als 26 Stunden ist.
Prüfen: tail -20 /root/backup.log und /root/backup-auftragsboss.sh von Hand laufen lassen."
fi

# 4) Datenbank-Integrität (seit 07.09.2026: fremde WAL-Dateien aus einem Deploy hatten die
#    Live-DB korrumpiert; /health blieb grün, entdeckt erst 14 h später über das fehlende Backup).
#    quick_check liest nur; im WAL-Modus gefahrlos parallel zur laufenden App.
db_ergebnis=$(sqlite3 -readonly /home/auftragsboss/daten/dev.db 'PRAGMA quick_check;' 2>&1 | head -1)
if [ "$db_ergebnis" != "ok" ]; then
  melde db "ALARM AuftragsBoss: Datenbank-Prüfung fehlgeschlagen"     "PRAGMA quick_check auf /home/auftragsboss/daten/dev.db liefert: $db_ergebnis
Prüfen: su - auftragsboss -c 'pm2 logs auftragsboss --err --lines 50'. Ursache 07.09.2026 waren fremde dev.db-wal/-shm aus einem Deploy-Paket (siehe CLAUDE.md, Vorfall 07.09.). Nicht blind weiter deployen; erst Backup-Stand prüfen (/root/backups)."
fi

# 5) Hängende Angebots-Vorgänge (13.09.2026): offen seit über 45 Minuten mit Inhalt,
#    oder schon drei gescheiterte KI-Auswertungen (Selbstheilung läuft, aber es hakt).
#    Prisma speichert DateTime als Unix-Millisekunden.
haengend=$(sqlite3 -readonly /home/auftragsboss/daten/dev.db "SELECT count(*) FROM Vorgang WHERE status='OFFEN' AND (fehlversuche >= 3 OR (nachrichtenJson <> '[]' AND letzteAktivitaet < (strftime('%s','now') - 2700) * 1000));" 2>/dev/null || echo "?")
if [ "$haengend" != "0" ]; then
  melde vorgaenge "ALARM AuftragsBoss: $haengend Angebots-Vorgang/Vorgänge hängen"     "Es gibt $haengend offene Vorgänge, die seit über 45 Minuten kein Angebot bekommen haben oder mindestens dreimal an der KI-Auswertung gescheitert sind.
Prüfen: su - auftragsboss -c 'pm2 logs auftragsboss --err --lines 50' und die Alarm-Mails der App (Betreff ALARM AuftragsBoss: Angebot konnte nicht erstellt werden)."
fi

# 6) Herzschlag an healthchecks.io (nur wenn eine URL hinterlegt ist)
HEARTBEAT=/root/wachhund-heartbeat-url.txt
if [ -s "$HEARTBEAT" ]; then
  url=$(head -1 "$HEARTBEAT")
  [ "$alarm" = 0 ] || url="$url/fail"
  curl -fsS --max-time 10 -o /dev/null "$url" || echo "$(date '+%F %T')  WARNUNG: Herzschlag-Ping fehlgeschlagen."
fi
