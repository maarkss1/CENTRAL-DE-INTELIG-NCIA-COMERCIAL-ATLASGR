- De: 18
- Para: 15
- Onda: 8
- Status: aberto
- Prioridade: alto

## Problema
`src/lib/security/auditLog.middleware.ts` lê `req.user` via `(req as any)` em vez do tipo
`AuthRequest` já existente no projeto, escondendo do typecheck o contrato real de quem popula
`req.user`. Isso importa porque os dois campos lidos aqui (`actorId`/`tenantId`) alimentam
diretamente o log de auditoria — um registro relevante para LGPD — e o próprio arquivo já tem um
comentário explicando que `tenantId` nunca pode vir de um header controlado pelo cliente, só do
usuário autenticado. Um `as any` no meio disso é exatamente o tipo de "limite de contrato mascarado"
que a missão do Agente 18 (`.agents/prompts/18-contratos-api-docs.md`, item 3) existe para varrer.

## Arquivo(s) envolvido(s)
- `src/lib/security/auditLog.middleware.ts:6` — `const actorId = (req as any).user?.id || 'anonymous';`
- `src/lib/security/auditLog.middleware.ts:11` — `const tenantId = (req as any).user?.organizationId;`
- `src/shared/middlewares/authenticateToken.ts:17` — tipo `AuthRequest` já existente, já usado em
  outros pontos do projeto exatamente para este propósito (ex.: `src/lib/security/
  auditLog.middleware.ts` deveria seguir o mesmo padrão de `crm360.routes.ts`/`google.routes.ts`
  etc., que importam `AuthRequest` em vez de castar `any`).

## Alteração necessária
Trocar `(req as any).user` por `(req as AuthRequest).user` nas duas linhas, importando `AuthRequest`
de `../../shared/middlewares/authenticateToken.js` (ajuste o caminho relativo real a partir de
`src/lib/security/`). Não deve mudar nenhum comportamento em runtime — só reintroduz a checagem de
tipo estática que o `any` estava mascarando.

## Teste esperado
- `npx tsc --noEmit` sem erros novos (se `AuthRequest.user` não bater exatamente com o que este
  arquivo assume, o compilador vai apontar — é justamente o que este handoff quer expor).
- Testes existentes de `tests/unit/lib/security/**` (se cobrirem este middleware) continuam
  passando.

## Contexto adicional
Risco classificado como **alto**: este é um dos únicos 6 pontos de `as any` em limite de contrato
encontrados na varredura completa do repositório (54 ocorrências totais de `as any`, a maioria em
testes ou em casts de conexão Redis para BullMQ, sem relação com contrato de dado). Os outros 4
pontos foram endereçados a 04, 12 e 13 em handoffs separados desta mesma onda.
