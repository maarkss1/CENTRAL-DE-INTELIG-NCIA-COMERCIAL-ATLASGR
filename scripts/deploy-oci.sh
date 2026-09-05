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

# Aviso se estiver rodando no Cloud Shell do navegador
if [ -n "${OCI_CS_TERMINAL:-}" ] || [[ "$(hostname 2>/dev/null || true)" == *"cloudshell"* ]]; then
    echo "⚠️  ATENÇÃO: Você está executando no Oracle Cloud Shell (terminal temporário do navegador)."
    echo "ℹ️  O Cloud Shell não possui permissões de root/sudo e é finalizado após inatividade."
    echo "👉 Para manter a aplicação ativa 24/7 acessível publicamente, execute este script dentro"
    echo "   de uma Instância de Computação (Compute Instance VM) criada na Oracle Cloud."
    echo "========================================================"
fi

set_env_value() {
    local key="$1"
    local value="$2"

    if grep -q "^${key}=" "$ENV_FILE"; then
        sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    else
        printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
    fi
}

needs_secret() {
    local key="$1"
    local current=""

    current=$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)
    case "$current" in
        ""|replace-*|*troque*|*change-me*|*CHANGE_ME*) return 0 ;;
        *) return 1 ;;
    esac
}

ensure_hex_secret() {
    local key="$1"
    local bytes="$2"

    if needs_secret "$key"; then
        set_env_value "$key" "$(openssl rand -hex "$bytes")"
        echo "🔑 Segredo ${key} gerado em ${ENV_FILE}."
    fi
}

ensure_base64_secret() {
    local key="$1"
    local bytes="$2"

    if needs_secret "$key"; then
        set_env_value "$key" "$(openssl rand -base64 "$bytes" | tr -d '\n')"
        echo "🔑 Segredo ${key} gerado em ${ENV_FILE}."
    fi
}

# Função auxiliar para executar com sudo apenas se disponível
run_sudo() {
    if command -v sudo &> /dev/null && [ -x "/usr/bin/sudo" ]; then
        sudo "$@"
    elif [ "$(id -u)" -eq 0 ]; then
        "$@"
    else
        echo "ℹ️  Permissão sudo não disponível, pulando: $*"
    fi
}

# 1. Configura regras de firewall no Linux se houver permissão
echo "🔒 1. Verificando firewall local..."
if command -v iptables &> /dev/null; then
    run_sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
    run_sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
    if command -v netfilter-persistent &> /dev/null; then
        run_sudo netfilter-persistent save 2>/dev/null || true
    fi
fi

if command -v ufw &> /dev/null; then
    run_sudo ufw allow 80/tcp 2>/dev/null || true
    run_sudo ufw allow 443/tcp 2>/dev/null || true
    run_sudo ufw allow 22/tcp 2>/dev/null || true
fi

# 2. Detecta ou instala Docker e Docker Compose
echo "🐳 2. Verificando Docker e Docker Compose..."
if ! command -v docker &> /dev/null; then
    echo "📦 Instalando Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    run_sudo sh get-docker.sh
    run_sudo usermod -aG docker "$USER" 2>/dev/null || true
    rm -f get-docker.sh
fi

DOCKER_COMPOSE_CMD=""
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    echo "⚙️  Instalando plugin do Docker Compose..."
    DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
    mkdir -p "$DOCKER_CONFIG/cli-plugins"
    ARCH=$(uname -m)
    case "$ARCH" in
        x86_64) COMPOSE_ARCH="x86_64" ;;
        aarch64|arm64) COMPOSE_ARCH="aarch64" ;;
        *) COMPOSE_ARCH="x86_64" ;;
    esac
    curl -sSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$COMPOSE_ARCH" -o "$DOCKER_CONFIG/cli-plugins/docker-compose" || true
    chmod +x "$DOCKER_CONFIG/cli-plugins/docker-compose" || true
    if docker compose version &> /dev/null; then
        DOCKER_COMPOSE_CMD="docker compose"
    elif [ -x "$DOCKER_CONFIG/cli-plugins/docker-compose" ]; then
        DOCKER_COMPOSE_CMD="$DOCKER_CONFIG/cli-plugins/docker-compose"
    else
        echo "❌ Docker Compose não está disponível."
        exit 1
    fi
fi

echo "✅ Docker Compose detectado: $DOCKER_COMPOSE_CMD"

if ! command -v openssl &> /dev/null; then
    echo "❌ OpenSSL é obrigatório para gerar os segredos de produção."
    exit 1
fi

# 3. Cria e protege .env.production; segredos nunca ficam versionados.
if [ ! -f "$ENV_FILE" ]; then
    echo "📝 Criando ${ENV_FILE} a partir do .env.example..."
    cp .env.example "$ENV_FILE"
fi
chmod 600 "$ENV_FILE" 2>/dev/null || true

