- De: 03 — Orçamento/Teto de IA e Prospecção por organização (DEC-09)
- Para: 00 — Coordenador (roteamento: `prisma/schema.prisma`/`prisma/migrations/**` estão fora do
  boundary de arquivos autorizado para esta execução — a instrução explícita foi "NÃO edite
  prisma/schema.prisma... escreva handoff")
- Onda: onda-42
- Status: aberto
- Prioridade: alto (bloqueia o teto por organização de virar realmente fail-closed em produção —
  até a migration rodar, o código novo desta rodada fica fail-open por construção, ver seção
  "Estado atual sem a migration" abaixo)

## Contexto

Dossiê CPI, DEC-09, opção B escolhida pelo usuário: adicionar um teto REAL que BLOQUEIA chamadas de
IA e de provider de prospecção (Apollo/Hunter) acima de um valor mensal configurado **por
organização** — não só observabilidade (que já existia: `src/lib/ai/budget.ts` para custo de IA, e
`src/features/prospecting/services/providerCostMetrics.ts` para custo de provider, ambos adicionados
nesta mesma onda, nenhum dos dois bloqueava nada antes desta mudança).

## Campos pedidos em `Organization`

```prisma
model Organization {
  // ... campos existentes ...

  /// DEC-09 (onda 42): teto mensal de gasto com IA (USD) desta organização. Nullable = SEM TETO
  /// (nunca bloqueia) — nunca um default implícito de US$0, que bloquearia toda organização nova
  /// silenciosamente. Comparado contra a soma de `AILog.cost` do mês corrente desta organização
  /// (`AILog.organizationId`, campo que já existe) por `assertAiBudgetNotExceeded`
  /// (src/lib/ai/budget.ts).
  monthlyAiBudgetUsd            Float?

  /// DEC-09 (onda 42): teto mensal de gasto com providers de prospecção pagos (Apollo/Hunter, USD)
  /// desta organização. Nullable = SEM TETO, mesmo raciocínio do campo acima. Comparado contra o
  /// acumulado do mês corrente desta organização por `assertProspectingBudgetNotExceeded`
  /// (src/features/prospecting/services/providerBudget.ts) — ver a seção "Achado adicional" abaixo
  /// sobre POR QUE esse acumulado hoje vive em Redis, não em Postgres.
  monthlyProspectingBudgetUsd   Float?
}
```

Ambos `Float?`, sem `@default`, mesmo padrão de nullable-significa-sem-limite já usado noutros
lugares deste schema (ex. campos opcionais de configuração por tenant).

## Estado atual sem a migration (importante)

O código desta rodada já foi escrito assumindo que os dois campos acima existem (conforme
instrução recebida: "pode já escrever o código usando o campo"), em:

- `src/lib/ai/budget.ts` — funções `getOrgAiBudgetUsd`/`assertOrgAiBudgetNotExceeded`.
- `src/features/prospecting/services/providerBudget.ts` — função `getOrgProspectingBudgetUsd`.

Como os campos ainda não existem no client Prisma gerado, as duas leituras usam um cast de
`select`/resultado (`select: { monthlyAiBudgetUsd: true } as unknown as { id: true }`, resultado
lido de volta via `as unknown as { monthlyAiBudgetUsd: number | null }`) só para o TypeScript
aceitar a referência hoje. Em runtime, ANTES da migration rodar, a query real tentará selecionar
uma coluna que não existe — o catch ao redor trata isso (e qualquer outro erro de leitura) como
"sem teto configurado" (fail-open), então **o teto por organização fica inerte (nunca bloqueia
ninguém) até a migration rodar** — comportamento seguro (equivalente a "recurso ainda não
lançado"), não uma regressão, mas também não é o estado final: só depois da migration + `npx prisma
generate` é que o teto passa a bloquear de verdade quando configurado.

**Ação de acompanhamento depois que a migration rodar** (não urgente, é só limpeza): trocar os dois
`select`/cast acima por um `select` normal e remover os dois blocos `try/catch` de "coluna ainda
não existe" (o catch pode continuar existindo só para "Postgres indisponível", igual ao resto do
arquivo — só o motivo "coluna ausente" deixa de ser possível). Comentários no código já apontam
para este handoff nesses dois pontos exatos.

## Achado adicional (fora do pedido original, mas relevante para revisar o escopo)

O pedido original só mencionava "se precisar de um novo campo em Organization". Investigando o
lado de prospecção, encontrei uma lacuna maior: **não existe hoje nenhuma tabela Postgres com o
custo de chamadas a Apollo/Hunter por organização** (nem por chamada individual). O que existe é só
um `Counter` Prometheus sem rótulo de tenant e sem corte por mês
(`prospecting_provider_cost_usd_total`, `providerCostMetrics.ts`) — inadequado como fonte de
verdade para um teto mensal por organização (Counter só cresce, é por processo, não sobrevive a
restart, e não tem como distinguir "gasto deste mês" de "gasto acumulado desde sempre").

Do lado de IA, esse problema não existe porque `AILog` já tem `organizationId` — o teto por
organização só precisou de um `aggregate` a mais. Do lado de prospecção, a solução equivalente e
mais robusta seria uma tabela nova (o par de "AILog para custo de provider"), algo como:

```prisma
model ProspectingProviderCostLog {
  id             String        @id @default(cuid())
  organizationId String?
  organization   Organization? @relation(fields: [organizationId], references: [id], onDelete: SetNull)
  provider       String        // 'apollo' | 'hunter'
  costUsd        Float
  createdAt      DateTime      @default(now())

  @@index([organizationId, createdAt])
}
```

com RLS igual ao de `AILog` (`prisma/migrations/20260813230000_fix_ailog_rls_unattributed_internal_writes`
como referência para o caso de escrita sem tenant conhecido).

**Não pedi esse modelo agora** porque (a) o escopo original só citava campos em `Organization`, e
(b) havia uma alternativa que não exige NENHUMA migration: usar Redis (`cacheConnection`, já
dependência real deste projeto) como armazenamento durável — não só cache — com uma chave por
(organização, mês) incrementada via `INCRBYFLOAT`. Foi essa a solução implementada em
`src/features/prospecting/services/providerBudget.ts` (comentário grande no topo do arquivo explica
o trade-off completo). Ela já é um bloqueio REAL hoje (sobrevive a restart do processo e é
compartilhada entre todos os processos web quando Redis está configurado — o caso esperado de
produção), só menos robusta que uma tabela Postgres nos seguintes pontos:

- Sem `REDIS_URL` configurada (dev local, ou uma instância caída), cai para um Map em memória por
  processo — não compartilhado entre processos, não sobrevive a restart. Mesmo trade-off já aceito
  hoje por `providerRateLimit.ts`/`providerCache.ts` neste mesmo domínio.
- Sem trilha auditável linha-a-linha (Postgres teria uma linha por chamada; Redis só tem o total
  acumulado do mês) — para IA, `AILog` já serve dois propósitos (orçamento E a tela de consumo em
  `usage.routes.ts`); para prospecção, não há hoje uma tela de consumo equivalente que precisaria
  dessa granularidade, então a perda é menor do que parece.

**Recomendação**: se/quando este dossiê (ou um futuro) quiser uma tela de "Consumo de Prospecção"
equivalente à de IA, ou uma trilha auditável de cada chamada paga a Apollo/Hunter, aí sim vale
migrar `providerBudget.ts` para uma tabela Postgres como a acima — o contrato público do módulo
(`recordProspectingProviderSpend`, `getOrgMonthProspectingCostUsd`,
`assertProspectingBudgetNotExceeded`) foi desenhado para não precisar mudar nos call sites quando
isso acontecer, só a implementation interna.

## Decisão de segurança/produto que precisa de confirmação (fail-open vs. fail-closed)

Implementada conforme a leitura mais segura e mais consistente com o resto do código de orçamento
já existente neste repositório (`assertAiBudgetNotExceeded` global, AI-011), mas registrando aqui
para confirmação explícita, como pedido:

- **Organização SEM teto configurado** (`monthlyAiBudgetUsd`/`monthlyProspectingBudgetUsd` nulos,
  inclusive TODA organização hoje, antes de qualquer admin configurar um valor) → **fail-OPEN**,
  nunca bloqueia. Um campo nullable sem valor nunca deveria virar um teto implícito de US$0 — isso
  bloquearia retroativamente toda organização existente no dia em que a migration rodar, sem
  nenhuma ação deliberada de ninguém. Mesmo raciocínio já usado por `AI_MONTHLY_BUDGET_USD` (env
  var global): "sem configurar, sem teto".
- **Falha ao LER o teto ou o gasto acumulado** (Postgres/Redis indisponível, ou — só até a migration
  deste handoff rodar — a coluna ainda não existindo) → **fail-OPEN**, tratado como "custo/teto
  desconhecido", nunca como "orçamento excedido". Mesma decisão já tomada e documentada no circuit
  breaker global existente (`src/lib/ai/budget.ts::getMonthCostUsd`): "um Postgres temporariamente
  fora do ar não deveria ter um raio de impacto maior (derrubar toda a superfície de IA do produto)
  do que o problema que este circuit breaker existe para prevenir".
- **Organização COM teto configurado E o gasto do mês corrente atingiu/excedeu esse teto** →
  **fail-CLOSED**, bloqueia de verdade (lança `AiOrgBudgetExceededError`/
  `ProspectingBudgetExceededError`, ambos `AppError` com `statusCode: 429`) — esse é o
  comportamento central pedido pelo DEC-09 (opção B: bloquear, não só avisar).

Se a intenção fosse diferente (ex.: um teto default global para organizações sem configuração
explícita, ou bloquear também em caso de falha de leitura), isso muda o comportamento em produção
de forma material e merece decisão explícita antes de eu ajustar.

## Arquivos que passam a depender dos campos (para revisar quando a migration rodar)

- `src/lib/ai/budget.ts` (`getOrgAiBudgetUsd`, `assertOrgAiBudgetNotExceeded`,
  `assertAiBudgetNotExceeded`)
- `src/features/prospecting/services/providerBudget.ts` (`getOrgProspectingBudgetUsd`,
  `assertProspectingBudgetNotExceeded`)
- Testes: `src/lib/ai/__tests__/budget.test.ts`,
  `src/features/prospecting/services/__tests__/providerBudget.test.ts` (ambos mockam `prisma`
  diretamente, então não dependem da migration ter rodado para passar — cobrem o CONTRATO da
  função, não o schema real).

## Teste esperado depois da migration

- Teste de integração (banco real) confirmando que `prisma.organization.findUnique({ select: {
  monthlyAiBudgetUsd: true } })` funciona sem cast e sem erro, e que o valor default de uma
  organização recém-criada é `null` (sem teto) — não `0`.
