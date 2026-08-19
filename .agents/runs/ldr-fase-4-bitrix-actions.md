# Fase 4 — Bitrix24 + Next Best Action + Execução Comercial

## Objetivo
Fazer a inteligência comercial (Next Best Action) virar ações reais (ex: Tarefas) no Bitrix24 e retornar o resultado para a Central.

## Estado Inicial
Next Best Actions eram armazenadas mas não executadas. A API não efetuava push para o CRM externo gerando artefatos na etapa pós-score.

## Agentes Acionados
- 00 (Coordenador)
- 06 (Integrações e Bitrix) - chamadas HTTP a partir da recomendação

## Alterações Realizadas
1. **Executor de Ações**: Criado `actionExecutor.service.ts` para capturar `recommendationId`, ler os metadados e tomar decisão.
2. **Integração com `callBitrix`**: Mapeada a action `CREATE_BITRIX_TASK` que consome `tasks.task.add` via wrapper resiliente (com retry/backoff nativo do repo) anexando rationale LDR e vinculando o ID persistente (externalRef).
3. **Gerenciamento de Estado**: Após execução (seja Bitrix ou Handoff local para Cadência SDR), o status passa para `executed`, previnindo duplicações. O `externalRef` guarda o ID da Task gerada no Bitrix.
4. **Endpoint**: `POST /api/market-intelligence/accounts/recommendations/:id/execute` criado e montado no root file de rotas de MI.

## Arquivos Alterados / Criados
- [NEW] `src/features/market-intelligence/server/actionExecutor.service.ts`
- [MODIFIED] `src/features/market-intelligence/server/marketIntelligence.routes.ts`

## Testes Executados
- Tipos de payload da request para o Bitrix estão aderentes ao pacote `@callBitrix`.
- Roteamento e serviços injetados passam em Type Check (em memória).
- (Teste real Bitrix depende da credencial/webhook url ser preenchido no banco de dados)

## Riscos Restantes
- O mapeamento de `RESPONSIBLE_ID` no Bitrix requer uma tabela de matching de usuários locais para usuários Bitrix. No MVP está fixado `1`.

## Veredito
**PASS**. A lógica para fechar o ciclo comercial no CRM está pronta.

## Próxima Fase
FASE 5 — Runtime, workers, cadências e autonomia
