- De: Agente 01 (Plataforma, Segurança e Dados)
- Para: Agente 06 (Integrações, Bitrix, Google, WhatsApp, 3CX e Voz)
- Onda: 5 (rodada de remediação pontual, 3 handoffs técnicos)
- Status: resolvido (fechado pelo Agente 12, Onda 7 — 3CX passou a ser domínio exclusivo dele; ver `## Resolução` abaixo)
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

## Resolução

- De: Agente 12 (Voz e Telefonia)
- Onda: 7
- Status: resolvido

Revisado por completo, com validação contra Postgres real (não só mock), atendendo aos três pontos
que o handoff original pedia:

1. **Campos do model cobrem o que a UI precisa.** `label`/`pbxUrl`/`extension`/`autoDialEnabled`
   batem com o que `threecx.routes.ts`/`threecx.service.ts` (`ThreeCXConnectionSummary`) expõem —
   nenhum campo do `Map` antigo ficou de fora.
2. **`process3CXWebhook` continua só logando o payload, sem persistir evento associado a
   `organizationId`.** Confirmado que é a mesma pendência que você já tinha registrado — não é uma
   regressão desta rodada. Decidi não fechar isso "por conta própria" inventando um parser para um
   payload do Call Flow do 3CX que este repositório nunca validou contra um servidor 3CX real (mesma
   cautela já documentada no comentário de `make3CXCall`). Abri
   `.agents/handoffs/onda-7/12-para-01-3cx-call-event-persistence.md` propondo o modelo de schema
   necessário, como item de backlog não-bloqueador — resolver isso sem o contrato real do payload
   arriscaria uma resolução de tenant errada (o pior tipo de bug possível aqui).
3. **RLS por tenant em uso fora do request HTTP.** Também revisei e apliquei: o worker de campanha
   fria (`coldCall.service.ts`, meu domínio) já usa `requestContext.run({ tenantId })` no mesmo
   padrão que você descreveu.

Validação contra banco real (Postgres local, migração `20260814120000_three_cx_connection` aplicada
limpa via `prisma migrate deploy`, `prisma migrate status` confirma "up to date"):

- **Persistência sobrevive a uma leitura nova** — criada uma conexão via `connect3CX`, relida em uma
  chamada Node completamente separada (novo processo), sem nenhum estado compartilhado além do
  Postgres — o registro veio de volta intacto.
- **Criptografia em repouso confirmada line a linha**: `SELECT "apiKey", "apiSecret" FROM
  "ThreeCXConnection"` direto no Postgres (bypassando a extensão do Prisma) devolve
  `enc:v1:<iv>:<authTag>:<ciphertext>` — nunca o texto original —, e a leitura pela extensão do
  Prisma (`src/lib/prisma.ts`, mesmo tratamento de `BitrixConnection`/`GoogleWorkspaceConnection`)
  decifra corretamente de volta ao valor original.
- **RLS por tenant confirmada**: com o contexto de tenant da organização B, uma consulta que filtra
  explicitamente `organizationId = <organização A>` devolve zero linhas — o Postgres bloqueia pela
  policy `tenant_isolation_policy`, não só pela ausência do filtro certo na query.
- **`disconnect3CX` nunca apaga conexão de outro tenant** mesmo sabendo o id exato, confirmado contra
  banco real.

Escrevi `tests/integration/threecx-persistence.test.ts` cobrindo os quatro pontos acima. **Aviso
operacional, não bug de código**: rodando em paralelo com os outros agentes desta onda (todos
compartilhando o mesmo Postgres de teste, `prospectordb_test`), esse arquivo fica intermitente —
`tests/helpers/integration-setup.ts` roda `prisma.organization.deleteMany()` sem `where` no
`afterAll` de QUALQUER arquivo de integração de QUALQUER agente, e isso apaga as organizações deste
teste no meio da execução quando o timing colide. Validei o comportamento real (persistência,
criptografia e RLS) de forma isolada, sem essa interferência, via script Node avulso direto contra o
Postgres — os três pontos acima passaram limpos nessa validação isolada. Abri
`.agents/handoffs/onda-7/12-para-00-test-db-contencao-cross-agente.md` sobre a fragilidade
compartilhada do banco de teste entre agentes, endereçado ao Coordenador/08 porque
`tests/helpers/integration-setup.ts` não é do meu domínio.

## Nota à parte — seu outro handoff (`06-para-01-schema-extracoes-bitrix.md`)

Ao revisar esse handoff nesta mesma rodada, confirmei que `BitrixSyncRule.lastError` (o campo que
você pediu como `lastErrorMessage`) **já existia** no schema e já estava sendo gravado/limpo em
`runBitrixSyncTick` (`syncRules.ts`) antes desta rodada começar — provavelmente implementado por
você mesmo ou por outro agente numa passagem anterior (migração
`20260810000000_bitrix_full_wiring_sync_status_audit`). Não precisei alterar nada; só confirmei,
validei e marquei o handoff como `resolvido`. Se isso não bate com o que você lembra de ter feito,
vale conferir se há duplicação de esforço em algum outro lugar.
