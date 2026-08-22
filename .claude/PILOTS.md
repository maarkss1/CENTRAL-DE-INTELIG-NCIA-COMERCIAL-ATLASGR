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

### Adendo — Centro de Decisão (Previsor + Mentor + Analista)

- **Objetivo**: pedido do usuário para tornar o cockpit "robusto e de nível profissional",
  funcionando como previsor, mentor, analista e tomador de decisões em tempo real — sem violar a
  regra central do módulo ("não fabricar KPI") nem transformar o Forecast determinístico em algo
  que pareça ML/IA sem ser.
- **Previsor sem modelo novo**: `application/predictiveForecast.ts` (`buildForecastRange`) não
  introduz nenhum cálculo — os 3 cenários (Conservador/Provável/Otimista) são somas de campos que
  `ExecutiveOverview` já expõe (Fechado/Commit/Best Case/Upside/Forecast). Espelhado (não
  importado) no frontend por `commercialIntelligence.api.ts`, mesmo padrão já usado ali de nunca
  cruzar a fronteira frontend/`application`. `computeTrendMomentum` classifica o Win Rate via
  limiar documentado (±3pp), nunca infere de amostra insuficiente (`null` com <2 pontos).
- **Mentor por IA com fallback determinístico obrigatório**: `generateMentorPlaybook` (novo em
  `CommercialIntelligenceAiService.ts`) devolve JSON estruturado (`cleanAndParseJson`, mesmo
  padrão de `ChurnPredictionService`), mas se a IA falhar ou o JSON não parsear, as recomendações
  são derivadas deterministicamente de `alerts`/negócios em risco — o painel nunca fica vazio só
  porque o modelo falhou, e a UI (`MentorPlaybookCard`) rotula explicitamente `source: 'ai' |
  'fallback'`, nunca apresenta o fallback como se fosse gerado por IA.
- **Centro de Decisão reaproveita, não duplica**: `dealsDrillDown` ganhou `sort: 'riskImpact'`
  (valor × probabilidade de não fechar) e `ids` (filtro por IDs específicos) — nenhum endpoint
  novo, nenhum cálculo novo, só uma ordenação/filtro alternativos do mesmo `forecastEngine` já
  testado. `ids` foi adicionado porque sem ele o CTA "Ver negócio" do Centro de Decisão/Mentor
  seria cosmético (abriria um filtro amplo que poderia nem incluir aquele negócio específico) —
  ver `functional-completeness/SKILL.md` sobre não construir ação que não funciona de verdade.
- **Bug real encontrado ao conectar o endpoint de IA, não por auditoria dedicada**:
  `CommercialIntelligenceController.parseFilter` só lia `req.query`, mas os 2 endpoints POST de IA
  já existentes (`ai/executive-summary`, `ai/bitrix-note`) enviam o filtro como corpo JSON — o mês/
  vendedor/produto/origem/ICP selecionado na tela era silenciosamente ignorado, e o resumo
  executivo sempre respondia pelo mês atual. Corrigido com fallback `query → body` (`pick()`),
  testado em `controllerParsing.unit.test.ts`. Não fazia sentido replicar esse bug no endpoint novo
  do Mentor, então a correção ficou dentro do escopo desta sessão.
- **Hierarquia visual reordenada com justificativa explícita (seção 5 da constituição)**: a Faixa
  de Previsão + Mentor Comercial + Centro de Decisão passaram a abrir a Visão Executiva, antes da
  grade de KPIs — o resumo por IA e os alertas viviam no rodapé, depois de 12+ KPIs, invertendo a
  ordem real de importância para quem abre a tela para decidir o que fazer agora (critério: fluxo —
  a pergunta "o que eu faço hoje" é o motivo de a pessoa abrir esta tela, não uma consequência dela).
  Nenhum KPI existente foi removido, só reposicionado.
- **Atualização automática opcional, desligada por padrão**: polling de 3 minutos só quando a
  pessoa liga o toggle explicitamente (regra de performance: nada roda em background sem pedido) —
  sem WebSocket/infra nova.
- **Validações executadas nesta sessão**: `npx tsc --noEmit` (0 erros em todo o módulo — 1 erro
  encontrado depois, isolado, em `src/features/prospecting/` por edição concorrente de outra sessão
  no mesmo diretório, não relacionado), `npm run lint` sobre o módulo (0 erros, 1 warning
  pré-existente não relacionado em `GoalEditorDialog.tsx`), `npm run test:unit` completo (1257/1258
  antes do fix abaixo — a única falha, `openapiRouteInventory.test.ts`, já existia antes de qualquer
  mudança desta sessão, confirmado revertendo via `git stash`; 130/130 nos testes do módulo depois do
  fix), `npm run build` (limpo).
