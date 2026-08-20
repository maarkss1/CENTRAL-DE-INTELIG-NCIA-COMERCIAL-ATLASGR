# Onda 36 — AI-005: Golden Dataset real e versionado

## Contexto

Segue o merge de AI-006 (PR #211). Ordem invertida por pedido explícito do usuário: AI-006
(métricas de avaliação) foi priorizado antes de AI-005 (Golden Dataset), embora o roadmap original
liste AI-005 primeiro. Depois de AI-006 mergeado, o usuário confirmou explicitamente para prosseguir
para AI-005 também.

**Estado de entrada**: nenhum dataset existia. `npm run verify:ai` é smoke test de conectividade,
sem comparação contra referência nenhuma. O roadmap original (não presente no repo, só referenciado
por `docs/AI-SWARM-GOVERNANCE-AUDIT.md`) pede um dataset sanitizado e versionado para 8 categorias:
qualificação, cold email, objection handling, roleplay, next best action, summary, RAG, tool use —
sem definir formato.

## Decisão de design

1. **Cada categoria ancorada no tipo REAL** da capacidade de produção correspondente (pesquisado
   antes de escrever qualquer caso — `AIService.qualifyLead`, `generateEmailDraft`,
   `generateObjectionHandling`, `RoleplayAiService`, `NextBestActionService.determineNextAction`,
   `MeetingSynthesisService.synthesizeMeeting`, `KnowledgeCopilotService.answerTechnicalQuestion`,
   as 9 ferramentas reais do enxame) — nunca um formato genérico inventado.
2. **Sem construir o harness de scoring automático junto.** A metodologia de comparação (exact
   match para campos estruturados? similaridade semântica para texto livre? juiz por LLM — qual
   modelo?) é decisão de produto que este dataset não deveria resolver sozinho; a maioria das 8
   capacidades tem efeitos colaterais reais (DB, RAG, consentimento LGPD) que precisariam de
   stubs/harness próprio por capacidade — trabalho maior que uma correção pontual. Em vez disso, o
   dataset é validado com rigor real por 3 camadas: schema Zod completo do arquivo; cada `expected`
   usa os mesmos enums/tipos reais dos serviços de produção; e — a prova mais forte — cada caso
   `tool_use` é validado em runtime contra o schema Zod REAL da ferramenta correspondente.
3. **JSON importado como módulo, não `readFileSync`.** O `Dockerfile` de produção só empacota
   `dist/`, nunca `src/` — um caminho relativo ao código-fonte quebraria em produção. Importar como
   módulo faz o esbuild inlinar o conteúdo dentro de `dist/server.cjs` no build (confirmado por
   inspeção do bundle).

## O que foi construído

- `src/features/intelligence/evaluation/goldenDataset.types.ts` — schema Zod completo (discriminated
  union por categoria).
- `src/features/intelligence/evaluation/golden-dataset.json` — **24 casos reais e sanitizados** (3
  por categoria × 8 categorias), domínio fictício grounded em AtlasGR/TotalTrac.
- `src/features/intelligence/evaluation/goldenDataset.service.ts` — `loadGoldenDataset` (memoizado),
  `getCasesByCategory`, `getDatasetSummary`, `validateToolUseCases` (import dinâmico das ferramentas
  — só quem valida `tool_use` paga o custo de carregar `prisma`/`getTenantId`).
- `GET /api/agent/golden-dataset/summary` (novo) — resumo + validação real dos casos `tool_use`.
- `tsconfig.json`: `resolveJsonModule: true` adicionado.

## Fora de escopo (documentado, não construído)

- **Harness de scoring automático** (comparação de verdade contra `expected`/`referenceAnswer`,
  threshold, gate de CI que bloqueia regressão). Sem ele, as 3 dimensões de AI-006 ainda bloqueadas
  (factualidade, aderência ao playbook, hallucination) continuam `available: false` mesmo com o
  dataset pronto — documentado explicitamente em `docs/AI-SWARM-GOVERNANCE-AUDIT.md`.

## Gate

- `npx tsc --noEmit` — limpo
- `npm run lint` — 0 erros, 89 warnings (mesmo baseline da onda 35, nenhum novo)
- unit: `npx vitest run -c vitest.unit.config.ts` — **199/199 arquivos, 1530/1530 testes** (11 casos
  novos em `goldenDataset.service.test.ts` — inclusive a prova de que os 3 casos `tool_use` reais
  validam contra o schema real da ferramenta —, 2 casos novos na rota)
- integration (Postgres+Redis reais): `npx dotenv-cli -e .env.test -- npx vitest run -c
  vitest.integration.config.ts` — **46/46 arquivos, 226/226 testes** (nenhuma migration nesta onda)
- `npm run build` e `npm run build:worker` — ambos limpos; conteúdo do dataset confirmado inline em
  `dist/server.cjs` (grep pelo id de um caso real no bundle)

## Skips e flakes

0 — nenhum teste pulado ou instável observado nesta rodada. Nota operacional: Postgres/Redis locais
precisaram ser reiniciados de novo no meio desta onda (mesmo padrão de instabilidade de container já
observado na onda 35), sem impacto no resultado.
