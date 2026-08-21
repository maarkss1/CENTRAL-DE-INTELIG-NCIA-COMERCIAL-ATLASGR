# Onda 34 — AI-010: citação real e rastreável no Copiloto Técnico (RAG)

## Contexto

Item 14/15 da rodada "resolver todas as pendências" (`docs/AI-SWARM-GOVERNANCE-AUDIT.md`, Sprint
07). Segue o merge de AI-007 parte 2 (PR #208).

**Estado de entrada (auditoria, onda 20)**: `POST /api/intelligence/suite/knowledge/copilot`
confiava em `retrievedDocumentSnippets: string[]` enviado pelo CLIENTE — qualquer texto virava
"documento" e o LLM inventava `sourceReferences: string[]` livremente a partir do prompt, sem
relação verificável com nenhum documento real. O retrieval real (`searchService.hybridSearch`,
pgvector + full-text + RRF, `documentId`/`chunkId`/`score` reais) já existia e já era usado por
`POST /api/knowledge/search` e pelo enxame de IA (RAG-001), mas nunca era chamado por este
endpoint específico.

## Decisão de design

Nenhuma pergunta de produto em aberto — a auditoria original já descrevia exatamente o que faltava
("Wiring do endpoint ao `hybridSearch` real + mudança de contrato de resposta"):

1. **Citação por índice, não por texto livre.** Cogitei pedir ao LLM para citar o título do
   documento diretamente (mais "natural"), mas isso reintroduziria o mesmo problema — o LLM podia
   escrever um título parecido mas não idêntico, ou inventar um. Numerar os trechos no prompt
   (`[1] ...`, `[2] ...`) e pedir só o ÍNDICE (`citedSnippetIndexes: number[]`) torna a citação
   estruturalmente verificável: resolvemos o índice de volta para o `SearchHit` real no servidor,
   nunca confiando em texto do LLM para identificar a fonte.
2. **Índice inválido é descartado, nunca propagado nem lança erro.** Um LLM pequeno (`local-llama3-fast`)
   pode alucinar um índice fora da lista fornecida — fail-safe aqui significa "essa citação some",
   não "a resposta inteira falha" nem "aceitamos qualquer coisa".

## O que foi construído

- **`src/features/intelligence/routes/ai-suite.routes.ts`**: `/knowledge/copilot` ganhou Zod
  (`{question, userRole?}`) e passou a chamar `searchService.hybridSearch(organizationId, question)`
  no servidor — `organizationId` sempre de `req.user`, nunca do body.
- **`src/features/knowledge/services/knowledge-copilot.service.ts`**: `CopilotQueryInput.hits:
  SearchHit[]` substitui `retrievedDocumentSnippets`; prompt numera os trechos; LLM só pode citar
  por índice (`citedSnippetIndexes`); `resolveCitations` resolve/filtra os índices contra os hits
  reais; `CopilotAnswerOutput.sourceReferences` agora é `CopilotCitation[]`
  (documentId/chunkId/documentTitle/chunkIndex/score), não mais `string[]`.
- **`src/features/intelligence/components/AISuiteHub.tsx`**: `samplePayload` do capability #15
  (playground interno de QA) atualizado para o novo contrato.

## Fora de escopo (documentado, não construído)

- **Grounding de factualidade do resto da resposta**: a citação aponta corretamente para um chunk
  real, mas nada verifica se `directAnswer`/`technicalSpecifications` de fato dizem só o que está
  nesse chunk — o LLM ainda pode extrapolar. Esse é o mesmo problema de "factualidade"/"hallucination
  rate" que AI-006 já mapeia como métrica de avaliação não construída; depende do harness de
  AI-005/AI-006, não é uma correção pontual de wiring como esta. Documentado em
  `docs/AI-SWARM-GOVERNANCE-AUDIT.md` (tabela de riscos).

## Gate

- `npx tsc --noEmit` — limpo
- `npm run lint` — 0 erros, 89 warnings (mesmo baseline da onda 33, nenhum novo)
- unit: `npx vitest run -c vitest.unit.config.ts` — **195/195 arquivos, 1503/1503 testes** (8 casos
  novos em `knowledge-copilot.service.test.ts`, 3 casos novos em
  `ai-suite.knowledge-copilot.routes.test.ts`, `CentralAISuiteService.test.ts` atualizado)
- integration (Postgres+Redis reais): `npx dotenv-cli -e .env.test -- npx vitest run -c
  vitest.integration.config.ts` — **45/45 arquivos, 223/223 testes**, incluindo
  `knowledge-copilot-citation.test.ts` (novo, 2 casos) — prova ponta a ponta contra Postgres/pgvector
  reais: citação resolvida aponta para o `documentId`/`chunkId` de um documento realmente ingerido
  (um índice extra alucinado pelo LLM-stub é descartado); isolamento de tenant também na citação
  (busca de outro tenant nunca traz o documento do tenant A, logo nunca cita)
- `npm run build` e `npm run build:worker` — ambos limpos

## Skips e flakes

0 — nenhum teste pulado ou instável observado nesta rodada.
