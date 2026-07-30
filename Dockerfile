# Stage 1: Build
FROM node:22-slim AS builder

WORKDIR /app

ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/prospector"

RUN apt-get update && apt-get install -y openssl python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .
RUN npm run build

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
