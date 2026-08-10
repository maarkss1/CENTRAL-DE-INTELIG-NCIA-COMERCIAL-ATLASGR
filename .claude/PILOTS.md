# Registro de pilotos — Central de Inteligência Comercial ATLASGR

Registro curto de cada tela/fluxo usado como piloto real da camada `.claude/`. Objetivo: não perder
aprendizado empírico depois que a tarefa termina. Ver `CLAUDE.md` seção 12 para quando adicionar uma
entrada nova.

## Pilot 001 — WelcomeScreen

- **Objetivo**: evoluir `src/features/auth/components/WelcomeScreen.tsx` (porta de entrada do
  produto, antes da escolha de marca) para um padrão enterprise, sem virar landing page genérica, e
  validar se a camada `.claude/` orienta esse tipo de tarefa na prática.
- **Problemas encontrados (leitura de código, antes de codificar)**: fundo hex hardcoded ignorando
  `ThemeContext`; ícones do rodapé quebrados (Font Awesome nunca foi dependência do projeto);
  `boxShadow`/`scale` pulsando para sempre (`repeat: Infinity`) sem comunicar nada; gradiente de
  texto tricolor + glow no título; hierarquia invertida (crédito pessoal com mais peso visual que o
  CTA); áudio externo (CDN pixabay) carregando desde o mount.
- **Decisões principais**: manter composição centralizada (exceção justificada — tela é um portão
  de decisão única, sem dado real pra grid, com as duas marcas precisando de peso igual antes da
  escolha); trocar fundo/cores por tokens de tema; remover toda animação em loop sem propósito;
  reaproveitar o padrão de glow ambiente já usado em `LoginScreen` em vez de inventar um novo;
  trocar ícones quebrados por `lucide-react` + SVG inline (convenção já usada em `Logo.tsx`);
  preservar áudio, crédito e todos os links existentes, só reestilizando.
- **Regras da `.claude/` que influenciaram a implementação**: regra visual #6 (sem animação
  gratuita) → remoção do pulso infinito; nota de `design-system` sobre `atlas-orange`/
  `totaltrack-blue` estáticos serem intencionais em pré-seleção → não "corrigir" a ausência de
  reatividade à marca nesta tela; `performance`/`motion-design` (não adicionar dependência nova) →
  ícones sociais viraram SVG inline em vez de uma lib nova.
- **Problemas encontrados só durante QA** (não a leitura de código): `Logo variant="white"` fixo
  ficaria ilegível em tema claro; `text-ink-2/70` no crédito e no selo institucional/link de
  telefone (mobile + claro) davam contraste insuficiente (2.63–4.04:1 vs. mínimo 4.5:1) — o glow de
  fundo, num viewport de 390px, tingia a tela quase inteira; raiz `<div>` sem landmark
  (`landmark-one-main`/`region` do axe-core).
- **Validações executadas**: `eslint` (0 erros), `tsc -b --noEmit` (0 erros), `npm run build`
  (limpo), `vitest run` (70 arquivos/430 testes passando), `axe-core` via Playwright contra o build
  estático real (`vite preview`) em 4 combinações (dark/light × desktop/mobile), verificação de
  `prefers-reduced-motion` via `context({ reducedMotion: 'reduce' })`, checagem de overflow
  horizontal e foco visível no CTA. Suíte oficial `tests/e2e/*.spec.ts` **não pôde rodar** — sem
  Docker/Postgres/Redis pro servidor Express que o `webServer` do Playwright exige.
- **Resultado**: 0 violações de acessibilidade bloqueantes ao final (3 problemas de contraste + 1
  landmark corrigidos durante a implementação); diff restrito a `WelcomeScreen.tsx`; nenhuma outra
  tela tocada.
