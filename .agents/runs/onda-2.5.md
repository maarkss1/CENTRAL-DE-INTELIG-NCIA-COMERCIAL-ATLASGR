# Onda 2.5 — Saneamento pós-Onda 2

- Status: EM ANDAMENTO
- Coordenador: Agente 00
- Branch de integração: `integracao/onda-2.5-saneamento`
- Base inicial: `main@098aef11401b291fb3fe04ec4c79267a4805652a`
- Regra de segurança: sem merge em `main` e sem deploy até gate explícito.

## Objetivo

Fechar lacunas herdadas da Onda 2 antes do gate formal da Onda 3, sem recriar trabalho já entregue e sem afrouxar isolamento multi-tenant.

## Escopo aprovado

1. AILog / RLS: eliminar a falha silenciosa de persistência de consumo de IA e cobrir o caminho legítimo sob RLS.
2. Automações: persistir histórico por execução, incluindo sucesso/falha e correlação.
3. Handoffs: revisar e encerrar itens tecnicamente resolvidos, preservando evidência.
4. Integrações: revisar thresholds e testes de RBAC, com atenção ao opt-out do Birth Voice.
5. Qualidade: executar os E2E que ficaram pendentes na Onda 2.
6. Gate: consolidar typecheck, lint, unit, integration, E2E, verify:integrations, verify:ai e build.

## Especialistas e branches

- Agente 01: `agente/01-plataforma-dados-onda25` — PR draft #104.
- Agente 06: `agente/06-integracoes-onda25` — PR draft #105.
- Agente 07: `agente/07-automacoes-onda25` — PR draft #106.

O conector GitHub não fornece worktrees locais; por isso as frentes são mantidas em branches independentes e a integração permanece serial, conforme `AGENTS.md`.

## Baseline de código

### AILog / RLS

Diagnóstico inicial confirmado:

- `AILog.organizationId` é nullable para preservar registros legados sem atribuição.
- A policy RLS de `AILog` permite acesso somente quando `app.current_tenant_id = organizationId` ou quando há bypass explícito.
- O Prisma já injeta `app.current_tenant_id` na transação quando `requestContext` possui `tenantId`.
- `logAiUsage()` usa `requestContext.getStore()?.tenantId` como `organizationId`.
- execuções técnicas fora de `requestContext` tentam inserir `organizationId = null` e a policy histórica `FOR ALL` rejeita a escrita.

Entrega inicial do Agente 01:

- commit `abc7095b7de6ea4c6e1cfc8c376f90ba8e35b052`;
- migration `20260813230000_fix_ailog_rls_unattributed_internal_writes`;
- policy `FOR ALL` separada em SELECT/INSERT/UPDATE/DELETE;
- leitura e mutações atribuídas continuam tenant-scoped;
- log sem atribuição só é aceito por conexão interna, nunca pelas roles PostgREST `anon`/`authenticated`.

Status: alteração criada, ainda sem PASS de gate.

### Histórico de automações

Diagnóstico inicial confirmado:

- `Automation` possui somente `lastRunAt` e `runCount` como telemetria agregada.
- `AutomationEngine.handle()` atualiza esses dois campos apenas após sucesso.
- falhas por regra são enviadas ao logger e não possuem registro persistente por execução.

Conclusão: a Onda 2.5 deve adicionar trilha persistente de execução com tenant, automação, gatilho, correlação, status, snapshot sanitizado da ação, erro sanitizado, início/fim e tentativas, sem permitir que a persistência do histórico derrube o fluxo principal.

Status: pendente de contrato de dados do Agente 01 e implementação do Agente 07.

### RBAC de integrações

Entrega inicial do Agente 06:

- `POST /api/integrations/birth-voice/suppressions` revisado para `ADMIN`, `GESTOR` e `VENDEDOR`;
- `VISUALIZADOR` continua sem permissão de escrita;
- teste unitário novo cobre ADMIN, GESTOR, VENDEDOR, VISUALIZADOR e ausência de sessão;
- racional: opt-out de discagem precisa ser registrável imediatamente por quem está atendendo, sem depender de um gestor.

Commits: `c700ff2f7a5501c0384de9a9afd95e698f9a99a1` e `637a59bb196bb1d8001958a965afebe29805d48e`.

Status: alteração criada, ainda sem PASS de gate e sem encerramento do handoff até validação.

### Handoffs stale

Entrega inicial do Agente 07:

- `.agents/handoffs/onda-1/01-para-07-role-gates-intelligence.md` estava marcado como aberto apesar de o próprio conteúdo dizer que a correção de `ai-settings` já estava completa e testada;
- status corrigido para `resolvido`, com seção de resolução da Onda 2.5;
- commit `b80163f1b51d5079ba488e6ed1a3c8a86291d703`.

## CI / bloqueio externo aos diffs

Os PRs #104, #105 e #106 dispararam `SonarQube Analysis`, mas o workflow falha no `Set up job`, antes de checkout ou análise de código.

Causa confirmada pela anotação do GitHub no run `31762597572` / job `94651907998`:

- a política do repositório exige GitHub Actions fixadas por SHA completa;
- o workflow ainda usa `actions/checkout@v4`, `actions/setup-node@v4` e `sonarsource/sonarqube-scan-action@master`.

Esse bloqueio não foi introduzido pelos diffs dos Agentes 01, 06 ou 07.

Handoff criado para o dono exclusivo dos workflows:

- `.agents/handoffs/onda-2.5/00-para-08-pin-github-actions-sha.md`;
- destino: Agente 08;
- prioridade: alto;
- status: aberto.

Nenhum workflow foi alterado pelo Coordenador ou pelos especialistas 01/06/07.

## Evidências coletadas

- Handoff de AILog: `.agents/handoffs/onda-2/00-para-01-ailog-rls-violation.md`.
- Handoff de histórico: `.agents/handoffs/onda-2/07-para-01-automation-execution-history.md`.
- Implementação RLS: `src/lib/prisma.ts`.
- Policy histórica de AILog: `prisma/migrations/20260731200000_notifications_automations_ai_cost/migration.sql`.
- Logger de uso: `src/lib/ai/gateway.ts`.
- Motor de automações: `src/features/automations/automation.engine.ts`.
- PR #104: Agente 01 / RLS AILog.
- PR #105: Agente 06 / RBAC opt-out.
- PR #106: Agente 07 / fechamento documental RBAC IA.

## Testes / gate

Nenhum PASS será declarado sem execução real. O SonarQube está bloqueado por configuração de workflow anterior à Onda 2.5.

| Gate | Estado |
|---|---|
| `npx tsc --noEmit` | PENDENTE |
| `npm run lint` | PENDENTE |
| `npm run test:unit` | PENDENTE |
| `npm run test:integration` | PENDENTE |
| `npm run test:e2e` | PENDENTE |
| `npm run verify:integrations` | PENDENTE |
| `npm run verify:ai` | PENDENTE |
| `npm run build` | PENDENTE |
| SonarQube | BLOQUEADO — Actions não pinadas em SHA completa |
| varredura de segredos do diff | PENDENTE |

## Decisão atual

`ONDA 2.5 EM ANDAMENTO`

Não autoriza Onda 3, merge em `main` ou deploy.
