# Onda 22 — Item 1/15: rota/UI para criar CadenceSequence e iniciar CadenceRun

## Identificação
- Origem: pendência levantada no `docs/CADENCE-CYCLE-AUDIT.md` (Sprint 06) e confirmada na
  auditoria da onda-19/onda-20 — o runtime de cadência (`cadenceRun.worker.ts`, construído na
  onda 19) nunca teria efeito prático em produção, porque não existia **nenhuma forma** de criar
  uma `CadenceSequence` ou iniciar uma `CadenceRun` fora de teste/seed manual no banco.
- Contexto: usuário pediu para resolver todas as ~15 pendências documentadas das Sprints 06/07,
  uma PR por item. Este é o item 1, pré-requisito de fato para vários dos itens seguintes (CYC-002,
  CYC-009 etc. dependem de haver uma forma real de iniciar um run).
- SHA de entrada: `main` pós-merge do PR da onda-21 (fix `followUp.worker.ts`)
- Branch: `claude/cyc-cadence-start`
- Status: **RESOLVIDO**

## O que foi construído

### Backend (`src/features/cadence/cadence.routes.ts`)
- `GET /api/cadence/sequences` — lista sequências ativas (`active: true`, `deletedAt: null`) da
  organização do usuário autenticado.
- `POST /api/cadence/sequences` (papéis ADMIN/GESTOR/CLOSER/SDR) — cria uma `CadenceSequence`.
  Valida a estrutura dos toques com a mesma função de domínio que o worker exige antes de rodar
  (`validateSequence`), rejeitando ordem de toque com lacuna/duplicata antes de gravar no banco —
  nunca deixa uma sequência inválida entrar.
- `POST /api/cadence/runs` (mesmos papéis) — inicia uma `CadenceRun` real para um lead:
  1. confirma que o lead existe na organização do usuário (404 caso contrário — cobre isolamento
     de tenant, já que a busca é por `{id, organizationId}`);
  2. confirma que a sequência existe, está ativa e pertence à mesma organização (404);
  3. valida a sequência com `parseCadenceSequenceDefinition` (mesma função usada pelo worker,
     onda-19) — 422 se os dados estiverem malformados;
  4. constrói e persiste o run via `startCadenceRun`/`prismaCadenceRunRepository.save`;
  5. converte a violação real do índice único parcial `CadenceRun_leadId_active_unique`
     (Prisma `P2002`) em 409 — "lead já tem cadência ativa" é regra de negócio, não erro de banco.

### Frontend (`src/features/cadence/cadence.api.ts`, `src/features/cadence/components/CadenceHub.tsx`)
- Cliente HTTP: `cadenceApi.sequences()`, `cadenceApi.createSequence()`, `cadenceApi.startRun()`.
- `NewSequenceDialog` — formulário para nome + lista dinâmica de toques (canal, atraso em horas,
  conteúdo da mensagem), com validação client-side antes do submit.
- `StartRunDialog` — formulário para iniciar um run (ID do lead colado manualmente — não existe
  um widget de busca de lead reutilizável no repo hoje; fora de escopo deste item) + seleção de
  sequência ativa carregada da API.
- Dois botões no cabeçalho de `CadenceHub` abrem os diálogos; sucesso em qualquer um deles força
  o remount da seção de execuções (`runsKey`) para refletir o novo run sem F5.
- Nota honesta mantida na UI: pausar/retomar/parar um run ainda não existe (CYC-009, item
  separado desta lista).

## Correções durante a implementação
- **tsc**: variável `userId` desestruturada sem uso na rota `/runs` (só é usada em `/sequences`,
  onde vira `createdBy`) — removida da desestruturação.
- **Contrato de resposta**: `apiFetch` (`src/lib/api.ts`) desembrulha `{success, data}` para só
  `data.data` — um campo irmão como `sequenceName` fora de `data` seria descartado silenciosamente
  no frontend. Corrigido aninhando: `{ success: true, data: { ...run, sequenceName } }`.
- **Regressão de teste unitário**: `NewSequenceDialog` sempre montado (mesmo fechado) — o
  elemento `<dialog>` nativo usado por `Dialog.tsx` não desmonta filhos ao fechar, só troca estado
  CSS. O `<select>` de canal continha `<option>WhatsApp</option>`, colidindo com o badge real de
  opt-out "WhatsApp" já testado em `CadenceHub.test.tsx`. Corrigido na raiz — o corpo do diálogo
  só renderiza quando `isOpen` é verdadeiro — em vez de contornar no teste com um seletor mais
  específico.

## Gate final
- typecheck: `npx tsc --noEmit` — limpo, 0 erros
- lint: `npm run lint` — 0 erros, 80 warnings (mesmo nível pré-existente do branch base)
- unit: `npx vitest run -c vitest.unit.config.ts` — **169/169 arquivos, 1313/1313 testes**
- integration: `npx dotenv-cli -e .env.test -- npx vitest run -c vitest.integration.config.ts`
  (Postgres + Redis reais) — **35/35 arquivos, 153/153 testes** (novo arquivo
  `tests/integration/cadence-start.routes.test.ts`, 8 casos: criação válida/inválida de sequência,
  RBAC, início de run real, 404 lead inexistente, 409 run duplicado via constraint real, RLS
  cross-tenant, listagem escopada por organização)
- build: `npm run build` e `npm run build:worker` — ambos limpos
- e2e: não executado nesta rodada (mudança de UI contida a dois diálogos novos; cobertura E2E de
  fluxo completo de cadência é o escopo do item CYC-009, ainda pendente)

## Skips e flakes
0 — nenhum teste pulado ou instável observado nesta rodada.

## Decisão

**Resolvido.** O runtime de cadência construído na onda-19 agora tem um caminho real de entrada:
qualquer usuário com papel de vendas/gestão pode criar uma sequência e iniciar um run para um
lead pela própria UI, com validação de estrutura, isolamento de tenant (RLS) e proteção contra
cadência duplicada por lead — tudo provado contra Postgres real, não mockado. Este item era o
pré-requisito de fato para o restante da lista de pendências de CYC-*; os itens seguintes
(CYC-002, CYC-003, CYC-004, CYC-005, CYC-006, CYC-007, CYC-009) seguem em PRs separados, um por
item, conforme decisão do usuário.