- **QA visual em navegador real — concluído, com um bug real encontrado e corrigido**: `npm run dev`
  (`tsx watch server.ts`) via `preview_start({name:...})` travou de forma reproduzível em 4
  tentativas (CPU do processo Node estático por 6+ minutos, sem log além do banner do npm — não é
  "compilação lenta"), mas a MESMA invocação (`npx tsx watch server.ts`) rodada direto via shell
  sempre bootou em <1s. A causa raiz não foi 100% isolada (não é o import graph nem `initTracing()`
  nem `createViteServer()` — todos testados isoladamente e rápidos; suspeita não confirmada é algo
  específico de como o wrapper de spawn do `preview_start` herda stdio/ambiente), mas o contorno
  funcional é: subir o servidor manualmente (`npx tsx watch server.ts &` via shell) e apontar
  `preview_start({url:...})` pra porta já viva, em vez de deixar a ferramenta spawnar o processo.
  Achado colateral do processo de diagnóstico: havia um processo Node **de outro diretório inteiramente**
  (`C:\CENTRAL COMERCIAL`, não este checkout) já escutando numa porta vizinha e servindo a mesma
  tela — só percebido ao cruzar `CommandLine` do processo via `Get-CimInstance Win32_Process`; teria
  produzido uma "verificação visual" com aparência de sucesso mas testando código desatualizado/errado.
  Fica registrado como alerta: a porta responder não é prova de que é O código desta sessão — confirmar
  o diretório do processo antes de confiar num preview já em execução.
  Com o servidor real no ar e dados de teste semeados (`[QA] AtlasGR — ...`, via script `tsx`
  temporário, removidos ao final — não promovidos a fixture oficial), a verificação real encontrou
  **um bug de correção real** no `buildForecastRange`: o cenário Otimista (fechado + commit + best
  case + upside) ficava **menor que o Provável** (forecast ponderado, que inclui uma fração de TODO
  negócio aberto, inclusive tier "Pipeline" que o Otimista não somava) sempre que havia um negócio de
  probabilidade média/baixa relevante no pipeline — R$590k esperado, R$410k mostrado. Corrigido
  trocando a fórmula para Fechado + `pipelineTotal` (valor cheio de todo negócio aberto do funil,
  não só os tiers "fechando"), que é matematicamente sempre ≥ Provável; testes atualizados com um
  caso de regressão explícito (`toBeGreaterThanOrEqual`). Só foi encontrado por rodar a tela de
  verdade com dados reais — nenhuma leitura de código pegou isso, e um piloto sem navegador de
  verdade (Piloto 001) teria publicado esse bug. Depois do fix, verificados com sucesso: Mentor
  Comercial gerou recomendações reais via LLM local (grounded nos números certos, `source: 'ai'`
  confirmado, não fallback), Centro de Decisão ordenou corretamente por valor em risco, o CTA "Ver
  negócio" abriu o drawer filtrado a exatamente 1 negócio (novo filtro `ids` funcionando
  ponta-a-ponta), sem erros no console, estrutura semântica correta (`heading`/`list`/`listitem`/
  botões com nome acessível via `read_page`), dark mode ativo e sem overflow horizontal em viewport
  mobile (375px).
