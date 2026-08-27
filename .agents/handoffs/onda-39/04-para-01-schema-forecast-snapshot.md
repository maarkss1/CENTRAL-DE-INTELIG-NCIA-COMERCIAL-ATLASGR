- De: Agente 04 (CRM e BI)
- Para: Agente 01 (Plataforma, Segurança e Dados)
- Onda: 39 (auditoria CPI — gaps de forecast backtest/versionamento e Health Score composto)
- Status: resolvido
- Prioridade: alto

## Problema

O motor de Forecast (`src/features/commercial-intelligence/application/forecastEngine.ts`) é
100% regras determinísticas, sem nenhum snapshot histórico persistido. A auditoria pediu:

1. Snapshot semanal append-only do forecast (data do snapshot, Commit/Best Case/Forecast por
   categoria, versão das regras).
2. Erro histórico real (previsto vs. realizado) quando o período de referência de um snapshot
   antigo já fechou.

Implementei toda a lógica de cálculo (pura, testada, sem I/O) e o CONTRATO de persistência
(`ForecastSnapshotStore`), mas a implementação real precisa de uma tabela nova no Postgres via
Prisma — `prisma/schema.prisma` é propriedade exclusiva do Agente 01/01A (ver `/AGENTS.md` →
"Propriedade exclusiva de arquivos" e `src/features/commercial-intelligence/AGENTS.md` → "Não
pode: criar migration sem handoff"). Não editei o schema.

Enquanto este handoff não é resolvido, o snapshot semanal só pode rodar com
`InMemoryForecastSnapshotStore` (dados somem a cada reinício de processo — documentado como
protótipo, nunca para produção) e o pilar "Confiabilidade de Forecast" do Health Score
(`application/healthScore.ts`) fica permanentemente "não disponível" em produção, porque nunca
existe snapshot antigo persistido para comparar contra o realizado.

## Arquivo(s) envolvido(s)

- `prisma/schema.prisma` — precisa de um novo model (proposta abaixo).
- `prisma/migrations/` — nova migration correspondente.
- Já implementados por mim (não precisam de mudança, só de uma implementação real da interface):
  - `src/features/commercial-intelligence/domain/CommercialIntelligence.ts` — `ForecastSnapshotRecord`, `ForecastSnapshotStore`.
  - `src/features/commercial-intelligence/application/forecastSnapshot.ts` — `buildForecastSnapshot` (constrói o registro a partir de `ExecutiveOverview`, puro).
  - `src/features/commercial-intelligence/application/forecastAccuracy.ts` — `computeForecastAccuracy`/`summarizeForecastAccuracy` (cálculo de erro, puro).
  - `src/features/commercial-intelligence/infra/InMemoryForecastSnapshotStore.ts` — protótipo em memória da mesma interface, só para teste/dev.

## Alteração necessária

Model Prisma sugerido (nomes/tipos ajustáveis pelo Agente 01 ao critério de convenção do schema
existente — isto é uma proposta, não uma exigência de nomenclatura):

```prisma
model ForecastSnapshot {
  id             String   @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  /// Período (mês) que este snapshot está prevendo — "YYYY-MM".
  period         String
  snapshotAt     DateTime @default(now())
  rulesVersion   String
  commitAmount   Decimal
  bestCaseAmount Decimal
  forecastAmount Decimal
  currency       String   @default("BRL")

  @@index([organizationId, period])
  @@map("forecast_snapshots")
}
```

Pontos que precisam de RLS (mesmo padrão já usado em `CommercialGoal`/`Lead`): filtro por
`organizationId` obrigatório em toda query, nunca cross-tenant.

Depois de a tabela existir, a implementação real de `ForecastSnapshotStore` (ex.:
`PrismaForecastSnapshotStore implements ForecastSnapshotStore`) é trivial — três métodos
(`save`/`findByPeriod`/`findAll`), no mesmo padrão de `PrismaCommercialIntelligenceRepository.ts`
— posso implementar essa parte assim que a tabela existir, sem precisar de outro handoff.

Também em aberto (não é bloqueador de schema, mas depende dele): quem dispara o snapshot semanal
(cron/worker — provavelmente domínio do Agente 16, Runtime/Workers) ainda não existe; hoje
`buildForecastSnapshot`/`ForecastSnapshotStore.save` só são chamados a partir de testes.

## Teste esperado

- Migration aplica limpo em ambiente de teste (`npx prisma migrate dev` / `deploy`).
- RLS real: organização A nunca lê snapshot de organização B (mesmo padrão de
  `tests/integration/rbac-e2e-commercial-intelligence.test.ts`).
- Depois de implementado `PrismaForecastSnapshotStore`, os testes unitários já escritos
  (`src/features/commercial-intelligence/__tests__/forecastSnapshot.unit.test.ts`,
  `forecastAccuracy.unit.test.ts`) continuam passando sem alteração (testam a lógica pura, não a
  implementação da store).

## Resolução

Model `ForecastSnapshot` criado em `prisma/schema.prisma` (nomes/tipos da proposta preservados,
`Decimal(14,2)` para os 3 valores monetários), migration `20260827020000_forecast_snapshot`
(RLS ativado/forçado + policy padrão, mesmo formato de `CommercialGoal`/`LeadStageHistory` — não
entrou na allowlist de bypass de bootstrap porque toda query já roda com `app.current_tenant_id`
setado). `PrismaForecastSnapshotStore` implementado (`save`/`findByPeriod`/`findAll`, append-only,
converte `Decimal`→`number` na leitura) e testado em unidade
(`tests/unit/features/commercial-intelligence/infra/PrismaForecastSnapshotStore.test.ts`). Os
testes de lógica pura já existentes (`forecastSnapshot.unit.test.ts`, `forecastAccuracy.unit.test.ts`)
não precisaram de nenhuma alteração — testam a lógica, não a persistência.

Ainda em aberto, mas fora do escopo deste handoff (é sobre persistência, não sobre quem dispara o
snapshot): o cron/worker que chama `PrismaForecastSnapshotStore.save` periodicamente ainda não
existe — ver novo handoff `.agents/handoffs/onda-39/04-para-16-cron-forecast-snapshot-semanal.md`.

## Contexto adicional

Toda a lógica de cálculo (erro percentual, direção superestimou/subestimou/acertou, agregação em
"erro histórico médio") já está implementada e testada isoladamente — ver
`src/features/commercial-intelligence/__tests__/forecastAccuracy.unit.test.ts` (12 casos) e
`forecastSnapshot.unit.test.ts` (7 casos). Este handoff é só sobre persistência real; nenhuma
mudança de fórmula é necessária depois que a tabela existir.
