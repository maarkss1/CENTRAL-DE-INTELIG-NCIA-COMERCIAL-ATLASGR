- De: 18
- Para: 04
- Onda: 8
- Status: resolvido
- Prioridade: alto

## Problema
`src/features/crm360/services/crm360.service.ts` tem 5 ocorrências de `as any` num limite de
contrato: 2 escondem a forma real do retorno de agregação do Prisma (`groupBy`/`_count`/`_sum`) com
fallback silencioso para `0` se o shape mudar, e 3 escondem o tipo de entrada de campo `Json`
(`customFields`) em escritas. Risco desigual entre os dois grupos — detalho abaixo. (Nota de
propriedade: `crm360` não está listado explicitamente em nenhum `.agents/prompts/*.md` — inferi
04 por proximidade com `src/features/crm/**`/`analytics/**`, que são seus. Se não for seu domínio,
redirecione para quem for.)

## Arquivo(s) envolvido(s)
- `src/features/crm360/services/crm360.service.ts:200` — `count: (row._count as any)._all ?? 0,`
- `src/features/crm360/services/crm360.service.ts:201` — `amount: (row._sum as any).amount ?? 0,`
- `src/features/crm360/services/crm360.service.ts:339,404,431` — `customFields: input.customFields as any,`
  (em `createDeal`, `createProduct`, `updateProduct`)

## Alteração necessária
**Linhas 200-201 (risco alto)**: `count`/`amount` alimentam o resumo do dashboard CRM360 —
`amount` é valor monetário de negócio. O fallback `?? 0` some silenciosamente se a forma real do
retorno do `groupBy` do Prisma mudar (ex.: numa migração de versão do Prisma, ou se o agrupamento
for reescrito), produzindo "R$ 0" em vez de erro visível — exatamente o tipo de falso-sucesso que
`/AGENTS.md` → "Dados reais x demonstração" proíbe. Proposta: tipar o retorno do `groupBy` do
Prisma explicitamente (o próprio Prisma Client gera um tipo para isso — `Prisma.LeadGroupByOutputType`
ou equivalente para o model usado) em vez de `any`, ou validar a forma antes de acessar
`._all`/`.amount`.

**Linhas 339/404/431 (risco médio)**: cast de entrada para o tipo `Json` do Prisma
(`customFields: input.customFields as any`). O dado de origem (`customFields`) é genuinamente JSON
livre — isto é mais fricção de tipagem do Prisma do que um contrato real sendo escondido. Proposta
mais barata: trocar `as any` por `as Prisma.InputJsonValue` (ou o tipo equivalente exportado pelo
Prisma Client), que preserva a intenção sem abrir mão de qualquer checagem.

## Teste esperado
- `npx tsc --noEmit` sem erros novos após a troca de tipo.
- Testes de `tests/unit/features/crm360/**` (se existirem) continuam passando, incluindo qualquer
  teste que exercite o resumo `count`/`amount` do dashboard.

## Contexto adicional
Classificação de risco desta varredura: alto = pode mascarar drift num valor monetário/de negócio
sem erro visível; médio = fricção de tipagem interna sem exposição externa de contrato.

## Resolução (Agente 04, Onda 10)

**Linhas 200-201 (risco alto) — resolvido, mas não com a correção mínima proposta.** Trocar
`(row._count as any)._all ?? 0` só por `row._count._all` sem mais nada não compilava: o `tsc`
revelou que o `groupBy` inline, como um dos ~11 elementos do array passado a
`prisma.$transaction([...])`, perdia a inferência literal de `by`/`_count`/`_sum` — o tipo de `row`
colapsava para o tipo genérico de argumento de seleção do Prisma (`LeadCountAggregateInputType`,
que não tem `_all` como propriedade de saída, só como opção de seleção `true`), não para o tipo de
retorno da agregação. Essa é provavelmente a causa raiz de por que o `as any` existia — não era só
preguiça de tipagem, era uma limitação real de inferência do TypeScript com generics aninhados
dentro de um array literal grande.

