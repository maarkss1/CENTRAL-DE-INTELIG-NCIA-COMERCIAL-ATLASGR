#!/bin/bash
set -e

# Carrega variáveis do .env se existir
if [ -f .env ]; then
  export $(cat .env | grep -v '#' | awk '/=/ {print $1}')
fi

if [ -z "$1" ]; then
  echo "Usage: $0 <backup_file.sql>"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "Restoring from $BACKUP_FILE..."

# Requer que os binários do postgresql-client estejam instalados no runner
PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -p ${POSTGRES_PORT:-5434} -U $POSTGRES_USER -d $POSTGRES_DB < "$BACKUP_FILE"

echo "Restore completed successfully."
