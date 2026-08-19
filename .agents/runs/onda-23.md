# Onda 23 — Item 2/15: CYC-002, completar a máquina de estados da cadência

## Identificação
- Origem: `docs/CADENCE-CYCLE-AUDIT.md`, seção CYC-002 — "3 dos 5 estados do roadmap
  implementados" (`SPRINT-06-CADENCIA-CICLO-RECEITA.md` pede `active/paused/stopped/completed/
  failed` + 5 motivos de parada incluindo `policy/guardrail`; o domínio só tinha 3 estados/4
  motivos, com `completed` disfarçado de `stopReason` em vez de estado próprio).
- SHA de entrada: `main` pós-merge do PR da onda-22 (item 1, rota/UI de criar sequência/iniciar run)
- Branch: `claude/cyc-cadence-start` (continuação da mesma branch de trabalho desta rodada)
- Status: **RESOLVIDO**

## O que foi construído

### Domínio (`src/features/cadence/domain/cadence.ts`)
- `CadenceRunStatus`: `active | paused | stopped | completed | failed` (era `active | paused |
  stopped`). `completed` agora é estado próprio — fim natural da sequência — em vez de
  `stopped` com `stopReason: 'completed'`.
- `CadenceStopReason`: adicionado `policy-guardrail` (era `opt-out | lead-reply | completed |
  manual-stop`).
- `CadenceTouchAttempt.attemptNumber`: campo novo, 1-based, conta tentativas por `touchOrder`
  (não globalmente) — antes só reconstituível contando linhas.
- `applyPolicyGuardrailFailure(run, now)`: único caminho para `status: 'failed'` — falha
  estrutural do próprio run, não uma decisão humana nem sinal do lead.
- `applyStopDecision(run, reason, now)`: ponto único que decide `completed` vs `stopped` a partir
  de um motivo — usado tanto por `recordTouchAttempt` (via `stop()` interno) quanto por
  `cadenceService.ts`, para as duas camadas nunca divergirem nessa regra.
- `sanitizeTouchError(rawError)`: redige e-mail/CPF (só formato pontuado, para não colidir com
  telefone de 11 dígitos)/telefone/credencial (`Bearer <token>` etc.) antes de persistir, e trunca
  em 500 caracteres — antes só existia como convenção em comentário, sem código.
- `isTerminalStatus`/`terminalStatusForStopReason`: helpers internos — `stopped`/`completed`/
  `failed` são todos terminais e idempotentes (nenhuma função `apply*` sobrescreve um motivo já
  gravado).

### Runtime (`src/features/cadence/jobs/cadenceRun.worker.ts`)
- Bug real corrigido: quando a `CadenceSequence` de um run ativo ficava malformada/inacessível
  (`parseCadenceSequenceDefinition` devolve `null`), o worker antes só incrementava
  `skippedInvalidSequence` e seguia — o run ficava `Active` para sempre, re-tentado (e re-pulado)
  silenciosamente a cada tick de 5 minutos, indefinidamente.
- Agora: esse run é encerrado como `failed`/`policy-guardrail` via `applyPolicyGuardrailFailure` +
  `prismaCadenceRunRepository.save`, escopado pelo tenant real (nunca bypass). Contador renomeado
  de `skippedInvalidSequence` para `failedInvalidSequence` para refletir o novo comportamento.

### Persistência
- Migration `20260819120000_cadence_state_machine_completion` (`Completed`/`Failed` no enum
  `CadenceRunStatus`, `PolicyGuardrail` no enum `CadenceStopReason`, coluna
  `CadenceTouchAttempt.attemptNumber`) — escrita à mão (não via `prisma migrate dev`) pela mesma
  limitação de shadow database já documentada na Onda 5 (`.agents/runs/onda-5.md`: usuário do
  Postgres de teste sem permissão de `CREATE DATABASE`). Aplicada via `prisma migrate deploy` e
  validada contra Postgres real.
- `PrismaCadenceRunRepository.ts`: mapas `STATUS_TO_DB`/`STATUS_FROM_DB`/`STOP_REASON_TO_DB`/
  `STOP_REASON_FROM_DB` estendidos para os novos valores; `attemptNumber` mapeado em `toDomainAttempt`
  e no `createMany` de `save()`.

### API e frontend
- `cadence.routes.ts`: `STATUS_QUERY_TO_DOMAIN` aceita `Completed`/`Failed` na query
  `?status=...`; mensagem de erro de validação atualizada.
- `cadence.api.ts`: `CadenceRunStatus`/`CadenceStopReason` (frontend) espelham os novos valores;
  `CadenceTouchAttemptDTO.attemptNumber` adicionado.
- `CadenceHub.tsx`: `STATUS_LABEL`/`STOP_REASON_LABEL`/`STATUS_FILTERS`/badges cobrem os 5 estados
  e 5 motivos; tabela de histórico de tentativas ganhou coluna "Tentativa" (`attemptNumber`).

## Correções durante a implementação
- **Regex de CPF colidia com telefone**: a primeira versão de `sanitizeTouchError` usava pontuação
  opcional no padrão de CPF (`\d{3}\.?\d{3}\.?\d{3}-?\d{2}`), que também bate com qualquer telefone
  BR de 11 dígitos sem formatação (mesma contagem de dígitos). Corrigido exigindo a pontuação
  completa para CPF (`\d{3}\.\d{3}\.\d{3}-\d{2}`) — um número de 11 dígitos sem pontuação neste
  contexto (erro de dispatcher de canal) é quase sempre telefone, não CPF. Pego pelo próprio teste
  novo antes de qualquer coisa chegar a rodar contra Postgres.
- **Teste de domínio duplicado**: cheguei a escrever um arquivo novo
  (`tests/unit/features/cadence/domain/cadence.test.ts`) antes de descobrir que já existe cobertura
  real do domínio em `src/features/cadence/__tests__/cadence.test.ts` (incluído no unit config via
  `src/**/__tests__/**/*.test.ts`, rodando desde sempre como parte da suíte "169 arquivos" — eu só
  não tinha grepado esse caminho nas rodadas anteriores). Removido o arquivo duplicado; a cobertura
  nova (attemptNumber, sanitização, `applyPolicyGuardrailFailure`, `applyStopDecision`, estados
  terminais) foi incorporada ao arquivo existente em vez de duplicá-lo.
- Dois testes pré-existentes em `src/features/cadence/__tests__/cadence.test.ts` assumiam
  `status === 'stopped'` após conclusão natural da sequência — atualizados para `'completed'`
  (comportamento mudou de propósito nesta rodada, não regressão).

## Gate final
- typecheck: `npx tsc --noEmit` — limpo, 0 erros
- lint: `npm run lint` — 0 erros, 80 warnings (mesmo nível pré-existente do branch base)
- unit: `npx vitest run -c vitest.unit.config.ts` — **169/169 arquivos, 1320/1320 testes** (era
  1313 — +7 testes líquidos: cobertura nova em `cadence.test.ts` menos a remoção do arquivo
  duplicado)
- integration: `npx dotenv-cli -e .env.test -- npx vitest run -c vitest.integration.config.ts`
  (Postgres + Redis reais) — **35/35 arquivos, 153/153 testes**, incluindo o novo caso em
  `cadenceRun.worker.test.ts` que prova o bug do "run preso para sempre" corrigido: sequência
  malformada → run vira `Failed`/`PolicyGuardrail` no primeiro tick, e um segundo tick não o
  reprocessa (não está mais em `Active`)
- build: `npm run build` e `npm run build:worker` — ambos limpos
- e2e: não executado (mudança de domínio/backend + rótulos de badge existentes; sem fluxo novo de
  UI que justifique E2E dedicado nesta rodada — cobertura E2E completa de cadência é escopo do
  item CYC-009, ainda pendente)

## Skips e flakes
0 — nenhum teste pulado ou instável observado nesta rodada.

## Decisão

**Resolvido.** Os 5 estados e 5 motivos de parada do roadmap (`SPRINT-06-CADENCIA-CICLO-RECEITA.md`)
agora existem de ponta a ponta — domínio, migration, repositório, rota e UI — com um gatilho real
(não especulativo) para o novo estado `failed`: a correção de um bug genuíno onde um run com
sequência corrompida ficava preso em `Active` para sempre. `attemptNumber` e sanitização de erro
por toque, também exigidos pelo roadmap para este item, foram implementados e testados. Gaps que
ficam fora do escopo dos "5 estados/5 motivos" (ex.: `result` do touch não distinguir entrega/
leitura de aceite pelo provedor) foram documentados em `docs/CADENCE-CYCLE-AUDIT.md`, não
resolvidos silenciosamente nem inflados como parte deste item. Próximo item da lista: CYC-007
(conectar `dealClosure.ts` ao fechamento manual).
