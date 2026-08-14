# Stage 1: Build
FROM node:22-slim AS builder

WORKDIR /app

ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/prospector"

RUN apt-get update && apt-get install -y openssl python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
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

# Create a non-root user
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs nodejs
USER nodejs

EXPOSE 3000

CMD ["npm", "run", "start"]
