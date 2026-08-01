#!/bin/bash
set -e

# Cria (ou atualiza a senha d)o papel de aplicacao NOSUPERUSER `prospector_app` num banco ja
# existente, e transfere a posse dos objetos existentes pra ele. Corrige N1 do
# docs/auditoria-divida-tecnica/08-PLANO-DE-SEGURANCA.md.
#
# Uso:
#   APP_DB_PASSWORD=<senha-do-papel-app> ./scripts/db/bootstrap-app-role.sh <host> <port> <superuser> <database>
#
# O superusuario informado precisa da senha disponivel via ~/.pgpass ou PGPASSWORD no ambiente
# (nao passamos senha de superusuario por argumento aqui de proposito).
#
# Exemplo (docker-compose local, ja rodando):
#   PGPASSWORD=prospector_pass APP_DB_PASSWORD=troque-isto \
#     ./scripts/db/bootstrap-app-role.sh localhost 5434 prospector prospectordb
#
# Depois de rodar, troque DATABASE_URL para usar prospector_app:APP_DB_PASSWORD no lugar do
# superusuario — a app nunca deve voltar a conectar como o papel de bootstrap.

if [ -z "$APP_DB_PASSWORD" ]; then
  echo "Defina APP_DB_PASSWORD (senha a ser usada pelo papel prospector_app) antes de rodar este script." >&2
  exit 1
fi

HOST="${1:?uso: bootstrap-app-role.sh <host> <port> <superuser> <database>}"
PORT="${2:?uso: bootstrap-app-role.sh <host> <port> <superuser> <database>}"
SUPERUSER="${3:?uso: bootstrap-app-role.sh <host> <port> <superuser> <database>}"
DATABASE="${4:?uso: bootstrap-app-role.sh <host> <port> <superuser> <database>}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

psql -v ON_ERROR_STOP=1 -h "$HOST" -p "$PORT" -U "$SUPERUSER" -d "$DATABASE" \
  -v app_password="$APP_DB_PASSWORD" \
  -f "$SCRIPT_DIR/create-app-role.sql"

echo "Papel prospector_app pronto em $DATABASE. Atualize DATABASE_URL para usar esse papel (nunca o superusuario)."
