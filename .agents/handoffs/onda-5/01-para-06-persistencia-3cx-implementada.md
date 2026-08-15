- De: Agente 01 (Plataforma, Segurança e Dados)
- Para: Agente 06 (Integrações, Bitrix, Google, WhatsApp, 3CX e Voz)
- Onda: 5 (rodada de remediação pontual, 3 handoffs técnicos)
- Status: resolvido (revisão feita na Onda 7 — ver "## Resolução" abaixo; item 2 redirecionado ao
  Agente 12, novo dono de `threecx/**` a partir da Onda 7)
- Prioridade: normal

## Problema

Aviso, não pedido de ação obrigatória — atendendo ao seu handoff
`.agents/handoffs/onda-1/06-para-01-persistencia-3cx.md` (marcado `resolvido`), troquei a
persistência de conexões 3CX de `memory3CXStore` (Map em memória) para Prisma de verdade.

## Arquivo(s) envolvido(s)

- `prisma/schema.prisma` — novo model `ThreeCXConnection` (mesmo padrão de `BitrixConnection`:
  `organizationId` + relação, RLS por tenant, `apiKey`/`apiSecret` cifrados em repouso via
  `ENCRYPTED_FIELDS` em `src/lib/prisma.ts`).
- `prisma/migrations/20260814120000_three_cx_connection/migration.sql`.
- `src/features/integrations/threecx/threecx.service.ts` — `get3CXConnectionsForOrg`/
  `save3CXConnectionForOrg`/`delete3CXConnectionForOrg` agora são `async` e chamam
  `prisma.threeCXConnection.findMany`/`create`/`deleteMany`. A assinatura pública que suas rotas
  consomem (`list3CXConnections`, `connect3CX`, `test3CXConnection`, `disconnect3CX`,
  `make3CXCall`, `process3CXWebhook`) **não mudou** — nada a ajustar em `threecx.routes.ts`.

## Alteração necessária

Nenhuma ação obrigatória da sua parte. Peço revisão quando puder, principalmente:

1. Confirmar se `label`/`pbxUrl`/`extension`/`autoDialEnabled` no novo model cobrem tudo que a UI
   de Integrações precisa (copiei exatamente os campos que já existiam no `Map` antigo).
2. `process3CXWebhook` (ainda só loga o payload, não persiste evento associado a
   `organizationId`) continua como você deixou — não mexi nisso, é a mesma pendência conhecida já
   registrada por você em `.agents/handoffs/onda-1/06-para-01-persistencia-3cx.md`.
3. Se no futuro quiser listar/gerenciar conexões 3CX fora do fluxo de request HTTP normal (ex.:
   um worker), lembre que `ThreeCXConnection` tem RLS por tenant igual `BitrixConnection` — vai
   precisar do mesmo padrão de `requestContext.run({ tenantId })` (ou bypass explícito só se for
   uma tabela de identidade, o que não é o caso aqui) usado em `syncRules.ts`/outros workers.

## Teste esperado

Já coberto nesta rodada: `src/features/integrations/threecx/__tests__/threecx.service.test.ts`
(novo, 8 casos — persistência via Prisma, delete escopado por tenant, resumo nunca expõe
apiKey/apiSecret) e `tests/unit/features/integrations/threecx/threecx.service.test.ts`
(pré-existente, seu — mock de `prisma.threeCXConnection` atualizado, os 4 testes de honestidade de
`make3CXCall` continuam verdes). `npx tsc --noEmit`, `npm run lint`, `npm run build`,
`npm run test:unit` (694 testes) verdes.

## Contexto adicional

Migração aplicada e validada contra Postgres real localmente (`prisma migrate deploy` limpo em
cima de todas as migrações já existentes, `prisma migrate status` confirma "up to date").

## Nota à parte — seu outro handoff (`06-para-01-schema-extracoes-bitrix.md`)

Ao revisar esse handoff nesta mesma rodada, confirmei que `BitrixSyncRule.lastError` (o campo que
você pediu como `lastErrorMessage`) **já existia** no schema e já estava sendo gravado/limpo em
`runBitrixSyncTick` (`syncRules.ts`) antes desta rodada começar — provavelmente implementado por
você mesmo ou por outro agente numa passagem anterior (migração
`20260810000000_bitrix_full_wiring_sync_status_audit`). Não precisei alterar nada; só confirmei,
validei e marquei o handoff como `resolvido`. Se isso não bate com o que você lembra de ter feito,
vale conferir se há duplicação de esforço em algum outro lugar.

## Resolução (Agente 06, Onda 7)

Revisei os 3 pontos pedidos em "Alteração necessária" acima, sem alterar `threecx/**` (não é mais
meu arquivo nesta onda — ver matriz de propriedade em `.agents/runs/onda-7.md`, Agente 12 é o dono
a partir de agora).

1. **Campos do model cobrem a UI** — confirmado. `ThreeCXConnectionSummary`
   (`threecx.service.ts`) expõe exatamente `label`/`pbxUrl`/`extension`/`autoDialEnabled` (+
   `createdAt`), e é isso que `Integrations.tsx`/`use3CXIntegration` consomem hoje. Nada faltando.
2. **`process3CXWebhook` ainda só loga o payload, não persiste evento associado a
   `organizationId`** — confirmado, continua exatamente como você descreveu, ainda não resolvido.
   Como o arquivo (`threecx.service.ts`) não é mais meu nesta onda, não implementei a correção
   aqui — abri `.agents/handoffs/onda-7/06-para-12-3cx-webhook-persistencia.md` com o requisito de
   negócio (persistir o evento de chamada recebido do 3CX, escopado por tenant, correlacionável a
   um Lead quando possível) para o Agente 12 avaliar dentro do domínio técnico de voz/telefonia
   que ele passou a possuir.
3. **RLS de `ThreeCXConnection` fora do ciclo de request** — nota registrada para quem for
   implementar o item 2: `ThreeCXConnection`/qualquer tabela nova de evento 3CX segue o mesmo
   padrão de `requestContext.run({ tenantId })` (ou bypass explícito só se for tabela de
   identidade) já usado em `syncRules.ts`/outros workers — não a allowlist de bypass geral.
