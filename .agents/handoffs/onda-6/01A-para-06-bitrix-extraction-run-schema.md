- De: Agente 01A (Confiabilidade de Dados, RLS e Retenção)
- Para: Agente 06 (Integrações e Bitrix) / 06A (Extrações Bitrix)
- Onda: 6
- Status: aberto
- Prioridade: normal

## Problema
Item 3 da minha missão: destravar o schema de histórico de extrações Bitrix
(`BitrixExtractionRun`), parado desde a Onda 1 esperando uma decisão humana de janela de retenção
(`.agents/handoffs/onda-1/06-para-01-schema-extracoes-bitrix-historico.md`). Implementei o model
seguindo integralmente a sugestão daquele handoff, com a janela de retenção como **parâmetro**
(não gravada na migration) e o worker de expurgo **desligado por padrão**.

## Arquivo(s) envolvido(s)
- `prisma/schema.prisma` — model `BitrixExtractionRun` + enum `BitrixExtractionStatus` (já gravado
  nesta branch, `agente/01A-dados-rls-retencao`).
- `prisma/migrations/20260815020000_bitrix_extraction_run/migration.sql` — migration aplicada e
  testada (46→47 migrations do zero, sem deriva).
- `src/config/env.ts` — `BITRIX_EXTRACTION_RETENTION_DAYS` (default 90, `z.coerce.number().int()
  .positive()`) e `BITRIX_EXTRACTION_PURGE_ENABLED` (default `false`).

## Schema final

```prisma
enum BitrixExtractionStatus {
  queued
  running
  completed
  failed
  cancelled
}

model BitrixExtractionRun {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  connectionId String?
  connection   BitrixConnection? @relation(fields: [connectionId], references: [id], onDelete: SetNull)

  requestedBy String?
  entities    String[]
  fields      Json
  filters     Json

  status BitrixExtractionStatus @default(queued)

  progress      Json?
  totalCount    Int  @default(0)
  countByEntity Json?

  errorMessage  String? @db.Text
  correlationId String?
  attempts      Int     @default(0)

  files Json?

  startedAt   DateTime?
  completedAt DateTime?
  cancelledAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([organizationId, createdAt])
  @@index([connectionId])
  @@index([status])
}
```

RLS: `tenant_isolation_policy` padrão (ENABLE + FORCE ROW LEVEL SECURITY, `USING
(current_setting('app.current_tenant_id', TRUE) = "organizationId" OR
current_setting('app.bypass_rls', TRUE) = 'on') WITH CHECK (true)`), mesmo padrão de
`BitrixSyncLog`. `WITH CHECK(true)` porque o worker de extração roda fora do ciclo de request
(BullMQ) — igual ao motivo já documentado nas migrations de RLS anteriores.

## PERGUNTA EXPLÍCITA — janela de retenção (pendente de confirmação humana)
Adotei **90 dias** como padrão em `BITRIX_EXTRACTION_RETENTION_DAYS` — mesmo valor já usado (hard-
coded) no worker de anonimização de leads desqualificados (`autoAnonymizeDisqualified.worker.ts`).
**Isto não foi confirmado por um humano.** Preciso que o dono do produto confirme ou corrija este
número antes que qualquer worker de expurgo real seja ligado. Como o valor é uma env var, mudar
depois é trivial (não exige nova migration) — não fica bloqueado esperando a resposta, mas o
worker de expurgo correspondente (`bitrixExtractionPurge.worker.ts`, ainda não implementado por
mim — fica para quem construir o módulo de extração de verdade nesta ou próxima onda) deve
permanecer com `BITRIX_EXTRACTION_PURGE_ENABLED=false` até essa confirmação.

## Alteração necessária (para 06/06A)
Nenhuma ação obrigatória — o schema já existe e está pronto para o módulo real ser construído em
cima dele. Ao implementar o serviço/worker de extração:
1. Gravar `organizationId` sempre a partir do `requestContext`/tenant autenticado, nunca aceito de
   payload externo (mesmo padrão de todo o resto do app).
2. `files` guarda só metadados (formato, path/URL de storage, tamanho, geradoEm) — nunca o
   conteúdo do arquivo na linha, conforme o handoff original da Onda 1.
3. Excluir uma extração precisa remover o arquivo associado no storage, não só a linha — ainda não
   implementado (não há storage de arquivo integrado no repo hoje, até onde vi).
4. O worker de expurgo automático (quando construído) deve ler `BITRIX_EXTRACTION_RETENTION_DAYS`/
   `BITRIX_EXTRACTION_PURGE_ENABLED` de `src/config/env.ts`, nunca hardcode um número novo.

## Teste esperado
- Isolamento entre organizações no histórico (RLS + filtro explícito).
- Cross-tenant negado (mesmo padrão de `tenant-isolation-db001.test.ts`).
- Quando o worker de expurgo for implementado: idempotência e respeito ao flag desligado por
  padrão.

## Contexto adicional
`prisma validate` OK, `prisma migrate deploy` aplicado com sucesso tanto no banco de teste
compartilhado quanto num banco vazio criado do zero (47/47 migrations, incluindo esta), `prisma
migrate diff` contra o schema final não mostra deriva causada por esta migration (drift pré-
existente e não relacionado documentado separadamente no relatório da onda).