- **Aprendizados incorporados à constituição** (`CLAUDE.md` seção indicada):
  - Seção 5 — regra de exceção justificada (a composição centralizada da própria `WelcomeScreen` é
    o exemplo de referência).
  - Seção 6 — preservação de conteúdo/funcionalidade (crédito e áudio mantidos, só refinados).
  - Seção 7, item 7 — tema e marca são eixos independentes; detalhado em `design-system/SKILL.md`.
  - Seção 8 — motion precisa responder "que informação comunica?"; detalhado em
    `motion-design/SKILL.md`.
  - Seção 9 — mídia/áudio/vídeo não tem autoplay por estética; detalhado em `performance/SKILL.md`.
  - `accessibility/SKILL.md` — checklist ganhou o item de landmark semântico na raiz.
  - `visual-qa/SKILL.md` — amplitude de QA por risco, classificação de warnings, e o protocolo
    formal para quando a suíte oficial não roda (este piloto é a referência conceitual do protocolo,
    não uma receita obrigatória pra toda tela).

## Pilot 002 — Kanban/CrmBoard (execução das 7 etapas pendentes do CRM)

- **Objetivo**: resolver, numa única sessão, as pendências reais mapeadas em pilotos anteriores do
  CRM (`crm-kanban`, `CrmBoard.tsx`) — pendências funcionais de status/funil, RBAC, mobile, dívidas
  de UX, performance e cobertura de teste — e calibrar a `.claude/` com os aprendizados reais.
  Diferente do Piloto 001, esta rodada teve Postgres/Redis reais disponíveis (instalados no
  ambiente da sessão, incluindo a extensão `pgvector`), permitindo rodar a suíte oficial completa
  (`test:unit`, `test:integration`, `test:e2e`) de verdade, não só validação alternativa.
- **Pendências funcionais resolvidas**: 7 estágios "Piloto" do funil Negócio (antes inalcançáveis
  no dropdown do `LeadDetailDrawer` e no filtro de condição de automações — só existiam no enum e
  no board) expostos corretamente, reusando `LEAD_STATUS` (`lib/zod.ts`) como única fonte em vez de
  listas locais duplicadas e desatualizadas; toggle real "Leads/Negócios" adicionado ao header do
  `CrmBoard` (antes o funil Negócio não tinha nenhuma rota/link/toggle alcançável); `closedAt`/
  analytics alinhados para os 2 estágios "...Cancelado" (já tratados como `isLost:true` em
  `crm360.service.ts`, mas não no caminho legado de update).
- **Bug real descoberto só ao exercitar o sistema (não por leitura de código)**: `CrmPipeline`,
  `CrmProduct`, `CrmDealItem` e `CrmCommercialDocument` estavam listados em `auditableModels`
  (`src/lib/prisma.ts`) — o que faz a extensão global do Prisma injetar `deletedAt: null`
  incondicionalmente em toda leitura — mas as migrations nunca criaram essas colunas nesses 4
  modelos. Qualquer query nessas tabelas (incluindo `PUT /api/crm/records/:id/stage` e
  `POST /api/crm/leads/:id/convert` — a ÚNICA ação do sistema `crm360` já alcançável pela UI antes
  desta sessão) quebrava com `PrismaClientValidationError`. Nunca fora percebido porque nenhuma tela
  real chamava esse caminho. Corrigido com uma migration real
  (`20260809100000_crm360_soft_delete_columns`) adicionando as colunas que o código já assumia
  existirem, em vez de remover os models de `auditableModels` (o que teria trocado silenciosamente
  soft-delete por hard-delete em `deleteDealItem`). Encontrado ao escrever o novo teste de RBAC
  ponta-a-ponta para essas rotas (`tests/integration/rbac-e2e-crm-operations.test.ts`), não por
  inspeção de código.
- **RBAC**: auditoria não encontrou nenhuma falha crítica — organizationId já vinha sempre de
  `req.user`, roles já validados via `requireRole`, RLS real (`FORCE ROW LEVEL SECURITY`) como
  camada extra. Correções foram hardening (não falhas exploráveis): `enrichCompany` passou a exigir
  `organizationId`; padrão "check-then-update-sem-filtro" de Company/Contact/Activity alinhado ao
  padrão mais defensivo já usado em `PrismaLeadRepository` (`where: {id, organizationId}` na própria
  query de escrita).
