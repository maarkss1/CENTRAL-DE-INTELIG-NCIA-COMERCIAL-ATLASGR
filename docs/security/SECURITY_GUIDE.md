# Security Guide

## Introduction
This guide provides developers and operators with the security protocols used in the Prospector-Atlas platform.

## Authentication & Authorization
- **Sessão (Better Auth):** autenticação por e-mail/senha e OAuth (Google/Microsoft) via
  `better-auth` (`src/lib/auth.ts`). Sessão validada por cookie `HttpOnly`
  (`better-auth.session_token`), não por par de Access/Refresh Token JWT — `authenticateToken`
  (`src/shared/middlewares/authenticateToken.ts`) chama `auth.api.getSession()` a cada request.
- **Roles:** fonte canônica única em `src/lib/auth/authorization.ts` — 4 papéis hierárquicos:
  `ADMIN` (100) > `GESTOR` (75) > `VENDEDOR` (50) > `VISUALIZADOR` (10). Não existe mais
  `server/security/PermissionMatrix.ts` nem os papéis `ADMINISTRADOR/GESTOR_COMERCIAL/CLOSER/SDR`
  — esse era um segundo sistema de permissões (enum de 18 papéis) nunca ligado a nenhuma rota,
  removido antes de virar débito real (ver comentário no topo de `authorization.ts`).
- **Middleware:** `authenticateToken`, `requireTenant` (`src/shared/middlewares/authorization.ts`)
  e `requireRole` (`src/shared/middlewares/requireRole.ts`) em toda rota protegida.

## Data Validation
Valide todo corpo de requisição com schemas Zod, aplicados via `validateRequest`
(`src/shared/middlewares/validateRequest.ts`) — os schemas em si ficam junto de cada feature
(`src/features/*/`), não centralizados num único arquivo.

## Auditing
Use `AuditService.log` (`src/lib/audit/audit.service.ts`) para mudanças de estado críticas,
acesso a dados e tentativas de autenticação.

## Superfície exposta — estado registrado (Onda 6, Agente 15)

Revisão pontual de `server.ts` (propriedade do Agente 00 — leitura apenas, correções passam por
handoff):

| Superfície | Estado atual | Risco residual |
|---|---|---|
| `GET /metrics` | Só monta quando `EXPOSE_METRICS=true` (opt-in explícito). **Corrigido na Sprint 01/Onda 13 (SEC-002):** exige `requirePlatformOperator` (token `PLATFORM_OPERATOR_TOKEN`, header/query/cookie, fail-closed sem o valor configurado) — ver `src/shared/middlewares/requirePlatformOperator.ts`. | Labels `tenant`/`organizationId` continuam presentes em métricas de custo de IA e sync Bitrix (`src/lib/ai/metrics.ts`, `src/features/integrations/bitrix/service/metrics.ts`) — não é PII de pessoa física, mas identifica tenant; residual aceito, mitigado pela mesma trava de token. |
| `GET/POST /admin/queues` (Bull Board) | Montado com `authenticateToken, requireTenant, requireRole(['ADMIN'])`. **Reforçado na Sprint 01/Onda 13 (SEC-001):** adicionado `requirePlatformOperator` como segunda trava obrigatória — ADMIN de tenant sozinho não abre mais o painel sem o token de operador de plataforma também. | Risco residual ainda não eliminado (só contido pela segunda trava): um operador de plataforma autenticado como ADMIN de uma organização ainda enxerga jobs de fila de **outras** organizações dentro do Bull Board (autorização por papel, não por tenant, dentro da própria ferramenta) — a fila `search-indexing` carrega `Company` completo (telefone, e-mail, CNPJ, endereço) no `job.data`. Corrigir isso de verdade exigiria segmentar filas por tenant ou um adaptador BullBoard com filtro/redação por viewer — fora do escopo desta sprint, registrado como débito para sprint futura (ver `.agents/handoffs/onda-13/`). |
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

Decisão implementada pelo Agente 08 (Onda 6, remediação) a partir da proposta em
`.agents/handoffs/onda-6/15-para-08-zap-trivy-gate.md`:

