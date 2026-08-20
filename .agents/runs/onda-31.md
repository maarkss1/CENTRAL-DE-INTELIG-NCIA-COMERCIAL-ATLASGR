# Onda 31 — AI-003: persistência honesta de AgentMemory

## Contexto

Item 11/15 da rodada "resolver todas as pendências" (`docs/AI-SWARM-GOVERNANCE-AUDIT.md`, Sprint
07). Segue diretamente o merge de AI-011 (PR #205).

**Estado de entrada (auditoria, onda 20)**: 5 caminhos de escrita em `AgentMemory`
(`BaseAgent.updateMemory`, `SDRQualificationAgent.updateMemory`, `OpsAgent.updateMemory`,
`LearningAgent.persistProfile`, `AgentService.saveMemory`), todos fazendo `findFirst` por
`sessionId`+`organizationId` (sem `agentType`) seguido de `create`/`update` condicional — não
atômico, com uma janela de corrida real. 4 dos 5 engoliam qualquer erro (try/catch-log-e-segue,
reportando sucesso mesmo quando a memória nunca foi persistida); o quinto sempre criava uma linha
nova por turno (crescimento ilimitado, já que só a mais recente era lida de volta). Sem nenhuma
unique constraint. `GET /agents/sdr/status/:sessionId` (único consumidor real do progresso de uma
qualificação assíncrona) tinha um contrato binário — linha presente/ausente — então qualquer falha
anterior à persistência deixava a sessão presa em "pending" para sempre, indistinguível de "ainda
rodando".

## Decisão de produto

Nenhuma decisão de produto nova em aberto — diferente de AI-011, este item já tinha a correção
mapeada com precisão pela própria auditoria ("migration com unique constraint + redesenho do
contrato de status da rota de polling"). Uma decisão de design ficou por minha conta durante a
implementação: linhas legadas com `organizationId` nulo ficam fora da proteção da nova unique
constraint (NULL nunca colide com outro NULL num índice único do Postgres, e o Prisma nem aceita
`null` na chave composta tipada) — aceitável porque nenhum caminho de escrita vivo hoje gera uma
linha nova sem tenant resolvido.

## O que foi construído

- **Migration `20260820100000_agent_memory_status_and_unique`** (escrita à mão — mesma limitação
  de shadow database das ondas anteriores, aplicada e validada contra Postgres real neste
  ambiente): colapsa duplicatas existentes (por `organizationId` não nulo), adiciona `status`
  (`AgentMemoryStatus`: `Completed`/`Failed`), `errorMessage` (truncado em 500 caracteres) e
  `updatedAt`, cria a unique constraint `(sessionId, agentType, organizationId)`.
- **`src/features/intelligence/agents/agentMemory.store.ts`** (novo) — ponto único de
  escrita/leitura, substituindo a lógica duplicada nos 5 arquivos. `saveAgentMemory()` faz `upsert`
  atômico quando `organizationId` está presente (sempre, em operação normal) — uma única query
  `INSERT ... ON CONFLICT DO UPDATE` no Postgres, sem a janela de corrida do padrão anterior — e
  cai para o padrão antigo (findFirst+create/update) só no caso residual sem tenant. Nunca engole
  erro: quem chama decide.
- **`recordAgentFailure()`** (novo, no mesmo módulo) — grava `status:'Failed'`+motivo (sanitizado a
  500 chars) nos pontos onde `SDRQualificationAgent`/`OpsAgent` antes retornavam
  `{success:false,error}` sem persistir nada: bloqueio de consentimento LGPD e erro no grafo
  LangGraph. Best-effort de propósito (engole a própria falha) — já roda dentro do catch de uma
  falha que o chamador vai reportar de qualquer forma.
- **`GET /agents/sdr/status/:sessionId`** — 3 estados agora: `pending` (sem registro), `completed`
  (`messages`), `failed` (`error`). `docs/openapi.yaml` corrigido para o formato real (não seguia
  `DataEnvelope`, nunca devolvia `404` como o contrato antigo documentava).
- **`AgentService.saveMemory`** (SDR Outbound via worker BullMQ) — de "sempre cria linha nova" para
  o mesmo upsert-em-lugar, fechando o crescimento ilimitado de linhas por sessão sem mudar nenhum
  comportamento observável (`loadMemory()` já só lia a mais recente).
- Onde uma escrita de sucesso agora falha (ex.: Postgres indisponível no exato momento de
  persistir), `SDRQualificationAgent`/`OpsAgent` reportam `{success:false, error:'...falha ao
  persistir o resultado.'}` em vez de `{success:true}` — nunca mais reportar sucesso com a memória
  perdida.

## Fora de escopo (documentado, não corrigido)

- Orçamento/memória por tenant não é afetado por este item.
- Linhas legadas com `organizationId` nulo continuam fora da proteção da unique constraint —
  documentado como aceitável, nenhum caminho de escrita vivo hoje gera uma linha nova sem tenant.

## Gate

- `npx tsc --noEmit` — limpo
- `npm run lint` — 0 erros, 89 warnings (baseline herdado, nenhum novo)
- unit: `npx vitest run -c vitest.unit.config.ts` — **191/191 arquivos, 1483/1483 testes**
  (12 casos novos em `agentMemory.store.test.ts`, mock de `ops.agent.consent.test.ts` atualizado
  para incluir `upsert`)
- integration (Postgres+Redis reais): `npx vitest run -c vitest.integration.config.ts` —
  **43/43 arquivos, 218/218 testes**, incluindo os 9 casos novos de
  `tests/integration/agent-memory.test.ts`: 10 escritas concorrentes para a mesma sessão nunca
  duplicam a linha (a prova real da correção da corrida), upsert sobrescreve estado anterior
  (failed→completed), truncamento de erro, `recordAgentFailure` nunca lança mesmo com FK
  inexistente, os 3 estados da rota de status ponta a ponta via supertest, RLS cross-organização
  (sessão de outra org continua `pending` do ponto de vista de quem consulta)
- `npm run build` e `npm run build:worker` — ambos limpos
- `prisma migrate diff` (contra o banco totalmente migrado) confirmado sem diferença para
  `AgentMemory` especificamente — os únicos itens remanescentes no diff (renomeações de índice/FK
  em `MarketIntelligenceCompany`/`AccountScore`/etc.) são drift de truncamento de identificador do
  Postgres pré-existente, não gated por nenhum workflow de CI, não relacionado a esta mudança

## Correção durante a implementação

Duas idas e voltas antes do gate fechar:
1. Primeira versão da migration usava `DEFAULT CURRENT_TIMESTAMP` para `updatedAt` e não removia o
   índice antigo `AgentMemory_sessionId_idx` (redundante — o índice único novo já cobre buscas só
   por `sessionId` como prefixo). `prisma migrate diff` contra o banco recém-migrado apontou as
   duas divergências; corrigido no arquivo da migration e reaplicado do zero (banco de teste
   recriado) antes de escrever qualquer código de aplicação.
2. O tipo gerado pelo Prisma para a chave composta (`sessionId_agentType_organizationId`) exige
   `organizationId: string`, não aceita `null`, mesmo o campo sendo nullable no schema — descoberto
   por erro do `tsc`, não em runtime. Resolvido com o branch explícito (upsert quando presente,
   fallback findFirst+create/update quando ausente) descrito acima, em vez de forçar um cast que
   esconderia o problema real (NULL nunca colide num índice único do Postgres de qualquer forma).

## Skips e flakes

0 — nenhum teste pulado ou instável observado nesta rodada.
