# Onda 29 — CYC-009: UI de cadência com ações de escrita + E2E

## Contexto

Item 9/9 (e último) do bloco CYC-001..CYC-009 da rodada "resolver todas as pendências"
(`docs/CADENCE-CYCLE-AUDIT.md`, Sprint 06). Segue diretamente o merge de CYC-006 (PR #200).

**Estado de entrada (auditoria)**: o domínio de cadência já tinha `pauseCadenceRun`,
`resumeCadenceRun` e `stopCadenceManually` prontos e testados desde ondas anteriores
(`src/features/cadence/domain/cadence.ts`) — idempotentes por construção, nunca lançam em cima de
uma transição inválida, só devolvem o run sem alteração. O gap não era de domínio, era de
exposição: nenhuma rota chamava essas três funções, e a tela `CadenceHub.tsx` só listava execuções
e permitia criar sequência/iniciar run — sem pausar, retomar ou parar pela UI. A nota "Em breve
nesta tela" do componente também estava desatualizada, afirmando que CYC-003/004/005/006 "ainda
não têm API própria" (falso desde as ondas 27/28) e que pause/resume/stop "ainda não existe" (o
gap que este item fecha).

## O que foi construído

- **`POST /api/cadence/runs/:id/pause`, `/resume`, `/stop`** (`cadence.routes.ts`, mesmo padrão
  direto-no-router já usado por `/runs`/`/sequences` neste arquivo, diferente do padrão DI usado em
  `crm360.routes.ts`) — cada rota carrega o run pelo par `(organizationId, id)` via
  `prismaCadenceRunRepository.findById` (RLS real, 404 se não pertence à organização autenticada),
  aplica a função de domínio já existente, persiste e devolve o run atualizado. `writeRoles`
  reaproveitado das rotas vizinhas (bloqueia `VISUALIZADOR`).
- **`cadence.api.ts`** — `pauseRun`/`resumeRun`/`stopRun`, mesmo padrão de `startRun`.
- **`CadenceHub.tsx`** — novo componente `CadenceRunActions`: Pausar+Parar quando `status ===
  'active'`, Retomar+Parar quando `'paused'`, nada em estado terminal. Parar exige confirmação via
  `window.confirm` (mesmo padrão de exclusão de lead em `LeadDetailDrawer.tsx`) porque é
  irreversível — `stopCadenceManually` não tem retomada, diferente de pausar. Nova coluna "Ações" na
  tabela. Nota "Em breve nesta tela" corrigida para refletir o estado real (CYC-003/004/005/006 têm
  API própria; pause/resume/stop existe).

## Fora de escopo (documentado, não corrigido)

- Nenhum item novo de escopo aberto — este era o último item pendente do bloco CYC-001..CYC-009.

## Gate

- `npx tsc --noEmit` — limpo
- `npm run lint` — 0 erros, 89 warnings (baseline herdado, nenhum novo)
- unit: `npx vitest run -c vitest.unit.config.ts` — **187/187 arquivos, 1457/1457 testes**
- integration (Postgres+Redis reais): `npx vitest run -c vitest.integration.config.ts` —
  **41/41 arquivos, 204/204 testes**, incluindo os 7 casos novos em
  `tests/integration/cadence-start.routes.test.ts` (pausar muda status; retomar muda status; parar
  grava motivo de parada manual e bloqueia retomada; retomar sobre run não-pausado é idempotente;
  404 run inexistente; 404 cross-org via RLS; 403 papel `VISUALIZADOR`)
- e2e (`tests/e2e/cadence.spec.ts`, novo): fluxo completo criar sequência → iniciar cadência para um
  lead real → pausar → retomar → parar com confirmação → alternar filtro "Encerrada" para ver o run
  terminal; segundo teste cobre cancelar a confirmação de "Parar" mantendo a cadência ativa. Ambos
  passando localmente.
- a11y (`tests/e2e/accessibility.spec.ts`) — nova varredura axe-core em `/app/cadence`, sem
  violações `critical`/`serious`. Tela nunca tinha sido coberta por este arquivo até esta rodada.
- `npm run build` e `npm run build:worker` — ambos limpos

## Correção durante a implementação

Nenhuma no código de produção. Quatro rodadas de ajuste no próprio E2E novo, sem alterar
comportamento real da tela:
1. Path do executável do Chromium do sandbox não batia com o esperado pelo `@playwright/test`
   instalado — resolvido com a variável `PLAYWRIGHT_CHROMIUM_EXECUTABLE` já documentada em
   `playwright.config.ts`.
2. `getByRole('button', { name: 'Iniciar' })` colidia com "Iniciar cadência" — precisava de
   `{ exact: true }`.
3. `getByText('Ativa')` colidia como substring dentro de "Sem tentativa ainda" — precisava de
   `{ exact: true }` em todas as asserções de texto de status.
4. Comportamento real (não bug): um run recém-parado sumia da tabela porque o filtro padrão da tela
   só mostra `active`+`paused` — corrigido o teste (clicar no filtro "Encerrada"), não o componente.

## Skips e flakes

0 — nenhum teste pulado ou instável observado nesta rodada.

## Encerramento do bloco CYC-001..CYC-009

Esta é a última entrega pendente do bloco de cadência desta rodada. Com o merge deste item, a
sequência de "resolver todas as pendências" segue para o bloco AI (AI-011, AI-003, AI-002 (parte
2), AI-007 (parte 2), AI-010, AI-005, AI-006) — ver `docs/AI-SWARM-GOVERNANCE-AUDIT.md`.
