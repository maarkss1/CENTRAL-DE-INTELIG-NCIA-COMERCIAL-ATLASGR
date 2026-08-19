# Onda 21 — Investigação e correção: followUp.worker.ts processava sempre 0 leads

## Identificação
- Origem: risco levantado (não confirmado) no relatório da onda-20 — "`followUp.worker.ts` pode
  estar processando sempre 0 leads em produção (mesmo padrão de RLS sem contexto encontrado e
  corrigido no worker de cadência, onda 19)". Usuário pediu explicitamente "investigue".
- SHA de entrada: `828d12c` (main, após merge do PR #169/onda-20)
- Branch de integração: `claude/fix-followup-worker-rls`
- Status: **CONFIRMADO E CORRIGIDO**

## Investigação

Escrito um teste de integração descartável chamando `prisma.lead.findMany` exatamente como
`followUp.worker.ts` chamava (sem nenhum `requestContext.run`), contra um `Lead` real e elegível
semeado no Postgres de teste. Resultado: **0 linhas devolvidas**, mesmo com o lead existindo e
batendo no filtro (`status` elegível + `lastInteraction` antigo). Confirma empiricamente a suspeita:
`Lead` tem `FORCE ROW LEVEL SECURITY` (mesma migration que afeta `CadenceRun`/`CadenceSequence`,
corrigida na onda 19) — nenhuma leitura sem `app.current_tenant_id`/`app.bypass_rls` setados
enxerga nenhuma linha, e o worker nunca setava nenhum dos dois.

**Impacto real**: o job diário de follow-up automático de WhatsApp (`0 9 * * *`, todo dia às 9h)
rodava sem erro, sem log de falha, "processando 0 leads elegíveis hoje" — silenciosamente, todos
os dias, desde que a política RLS foi criada (`20260722020322_enable_rls`). Nenhum follow-up
automático de WhatsApp jamais foi enviado por este worker em produção.

## Correção

Mesmo padrão já validado no worker de cadência (onda 19):

1. `src/lib/prisma.ts` — `Lead` adicionado à allowlist de `bypassRls` (`BYPASS_RLS_ALLOWED_MODELS`),
   restrito à descoberta cross-tenant inicial.
2. `src/features/crm/jobs/followUp.worker.ts` — lógica do job extraída para
   `runDailyFollowUpScan()` (exportada à parte do `Worker` BullMQ, mesmo padrão de
   `scanAndAdvanceCadenceRuns`/`runColdLeadsScan`, para permitir teste direto sem esperar o cron):
   - descoberta (`prisma.lead.findMany` + `include: contact`) roda dentro de
     `requestContext.run({ bypassRls: true }, ...)`;
   - processamento de cada lead (envio real de WhatsApp + `prisma.lead.update`) roda dentro de
     `requestContext.run({ tenantId: lead.organizationId }, ...)` — nunca com bypass.

Teste novo: `tests/integration/followUp.worker.test.ts` (5 casos, Postgres + Redis reais, socket
Baileys mockado) — prova que a varredura agora encontra leads elegíveis de verdade, respeita
opt-out (`customFields.optOutWhatsApp`), ignora leads fora do status elegível, e cobre duas
organizações diferentes na mesma varredura sem vazar dado entre elas.

## Gate final
- typecheck: `npx tsc --noEmit` — limpo, 0 erros
- lint: `npm run lint` — 0 erros, 80 warnings (mesmo nível pré-existente do branch base)
- unit: `npx vitest run -c vitest.unit.config.ts` — **169/169 arquivos, 1313/1313 testes**
- integration: `npx dotenv-cli -e .env.test -- npx vitest run -c vitest.integration.config.ts`
  (Postgres + Redis reais) — **34/34 arquivos, 145/145 testes** (era 33/140 — +1 arquivo/+5 testes)
- build: `npm run build` e `npm run build:worker` — ambos limpos
- e2e: não executado (nenhuma mudança de UI)

## Skips e flakes
0 — nenhum teste pulado ou instável observado nesta rodada.

## Decisão

**Risco confirmado e corrigido.** Não é um achado teórico: reproduzido por teste de integração
contra Postgres real, antes e depois da correção. Segue exatamente o mesmo padrão de fix já
validado e em produção desde a onda 19 (worker de cadência) — mesma classe de bug de RLS, mesma
solução (bypass restrito à descoberta cross-tenant, processamento real sempre escopado por
tenant). Nenhum outro worker foi auditado nesta rodada; se o mesmo padrão existir em algum worker
ainda não revisado, deve ser investigado à parte.
