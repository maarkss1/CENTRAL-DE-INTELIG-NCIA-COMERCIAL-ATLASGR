#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Restore/drill do PostgreSQL do stack self-hosted Oracle Cloud (docker-compose.oci.yml)
# Central de Inteligência Comercial AtlasGR
# ==============================================================================
#
# Por padrão, este script SEMPRE restaura para um banco de DRILL separado
# (prospectordb_restore_drill_<timestamp>), nunca para o banco de produção (prospectordb) —
# exatamente para permitir testar/validar um backup sem nenhum risco de sobrescrever dado real.
#
# Uso (drill, seguro, padrão):
#   ./scripts/restore-oci.sh backups/postgres/prospectordb_20260905_030000.sql.gz
#
# Uso (restauração real em cima do banco de produção — IRREVERSÍVEL, exige confirmação explícita):
#   ./scripts/restore-oci.sh backups/postgres/prospectordb_20260905_030000.sql.gz --target-db prospectordb --force
#
# Este script nunca executa DROP DATABASE nem TRUNCATE. Quando o banco de destino já existe e não
# está vazio, ele recusa continuar (a menos que --force seja passado), para nunca misturar dados de
# um restore em cima de um banco já populado silenciosamente.

CONTAINER="atlasgr_postgres"
POSTGRES_USER="prospector"
BACKUP_FILE="${1:-}"
TARGET_DB=""
FORCE=false

shift || true
while [ $# -gt 0 ]; do
    case "$1" in
        --target-db) TARGET_DB="$2"; shift 2 ;;
        --force) FORCE=true; shift ;;
        *) echo "❌ Argumento desconhecido: $1"; exit 1 ;;
    esac
done

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Uso: $0 <arquivo-de-backup.sql.gz> [--target-db NOME] [--force]"
    echo "   Arquivo de backup não encontrado: ${BACKUP_FILE:-<nenhum informado>}"
    exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "❌ Container ${CONTAINER} não está em execução."
    exit 1
fi

if [ -z "$TARGET_DB" ]; then
    TARGET_DB="prospectordb_restore_drill_$(date +%Y%m%d_%H%M%S)"
    echo "ℹ️  Nenhum --target-db informado — restaurando em banco de DRILL isolado: ${TARGET_DB}"
fi

if [ "$TARGET_DB" = "prospectordb" ] && [ "$FORCE" != "true" ]; then
    echo "❌ Restaurar direto sobre 'prospectordb' (produção) exige --force explícito."
    echo "   Confirme que você tem um backup do estado ATUAL antes de continuar (rode"
    echo "   ./scripts/backup-oci.sh primeiro) — esta operação sobrescreve dado real."
    exit 1
fi

EXISTING_COUNT=$(docker exec -i "$CONTAINER" psql -U "$POSTGRES_USER" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname = '${TARGET_DB}'")

if [ "$EXISTING_COUNT" = "1" ]; then
    TABLE_COUNT=$(docker exec -i "$CONTAINER" psql -U "$POSTGRES_USER" -d "$TARGET_DB" -tAc \
        "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")
    if [ "${TABLE_COUNT:-0}" -gt 0 ] && [ "$FORCE" != "true" ]; then
        echo "❌ O banco '${TARGET_DB}' já existe e tem ${TABLE_COUNT} tabela(s). Recusando sobrescrever"
        echo "   sem --force. Escolha outro --target-db para o drill, ou confirme com --force."
        exit 1
    fi
else
    echo "🗄️  Criando banco de destino '${TARGET_DB}'..."
    docker exec -i "$CONTAINER" psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE ${TARGET_DB};"
fi

echo "♻️  Restaurando ${BACKUP_FILE} em '${TARGET_DB}'..."
gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER" psql -U "$POSTGRES_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1

ROW_CHECK=$(docker exec -i "$CONTAINER" psql -U "$POSTGRES_USER" -d "$TARGET_DB" -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")
echo "✅ Restore concluído em '${TARGET_DB}' — ${ROW_CHECK} tabela(s) no schema public."

if [ "$TARGET_DB" != "prospectordb" ]; then
    echo "ℹ️  Este foi um banco de DRILL isolado, não afeta produção. Para removê-lo depois de validar:"
    echo "    docker exec -i ${CONTAINER} psql -U ${POSTGRES_USER} -d postgres -c \"DROP DATABASE ${TARGET_DB};\""
fi