ensure_hex_secret "BETTER_AUTH_SECRET" 32
# AES-256-GCM exige exatamente 32 bytes depois de decodificar Base64.
ensure_base64_secret "CREDENTIALS_ENCRYPTION_KEY" 32
ensure_base64_secret "PII_BLIND_INDEX_KEY" 32
ensure_hex_secret "BOOTSTRAP_DB_PASSWORD" 24
ensure_hex_secret "APP_DB_PASSWORD" 24
ensure_hex_secret "INITIAL_ADMIN_PASSWORD" 24

# Garante que a aplicação de produção use o modo correto.
set_env_value "NODE_ENV" "production"

current_value() {
    local key="$1"
    grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true
}

# 2.1 Domínio, CORS e cookies — só sobrescreve quando o valor atual ainda é o placeholder de
# desenvolvimento copiado do .env.example (contém "localhost") e um DOMAIN real foi passado no
# ambiente do shell (ex.: `DOMAIN=app.atlasgr.com.br ./scripts/deploy-oci.sh`). Preserva qualquer
# valor customizado que o operador já tenha definido manualmente no .env.production.
if [ -n "${DOMAIN:-}" ] && [ "$DOMAIN" != "localhost" ]; then
    PUBLIC_ORIGIN="https://${DOMAIN}"
    for key in ALLOWED_ORIGINS BETTER_AUTH_URL PUBLIC_BASE_URL; do
        case "$(current_value "$key")" in
            ""|*localhost*) set_env_value "$key" "$PUBLIC_ORIGIN" ;;
        esac
    done
    case "$(current_value "COOKIE_DOMAIN")" in
        "") set_env_value "COOKIE_DOMAIN" "$DOMAIN" ;;
    esac
    # Caddy sempre fica na frente da aplicação neste stack — cookie `secure` e confiança no
    # X-Forwarded-* do proxy são obrigatórios com domínio/HTTPS real.
    set_env_value "SECURE_COOKIES" "true"
    set_env_value "TRUST_PROXY" "true"
    echo "🌐 Domínio de produção configurado: ${PUBLIC_ORIGIN} (ALLOWED_ORIGINS/BETTER_AUTH_URL/PUBLIC_BASE_URL/COOKIE_DOMAIN)."
else
    echo "⚠️  DOMAIN não informado (ou é 'localhost') — ALLOWED_ORIGINS/BETTER_AUTH_URL/PUBLIC_BASE_URL"
    echo "    permanecem como estão em ${ENV_FILE}. Isso não é apropriado para produção real: exporte"
    echo "    DOMAIN=seu-dominio.com.br antes de rodar este script quando o domínio oficial estiver pronto"
    echo "    (ver 'Domínio' em docs/deploy/oracle-cloud.md)."
fi

# 2.2 Filas/Redis — OFF por padrão no MVP (mesma decisão já registrada em render.yaml: nenhuma
# jornada essencial depende disso hoje, ver docs/deploy/oracle-cloud.md). Só gera segredo e sobe o
# profile "queues" (redis + worker) quando o operador já colocou ENABLE_QUEUES=true no
# .env.production explicitamente antes de rodar este script.
COMPOSE_PROFILE_ARGS=()
if [ "$(current_value "ENABLE_QUEUES")" = "true" ]; then
    ensure_hex_secret "REDIS_PASSWORD" 24
    set_env_value "REDIS_URL" "redis://:$(current_value "REDIS_PASSWORD")@redis:6379"
    COMPOSE_PROFILE_ARGS=(--profile queues)
    echo "🔁 ENABLE_QUEUES=true — subindo também redis e worker (profile 'queues')."
else
    echo "ℹ️  ENABLE_QUEUES=false (padrão do MVP) — redis e worker NÃO serão iniciados. Ver"
    echo "    docs/deploy/oracle-cloud.md para como habilitar quando uma jornada real depender disso."
fi

# Valida a interpolação antes de iniciar qualquer container.
echo "🔎 3. Validando configuração do Docker Compose..."
$DOCKER_COMPOSE_CMD --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "${COMPOSE_PROFILE_ARGS[@]}" config --quiet

# 4. Sobe a infraestrutura no Docker Compose
echo "🚀 4. Construindo e subindo containers..."
$DOCKER_COMPOSE_CMD --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "${COMPOSE_PROFILE_ARGS[@]}" up -d --build

# 5. Aguarda o banco ficar pronto e executa as migrações Prisma
echo "⏳ 5. Aguardando banco de dados inicializar..."
RETRIES=30
until docker exec -i atlasgr_postgres pg_isready -U prospector -d prospectordb 2>/dev/null || [ "$RETRIES" -le 0 ]; do
  echo "Aguardando Postgres ($RETRIES tentativas restantes)..."
  sleep 2
  RETRIES=$((RETRIES - 1))
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
