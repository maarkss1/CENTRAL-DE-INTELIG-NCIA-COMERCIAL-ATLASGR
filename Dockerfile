# Stage 1: Build
FROM node:22-slim AS builder

WORKDIR /app

ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/prospector"

RUN apt-get update && apt-get install -y openssl python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*

# .npmrc carrega `legacy-peer-deps=true` (mem0ai fixa peer @types/pg@8.11.0, incompatível com o
# @types/pg@^8.16 exigido por @prisma/adapter-pg — só tipos de dev, sem efeito em runtime). Sem
# copiá-lo, `npm ci` dentro da imagem falha com ERESOLVE, mesmo com o lockfile íntegro — foi
# exatamente o que derrubou o workflow "Publish private container image" em 03/09/2026 (run
# 33817231355), enquanto o mesmo `npm ci` passava no CI e no Render porque lá o checkout
# completo (com .npmrc) está presente.
COPY package*.json .npmrc ./
RUN npm ci --ignore-scripts

COPY . .
RUN npx prisma generate
RUN npm run build

# Remove devDependencies (typescript, eslint, vitest, prisma CLI, etc.) antes de copiar
# node_modules pro estágio final — nada disso é necessário em runtime, só incha a imagem
# de produção (DEVOPS-005 na auditoria de dívida técnica).
RUN npm prune --omit=dev

# npm prune acima remove também a CLI do prisma (devDependency), que o Job de migração
# k8s/Helm quebra sem ela ("npx prisma migrate deploy": command not found) — ver handoff
# .agents/handoffs/onda-4/10-para-08-prisma-cli-imagem-producao.md. O deploy real hoje
# (Render, render.yaml) não usa este Dockerfile e não é afetado, mas o caminho
# k8s/Helm/ArgoCD (charts/prospector-atlas/templates/migration-job.yaml,
# k8s/migration-job.yaml — aspiracional) precisa da CLI presente na imagem final.
# Reinstala só a CLI, na mesma versão fixada em devDependencies, sem tocar em
# package.json/lockfile (--no-save) e sem reintroduzir o restante das devDependencies.
RUN npm install --no-save prisma@$(node -p "require('./package.json').devDependencies.prisma")

# Stage 2: Production
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy necessary files from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
# prisma.config.ts fica na raiz do projeto (fora de prisma/) e o Prisma CLI (usado abaixo por
# `prisma migrate deploy`, ver comentário mais adiante) depende dele pra resolver `datasource.url`
# desde o Prisma 7 — sem essa cópia o container crash-loopava no boot com "The datasource.url
# property is required in your Prisma config file when using prisma migrate deploy" (reproduzido
# no deploy do Railway; a imagem buildava com SUCCESS mas nunca ficava saudável em runtime).
COPY --from=builder /app/prisma.config.ts ./

# Create a non-root user
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs nodejs
USER nodejs

EXPOSE 3000

# `prisma migrate deploy` roda a cada boot do container, antes do processo Node começar a
# aceitar tráfego — mesma garantia que render.yaml já tem no startCommand real
# (`npx prisma migrate deploy && ... && npm run start`), agora também no nível da imagem, para
# qualquer caminho que consuma este Dockerfile diretamente sem repetir esse comando (ver
# AGENTS.md bloqueador #5: "Deploy capaz de iniciar sem aplicar migrações").
#
# Achado real corrigido nesta rodada: `docker-compose.oci.yml` (caminho self-hosted OCI) usava o
# CMD desta imagem sem prefixo de migração — `scripts/deploy-oci.sh` sobe o container `app` via
# `docker compose up -d` e só roda `prisma migrate deploy` DEPOIS, num `docker exec` separado
# (linha ~174). Entre o container ficar "up" (o healthcheck de /health/live só verifica processo
# vivo, não schema migrado) e esse `docker exec` terminar, a aplicação já podia responder tráfego
# contra um schema desatualizado ou, num volume novo, sem tabelas. Idempotente (`migrate deploy`
# sem pendência é rápido/no-op) e seguro sob múltiplas réplicas (Prisma usa advisory lock —
# instâncias concorrentes serializam em vez de corromper o schema), então não introduz problema
# novo no caminho k8s/Helm (que também tem o Job dedicado em
# charts/prospector-atlas/templates/migration-job.yaml como pre-install/pre-upgrade hook; esta
# camada aqui é defesa adicional, não substitui aquele hook). Render não é afetado — usa
# `buildCommand`/`startCommand` próprios e nunca passa por este Dockerfile (ver render.yaml).
# `exec` no fim troca o shell pelo processo Node como PID 1 do container, preservando o
# encaminhamento correto de sinais (SIGTERM) para desligamento gracioso.
CMD ["sh", "-c", "npx prisma migrate deploy && exec npm run start"]
