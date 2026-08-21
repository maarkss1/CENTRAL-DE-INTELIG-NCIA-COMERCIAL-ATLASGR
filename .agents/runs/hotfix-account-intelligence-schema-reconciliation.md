# Hotfix — reconciliação do schema duplicado de Account Intelligence (bloqueava CI de todo PR)

## Identificação
- Origem: CI vermelho (`quality`, `SonarQube`, `e2e-tests`, `build-and-test`) no PR #193
  (CYC-003), sem nenhuma relação com o diff daquele PR. Investigação confirmou que `main` estava
  quebrado desde o merge `5990d17` ("Merge remote-tracking branch
  'origin/data/market-intelligence-aggregate-...'"), feito diretamente pelo dono do produto.
- Decisão do usuário (`AskUserQuestion`): **"Eu conserto"** — investigar, corrigir com um PR
  separado, e só então continuar a sequência CYC-004..AI-006.
- Branch: `hotfix/reconcile-account-intelligence-duplication`
- Status: **RESOLVIDO** — `main` volta a compilar, buildar e passar 100% dos testes (unit +
  integration), a partir de um estado onde `prisma generate` nem chegava a rodar.

## O que realmente aconteceu (causa raiz)

O merge `5990d17` combinou duas linhas de desenvolvimento do mesmo módulo (Account/LDR
Intelligence) que tinham divergido, e a resolução do merge não foi uma junção real — várias vezes
"manteve os dois lados" ou "pegou o lado errado" em arquivos que precisavam ser consistentes entre
si. O sintoma imediato (`prisma generate` falhando com 20 erros de model/field duplicado) era só a
ponta visível; a investigação encontrou 5 problemas distintos, todos do mesmo merge:

1. **`prisma/schema.prisma` duplicado**: os models `AccountIntelligenceSnapshot`, `AccountSignal`,
   `DecisionMaker`, `EconomicRelationship`, `IntelligenceEvidence`, `AccountScore`,
   `AccountRecommendation` — e os campos de back-relation correspondentes em `Company` — estavam
   definidos DUAS vezes: uma versão real com `organizationId`/RLS/chaves compostas (PR #172,
   "Account Intelligence 360", com migration `20260818100000_ldr_account_intelligence_foundation`
   aplicada) e uma versão antiga sem tenant, sem migration nenhuma correspondente (nunca existiu
   como tabela real no Postgres).
2. **`accountIntelligence.service.ts` sobrescrito pela versão errada**: o merge manteve
   `accountIntelligence.routes.ts`/`accountIntelligence.schemas.ts` da branch certa (commit
   `f9ea939`, "feat(04): implementa API de account intelligence" — classe `AccountIntelligenceService`,
   organizationId/RLS reais, com contrato/testes próprios em
   `accountIntelligence.routes.contract.test.ts`), mas reverteu `accountIntelligence.service.ts`
   de volta para uma versão antiga (170 linhas, objeto simples, dados fabricados — "Simulado" no
   próprio comentário, `total: 85` hardcoded, chamada a `getAiModel` sem nem importar a função) que
   nunca teve migration correspondente e já estava quebrada antes mesmo da duplicação de schema.
3. **`worker.ts` perdeu a proteção de timeout no boot e a conexão real da cadência**: o merge
   substituiu o wrapper `withTimeout(pingRedis(...), STARTUP_REDIS_TIMEOUT_MS)` (RUN-002e,
   Sprint 02/Onda 14 — sem ele, Redis indisponível no boot deixa o processo pendurado para sempre
   em vez de falhar visivelmente) por uma chamada direta a `pingRedis`, e trocou
   `createCadenceRunWorker`/`scheduleCadenceRunJob` (o worker real da cadência, CYC-002/CYC-008)
   pelos workers mortos do item 4 abaixo — ou seja, a cadência multicanal (construída e testada nas
   ondas 19-26 desta sprint) tinha sido silenciosamente desligada do processo `worker.ts` real.
4. **Subsistema inteiro morto ficou "vivo" no boot**: `actionExecutor.service.ts` e
   `src/lib/queue/accountIntelligence.worker.ts` (fila/worker para "aprovar recomendação") e
   `src/lib/queue/newsMonitor.worker.ts` (scanner de notícias) — todos escritos contra o schema
   antigo nunca migrado, todos com dados fabricados (mock de notícia, score hardcoded), nenhum com
   cobertura de teste, e `newsMonitor.worker.ts` ainda usando a API antiga do BullMQ (`repeat` em
   `JobsOptions`, removida na v6 — o projeto já tinha passado por essa migração numa onda anterior).
5. **Colunas em `schema.prisma` sem migration correspondente** (achadas rodando o gate contra
   Postgres real, não só por leitura de schema): `User.bitrixUserId` (commit `7cd5acc`, mensagem de
   commit literalmente "1") e — descoberto ao recriar o banco de teste do zero — confirmação de que
   as migrations de `MarketIntelligenceCompany`/`MarketIntelligenceMunicipalityMapping` já existiam
   corretas; o banco de teste local só estava com estado obsoleto de execuções anteriores desta
   sessão.

## Decisão de reconciliação

Nenhuma das duas "metades" do Account Intelligence foi escolhida por preferência — a evidência
decidiu: só a versão com organizationId/RLS tem migration real aplicada no Postgres (a versão
antiga nunca teve tabela nenhuma criada; qualquer chamada real a ela sempre teria lançado erro de
coluna/tabela inexistente, mesmo antes desta rodada). Por isso:

- **Mantido e restaurado**: `accountIntelligence.service.ts` (classe real, `f9ea939`),
  `accountIntelligence.routes.ts`/`accountIntelligence.schemas.ts` (já corretos, não tocados) —
  agora montados em `server.ts` (`/api/market-intelligence`, junto de `marketIntelligenceRoutes`).
  `cadenceRun.worker.ts` reconectado a `worker.ts`, com o timeout de boot restaurado.
- **Removido** (nunca funcional, zero cobertura de teste, dados fabricados):
  `src/features/market-intelligence/server/actionExecutor.service.ts`,
  `src/lib/queue/accountIntelligence.worker.ts`, `src/lib/queue/newsMonitor.worker.ts`, e os
  handlers `/accounts/...` duplicados que viviam dentro de `marketIntelligence.routes.ts` (a versão
  real e testada já cobre os mesmos caminhos via `accountIntelligence.routes.ts`).
- **Separado em vez de descartado**: `getAccountIntelligence`/`buildAccountIntelligence` (uma
  TERCEIRA implementação, do commit `1929b79`, que computa inteligência só a partir do catálogo
  global de CNPJ — feature genuinamente diferente, sem relação com o CRM/tenant) foi movido para um
  arquivo próprio (`catalogAccountIntelligence.service.ts`) em vez de competir pelo mesmo nome de
  arquivo — `marketIntelligenceCompany.routes.ts` (ainda não montado em produção) e o teste
  `tests/unit/market-intelligence/accountIntelligence.test.ts` foram atualizados para o novo import.
- **Migration nova** (`20260819150000_user_bitrix_user_id`): adiciona `user.bitrixUserId` (coluna
  opcional, sem uso em código de aplicação ainda) — a coluna já existia no schema.prisma sem
  migration; sem isso, qualquer leitura real de `User` (inclusive o adapter do Better Auth) falhava
  com "column does not exist".

## Correções durante a implementação
- `Company` tinha os 7 campos de back-relation do Account Intelligence declarados duas vezes
  dentro do próprio model (não só nos models filhos) — removida a segunda cópia (nomes/relations
  da versão antiga, `"SourceRelationship"`/`"TargetRelationship"`).
- `Account360.tsx`/`LeadApprovalDeck.tsx` (frontend do módulo, já existente, não relacionado à
  duplicação de schema mas quebrado por imports para caminhos que não existem neste projeto —
  `@/components/ui/card` em minúsculo, `useToast`): corrigidos para os componentes/paths reais
  (`components/ui/Card.tsx` PascalCase, `src/lib/toast.ts`).
- `openapiRouteInventory.test.ts` não precisou de nova entrada de documentação: o novo mount de
  `accountIntelligenceRoutes` reusa o mesmo prefixo (`/api/market-intelligence`) já documentado.
- Banco de teste local recriado do zero (`DROP DATABASE` + `create-app-role.sql` +
  `prisma migrate deploy`) depois de descobrir que estado acumulado de execuções anteriores desta
  sessão mascarava a diferença entre "migration aplicada no arquivo" e "coluna realmente existe no
  banco" — replicando exatamente o que o CI faz (Postgres novo a cada run) em vez de confiar num
  banco local que pode ter ficado com histórico misto.

## Gate final
- `npx prisma generate` — limpo (era o ponto de falha original: 20 erros de validação)
- `npx tsc --noEmit` — limpo, 0 erros (chegou a ter 15 erros intermediários: schema duplicado,
  enum/campo de cadência faltando, imports quebrados de 3 arquivos de frontend/rota)
- `npm run lint` — 0 erros, 83 warnings (nenhum novo introduzido; `Account360.tsx`/
  `LeadApprovalDeck.tsx` já tinham alguns pré-existentes)
- unit: `npx vitest run -c vitest.unit.config.ts` — **175/175 arquivos, 1389/1389 testes**
- integration (Postgres+Redis reais, banco recriado do zero): `npx dotenv-cli -e .env.test --
  npx vitest run -c vitest.integration.config.ts` — **38/38 arquivos, 175/175 testes**, incluindo
  `run002e-worker-startup-fails-visibly.test.ts` (prova real, via processo `worker.ts` spawnado,
  que o boot falha visivelmente e rápido sem Redis — esse teste ficava pendurado 20s e estourava
  timeout antes desta correção, porque o `withTimeout` de boot tinha sido removido)
- `npm run build` e `npm run build:worker` — ambos limpos

## Skips e flakes
0 — nenhum teste pulado ou instável observado nesta rodada (depois de recriar o banco de teste do
zero; antes disso, falhas de "coluna não existe" pareciam flakes mas eram estado obsoleto real).

## Decisão

**Resolvido.** A causa raiz não era um bug pontual de duplicação de schema — era um merge que
combinou mal duas linhas de desenvolvimento do mesmo módulo em pelo menos 5 arquivos diferentes,
incluindo desconectar silenciosamente o worker real da cadência (CYC-002/CYC-008) do processo de
produção. A resolução seguiu evidência (qual implementação tem migration real aplicada, qual tem
teste, qual é de fato chamada) em vez de preferência, preservou as duas features genuinamente
distintas que colidiram de nome (`accountIntelligence.service.ts` vs
`catalogAccountIntelligence.service.ts`), e removeu só o que nunca teve chance de funcionar contra
o banco real. `main` volta a ter CI verde para qualquer PR novo — inclusive o PR #193 (CYC-003),
que segue sem nenhuma mudança própria pendente, só aguardando este hotfix ser mesclado primeiro.
