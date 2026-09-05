#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Backup do PostgreSQL do stack self-hosted Oracle Cloud (docker-compose.oci.yml)
# Central de Inteligência Comercial AtlasGR
# ==============================================================================
#
# `pg_dump` roda DENTRO do container `atlasgr_postgres` (via `docker exec`) — não exige
# postgresql-client instalado no host da VM. O dump sai comprimido (gzip) e é gravado FORA do
# container, na pasta indicada por BACKUP_DIR (padrão: um diretório no host, não um volume
# efêmero), cumprindo o requisito de "cópia fora do container" do checklist de Go-Live.
#
# Uso:
#   ./scripts/backup-oci.sh                    # backup completo, retenção padrão (14 dias)
#   BACKUP_DIR=/mnt/backups ./scripts/backup-oci.sh
#   BACKUP_RETENTION_DAYS=30 ./scripts/backup-oci.sh
#
# Agendamento recomendado (crontab do usuário que tem acesso ao Docker na VM):
#   0 3 * * * cd /caminho/do/repo && ./scripts/backup-oci.sh >> /var/log/atlasgr-backup.log 2>&1
#
# Cópia fora da própria VM (recomendado, não automatizado aqui por depender de credencial externa
# específica do operador — ex.: `rclone`/`rsync` para object storage, outro host via `scp`):
#   rclone copy "$BACKUP_DIR" remote:atlasgr-backups/postgres --max-age 25h
#
# Este script NUNCA executa DROP/TRUNCATE/reset — é estritamente leitura (pg_dump) contra o
# Postgres já em execução.

ENV_FILE=".env.production"
CONTAINER="atlasgr_postgres"
POSTGRES_DB="prospectordb"
POSTGRES_USER="prospector"
BACKUP_DIR="${BACKUP_DIR:-./backups/postgres}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="${BACKUP_DIR}/prospectordb_${TIMESTAMP}.sql.gz"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "❌ Container ${CONTAINER} não está em execução. Suba o stack (docker compose ... up -d) antes de rodar o backup."
    exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" 2>/dev/null || true

echo "📦 Gerando backup de ${POSTGRES_DB} em ${FILENAME}..."
# --format=plain (SQL puro) para restauração simples com `psql`; -O evita gravar OWNER
# (prospector, role de bootstrap) no dump, facilitando restaurar sob outra role se necessário.
docker exec -i "$CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --format=plain \
    | gzip -9 > "$FILENAME"

if [ ! -s "$FILENAME" ]; then
    echo "❌ Backup gerado está vazio — algo falhou no pg_dump. Removendo arquivo inválido."
    rm -f "$FILENAME"
    exit 1
fi

SIZE=$(du -h "$FILENAME" | cut -f1)
echo "✅ Backup concluído: ${FILENAME} (${SIZE})"

# Retenção local — remove backups mais antigos que BACKUP_RETENTION_DAYS. A cópia fora da VM
# (rclone/rsync, ver cabeçalho) deve ter sua própria política de retenção, independente desta.
echo "🧹 Aplicando retenção local de ${BACKUP_RETENTION_DAYS} dias em ${BACKUP_DIR}..."
find "$BACKUP_DIR" -name 'prospectordb_*.sql.gz' -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete || true

echo "ℹ️  Para restaurar/validar este backup, use ./scripts/restore-oci.sh (nunca contra o banco de produção sem --force)."
