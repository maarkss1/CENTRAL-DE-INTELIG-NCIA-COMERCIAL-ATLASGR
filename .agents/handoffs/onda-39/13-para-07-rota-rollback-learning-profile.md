- De: 13
- Para: 07
- Onda: 39
- Status: resolvido
- Prioridade: normal

## Problema

Nesta onda, `src/features/intelligence/agents/learning.agent.ts` ganhou versionamento real do
perfil "aprendido" pelo `LearningAgent`: `getLearningProfileHistory(tenantId)` e
`rollbackLearningProfile(tenantId, actorId, targetVersion)` — cobertos por
`src/features/intelligence/agents/__tests__/learning.agent.versioning.test.ts`. As funções existem,
são testadas e exportadas, mas não há nenhuma rota HTTP que as exponha — hoje só
`POST /agent/swarm/learn` está montado em `src/features/intelligence/routes/agent.routes.ts`.

Sem rota, um operador não tem como consultar o histórico de versões nem reverter uma reflexão ruim
do `LearningAgent` fora de um script manual — o mecanismo de rollback existe no código mas é
inacessível na prática.

## Arquivo(s) envolvido(s)

- `src/features/intelligence/routes/agent.routes.ts` (dono: Agente 07)
- `docs/openapi.yaml` (documentar a(s) rota(s) nova(s) — evitar novo achado de deriva de contrato)
- `src/features/intelligence/agents/learning.agent.ts` (funções já prontas, só consumir)

## Alteração necessária

Adicionar duas rotas (papel mínimo sugerido: `ADMIN`/`GESTOR`, mesmo padrão de aprovação de ação de
IA já usado em `intelligence.routes.ts`):
- `GET /agent/swarm/learn/history` → `getLearningProfileHistory(tenantId)`
- `POST /agent/swarm/learn/rollback` (`{ targetVersion }`) → `rollbackLearningProfile(tenantId, actorId, targetVersion)`

Documentar ambas em `docs/openapi.yaml` para não reabrir deriva estrutural
(`npm run verify:openapi-drift`).

## Teste esperado

Rota de histórico retorna as versões na ordem esperada; rota de rollback move o ponteiro ativo sem
apagar histórico e falha (sem persistir nada) para uma versão inexistente — mesmos casos já cobertos
a nível de função em `learning.agent.versioning.test.ts`, agora exercitados via HTTP/RBAC.

## Contexto adicional

Não é meu arquivo (Agente 13 só edita `src/features/intelligence/agents/**` e serviços de runtime,
não rotas) — `agent.routes.ts`/contratos de API são do Agente 07/18 por `/AGENTS.md`.
