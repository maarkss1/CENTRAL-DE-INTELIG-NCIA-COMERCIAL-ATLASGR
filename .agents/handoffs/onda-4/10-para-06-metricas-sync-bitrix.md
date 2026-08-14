- De: 10
- Para: 06
- Onda: 4
- Status: resolvido
- Prioridade: normal
## Problema
Minha missão pede alerta para "sincronização Bitrix falhando repetidamente"
(`.agents/prompts/10-infraestrutura-sre.md`), que é diretamente o bloqueador prioritário #11 de
`/AGENTS.md` ("Sincronizações Bitrix que podem falhar silenciosamente"). Escrevi a regra em
`infrastructure/observability/alert.rules.yml` (grupo
`prospector-atlas.bitrix.pendente-instrumentacao`, alerta `BitrixSyncFailuresHigh`), mas ela
referencia `bitrix_sync_failures_total`, uma métrica Prometheus que não existe hoje —
`src/features/integrations/bitrix/service/outboundSync.ts` e
`src/lib/queue/bitrixSync.worker.ts` não expõem nenhum `Counter` `prom-client` de falha de sync.

Hoje a única forma de detectar sync falhando é ler logs manualmente ou o painel `/admin/queues`
job a job — não há um sinal agregado, acionável por alerta, de "sync Bitrix está falhando
repetidamente para o tenant X".
## Arquivo(s) envolvido(s)
- `src/features/integrations/bitrix/service/outboundSync.ts`
- `src/lib/queue/bitrixSync.worker.ts`
- Meu lado (já pronto, esperando a métrica): `infrastructure/observability/alert.rules.yml`.
## Alteração necessária
Expor um `Counter` `prom-client` incrementado a cada falha de sync (idealmente com label de
tenant/organizationId e tipo de entidade — lead/deal/contact), nome sugerido
`bitrix_sync_failures_total{tenant,entity}`, via `/metrics` (já montado condicionalmente por
`EXPOSE_METRICS` em `server.ts`). Ver `BITRIX24-LEAD-FLOW-AUDIT.md` (auditoria já existente) para
o inventário completo de pontos de falha possíveis antes de decidir quantos labels/granularidade
faz sentido.
## Teste esperado
`GET /metrics` retorna `bitrix_sync_failures_total` incrementando quando uma sync falha de
propósito em teste (webhook do Bitrix simulando erro, ou token de conexão inválido). A regra
`BitrixSyncFailuresHigh` deixa de ficar `unknown` no Prometheus assim que scrapeada.
## Contexto adicional
Onda 4 — Agente 10. Enquanto a métrica não existe, o runbook manual
(`infrastructure/observability/RUNBOOK.md` seção 4) é o caminho de detecção/investigação real.

## Resolução
Criado `src/features/integrations/bitrix/service/metrics.ts`, exportando
`bitrixSyncFailuresTotal` — um `Counter` `prom-client` chamado `bitrix_sync_failures_total` com
labels `tenant` (organizationId, ou `"unknown"` quando o ponto de falha não tem contexto de
organização) e `entity` (`"lead"` | `"deal"` | `"tick"`). Segue o único padrão de `prom-client` já
existente no projeto (`client.collectDefaultMetrics()` + `client.register.metrics()` em
`server.ts`, sob `EXPOSE_METRICS`) — nenhuma métrica de negócio custom existia antes desta.

Incrementada nos três pontos reais de falha de sincronização identificados no handoff:
- `src/features/integrations/bitrix/service/outboundSync.ts` → dentro de `logSync(...)`, quando
  `status === 'failed'` — cobre tanto o push automático/manual de lead (`syncLeadToBitrix`) quanto
  o comentário de timeline (`postCommentToBitrix`), já que os dois passam por essa mesma função.
  `entity` vem do `entityType` já existente (`'lead' | 'deal'`).
- `src/features/integrations/bitrix/service/syncRules.ts` → dentro do `catch` por regra em
  `runBitrixSyncTick` (mesmo bloco que já corrige o bloqueador #11 marcando `lastRunAt`/`lastError`
  mesmo em falha repetida). `entity` vem de `rule.source` ('lead' | 'deal').
- `src/lib/queue/bitrixSync.worker.ts` → `worker.on('failed', ...)`, para o caso (raro, mas real)
  de o tick inteiro rejeitar antes de chegar ao loop por regra (ex.: a query que lista as
  organizações falha) — sem contexto de tenant específico, por isso `tenant: 'unknown'`,
  `entity: 'tick'`, para não fingir que a falha pertence a uma organização que nunca chegou a ser
  processada.

Guard contra "A metric with the name X has already been registered" (`client.register
.getSingleMetric(...)`) em `metrics.ts`, porque o módulo é importado pelos três consumidores acima
e o Registry do prom-client é global.

## Teste esperado — evidência
- `src/features/integrations/bitrix/service/__tests__/metrics.test.ts` (novo): confirma que a
  métrica está registrada no Registry padrão com o nome exato `bitrix_sync_failures_total`
  (divergência de nome deixaria a regra `BitrixSyncFailuresHigh` "unknown" pra sempre mesmo com a
  métrica existindo), que incrementa por `tenant`/`entity` independentemente, e que reimportar o
  módulo não lança (guard de registro duplicado).
- `outboundSync.test.ts` e `syncRules.test.ts`: adicionada asserção no teste de falha já existente
  de cada arquivo (P1-3 e "atualiza lastRunAt E lastError mesmo quando a regra falha") confirmando
  que o Counter é incrementado com o `tenant`/`entity` corretos no mesmo caminho de código que já
  testava o `BitrixSyncLog`.
- `GET /metrics` com `EXPOSE_METRICS=true` fim a fim (com Redis/Postgres reais e um webhook Bitrix
  inválido de propósito) não foi executado nesta rodada — o ambiente de execução deste agente não
  tem um Postgres/Redis provisionado nem `.env.test` (mesma limitação que impediu `npm run
  test:integration` de rodar, ver seção Validação abaixo). A cobertura de unidade acima prova que a
  métrica é registrada no `client.register` global (o mesmo objeto que `server.ts` serializa em
  `/metrics`) e que o caminho de incremento é acionado exatamente nos pontos de falha reais — não é
  o mesmo que ver a série no scrape real, mas é a evidência disponível neste ambiente.

## Validação (Agente 06, remediação pontual)
- `npx tsc --noEmit` → sem erros.
- `npm run lint` → 0 erros (101 warnings pré-existentes, nenhum nos arquivos tocados aqui).
- `npm run test:unit` → 106 arquivos / 689 testes, todos passando (inclui os 3 arquivos acima).
- `npm run build` → build de produção (vite + esbuild do server) concluído sem erros.
- `npm run test:integration` → não executado: requer `.env.test`/Postgres real, ausentes neste
  ambiente — mesma classe de limitação de ambiente já registrada em outros handoffs desta onda, não
  uma falha introduzida por esta mudança.
- `npm run verify:integrations` → não executado: o script verifica Google Places/Apollo com
  credenciais reais de API paga, sem relação com Bitrix/Prometheus — fora do escopo deste item.
