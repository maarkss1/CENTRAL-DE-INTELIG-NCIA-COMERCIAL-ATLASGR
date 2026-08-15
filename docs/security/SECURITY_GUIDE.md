# Security Guide

## Introduction
This guide provides developers and operators with the security protocols used in the Prospector-Atlas platform.

## Authentication & Authorization
- **JWT Tokens:** The application utilizes short-lived Access Tokens (15m) and long-lived Refresh Tokens (7d) stored in `HttpOnly` cookies.
- **Roles:** Defined in `server/security/PermissionMatrix.ts`. Current roles include ADMINISTRADOR, GESTOR_COMERCIAL, CLOSER, SDR, VISUALIZADOR.
- **Middleware:** Use `authenticateToken`, `requireTenant`, and `requireRole` on protected routes.

## Data Validation
Always validate incoming request bodies using Zod schemas found in `server/security/validation.ts`.

## Auditing
Use the `AuditService.logEvent` function for critical state changes, data accesses, and authentication attempts.

## Superfície exposta — estado registrado (Onda 6, Agente 15)

Revisão pontual de `server.ts` (propriedade do Agente 00 — leitura apenas, correções passam por
handoff):

| Superfície | Estado atual | Risco residual |
|---|---|---|
| `GET /metrics` | Só monta quando `EXPOSE_METRICS=true` (opt-in explícito, `server.ts` linha ~260). Sem autenticação própria quando habilitado. | Manter `EXPOSE_METRICS` desligado em produção pública, ou colocar atrás de rede interna/allowlist — débito já documentado em `.agents/completion/01-bloqueadores.md` ("Débitos arquiteturais"). Não corrigido nesta onda (fora do meu escopo editar `server.ts`). |
| `GET/POST /admin/queues` (Bull Board) | Montado com `authenticateToken, requireTenant, requireRole(['ADMIN'])` (`server.ts` linha ~347). | Risco residual já documentado: um ADMIN de uma organização enxerga jobs de fila de **outras** organizações (a autorização é por papel, não por tenant, dentro do Bull Board). Não é falha de autenticação — é falta de escopo por tenant dentro da ferramenta de administração de fila. |
| `GET /api-docs` (Swagger UI) | Monta em `NODE_ENV !== 'production'` OU quando `EXPOSE_API_DOCS=true` é setado explicitamente (opt-in, mesmo padrão de `EXPOSE_METRICS`). | Aceitável: spec pública de rotas não é segredo por si só, mas confirme que `EXPOSE_API_DOCS` continua desligado em produção salvo necessidade pontual (ex.: scan do ZAP contra staging). |
| 4 webhooks montados antes de `express.json()` (`birth-voice`, `3cx/webhook`, `webhooks/voice-result`, `integrations/bitrix`) | Todos os 4 verificados nesta onda: **todos** usam comparação em tempo constante (`timingSafeEqual`, direto ou via helper `isValidSignature`/`secretMatches`/`safeEqual`) e respondem `503` (fail-closed) quando a env do segredo correspondente está ausente, antes mesmo de tentar comparar assinatura. | Nenhum problema encontrado. Ver detalhamento por arquivo abaixo. |

Detalhamento dos 4 webhooks (arquivo → mecanismo → fail-closed):
- `src/features/integrations/birth-voice/birthVoice.webhook.ts` → `isValidSignature()` em
  `birthVoice.helpers.ts` (HMAC-SHA256 + `timingSafeEqual`) → `503` se `BIRTH_VOICES_WEBHOOK_SECRET`
  ausente.
- `src/features/integrations/threecx/threecx.routes.ts` → mesma `isValidSignature()` → `503` se
  `THREECX_WEBHOOK_SECRET` ausente.
- `src/features/integrations/birth-voice/voiceResult.webhook.ts` → `secretMatches()` local
  (`timingSafeEqual` com igualdade de tamanho verificada antes) → `503` se
  `ATLASGR_WEBHOOK_SECRET` ausente.
- `src/features/integrations/bitrix/bitrix.webhook.ts` → `safeEqual()` local (`timingSafeEqual`
  com igualdade de tamanho verificada antes, contra `BitrixConnection.webhookSecret` por conexão)
  → recusa (não processa) quando `!connection.inboundEventsEnabled || !connection.webhookSecret` —
  fail-closed por conexão, não por env global (arquitetura correta aqui, já que o segredo é
  per-tenant/per-conexão, não uma env compartilhada).

Nenhuma correção necessária em `server.ts` nesta onda — nenhum achado novo além dos débitos já
documentados em `.agents/completion/01-bloqueadores.md`.

## `security:zap` / `security:trivy` — quando e como rodar

Os dois scripts (`npm run security:zap`, `npm run security:trivy`) existem em `package.json` mas
não fazem parte de nenhum gate automático (ver handoff
`.agents/handoffs/onda-6/15-para-08-zap-trivy-gate.md` para a proposta de integração ao CI/gate).
Até que o Agente 08 decida onde encaixá-los, rode manualmente antes de um release:

- **`npm run security:trivy`** — scan de filesystem/dependências, não precisa da aplicação
  rodando. Precisa de rede irrestrita para baixar o banco de vulnerabilidades na primeira
  execução (`mirror.gcr.io/aquasec/trivy-db`); ambientes com proxy TLS restritivo podem falhar
  nesse download — não é falha do script.
- **`npm run security:zap`** — scan dinâmico de API (`zap-api-scan.py` contra
  `/api-docs/openapi.yaml`). Exige a aplicação já rodando em `http://localhost:3000` (ou o alvo
  configurado) **antes** de rodar o comando — suba a stack (`docker compose up` ou `npm run dev`)
  primeiro. Sem alvo vivo, o ZAP falha ao tentar buscar a spec OpenAPI.
