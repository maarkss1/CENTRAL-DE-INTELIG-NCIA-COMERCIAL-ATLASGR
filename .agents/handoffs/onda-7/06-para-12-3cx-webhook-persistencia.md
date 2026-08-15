- De: Agente 06 (Integrações e Bitrix)
- Para: Agente 12 (Voz e Telefonia — dono de `threecx/**` a partir da Onda 7)
- Onda: 7
- Status: aberto
- Prioridade: normal (não é um dos bloqueadores desta onda; item de dívida técnica conhecido desde
  a Onda 1, só nunca resolvido porque `threecx/**` era meu até a Onda 6)

## Problema

`process3CXWebhook` (`src/features/integrations/threecx/threecx.service.ts`, linha ~266) só loga
o payload recebido do webhook do 3CX e devolve `{ status: 'processed' }` — nunca persiste o evento
em nenhuma tabela, nunca o associa a uma `organizationId`/tenant, nunca o correlaciona a um Lead.
Já era assim antes da minha revisão desta rodada (ver `.agents/handoffs/onda-1/06-para-01-persistencia-3cx.md`
e a confirmação em `.agents/handoffs/onda-5/01-para-06-persistencia-3cx-implementada.md`, que
também apontou o mesmo ponto sem resolvê-lo).

Isto é o mesmo tipo de risco já mapeado para o Bitrix no bloqueador #11 de `/AGENTS.md`
("sincronizações que podem falhar silenciosamente") — só que aqui não é uma falha, é ausência
completa de rastro: um evento de chamada real do 3CX (atendida, perdida, transferida) chega,
processa com sucesso HTTP e desaparece, sem nenhum jeito de auditar depois "o que o 3CX nos
avisou" nem de fechar o loop com a Activity criada por `make3CXCall` (que hoje só registra o
disparo da chamada, nunca o resultado real reportado pelo próprio PABX).

## Arquivo(s) envolvido(s)
- `src/features/integrations/threecx/threecx.service.ts` — `process3CXWebhook`.
- `src/features/integrations/threecx/threecx.routes.ts` — rota que recebe o webhook (confirme
  autenticação/validação de payload já existente antes de mexer na persistência).
- Se precisar de tabela nova: `prisma/schema.prisma` não é seu nem meu — abra handoff para o
  Agente 01, seguindo o mesmo padrão já usado para `ThreeCXConnection`/`BitrixExtractionRun`.

## Alteração necessária
1. Definir o organizationId de origem do evento — hoje o payload do 3CX não chega com tenant
   conhecido nenhum; provavelmente precisa vir por `connectionId` na URL do webhook (mesmo padrão
   já usado pelo webhook de entrada do Bitrix, `bitrix.webhook.ts`: segredo por conexão na URL,
   `timingSafeEqual` na comparação, nunca confiar em campo do payload para decidir o tenant).
2. Persistir o evento (tabela nova ou reaproveitar `Activity` existente, a decidir com o 01) com,
   no mínimo: tipo de evento, número/ramal envolvido, timestamp, resultado (atendida/perdida/
   ocupado/etc.), correlationId, e — quando possível — vínculo com o Lead cujo `make3CXCall`
   originou a chamada (ou um lead resolvido por número de telefone).
3. RLS por tenant no mesmo padrão do resto do app (`requestContext.run({ tenantId })`), nunca
   bypass geral.
4. Nunca persistir segredo/credencial do payload do webhook.

## Teste esperado
- Evento de webhook 3CX persiste corretamente escopado à organização certa.
- Evento sem tenant identificável é rejeitado/ignorado com log claro, não silenciosamente aceito.
- Isolamento entre organizações (cross-tenant negado).
- Evento correlacionado a um Lead quando o número bate com uma chamada disparada por `make3CXCall`.

## Contexto adicional
Não fiz nenhuma alteração em `threecx/**` nesta rodada — arquivo fora da minha propriedade nesta
onda (ver matriz em `.agents/runs/onda-7.md`). Revisão completa do handoff original em
`.agents/handoffs/onda-5/01-para-06-persistencia-3cx-implementada.md` (marcado `resolvido` agora,
com a seção "## Resolução" explicando este redirecionamento).
