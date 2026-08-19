# Onda 25 — Item 4/15: CYC-005, versionamento de proposta + tracking de visualização

## Identificação
- Origem: `docs/CADENCE-CYCLE-AUDIT.md`, seção CYC-005 — `CrmCommercialDocumentVersion` era tabela
  morta confirmada (schema existia, zero linha escrita em código); `publicToken` (pensado para
  link público de visualização) nunca era lido em lugar nenhum, sem rastreamento real de
  "visualizado".
- SHA de entrada: `main` pós-merge do PR da onda-24 (item 3, CYC-007)
- Branch: `claude/cyc-005-proposal-versioning`
- Status: **RESOLVIDO** (backend; UI de edição fora de escopo — ver seção "Fora de escopo")

## O que foi construído

### Versionamento (nunca sobrescreve o histórico)
- `createDocument` (`PrismaCrm360Repository.ts`) grava a versão 1 via `draftNextProposalVersion`
  (domínio puro já existente, `src/features/cadence/domain/proposal.ts` — sem alterações, só
  ganhou um chamador real) na própria criação do documento.
- `PUT /api/crm/documents/:id` (nova rota, distinta de `PUT /documents/:id/status` que já
  existia): edita título/moeda/itens/notas/termos e cria sempre uma versão nova — a versão
  anterior nunca é sobrescrita. `changeReason` opcional, gravado na versão para auditoria.
- `GET /api/crm/documents/:id/versions` lista o histórico, mais recente primeiro.
- Zod: `crmDocumentUpdateSchema` (novo, `crm360.schema.ts`) — sem `status`/`number`/`publicToken`
  (imutáveis por esta rota).

### Rastreamento real de visualização (`publicToken`)
- `GET /api/public/proposals/:token/view` (rota nova, pública) — resolve o documento pelo
  `publicToken` (uuid, não adivinhável — a credencial da rota) e registra `viewCount`/
  `firstViewedAt`/`lastViewedAt` reais. Avança `Enviado → Visualizado` só na primeira
  visualização; reabrir o link depois de `Aceito`/`Recusado`/`Pago`/etc. nunca regride o status.
- `sentAt` também passa a ser gravado — na primeira transição de `updateDocumentStatus` para
  `Enviado`, nunca sobrescrito numa transição seguinte.
- Migration `20260819140000_proposal_versioning_view_tracking` (`sentAt`/`firstViewedAt`/
  `lastViewedAt`/`viewCount` em `CrmCommercialDocument`) — escrita à mão (mesma limitação de
  shadow database das Ondas 5/22).
- `CrmCommercialDocument` entrou em `BYPASS_RLS_ALLOWED_MODELS` (`src/lib/prisma.ts`) pelo MESMO
  modelo de confiança já documentado para `BitrixConnection`: o `publicToken` na URL é a
  credencial, sem tenant conhecido até achar o documento. O bypass cobre só esse `findUnique`; a
  escrita do contador/status roda escopada por tenant normalmente.
- Rota montada em `server.ts` (`/api/public/proposals`) fora do bloco `authenticateToken`/
  `requireTenant`, no mesmo lugar dos webhooks de integração — quem abre o link é o cliente/lead,
  sem conta no sistema.

## Correções durante a implementação
- **Bug pré-existente descoberto (não corrigido, fora de escopo)**: o extension de soft-delete em
  `src/lib/prisma.ts` (`if (result && result.deletedAt !== null)`) trata `deletedAt: undefined`
  (quando uma query usa `select` estreito que omite a coluna) como "registro deletado" e lança
  P2025 em `findUniqueOrThrow`. Descoberto ao escrever o teste de integração; contornado nos meus
  testes evitando `select` estreito nas próprias queries — não é um bug introduzido por esta
  rodada, é uma limitação real da infraestrutura de soft-delete que qualquer `select` parcial em
  qualquer model "auditável" do repositório pode acionar. Documentado aqui para não ser
  redescoberto do zero numa rodada futura.
- **Teste de deriva de OpenAPI** (`openapiRouteInventory.test.ts`, Agente 18/onda-8) — a rota
  pública nova (`/api/public/proposals`) não tinha entrada em `docs/openapi.yaml`, e esse teste
  falha de propósito quando isso acontece ("introduzir uma rota nova sem documentar faz a
  verificação falhar"). Corrigido documentando as 3 rotas novas (`PUT /crm/documents/{id}`,
  `GET /crm/documents/{id}/versions`, `GET /public/proposals/{token}/view`) no YAML.
- Container de DI: os testes de integração da rota pública precisam de `setupDI()` (mesma chamada
  que `server.ts` faz no boot) antes de montar o Express de teste — sem isso,
  `container.resolve('Crm360Controller')` lança e o Express (sem `errorHandler` no app de teste)
  devolve 500 genérico em vez do 404/200 esperado. Corrigido seguindo o mesmo padrão já usado por
  `rbac-e2e-crm-operations.test.ts`.

## Fora de escopo desta rodada (documentado, não corrigido)
- **UI de edição/versões**: não existe hoje nenhuma tela de frontend consumindo
  `listDocuments`/`createDocument`/`updateDocumentStatus` (confirmado por busca antes de começar)
  — este item ficou backend + tipos (`CrmCommercialDocumentVersionDTO`/`CrmPublicDocumentView` em
  `crm360.types.ts`), sem construir uma UI nova do zero.
- **Validação formal de transição de status**: `PUT /documents/:id/status` continua aceitando
  qualquer transição (ex.: `Rascunho` direto para `Pago`), sem máquina de estados formal — gap já
  documentado no audit antes desta rodada, não é escopo de "versionamento + tracking".
- Os 6 templates HTML estáticos em `public/tools/propostas/` continuam desconectados do backend —
  conectá-los (ou substituí-los) é decisão de produto/frontend maior, fora do escopo desta rodada.

## Gate final
- typecheck: `npx tsc --noEmit` — limpo, 0 erros
- lint: `npm run lint` — 0 erros, 80 warnings (mesmo nível pré-existente do branch base)
- unit: `npx vitest run -c vitest.unit.config.ts` — **171/171 arquivos, 1330/1330 testes**
- integration: `npx dotenv-cli -e .env.test -- npx vitest run -c vitest.integration.config.ts`
  (Postgres + Redis reais) — **37/37 arquivos, 169/169 testes**, incluindo o novo
  `tests/integration/proposalVersioning.test.ts` (8 casos: versão 1 na criação, versão 2 nunca
  sobrescreve a 1, 3 edições → 4 versões sequenciais, `sentAt` gravado uma vez só, visualização
  real via rota pública transiciona `Enviado→Visualizado`, visualizações seguintes não regridem
  status já avançado, token inexistente → 404, RLS cross-tenant via `publicToken`) — mais
  `rbac-e2e-crm-operations.test.ts`/`dealClosureGate.test.ts` sem regressão
- build: `npm run build` e `npm run build:worker` — ambos limpos
- e2e: não executado (sem UI nova — ver "Fora de escopo")

## Skips e flakes
0 — nenhum teste pulado ou instável observado nesta rodada.

## Decisão

**Resolvido, no escopo backend.** `CrmCommercialDocumentVersion` e `publicToken` — os dois gaps
centrais do CYC-005 — agora têm chamadores reais, provados contra Postgres real: criar/editar um
documento sempre gera uma versão nova e imutável, e abrir o link público de uma proposta grava uma
visualização real e avança o status corretamente, sem regredir estados já mais avançados. UI de
edição/histórico de versões fica para quando houver decisão de produto sobre construir essa tela
(nenhuma existe hoje para nenhum verbo de documento, nem os já existentes antes desta rodada).