- **Performance**: medido de verdade (50/300/1000 leads, seed via Prisma, `PerformanceObserver`
  para `longtask` durante um drag real) antes de decidir qualquer coisa. DOM cresce linearmente sem
  virtualização (931 → 16.912 nós) e o custo do drag cresce de forma real com N (~560ms → ~2950ms de
  long tasks). Decisão: **não implementar paginação/virtualização nesta sessão** — o backend já
  devolve `meta.totalPages` pronto para paginação real, mas desenhar a UX de paginação por coluna do
  Kanban é decisão de produto/design que esta etapa não deveria forçar sob pressão de prazo; ver
  relato de entrega para o encaminhamento recomendado.
- **Mobile**: sem WebKit instalado neste ambiente (só Chromium) — Android/Chrome testado de
  verdade via emulação de dispositivo (Pixel 5, touch real via Pointer Events); iOS Safari e teclado
  virtual real de SO permanecem `REQUER DEVICE REAL`, não fingidos. Nenhum bug reproduzido (scroll
  horizontal não conflita com drag, hit targets ok, drawer funciona em 393px, touch-drag com
  auto-scroll do dnd-kit funciona) — por isso nenhuma correção de código, só a suíte nova
  (`tests/e2e/crm-kanban-mobile.spec.ts`).
- **Testes**: suíte nova real cobrindo o que faltava (`tests/e2e/crm-kanban.spec.ts` — drag mouse
  adjacente/vazio/rollback-500, drag teclado pickup/cancelar/múltiplas colunas, drawer;
  `tests/e2e/crm-kanban-mobile.spec.ts`; `tests/integration/rbac-e2e-crm-operations.test.ts`),
  integrada à infraestrutura real (`tests/e2e/helpers.ts`, `tests/helpers/rbac-e2e-helpers.ts`
  extraído de `rbac-e2e.test.ts` para reuso, não duplicado).
- **Aprendizados incorporados à constituição**:
  - `accessibility/SKILL.md` — acessibilidade executável: `KeyboardSensor` presente no código não
    provou drag acessível; só rodar o gesto revelou que `sortableKeyboardCoordinates` (opção nativa
    do dnd-kit) falhava em board multi-coluna, e que o `coordinateGetter` fica preso numa closure
    congelada no momento da ativação.
  - `design-system/SKILL.md` — cor de marca, semântica de produto e identidade de terceiro são
    eixos diferentes; bug real (`bg-neon-purple`, classe nunca definida) encontrado em
    `DecisionMakerSearch.tsx`/`CandidateCard.tsx`.
  - `visual-qa/SKILL.md` — harness/script de investigação temporário (usado para medir performance
    e simular mobile) nunca vira teste oficial por cópia direta; só promovido depois de reescrito
    contra a infra real e validado por execuções repetidas estáveis.

## Pilot 003 — Comercial Inteligente (Revenue Command Center executivo)

- **Objetivo**: criar, do zero, um módulo executivo novo (não um ajuste de tela existente) —
  cockpit de receita restrito a Gestor/Diretor/CEO, com RBAC ponta-a-ponta, forecast ponderado
  explicável, pipeline/coverage, eficiência comercial, aging, leading indicators, motivos de perda
  e qualidade do CRM — a partir de um prompt de produto de 46 seções que assume papéis
  (DIRETOR/CEO/SDR/OPERADOR/FINANCEIRO/SUPORTE) que não existem no RBAC real do repositório.
