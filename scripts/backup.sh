#!/bin/bash
set -e

# Carrega variáveis do .env se existir
if [ -f .env ]; then
  export $(cat .env | grep -v '#' | awk '/=/ {print $1}')
fi

BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="$BACKUP_DIR/prospectordb_backup_$TIMESTAMP.sql"

mkdir -p "$BACKUP_DIR"

echo "Creating backup at $FILENAME..."

# Requer que os binários do postgresql-client estejam instalados no runner
PGPASSWORD=$POSTGRES_PASSWORD pg_dump -h localhost -p ${POSTGRES_PORT:-5434} -U $POSTGRES_USER $POSTGRES_DB > "$FILENAME"

echo "Backup completed successfully."
