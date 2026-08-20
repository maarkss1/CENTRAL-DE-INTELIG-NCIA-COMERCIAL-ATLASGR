#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Script de Deploy e Configuração no Oracle Cloud Infrastructure (OCI)
# Central de Inteligência Comercial AtlasGR
# ==============================================================================

ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.oci.yml"

echo "========================================================"
echo "🚀 Iniciando Setup e Deploy no Oracle Cloud (OCI)"
echo "========================================================"

set_env_value() {
    local key="$1"
    local value="$2"

    if grep -q "^${key}=" "$ENV_FILE"; then
        sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    else
        printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
    fi
}

ensure_secret() {
    local key="$1"
    local bytes="$2"
    local current=""

    current=$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)
    case "$current" in
        ""|replace-*|*troque*|*change-me*|*CHANGE_ME*)
            set_env_value "$key" "$(openssl rand -hex "$bytes")"
            echo "🔑 Segredo ${key} gerado em ${ENV_FILE}."
            ;;
    esac
}

# 1. Configura regras de firewall no Linux (Oracle Linux / Ubuntu)
echo "🔒 1. Configurando regras de firewall local para portas 80, 443 e 22..."
if command -v iptables &> /dev/null; then
    sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT || true
    sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT || true
    if command -v netfilter-persistent &> /dev/null; then
        sudo netfilter-persistent save || true
    fi
fi

if command -v ufw &> /dev/null; then
    sudo ufw allow 80/tcp || true
    sudo ufw allow 443/tcp || true
    sudo ufw allow 22/tcp || true
fi

# 2. Verifica Docker e Docker Compose
if ! command -v docker &> /dev/null; then
    echo "📦 Instalando Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker "$USER" || true
    rm -f get-docker.sh
fi

if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose v2 não está disponível. Instale o plugin docker compose antes de continuar."
    exit 1
fi

if ! command -v openssl &> /dev/null; then
    echo "❌ OpenSSL é obrigatório para gerar os segredos de produção."
    exit 1
fi

# 3. Cria e protege .env.production; segredos nunca ficam versionados.
if [ ! -f "$ENV_FILE" ]; then
    echo "📝 Criando ${ENV_FILE} a partir do .env.example..."
    cp .env.example "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

ensure_secret "BETTER_AUTH_SECRET" 32
ensure_secret "CREDENTIALS_ENCRYPTION_KEY" 32
ensure_secret "BOOTSTRAP_DB_PASSWORD" 24
ensure_secret "APP_DB_PASSWORD" 24
ensure_secret "REDIS_PASSWORD" 24
ensure_secret "INITIAL_ADMIN_PASSWORD" 24

# Garante que a aplicação de produção use os endpoints internos do Compose.
set_env_value "NODE_ENV" "production"

# Valida a interpolação antes de iniciar qualquer container. Os operadores :? no YAML
# fazem o Compose falhar imediatamente se algum segredo obrigatório estiver ausente.
echo "🔎 3. Validando configuração do Docker Compose..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config --quiet

# 4. Sobe a infraestrutura no Docker Compose
echo "🐳 4. Construindo e subindo containers (App, Worker, Postgres, Redis, Caddy)..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build

# 5. Aguarda o banco ficar pronto e executa as migrações Prisma
echo "⏳ 5. Aguardando banco de dados..."
until docker exec -i atlasgr_postgres pg_isready -U prospector -d prospectordb; do
  echo "Aguardando Postgres..."
  sleep 2
done

echo "🗄️ 6. Executando migrações Prisma..."
docker exec -i atlasgr_app npx prisma migrate deploy

# 7. Executa o seed para garantir o usuário único administrador.
echo "👤 7. Configurando usuário único administrador..."
docker exec -i atlasgr_app npx tsx scripts/seed-team.ts

echo "========================================================"
echo "✅ Deploy no Oracle Cloud concluído com sucesso!"
echo "Acesse seu domínio ou IP público com HTTPS automático."
echo "A credencial inicial do administrador está somente em ${ENV_FILE}."
echo "Nenhum segredo é exibido neste log."
echo "========================================================"
