#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Script de Deploy e Configuração no Oracle Cloud Infrastructure (OCI)
# Central de Inteligência Comercial AtlasGR
# ==============================================================================

echo "========================================================"
echo "🚀 Iniciando Setup e Deploy no Oracle Cloud (OCI)"
echo "========================================================"

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

# 3. Cria .env.production caso não exista
if [ ! -f ".env.production" ]; then
    echo "📝 Criando .env.production a partir do .env.example..."
    cp .env.example .env.production || true
    
    # Gera segredo seguro para Better Auth se necessário
    if ! grep -q "BETTER_AUTH_SECRET=" .env.production || grep -q "BETTER_AUTH_SECRET=.*troque" .env.production; then
        AUTH_SECRET=$(openssl rand -hex 32)
        sed -i "s|BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=${AUTH_SECRET}|g" .env.production || echo "BETTER_AUTH_SECRET=${AUTH_SECRET}" >> .env.production
    fi
fi

# 4. Sobe a infraestrutura no Docker Compose
echo "🐳 4. Construindo e subindo containers (App, Worker, Postgres, Redis, Caddy)..."
docker compose -f docker-compose.oci.yml up -d --build

# 5. Aguarda o banco ficar pronto e executa as migrações Prisma
echo "⏳ 5. Aguardando banco de dados..."
until docker exec -i atlasgr_postgres pg_isready -U prospector -d prospectordb; do
  echo "Aguardando Postgres..."
  sleep 2
done

echo "🗄️ 6. Executando migrações Prisma..."
docker exec -i atlasgr_app npx prisma migrate deploy

# 7. Executa o seed para garantir o usuário único administrador
echo "👤 7. Configurando usuário único administrador (marcelo.nascimento@atlasgr.com.br)..."
docker exec -i atlasgr_app npx tsx scripts/seed-team.ts

echo "========================================================"
echo "✅ Deploy no Oracle Cloud concluído com sucesso!"
echo "Acesse seu domínio ou IP público com HTTPS automático."
echo "Login: marcelo.nascimento@atlasgr.com.br"
echo "Senha padrão: 01090109"
echo "========================================================"
