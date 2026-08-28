- De: 02 (LGPD/Retenção — expurgo de extrações Bitrix)
- Para: 00 (dono de `worker.ts`) — com cópia de contexto para 06/06A (Bitrix) e 01A (Dados/RLS/Retenção)
- Onda: 42
- Status: aberto
- Prioridade: alta (LGPD — dado pessoal exportado sem expiração automática)

## Problema

Dossiê CPI, DEC-04 (opção B, confirmada pelo dono do produto): o histórico de extrações Bitrix24
(`BitrixExtractionRun`) com dado pessoal exportado (arquivos CSV/XLSX/JSON com nome/e-mail/telefone
reais de leads/contatos/empresas) nunca tinha expurgo automático — `BITRIX_EXTRACTION_RETENTION_DAYS`/
`BITRIX_EXTRACTION_PURGE_ENABLED` existiam em `src/config/env.ts` desde a Onda 6 sem nenhum
consumidor (achado documentado em
`.agents/handoffs/onda-40/06-para-16-bitrix-extraction-purge-worker-ausente.md`, que este handoff
resolve).

Construí o worker completo e testável em
`src/features/integrations/bitrix/jobs/bitrixExtractionPurge.worker.ts`, seguindo o mesmo padrão de
`src/features/intelligence/jobs/agentMemoryCleanup.worker.ts` (registrado em `worker.ts` nesta mesma
Onda — linha de referência abaixo). **Não editei `worker.ts`** (arquivo de dono único, fora da minha
propriedade nesta rodada) — este handoff é o pedido para registrar o worker lá.

## O que o worker faz (resumo — comentário completo no topo do arquivo)

- Decisão DEC-04 opção B: **ANONIMIZA, nunca apaga a linha** (`delete`). Preserva id, datas,
  contadores, status, entidades, `requestedBy` (auditoria de quem exportou). Remove o dado pessoal
  real: os arquivos em disco (via `deleteExtractionRunFiles`, já existente em `extractionFiles.ts`)
  e o único campo de texto livre da linha (`filters.search`, que pode conter um nome/e-mail
  digitado por um humano). `files` (Json) é zerado depois que os arquivos são apagados.
- Fail-safe: `BITRIX_EXTRACTION_PURGE_ENABLED=false` (default) faz `runBitrixExtractionPurgeSweep`
  retornar sem consultar nem alterar nada, mesmo que o BullMQ scheduler esteja registrado.
- Retenção: `BITRIX_EXTRACTION_RETENTION_DAYS` (default 45, já confirmado pelo dono do produto em
  2026-08-15 — ver `.agents/handoffs/onda-6/01A-para-06-bitrix-extraction-run-schema.md`). Não
  criei nem alterei nenhuma env nova — as duas já existiam, só ficaram sem consumidor até agora.
- Só toca runs em status terminal (`completed`/`completed_partial`/`failed`/`cancelled`) — nunca
  `queued`/`running` (em andamento, mesmo que antigo/travado).
- Idempotência SEM coluna nova no schema (ver seção abaixo): marcador `progress.purgedAt` (ISO)
  dentro do Json `progress` já existente.
- Descoberta cross-tenant sob bypass (`Organization`, que já está no allowlist), expurgo por linha
  sempre com `requestContext.run({ tenantId })` real — `BitrixExtractionRun` NÃO está no allowlist
  de bypass (`BYPASS_RLS_ALLOWED_MODELS`, `src/lib/prisma.ts`), mesmo tratamento de `AgentMemory`.
- Falha ao processar uma organização/linha não derruba a varredura das demais (mesmo padrão de
  `agentMemoryCleanup.worker.ts`/`autoAnonymizeDisqualified.worker.ts`).
- Auditoria: cada linha expurgada gera um `AuditService.log({ action: 'UPDATE', entity:
  'BitrixExtractionRun', ... })`.

## Snippet exato para `worker.ts`

Mesmo padrão usado para `agentMemoryCleanup.worker.ts` nesta mesma Onda — ver `worker.ts` linha 51
(import) e linhas 87/100/143 (uso). Import a adicionar junto dos demais, na mesma região:

```ts
import { createBitrixExtractionPurgeWorker, scheduleBitrixExtractionPurgeJob } from './src/features/integrations/bitrix/jobs/bitrixExtractionPurge.worker.js';
```

Dentro de `startWorkerProcess()`, junto da criação dos demais workers (ao lado de
`const agentMemoryCleanupWorker = createAgentMemoryCleanupWorker();`):

```ts
const bitrixExtractionPurgeWorker = createBitrixExtractionPurgeWorker();
```

No `Promise.all([...])` de agendamento (junto de `scheduleAgentMemoryCleanupJob()`):

```ts
scheduleBitrixExtractionPurgeJob(),
```

Em `registeredWorkers` (junto de `{ name: 'agent-memory-cleanup', worker: agentMemoryCleanupWorker }`):

```ts
{ name: 'bitrix-extraction-purge', worker: bitrixExtractionPurgeWorker },
```

Nada além disso — o worker não precisa de nenhum outro hook no shutdown/health server (já cobertos
genericamente pelo loop `registeredWorkers` existente).

## Campo de schema recomendado (NÃO migrado por mim — fora do meu escopo editar `prisma/schema.prisma`)

