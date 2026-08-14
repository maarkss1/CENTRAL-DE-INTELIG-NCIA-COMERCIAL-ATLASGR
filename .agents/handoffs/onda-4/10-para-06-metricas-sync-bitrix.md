- De: 10
- Para: 06
- Onda: 4
- Status: aberto
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
