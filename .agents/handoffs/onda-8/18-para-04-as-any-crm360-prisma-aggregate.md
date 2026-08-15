- De: 18
- Para: 04
- Onda: 8
- Status: aberto
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
