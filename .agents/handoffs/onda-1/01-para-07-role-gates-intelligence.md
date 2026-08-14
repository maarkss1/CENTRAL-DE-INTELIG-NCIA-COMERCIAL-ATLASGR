- De: Agente 01 (Plataforma, Segurança e Dados)
- Para: Agente 07 (IA, RAG, Agentes, Filas e Automações)
- Onda: 1
- Status: resolvido
- Prioridade: alto

## Problema

Achado mais grave da auditoria de autorização da Onda 1 (bloqueador prioritário #2 do AGENTS.md):
`PUT /api/intelligence/ai-settings` (`src/features/intelligence/routes/intelligence.routes.ts`)
não tinha `requireRole` nenhum, e o modelo `AiEngineSetting` (`ai-settings.service.ts`) não tem
coluna `organizationId` — é configuração global de provider/modelo/temperatura por ferramenta de
IA, compartilhada por TODOS os tenants. Qualquer usuário autenticado, de qualquer organização, de
qualquer papel (inclusive `VISUALIZADOR`), podia sobrescrever a configuração de IA usada pela
plataforma inteira via essa rota — o efeito não fica restrito ao próprio tenant do atacante.

Corrigi adicionando `requireRole(['ADMIN'])` só nesse `PUT` (o `GET` continua aberto a qualquer
autenticado, é só leitura). Também adicionei testes cobrindo especificamente esse gate:
`tests/unit/features/intelligence/routes/intelligence.routes.test.ts` (ADMIN grava, GESTOR/
VENDEDOR/VISUALIZADOR recebem 403, sem sessão recebe 401, GET continua liberado).

Além disso, apliquei `requireRole(['ADMIN', 'GESTOR', 'VENDEDOR'])` (exclui só VISUALIZADOR) em
`agent.routes.ts` `POST /swarm/mission` e `POST /swarm/stream` (executam ações reais de agente), e
`requireRole(['ADMIN', 'GESTOR'])` em `prompt.routes.ts` `POST /` e `PUT /:id` (edição de prompt
override, tratado como configuração). Também toquei `knowledge.routes.ts` e `notes/routes/note.routes.ts`
(fora do domínio de IA per se, mas adjacentes) — ver handoff equivalente se você também for dono
dessas pastas; se não for, ignore essa parte.

## Arquivo(s) envolvido(s)
- `src/features/intelligence/routes/intelligence.routes.ts` — `PUT /ai-settings` → ADMIN (config
  global, sem tenant).
- `src/features/intelligence/routes/agent.routes.ts` — `POST /swarm/mission`, `POST /swarm/stream` → VENDEDOR+.
- `src/features/intelligence/routes/prompt.routes.ts` — `POST /`, `PUT /:id` → GESTOR+.
- `src/features/knowledge/knowledge.routes.ts` — `POST /`, `POST /upload`, `PUT /:id`, `POST
  /:id/reembed` → VENDEDOR+; `DELETE /:id` → GESTOR+.
- `src/features/notes/routes/note.routes.ts` — `POST /` → VENDEDOR+; `DELETE /:noteId` → GESTOR+.

## Alteração necessária
Nenhuma ação obrigatória — a correção do `ai-settings` já está completa e testada. Vale considerar,
como melhoria futura (não bloqueador), se `AiEngineSetting` deveria ganhar um override por tenant
em vez de ser puramente global — mas isso é decisão de produto/arquitetura, não algo que eu deveria
decidir sozinho no meu escopo de segurança.

## Teste esperado
Já entregue para `ai-settings` (6 casos). Os demais arquivos (`agent.routes.ts`, `prompt.routes.ts`,
`knowledge.routes.ts`, `note.routes.ts`) não ganharam teste de matriz de acesso dedicado nesta
rodada — considerar ao tocar neles na Onda 2.

## Contexto adicional
`ai-settings.service.ts` usa `prisma.aiEngineSetting` sem filtro de tenant nenhum — isso é
proposital dado o schema atual (não é um bug de "esqueceram o filtro"), mas fica registrado aqui
porque é fácil de reintroduzir a mesma falha de autorização se um dia esse modelo ganhar
`organizationId` e alguém remover o `requireRole(['ADMIN'])` achando que o filtro de tenant já
resolve.

## Resolução — Onda 2.5
O handoff estava documentalmente aberto apesar de o próprio conteúdo registrar a correção como
concluída e testada. A Onda 2.5 fecha o status para refletir o estado técnico já entregue. Nenhuma
regra de autorização foi relaxada e nenhuma alteração funcional adicional foi necessária neste
fechamento documental.
