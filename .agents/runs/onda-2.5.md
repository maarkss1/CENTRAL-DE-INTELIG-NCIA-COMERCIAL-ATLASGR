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

## Baseline de código

### AILog / RLS

Diagnóstico inicial confirmado:

- `AILog.organizationId` é nullable para preservar registros legados sem atribuição.
- A policy RLS de `AILog` permite acesso somente quando `app.current_tenant_id = organizationId` ou quando há bypass explícito.
- O Prisma já injeta `app.current_tenant_id` na transação quando `requestContext` possui `tenantId`.
- `logAiUsage()` usa `requestContext.getStore()?.tenantId` como `organizationId`.
- `scripts/verify-ai-studio.ts` chama o Studio diretamente, fora de qualquer `requestContext`, portanto o log tenta inserir `organizationId = null` sem contexto RLS e é rejeitado.

Conclusão inicial: não há justificativa para tornar a policy permissiva. O saneamento deve separar claramente uso tenant-scoped de execução técnica sem tenant e testar ambos os contratos.

### Histórico de automações

Diagnóstico inicial confirmado:

- `Automation` possui somente `lastRunAt` e `runCount` como telemetria agregada.
- `AutomationEngine.handle()` atualiza esses dois campos apenas após sucesso.
- Falhas por regra são enviadas ao logger e não possuem registro persistente por execução.

Conclusão inicial: a Onda 2.5 deve adicionar trilha persistente de execução com tenant, automação, gatilho, correlação, status, snapshot sanitizado da ação, erro sanitizado, início/fim e tentativas, sem permitir que a persistência do histórico derrube o fluxo principal.

## Governança de ownership

- Agente 01: RLS, Prisma schema, migrations e persistência de plataforma.
- Agente 06: revisão de RBAC das integrações.
- Agente 07: motor e testes de automações/IA após contrato de persistência definido pelo Agente 01.
- Máximo de 3 especialistas em paralelo.

## Evidências já coletadas

- Handoff aberto de AILog: `.agents/handoffs/onda-2/00-para-01-ailog-rls-violation.md`.
- Handoff aberto de histórico: `.agents/handoffs/onda-2/07-para-01-automation-execution-history.md`.
- Implementação RLS: `src/lib/prisma.ts`.
- Policy histórica de AILog: `prisma/migrations/20260731200000_notifications_automations_ai_cost/migration.sql`.
- Logger de uso: `src/lib/ai/gateway.ts`.
- Verificador de IA: `scripts/verify-ai-studio.ts`.
- Motor de automações: `src/features/automations/automation.engine.ts`.

## Testes / gate

Ainda não executados nesta branch nesta etapa inicial. Nenhum PASS será declarado sem execução real.

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

## Decisão atual

`ONDA 2.5 EM ANDAMENTO`

Não autoriza Onda 3, merge em `main` ou deploy.