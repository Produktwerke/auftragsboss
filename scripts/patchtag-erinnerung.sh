#!/bin/bash
# Monatliche Erinnerung an den Patch-Tag (Nach-Audit S-06), Mail über das Alarm-Mail-Skript.
# Cron: 0 9 1 * * /root/patchtag-erinnerung.sh >> /root/wachhund.log 2>&1
UPDATES=$(apt-get -s upgrade 2>/dev/null | grep -oE '^[0-9]+ upgraded' | cut -d' ' -f1)
REBOOT=$([ -f /var/run/reboot-required ] && echo 'ja' || echo 'nein')
node /root/wachhund-mail.mjs "AuftragsBoss: Patch-Tag fällig (${UPDATES:-?} Updates offen)" "Hallo Dirk,

heute ist Patch-Tag für den AuftragsBoss-Server (87.106.165.151, Nutzer root).
Aktuell offen: ${UPDATES:-?} Updates, Neustart vom System angefordert: $REBOOT.

Die drei Befehle (PowerShell auf deinem Rechner):

1. ssh root@87.106.165.151
2. apt update && apt full-upgrade -y
3. reboot

Nach 2 Minuten prüfen:
curl.exe -s https://api.auftragsboss.de/health
Die Antwort muss \"db\":\"ok\" enthalten. Danach Claude Bescheid sagen, der prüft pm2, Wachhund und Logs.

Dauert etwa 5 Minuten, Ausfall 1 bis 2 Minuten. Details: scripts/RESTORE-RUNBOOK.md im Repo." && echo "$(date '+%F %T')  Patch-Tag-Erinnerung verschickt."