Correção real: extraída a chamada `prisma.lead.groupBy({...})` para uma variável (`stageCountsQuery`)
**antes** do array do `$transaction`, e essa variável é referenciada dentro do array em vez do
`groupBy` inline. Chamado isoladamente, o Prisma Client infere corretamente
`Array<{ funnel, status, _count: { _all: number }, _sum: { amount: number | null } }>`, e esse tipo
já resolvido é preservado quando a promise entra no array do `$transaction` (não precisa ser
re-inferido lá). Resultado:
```ts
const stageCountsQuery = prisma.lead.groupBy({
    where: { organizationId },
    by: ['funnel', 'status'],
    _count: { _all: true },
    _sum: { amount: true },
    orderBy: { funnel: 'asc' },
});
// ... dentro do array do $transaction: stageCountsQuery no lugar do groupBy inline
```
```ts
stageCounts: stageCounts.map((row) => ({
    funnel: row.funnel,
    status: fromPrismaLeadStatus(row.status),
    count: row._count._all,       // sem `?? 0`: o tipo agora garante que _all é sempre number
    amount: row._sum.amount ?? 0, // `?? 0` mantido: aqui é fallback legítimo (soma de amount pode
                                   // ser null quando nenhum lead do grupo tem amount preenchido),
                                   // não mais um mascaramento de shape desconhecida
})),
```
Nenhum `any` explícito ou implícito restante nesse trecho — `npx tsc --noEmit -p .` confirma.

**Linhas 339/404/431 (risco médio) — resolvido conforme proposto.** Os 3 `as any` de
`customFields` (em `createDeal`, `createProduct`, `updateProduct`) viraram `as Prisma.InputJsonValue`.
Em `updateProduct` foi necessário um ajuste adicional: `{ ...input, ...(customFields !== undefined ?
{ customFields: customFields as Prisma.InputJsonValue } : {}) }` não compilava porque o spread de
`...input` já carregava o tipo original de `customFields` (`Record<string, unknown> | null |
undefined`, incompatível com `Prisma.InputJsonValue`) e o TypeScript intersecciona os tipos dos dois
spreads em vez de deixar o último sobrescrever o tipo do primeiro. Resolvido desestruturando
`customFields`/`type`/`currency` para fora do `...rest` espalhado, e montando cada campo especial
(`type`, `currency`, `customFields`) como um spread condicional separado — o mesmo padrão que o
código já usava para `type`/`currency`, só estendido para `customFields`.

**Teste:** não existe `tests/unit/features/crm360/**` neste repositório — confirmado
(`find tests/unit/features/crm360` não retorna arquivos), então esse item do "Teste esperado" não
é aplicável nesta execução (não é meu escopo criar testes para código que não tenho evidência de
estar em uso — ver nota abaixo). `npx tsc --noEmit -p .` (0 erros), `npm run lint` (0 erros, warnings
pré-existentes em outros arquivos não tocados), `npm run test:unit` (147 arquivos, 1104 testes,
100% passando) e `npm run build` (vite build + esbuild do server) todos verdes.

**Nota fora do pedido original, mas relevante para quem for revisar este arquivo depois:**
`crm360Service` (o objeto exportado por este arquivo, dono das linhas corrigidas) não é importado
por nenhum outro módulo do repositório além de uma menção em comentário — o CRM360 real parece
estar servido por `src/features/crm360/application/Crm360UseCases.ts` +
`presentation/Crm360Controller.ts` + `infra/PrismaCrm360Repository.ts` (padrão de camadas
diferente). Não investiguei se `services/crm360.service.ts` é código morto ou um caminho alternativo
ainda referenciado fora de `src/` (rotas registradas em `server.ts`, etc.) — está fora do escopo
deste handoff, que pedia apenas a correção de tipo nas linhas indicadas. Reportando para o
Coordenador avaliar se vale um handoff próprio de investigação de código morto.

**Ambiente:** sem Docker/Postgres neste ambiente — não foi possível rodar `test:integration`
(exige `prisma migrate deploy` contra um Postgres real). Registrado aqui explicitamente, não pulado
em silêncio.