- **Débito de acessibilidade encontrado E corrigido em todo o módulo (decisão explícita do
  usuário)**: texto `text-[#d03b3b]` em `text-[11px]` (usado no "Por quê:" do
  `DecisionCenterPanel.tsx`, mesmo padrão já usado em `DealDrillDownDrawer.tsx` e outros 12
  arquivos do módulo) media 3.86:1 de contraste contra `bg-surface` no dark mode — abaixo do mínimo
  AA (4.5:1 pra texto normal; 11px bold não qualifica como "texto grande"). Confirmado
  matematicamente via `getComputedStyle` + fórmula de luminância relativa do WCAG no navegador
  real, não estimado. Era débito PRÉ-EXISTENTE (mesma cor/tamanho já usados em
  `DealDrillDownDrawer.tsx`), não introduzido por este piloto — replicado por seguir o padrão já
  estabelecido no módulo (regra 7.6 da constituição). Apresentado ao usuário via `AskUserQuestion`
  com 3 opções (só documentar / corrigir só nos componentes novos / corrigir em todo o módulo);
  escolheu a terceira. Nenhuma cor única passa 4.5:1 nos dois temas ao mesmo tempo
  (`#d03b3b`: claro 4.80 / escuro 3.86; `#ef4444`, já existente como `--color-danger` no bloco
  `@theme`: escuro 4.93 / claro 3.76) — corrigido com um token novo reativo a tema (`--critical` em
  `globals.css`, `:root` = `#d03b3b`, `.dark` = `#ef4444`, reaproveitando o valor já definido em vez
  de inventar uma cor), e as 14 ocorrências de `[#d03b3b]` no módulo trocadas por `critical`
  (`text-critical`/`bg-critical/NN`/`border-critical/NN`) via substituição mecânica — nenhuma outra
  mudança de layout/comportamento. Validado no navegador real nos dois temas depois do fix: claro
  4.80:1 (mantido), escuro 4.93:1 (era 3.86:1). `tsc`/lint/`vitest`(130/130)/`build` limpos depois
  da mudança.
