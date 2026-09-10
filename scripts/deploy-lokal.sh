#!/bin/bash
# Lokales Gegenstück zu scripts/deploy.sh: packt, prüft, lädt hoch und stößt das
# serverseitige Deploy als Nutzer auftragsboss an. Läuft im Git-Bash unter Windows
# und nutzt Windows-OpenSSH (der Git-ssh kennt den Windows-Schlüsselagenten nicht).
#
#   bash scripts/deploy-lokal.sh
#
# Was NIE mitgeschickt wird: prisma/dev.db* (Datenbank + WAL/SHM), .env, uploads,
# scratch/, Messbank/. Bricht ab, wenn das Paket doch eine solche Datei enthält.
set -euo pipefail
cd "$(dirname "$0")/.."

SSH=/c/Windows/System32/OpenSSH/ssh.exe
SCP=/c/Windows/System32/OpenSSH/scp.exe
[ -x "$SSH" ] || { SSH=ssh; SCP=scp; }
SERVER=root@87.106.165.151
PAKET=deploy.tar.gz

tar --exclude='prisma/dev.db*' -czf "$PAKET" src prisma knowledge package.json package-lock.json tsconfig.json preisliste.json
# Liste erst in eine Variable: "tar | grep -q" würde die Pipe beim Treffer abbrechen,
# und mit pipefail wäre genau der Treffer dann als Fehler getarnt.
LISTE=$(tar -tzf "$PAKET")
if grep -qE '(^|/)(dev\.db|\.env)' <<<"$LISTE"; then
  echo "ABBRUCH: Paket enthält Datenbank- oder .env-Dateien."; rm -f "$PAKET"; exit 1
fi
echo "Paket: $(du -h "$PAKET" | cut -f1), $(wc -l <<<"$LISTE") Einträge, ohne dev.db/.env."

"$SCP" -q "$PAKET" "$SERVER:/home/auftragsboss/eingang/deploy.tar.gz"
rm -f "$PAKET"
"$SSH" "$SERVER" "chown auftragsboss:auftragsboss /home/auftragsboss/eingang/deploy.tar.gz && su - auftragsboss -c '~/deploy.sh'"