- **Decisão de RBAC (a mais importante da sessão)**: o sistema real só tem 4 papéis
  (`ADMIN`/`GESTOR`/`VENDEDOR`/`VISUALIZADOR`, ver `src/lib/auth/authorization.ts`) — um segundo
  sistema de papéis mais rico já existiu neste repositório e foi deliberadamente removido por ser
  divergente/nunca conectado a nenhuma rota (ver comentário no topo daquele arquivo). Criar
  DIRETOR/CEO/SDR/OPERADOR/FINANCEIRO só para este módulo teria reintroduzido exatamente esse
  problema. Resolvido reaproveitando a hierarquia existente:
  `canAccessCommercialIntelligence(role) = hasRequiredRole(role, ['ADMIN', 'GESTOR'])` — ADMIN
  (nível mais alto, hoje também o papel do fundador da organização) cobre Diretor/CEO na ausência
  de um papel executivo próprio; VENDEDOR/VISUALIZADOR/papel desconhecido cobrem SDR/vendedor/
  operador/financeiro/suporte/usuário comum, nenhum dos quais é distinto hoje. Decisão documentada
  em comentário extenso em `authorization.ts` (não só aqui) porque é a peça mais fácil de
  "corrigir errado" numa sessão futura sem o contexto completo.
- **RBAC em profundidade, não só um checkpoint**: `requireRole` no `router.use()` do módulo
  (bloqueia todo sub-endpoint mesmo que o mount em `server.ts` mude), `requireRole` de novo no
  mount de `server.ts` (defesa em profundidade explícita), `RequireRole` de UI em `App.tsx`
  (acesso direto por URL nunca renderiza o conteúdo restrito, só um aviso), item de menu
  condicional na Sidebar (conveniência de UX, nunca a única barreira) e ausência deliberada do
  módulo em `MODULE_ORDER` do Command Palette (não vaza nem a existência do módulo pra quem não
  tem acesso). Testado com sessão REAL (não role simulado) em
  `tests/integration/rbac-e2e-commercial-intelligence.test.ts` (9 casos, incl. varredura dos 11
  endpoints do módulo bloqueados para VENDEDOR, 401 sem sessão, isolamento de tenant) e na camada
  de UI em `tests/e2e/commercial-intelligence-rbac.spec.ts` (4 casos: menu some e URL direta mostra
  "Acesso restrito" para VENDEDOR/VISUALIZADOR, funciona para ADMIN/GESTOR).
- **Extensão mínima de schema (seção 34 do prompt de produto)**: duas tabelas novas e só essas —
  `CommercialGoal` (meta mensal, sempre digitada por um Gestor/Admin, nunca fabricada) e
  `LeadStageHistory` (histórico estruturado de mudança de etapa, que não existia — `TimelineEvent`
  é texto livre não consultável). `LeadStageHistory` é alimentada pelos mesmos 3 pontos de escrita
  que já movem uma oportunidade no Kanban (`crm360.service.ts`: `moveRecord`/`createDeal`/
  `convertLead`), via um helper único (`commercial-intelligence/infra/stageHistory.ts`) — histórico
  anterior à migration não existe e os endpoints tratam isso como dado ausente/estimado, nunca
  fabricado (Aging por Etapa expõe `dataQuality: 'measured' | 'estimated' | 'unknown'` por etapa).
- **Nunca "Pipeline = Forecast"**: `Forecast = Fechado + Commit + Best Case + Pipeline ponderado`,
  com Commit/Best Case/Pipeline/Upside classificados por um motor determinístico não-IA
  (`forecastEngine.ts`, testado em isolamento com 8 casos) — cada oportunidade expõe fatores
  positivos/negativos explicáveis (próxima ação, interação recente, data prevista, estagnação na
  etapa vs. média histórica real). "Pipeline Elegível" é um subconjunto de "Pipeline Total" por
  critério explícito (valor válido, responsável, data prevista, próxima ação, aging não-crítico),
  nunca todo o pipeline aberto.
