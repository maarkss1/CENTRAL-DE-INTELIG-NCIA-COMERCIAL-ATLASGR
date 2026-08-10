# AGENTS.md — Comercial Inteligente (Revenue Command Center executivo)

## Dono
Agente 04 — CRM e BI

Este arquivo governa esta pasta e todas as subpastas.

## O que é
Módulo executivo restrito (ADMIN/GESTOR — ver `canAccessCommercialIntelligence` em
`src/lib/auth/authorization.ts`) de consolidação/previsão sobre o funil "Negócio" do CRM
(`Lead` com `funnel: 'Negocio'`, `CrmPipeline`/`CrmPipelineStage`). NÃO substitui `src/features/crm`
nem `crm360` — lê os mesmos dados, nunca duplica a fonte de verdade.

## Pode alterar
- métricas, agregações, forecast e cálculos deste módulo (`application/`, `domain/`, `infra/`).
- UI do módulo (`components/`) e o dicionário de métricas (`application/metricsDictionary.ts`).

## Não pode
- Não criar migration sem handoff para o Agente 01 (dono de `prisma/schema.prisma`).
- Não fabricar KPI — toda métrica precisa de fórmula reproduzível, documentada em
  `metricsDictionary.ts`. Ausência de dado é "Não disponível" (`null`), nunca 0 fabricado.
- Não afrouxar o RBAC deste módulo (`ADMIN`/`GESTOR`, ver `COMMERCIAL_INTELLIGENCE_ROLES`) sem
  decisão humana explícita — é o módulo mais sensível do produto (dado financeiro consolidado).
- Não reintroduzir um papel (DIRETOR/CEO/SDR/...) fora dos 4 papéis reais de `User.role` — ver
  comentário em `src/lib/auth/authorization.ts` e Pilot 003 em `.claude/PILOTS.md`.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.
- Escrita em `LeadStageHistory` acontece FORA desta pasta, em `crm360.service.ts`
  (`moveRecord`/`createDeal`/`convertLead`), via `infra/stageHistory.ts` — esse é o único ponto de
  escrita real de mudança de etapa; não duplicar em outro lugar.

## Definição de pronto local
- fórmulas documentadas em `metricsDictionary.ts`, dados rastreáveis a `Lead`/`CrmPipelineStage`/
  `LeadStageHistory`/`CommercialGoal`, testes de agregação (`__tests__/`) e RBAC ponta-a-ponta
  (`tests/integration/rbac-e2e-commercial-intelligence.test.ts`,
  `tests/e2e/commercial-intelligence-rbac.spec.ts`).

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio (`src/features/commercial-intelligence/__tests__/**`,
  `tests/integration/rbac-e2e-commercial-intelligence.test.ts`)
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
