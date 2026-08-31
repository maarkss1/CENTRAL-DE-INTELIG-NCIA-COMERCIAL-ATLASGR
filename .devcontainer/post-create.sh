#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Criado .env a partir de .env.example."
fi

# PLATFORM_OPERATOR_TOKEN exige >=16 chars quando definido (protege /admin/queues e /metrics),
# mas .env.example o deixa vazio de propósito (é um segredo, não pode ter valor real versionado).
# Sem isso o boot falha com "Too small: expected string to have >=16 characters".
if ! grep -qE "^PLATFORM_OPERATOR_TOKEN=.{16,}" .env; then
  TOKEN=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  sed -i "s/^PLATFORM_OPERATOR_TOKEN=.*/PLATFORM_OPERATOR_TOKEN=${TOKEN}/" .env
  echo "PLATFORM_OPERATOR_TOKEN gerado para este Codespace."
fi

npm install
npx prisma generate
npx prisma migrate deploy

cat <<'EOF'

Ambiente pronto. Para subir o servidor:
  npm run dev

Ollama e LiteLLM já estão no ar (portas 11434 e 4000), mas sem nenhum modelo baixado —
isso é proposital, o pull do llama3.1:8b (~4.9GB) não roda automaticamente na criação do
Codespace. Se quiser IA local funcionando, rode:
  docker compose exec ollama ollama pull llama3.1:8b
EOF