- **Ambiente sem Docker, mas COM Postgres/Redis instaláveis**: diferente do Pilot 001 (sem infra) e
  mais parecido com o Pilot 002, mas aqui nem `docker-compose` nem um Postgres pré-rodando
  existiam — instalados via `apt-get` (`postgresql-16`, `postgresql-16-pgvector`, `redis-server`)
  e provisionados manualmente com o mesmo `scripts/db/create-app-role.sql` que o `docker-compose`
  usaria, permitindo rodar a suíte real completa (unit, integration com RLS real, e2e Playwright
  com sessão real) em vez do protocolo alternativo do Pilot 001. `PW_CHROMIUM_EXECUTABLE` (variável
  de ambiente opcional em `playwright.config.ts`, só ativa quando setada) contorna um descompasso
  de versão entre o Chromium pré-instalado deste ambiente e o pinado pelo `@playwright/test` do
  projeto — não deve ser necessária num ambiente com as versões alinhadas (ex.: CI).
- **Bug real de infraestrutura de teste encontrado ao escrever o e2e de RBAC** (não por leitura de
  código): um helper de teste que muda o papel de um usuário direto no banco
  (`tests/e2e/helpers.ts`, `setUserRole`) usando `requestContext.run({bypassRls:true}, () =>
  prisma.user.update(...))` falhava com "record not found" mesmo o registro existindo — porque
  `prisma.user.update(...)` devolve um `PrismaPromise` preguiçoso, e o hook `$allOperations` da
  extensão do Prisma (`src/lib/prisma.ts`) que lê `requestContext.getStore()` só roda quando a
  promise é de fato `await`ada, depois que o `.run(store, callback)` síncrono já retornou —
  perdendo o contexto. Corrigido trocando para `requestContext.enterWith(...)` (o padrão já usado
  com sucesso em `tests/helpers/rbac-e2e-helpers.ts`), que muta o contexto ambiente em vez de
  escopar a um callback. Vale como alerta geral: `AsyncLocalStorage.run()` com um `PrismaPromise`
  lazy dentro é uma armadilha real neste código-base, não só teoria.
- **Arquitetura**: espelha `src/features/analytics/` (domain/application/infra/presentation/routes
  + registro em `src/shared/di/setup.ts`), a estrutura de clean architecture já estabelecida para
  módulos de agregação read-heavy — não a estrutura `pages/` sugerida pelo prompt de produto
  (explicitamente condicional a "se o repositório não tiver padrão definido", e este já tinha).
  Frontend é um "hub" com abas internas (`CommercialIntelligenceHub.tsx`), mesmo padrão de
  `IntelligenceHub.tsx`/`ChatbookHub.tsx`, em vez de 9 rotas/itens de menu separados.
- **Validações executadas**: `npx tsc --noEmit` (0 erros), `npm run lint` (0 erros, mesmos
  warnings pré-existentes), `npm run build` (limpo), `npm run test:unit` (557 testes, incl. 4
  arquivos novos — `forecastEngine`, `pipelineEligibility`, `lossTaxonomy`,
  `CommercialIntelligenceUseCases`), `npx vitest run -c vitest.integration.config.ts` (suíte
  completa, 11 arquivos/40 testes, incl. `rbac-e2e-commercial-intelligence.test.ts` novo com
  Postgres real e RLS real), e Playwright e2e real (`auth.spec.ts` como controle +
  `commercial-intelligence-rbac.spec.ts` novo, 4/4 verde); a suíte e2e completa (10 specs) não
  terminou dentro do orçamento de tempo da sessão — `crm.spec.ts`/`crm-kanban.spec.ts` (os mais
  relevantes por tocarem `crm360.service.ts`) foram verificados à parte.
- **Aprendizados incorporados à constituição**: nenhuma mudança de regra visual desta vez (módulo
  de dados/densidade alta, não uma tela de composição livre) — reaproveitou o padrão `StatTile`/
  `Card variant="stat"` já visto em `Analytics.tsx` sem introduzir um novo primitivo de KPI global
  em `src/components/ui/` (ficou local à feature, mesma decisão que `Analytics.tsx` já tinha
  tomado). O aprendizado real desta rodada é de RBAC/dados (documentado acima e em
  `authorization.ts`), não de design engineering.