- **`npm run security:trivy`** (scan de filesystem/dependências, não precisa da aplicação
  rodando) — agora roda **automaticamente toda semana** via
  `.github/workflows/security-trivy.yml` (`workflow_dispatch` também disponível para rodar sob
  demanda), num runner hospedado do GitHub Actions com rede irrestrita — o erro de TLS ao baixar
  `mirror.gcr.io/aquasec/trivy-db` visto em ambientes de agente com proxy restritivo não se aplica
  lá. **Não bloqueia PR** — é um job agendado independente de `ci.yml`, reporta no Job Summary da
  execução. Rodar localmente continua funcionando do mesmo jeito para depuração pontual, mas
  requer rede sem proxy TLS restritivo para o primeiro download do banco de vulnerabilidades.
- **`npm run security:zap`** (scan dinâmico de API, exige a aplicação já no ar) — **não** entra em
  CI automático (não existe alvo efêmero vivo em nenhum job de push/PR deste projeto) — continua
  manual, mas agora como passo obrigatório do runbook de pré-release, rodado contra staging:
  ver `docs/deploy/RELEASE_CHECKLIST.md` seção 2.

## `npm audit` — vulnerabilidades `uuid <11.1.1` (Onda 6, Agente 08)

Contexto completo em `.agents/handoffs/onda-6/15-para-00-npm-audit-dependencias.md` (Agente 15).
Das 4 vulnerabilidades `moderate` (`GHSA-w5hq-g745-h8pq`, `uuid <11.1.1`), duas cadeias
diferentes:

- **`testcontainers` → `dockerode` → `uuid`** (dev-only, `test:containers`): **corrigido**.
  `testcontainers` foi atualizado de `^11.14.0` para `^12.1.0` — `dockerode@5.0.1` (puxado pela
  nova major) não depende mais de `uuid` (removido como dependência direta na própria lib). API
  usada neste repositório (`GenericContainer`, `Wait.forLogMessage`, em
  `tests/container/postgres.test.ts`) não mudou entre as majors — a única mudança de
  comportamento real da v12 (estratégia de wait padrão passando a preferir Docker healthcheck) não
  afeta este teste porque ele já configura `withWaitStrategy()` explicitamente. Requisito de Node
  `>= 22.22` da v12 já é atendido (CI roda Node 22 atual; ambiente local verificado em `v22.22.2`).
  `npx tsc --noEmit` limpo depois do upgrade.

- **`exceljs` → `uuid`** (dependência de produção real — exportação de XLSX): **risco aceito, não
  corrigido**. Investigado nesta rodada se existe versão mais recente do `exceljs` que não
  dependa de `uuid <11.1.1` em vez de aplicar o downgrade sugerido por `npm audit fix --force`
  (que instalaria `exceljs@3.4.0`, uma versão **anterior** à já usada aqui, `^3.10.0` — sinal
  correto de que não é uma correção real). Verificado com `npm view exceljs@<versão>
  dependencies.uuid` em todas as versões publicadas do `exceljs` até a mais recente disponível
  (`4.4.0`, a última estável na 4.x): `3.10.0`–`4.1.0` dependem de `uuid@^7.0.3`, `4.2.0`–`4.4.0`
  dependem de `uuid@^8.3.0` — **nenhuma versão publicada do `exceljs`, em nenhuma major, depende
  de `uuid >=11.1.1`**. Não há correção real disponível via upgrade/downgrade de versão do
  `exceljs` isoladamente.
  - Risco mantido como classificado pelo Agente 15: a vulnerabilidade
    (`GHSA-w5hq-g745-h8pq`, buffer bounds check ausente em `uuid.v3/v5/v6` quando um `buf` de
    saída é fornecido pelo chamador) exige que o código chame `uuid.v3/v5/v6` passando esse
    parâmetro `buf` — não é o padrão de uso do `exceljs` internamente, e o projeto não usa `uuid`
    diretamente nos módulos de export XLSX (`scripts/setup-vector-db.ts`, export do CRM). Sem
    vetor de exploração identificado neste código.
  - Alternativa não aplicada nesta rodada: `npm overrides` forçando `uuid` para `>=11.1.1` só
    dentro da árvore do `exceljs` (mesmo padrão já usado para `xcode` em `package.json`), sem
    trocar a versão do `exceljs` em si. Ficou fora do escopo desta remediação pontual — reavaliar
    em uma rodada dedicada a dependências, testando a geração de XLSX de ponta a ponta antes de
    aplicar.
  - Reavaliar quando o `exceljs` publicar uma versão que migre para `uuid >=11.1.1`, ou se o
    vetor de exploração for reclassificado.