- **Descoberta correlata, não corrigida (fora do escopo aprovado — reportar, não decidir sozinho)**:
  medindo o débito acima, as cores verde (`#0ca30c`, "bom"/otimista) e amarelo-escuro (`#b8860b`,
  "atenção") usadas no mesmo padrão em várias telas do módulo falham no **light mode** (3.35:1 e
  3.25:1 respectivamente contra branco, abaixo de 4.5:1) embora passem no dark mode — o problema
  espelhado do vermelho, não medido/aprovado nesta sessão porque só foi descoberto ao investigar a
  correção do vermelho. Os tokens `--ok`/`--warn` já existentes em `globals.css` também têm o mesmo
  problema (`--ok` #0F9D64: 3.48:1 no claro). Requer decisão e sessão própria — não corrigido aqui.

## Pilot 004 — Ferramentas de Prospecção (Google Places / Apollo / Hunter / LinkedIn isolados)

- **Objetivo**: dentro da Prospecção, dar ao vendedor uma ferramenta por API — abrir só o Google
  Places, só a Apollo, só o Hunter, sem o encadeamento multi-provider que a aba "Radar Discovery"
  já faz. Pedido do usuário mudou de escopo no meio da sessão: "LinkedIn" começou como um gerador
  de link manual e virou busca real via Apollo (Organization/People Search) filtrada para só
  mostrar entradas com `linkedinUrl` confirmado, com o gerador manual como fallback — não existe
  API pública do LinkedIn pra isso, e scraping violaria os Termos de Uso do LinkedIn.
- **Zero duplicação de lógica de provider**: as funções single-provider já existiam prontas
  (`discoverViaGooglePlaces`, `fetchApolloCandidates`, `findPeopleViaDomainSearch`,
  `findEmailViaHunter`) — só precisaram virar `export` (estavam privadas) e ganhar rotas dedicadas
  em `prospecting-tools.routes.ts`. O padrão de grade de ferramentas foi 100% reaproveitado de
  `IntelligenceHub.tsx` (`TOOL_TABS` + grid + botão Voltar), sem inventar um novo.
- **`GET /prospecting/tools/status`**: novo endpoint, só booleano de "configurado" por provedor
  (nunca a chave), no mesmo espírito de `checkApolloConnection`. Alimenta um badge "Não configurado"
  na grade e um banner explicativo dentro da ferramenta — AGENTS.md da pasta exige "não ocultar
  falha de provider".
- **Schema Zod compartilhado extraído**: `discoverCriteriaSchema` (antes só em
  `prospecting.routes.ts`) virou `schemas/discoverCriteria.schema.ts` — usado tanto por `/discover`
  quanto pelas novas ferramentas `/tools/google-places` e `/tools/apollo`, evitando reimportar um
  arquivo de rota de dentro de outro (acoplaria dois routers e puxaria a cadeia pesada de imports
  de `prospecting.routes.ts` — multer, IcebreakerService — em qualquer teste que só precisasse do
  schema).
- **Gate de documentação viva pegou a mudança de verdade**: `tests/unit/shared/
  openapiRouteInventory.test.ts` (Agente 18) falhou até `docs/openapi.yaml` ganhar as 5 rotas novas
  — confirma que esse teste funciona como pretendido. `auth-extra` já estava undocumented antes
  desta sessão (confirmado via `git stash`); não corrigido aqui (fora de escopo), reportado à parte.
- **Bug real encontrado só ao testar com dados reais, não por leitura de código**: o Hunter.io
  Domain Search devolveu 400 (`pagination_error` — "limited to 10 email addresses on your plan")
  porque `HunterTool.tsx` pedia `limit: 20` fixo, acima do teto do plano gratuito já usado como
  default (`limit = 10`) em `hunter.service.ts`. Corrigido removendo o override e deixando o default
  do backend (já calibrado pro plano real) prevalecer.
- **`preview_start({name: ...})` travou de novo, mesma causa não-100%-isolada do Pilot 003
  (Adendo)**: 2 tentativas (incl. restart limpo), processo Node vivo mas sem nenhum log além do
  banner do npm por 2+ minutos, porta nunca abre (confirmado via `Get-NetTCPConnection` e `curl`
  direto, não só pelo status "running" da ferramenta). Mesmo contorno funcionou de novo: subir
  `npx tsx watch server.ts` manualmente via Bash (`run_in_background`) com as env vars do
  `launch.json` copiadas à mão, esperar a porta abrir por polling, e apontar
  `preview_start({url:...})` pra ela. Confirma que o contorno do Pilot 003 é reproduzível, não um
  acaso — vale como procedimento padrão sempre que `preview_start({name})` travar deste jeito
  específico (processo vivo, zero log, porta nunca abre) neste ambiente.
- **QA em navegador real, ponta a ponta, com dados reais**: as 3 integrações pagas estavam de fato
  configuradas neste ambiente de dev (`PROSPECTING_PROVIDER_MODE=hybrid` com chaves reais) — os
  quatro cards mostraram sem badge "não configurado", e cada ferramenta foi testada com busca real
  + promoção real pro CRM (`POST /promote` → 201 Created em Google Places, Apollo, Hunter e no
  gerador manual do LinkedIn), sem nenhum erro no console. Sessão de teste criada via o próprio
  formulário de signup (mesmo caminho que `tests/e2e/helpers.ts::signUp` usa), não atalho de API.
  Verificado também: dark mode ativo (cor de marca `#FF5618` legível sobre fundo escuro) — troca
  para Total Trac não foi exercitada nesta rodada (a cor vem 100% de `useBrandAccent()`, já
  validado em outras telas, nenhuma lógica de cor nova introduzida aqui).
- **`computer` (click por coordenada) não disparou eventos de forma confiável nesta sessão** (pane
  sem compositing — `screenshot` falhou o tempo todo com "Browser pane is not displayed") —
  cliques reais precisaram de `button.click()` via `javascript_tool` como alternativa. Registrado
  como nota de ambiente, não um bug do produto.
- **Achado colateral fora de escopo, reportado via `spawn_task`, não corrigido aqui**: o botão da
  aba OCR já existente usa `bg-info-base`, uma classe sem token correspondente em `globals.css`
  (só `--color-info` existe) — provavelmente renderiza sem cor de fundo no estado ativo. Pré-
  existente, não introduzido por este piloto; o botão novo "Ferramentas" usou `bg-info` (classe
  real) para não repetir o mesmo problema.

## Pilot 005 — Market Intelligence, módulo inteiro nunca reagia a dark mode

- **Objetivo**: continuação do Onda 4 (piloto de navegação/tipografia/multibrand, PR #232, já
  mergeado) — resolver o achado documentado como "fora do escopo" naquela rodada:
  `text-[#333333]` hardcoded (51 ocorrências) no módulo Market Intelligence. Investigação mostrou
  que o achado real era bem maior: as 8 telas do módulo (`src/pages/MarketIntelligence.tsx` +
  7 componentes em `src/features/market-intelligence/components/`) tinham **~330 ocorrências**
  de `bg-white`/`bg-slate-*`/`border-slate-*`/`text-slate-*` cruas — o módulo inteiro nunca
  reagia à troca de tema, só ao texto. Achado agravado por `ThemeContext.tsx` ter `dark` como
  tema **default** (`localStorage.getItem('atlas_theme') || 'dark'`) — a maioria dos usuários via
  esse módulo como um bloco branco cru dentro de um app escuro.
- **Escopo mantido deliberadamente restrito**: 2 arquivos com estética escura permanente e
  proposital (`LeadApprovalDeck.tsx` — deck estilo cartão/gamificado; `Account360.tsx` — usa
  `bg-white/N`/`border-white/N` translúcidos sobre fundo escuro fixo) foram excluídos da migração
  — não é o mesmo bug (não reagir a tema), é uma escolha de composição consistente que reagir
  quebraria. `bg-[#333333]` (cabeçalhos/botões escuros fixos, ex. `MarketIntelligenceApp.tsx`) e
  cores semânticas de status já pareadas (`bg-emerald-50 text-emerald-800` etc., em `statusTone`/
  `CALIBRATION_TONE`/badges de ICP) também ficaram de fora — já eram internamente consistentes.
- **Bug real introduzido pela própria migração mecânica, encontrado só em QA visual**: um
  find-replace ingênuo de `text-slate-700`/`text-[#333333]` → `text-ink` quebra qualquer painel
  com fundo semântico fixo e claro (ex. `bg-amber-50` de um banner "decisão bloqueada por
  governança") — `--ink` vira quase-branco no dark mode, ficando ilegível sobre um fundo que
  nunca escurece. Mesmo problema, mais sutil, com `bg-white/N`→`bg-surface/N` dentro de cabeçalhos
  permanentemente escuros (`bg-[#333333]`): a "sombra" translúcida vira quase-preta sobre
  quase-preto. Achado sistematicamente via screenshot real (Playwright, luz e escuro) em vez de
  só leitura de diff — regex por si só não distingue "texto neutro sobre superfície neutra" de
  "texto neutro sobre painel semântico fixo". Corrigido revertendo os pontos afetados para tons
  semânticos fixos (`text-amber-900`, `bg-white/70`/`bg-white/5`) pareados com o fundo que também
  não reage.
- **Bug real e pré-existente encontrado pelo axe-core, não pela migração**: a aba ativa do seletor
  em `src/pages/MarketIntelligence.tsx` (Territorial/Economia/Empresas/LDR) usava `bg-white
  text-[#C43E0E]` — ao virar `bg-surface text-[#C43E0E]` (tema-reativo), `#C43E0E` sobre
  `--surface` escuro mede 3.57:1, abaixo do mínimo AA. Não era bug pré-existente por acaso: no
  tema claro original o par já funcionava (laranja sobre branco), e só ficou mensurável ao virar
  reativo. Corrigido trocando para o padrão já estabelecido no restante do app para "aba ativa"
  (`bg-brand-active text-white`, mesmo token usado em `Sidebar.tsx`/`MarketIntelligenceApp.tsx`) —
  também tokeniza a marca (bônus: reage a Total Trac, que a versão anterior não fazia).
  `tests/e2e/accessibility.spec.ts` (specc "Market Intelligence não tem violações críticas/sérias")
  pegou isso automaticamente; sem essa suíte, o bug teria passado despercebido de novo.
- **`bg-[#F7F7F5]` (fundo de página, 3 ocorrências) → `bg-bg`**: valor hexadecimal a 1 dígito de
  distância do token `--bg` (`#F8F9FA`) já existente — quase certamente uma cópia manual do valor
  em vez do token. Corrigido como tokenização real, não só como parte do bug de contraste.
- **Validação**: `npm run lint`/`tsc -b --noEmit`/`npm run build` limpos; screenshots reais via
  Playwright (`chromium-1194` pré-instalado, `PLAYWRIGHT_CHROMIUM_EXECUTABLE`) nas 4 abas do
  módulo em claro e escuro, inspecionadas visualmente antes e depois de cada correção;
  `tests/e2e/accessibility.spec.ts` (6/6, incl. Market Intelligence — pegou o bug de contraste da
  aba ativa), `tests/e2e/market-intelligence.spec.ts` (8/8), `tests/e2e/mobile-sweep.spec.ts` +
  `crm-kanban-mobile.spec.ts` (6/6), `tests/e2e/crm.spec.ts` + `command-palette.spec.ts` (9/9) —
  todos verdes depois da mudança.
- **Aprendizados incorporados à constituição**:
  - `design-system/SKILL.md` — migração mecânica de token de tema (`text-slate-*`→`text-ink`)
    exige checar, painel por painel, se o fundo que envolve o texto também vai reagir ao tema; um
    regex cego cria contraste quebrado em vez de resolvê-lo quando fundo e texto reagem em
    velocidades diferentes.
  - `visual-qa/SKILL.md` — reforça o precedente já registrado no Piloto 003 (Centro de Decisão) de
    que contraste precisa de verificação real (screenshot/axe-core) nos dois temas, não inferência
    de código; aqui o achado foi automatizado (axe-core pegou a aba ativa) e visual (screenshot
    pegou o banner de governança) em conjunto.