Hoje a idempotência usa um marcador dentro do Json `progress` (`progress.purgedAt`, ISO) em vez de
uma coluna dedicada — funciona e está testado (`tests/unit/features/integrations/bitrix/jobs/
bitrixExtractionPurge.worker.test.ts`), mas tem duas desvantagens que uma coluna resolveria:

1. **Filtro no banco em vez de em memória.** Hoje o worker busca todo run expirado por
   `createdAt`/`status` e filtra "já expurgado?" no código (lendo `progress.purgedAt` de cada
   linha). Com `purgedAt DateTime?` na tabela, o `WHERE` do Prisma já exclui direto
   (`purgedAt: null`), sem precisar trazer nem inspecionar linhas já tratadas.
2. **Sinal explícito na UI/API de listagem** (`listExtractionRuns`/`BitrixExtractionPanel.tsx`) —
   hoje não há como a tela mostrar "esta extração foi expurgada por LGPD" sem decodificar o Json de
   `progress`, que é implementação interna, não contrato de API.

Campo sugerido, exatamente como o handoff original já antecipava
(`.agents/handoffs/onda-40/06-para-16-bitrix-extraction-purge-worker-ausente.md`, "ex.: `purgedAt`
em `BitrixExtractionRun`"):

```prisma
model BitrixExtractionRun {
  // ... campos existentes ...

  /// Preenchido pelo worker de expurgo LGPD (bitrixExtractionPurge.worker.ts) quando este run é
  /// anonimizado por retenção expirada (DEC-04 opção B — nunca apagado, só anonimizado). `null` =
  /// nunca expurgado. Usado tanto para o filtro WHERE do worker (`purgedAt: null`) quanto para a
  /// UI sinalizar "dado pessoal já removido por retenção".
  purgedAt DateTime?

  @@index([organizationId, purgedAt])
}
```

Se/quando esse campo for migrado, o worker deve trocar:
- a query de candidatos: adicionar `purgedAt: null` ao `where` (substitui o filtro em memória
  `isAlreadyPurged`/`progress.purgedAt`);
- o `update`: setar `purgedAt: new Date()` em vez de (ou além de) `progress.purgedAt`.

Não é bloqueador — o worker funciona corretamente sem essa migration, só é menos eficiente/visível.

## Decisões que ainda preciso que você (dono do produto) confirme

1. **Redação de `filters.search`**: interpretei "dado pessoal real exportado" como (a) os arquivos
   em disco (óbvio) e (b) o texto livre de busca (`filters.search`), porque é o único campo desta
   linha do Postgres que pode conter, ele mesmo, um nome/e-mail digitado por um humano. Mantive
   `entities`/`fields`/`requestedBy`/`connectionId`/período/pipeline/etapa/responsável — são
   configuração e auditoria, não dado pessoal do titular extraído. Se você quiser um escopo de
   redação diferente (ex.: também redigir `requestedBy`, ou não redigir `filters.search`), é uma
   troca pequena em `redactFilters`/`markPurgedProgress` no worker.
2. **Confirmar que 45 dias continua o número certo para EXPURGO em produção** — a confirmação de
   2026-08-15 fixou a retenção para o schema existir, não necessariamente para "quando o worker
   ligar de verdade, ainda vale 45?". Se sim, nenhuma ação — é só o default já configurado.
3. **Ativar `BITRIX_EXTRACTION_PURGE_ENABLED=true` em produção é uma decisão separada deste
   handoff** — o worker está pronto e testado, mas a ativação em si (mudar a env var no ambiente
   real) precisa da sua confirmação explícita, dado que zera dado real de forma não reversível a
   partir do momento em que roda. Recomendo rodar uma vez manualmente num ambiente não-produção
   antes de ligar o cron em produção (dá para disparar `runBitrixExtractionPurgeSweep()` uma vez
   com a flag ligada, fora do cron, para conferir o efeito num punhado de runs antes de confiar no
   agendamento diário).

## Teste

`tests/unit/features/integrations/bitrix/jobs/bitrixExtractionPurge.worker.test.ts` — 15 casos
cobrindo: flag desligada não toca nada; descoberta cross-tenant (bypass na descoberta, tenant real
por linha); janela de retenção (WHERE por `createdAt`/status terminal); anonimização preservando
estatística e removendo PII (arquivo antes da linha, nunca a linha sozinha); idempotência (rodar
duas vezes não duplica nem falha); falha isolada numa organização/linha não derruba as demais.

## Contexto adicional

Arquivos tocados nesta rodada:
- `src/features/integrations/bitrix/jobs/bitrixExtractionPurge.worker.ts` (novo)
- `tests/unit/features/integrations/bitrix/jobs/bitrixExtractionPurge.worker.test.ts` (novo)
- Este handoff (novo)

Nenhuma env nova criada — `BITRIX_EXTRACTION_RETENTION_DAYS`/`BITRIX_EXTRACTION_PURGE_ENABLED` já
existiam em `src/config/env.ts` desde a Onda 6, só sem consumidor até agora. Nenhuma migration
criada — `prisma/schema.prisma` não foi editado (ver campo `purgedAt` recomendado acima, para
quando puder ser migrado por quem tem essa propriedade).
