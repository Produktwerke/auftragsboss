#!/bin/bash
# Serverseitiges Deploy für AuftragsBoss — läuft als Nutzer auftragsboss, nie als root.
# (Nach-Audit 10.09.2026, S-01: Nach dem Datenbankvorfall vom 07.09. darf ein
#  Deploy die Datenbank und die Kundendateien strukturell nicht mehr erreichen.)
#
# Ablauf:
#   1. Archiv prüfen: keine Datenbank-, keine .env-Dateien, src/server.ts vorhanden
#   2. Datenbank sichern (sqlite3 .backup + integrity_check) nach ~/daten/vor-deploy.db
#   3. Rollback-Stand des App-Ordners packen (~/rollback, die letzten 3)
#   4. Entpacken (Datenbank/.env/uploads ausgeschlossen), npm ci nur bei geändertem Lockfile,
#      prisma generate, db push nur bei geändertem Schema (ohne Datenverlust-Flags)
#   5. pm2 restart
#   6. Prüfen: /health muss 200 liefern (macht seit 10.09. eine Datenbankprobe) und
#      PRAGMA quick_check muss "ok" sein — sonst automatisch zurück auf den Rollback-Stand
#
# Aufruf (von root aus, nach scp nach ~auftragsboss/eingang/):
#   su - auftragsboss -c '~/deploy.sh'
# Die Datenbank liegt unter ~/daten/dev.db (DATABASE_URL absolut), uploads unter ~/daten/uploads.
set -euo pipefail

ARCHIV="${1:-$HOME/eingang/deploy.tar.gz}"
APP="$HOME/app"
DATEN="$HOME/daten"
ROLL="$HOME/rollback"
STAMP=$(date +%Y%m%d_%H%M%S)
log() { echo "$(date '+%F %T')  $*"; }

[ -s "$ARCHIV" ] || { log "ABBRUCH: Archiv $ARCHIV fehlt oder ist leer."; exit 1; }
[ -s "$DATEN/dev.db" ] || { log "ABBRUCH: $DATEN/dev.db fehlt — Datenverzeichnis noch nicht eingerichtet?"; exit 1; }

# 1) Archiv prüfen
if tar -tzf "$ARCHIV" | grep -qE '(^|/)(dev\.db|\.env)'; then
  log "ABBRUCH: Archiv enthält Datenbank- oder .env-Dateien (genau das hat am 07.09. die Live-DB zerstört)."
  exit 1
fi
tar -tzf "$ARCHIV" | grep -qx 'src/server.ts' || { log "ABBRUCH: kein src/server.ts im Archiv — falsches Paket?"; exit 1; }

# 2) Datenbank sichern
sqlite3 "$DATEN/dev.db" ".backup '$DATEN/vor-deploy.db'"
if [ "$(sqlite3 "$DATEN/vor-deploy.db" 'PRAGMA integrity_check;' 2>&1 | head -1)" != "ok" ]; then
  log "ABBRUCH: Datenbank-Sicherung vor dem Deploy ist nicht integer — erst die Datenbank prüfen."
  exit 1
fi
chmod 600 "$DATEN/vor-deploy.db"

# 3) Rollback-Stand
mkdir -p "$ROLL"
tar -czf "$ROLL/app-$STAMP.tar.gz" -C "$APP" src prisma knowledge package.json package-lock.json tsconfig.json preisliste.json
ls -t "$ROLL"/app-*.tar.gz 2>/dev/null | tail -n +4 | xargs -r rm -f

# 4) Entpacken + Abhängigkeiten
LOCK_VOR=$(md5sum "$APP/package-lock.json" | cut -d' ' -f1)
SCHEMA_VOR=$(md5sum "$APP/prisma/schema.prisma" | cut -d' ' -f1)
tar xzf "$ARCHIV" -C "$APP" --exclude='prisma/dev.db*' --exclude='.env' --exclude='uploads' --no-same-owner --no-same-permissions
cd "$APP"
if [ "$(md5sum package-lock.json | cut -d' ' -f1)" != "$LOCK_VOR" ]; then
  log "Abhängigkeiten geändert: npm ci"
  npm ci --no-audit --no-fund
fi
npx prisma generate >/dev/null
if [ "$(md5sum prisma/schema.prisma | cut -d' ' -f1)" != "$SCHEMA_VOR" ]; then
  log "Schema geändert: prisma db push (ohne Datenverlust-Flags; bricht bei Datenverlust-Nachfrage ab)"
  npx prisma db push --skip-generate
fi

# 5) Neustart
pm2 restart auftragsboss --update-env >/dev/null

# 6) Prüfen, sonst Rollback
gesund=0
for _ in 1 2 3 4 5 6 7 8; do
  sleep 3
  if curl -fsS --max-time 5 http://127.0.0.1:3000/health >/dev/null 2>&1; then gesund=1; break; fi
done
DBCHECK=$(sqlite3 -readonly "$DATEN/dev.db" 'PRAGMA quick_check;' 2>&1 | head -1)
if [ "$gesund" = 1 ] && [ "$DBCHECK" = "ok" ]; then
  log "DEPLOY OK ($STAMP): /health 200 mit Datenbankprobe, quick_check ok."
  rm -f "$ARCHIV"
  exit 0
fi

log "DEPLOY FEHLGESCHLAGEN (health=$gesund, db=$DBCHECK) — Rollback auf app-$STAMP.tar.gz"
tar xzf "$ROLL/app-$STAMP.tar.gz" -C "$APP"
npx prisma generate >/dev/null || true
pm2 restart auftragsboss --update-env >/dev/null || true
sleep 5
curl -fsS --max-time 5 http://127.0.0.1:3000/health >/dev/null 2>&1 && log "Rollback läuft, /health 200." || log "ACHTUNG: auch nach Rollback kein /health 200 — sofort prüfen (pm2 logs auftragsboss --err)."
exit 1
