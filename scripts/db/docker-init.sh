#!/bin/bash
set -e

# Rodado automaticamente pelo entrypoint oficial do Postgres (docker-entrypoint-initdb.d) SOMENTE
# na primeira inicializacao de um volume novo. Chama create-app-role.sql (montado ao lado deste
# arquivo pelo docker-compose.yml, com extensao .sql.tpl pra nao ser executado direto pelo
# entrypoint) pra criar o papel NOSUPERUSER que a app deve usar em vez do superusuario de bootstrap.

: "${APP_DB_PASSWORD:?defina APP_DB_PASSWORD no docker-compose.yml}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$APP_DB_PASSWORD" \
  -f /docker-entrypoint-initdb.d/create-app-role.sql.tpl
