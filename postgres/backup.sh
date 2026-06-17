#!/usr/bin/env bash
# Dump completo de la base (datos reales incluidos) fuera de git.
# Uso: ./postgres/backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

set -a; source .env; set +a

mkdir -p postgres/backups
out="postgres/backups/${POSTGRES_DB}_$(date +%F_%H%M).sql"

docker exec postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner > "$out"
echo "Backup guardado en $out"
