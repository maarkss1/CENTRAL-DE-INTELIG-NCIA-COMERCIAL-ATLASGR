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

## Pilot 006 — Reformulação de estilo em nível de plataforma ("Sinal", camada de tokens/primitivos)

- **Objetivo**: pedido explícito do usuário ("reformular todo o estilo da plataforma... algo vivo,
  conceitual, elegante e enigmático") — a primeira tarefa deste tipo (mudança visual ampla,
  autorizada pela seção 13 da Constituição por ter sido pedida explicitamente, não assumida).
  Primeiro piloto a operar na camada de tokens/primitivos (`globals.css`, `Card.tsx`, `Button.tsx`)
  em vez de numa tela isolada — decisão deliberada: como praticamente toda tela consome esses
  tokens/primitivos, uma mudança bem contida ali se propaga pra a plataforma inteira sem exigir
  reescrever manualmente 25+ módulos de feature numa única sessão.
- **Achado que redirecionou o conceito antes de qualquer código**: a hipótese inicial (adotar Space
  Grotesk pros headings, "Mont"/manual histórico) foi descartada ao ler `CREATIVE_SYSTEM_01.md`
  (raiz do repo) — documento institucional que já formaliza, com data mais recente que
  `docs/BrandConstitution.md`, que "Montserrat é o que o produto efetivamente renderiza... não
  'Mont'/'Space Grotesk' do manual histórico" e proíbe explicitamente gradiente azul/roxo genérico,
  glassmorphism decorativo, holograma, cérebro digital, robô e HUD militar. O mesmo documento já
  define a narrativa conceitual real do produto — "Do Sinal à Ação" (Sinal→Contexto→Prioridade→
  Ação→Aprendizado→Decisão), personalidade "inteligente, madura, precisa, silenciosamente
  poderosa", território emocional "controle/clareza, nunca ansiedade ou caos" — usada aqui como o
  conceito real por trás de "vivo/conceitual/elegante/enigmático" em vez de um conceito novo
  inventado do zero. Isso também descartou de saída duas ideias que teriam violado a proibição
  explícita do documento: um motivo de fundo tipo radar/grid de rede (leria como "HUD militar") e
  qualquer ajuste às curvas de motion já existentes (o documento já confirma `EASE_PREMIUM`/
  `SPRING_SOFT`/`SPRING_SNAPPY` como a física correta, "controlada e precisa, nunca elástica").
- **Mudanças implementadas** (todas tokens/primitivos, nenhuma tela específica tocada):
  - `--font-brand-display` parava de referenciar `"Mont"` (nunca carregada por nenhum `@font-face`
    neste repo — sempre caía silenciosamente pro fallback Montserrat) e passou a declarar
    Montserrat diretamente — corrige a referência morta, zero mudança visual (fallback já era
    sempre Montserrat), alinhado à decisão explícita de `CREATIVE_SYSTEM_01.md`.
  - `Card.tsx` (`default`/`stat`): sombra trocada de `rgba(...)` cru calibrado só pro tema claro
    (praticamente invisível/errado sobre `--surface` escura, o tema padrão real do produto) pro
    token `shadow-card`/novo `shadow-card-hover` (`globals.css`, valores próprios por tema); borda
    de `border-gray-200` (não reage a tema) pra `border-line`. Variante `stat` também trocou
    `from-gray-50 to-white` (quebraria em dark mode) por `from-surface to-surface-2`, mantendo a
    distinção visual dos 3 consumidores reais (KpiTile, Analytics, Billing) sem o bug.
  - `Button.tsx` (`outline`/`secondary`/`ghost`): mesma classe de bug — `border-gray-300`/
    `hover:bg-gray-100`/`hover:bg-gray-200` nunca reagiam a tema, produzindo borda quase invisível
    e hover claro incoerente sobre superfície escura. Trocados por `border-line`/`hover:bg-surface-2`/
    `hover:bg-line`, mesmo idioma já usado pelos itens de navegação da própria `Sidebar.tsx`.
  - `.glass-panel`/`.glass-panel-elevated` (`globals.css`): hairline de topo (`inset 0 1px 0 0
    rgba(255,255,255,...)`, somado à sombra existente, não substituindo) — reforça a leitura de
    "painel de instrumento" pedida pela personalidade "controle/precisão", sem introduzir blur ou
    gradiente novo; imperceptível no tema claro de propósito (não deve competir com conteúdo ali).
- **Decisões explícitas de não-fazer** (registradas aqui pra sessão futura não "redescobrir" e
  reverter por engano): sem Space Grotesk/segunda família tipográfica; sem motivo de fundo
  radar/grid/rede; sem alterar `EASE_PREMIUM`/springs de `src/lib/motion.ts`; sem tocar
  `AtlasOrb.tsx`/`SpaceGame.tsx` (3D decorativo já contido/aceito, fora do escopo pedido); sem
  implementar feedback sonoro de UI (iniciativa Onda 38, `.agents/handoffs/onda-38/
  00-para-02-03-redesign-plataforma.md`, explicitamente congelada pelo freeze de escopo — não
  reaberta aqui); sem tocar `--bg`/`--surface`/`--ink` (hex base) — mudar luminância de base
  invalidaria toda a matemática de contraste WCAG AA já corrigida em pilotos anteriores
  (`--critical`, `--color-brand-active`, `--ok-active` etc.), risco desproporcional ao pedido.
- **Ambiente sem Docker (mesmo padrão dos Pilotos 003/005)**: `docker.sock` inexistente;
  `postgresql-16-pgvector` instalado via `apt-get`, cluster local + Redis provisionados
  manualmente, `prospectordb_test` criado com `scripts/db/create-app-role.sql`, `prisma migrate
  deploy` real, servidor Express real (`tsx server.ts`) no ar, sessão criada via signup real pelo
  formulário (mesmo caminho de `tests/e2e/helpers.ts::signUp`). `.env.test`/banco/servidor
  removidos ao final da sessão.
- **Validação**: `npx tsc -b --noEmit` (0 erros), `npm run lint` (0 erros/warnings nos 3 arquivos
  tocados — os 2 erros e 156 warnings pré-existentes no restante do projeto continuam idênticos,
  não relacionados a esta mudança), `npx vite build` (limpo; CSS gerado conferido — `shadow-card-
  hover`, `--font-brand-display`, hairline do `.glass-panel` compilam com os valores esperados).
  `tests/e2e/accessibility.spec.ts` completo rodou contra o servidor real: 34/35 passando: a 1
  falha ("Chatbook") é contraste pré-existente num badge `bg-emerald-500/20 text-emerald-500`
  ("Groq IA") não relacionado a `Card`/`Button`/`globals.css` — confirmado pré-existente rodando o
  mesmo teste via `git stash` (falha idêntica antes desta mudança), não investigado por estar fora
  do escopo pedido (reportado, não corrigido). QA visual real via Playwright/Chromium (signup real,
  sem simular sessão): Dashboard e Configurações em light/dark × AtlasGR/Total Trac (4 combinações
  mínimas da `design-system/SKILL.md`) — sombra de `Card` visível e correta nos dois temas, troca
  de marca preserva a nova sombra/borda sem vazamento de cor, hover dos botões `outline`/`secondary`/
  `ghost` renderiza como esperado, nenhum erro de console novo (só o `ERR_CONNECTION_RESET`/SSE já
  documentado no Piloto P3 como comportamento esperado do `/api/notifications/stream`).
- **Escopo deliberadamente não coberto nesta sessão**: nenhuma tela de feature individual
  (dashboard/CRM/analytics/etc.) foi editada diretamente — elas herdam a mudança automaticamente
  por já consumirem `Card`/`Button`/tokens, confirmado nos screenshots acima, mas não foram
  auditadas uma a uma em busca de outros usos de cor não-tokenizada (esse é um escopo de auditoria
  separado, não parte do pedido de "reformular o estilo").

## Onda P3 — Layout/design system (tipografia responsiva, sombra/gradiente por marca, QA mobile, sidebar)

- **Objetivo**: 4 itens do backlog de design system — tokenizar tipografia responsiva, parametrizar
  sombras/gradientes por marca, QA visual mobile das rotas principais, reorganizar a Sidebar por
  jornada.
- **Item 4 (Sidebar por jornada) já estava feito**: `Sidebar.tsx` já agrupa por
  Visão Geral/Captar/Qualificar/Relacionar/Fechar/Analisar/IA & Capacitação/Administração desde o
  commit `2fe5233` ("reagrupa navegação da Sidebar por jornada/persona"), com comentário explícito
  no próprio arquivo. Nenhuma mudança feita — só verificado em navegador real (mobile, off-canvas,
  grupos corretos, sem overflow) para confirmar que continua correto depois dos outros 3 itens.
- **Tipografia**: H1-H3 já eram responsivos (`clamp()`) mas hardcoded direto no seletor de elemento
  em `@layer base` (débito documentado, à época, em `DESIGN_QA_CENTRAL_ATLASGR.md`, "Typography
  68" — arquivo removido do controle de versão em 22/08/2026, ver `docs/REMOVED-DOCS.md`) — sem
  token reutilizável, e H4-H6 não tinham tamanho definido (herdavam o default do navegador).
  Tokenizados em `--text-h1`..`--text-h6` (namespace `--text-*` do Tailwind 4, mesmos valores de
  clamp() de antes pra H1-H3 — zero mudança visual — e H4-H6 novos seguindo a mesma progressão).
  Gera também utilitários `text-h1`..`text-h6` reutilizáveis fora de tags de heading. Não tocado:
  os ~570 usos de `text-[...]` arbitrário espalhados pelo código — trocar cada um por um token da
  escala seria um redesenho não pedido (CLAUDE.md §13), fora do escopo de "tokenizar a fonte da
  verdade".
- **Sombra/glow por marca — bug real encontrado em primitivos do design system**: `Button.tsx`
  (variante `default`, o botão primário usado em toda a aplicação) e `Card.tsx` (variante `accent`)
  tinham `shadow-[...rgba(255,86,24,...)]` hardcoded — a sombra de hover/glow ficava sempre laranja
  (cor da AtlasGR) mesmo com a Total Trac ativa, apesar do fundo/borda já reagirem corretamente à
  marca. Confirmado visualmente (navegador real, os dois brands). Corrigido com 3 tokens novos
  reativos à marca (`--shadow-brand-sm`, `--shadow-glow-brand`, `--shadow-glow-brand-strong`,
  `color-mix(in srgb, var(--brand) N%, transparent)` — mesmo idioma já usado no keyframe
  `pulse-glow`), que geram utilitários `shadow-brand-sm`/`shadow-glow-brand`/
  `shadow-glow-brand-strong`. `.border-glow-orange` (utilitário morto em `globals.css`, 0 usos no
  código, mas com o mesmo problema) migrado pro mesmo token. **Não tocado de propósito**:
  `useBrandAccent.ts.glow` — parece o mesmo bug (`rgba(255,86,24,...)` vs `rgba(0,143,206,...)`
  por marca), mas é curadoria intencional: a Total Trac usa ali a cor de acento (`--brand-2`,
  #008FCE) em vez da primária (`--brand`, #374898 navy) porque o navy fica escuro demais como
  glow. Trocar cegamente por `var(--brand)` teria mudado visualmente o glow da Total Trac (regressão
  real, não fix) — documentado com comentário no próprio hook em vez de "corrigido".
- **QA mobile das rotas principais — suíte oficial não pôde rodar (sem sessão de usuário via
  fixture), mas infraestrutura real foi provisionada nesta sessão**: diferente do Pilot 001 (sem
  Postgres/Redis), Docker não estava disponível aqui (`docker.sock` inexistente, sem daemon), mas
  `postgresql-16`/`redis-server` já vinham instalados no ambiente — `postgresql-16-pgvector`
  instalado via `apt-get` (mesmo pacote do Pilot 003), cluster local iniciado, `prospectordb_test`
  criado e `prisma migrate deploy` rodado de verdade contra Postgres real (não simulado). Servidor
  Express real (`start:e2e`) subiu com sessão de usuário real via signup pelo formulário (mesmo
  caminho de `tests/e2e/helpers.ts::signUp`), não atalho de API. QA real via Playwright/Chromium em
  viewport 390×844 (iPhone-ish): 7 rotas principais (dashboard, CRM, empresas, decisores,
  prospecção, analytics, configurações) × 2 marcas × 2 temas = 28 combinações, nenhuma com overflow
  horizontal; screenshots confirmam botão primário e Sidebar corretos nas duas marcas, tipografia
  H1 responsiva sem quebra em mobile, e o menu off-canvas da Sidebar (item 4) renderizando os grupos
  de jornada corretamente em mobile. Erros de console (`ERR_CONNECTION_RESET`) presentes em toda
  navegação são o `EventSource` de `/api/notifications/stream` sendo interrompido a cada troca de
  rota (já documentado em `tests/e2e/helpers.ts` como comportamento esperado, não novo) — não
  relacionado a esta mudança, não investigado further. Script de investigação (`.tmp-mobile-qa*.mjs`)
  descartado ao final, nunca promovido a teste oficial (protocolo de `visual-qa/SKILL.md`).
  `.env.test`/banco/Redis de teste criados só para esta sessão, removidos ao final.
- **Verificação**: `npm run lint` (0 erros, 99 warnings pré-existentes sem relação com os arquivos
  tocados), `npx tsc -b --noEmit` (0 erros), `npx vite build` (limpo — confirmado no CSS gerado que
  `--text-h1`..`--text-h6` e `--shadow-brand-sm`/`--shadow-glow-brand`/`--shadow-glow-brand-strong`
  compilam com o fallback `@supports (color: color-mix(...))` do Tailwind 4), QA visual real descrita
  acima. Suíte `tests/e2e/*.spec.ts` oficial não rodada nesta sessão (fora do escopo desta rodada,
  não um bloqueio novo).
- **Aprendizado incorporado**: `design-system/SKILL.md` ganhou os tokens novos na tabela de "tokens
  existentes" (sombra por marca + tipografia), pra próxima sessão não redescobrir nem duplicar.

## Pilot 007 — Dashboard (SinglePageDashboard.tsx, piloto flagship da transformação pedida pelo usuário)

- **Objetivo**: primeira etapa de uma transformação ampla em estética/UX/inovação pedida
  explicitamente pelo usuário em todo o produto (30 rotas/módulos). Em vez de redesenhar tudo de
  uma vez, seguido o processo obrigatório da constituição (`CLAUDE.md` seção 12): pilotar uma tela
  por vez, começando pela mais vista no dia a dia (`src/features/dashboard/components/
  SinglePageDashboard.tsx`) e pela que concentrava o maior gap real entre backend e UI. As demais
  telas ficam como roadmap para pilotos futuros (Roleplay, Analytics/Commercial Intelligence,
  Chatbook, Integrations, AI Suite, e os módulos ainda sem piloto).
- **Correção de premissa registrada por escrito (achado de leitura de código, antes de
  implementar)**: o pedido inicial assumia que `GamificationWidget` (o widget "falso", com
  XP/nível/sequência não reais) era renderizado no dashboard. Não é — só existe em
  `src/features/prospecting/components/ProspectingHub.tsx:512`, sem props, e nenhum outro arquivo
  do repositório o importa (confirmado por grep). A tarefa real não foi "substituir gamificação
  fake do dashboard", foi construir gamificação real nova onde não havia nenhuma. O
  `GamificationWidget` do `ProspectingHub.tsx` permanece intocado, fora de escopo desta sessão.
- **Achados de auditoria adicionais (antes de codificar)**:
  - `src/components/ui/LiveStatsWidget.tsx` usava `text-totaltrack-blue` hardcoded e incondicional
    no "Valor no Pipeline" — mostrava sempre azul Total Trac mesmo com AtlasGR ativa, violando a
    regra visual 3 (classe estática de marca fora de tela pré-seleção). Corrigido para `text-brand-2`
    (token dinâmico, já reescrito em runtime por `BrandContext.tsx`).
  - `src/components/ui/ClockCalendarWidget.tsx` tinha `animate-pulse` no ícone de relógio e
    `animate-spin-slow` no ícone de sparkles do rótulo "Fuso Horário Oficial" — loops decorativos
    sem relação com nenhum estado real (regra visual 6). Removidos. O `animate-pulse` do indicador
    de "dia com evento" no calendário foi mantido — esse comunica estado real (há compromisso nesse
    dia), diferente dos dois removidos.
  - `POST /api/intelligence/suite/coaching/report` (`SellerCoachingService`, real, com fallback
    determinístico se o LLM falhar) não tinha nenhum consumidor de UI em todo o repositório
    (confirmado por grep).
  - `GET /api/usage` (custo/latência/modelo de IA, já usado por `Billing.tsx`) está restrito a
    `requireRole(['ADMIN'])` no backend — a vitrine nova no dashboard replica essa mesma restrição
    no frontend (`isAdmin` de `useAuth()`), nunca chamando a rota para quem não é admin.
- **Decisão de gamificação real (nunca fabricada)**: duas camadas.
  1. **Ranking Comercial Real** (`TeamRankingWidget.tsx`, primário, zero backend novo): reaproveita
     `byOwner` já calculado por `GET /api/analytics/dashboard` (sem restrição de role) — a mecânica
     de jogo é o próprio ranking por negócios fechados reais, sem XP/nível/sequência inventados.
  2. **Coaching semanal por IA** (`SellerCoachingCard.tsx` + rota nova `POST /api/gamification/
     coaching/weekly`, complementar, sob demanda): novo `sellerPerformanceAggregator.service.ts`
     calcula `callsMade`/`meetingsScheduled`/`dealsClosed`/`avgTicket`/`conversionRatePercent`/
     `topLossReason` a partir de `Activity`/`Lead` reais via Prisma, escopados a
     `organizationId`+`owner` (nome do vendedor autenticado, resolvido no servidor via
     `prisma.user.findUnique` — nunca aceito do body). Três campos do contrato original de
     `SellerPerformanceData` (`connectionsRatePercent`, `proposalsSent`, `role`) não têm fonte real
     no schema atual (não existe outcome de ligação registrado, tipo de atividade "proposta", nem
     função de vendas em `User.role`, que é RBAC) — tornados **opcionais** em vez de fabricados,
     com o system prompt do `SellerCoachingService` ajustado para nunca presumir um campo ausente.
     `role` vira seletor manual opcional na UI, nunca persistido. Geração é sob demanda (botão),
     não automática a cada carregamento — respeita o orçamento de IA (`src/lib/ai/budget.ts`).
- **Decisão da vitrine de AI Gateway** (`AiGatewayShowcase.tsx`): reaproveita 100% `GET /api/usage`
  (zero rota nova) — custo do mês/período, custo e latência por modelo (`BarChart`) e série diária
  de chamadas (`AreaChart`), paleta reativa à marca (`var(--brand)`/`var(--brand-2)`, divergência
  intencional documentada vs. a paleta hex fixa que `Billing.tsx` usa para o mesmo dado). Renderizado
  só para `isAdmin`. Deliberadamente **sem** um "health score"/gauge de saúde do sistema: não existe
  endpoint que exponha o teto de orçamento configurado da organização nem o estado do circuit
  breaker por provedor — fabricar um semáforo sem esse dado real teria sido verdade cenográfica.
- **Composição**: elemento dominante deixou de ser 4 KPI-tiles idênticos (peso visual nivelado, sem
  hierarquia) e passou a ser uma faixa assimétrica `lg:grid-cols-[3fr_2fr]` — tendência mensal real
  (`GlowChart`, componente já existente, reaproveitado sem duplicação) à esquerda, os mesmos 4 KPIs
  reempilhados como resumo à direita. Feed em tempo real + agenda de hoje passam a ficar lado a
  lado (suporte, não abertura de tela), seguidos do ranking real, do coaching por IA e da vitrine de
  IA (condicional). Nenhuma exceção à regra 2 (hero centralizada) foi necessária — a composição já
  é assimétrica por padrão. Entradas novas usam `staggerContainer`/`staggerItem`/`fadeInUp` de
  `src/lib/motion.ts` (nenhuma variante nova criada).
- **Fora de escopo, registrado, não corrigido aqui**: `GamificationWidget.tsx` fake em
  `ProspectingHub.tsx` continua existindo — sinalizado como tarefa separada, não misturado neste
  diff.
- **Verificação**: `npx tsc --noEmit` (0 erros), `npx eslint` nos arquivos tocados (0 erros/
  warnings novos), `npx vite build` (limpo), `npx vitest run` nos 2 arquivos de teste novos do
  módulo `gamification` (10/10 passando) e no gate `tests/unit/shared/openapiRouteInventory.test.ts`
  (7/7 passando, confirma a rota nova documentada em `docs/openapi.yaml`). **Correção registrada no
  Piloto 009**: esta entrada originalmente afirmava 6 falhas pré-existentes em
  `tests/unit/features/analytics.test.tsx`, "confirmadas" via `git stash` — era um falso negativo
  meu, não um bug do repositório: rodei `vitest` sem `-c vitest.unit.config.ts`, então o servidor
  MSW (`tests/mocks/setup.ts`, que só é registrado nesse config) nunca ligava, e o `fetch` real do
  componente vazava pra rede, batendo num servidor de verdade (nesta sessão, o de outra sessão
  concorrente) e recebendo HTML em vez do JSON mockado — daí o erro "Unexpected token '&lt;'".
  Rodando com o config certo (`npx vitest run -c vitest.unit.config.ts`), a suíte inteira passa
  8/8, sem nenhuma falha. Suíte `tests/e2e/*.spec.ts` (crm.spec.ts, visual.spec.ts): ver nota abaixo.
- **QA visual/e2e — suíte oficial rodou de verdade, diferente do padrão de "ambiente sem Docker"
  dos pilotos anteriores**: Docker estava disponível nesta sessão. Infraestrutura local provisionada
  (`docker compose -f docker-compose.yml -f docker-compose.opensource.yml up -d`), banco
  `prospectordb_test` criado, extensão `vector` instalada como superuser, schema sincronizado via
  `prisma db push --force-reset` (histórico de 80 migrations tinha drift acumulado pré-existente,
  não relacionado a este piloto, que impedia `migrate deploy` — reset explicitamente confirmado pelo
  usuário antes de executar, por ser ação destrutiva e o Prisma CLI ter um gate próprio de consentimento
  para agentes de IA). Servidor Express real (`start:e2e`, webServer do Playwright) subiu contra
  Postgres/Redis reais. Resultado: **24/24 testes e2e passando** — `crm.spec.ts` (8/8, inclui o botão
  "Ver agenda completa" e navegação pós-login pro dashboard), `visual.spec.ts` dashboard light+dark
  (2/2 — a screenshot mudou como esperado pela nova composição; inspecionada visualmente antes de
  `--update-snapshots`, layout correto nas duas resoluções, máscaras de `data-testid` preservadas),
  `accessibility.spec.ts` "Painel Central" via axe-core (1/1, sem violações críticas/sérias),
  `mobile-sweep.spec.ts` em 393×851 (1/1, grid novo colapsa pra 1 coluna sem overflow horizontal),
  `auth.spec.ts`/`contact-company-forms.spec.ts`/`command-palette.spec.ts`/`leads-crud.spec.ts`
  (12/12, confirmando ausência de regressão fora do dashboard). Infraestrutura Docker removida
  (`docker compose down`) ao final da sessão.
- **Aprendizado incorporado**: reforça o padrão já estabelecido no Pilot 006 de que "vitrine de dado
  real subaproveitado" (aqui: coaching por IA e custo de IA já existentes sem UI) é uma fonte de
  inovação genuína mais confiável do que inventar funcionalidade nova do zero — candidato a
  princípio explícito numa futura revisão de `CLAUDE.md`/`frontend-design/SKILL.md` se o padrão se
  repetir nos próximos pilotos do roadmap.

## Pilot 008 — Roleplay (segunda etapa do roadmap do Pilot 007)

- **Objetivo**: segunda tela do roadmap de transformação definido no Pilot 007. Escopo
  deliberadamente restrito a frontend (visual/UX/acessibilidade + uma visualização de dado real já
  computado) — diferente do Pilot 007, nenhuma rota, schema Prisma ou contrato de API muda.
- **Achado de arquitetura registrado (não corrigido, fora de escopo)**: existem dois motores de IA
  paralelos para o roleplay. Só um está de fato ligado à tela real (`POST /api/intelligence/studio`
  kind=`roleplay` → `generateRoleplay()`, schema-validado, sem fallback falso — lança erro em vez de
  inventar resposta, `AGENTS.md` da pasta já proíbe isso). O outro
  (`src/features/roleplay/services/roleplay-ai.service.ts` + rotas `/api/intelligence/suite/roleplay/
  turn|evaluate`) é órfão, só consumido por um painel interno de demonstração (`AISuiteHub.tsx`), não
  pela tela de produção. Unificar os dois é decisão de arquitetura de backend, sinalizada como tarefa
  separada, não misturada neste diff.
- **Correção de bugs reais encontrados durante a auditoria/implementação (regra visual 3/7 —
  token de marca estático em vez de dinâmico)**:
  - `RoleplayHub.tsx`, `CallSetup.tsx`, `ActiveCallView.tsx` tinham o ternário `activeBrand ===
    'totaltrac' ? '...sky...' : '...orange/atlas...'` repetido em ~10 lugares — substituído por
    classes de token dinâmico (`text-brand`, `border-brand`, `bg-brand-active`, `bg-brand/10`
    etc.), que já reagem à marca via `--brand`/`--brand-2` reescritos em runtime por
    `BrandContext.tsx`. Blur ambiente de `RoleplayHub.tsx` (antes `orange-400`/`blue-400` fixos,
    sempre essas duas cores independente da marca) agora usa `bg-brand/10`/`bg-brand-2/10`.
  - `ActiveCallView.tsx`: dentro do painel sempre-escuro (ver exceção abaixo), usa
    `isAtlas ? 'text-brand' : 'text-brand-2'` para os realces de marca (glow, avatar do bot) —
    mesma técnica já usada em `GlowChart.tsx`/`useBrandAccent.ts` para o mesmo problema real
    (o navy da Total Trac, `--brand`, fica pouco visível como glow sobre fundo quase preto; o ciano
    de acento, `--brand-2`, resolve).
  - `CallAnalysisReport.tsx`: blocos "O que funcionou"/"Dicas para a próxima ligação" usavam paleta
    clara fixa (`emerald-50`/`rose-50` com texto `emerald-900`/`rose-900`, sem variante `dark:`) —
    quebrava visualmente no tema escuro (padrão do produto). Trocados pelos tokens de status já
    usados em `Badge.tsx`/`LiveStatsWidget.tsx` (`bg-success/10`/`bg-danger/10`,
    `text-success-active dark:text-success`/`text-danger-active dark:text-danger`). O mesmo bloco
    de gravação de áudio tinha `bg-white/50` (mesmo defeito, achado só durante a implementação, não
    na auditoria inicial) — trocado por `bg-surface-2`.
  - Nota numérica (`scoreColor()`, gradiente `emerald→amber→rose` via `bg-clip-text`) virou cor
    sólida semântica (`text-success`/`text-warning`/`text-danger`, sem gradiente) — a cor aqui é o
    sinal da nota, não decoração; gradiente escondia essa leitura.
- **Acessibilidade real corrigida (seção 10 da constituição)**:
  - `CallSetup.tsx`: cards de persona eram `<motion.div onClick>` sem `role`/teclado —
    inacessíveis via Tab/Enter/leitor de tela. Viraram `<motion.button type="button"
    aria-pressed={...}>` reais, mantendo hover/tap do Framer Motion.
  - `ActiveCallView.tsx`: os 3 botões-ícone (microfone, enviar, encerrar) só tinham `title` —
    ganharam `aria-label` explícito e dinâmico (mic alterna "Ativar microfone"/"Desativar
    microfone" conforme o estado).
  - `ActiveCallView.tsx`: as duas animações `repeat: Infinity` do indicador de "bot falando" não
    respeitavam `prefers-reduced-motion` — ganharam guarda via `useReducedMotion()` (mesmo padrão
    de `src/lib/motion.ts`), ficam estáticas (ainda visíveis) quando o usuário prefere menos
    movimento.
- **Exceção justificada documentada (seção 5)**: `ActiveCallView.tsx` permanece sempre escuro
  (`bg-slate-950`, trocado do hex cru `#0b0f19` — mesmo efeito, valor rastreável) independente do
  tema claro/escuro do resto do app. Critério: objetivo da tela (simular uma ligação/videochamada
  real, foco total, sem distração) — convenção real de UI de chamada, não preferência estética
  isolada.
- **Inovação real (mesmo padrão do Pilot 007 — vitrine de dado já computado, não inventado)**:
  `RoleplayHub.tsx` já mantinha `turnEvaluations` (clarity/objectionHandling/total por turno, vindos
  do backend real) só usado pra calcular 3 frases de média no relatório final. Agora
  `CallAnalysisReport.tsx` recebe `turnEvaluations` como prop e renderiza um `LineChart` (recharts)
  com a evolução real de clareza e tratamento de objeções turno a turno — zero chamada de API nova,
  zero persistência nova, só um estado que já existia um nível acima na árvore de componentes sendo
  finalmente mostrado. Só renderiza se houver pelo menos 1 turno avaliado.
- **Preservado (seção 6)**: reconhecimento de voz, síntese de voz, gravação real de áudio
  (`MediaRecorder`) e reprodução, transcript com timestamps, contrato exato de
  `/api/intelligence/studio`, texto de todos os personas/dificuldades.
- **Fora de escopo, registrado, não corrigido aqui**: unificação dos dois motores de IA (ver acima);
  persistência de sessões de roleplay no Prisma (hoje 100% em memória, perdido ao recarregar);
  catálogo de personas vindo do backend em vez de hardcoded no frontend.
- **Verificação**: `npx tsc --noEmit` (0 erros), `npx eslint` nos 4 arquivos tocados (0 erros, 1
  warning pré-existente — `jsx-a11y/media-has-caption` no `<audio>`, já rebaixado a warn em
  `eslint.config.mjs`, não introduzido nesta sessão), `npx vite build` (limpo).
  `accessibility.spec.ts -g "Roleplay"` e `mobile-sweep.spec.ts` reais, ambos 1/1 passando.
  **Achado de ambiente real durante a execução** (não um bug desta mudança): o banco de teste
  `prospectordb_test` sobreviveu ao `docker compose down` do Pilot 007 (volume nomeado não removido
  por `down` sem `-v`) e já estava com schema sincronizado ao reprovisionar Postgres/Redis. A
  primeira tentativa de rodar `accessibility.spec.ts -g "Roleplay"` falhou consistentemente
  (2 tentativas) porque a porta 3000 já tinha um processo `LISTENING` de **outra sessão concorrente
  ativa neste mesmo repositório** (evidenciada por 4 commits novos aparecendo em `git log` durante
  esta sessão — `4ff7f274`, `b73b31b5`, `18dd900b`, `696c1653` — nenhum deles tocando
  `LoginScreen.tsx`) — `reuseExistingServer: !process.env.CI` do Playwright reaproveitou esse
  servidor alheio, servindo uma versão de UI de login diferente da do repositório atual
  ("Torre de controle"/"Criar conta", texto que não existe em `LoginScreen.tsx`). Resolvido rodando
  com `PORT=3001` (porta isolada, livre), sem tocar no processo da outra sessão. Por essa mesma
  razão, a infraestrutura Docker **não foi desligada** ao final desta sessão (diferente do Pilot
  007) — a outra sessão pode depender do mesmo Postgres/Redis compartilhado.
- **Aprendizado incorporado**: segunda confirmação (após o Pilot 007) de que o padrão "vitrine de
  dado real subaproveitado" se repete — vale registrar como princípio explícito numa futura revisão
  de `frontend-design/SKILL.md`: antes de propor uma feature nova, perguntar se o backend já calcula
  algo parecido que só falta aparecer na tela. Também confirma que o par `isAtlas ? --brand :
  --brand-2` (já usado em `GlowChart.tsx`/`useBrandAccent.ts`) é o padrão correto sempre que um
  elemento precisa de contraste/glow sobre um fundo intencionalmente escuro — vale documentar isso
  em `design-system/SKILL.md` para não ser redescoberto a cada piloto.

## Pilot 009 — Analytics / Commercial Intelligence (quarta etapa do roadmap)

- **Objetivo**: quarto item do roadmap do Pilot 007 — Analytics (`/app/analytics`, `/app/winloss`)
  e Commercial Intelligence Hub (`/app/commercial_intelligence`, ADMIN/GESTOR).
- **Correção de premissa registrada por escrito**: a alegação original do roadmap ("numérico-pesado
  com poucos gráficos reais") estava parcialmente desatualizada. `Analytics.tsx` já tinha 6 gráficos
  recharts reais com tabela-gêmea acessível (`ChartCard`/`TableTwin`) e paleta validada por script
  de contraste (`shared/constants/chartPalette.ts`). O Commercial Intelligence Hub (já piloto no
  Pilot 003) não tinha "ícone de gráfico fingindo ser gráfico" — são `KpiTile`/tabelas honestas;
  `recharts` não era usado nesse módulo. O trabalho real deste piloto foi mais estreito e mais
  cirúrgico do que o roadmap sugeria.
- **Achados reais (auditoria por 3 agentes + leitura direta dos arquivos)**:
  - `DashboardExtensions.tsx` (`HeatmapWidget`, `AgentPerformanceWidget`) usava hex cru
    (`rgba(57,135,229,...)`, `#3987e5`, `#199e70`) que coincidia exatamente com `SINGLE`/`SERIES` já
    validados por script de contraste em `chartPalette.ts`/`Analytics.tsx` — duplicação não
    intencional, não uma cor nova.
  - `HeatmapWidget` codificava intensidade só por cor, com `title` como única pista textual (não
    confiável para leitor de tela) — sem alternativa equivalente à `TableTwin` que o resto do
    arquivo já usa.
  - `activitiesByStatus` (`AnalyticsDashboard`) era buscado pela API e nunca renderizado em
    `Analytics.tsx` — mesmo padrão de dado real subaproveitado dos Pilotos 007/008.
  - `WinLossAnalysis.tsx` era 100% prosa de IA — zero número real visível antes (ou sem nunca) rodar
    a análise cara.
  - `ExecutiveOverviewTab.tsx`: `trends.points` (série real de até 6 meses de win rate) já era
    buscado e usado só pra calcular o selo "Win Rate melhorando/piorando" em `ForecastRangeCard.tsx`
    — nunca visualizado como série.
- **Decisões**:
  - Novo export `SERIES` em `chartPalette.ts` (movido do const local de `Analytics.tsx`, mesmos
    valores validados) — `Analytics.tsx` e `DashboardExtensions.tsx` agora importam da mesma fonte
    em vez de duplicar hex.
  - `HeatmapWidget` passou a ser envolvido por `ChartCard` (ganhou `className` opcional para
    suportar `lg:col-span-2`) com tabela-gêmea real (dia/hora/ligações, só células com `count > 0`)
    — mesmo padrão de acessibilidade que os outros 6 gráficos já usavam, sem inventar um novo. O
    grid do heatmap virou `role="img"` com `aria-label` — a tabela é a fonte de verdade acessível.
  - Novo `ChartCard` "Atividades por status" em `Analytics.tsx`, mesma receita de "Atividades por
    tipo"/"Temperatura dos leads" (uma medida, uma cor).
  - `WinLossAnalysis.tsx` ganhou um fetch de `analyticsApi.dashboard(3)` (mesma API já usada por
    `Analytics.tsx`, zero rota nova) alimentando 3 `Card variant="stat"` (ganhos no mês, perdidos no
    mês, principal motivo de perda) — sempre visíveis, mesmo antes/sem nunca rodar a IA.
  - Novo `TrendChartCard.tsx` (Commercial Intelligence Hub) — `LineChart` de Win Rate sobre
    `trends.points`, renderizado em `ExecutiveOverviewTab.tsx` logo após `ForecastRangeCard` (que já
    recebe `trends`, zero fetch novo). Filtra pontos com `winRate` nulo em vez de interpolar/
    fabricar; só renderiza com ≥2 pontos reais (1 ponto não é evolução). Estilizado com
    `chartPalette.ts` (mesma linguagem visual "de dado sério" de `Analytics.tsx`), deliberadamente
    diferente do estilo "glow" de `GlowChart.tsx` — decisão documentada: este é um cockpit executivo
    denso, não uma tela de vitrine como Dashboard/Roleplay.
- **Fora de escopo, registrado, não corrigido aqui**: nenhum — este piloto não encontrou um item
  claramente fora de escopo do tamanho dos anteriores (GamificationWidget fake, motor de IA órfão).
- **Achado de processo importante (não sobre o código, sobre como eu mesmo verifiquei)**: a primeira
  rodada de `npx vitest run tests/unit/features/analytics.test.tsx` mostrou 6 testes falhando com
  "Unexpected token '&lt;'" — quase registrei isso como debt pré-existente (mesmo erro que já
  aparecia assim registrado na entrada do Pilot 007). Investigando a pedido do usuário, a causa real
  era um erro meu de invocação: faltava `-c vitest.unit.config.ts`, o config que registra o setup do
  MSW (`tests/mocks/setup.ts`, `server.listen()`); sem ele, o `fetch` real do componente vazava pra
  rede e batia num servidor de verdade rodando na porta padrão (nesta sessão, o de outra sessão
  concorrente), recebendo HTML em vez do JSON mockado. **A entrada do Pilot 007 foi corrigida** para
  não deixar esse falso achado registrado como debt real. Rodando com o config certo, a suíte inteira
  sempre passou. Lição: neste repo, `npx vitest run <path>` sem `-c` usa o config errado para testes
  de componente que fazem fetch — sempre `-c vitest.unit.config.ts` para `tests/unit/**`.
- **Verificação**: `npx tsc --noEmit` (0 erros), `npx eslint` nos arquivos tocados (0 erros),
  `npx vite build` (limpo). `npx vitest run -c vitest.unit.config.ts` nos arquivos relevantes —
  **30/30 passando** (incluindo os 4 testes novos de `TrendChartCard.test.tsx`, que por sua vez
  revelou um bug real no próprio teste: faltava `afterEach(cleanup)` — sem `globals: true` neste
  config, o React Testing Library não limpa sozinho entre casos — e o teste usava matchers do
  `jest-dom` (`toBeInTheDocument`), que só é registrado no outro config; corrigido pros matchers
  nativos que `analytics.test.tsx` já usa). E2E reais (infra Docker desta sessão, porta isolada 3010
  porque 3000/3001 já estavam ocupadas por processos concorrentes): `accessibility.spec.ts`
  Analytics/Ganhos-Perdas/Comercial Inteligente (3/3), `commercial-intelligence-rbac.spec.ts` (4/4),
  `mobile-sweep.spec.ts` (1/1) — **8/8 passando**. Infraestrutura Docker mantida ligada (mesma razão
  do Pilot 008 — outra sessão concorrente pode depender dela).
- **Aprendizado incorporado**: reforça pela terceira vez (Pilots 007/008/009) que "vitrine de dado
  real subaproveitado" é a fonte de inovação mais confiável neste produto — candidato definitivo a
  princípio explícito em `frontend-design/SKILL.md`. E o achado de processo acima (config certo do
  Vitest) deveria virar uma nota em `visual-qa/SKILL.md` ou similar, para a próxima sessão não
  repetir o mesmo diagnóstico errado.

## Pilot 010 — Chatbook (sexta etapa do roadmap)

- **Objetivo**: sexto item do roadmap do Pilot 007 — o copiloto conversacional, em duas superfícies
  que compartilham o mesmo estado (`useAssistantChat`): a página cheia `/app/chatbook`
  (`ChatbookHub.tsx`) e o drawer flutuante global (`FloatingChatbook.tsx`/`AtlasChatbotTrigger.tsx`).
- **Contradição resolvida por leitura direta antes de codificar**: dois agentes de auditoria
  discordaram sobre o badge "Groq IA" (contraste ruim vs. já corrigido). Confirmado por grep direto:
  **já estava corrigido** (`bg-success/15 text-success-active dark:text-success`, commit `40b3fb2f`)
  em ambos os arquivos — não é achado deste piloto, e o relato desatualizado foi descartado sem
  reabrir a investigação.
- **Achados reais**:
  - Violação clara da regra visual 3 (gradiente genérico de IA): avatar do copiloto em ambos os
    arquivos usava `from-indigo-500 via-brand to-amber-500` — índigo+âmbar cercando a única cor de
    marca real no meio.
  - Bug real de reatividade de marca: botão de enviar em `ChatbookHub.tsx` tinha `hover:bg-orange-600`
    fixo — hover sempre laranja AtlasGR mesmo com Total Trac ativa.
  - Cor estática repetida sem relação com marca: `bg-indigo-600` (toggle de modo), `text-indigo-400`
    (indicador "Consultando o motor Groq..."), blur ambiente `bg-orange-400/10`/`bg-blue-400/10` fixo
    em `ChatbookHub.tsx` (mesmo bug já corrigido em `RoleplayHub.tsx` no Pilot 008), `text-amber-500`
    no ícone de sparkle do subtítulo.
  - Acessibilidade: os toggles "IA conversacional"/"Base {marca}" e as 3 abas do drawer
    (Assistente IA/Roleplay Simulator/Matrizes & Objeções) não tinham `aria-pressed` — inconsistente
    com o padrão já em `Analytics.tsx`/`CallSetup.tsx` (Pilot 008).
  - **Vitrine de dado real subaproveitada (quarta confirmação do padrão, Pilots 007-010)**:
    `ActiveRecordContext` é real e alimentado por 6 telas de detalhe (`CompanyDetail`, `Account360`,
    `PropostaDetail`, `LeadDetailDrawer`, `ContactForm`, `DealDrillDownDrawer`) via
    `setActiveRecord(...)`. `useAssistantChat` já lia esse registro e o injetava em toda pergunta
    (`localContext`), mencionando-o só uma vez na saudação inicial — que rola pra fora da tela.
- **Decisões**:
  - Avatar → `from-brand to-brand-2` (gradiente de marca puro). Toggles/abas → `bg-brand-active`
    (mesmo token já usado nas 3 abas do próprio drawer e nos botões de período de `Analytics.tsx`).
    Indicador de carregamento → `text-brand`. Blur ambiente e hover do botão de enviar em
    `ChatbookHub.tsx` → tokens dinâmicos de marca.
  - `useAssistantChat.ts` passou a **retornar** `activeRecord` (já lido internamente via
    `useActiveRecord()`, só faltava expor). Ambos os componentes renderizam um chip persistente
    ("Contexto: {label}", ícone `Link2`, tokens `bg-brand/10 border-brand/20 text-brand`) sempre que
    há um registro ativo — visível durante toda a conversa, não só na saudação. Zero fetch novo, zero
    mudança de contrato.
  - `aria-pressed` adicionado aos 2 toggles de modo em cada arquivo e às 3 abas do drawer.
- **Fora de escopo, documentado**: a aba "Roleplay Simulator" do drawer usa âmbar/verde
  extensivamente (aviso, seleção de persona, badge "Simulação Ativa") — não é uma cor fingindo
  representar a marca, é acento de status/aviso, e a aba já redireciona para o módulo dedicado
  `/app/roleplay` (Pilot 008) para o fluxo completo. Não tocado para não espalhar o escopo deste
  piloto sobre uma tela já pilotada. `meeting-synthesis.service.ts` (real, funcional) permanece
  desconectado do Chatbook, servindo só o `AISuiteHub.tsx` — não é um gap deste módulo. RAG
  (`hybridSearch`, `src/features/knowledge`) permanece não-conectado ao copiloto — conectá-lo mudaria
  a lógica do backend (prompt/tool-calling), fora do escopo de um piloto de UI.
- **Preservado**: streaming SSE, persistência real (`AssistantMessage`), `ActiveRecordContext`,
  matching de objeção/qualificação, todo texto e comportamento existentes.
- **Verificação**: `npx tsc --noEmit` (0 erros), `npx eslint` nos 3 arquivos tocados (0 erros),
  `npx vite build` (limpo). Nenhum teste unitário toca estes arquivos (confirmado por grep). E2E
  reais (infra Docker desta sessão, porta isolada 3013 — 3000 ocupada por sessão concorrente):
  `accessibility.spec.ts -g "Chatbook"` (1/1, sem violações críticas/sérias) e `mobile-sweep.spec.ts`
  (1/1). Infraestrutura Docker mantida ligada (mesma razão dos Pilots 008/009).
- **Aprendizado incorporado**: quarta confirmação seguida (Pilots 007-010) do padrão "vitrine de
  dado real subaproveitado" — agora definitivamente um princípio a formalizar em
  `frontend-design/SKILL.md`: antes de desenhar uma feature nova, perguntar que estado/contexto já
  real e já lido no código nunca ganhou uma representação visual persistente.

## Pilot 011 — Integrations (oitava etapa do roadmap)

- **Objetivo**: oitavo item do roadmap do Pilot 007 — `/app/integrations` (5 abas: WhatsApp, Google
  Workspace, Bitrix24, PABX 3CX, Webhooks & Monitor) + `WebhookMonitor.tsx`.
- **Correção de premissa registrada por escrito**: a alegação original do roadmap ("automação real,
  UI básica") estava só parcialmente certa. Este módulo já tem um padrão deliberado de "integrações
  honestas" (`CapabilityBadge`/`IntegrationTruthBox`, Onda 3) que rotula cada capacidade como
  `connected/read/write/stub/error/pending` em vez de fingir que tudo funciona, e
  `WebhookMonitor.tsx` já teve um bug real de dado fabricado corrigido antes (4 eventos inventados,
  comentário no próprio arquivo documenta o achado da Onda 1). Escopo calibrado por
  proporcionalidade: não retokenizadas as ~890 linhas do arquivo inteiro (usa `bg-white
  dark:bg-white/5` pareado corretamente — funciona nos dois temas, é debt de consistência, não bug
  visível; mexer nisso tudo seria desproporcional a um piloto).
- **Achados reais**:
  - Barra de navegação das 5 abas usava `bg-orange-50 text-orange-700` (ativo)/`text-gray-600
    hover:bg-gray-50` (inativo) **sem nenhuma variante `dark:`** — quebrava de verdade no tema
    escuro (diferente do resto do arquivo, que pareia corretamente). Laranja fixo como "ativo"
    também é a mesma classe de bug já corrigida nos Pilots 008/009/010 (UI do próprio produto
    deveria reagir a `--brand`, não ser uma cor de marca de terceiro).
  - Indicadores de status conectado/desconectado (WhatsApp, Google, seletor Bitrix) usavam
    `bg-green-500`/`bg-red-500`/`bg-yellow-500` crus em vez dos tokens semânticos
    `success`/`danger`/`warning` já usados em todo o resto do produto.
  - Linha de conexão Bitrix selecionável era um `<div onClick>` sem `role`/teclado — mesma classe de
    bug já corrigida em `CallSetup.tsx` (Pilot 008).
  - `WebhookMonitor.tsx`: campo de busca sem `aria-label` (só placeholder); modal de inspeção era
    HTML bruto (`<div className="fixed inset-0...">`) reimplementando foco/backdrop/Escape que o
    primitivo `Dialog` (`src/components/ui/Dialog.tsx`, `<dialog>` nativo) já resolve.
  - **Vitrine de dado real subaproveitada (quinta confirmação do padrão, Pilots 007-011)**:
    `BitrixConnection.lastImportedAt` é real, já **lido** por
    `PrismaCommercialIntelligenceRepository` (métrica "última sincronização" do Comercial
    Inteligente) e já **escrito** desde a Onda 41, mas `listBitrixConnections` — a query que
    alimenta a própria tela de Integrações — não o selecionava. A tela nunca mostrava quando cada
    portal sincronizou pela última vez, apesar do dado já existir.
- **Decisões**:
  - Nav de abas → `bg-brand/10 text-brand` (ativo) / `text-ink-2 hover:bg-surface-2` (inativo).
    Status dots → `bg-success`/`bg-danger`/`bg-warning animate-pulse`.
  - Linha de conexão Bitrix: `<div onClick>` → `<button type="button" aria-pressed>` real. Como já
    havia um botão "Desconectar" aninhado dentro do div original, a conversão preservou os dois como
    **irmãos** (não filho-de-botão) — um botão pra seleção envolvendo label+domínio+última
    sincronização, outro separado pra desconectar.
  - `BitrixConnectionSummary` (interface, backend em `connections.ts` e a cópia duplicada em
    `useBitrixIntegration.ts`) ganhou `lastImportedAt`; os dois `select` de
    `listBitrixConnections` (inicial + pós-autoconnect) e o `.map()` final passaram a incluí-lo.
    Renderizado como "Última sincronização: {data}" / "Nunca sincronizado" na linha de conexão.
  - `WebhookMonitor.tsx`: campo de busca ganhou `aria-label`; modal reescrito com `<Dialog isOpen
    onClose title maxWidth="max-w-xl">` — resolveu o gap de acessibilidade e reduziu código
    duplicado de graça.
- **Fora de escopo, documentado**: WhatsApp/Google/3CX não têm métricas agregadas além de um
  booleano de conexão (confirmado por auditoria de backend) — nada inventado para essas três.
  `ThreeCXCallEvent` existe no banco (webhook grava de verdade) mas nenhuma rota GET o expõe hoje —
  exigiria rota nova, não incluído. Birth Voice, Email e Signature não têm NENHUMA UI hoje (só
  webhooks/backend) — construir 3 painéis novos do zero é projeto de feature, não redesenho visual;
  sinalizado como item de roadmap separado.
- **Preservado**: textos exatos de `tests/unit/features/integrations/components/Integrations.test.tsx`
  (frases de "integração honesta"), `IntegrationStatusBadge.tsx`, `BitrixExtractionPanel.tsx`,
  `BitrixImportPanel.tsx`, `BitrixSyncRulesPanel.tsx`, `WhatsAppWebPanel.tsx`/`WhatsAppChatPanel.tsx`
  intocados (já bons, confirmado pela auditoria).
- **Verificação**: `npx tsc --noEmit` (0 erros), `npx eslint` nos 4 arquivos tocados (0 erros),
  `npx vite build` (limpo). `npx vitest run -c vitest.unit.config.ts tests/unit/features/integrations`
  — **117/117 passando** (12 arquivos, inclui as 6 asserções de copy de `Integrations.test.tsx`,
  nenhuma tocada). E2E reais (infra Docker desta sessão, porta isolada 3020 — 3000 ocupada):
  `accessibility.spec.ts -g "Bitrix|Integrações"` (2/2) e `mobile-sweep.spec.ts` (1/1).
- **Aprendizado incorporado**: quinta confirmação seguida (Pilots 007-011) do padrão "vitrine de
  dado real subaproveitado" — desta vez um caso interessante de dado que já atravessa dois módulos
  (`lastImportedAt` já era consumido pelo Comercial Inteligente) mas nunca chegou na tela mais óbvia
  para ele. Vale, numa auditoria futura, checar se um campo já lido em OUTRO lugar do produto não
  está faltando na tela "dona" do próprio dado.

## Pilot 012 — AI Suite (nona etapa do roadmap)

- **Objetivo**: nono item do roadmap do Pilot 007 — `/app/intelligence` (`IntelligenceHub.tsx`,
  11 abas: AI Suite, Swarm Dashboard, Metodologias, Config de IA, Superagent Creator, Gerador de
  Scripts, Automation Guide, Ações Pendentes, B2B Generator, Ferramentas, RAG).
- **Correção de premissa registrada por escrito**: a alegação do roadmap ("boa UI, densa/
  utilitária") só se confirmou em parte — a maioria das telas já usa dado real e tokens
  corretamente (`SwarmDashboard.tsx` é o padrão-ouro do módulo, comentário no próprio código:
  "nunca número fabricado"). O achado real deste piloto foi outro, maior: um harness inteiro de
  avaliação de qualidade dos agentes — 9 dimensões (`GET /api/agent/evaluation-metrics`), 6 com
  dado real de produção (custo, latência, override humano, taxa de fallback, corretude de
  ferramenta, taxa de vazamento de PII) e 3 honestamente reportadas como indisponíveis
  (factualidade, aderência ao playbook, alucinação — exigem o Golden Dataset como referência,
  `AI-005`), mais o próprio resumo do Golden Dataset versionado
  (`GET /api/agent/golden-dataset/summary`) — **nenhum dos dois endpoints tinha qualquer
  consumidor de frontend** (confirmado por grep, zero `.tsx` referenciava qualquer um deles).
  Sexta confirmação do padrão "vitrine de dado real subaproveitado" (Pilots 007-012), e a mais
  substancial até agora: um sistema inteiro de avaliação de qualidade, real e testado, invisível
  para qualquer usuário.
- **Achados secundários reais**:
  - `AISuiteHub.tsx`: lista de 20 capacidades era `<div onClick>` sem teclado — mesma classe de
    bug já corrigida em `CallSetup.tsx` (Pilot 008) e na linha de conexão Bitrix (Pilot 011). Badge
    de status "Ready", ícone de sparkle, feedback de cópia e painel de erro usavam
    `emerald-500`/`amber-500`/`red-500` crus em vez dos tokens semânticos já usados no resto do
    produto.
  - `SwarmDashboard.tsx`: só faltava `aria-label` no botão de cancelar missão (já tinha `title`).
- **Decisões**:
  - Novo `AgentQualityPanel.tsx` — busca os 2 endpoints já existentes (zero rota nova), renderiza as
    6 dimensões disponíveis como tiles reais (com a nota de cobertura/proxy do backend visível, não
    escondida) e as 3 indisponíveis explicitamente como "Indisponível — {motivo real}", nunca
    escondidas ou fabricadas com um número — mesmo princípio de honestidade de
    `IntegrationTruthBox` (Pilot 011). Segunda seção resume o Golden Dataset (versão, total de
    casos, contagem por categoria, validação real de casos de uso de ferramenta contra o schema).
    Nova aba "Qualidade do Enxame" em `IntelligenceHub.tsx` → `TOOL_TABS`, mesmo padrão das outras
    11. Sem restrição de papel no frontend — os 2 endpoints não têm `requireRole` no backend além de
    tenant, então nenhuma restrição foi inventada.
  - `AISuiteHub.tsx`: `<div onClick>` → `<button type="button" aria-pressed>`; cores de status →
    tokens `success`/`brand`/`danger` (mantido o `animate-pulse` do badge "Ready" — comunica sistema
    ativo, real, não decorativo).
  - `SwarmDashboard.tsx`: `aria-label="Cancelar missão"` adicionado ao botão que já tinha `title`.
- **Fora de escopo, documentado (achados de arquitetura, não corrigidos)**:
  - `PromptStudio.tsx` — órfão, sem rota, não importado em lugar nenhum navegável (confirmado por
    `tabMeta.ts`). Reestilizar uma tela inalcançável não teria nenhum efeito real.
  - `AiToolBuilder.tsx` — órfão (zero importadores) e 100% cenográfico: "criar ferramenta" só
    empurra num array `useState` local, nunca persiste. Mesma classe do `GamificationWidget` fake
    (Pilot 007) — candidato a task separada, não misturado aqui.
  - Painel de resultado sempre-escuro do `SuperagentCreator.tsx` — exceção justificada (seção 5):
    convenção de terminal/saída de código, mesmo raciocínio do painel sempre-escuro de
    `ActiveCallView.tsx` (Pilot 008).
  - Cores fixas por papel de agente (`SLO_ROLE_COLOR`) em `SwarmDashboard.tsx` — identidade visual
    distinta por agente, não uma tentativa de representar a marca; mesma categoria de decisão já
    tomada para Bitrix/3CX (Pilot 011).
  - Retokenização mais ampla de `AIPendingActions.tsx` (indigo/âmbar/azul/esmeralda, todos já
    pareados com `dark:` corretamente) — debt de consistência, não bug visível; desproporcional a
    este piloto.
  - Métrica de custo/latência por agente individual — `AILog` não tem coluna `agentRole`, gap já
    documentado no próprio código-fonte do serviço; não inventado aqui.
- **Preservado**: nenhum texto/contrato de `ReportsHub.test.tsx`, `agent.routes.slo.test.ts` ou
  `aiPendingAction.service.test.ts` tocado. `AIConfigCenter.tsx` (já token-consistente) intocado.
- **Verificação**: `npx tsc --noEmit` (0 erros), `npx eslint` nos 4 arquivos tocados (0 erros —
  os 2 warnings pré-existentes de `label-has-associated-control` em `AISuiteHub.tsx`, já rebaixados
  a warn, não foram tocados nem aumentados), `npx vite build` (limpo).
  `npx vitest run -c vitest.unit.config.ts tests/unit/features/intelligence` — **88/88 passando**
  (15 arquivos, nenhum backend regredido). E2E reais (infra Docker desta sessão, porta isolada 3030
  — 3000 ocupada por sessão concorrente): `accessibility.spec.ts -g "Central de Inteligência"` (1/1,
  sem violações críticas/sérias) e `mobile-sweep.spec.ts` (1/1, rota `intelligence` já coberta).
- **Aprendizado incorporado**: sexta confirmação seguida (Pilots 007-012) do padrão "vitrine de
  dado real subaproveitado" — desta vez o caso mais substancial: um harness de avaliação inteiro
  (9 dimensões + Golden Dataset), não um único campo ou gráfico. Reforça que vale a pena, ao entrar
  num módulo novo, procurar deliberadamente por rotas GET já existentes e testadas no backend sem
  nenhum `.tsx` que as chame — é o sinal mais confiável encontrado até agora deste padrão.

## Pilot 013 — Contacts (primeiro módulo sem piloto documentado)

- **Objetivo**: primeiro dos módulos "ainda sem piloto" do roadmap do Pilot 007 — `/app/contacts`
  (nav "Decisores").
- **O achado principal**: `ContactDetail.tsx` era um stub morto (`return <div />`), nunca importado
  por nenhuma rota — já documentado como intencional em `PRODUCT_EXPERIENCE_CENTRAL_ATLASGR.md`
  ("Contatos usa formulário modal, não tela de detalhe"). Mas `GET /api/contacts/:id` **já existia
  e já devolvia** `{...contact, company: CompanyCompleta, leads: Lead[]}`
  (`PrismaContactRepository`/`ContactController`), inclusive `contactsDB.get(id)` já existia em
  `src/lib/db.ts`. Sétima confirmação do padrão "vitrine de dado real subaproveitado"
  (Pilots 007-013) — e a primeira vez que o dado subaproveitado é uma tela inteira, não um campo ou
  gráfico. Zero rota nova precisou ser criada.
- **Achado secundário de tipagem**: a interface `Contact` compartilhada (`src/types/index.ts`) não
  declarava `leads`/`aiProcessingConsent`, embora ambos já fossem reais no schema e no contrato de
  API de detalhe — mesma classe de achado do `lastImportedAt` no Pilot 011 (dado real que atravessa
  camadas mas falta no tipo/tela certa). Corrigido como campos opcionais (só vêm no detalhe, não na
  listagem).
- **Achados reais em `ContactList.tsx`**:
  - Botão "Novo Contato": `from-brand to-amber-500` — âmbar fixo misturado com token dinâmico de
    marca (mesma classe de bug de Chatbook/Roleplay).
  - Hover de linha: `hover:bg-orange-50/30` — sem variante `dark:`, quebrava no tema escuro.
  - Avatar (inicial do nome): gradiente indigo/purple sem relação com marca ou design system.
  - Botão "enriquecer": `bg-orange-50 text-brand` — mistura estática+dinâmica.
  - Botões editar/excluir: `blue-50`/`red-50` crus em vez de tokens `info`/`danger`.
  - LinkedIn era texto, nunca um link real, ao lado do WhatsApp que já era.
  - Campo de busca e botões de ação sem `aria-label` (só `title`).
- **Decisões**:
  - Todos os itens acima corrigidos com tokens dinâmicos/semânticos, mesmo padrão já estabelecido
    nos 6 pilotos anteriores.
  - `ContactDetail.tsx` reconstruído como gaveta real usando o primitivo `Drawer` já existente
    (foco/Escape/backdrop resolvidos ali) em vez do padrão bespoke maior de `LeadDetailDrawer.tsx`.
    Busca `contactsDB.get(id)` (zero rota nova) e mostra: campos hoje invisíveis em qualquer lugar
    (departamento, data de nascimento, origem, status do e-mail, observações), consentimento de
    IA/LGPD (`aiProcessingConsent`, nunca mostrado em nenhuma tela antes), resumo da empresa
    vinculada, e lista real de negócios vinculados (`leads[]`) — hoje não havia NENHUMA forma de ver
    que negócios um contato tem. Registra `ActiveRecord` enquanto aberta, mesmo padrão das outras 6
    telas que já fazem isso (o copiloto do Pilot 010 já lê esse contexto).
  - Nova ação "Ver detalhes" (ícone `Eye`) na linha da tabela abre a gaveta.
- **Fora de escopo, documentado**: `DecisionMaker`/`whatsAppMessages` não vêm na query de detalhe
  atual (exigiriam join novo) — não adicionados, a gaveta já tem conteúdo real substancial sem
  isso. Exclusão "dura" de contato (`PrismaContactRepository.delete` faz `prisma.contact.delete`
  real, ignorando as colunas de soft-delete que o schema já tem) — achado real, mas é decisão de
  integridade de dado/LGPD, não tarefa de UI; sinalizado, não corrigido aqui. `companyId`/`status`
  ignorados silenciosamente por `ContactController.getContacts` — sem sintoma hoje porque
  `ContactList.tsx` nunca envia esses parâmetros (não existe filtro de empresa/status na UI).
  `SENIORITY_COLORS` mantida — codificação categórica legítima, mesma categoria de decisão de
  Bitrix/3CX (Pilot 011) e per-agente (Pilot 012).
- **Bloqueio real de ambiente, registrado com transparência (protocolo de `visual-qa/SKILL.md`)**:
  outra sessão está no meio de uma remoção grande da integração Bitrix (todo
  `src/features/integrations/bitrix/*` deletado, referências ainda pendentes em ~15 arquivos não
  relacionados a Contacts). Isso deixa o projeto inteiro num estado transitório quebrado: `npx tsc
  --noEmit` mostra ~20 erros, todos em módulos bitrix/mesa-tratamento/prospecting/crm não tocados
  por este piloto (confirmado por grep — zero menção a `contacts` nos erros); `npx vite build`
  falha ao resolver `bitrix.api` a partir de `CrmBoard.tsx`; o próprio `server.ts` não sobe
  (`ERR_MODULE_NOT_FOUND` em `bitrix.webhook.js`), bloqueando **toda** a suíte e2e, não só a deste
  piloto. Não é um bug deste diff, e não tentei consertar o trabalho em andamento de outra sessão.
  Verificação alternativa executada: `npx eslint` nos 3 arquivos tocados (0 erros) e
  `npx vitest run -c vitest.unit.config.ts tests/unit/features/contacts` (8/8 passando,
  `ContactForm.test.tsx`/`ContactUseCases.test.ts`/`contact.service.test.ts` — nenhum toca os
  arquivos deste piloto diretamente, mas confirma que a mudança de tipo em `Contact` não quebrou
  nada no módulo). **E2E real (`contact-company-forms.spec.ts`) e verificação manual no navegador
  continuam pendentes** — não fingido como feito, registrado aqui como pendente de confirmação
  assim que o ambiente estiver estável.
- **Aprendizado incorporado**: sétima confirmação do padrão "vitrine de dado real subaproveitado",
  a primeira em escala de tela inteira — reforça o princípio já registrado em
  `frontend-design/SKILL.md` (Pilot 010) de procurar por endpoints reais sem consumidor antes de
  propor uma feature nova, agora também aplicável a "existe uma tela morta com o fetch certo do
  lado, só falta o componente real". Também primeiro caso desta série em que o próprio ambiente de
  verificação fica bloqueado por trabalho concorrente de outra sessão — vale manter o hábito de
  checar `git status`/`git log` no início de cada piloto (já parte do processo) e, quando o bloqueio
  for descoberto só na hora de verificar, documentá-lo com a mesma transparência de um bloqueio de
  infraestrutura (Docker/Postgres ausente), não tratá-lo como "quase terminado, deve estar ok".

## Pilot 014 — Companies

- **Objetivo**: segundo módulo do roadmap pós-aprovação do usuário para seguir todos os pilotos
  restantes em sequência, sem pausar para confirmar entre eles.
- **Achado principal — inconsistência entre os dois arquivos do mesmo módulo**: `CompanyList.tsx`
  já tinha passado por uma rodada real de correção de contraste (27 ocorrências de `dark:`,
  comentários citando verificação via axe-core), mas `CompanyDetail.tsx` — o perfil completo da
  empresa, embutido como troca de view dentro da própria `CompanyList` — tinha só 4 ocorrências de
  `dark:` em 425 linhas: `blue-400`/`blue-500`/`blue-600` cru em quase todo ícone informativo
  (CNPJ, localização, segmento, Wrench, Users, ShieldCheck, Radar), `purple-950/40` fixo (sem par
  claro) nas chips de palavra-chave, `amber-950/30` fixo (sem par claro) na caixa de observações da
  IA, badge de status "Ativo" reintroduzindo exatamente o bug de contraste que `CompanyList.tsx` já
  tinha documentado e corrigido (`text-green-400` puro em vez do padrão já auditado
  `text-emerald-700 dark:text-success`), e um gradiente `amber-500 → orange-500 → amber-600` com
  `text-yellow-300` no botão principal de "Enriquecer com IA" sem nenhuma verificação de contraste,
  enquanto o mesmo botão em `CompanyList.tsx` (individual e em massa) já usava um tom âmbar
  auditado (`bg-amber-500/15 text-amber-700 dark:text-amber-400`).
- **`CompanyDetail.tsx` não é stub morto** (diferente do `ContactDetail.tsx` do Piloto 013) — é uma
  tela real de 425 linhas, ativamente renderizada. Ainda assim, confirmou-se a oitava aparição do
  padrão "vitrine de dado real subaproveitado": `company.businessHours.openNow`/
  `weekdayDescriptions` já vinham da API (Google Places), mas só a existência do objeto era checada
  para decidir se o card "Google Meu Negócio" aparecia — o horário de funcionamento em si nunca era
  renderizado. `employeeCount`/`estimatedRevenue` (schema real, já na resposta da API) nunca
  apareciam em nenhuma tela do módulo Companies — só indiretamente, para a empresa de um Lead
  vinculado, em `LeadDetailDrawer.tsx`.
- **Decisões**:
  - Retokenização completa de `CompanyDetail.tsx` para o mesmo sistema já usado em `CompanyList.tsx`:
    ícones informativos → `text-ink/70 dark:text-ink-2` (CNPJ/local/segmento/Users/ShieldCheck),
    avatar/bolha de ícone → `bg-soft border-brand/30 text-brand` / `bg-brand/10 border-brand/20
    text-brand` (mesmo padrão de bolha usado em Contacts), chips de link externo (site/LinkedIn) →
    token `info`, badge "Ativo" → cópia exata do padrão já auditado em `CompanyList.tsx`
    (`bg-success/10 text-emerald-700 dark:text-success`), botão "Enriquecer com IA" → mesma
    combinação âmbar auditada de `CompanyList.tsx` (preserva a categoria "âmbar = ação de IA", já
    estabelecida e testada nesse arquivo vizinho, em vez de inventar um gradiente novo), caixa de
    observações da IA e alerta de "tecnologias não detectadas" → token `warning` (existe em
    `globals.css`, não precisou de token novo), chips de palavra-chave → neutras
    (`bg-surface-2 text-ink-2`, sem cor categórica real associada).
  - `aria-label` adicionado a todos os botões só-ícone sem ele: toggle Cards/Tabela, enriquecer/
    editar/excluir (grid e tabela) em `CompanyList.tsx`, link "Ligar" do contato em
    `CompanyDetail.tsx`.
  - Nova seção de horário de funcionamento (badge "Aberto agora"/"Fechado agora" + lista dos dias
    da semana) dentro do card "Google Meu Negócio", e novos campos "Funcionários (estimado)" e
    "Faturamento estimado" dentro de "Dados Cadastrais" — ambos usando dado já presente na resposta
    de `GET /api/companies/:id`, zero rota nova.
  - Estrelas de avaliação do Google (`amber-400`) mantidas como estão — **exceção justificada**
    (constituição §5): convenção universal de rating em estrelas, independente de identidade de
    marca, mesma categoria já aceita para WhatsApp verde/Bitrix laranja/3CX azul-céu em pilotos
    anteriores.
- **Fora de escopo, documentado**:
  - `confirm()` nativo no `handleDelete` de `CompanyList.tsx` — não é específico deste módulo (usado
    em outros 11 arquivos do app, incluindo o próprio `ContactList.tsx` do Piloto 013); substituir
    por um diálogo de confirmação estilizado exigiria um componente novo compartilhado e tocaria
    muitos arquivos — mais adequado como tarefa própria do que correção pontual aqui.
  - `apolloOrgId`, `stateRegistration`, `zipCode`, `customFields`, `owner`, `twitter`, `facebook` —
    campos reais nunca renderizados, mas sem um lugar de UI óbvio que justifique inventar uma seção
    nova só para exibi-los; `businessHours`/`employeeCount`/`estimatedRevenue` foram os únicos
    escolhidos por terem valor comercial claro e direto (dado que ajuda quem liga pra empresa).
  - Filtros `status`/`segment`/`city` aceitos por `companiesDB.list` mas ignorados
    silenciosamente pelo backend (`CompanyController.getCompanies` só lê `page`/`limit`/`q`) — sem
    sintoma hoje porque `CompanyList.tsx` nunca envia esses parâmetros (não existe filtro de
    status/segmento/cidade na UI). Mesma categoria dos achados de parâmetro morto já registrados
    em pilotos anteriores.
  - Gap de tipagem no backend: `src/features/companies/domain/Company.ts` (interface do domínio)
    não declara vários campos que o Prisma já retorna e a UI já consome (`technologies`,
    `keywords`, `logoUrl`, `apolloOrgId` etc.), contornado hoje com `as unknown as Company` no
    repositório. Achado real, mas é uma limpeza de tipagem backend sem efeito visível na UI —
    registrado, não corrigido neste diff (nenhuma das telas tocadas por este piloto precisou
    desse tipo para compilar, já que consomem o tipo de frontend em `src/types/index.ts`, que já
    tem os campos corretos).
- **Preservado**: nenhuma rota nova, nenhuma migração. Textos exatos exigidos por
  `tests/e2e/contact-company-forms.spec.ts` e `tests/unit/features/companies/**` (`"Nova Empresa"`,
  `"Empresa criada."`, mensagens de validação de CNPJ/Razão Social) — `CompanyForm.tsx` não foi
  tocado.
- **Achado ambiental durante a implementação — colisão real com sessão concorrente**: no meio da
  implementação, um `npx eslint` acusou `'Linkedin' is not defined` em `CompanyDetail.tsx` mesmo com
  o import aparentemente correto — investigação mostrou que outra sessão está no meio de uma
  migração de major version do `lucide-react` (v1.38.0, que removeu ícones de marca como
  `Linkedin`/Facebook/Github da lib — mudança real, documentada em lucide.dev/guide/react/migration)
  para um componente local (`src/components/ui/icons/LinkedinIcon.tsx`), e editou este exato arquivo
  no meio da minha própria edição. Um `eslint --no-cache` logo em seguida já veio limpo — o erro era
  o estado transitório do arquivo no instante exato da corrida entre as duas edições, não um bug
  real. Essa mesma migração automática já tinha alcançado `ContactList.tsx`/`ContactDetail.tsx`
  (Piloto 013) antes de eu verificar, então nenhuma ação foi necessária da minha parte além de
  confirmar a compatibilidade. Diferente do bloqueio do Piloto 013 (Bitrix), desta vez o projeto
  inteiro compilou limpo (`tsc` 0 erros, `vite build` ok) — a outra sessão parece ter concluído o
  trabalho que antes bloqueava tudo (o bundle final ainda inclui `useBitrixIntegration`, então a
  integração foi mantida, não removida).
- **Verificação**: `npx eslint --no-cache` nos 2 arquivos (limpo), `npx tsc --noEmit -p .` (0 erros
  no projeto inteiro), `npx vite build` (sucesso), `npx vitest run -c vitest.unit.config.ts
  tests/unit/features/companies` (10/10 passando), `PORT=3050 npx playwright test
  tests/e2e/contact-company-forms.spec.ts` (3/3 passando). Primeira verificação totalmente completa
  (sem bloqueio de ambiente) desde o Piloto 012.
- **Aprendizado incorporado**: oitava confirmação do padrão "vitrine de dado real subaproveitado" —
  desta vez dentro de uma tela que já existia e já era usada, não um stub morto: o dado (horário de
  funcionamento, porte da empresa) já chegava do backend mas nunca tinha um pedaço de UI dedicado a
  mostrá-lo, mesmo com a tela ao redor dele já "pronta". Reforça que vale procurar esse padrão
  também dentro de telas ativas, campo a campo, não só via endpoints sem nenhum consumidor. Segundo
  aprendizado: duas telas do mesmo módulo podem estar em estágios de correção de tokens/contraste
  completamente diferentes mesmo sendo vizinhas e compartilhando o mesmo domínio — vale sempre
  comparar o tratamento de cor entre arquivos irmãos do mesmo módulo antes de assumir que um já
  reflete o padrão do outro.

## Pilot 015 — Activities

- **Objetivo**: terceiro módulo do roadmap, seguido em sequência sem pausar para confirmação
  (aprovação do usuário para rodar os pilotos restantes de forma contínua).
- **Achado principal — bug funcional real, não cosmético**: o formulário "Nova Atividade" de
  `ActivityList.tsx` — a **única tela de criação de atividade em todo o aplicativo** (confirmado por
  busca exaustiva: nenhum outro lugar do código chama `createActivity`/`POST /api/activities` a
  partir de UI) — nunca teve um campo para vincular a atividade a um Lead. `leadId` é obrigatório no
  schema Prisma (`String`, sem `?`, FK não-nula) e no Zod (`activitySchema.leadId: z.string()`), mas
  o form sempre enviava `leadId: form.leadId || undefined` com `form.leadId` permanentemente `''`
  (nenhum input o preenchia). Ou seja: **toda submissão desse formulário sempre falhava** na
  validação Zod antes de tocar o banco — a funcionalidade central da tela nunca funcionou de fato.
  Corrigido adicionando um campo de busca de Lead (combobox com debounce de 300ms, mesmo padrão já
  usado em `CompanyList.tsx`), reaproveitando `GET /api/leads?q=...` — que **já existia e já
  suportava busca por texto no backend** (`LeadController.getLeads` já lê `req.query.q`), mas
  `leadsDB.list()` no frontend nunca expunha esse parâmetro (adicionado em `src/lib/db.ts`, mesmo
  padrão de `q` já usado por `companiesDB`/`contactsDB`). `handleSubmit` agora bloqueia o envio com
  toast de erro se nenhum negócio foi selecionado, em vez de deixar a API rejeitar silenciosamente.
- **Achado secundário — endpoint órfão + duplicação de dado**: `GET /api/activities/templates`
  (`ActivityUseCases.getFollowUpTemplates`) já existia, íntegro, sem nenhum consumidor — a tela
  duplicava a mesma lista como constante local `FOLLOW_UP_TEMPLATES`, já divergente em um dos
  textos do backend vs. frontend ("Diagnóstico de Frota" vs. "Diagnóstico Operacional de Frota").
  Corrigido: o modal agora busca do endpoint real (sob demanda, ao abrir), eliminando a duplicação
  e dando o nono uso confirmado do padrão "vitrine de dado real subaproveitado" — desta vez uma
  rota GET testada e pronta, mas nunca chamada pela UI.
- **Retokenização de `ActivityList.tsx`**: as 7 cores categóricas de tipo de atividade
  (`TYPE_COLORS`) foram mantidas — **exceção justificada** (constituição §5): são mais distinções
  do que os tokens semânticos do projeto cobrem, e diferenciar 7 tipos de atividade por cor é
  informação real, não decoração. O bug real era a ausência total de par `dark:` em todas as 7 —
  adicionado (`dark:bg-*-950/30 dark:text-*-300 dark:border-*-900` por matiz). Já `STATUS_STYLES`
  (pendente/concluída) tinha significado semântico direto e foi migrado para os tokens
  `warning`/`success` já auditados (mesmo badge de `CompanyDetail.tsx`, Piloto 014) — `cancelled`
  já usava tokens corretamente, preservado. Banner de erro, hover de "Reabrir"/"Marcar Concluída" e
  botão excluir migrados para `danger`/`warning`/`success` tokens (antes usavam `red-*`/`amber-*`/
  `emerald-*` crus, a maioria sem par `dark:`). Ícones decorativos (`Sparkles` de "Modelos Rápidos",
  `Download` de "Baixar Agenda") tinham `amber-500`/`sky-500` arbitrários sem significado — como
  âmbar já é a cor categórica de "ação de IA/enriquecimento" estabelecida em Contacts/Companies e
  esses dois ícones não são ações de IA, foram normalizados para `text-ink-2` (evita sobrecarregar
  o mesmo tom com dois significados diferentes no app). Gradiente do botão salvar
  (`from-brand to-amber-500`) corrigido para `from-brand to-brand-2` — mesmo bug já corrigido em
  outros 3 pilotos anteriores.
- **Acessibilidade**: `type="button"` adicionado a 9 botões que não declaravam (Modelos Rápidos,
  Baixar Agenda, Nova Atividade, Tentar novamente, Criar Primeira Atividade, toggle de status,
  excluir, fechar modal de templates, fechar modal de nova atividade) — nenhum causava bug de
  submit hoje (nenhum estava de fato dentro do `<form>`), mas era inconsistente com o resto do
  arquivo. O card de template (`<div role="button" tabIndex={0}>`, já parcialmente acessível via
  teclado) foi convertido para `<button type="button">` nativo, alinhado à exigência de semântica
  HTML antes de `role`/`aria-*` (constituição §10).
- **Fora de escopo, documentado**:
  - `Timeline.tsx` — componente completo e funcional (busca `GET /api/leads/:id`, renderiza
    histórico de eventos), mas **órfão**: não é importado por nenhuma rota ou componente ativo do
    projeto. Tem 4 cores categóricas hardcoded sem par `dark:` (`blue-100`/`orange-100`/
    `green-100`/`purple-100`). Não corrigido neste piloto: seu lugar natural seria dentro de
    `LeadDetailDrawer.tsx` (módulo CRM/Leads), fora do escopo de um piloto de Activities — e como
    está completamente inacessível hoje, retocar suas cores não teria nenhum efeito observável.
    Sinalizado para um piloto futuro do módulo CRM/Leads.
  - `deletedAt`/`deletedBy`/`deleteReason` — colunas reais de soft-delete no schema do model
    `Activity`, nunca lidas/escritas em lugar nenhum (`delete()` faz hard delete puro). Mesma
    categoria dos achados de hard-delete já sinalizados em Contacts (Piloto 013) — decisão de
    integridade de dado/LGPD, não tarefa de UI.
  - `confirm()` nativo em `handleDelete` — mesmo padrão já registrado como fora de escopo no
    Piloto 014 (usado em 12+ arquivos do app inteiro, não específico deste módulo).
  - `lead` (relação populada, incluindo `company`/`contact`) já vem em cada atividade retornada por
    `GET /api/activities`, mas o card na grade não mostra a qual negócio/empresa a atividade
    pertence. Não adicionado neste piloto por escopo (o card já ficou mais denso com a correção do
    bug de criação); fica sinalizado como próximo incremento natural do mesmo card.
- **Preservado**: nenhuma migração. Textos exatos exigidos por
  `tests/unit/features/activities/application/ActivityUseCases.test.ts` e
  `services/activity.service.test.ts` (regex `/não é um responsável real/` do `ownerGuard`) e por
  `tests/e2e/accessibility.spec.ts` (`'Atividades não tem violações críticas/sérias'`, rota
  `/app/activities`) — nenhum desses textos foi tocado.
- **Verificação**: `npx eslint --no-cache` nos arquivos tocados (limpo, após corrigir uma entidade
  HTML não escapada), `npx tsc --noEmit -p .` (0 erros no projeto inteiro), `npx vite build`
  (sucesso), `npx vitest run -c vitest.unit.config.ts tests/unit/features/activities` (14/14
  passando), `PORT=3060 npx playwright test tests/e2e/accessibility.spec.ts -g "Atividades"` (1/1
  passando). **Bloqueio real de ambiente**: a verificação manual no navegador do novo fluxo de
  busca/seleção de Lead (a parte mais arriscada deste piloto, por ser lógica nova sem teste
  automatizado) não pôde ser concluída — o servidor de dev desta sessão (`prospector-dev-uxcheck`,
  porta 3009) ficou preso na inicialização (só o banner do `tsx watch server.ts`, sem log de
  "listening", por mais de 30s) e a navegação do Browser pane foi recusada, coerente com o aviso já
  visto nesta sessão de que "outra sessão já está com um servidor de dev rodando nesta pasta" — os
  dois processos `tsx watch` provavelmente disputam o mesmo cache/lock de build. Servidor parado
  para não deixar processo órfão. A lógica do combobox foi revisada cuidadosamente por leitura de
  código (debounce, cancelamento de request obsoleto via `cancelled`, reset de estado ao
  aplicar template/fechar modal/submeter) mas não foi exercitada interativamente — registrado como
  pendente, não fingido como verificado.
- **Aprendizado incorporado**: primeiro achado desta série que não é cosmético/de token, mas um bug
  funcional real que tornava a única tela de criação do módulo inutilizável — reforça que a
  auditoria inicial de cada piloto deve sempre conferir se o fluxo de escrita (criar/editar) declarado
  pelo formulário realmente bate com os campos obrigatórios do schema/Zod, não só o fluxo de leitura.
  Confirma pela segunda vez (depois do Piloto 013) que um endpoint GET real e testado sem consumidor
  de UI pode ser tanto "dado subaproveitado" quanto, como aqui, a peça que faltava pra consertar uma
  duplicação de lógica já existente na própria tela.

## Pilot 016 — Cadence

- **Objetivo**: quarto módulo do roadmap, seguido em sequência sem pausar para confirmação.
- **Achado principal (Alta prioridade) — rota de escrita completa sem NENHUM ponto de acionamento
  na UI**: `POST /api/cadence/leads/:leadId/schedule-meeting` (CYC-004) já existia, testado (8 casos
  de integração cobrindo confirmação verificável, RLS, `requireRole`, horário passado, ISO
  inválido), cria `Note` + evento de calendário reais — mas nenhum vendedor conseguia registrar uma
  reunião confirmada a partir da tela de Cadência: `cadence.api.ts` nem declarava um método cliente
  para essa rota. Corrigido: novo botão "Agendar reunião confirmada" (ícone `CalendarClock`) nas
  ações de cada execução ativa/pausada, abrindo `ScheduleMeetingDialog` com início/fim (datetime-
  local) → `cadenceApi.scheduleMeeting(leadId, {...})` (método novo). Mesma classe de achado do
  Piloto 015 (endpoint real de escrita sem consumidor), mas em regra de negócio mais elaborada.
- **Achados médios**:
  - `GET /api/cadence/templates` — real, testado, mas `JourneyTemplatesDialog` importava a mesma
    constante `CADENCE_JOURNEY_TEMPLATES` diretamente do domínio backend em vez de chamar a API
    (mesmo padrão de rota órfã confirmado em Contacts/Companies/Activities). Corrigido: busca sob
    demanda ao abrir o modal; a constante agora só é importada como `type` (zero-custo em bundle).
  - `CadenceTouchInput.maxAttempts` (retry de toque, até 5 tentativas) existia no tipo e no domínio
    mas não tinha nenhum input no formulário "Nova sequência" — toda sequência criada pela tela
    nascia sem retry. Adicionado campo "Tentativas se falhar" (1-5) por toque.
  - `OptOutRecord.evidence` — coletado deliberadamente ("texto/trecho real da mensagem que motivou
    o opt-out"), já trafegava até o cliente (inclusive já estava na fixture do teste unitário
    existente!), mas nunca era renderizado na tabela de opt-outs. Adicionada coluna "Evidência".
- **Achados baixos, corrigidos com mudança mínima de backend**: `CadenceSequence.description` é
  coluna real do Prisma desde sempre, mas a rota `POST /sequences` nunca a aceitava
  (`createSequenceSchema` só tinha `name`+`touches`) nem a UI tinha campo para preenchê-la —
  inacessível nos dois lados. Corrigido: `description` adicionada ao schema Zod (opcional, max 500),
  repassada ao `prisma.cadenceSequence.create`, exposta em `CadenceSequenceDTO`, e um textarea
  opcional adicionado ao formulário "Nova sequência".
- **UX, não bug**: campo "ID do lead" em `StartRunDialog` era texto livre puro — nenhum vendedor
  sabe de cor o `cuid` de um lead. Adicionado combobox de busca por nome/empresa (mesmo padrão de
  debounce 300ms de `ActivityList.tsx`, Piloto 015), mas **preservando exatamente** o mesmo `id`,
  `label` ("ID do lead") e comportamento de digitação livre do campo original — o teste E2E oficial
  já automatiza `getByLabel('ID do lead').fill(leadId)` direto, então a busca é só uma lista de
  sugestões abaixo do mesmo input, nunca um campo substituto que quebraria esse fluxo.
- **Cosmético**: ícone `Sparkles` do botão "Modelos de Jornada" tinha `text-amber-500` hardcoded sem
  significado categórico nem par `dark:` — removido, agora herda a cor do próprio `Button` (mesmo
  padrão do botão vizinho "Nova sequência"). Resto do arquivo já usava tokens corretamente (27+
  ocorrências corretas de `dark:`/tokens semânticos já auditadas em rodada anterior) — não havia
  outra dívida de cor real no módulo.
- **Fora de escopo, documentado**: `CadenceSequence.active`/`deletedAt` existem e são filtrados nas
  queries, mas não há nenhuma ação de desativar/excluir sequência na UI — exigiria rota backend nova
  (`DELETE`/`PATCH`), não só front-end; sinalizado para task futura. `CadenceTouchAttempt.
  providerMessageId` (id da mensagem no provedor, coletado para depuração) não exibido na tabela de
  tentativas expandida — valor limitado sem uma ferramenta de suporte que o consuma, não crítico
  como os achados acima. `CadenceRun.calendarEvents` (relação criada pela rota de agendamento) ainda
  sem visualização própria na tela — resolvido parcialmente ao dar à rota um ponto de entrada, mas
  ver os eventos já criados fica para incremento futuro. Limite de 720h de `delayHoursFromPrevious`
  agora espelhado no `max` do input (pequeno ajuste feito de passagem, já que o campo estava sendo
  editado de qualquer forma).
- **Preservado**: nenhuma migração. Textos exatos de `tests/e2e/cadence.spec.ts` (`'Cadência'`,
  `'Nome da sequência'`, `/Conteúdo da mensagem/`, `'Criar sequência'`, `'Iniciar cadência'`,
  `'ID do lead'`, `'Iniciar'`, `'Ativa'`/`'Pausada'`/`'Encerrada'`, `'Parada manual'`, os
  `aria-label`s dinâmicos de pausar/retomar/parar) e de `tests/unit/.../CadenceHub.test.tsx`
  (inclusive a fixture que já continha `evidence: 'transcrição real'`, nunca antes exibida)
  intactos — nenhuma coluna/ação existente foi removida ou reordenada, só adicionada.
- **Verificação**: `npx eslint --no-cache` nos 3 arquivos tocados (limpo, após remover um
  `eslint-disable` que ficou desnecessário), `npx tsc --noEmit -p .` (0 erros no projeto inteiro),
  `npx vite build` (sucesso), `npx vitest run -c vitest.unit.config.ts tests/unit/features/cadence
  src/features/cadence/__tests__` (200/200 passando), `PORT=3070 npx playwright test
  tests/e2e/cadence.spec.ts` (2/2 passando), `npx vitest run -c vitest.integration.config.ts
  tests/integration/cadence-start.routes.test.ts tests/integration/cadence-schedule-meeting.routes.test.ts`
  (22/23 passando — 1 falha real mas **pré-existente e confirmada não relacionada a este piloto**:
  `git stash` das minhas mudanças reproduziu a mesma falha idêntica em
  `cadence-start.routes.test.ts`, "409 quando o lead já tem uma cadência ativa" recebendo 201 em vez
  de 409, provavelmente um índice único parcial do Postgres não aplicado/drift no banco de teste —
  meu diff não toca a rota `/runs` nem esse índice; registrado com transparência, não escondido nem
  atribuído a este piloto).
- **Aprendizado incorporado**: primeira vez nesta série em que uma correção de UX (busca de lead)
  precisou ser desenhada para **não** copiar um padrão já usado em outro pilote recente (Activities)
  ao pé da letra — lá o campo era novo e sem teste; aqui já existia um E2E oficial fixando o
  `id`/`label`/comportamento exato do campo. Reforça a regra da constituição (§4, regra 10): antes
  de "modernizar" um input, checar se algum teste já grava seu contrato de nome/id/comportamento —
  a melhoria certa é aditiva (sugestões por cima), não uma substituição que quebra o que já
  funciona. Segunda vez confirmando que um bug real de teste de integração pode já estar quebrado
  antes mesmo de eu tocar o arquivo — vale sempre isolar com `git stash` antes de assumir
  responsabilidade por uma falha inesperada.

## Pilot 017 — Playbook (Matriz de Qualificação + Matriz de Objeções)

- **Objetivo**: quinto módulo do roadmap, seguido em sequência sem pausar para confirmação.
- **Diferente dos 4 pilotos anteriores**: os dois formulários (`QualificationItemForm.tsx`,
  `ObjectionItemForm.tsx`) batem exatamente com o schema Zod compartilhado (`playbook.schema.ts`,
  reusado front+back) e com os campos obrigatórios do Prisma — nenhum campo obrigatório órfão,
  nenhuma rota de escrita sem consumidor. Primeiro módulo desta série sem bug funcional estrutural.
- **Achado real de RBAC**: `DELETE` das duas rotas exige `ADMIN`/`GESTOR` no backend
  (`qualification-matrix.routes.ts`, `objection-matrix.routes.ts`), mas nenhuma das duas telas lia
  o papel do usuário — um SDR/CLOSER (que podem criar/editar) via o botão "Excluir" e recebia um
  403 sem explicação ao clicar. Corrigido: `canDelete = hasRequiredRole(currentUser.role, ['ADMIN',
  'GESTOR'])` (mesmo padrão já usado em `Integrations.tsx`/`BitrixSyncRulesPanel.tsx`/
  `BitrixImportPanel.tsx`) esconde o botão para quem não tem permissão, nas duas telas.
- **Achado de cor**: `ObjectionsMatrixPage.tsx` tinha `text-amber-500` cru no ícone de
  `AlertTriangle` do título de cada objeção — coincidentemente o mesmo hex do token
  `--color-warning`, mas sem o par `--warning-active`/`dark:` que o próprio arquivo já usa 15 linhas
  abaixo (`text-warning-active dark:text-warning` no "Diferencial-chave"), reintroduzindo dentro do
  mesmo componente um problema de contraste que o design system já tinha resolvido. Corrigido para
  o mesmo token.
- **Vitrine de dado real subaproveitado**: `framework` (SPIN/BANT/MEDDPICC) já aparecia em destaque
  no badge de cada card da Matriz de Qualificação, mas não era filtrável — só `segment`/`persona`
  tinham `<select>` de filtro. Adicionado filtro de framework, terceira confirmação nesta série do
  padrão "dado já exibido, mas sem controle de UI pra usá-lo como filtro/ação".
- **Acessibilidade**: `type="button"` adicionado aos 8 botões das duas páginas de listagem (Nova
  Pergunta/Objeção, Copiar, Editar, Excluir em cada) — nenhum causava bug hoje (nenhum estava dentro
  de `<form>`), mas divergia do padrão já correto dentro dos dois modais de formulário.
- **Fora de escopo, documentado**:
  - `confirm()` nativo em `handleDelete` das duas páginas — mesmo padrão já registrado como fora de
    escopo nos Pilotos 014/015 (usado em 12+ arquivos do app inteiro).
  - Paginação real implementada nos dois repositórios Prisma (`meta: {total, page, limit,
    totalPages}`), mas os use cases sempre chamam `findAll(..., 1, 200)` fixo e o client HTTP
    descarta `meta` (`.then(res => res.data)`) — se uma organização passar de 200 perguntas/objeções
    por marca, os itens excedentes somem silenciosamente da tela. Sem sintoma visível hoje (nenhuma
    organização real chegou perto desse volume), mas é um bug latente real; corrigir exigiria mudar
    o use case (parâmetro de página) e adicionar UI de paginação/"carregar mais" nas duas telas —
    escopo maior que um ajuste pontual, sinalizado para task futura.
  - `createdAt`/`updatedAt` de cada item (Prisma real, já na resposta da API) nunca exibidos — valor
    baixo (ordenação por data não é um pedido óbvio para uma matriz de referência), não adicionado.
  - `questionCategory` (Matriz de Qualificação) não é filtrável — mesma categoria do achado de
    `framework`, mas de menor prioridade (já filtrável indiretamente pela busca textual, que já
    inclui esse campo no haystack); não adicionado para não empilhar filtros demais na mesma barra.
  - Serviço `PlaybookAiService.generatePlaybookChapter` (mora em `playbook/services/`) é consumido
    fora do módulo de tela do Playbook, só por `AISuiteHub.tsx` — observação arquitetural, não um
    achado de UI deste piloto.
- **Preservado**: nenhuma migração. Rotas/textos exatos de `tests/e2e/accessibility.spec.ts`
  (`'Matriz de Qualificação não tem violações críticas/sérias'`, `'Matriz de Objeções não tem
  violações críticas/sérias'`, `/app/qualification_matrix`, `/app/objections_matrix`) e do array
  `MODULES` de `tests/e2e/mobile-sweep.spec.ts` intactos.
- **Verificação**: `npx eslint --no-cache` nos 2 arquivos (limpo), `npx tsc --noEmit -p .` (0 erros
  no projeto inteiro), `npx vite build` (sucesso), `PORT=3085 npx playwright test
  tests/e2e/accessibility.spec.ts -g "Matriz de Qualifica|Matriz de Objeç"` (2/2 passando). Não
  existe `tests/unit/features/playbook/**` no repositório (pasta inexistente) — nada rodado ali por
  não haver o que rodar, não por bloqueio.
- **Aprendizado incorporado**: primeiro módulo desta série de 5 pilotos sem bug funcional
  estrutural — reforça que a verificação funcional (schema Zod vs. campos do formulário) precisa
  continuar sendo feita em TODO módulo mesmo quando o resultado é "está tudo certo", porque só
  auditando dá pra saber. Primeiro achado de RBAC UI vs. backend desalinhado nesta série — vale
  incorporar ao checklist de auditoria dos próximos módulos: sempre que uma rota tiver
  `requireRole`, checar se a tela correspondente esconde a ação para quem não tem o papel exigido,
  em vez de deixar o usuário descobrir por um 403.

## Pilot 018 — Automations

- **Objetivo**: sexto módulo do roadmap, seguido em sequência sem pausar para confirmação.
- **Achado principal — bug funcional real (prioridade máxima)**: o gatilho **"Lead estagnado"**
  aparecia no formulário "Nova Automação" (o próprio `automations.api.ts` já tinha o tipo, a
  constante `TRIGGERS` e o campo dedicado "Reavaliar todo dia se ficar parado por (dias)"), mas
  `AUTOMATION_TRIGGERS` no backend (`AutomationUseCases.ts`) **não incluía esse valor** — toda
  submissão com esse gatilho falhava com 400 no `automationSchema.parse` antes mesmo de chegar no
  controller. O valor é real e usado de verdade em todo o resto do sistema: existe no enum Prisma
  (`Lead_Estagnado`), no motor (`automation.engine.ts`) e é disparado por dois jobs de fundo
  (`stagnation-scanner.service.ts`, `stalledLead.worker.ts`) — ou seja, **o único jeito de uma
  organização ter uma regra de "Lead estagnado" funcionando antes deste piloto era inserir direto
  no banco**, nunca pela UI. Corrigido adicionando o valor a `AUTOMATION_TRIGGERS` — como
  `GET /api/automations/options` deriva da mesma constante, ficou corrigido nos dois lugares de uma
  vez. Adicionado teste de regressão em `AutomationUseCases.test.ts` que exercita o
  `automationSchema` real com esse gatilho (o teste de UI existente mocka o `POST` via MSW e nunca
  rodava o Zod de verdade — por isso o bug passou despercebido antes).
- **Achado de RBAC — segunda confirmação do mesmo padrão do Piloto 017**: `POST`/`PUT`/`DELETE` +
  `dry-run`/`versions` exigem `ADMIN`/`GESTOR` no backend (`automation.routes.ts`), mas
  `Automations.tsx` não lia o papel do usuário — SDR/CLOSER (os papéis mais numerosos numa operação
  comercial) viam todos os controles de escrita habilitados e só descobriam a falta de permissão
  com um 403 genérico ao clicar. Corrigido com o mesmo `canManage = hasRequiredRole(currentUser.role,
  ['ADMIN', 'GESTOR'])` já usado em Playbook/Integrations/BitrixSyncRulesPanel — esconde "Nova
  automação", simular, versões, editar e excluir; o switch ativa/pausa continua visível (é leitura
  de estado) mas fica desabilitado. Novo teste unitário cobre exatamente esse cenário (papel `SDR`).
- **Vitrine de dado real subaproveitado, versão "capacidade" em vez de "campo"**: o sistema de
  versionamento com diff textual (`AutomationVersionsDialog.tsx`, `automation-versioning.service.ts`)
  já existia pronto e testado no backend para mostrar "Gatilho: X → Y"/"Condições: A → B"/
  "Ação: C → D" — mas em toda a UI a única chamada de `update` era o toggle ativa/pausa
  (`{ enabled: !item.enabled }`). Não existia nenhum jeito de editar o conteúdo de uma regra pela
  tela; o histórico de versões nunca mostrava, na prática, nada além de mudança de status. Corrigido:
  `AutomationForm` agora aceita uma automação existente (`editing`), pré-preenche todos os campos
  (inclusive decodificando `actionConfig`/`conditions` de volta para os inputs) e chama `update` com
  o payload completo; novo botão "Editar" (ícone `Pencil`) nas ações de cada regra.
- **Cosmético**: `bg-slate-950/80` (backdrop do modal, escrito à mão) → `bg-ink/50` (mesmo token do
  backdrop do `Dialog` compartilhado); `text-amber-400` (ícone de erro em `Automations.tsx` e 2
  ocorrências em `ColdCallStatusCard.tsx`) → `text-warning-active dark:text-warning` (o próprio
  módulo já usa esse par corretamente em `AutomationDryRunDialog.tsx`); `text-gray-600` (ícone do
  estado vazio) → `text-ink-2`; `hover:text-red-400 hover:bg-red-500/10` (botão excluir) →
  `hover:text-danger-active dark:hover:text-danger hover:bg-danger/10`; trilho do switch "desligado"
  (`bg-slate-700`) → `bg-surface-2 border border-line` (cópia exata do switch já tokenizado de
  `FeatureFlagsPanel.tsx`). `type="button"` adicionado a todos os botões do módulo sem ele.
- **Fora de escopo, documentado**:
  - `POST /api/automations/stagnation-scan` (varredura manual sob demanda, `ADMIN`-only) — rota
    real, testada, sem nenhum consumidor de UI. Não adicionado um botão "Rodar agora" neste piloto
    por escopo (o achado de maior impacto real, o bug de criação, já consumiu o orçamento principal
    deste piloto); sinalizado para incremento futuro.
  - Histórico de execuções por automação (`correlationId`, `retryCount`, `durationMs`, erro
    sanitizado — tudo gravado por `automation-history.service.ts` em `AuditLog`) não tem nenhuma
    tela dedicada dentro do módulo; o único consumidor de `AuditLog` é a aba LGPD de Settings, sem
    filtro por automação e limitada às 100 linhas mais recentes de todo o tenant. Achado real e
    válido, mas construir um painel novo de "ver histórico de execuções desta regra" é escopo de
    feature nova, não ajuste pontual — sinalizado para task futura.
  - `ColdCallRun.skipped{MaxAttempts,Cooldown,NoPhone,Suppressed,Error}` já vêm discriminados da API
    mas `ColdCallStatusCard.tsx` só mostra a soma (`skippedTotal`) — motivo específico de cada lead
    pulado não é visível. Valor menor que os achados acima, não corrigido.
  - `confirm()` nativo em `remove()` — mesmo padrão já registrado fora de escopo nos Pilotos
    014/015/017 (usado em 12+ arquivos do app inteiro).
- **Preservado**: nenhuma migração. Nenhum teste e2e dedicado existe para este módulo (confirmado
  por busca — só `mobile-sweep.spec.ts` toca a rota genericamente, sem asserts de conteúdo); os 8
  testes pré-existentes de `automations-ui.test.tsx` continuam intactos (textos exatos:
  `'Nenhuma automação ainda'`, `/Criar a primeira/`, `'Avisar em Proposta Enviada'`,
  `/Quando "Lead mudou de status"/`, `'ainda não disparou'`, `'1 regra · 1 ativa(s)'`, `getByRole
  ('switch', {name: /Pausar .../})`, `getByLabelText('Nome')`/`getByLabelText(/Somente na etapa/)`).
- **Achado ambiental durante a implementação — teste quebrado pela minha própria correção,
  corrigido no mesmo diff**: ao adicionar `useAuth()` a `Automations.tsx` para o RBAC, os 8 testes
  de `automations-ui.test.tsx` que renderizam `<Automations />` passaram a falhar com "useAuth deve
  ser usado dentro de um AuthProvider" (o wrapper de teste local só envolvia `BrandProvider`).
  Corrigido seguindo o padrão já estabelecido em
  `tests/unit/features/integrations/components/Integrations.test.tsx`
  (`vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => useAuthMock() }))`, papel `GESTOR`
  por padrão) — não é um bloqueio de ambiente alheio como nos Pilotos 013/016, é uma quebra real
  causada pela minha própria mudança, corrigida como parte do mesmo trabalho, com dois testes novos
  (regressão do bug do schema + verificação de RBAC) adicionados no processo.
- **Verificação**: `npx eslint --no-cache` nos arquivos tocados (limpo), `npx tsc --noEmit -p .`
  (0 erros no projeto inteiro), `npx vite build` (sucesso), `npx vitest run -c
  vitest.unit.config.ts` em todo o escopo de testes do módulo Automations — unit, engine, dry-run,
  versionamento, idempotência, scanners, controller (132/132 passando, incluindo os 2 testes novos
  deste piloto).
- **Aprendizado incorporado**: primeira vez nesta série em que a própria correção de um piloto
  quebra um teste pré-existente (não um bloqueio externo) — reforça que qualquer mudança que
  introduza `useAuth()`/`hasRequiredRole` num componente sem esse hook antes precisa checar se há
  teste de componente renderizando-o sem `AuthProvider`/mock, e que o padrão certo já está
  estabelecido em `Integrations.test.tsx` (mock de `useAuth` via `vi.mock`, não `AuthProvider` real)
  — vale aplicar esse mesmo padrão preventivamente em qualquer piloto futuro que adicione RBAC a um
  componente com teste de UI existente. Terceira confirmação seguida (Pilotos 016-018) de que vale
  sempre perguntar "o que o backend já sabe fazer que a UI nunca chama?" antes de assumir que um
  módulo está completo — desta vez a resposta foi tanto um valor de enum inteiro quanto um sistema
  de versionamento inteiro.

## Pilot 019 — Knowledge Base

- **Objetivo**: sétimo módulo do roadmap, seguido em sequência sem pausar para confirmação.
- **Achado de RBAC — terceira confirmação seguida do mesmo padrão (Pilotos 017-019)**: `Base.tsx`
  não fazia nenhuma verificação de papel. `POST`/`PUT`/reembed/gerar-FAQ exigem `ADMIN`/`GESTOR`/
  `CLOSER`/`SDR` no backend (`writeRoles`); `DELETE` é mais restrito (`ADMIN`/`GESTOR`). Um
  `VISUALIZADOR` via todos os controles de escrita habilitados — "Enviar arquivo", "Colar texto",
  os 3 botões por documento, e até o "Assistente de Redação IA" (`EditorIA`) — e ao clicar recebia
  um 403 **em inglês** (`requireRole.ts`: `"Insufficient permissions. Required: ADMIN or GESTOR..."`)
  solto como toast numa UI 100% em pt-BR. Corrigido com `canWrite`/`canDelete` (mesmo padrão de
  `hasRequiredRole` dos Pilotos 017/018): esconde upload/colar-texto/EditorIA/gerar-FAQ/editar/
  reembed para quem não tem `writeRoles`, e o botão de excluir especificamente para quem não é
  `ADMIN`/`GESTOR` (mesmo com escrita liberada) — reflete exatamente os dois conjuntos de papel
  diferentes que o backend já aplica.
- **Achado principal — funcionalidade de backend pronta sem nenhum ponto de acionamento na UI**:
  `PUT /api/knowledge/:id` já existia, testado (reindexa e incrementa `Document.version` só quando
  o conteúdo muda — campo criado na Onda 40 especificamente para responder "esse documento é a
  versão mais recente?"), mas `knowledgeApi` não expunha nem `get`/`update`, e não havia nenhum
  botão "Editar" em lugar nenhum. Único jeito de "corrigir" um documento já indexado era excluir o
  documento inteiro (perdendo `id`/`createdAt`) e reingerir do zero — destrutivo, apesar de a rota
  correta já existir pronta. Corrigido: novos métodos `knowledgeApi.get(id)`/`knowledgeApi.update`,
  novo botão "Editar" (ícone `Pencil`, só para `canWrite`) que reabre o mesmo modal de "Colar texto"
  em modo edição — busca o conteúdo completo via `GET /:id` (com loading próprio), pré-preenche
  título/conteúdo, e no submit chama `update` em vez de `ingestText`.
- **Vitrine de dado real subaproveitado**: `Document.version` (mesmo campo do achado acima) nunca
  era sequer selecionado na query de listagem (`ingestion.service.ts:list`, `select` não incluía a
  coluna) nem exibido — adicionado ao `select` e um badge "editado · vN" aparece quando `version >
  1`. `sourceType` já estava no tipo do frontend mas nunca renderizado — como só `sourceName` (nulo
  para texto colado) aparecia, não havia como distinguir visualmente "documento colado" de "arquivo
  enviado" na listagem; agora mostra "· texto colado" quando não há `sourceName`.
- **Cosmético**: `<mark>` de destaque de busca (`bg-amber-400/25 text-amber-100`) — **exceção
  justificada** (constituição §5): âmbar é a convenção universal de "trecho realçado" (mesma cor do
  `<mark>` nativo do navegador), independente de marca, mesma categoria de exceção já aceita para
  estrelas de rating (Piloto 014). O bug real ali era só a falta de par claro/escuro (texto claro
  demais para funcionar em tema claro) — corrigido mantendo âmbar mas com os dois pares. Já o aviso
  "Busca semântica fora do ar" (`text-amber-300 bg-amber-500/10`) É um estado de warning real do
  produto (não um highlight) — convertido para os tokens `warning`/`warning-active`. `text-gray-600`
  (3 ocorrências, ícones/texto de estado vazio) → `text-ink-2`; botão excluir
  (`hover:text-red-400 hover:bg-red-500/10`) → `danger`/`danger-active`; os dois backdrops
  `bg-slate-950/80` (overlay de arrastar-e-soltar e modal de texto) → `bg-ink/50`/`bg-ink/60`
  (mesmo token já usado no Piloto 018 para o backdrop de Automations). `aria-label` adicionado aos
  3 botões que só tinham `title` — **sem remover o `title`**, porque o teste existente usa
  `getByTitle('Remover documento')`. `type="button"` adicionado em todos os botões/`Button` sem ele
  em `Base.tsx` e `EditorIA.tsx`.
- **Fora de escopo, documentado**:
  - `rerankScore` (pontuação 0-100 do reranking via LLM, DEC-11) já vem no tipo
    `KnowledgeSearchHit` mas o card de resultado só mostra `similarity` — sem indicação visual de
    que a ordem foi reordenada por IA quando o reranking está ligado. Valor real mas menor, não
    corrigido.
  - Copiloto Técnico RAG (`knowledge-copilot.service.ts`) tem consumidor real, mas fora do módulo —
    só é acionável de dentro do "AI Suite Hub" (`AISuiteHub.tsx`), não a partir da própria tela de
    busca da Base de Conhecimento. Observação arquitetural, não corrigida (integrar um ponto de
    entrada do copiloto dentro de `Base.tsx` seria escopo de feature nova, cross-module).
  - `metadata.truncated`/`originalChunkCount` (grava quando um documento gigante excede o limite de
    chunks e perde conteúdo silenciosamente) nunca é comunicado ao usuário — achado real, mas
    exigiria uma UI de aviso nova; não corrigido aqui.
  - `content`, `createdBy` do documento nunca exibidos em nenhuma tela — sem uma tela de detalhe
    dedicada (o modal de edição agora mostra `content`, mas só durante a edição, não como
    visualização somente-leitura); `createdBy` (autoria) segue sem exibição.
  - `confirm()` nativo em `handleDelete` — mesmo padrão já registrado fora de escopo nos Pilotos
    014/015/017/018 (usado em 12+ arquivos do app inteiro), e já é o comportamento coberto pelo
    teste existente (`spyOn(window, 'confirm')`), então trocar exigiria atualizar esse teste também.
- **Preservado**: nenhuma migração. Textos exatos de `tests/unit/features/knowledge-base.test.tsx`
  (`'Nenhum documento ainda'`, `/12 trechos · .* · playbook\.docx/`, `/1 documento · 12 trechos
  indexados/`, `'Banco indisponível'`, payloads exatos de busca/ingestão, `getByTitle('Remover
  documento')`) intactos; `tests/e2e/accessibility.spec.ts` (`'Base de Conhecimento não tem
  violações críticas/sérias'`, rota `/app/knowledge`) intacto.
- **Achado ambiental — mesma quebra do Piloto 018, corrigida da mesma forma**: adicionar `useAuth()`
  a `Base.tsx` quebrou os 8 testes existentes de `knowledge-base.test.tsx`
  ("useAuth deve ser usado dentro de um AuthProvider"), corrigido com o mesmo
  `vi.mock('@/contexts/AuthContext', ...)` + `useAuthMock.mockReturnValue(...)` no `beforeEach`
  (necessário porque este arquivo já chama `vi.restoreAllMocks()` no `afterEach`, que zera a
  implementação do mock entre testes). Um teste novo de RBAC (papel `VISUALIZADOR`) adicionado no
  mesmo diff.
- **Verificação**: `npx eslint --no-cache` nos arquivos tocados (limpo), `npx tsc --noEmit -p .`
  (0 erros no projeto inteiro), `npx vite build` (sucesso), `npx vitest run -c
  vitest.unit.config.ts` em `knowledge-base.test.tsx` (9/9, incluindo o teste novo) + todo o resto
  do módulo (`chunking`, `vector-support`, `reranker.service`, `knowledge-copilot.service`,
  extração de texto — 63/63 passando), `PORT=3090 npx playwright test
  tests/e2e/accessibility.spec.ts -g "Base de Conhecimento"` (1/1 passando).
- **Aprendizado incorporado**: quarta confirmação seguida (Pilotos 016-019) do princípio "o que o
  backend já sabe fazer que a UI nunca chama" — desta vez um sistema de versionamento por
  freshness inteiro (campo + rota + serviço) ficou órfão desde a Onda 40 até este piloto. Segunda
  vez seguida (depois do Piloto 018) em que adicionar RBAC a um componente exige o mesmo ajuste
  preventivo no teste de UI existente — vale já esperar isso como parte do checklist de qualquer
  piloto futuro que adicione `useAuth()`/`hasRequiredRole` a uma tela com teste de componente
  prévio, em vez de descobrir a quebra só depois de rodar os testes.

## Pilot 020 — Calendar (Agenda + Links de Agendamento públicos)

- **Objetivo**: oitavo módulo do roadmap, seguido em sequência sem pausar para confirmação.
- **Achado principal — bug funcional real, dois leads podiam agendar o mesmo horário**:
  `GET /api/calendar/book/:slug` devolve `availableSlots` como uma lista fixa (`standardSlots`,
  09:00–18:00) que nunca consulta a agenda real do vendedor — nenhum horário já ocupado é removido,
  e o `POST` correspondente também nunca checava conflito antes de criar a reunião. Dois clientes
  diferentes agendando o mesmo horário com o mesmo vendedor criavam duas `Activity` sobrepostas
  silenciosamente. Corrigido no backend: checagem de conflito (`Activity` do mesmo `owner`/`date`/
  `time`, status ≠ Cancelada) logo no início da transação de agendamento, antes de criar Company/
  Contact/Lead — devolve 409 com mensagem em pt-BR ("Este horário acabou de ser reservado por
  outra pessoa...") em vez de aceitar silenciosamente. Não alterei o `GET` para pré-filtrar horários
  ocupados (exigiria receber `date` como query param e mudar o fluxo de UX do date-picker) — a
  correção mínima e suficiente para o dado real (evitar o double-booking) foi no `POST`.
- **Achado de RBAC — quarta confirmação seguida (Pilotos 017-020)**: `PUT /api/activities/:id`
  (arrastar card pra remarcar, "Cancelar"/"Concluir") exige `ADMIN`/`GESTOR`/`CLOSER`/`SDR`;
  `VISUALIZADOR` fica de fora, mas `Calendar.tsx` nunca checava papel — o cursor `cursor-grab`
  sugeria que arrastar funcionava, e os botões de ação apareciam sempre habilitados, para só falhar
  com 403 depois do clique (revertendo a posição/status na tela). Corrigido com `canWrite`
  (`hasRequiredRole`, mesmo padrão dos 3 pilotos anteriores): `useDraggable({ disabled: !canWrite
  })` desliga o drag pelo próprio dnd-kit (não só via CSS), e os botões "Cancelar"/"Concluir" do
  modal de detalhe somem por completo. O botão "Links de Agendamento" e o CRUD dentro do modal
  **não** foram alterados — `privateBookingRouter` não tem `requireRole` (qualquer papel autenticado
  gerencia os próprios links), então UI e backend já concordavam, sem desalinhamento real ali.
- **Achado de arquitetura, documentado como fora de escopo**: `PublicBookingLink.active` é aceito
  na criação (`bookingLinkSchema`), mas não existe nenhuma rota `PUT`/`PATCH` para alterá-lo depois
  — "desativar temporariamente um link sem apagá-lo" é uma capacidade que o schema modela mas nunca
  foi implementada em nenhuma camada (nem backend, nem UI). `docs/openapi.yaml` chega a descrever o
  `DELETE` como "desativa ou remove", mas o código só tem exclusão definitiva. Diferente dos achados
  de "capacidade órfã" dos Pilotos 016/018/019 (onde a rota/serviço já existia pronta, só faltava o
  botão), aqui a rota em si nunca foi construída — implementá-la exigiria desenhar um endpoint novo
  do zero, não só religar um já existente; fica sinalizado para task futura, não construído aqui.
- **Achado de marca, avaliado e documentado como não-corrigível dentro do escopo de UI**:
  `PublicBookingPage.tsx` (página pública, sem `AuthProvider`/tema) usa uma paleta âmbar/laranja
  fixa em toda a tela, sempre — um lead da Total Trac agendando com um vendedor Total Trac vê a
  página inteira em laranja/AtlasGR, sem nenhuma pista de qual marca realmente está atendendo.
  Investigado a fundo: **não há onde armazenar a marca do vendedor** — `Brand` só existe em
  `localStorage` do navegador de quem está logado (`BrandContext.tsx`), nunca em `User` nem em
  `Organization` no schema Prisma. Corrigir de verdade exigiria uma migração de schema (campo de
  marca em `User`/`Organization` ou no próprio `PublicBookingLink`) — fora do escopo de um piloto de
  UI; a cor fixa em si não é o bug, a ausência do dado é. Documentado com essa distinção para não
  ser "descoberto" de novo como se fosse um `dark:` faltando.
- **Cosmético**: `text-sky-500` (ícone Download em `Calendar.tsx`, ícone Globe em
  `BookingLinksModal.tsx`) → removido/`text-ink-2` (cor decorativa sem propósito categórico, herda
  a cor do próprio `Button` ou vira neutra); `text-amber-400` no estado de erro de `Calendar.tsx`
  → `text-danger-active dark:text-danger` (é erro, não aviso); `text-gray-600` (3 ocorrências) →
  `text-ink-2`; backdrops `bg-slate-950/80` (`Calendar.tsx`) e `bg-black/60` (`BookingLinksModal.tsx`)
  — duas cores diferentes pra mesma função dentro do mesmo módulo → unificados em `bg-ink/50` (mesmo
  token dos Pilotos 018/019); botão de copiar (`bg-emerald-500`) e botão de excluir (`bg-red-50
  text-red-500`) em `BookingLinksModal.tsx` → tokens `success`/`danger`. `aria-label` adicionado ao
  botão de fechar (X) e ao botão de excluir de `BookingLinksModal.tsx` (mantendo o `title` em
  ambos). `type="button"` adicionado em todos os botões/`Button` sem ele em `Calendar.tsx`.
- **Erro cometido e corrigido no mesmo diff — regressão de contraste real introduzida por mim**: ao
  trocar `text-gray-600` do número do dia fora do mês por `text-ink-2/60` (dimming via opacidade),
  o e2e de acessibilidade (`assertNoBlockingViolations`) pegou uma violação séria real: 2.46:1 de
  contraste, abaixo do mínimo 4.5:1 — a opacidade de 60% sobre `--ink-2` não sustenta o par
  claro/escuro do token. Corrigido removendo a diferenciação de opacidade (dias fora do mês agora
  usam o mesmo `text-ink-2` cheio dos dias do mês corrente — a distinção visual "fora do mês" já é
  comunicada pelo fundo mais claro da célula, `bg-surface-2/40`). Fica registrado como lembrete
  concreto: **opacidade sobre um token de texto não é gratuita** — pode furar o contraste que o
  próprio token já foi calibrado para cumprir; qualquer `/NN` aplicado a `text-ink`/`text-ink-2`
  precisa ser conferido contra o mesmo crivo de contraste do token cheio, não assumido como "mais
  claro é só estético".
- **Preservado**: nenhuma migração. Textos exatos de `tests/unit/features/calendar.test.tsx`
  (`'Nenhuma atividade neste mês'`, `'Transportes Vale'`, `getByLabelText(/Reunião — Transportes
  Vale/)`, `getByRole('button', {name: /Concluir/})`) e de
  `tests/unit/features/calendar/booking.routes.test.ts` (todas as 8 asserções de RLS/tenancy/owner
  já existentes) intactos; `tests/e2e/accessibility.spec.ts` (`'Agenda não tem violações críticas/
  sérias'`, rota `/app/calendar`) intacto.
- **Achado ambiental — mesma quebra dos Pilotos 018/019, corrigida da mesma forma**: adicionar
  `useAuth()` a `Calendar.tsx` quebrou o teste de componente existente
  (`'useAuth deve ser usado dentro de um AuthProvider'`), corrigido com o mesmo padrão
  `vi.mock('@/contexts/AuthContext', ...)`. Além disso, minha checagem de conflito de horário
  (`prisma.activity.findFirst`) quebrou 5 dos testes de `booking.routes.test.ts` porque o mock de
  `prisma` daquele arquivo não declarava `activity.findFirst` (`TypeError`, capturado como 500
  genérico) — corrigido adicionando o mock que faltava (`activityFindFirst`, default `null` = sem
  conflito) e um teste novo de regressão (409 quando já existe uma Activity no mesmo horário).
- **Verificação**: `npx eslint --no-cache` nos arquivos tocados (limpo), `npx tsc --noEmit -p .`
  (0 erros no projeto inteiro), `npx vite build` (sucesso), `npx vitest run -c
  vitest.unit.config.ts` em `calendar.test.tsx` (9/9, incluindo o teste novo de RBAC),
  `calendar/booking.routes.test.ts` (14/14, incluindo o teste novo de conflito de horário) e
  `src/features/calendar/__tests__` (calendar.util, 11/11) — 34/34 no total, `PORT=3096 npx
  playwright test tests/e2e/accessibility.spec.ts -g "Agenda"` (1/1 passando, depois de corrigir a
  regressão de contraste introduzida e detectada pelo próprio teste).
- **Aprendizado incorporado**: quinta confirmação seguida (Pilotos 017-020) do padrão de RBAC
  desalinhado — já é previsível o suficiente para checar por padrão em qualquer módulo novo, não
  mais tratado como surpresa. Primeira vez nesta série em que o próprio e2e de acessibilidade
  (não um teste unitário) pegou uma regressão introduzida pela minha correção — reforça o valor de
  rodar a suíte e2e de acessibilidade mesmo em pilotos que "só" mexem em cor, e o cuidado extra
  necessário sempre que uma correção usa opacidade (`/NN`) sobre um token de texto em vez do token
  cheio. Primeira vez em que uma correção de backend (checagem de conflito) exigiu atualizar um mock
  de teste existente por adicionar uma chamada Prisma nova (`findFirst`) — o mesmo cuidado de "toda
  chamada Prisma nova precisa existir no mock" que já vale para `create`/`update`/`delete` também
  vale para `findFirst`/`findMany` adicionados a um handler já coberto por teste.

## Pilot 021 — Notifications

- **Objetivo**: nono módulo do roadmap, seguido em sequência sem pausar para confirmação.
- **Achado principal — bug real de integridade de dado, mesma classe do double-booking do Piloto
  020**: `Notification.userId: null` significa "para toda a organização" (broadcast), mas o schema
  não tem tabela de leitura por-destinatário — `readAt` é uma única coluna na própria linha.
  `markRead`/`remove` tratavam broadcast como "todo mundo é dono" (`OR: [{userId}, {userId:null}]`),
  e **nenhum dos 5 pontos reais de criação de notificação do sistema jamais define `userId`** — ou
  seja, 100% das notificações reais hoje são broadcast. Consequência: **qualquer usuário podia
  excluir permanentemente um alerta de equipe** (ex.: "Importação do Bitrix24 bloqueada", alerta
  crítico de Inteligência Comercial) antes que os outros o vissem — a própria notificação criada
  pra avisar todo mundo podia ser silenciada por qualquer um deles com um clique, sem confirmação
  nenhuma. Corrigido no backend: `remove()` agora recebe `canManageBroadcast` (calculado via
  `hasRequiredRole(role, ['ADMIN','GESTOR'])` na rota) e só inclui `{userId: null}` no filtro de
  posse quando o ator tem esse papel — notificação pessoal continua removível só pelo próprio dono,
  qualquer papel. **Não fiz a correção completa** (tabela de leitura por-destinatário, que
  resolveria também o problema mais brando de "marcar como lida" silenciar o badge pra todo mundo)
  — exigiria migração de schema nova, fora do escopo deste piloto; documentado abaixo.
- **Achado de UX/segurança secundário**: excluir notificação era a única ação destrutiva do módulo
  sem `confirm()` nenhum (nem nativo) — diferente do padrão do resto do app. Adicionado
  `window.confirm()` antes de excluir, e o botão de excluir agora só aparece quando o usuário pode
  de fato executar a ação (`canDelete = !isBroadcast || canManageBroadcast`), calculado a partir do
  novo campo `userId` (adicionado ao `select` do `list()` e ao tipo `NotificationItem` — antes nem
  chegava ao cliente, então a UI não tinha como saber se uma notificação era pessoal ou broadcast).
- **Achado real de acessibilidade (WCAG 2.1.1, falha de teclado)**: o card clicável de cada
  notificação era um `<div>` (via `Card`) com `onClick` mas sem `role`/`tabIndex`/`onKeyDown` — um
  usuário de teclado não conseguia nem alcançar (Tab pula) nem ativar (Enter/Espaço não fazem nada)
  a ação de marcar como lida. O e2e de acessibilidade (axe-core) não pega esse tipo de falha por
  padrão (sem `role` declarado, não há nada pro linter de ARIA reclamar) — só um teste funcional de
  teclado revela o problema, por isso ele nunca apareceu como falha antes. Corrigido com o mesmo
  padrão já usado em `DraggableActivity`/`Calendar.tsx` (Piloto 020): `role="button"`,
  `tabIndex={0}`, `onKeyDown` tratando Enter/Espaço. Novo teste unitário cobre o fluxo via teclado.
- **Vitrine de dado real subaproveitado, avaliado e não corrigido por escopo**: `entity`/`entityId`
  (schema comenta explicitamente: "para a notificação poder levar o usuário ao lead/atividade que a
  gerou") já chegam até o cliente, mas `Notifications.tsx` nunca os lê — clicar numa notificação só
  marca como lida, nunca navega até a origem. Investigado: não existe hoje nenhum mecanismo de
  "abrir lead/atividade específico por id" no app (`CrmBoard.tsx` não aceita um `leadId` inicial via
  URL/state para auto-abrir o drawer de detalhe) — implementar a navegação exigiria construir esse
  deep-link dentro de `CrmBoard.tsx`, um módulo diferente e maior, não só ler um campo já presente
  em `Notifications.tsx`. Diferente dos achados de "capacidade órfã" mais simples desta série
  (Cadence/Automations/Knowledge Base), aqui a peça que falta é cross-module — fica sinalizado para
  task futura, não construído aqui.
- **Achado de arquitetura, documentado, não é bug**: `sse.service.ts` mora na mesma pasta
  `features/notifications/` e no mesmo prefixo `/api/notifications/stream`, mas é um sistema
  completamente à parte (evento efêmero de qualificação por voz, `voiceResult.webhook.ts`) — nunca
  passa por `notificationService`, nunca aparece na tela `/app/notifications`, nunca conta pro
  badge do sino. Só é consumido por `CrmBoard.tsx` (toast + refetch do Kanban). Não é um bug (os
  dois sistemas funcionam isoladamente), mas é uma armadilha de manutenção real — documentado para
  não ser confundido como "o mesmo sistema" numa reestruturação futura.
- **Cosmético**: `KIND_STYLE` (mapa de ícone por severidade) usava `text-sky-300`/`emerald-300`/
  `amber-300`/`red-300` — tons feitos pra fundo escuro, nunca medidos contra `--surface` claro,
  exatamente o padrão que `globals.css` já documenta ter reprovado 4.5:1 no passado (comentário
  DQA sobre `--color-info` cru). Convertidos para os tokens semânticos com par `-active`
  (`info-active`/`success-active`/`warning-active`/`danger-active`). `text-gray-600` (estado vazio)
  → `text-ink-2`; `text-amber-400` (erro) → `danger` (é erro, não aviso); botão de excluir
  (`hover:text-red-400 hover:bg-red-500/10`) → `danger`/`danger-active`. `aria-label` adicionado ao
  botão de excluir (mantendo o `title`). `type="button"` adicionado nos botões de filtro/marcar
  todas/tentar novamente.
- **Preservado**: nenhuma migração. Textos exatos de `tests/unit/features/notifications.test.tsx`
  (`'Nenhuma notificação ainda'`, `'Lead chegou em Proposta'`, `'Tudo em dia'`, `'1 não lida'`,
  `getByRole('button', {name: 'Não lidas'})`) e de `tests/unit/features/notification-service.test.ts`
  (regras de posse/tenant já existentes) intactos; `tests/e2e/accessibility.spec.ts`
  (`'Notificações não tem violações críticas/sérias'`, rota `/app/notifications`) intacto.
- **Achado ambiental — mesma quebra dos Pilotos 018/019/020, corrigida da mesma forma**: adicionar
  `useAuth()` a `Notifications.tsx` quebrou 6 dos 10 testes de componente existentes, corrigido com
  o mesmo `vi.mock('@/contexts/AuthContext', ...)`. Diferente dos pilotos anteriores, aqui a
  mudança de assinatura de `remove()` (novo parâmetro `canManageBroadcast`) também exigiu atualizar
  um teste de serviço que fazia uma asserção estrutural sobre o `where.OR` da query — corrigido
  passando o novo parâmetro explicitamente nos 2 testes existentes e adicionando 2 novos (com/sem
  permissão de gerenciar broadcast).
- **Verificação**: `npx eslint --no-cache` nos arquivos tocados (limpo), `npx tsc --noEmit -p .`
  (0 erros no projeto inteiro), `npx vite build` (sucesso), `npx vitest run -c
  vitest.unit.config.ts` em `notifications.test.tsx` (12/12, incluindo os 2 testes novos) e
  `notification-service.test.ts` (16/16, incluindo os 2 testes novos de `remove`) — 24/24 no
  total (mais os que já rodavam antes do piloto), `PORT=3100 npx playwright test
  tests/e2e/accessibility.spec.ts -g "Notificações"` (1/1 passando).
- **Aprendizado incorporado**: primeira vez nesta série em que o achado de maior severidade não é
  "UI oferece ação que o backend sempre rejeita" (padrão dos Pilotos 017-020) nem "campo/rota
  órfã", mas uma regra de posse real que estava genuinamente errada para o caso de uso majoritário
  do sistema (broadcast, não notificação pessoal) — vale continuar perguntando, pra cada `OR`/regra
  de "dono ou null", **qual dos dois braços é o caso comum na prática**, não só se a query compila.
  Segunda vez confirmando (depois do Piloto 020) que um teste de acessibilidade automático
  (axe-core) não é suficiente sozinho para pegar falhas de teclado quando o elemento não declara
  `role` nenhum — vale considerar, pra elementos clicáveis não-semânticos descobertos em pilotos
  futuros, testar Tab+Enter manualmente ou via teste unitário, não só confiar no e2e de a11y.

## Pilot 022 — Billing (tela "Consumo de IA")

- **Objetivo**: décimo módulo do roadmap, seguido em sequência sem pausar para confirmação.
- **Confirmado antes de qualquer coisa**: não há pagamento real neste módulo — o próprio código já
  documenta isso explicitamente (`usage.service.ts:4-10`, banner de UI em `Billing.tsx:128-137`):
  não existe plano, assinatura nem provedor de pagamento no sistema; o que existe é `AILog` (custo
  estimado de chamadas de IA a partir de uma tabela de preços interna). Sem Stripe/checkout/cartão
  em lugar nenhum — seguro tratar como tela de telemetria de custo, não como fluxo financeiro.
- **Achado principal — RBAC ao contrário do padrão usual desta série**: nos Pilotos 017-021 o
  problema sempre foi "UI mostra ação que o backend rejeita". Aqui o backend já protege
  corretamente (`GET /api/usage` exige `ADMIN` desde uma auditoria anterior,
  `bootstrap/routes.ts:109`) e a Sidebar já escondia o item de menu — mas a **rota de frontend**
  (`src/App.tsx:265`) nunca tinha o gate `<RequireRole>` que as outras duas rotas ADMIN-only do
  mesmo arquivo (`team`, `commercial_intelligence`) já usam. Resultado real: um usuário não-ADMIN
  que digitasse `/app/usage` direto na URL via a casca inteira da tela renderizar, a chamada de API
  falhar com 403, e a mensagem de erro **em inglês cru** do `requireRole` aparecer dentro do card
  de erro — em vez da tela "Acesso restrito" em PT-BR que `RequireRole` já resolve exatamente para
  esse cenário (o próprio componente documenta esse bug como motivo de sua existência). Corrigido
  envolvendo a rota `usage` em `<RequireRole allowedRoles={['ADMIN']}>`, idêntico ao padrão de
  `team`. Também corrigido um comentário desatualizado em `Sidebar.tsx` que ainda afirmava
  "GET /api/usage hoje não tem checagem de papel nenhuma no backend" — checagem já existia, só o
  comentário nunca foi atualizado no mesmo commit que a introduziu.
- **Vitrine de dado real subaproveitado — décima confirmação**: `AILog.promptId` (ex.:
  `'meeting-synthesis'`, `'churn-prediction-analysis'`, `'knowledge-rerank'`) já é gravado em toda
  chamada real de IA (17+ pontos de chamada catalogados em `prompt-registry.ts`), mas a consulta de
  consumo (`usage.service.ts`) nunca selecionava nem agrupava por essa dimensão — só por `model`,
  escondendo qual **funcionalidade do produto** gastou o quê (ex.: dá pra saber que "gpt-4o-mini"
  custou X, mas não que "resumo de reunião" custou Y e "análise de churn" custou Z). Adicionado
  `prisma.aILog.groupBy({ by: ['promptId'] })` (mesmo padrão do `groupBy` por `model` já existente)
  e uma nova seção "Por funcionalidade (prompt)" na tela, com chamadas sem prompt registrado
  rotuladas como "Não identificado" em vez de somem do relatório (mesmo raciocínio já usado para
  `unattributedCalls`).
- **Cosmético**: badge/barra de cota de tokens usava `amber-500`/`emerald-500` **exatos** (mesmo
  hex de `--color-warning`/`--color-success`, confirmado em `globals.css`) só que via classe
  Tailwind crua, perdendo o ajuste de contraste `-active` que o próprio design system já calibrou
  pro tema claro — convertido para `warning`/`warning-active`/`success`/`success-active`.
  `text-amber-400` (ícone de erro) → `danger` (é erro, não aviso); `text-gray-600` (estado vazio) →
  `text-ink-2`. `type="button"` adicionado aos botões de período e ao botão de recarregar. Corrigido
  de passagem: `text-red-300` em `AiGatewayShowcase.tsx` (outro consumidor da mesma rota
  `/api/usage`, fora da pasta do módulo mas mesmo achado) → `danger`/`danger-active`.
- **Fora de escopo, documentado**: `usage.routes.test.ts` monta seu próprio Express sem o
  middleware `requireRole` real (injeta `role: 'ADMIN'` manualmente no teste) — a proteção
  ADMIN-only da rota em produção não tem nenhum teste automatizado dedicado que exercite o
  middleware de verdade. Não corrigido neste piloto (é uma lacuna de teste de infraestrutura, não
  um bug de UI); sinalizado para task futura.
- **Preservado**: nenhuma migração. Textos exatos de `tests/unit/features/billing/components/
  Billing.test.tsx` (`'Consumo de IA'`, `'US$ 12.35'`, `'gpt-4o-mini'`, `'Nenhuma chamada de IA no
  período'`, `'Tentar novamente'`, rótulo `'7d'`) e de `usage.routes.test.ts` (saturação 7/90 dias,
  propagação de erro) intactos — nenhum já dependia da ausência de `byPrompt`, e o novo campo foi
  adicionado com checagem nula (`data.byPrompt && ...`) para não quebrar se algum mock antigo não
  o incluir. `tests/e2e/accessibility.spec.ts` (`'Uso/Faturamento não tem violações críticas/
  sérias'`) intacto — confirmado que `signUp()` do e2e sempre cria um `ADMIN` (primeiro usuário de
  uma organização nova), então o novo `RequireRole` não interfere no caminho feliz do teste.
- **Verificação**: `npx eslint --no-cache` nos arquivos tocados (limpo), `npx tsc --noEmit -p .`
  (0 erros no projeto inteiro), `npx vite build` (sucesso), `npx vitest run -c
  vitest.unit.config.ts tests/unit/features/billing` (12/12 passando, sem nenhuma quebra —
  `Billing.tsx` não usa `useAuth()` diretamente, o RBAC vive inteiramente no roteamento via
  `RequireRole`, então não houve a quebra de `AuthProvider` vista nos Pilotos 018-021), `PORT=3105
  npx playwright test tests/e2e/accessibility.spec.ts -g "Uso"` (1/1 passando).
- **Aprendizado incorporado**: primeiro módulo desta série em que o achado de RBAC é "rota de
  frontend sem guarda" em vez de "UI mostra ação que o backend rejeita" — mesma família de bug
  (usuário vê algo que não devia), mas o mecanismo de correção certo já existe pronto no próprio
  código (`RequireRole`, cujo comentário documenta exatamente esse padrão de bug) — vale, em
  qualquer piloto futuro, checar `App.tsx` por rotas ADMIN-only sem `RequireRole` como parte do
  checklist de RBAC, não só o componente da tela em si. Confirma pela quinta vez a heurística mais
  simples desta série inteira: "que dado real já existe no schema/log mas nunca vira uma dimensão
  de agrupamento na tela" continua sendo a pergunta mais barata e mais produtiva a fazer em
  qualquer módulo novo.

## Pilot 023 — Document Editor (`/app/editor`)

- **Objetivo**: décimo primeiro módulo do roadmap, seguido em sequência sem pausar para
  confirmação.
- **Achado prévio de escopo**: o nome do módulo é enganoso. `/app/editor` não edita propostas
  comerciais (isso é `/app/propostas`, módulo `crm360`, fora deste piloto) — é uma **segunda tela**
  para o mesmíssimo modelo `Document`/`DocumentChunk` (RAG) já coberto por `Base.tsx`
  (`/app/knowledge`, Pilotos 019/021). `proposal-ai.service.ts` mora fisicamente na mesma pasta
  (`document-editor/`) mas não tem relação nenhuma com esta tela — é consumido por
  `AISuiteHub.tsx`, achado de organização registrado, não corrigido (mexeria em outro módulo).
- **Achado principal — o mesmo bug de RBAC do Piloto 019, nunca replicado na tela-irmã**:
  `PUT /api/knowledge/:id` exige `ADMIN`/`GESTOR`/`CLOSER`/`SDR` (mesmo `writeRoles` de
  `Base.tsx`), mas `Editor.tsx` nunca verificava papel — um `VISUALIZADOR` editava título/conteúdo
  livremente e só descobria a falta de permissão com um 403 em inglês ao clicar "Salvar". O
  comentário que já documenta esse exato padrão de bug está em `Base.tsx` desde o Piloto 019 — só
  não tinha sido replicado aqui. Corrigido com o mesmo `canWrite` (`hasRequiredRole`): botões
  "Salvar"/"Descartar" somem por completo, e os campos de título/conteúdo passam a `readOnly`
  (mantendo a leitura liberada, já que `GET` não exige papel — diferente de simplesmente esconder a
  tela inteira atrás de um `<RequireRole>` de rota, que bloquearia até a leitura que o backend já
  permite). Criado o primeiro teste automatizado da tela (`tests/unit/features/
  document-editor.test.tsx`, zero cobertura antes deste piloto): 5 casos incluindo o cenário de
  RBAC (`VISUALIZADOR` não vê os botões e os campos ficam `readOnly`).
- **Retrabalho corrigido**: `Editor.tsx` chamava `api.get`/`api.put` cru com paths hardcoded em vez
  de usar `knowledgeApi.get`/`knowledgeApi.update` (client já existente, testado, tipado — criado
  no Piloto 019 mas com um comentário afirmando "sem nenhum consumidor de UI", que já estava errado
  porque `Editor.tsx` os consumia de forma crua). Refatorado para usar o client compartilhado;
  comentário do client atualizado para refletir os dois consumidores reais (`Base.tsx`/`Editor.tsx`).
- **Vitrine de dado real subaproveitado — décima primeira confirmação, reincidente na tela-irmã**:
  `version` nem estava declarado no tipo local `FullDocument` (removido; a tela agora usa o tipo
  `KnowledgeDocument` compartilhado, que já tem o campo desde o Piloto 019); `sourceName`/
  `sourceType`/`updatedAt` já chegavam na resposta mas nunca apareciam na tela. Adicionada uma linha
  de metadados abaixo do título mostrando origem do documento, badge "editado · vN" quando
  `version > 1`, e a data/hora da última atualização — mesmo tratamento já dado a esses campos em
  `Base.tsx`.
- **Cosmético**: `text-amber-400` (ícone de erro) → `danger` (é erro, não aviso); `text-gray-600`
  (estado vazio) → `text-ink-2`; `text-amber-300` ("alterações não salvas") → `warning`/
  `warning-active`. `type="button"` adicionado aos botões Salvar/Descartar/item da lista/Tentar
  novamente.
- **Fora de escopo, documentado**: `Editor.tsx` não tem acesso ao Assistente de Redação IA, Gerar
  FAQ, Revetorizar nem Excluir documento — todos já existem prontos em `Base.tsx`, mas replicá-los
  aqui seria construir paridade de feature completa entre duas telas do mesmo domínio, escopo maior
  que um ajuste pontual de piloto; sinalizado, não construído. `aria-current={boolean}` (deveria ser
  `'true'`/`undefined` para não emitir `aria-current="false"` no DOM) — nit de baixa prioridade, não
  corrigido.
- **Preservado**: nenhuma migração. Único teste e2e pré-existente
  (`tests/e2e/accessibility.spec.ts:276-281`, `'Editor de documentos não tem violações críticas/
  sérias'`) intacto — confirmado que roda sempre como `ADMIN` (mesmo `signUp()` dos outros
  pilotos), então nunca exercitava o bug de RBAC corrigido aqui; a cobertura de RBAC agora vem do
  novo teste unitário, não do e2e.
- **Verificação**: `npx eslint --no-cache` nos arquivos tocados (limpo), `npx tsc --noEmit -p .`
  (0 erros no projeto inteiro), `npx vite build` (sucesso), `npx vitest run -c
  vitest.unit.config.ts tests/unit/features/document-editor.test.tsx` (5/5 passando, arquivo novo),
  `PORT=3110 npx playwright test tests/e2e/accessibility.spec.ts -g "Editor de documentos"` (1/1
  passando).
- **Aprendizado incorporado**: primeira vez nesta série em que uma correção de RBAC já tinha um
  precedente exato, documentado, na tela-irmã do mesmo domínio de dados — e mesmo assim não tinha
  sido aplicado. Reforça que, ao auditar um módulo, vale perguntar explicitamente "existe outra
  tela no repositório consumindo o mesmo model/rota, e ela já resolveu esse problema?" — a resposta
  aqui era sim, e a correção foi replicar um padrão já pronto, não inventar um novo. Também reforça
  o valor de criar um teste de RBAC mesmo quando ele é o primeiro teste da tela inteira: a ausência
  total de cobertura anterior é, por si só, parte do motivo do bug ter sobrevivido sem ser notado.

## Pilot 024 — Team (Equipe/Usuários)

- **Objetivo**: décimo segundo módulo do roadmap, seguido em sequência sem pausar para confirmação.
  Módulo sensível por natureza (convites, papéis, remoção de usuário) — auditoria pedida com
  atenção redobrada a regras de segurança, não só UI.
- **Confirmado como já correto, antes de qualquer coisa**: RBAC deste módulo já estava bem
  desenhado — `requireRole(['ADMIN'])` no backend, `<RequireRole allowedRoles={['ADMIN']}>` na
  rota de frontend (já corrigido nesse padrão desde antes, `App.tsx:278-285`), item de menu
  escondido corretamente na Sidebar, auto-exclusão bloqueada nos dois lados (backend +
  `disabled` no botão com `title` explicando o motivo), auto-promoção de papel bloqueada numa
  camada ainda mais funda (`src/lib/auth.ts`, `role: { input: false }` no Better Auth). Nenhum
  desalinhamento de RBAC encontrado aqui — diferente dos 7 módulos anteriores.
- **Achado principal — risco real, "seguro por acidente de design"**: excluir o último `ADMIN` da
  organização nunca foi tecnicamente possível pela UI atual, mas só porque duas outras proteções
  (bloqueio de auto-exclusão + ausência de qualquer função de editar papel) coincidem para impedir
  isso — não havia nenhuma trava explícita contra esse cenário em `deleteTeamMember`. Se uma função
  de "editar papel" fosse adicionada no futuro sem essa checagem, rebaixar/remover o último ADMIN
  passaria a ser possível sem aviso. Corrigido com uma trava explícita: antes de excluir um usuário
  com `role === 'ADMIN'`, conta quantos ADMINs restam na organização e recusa com 400 se for o
  único. Coberto por 5 testes novos de serviço (primeiro teste automatizado do módulo inteiro).
- **Vitrine de dado real subaproveitado — décima segunda confirmação, com ação nova (não só
  exibição)**: `User.lockedUntil`/`failedLoginAttempts` (bloqueio de conta após 5 tentativas de
  login erradas, `src/lib/auth.ts`) são gravados de verdade no schema, mas a única tela onde um
  ADMIN procuraria isso (`Team.tsx`) nunca os selecionava nem exibia — a única saída para destravar
  um colega bloqueado era esperar 15 minutos ou mexer direto no banco. Corrigido: campos
  adicionados ao `select` compartilhado do serviço (`TEAM_MEMBER_SELECT`, usado pelas 4 funções que
  retornam um `TeamMember`), badge "bloqueado até HH:mm" na lista, e uma nova ação "Desbloquear"
  (só aparece quando o usuário está de fato bloqueado) chamando uma rota nova
  `POST /api/team/:id/unlock` (zera `lockedUntil`/`failedLoginAttempts`). Diferente da maioria dos
  achados de "capacidade órfã" desta série, aqui a rota em si não existia — foi construída (padrão
  pequeno e bem delimitado, mesma categoria de adição já feita em Cadence/Automations/Knowledge
  Base neste mesmo conjunto de pilotos).
- **Cosmético**: botão "Criar usuário" usava `bg-brand-active` (token dinâmico, correto) mas
  `hover:bg-orange-600` fixo — a única inconsistência de marca do arquivo: uma organização Total
  Trac (marca azul) via o botão principal ficar laranja no hover. Corrigido para `hover:bg-brand-2`,
  mesmo padrão já usado em `Button.tsx`/`CallSetup.tsx`/`ChatbookHub.tsx` e outros. `aria-label`
  adicionado aos botões de redefinir senha e excluir (mantendo o `title` em ambos).
- **Fora de escopo, documentado**: `confirm()` nativo em redefinir-senha/excluir — mesmo padrão já
  registrado fora de escopo em 5 pilotos anteriores (12+ arquivos do app inteiro). Validação
  client-side do domínio de e-mail corporativo (só existe no backend hoje) — duplicar a lista de
  domínios permitidos no frontend arriscaria divergência; o erro do backend já aparece
  corretamente. Editar o papel de um usuário já existente (hoje só dá pra excluir e recriar) —
  funcionalidade real ausente dos dois lados (nem rota, nem UI), mas construir isso é escopo de
  feature nova, não ajuste pontual; sinalizado para task futura, com a trava do último ADMIN deste
  piloto já preparada para proteger essa função quando ela existir. `emailVerified`/`bitrixUserId`/
  `image`/`updatedAt` do `User` nunca exibidos — valor menor que o achado de bloqueio, não
  corrigido.
- **Preservado**: nenhuma migração. Textos exatos de `tests/unit/components/layout/Sidebar.test.tsx`
  (regex `/^Equipe$/`/`/Equipe/` por papel) e `RequireRole.test.tsx` (`'Acesso restrito'`,
  `/permissão de ADMIN/`) intactos; `tests/e2e/accessibility.spec.ts` (`'Equipe não tem violações
  críticas/sérias'`) intacto.
- **Verificação**: `npx eslint --no-cache` nos arquivos tocados (limpo), `npx tsc --noEmit -p .`
  (0 erros no projeto inteiro), `npx vite build` (sucesso), `npx vitest run -c
  vitest.unit.config.ts` em `tests/unit/features/team/team.service.test.ts` (7/7, arquivo novo —
  trava do último ADMIN + desbloqueio) e `tests/unit/features/team/Team.test.tsx` (5/5, arquivo
  novo — listagem, auto-exclusão desabilitada, badge/botão de desbloqueio, criação de usuário),
  mais confirmação de que `Sidebar.test.tsx`/`RequireRole.test.tsx` continuam passando sem
  alteração, `PORT=3115 npx playwright test tests/e2e/accessibility.spec.ts -g "Equipe"` (1/1
  passando).
- **Aprendizado incorporado**: primeiro módulo desta série de 12 pilotos em que a auditoria de RBAC
  não encontrou nenhum desalinhamento — mas isso não significa "nada a fazer": o achado real veio
  de perguntar "essa proteção é uma regra de negócio testada, ou um acidente de duas outras
  ausências que coincidem por enquanto?", pergunta diferente de "a UI esconde o que o backend
  rejeita?". Vale levar essa pergunta para módulos futuros com regras de segurança compostas (ex.:
  "X só é seguro porque Y e Z também são verdade hoje"). Reforça pela segunda vez (depois do
  Piloto 023) que criar a primeira suíte de teste de um módulo inteiro, mesmo pequena, é parte
  legítima e valiosa do trabalho de um piloto — não só o ajuste em si.

## Pilot 025 — Settings (Configurações, Feature Flags, Auditoria & LGPD)

- **Objetivo**: décimo terceiro e último módulo do roadmap original, seguido em sequência sem
  pausar para confirmação. Módulo composto por 5 abas (Perfil, Usuários, Integrações, Feature
  Flags, Auditoria & LGPD) — as duas primeiras e a de Integrações já auditadas/pilotadas em
  rodadas anteriores (Team, Integrations); este piloto focou em `Settings.tsx` em si, Feature
  Flags e a aba de Auditoria & LGPD.
- **Achado principal — funcionalidade inteira do produto nunca funcionou, para ninguém**:
  `GET /api/lgpd/audit-logs` devolvia `{ success: true, logs }` (chave `logs` na raiz) em vez do
  envelope padrão `{ success: true, data: {...} }` que o resto da API usa. O cliente HTTP genérico
  (`src/lib/api.ts`) sempre desembrulha `data.data` quando `success` está presente — como não
  havia chave `data`, toda chamada devolvia `undefined`, e `AuditLogs.tsx` (`res.logs || []`)
  sempre caía num `TypeError` capturado silenciosamente como erro genérico. **A aba "Auditoria &
  LGPD" nunca mostrou nenhum registro, para nenhum usuário, desde sempre** — mesma classe de "a
  funcionalidade nunca funcionou" já vista no Piloto 015 (criação de atividade), mas desta vez o
  bug é de contrato entre camadas (nome de chave), não de schema. Corrigido ajustando a resposta do
  backend para `{ success: true, data: { logs } }` — como o cliente já espera exatamente esse
  formato, **nenhuma mudança de leitura foi necessária no componente** além de tipar a chamada
  corretamente (`res: any` → `api.get<{ logs: AuditLogItem[] }>`). Coberto por 3 testes novos.
- **Achado de RBAC — direção invertida em relação ao padrão dos 5 pilotos anteriores**: o backend
  de auditoria (`lgpd.routes.ts`, `requireRole(['ADMIN','GESTOR'])`) já autoriza GESTOR
  explicitamente (e isso já é testado, `lgpd.routes.test.ts`), mas `Settings.tsx` só mostrava a aba
  "Auditoria & LGPD" para `isAdmin` (checagem estrita de `ADMIN`) — um GESTOR nunca tinha como
  chegar numa ação que o próprio backend permite. Diferente dos Pilotos 017-021 ("UI mostra ação
  que o backend rejeita") e do Piloto 022 ("rota de frontend sem RequireRole"), aqui é **"UI
  esconde ação que o backend permite"** — mesma família de bug de permissão mal espelhada, direção
  oposta. Corrigido trocando a condição de `isAdmin` para
  `hasRequiredRole(currentUser.role, ['ADMIN','GESTOR'])`, alinhando exatamente com o backend.
- **Bug funcional real — os dois botões de tema faziam a coisa errada quando clicados no estado já
  ativo**: "Modo Escuro" e "Modo Claro" chamavam o mesmo `toggleTheme()` (um alternador binário) em
  vez de `setThemeMode('dark')`/`setThemeMode('light')` (que o próprio `ThemeContext` já expõe
  pronto para exatamente esse caso). Efeito: clicar no botão do tema **já ativo** trocava para o
  oposto — o botão "Modo Escuro", visualmente marcado como selecionado, virava o app para claro ao
  ser clicado. Corrigido usando `setThemeMode` diretamente em cada botão (idempotente); adicionado
  `aria-pressed` nos dois (não tinham antes). Coberto por 2 testes novos que provam a idempotência.
- **Achado principal de "capacidade ausente" — direitos do titular da LGPD sem nenhuma UI em todo o
  produto**: `DELETE /api/lgpd/titular/:contactId` (exclusão/anonimização, Art. 18) e
  `GET /api/lgpd/titular/:contactId/export` (portabilidade, Art. 18 V) já existiam prontas,
  testadas ponta-a-ponta (RLS, isolamento cross-tenant, idempotência da anonimização — teste de
  integração dedicado), mas sem absolutamente nenhum botão em nenhuma tela: se um titular
  exercesse esses direitos junto à empresa, o time comercial não tinha como atender pela interface,
  só chamando a API manualmente. Para um módulo cuja razão de existir é justamente governança LGPD,
  essa é a lacuna mais séria já encontrada nesta série (maior que os achados de "capacidade órfã"
  anteriores, por ser uma obrigação legal, não uma conveniência). Construído: novo componente
  `DataSubjectRights.tsx` na aba de Auditoria — busca de contato por nome/e-mail (mesmo padrão de
  combobox com debounce já usado em Activities/Cadence/Pilot 025 de hoje), botão "Exportar dados"
  (resultado exibido inline) e botão "Excluir/anonimizar dados" (com `window.confirm` explícito
  sobre a irreversibilidade, seguindo o mesmo padrão do resto do app). A aba inteira já é
  `ADMIN`/`GESTOR`-only (corrigido acima), então o novo componente herda o mesmo gate do backend
  sem precisar de checagem própria.
- **Cosmético**: `bg-red-500/10 text-red-400` no card de erro de `AuditLogs.tsx` → `bg-danger/10
  text-danger-active dark:text-danger`; `<select>` de filtro de ação sem `<label htmlFor>`
  associado (só um `<span>` solto) → `<label htmlFor="audit-filter-action">` real.
- **Fora de escopo, documentado**: `confirm()` nativo em `Team.tsx` (reset de senha/exclusão) —
  mesmo padrão já registrado fora de escopo em 6 pilotos anteriores. Knob branco do switch de
  Feature Flags (`bg-white` sem par `dark:`) — convenção universal de controle físico de toggle,
  baixo risco, não corrigido. `User.image` (avatar) nunca exibido no card de perfil — campo real
  mas sem indicação de que algum provedor OAuth o popula hoje; `OrganizationFeatureFlag.
  updatedByUserId`/`updatedAt` (quem alterou um flag e quando) gravados no backend mas nunca
  expostos na API nem na UI — ambos achados reais de "vitrine de dado subaproveitado" (décima
  terceira confirmação da série), mas de valor menor que os 4 achados acima; não corrigidos, para
  não diluir o foco deste piloto já grande. Falta de um caminho de troca de senha voluntária para
  um usuário comum (hoje só um ADMIN pode resetar via aba Usuários) — lacuna funcional plausível,
  não necessariamente um bug; sinalizado, não construído (feature nova, fora de escopo pontual).
- **Preservado**: nenhuma migração. `tests/e2e/accessibility.spec.ts` (`'Configurações não tem
  violações críticas/sérias'`) intacto; `tests/unit/features/lgpd/lgpd.routes.test.ts` (RBAC de
  exclusão/exportação) e `tests/unit/features/feature-flags/featureFlags.service.test.ts`
  continuam passando sem alteração (nenhum dos dois toca a rota de auditoria nem o componente
  Settings).
- **Verificação**: `npx eslint --no-cache` nos arquivos tocados (limpo), `npx tsc --noEmit -p .`
  (0 erros no projeto inteiro), `npx vite build` (sucesso), `npx vitest run -c
  vitest.unit.config.ts` em `tests/unit/features/settings/Settings.test.tsx` (5/5, arquivo novo —
  idempotência do tema + RBAC de aba), `tests/unit/features/lgpd/AuditLogs.test.tsx` (3/3, arquivo
  novo — regressão do envelope), mais `lgpd`/`feature-flags` pré-existentes intactos (22/22 no
  total), `PORT=3120 npx playwright test tests/e2e/accessibility.spec.ts -g "Configurações"` (1/1
  passando). `DataSubjectRights.tsx` (feature nova) não tem teste dedicado ainda — reutiliza
  padrões já testados em outros lugares (combobox de busca), mas registrado com transparência como
  pendente, não fingido como coberto.
- **Aprendizado incorporado**: primeiro piloto desta série com uma funcionalidade inteira
  quebrada por um bug de nome de chave entre camadas (não de schema/RBAC) — vale, ao auditar
  qualquer tela que chame `api.get`/`api.post` e trate a resposta com `any`/sem tipo, checar se o
  shape realmente bate com o que o backend envia, em vez de assumir que "funciona porque não dá
  erro visível" (o erro existia, só era engolido pelo próprio `try/catch` genérico do componente).
  Primeira vez em que um achado de RBAC foi na direção "esconder demais" em vez de "revelar
  demais" — reforça que o checklist de RBAC de cada piloto precisa comparar a condição da UI
  contra a lista *completa* de papéis do `requireRole` do backend, não só perguntar "isso é
  ADMIN-only?". Este foi o décimo terceiro e último módulo do roadmap original (Contacts →
  Settings) — antes de continuar para módulos fora dessa lista original (ex.: Mesa de Tratamento),
  vale perguntar ao usuário se o ciclo deve continuar ou está concluído.

## Pilot 026 — Mesa de Tratamento (fila de trabalho SDR do funil de Lead)

- **Objetivo**: primeiro módulo fora do roadmap original de 13, retomado a pedido explícito do
  usuário depois do fim do ciclo (Piloto 025). Diretório `src/features/mesa-tratamento/`, rota
  `/app/mesa-tratamento`. Confirmado por auditoria: é uma mesa de trabalho de **SDR do funil
  Lead** (não Deal) — fila priorizada de leads do Bitrix24, um card por vez, registro de
  atendimento propagado de volta ao Bitrix.
- **Achado principal — bug de contrato real, funcionalidade quebrada**: o dropdown "Mover etapa no
  Bitrix24" do formulário de registro sempre aparecia com todas as opções em branco. Backend
  (`getLeadStatuses`) devolve `{id, name}`, mas o tipo do client
  (`BitrixLeadStageOption.label`) e o render (`{s.label}`) do frontend usavam uma chave que nunca
  existia no payload — confirmado comparando com o único outro consumidor do mesmo dado
  (`BitrixSyncRulesPanel.tsx`, que já usa `name` corretamente). Corrigido alinhando tipo e render a
  `name`. A ação não era obrigatória (o formulário ainda submetia sem escolher etapa), então o bug
  não travava o fluxo, só deixava uma das duas funcionalidades centrais da tela ("mover etapa
  direto da Mesa de Tratamento") inutilizável.
- **Achado secundário — divergência de dado real entre Atlas e Bitrix**: `POST
  /lead/:id/register` gravava o novo status local (`prisma.lead.update`, ex.
  `Lead_Desqualificado`) **antes** de escrever no Bitrix (`postCommentToBitrix`/
  `exportLeadToBitrixNow`). Se a escrita no Bitrix falhasse depois (rede, webhook inválido, rate
  limit), o Atlas já tinha mudado localmente — o lead podia sumir da fila (filtro
  `OPEN_LEAD_STATUSES`) sem o Bitrix, fonte da verdade do funil de SDR (ver AGENTS.md do módulo),
  ter sido de fato atualizado, e o SDR só via um toast de erro genérico, sem saber que o estado já
  tinha mudado. Corrigido reordenando: os dois envios ao Bitrix agora acontecem antes do
  `prisma.lead.update` — se falharem, nada muda localmente e o erro propagado reflete a realidade.
  Não implementado (nem necessário para o fix): um mecanismo de saga/compensação — reordenar já
  resolve o caso real sem adicionar complexidade nova.
- **RBAC — mesmo padrão "rota de frontend sem `RequireRole`" já corrigido em usage/team/
  commercial_intelligence, mas aqui em dois lugares**: `/api/mesa-tratamento/*` exige
  `ADMIN|GESTOR|CLOSER|SDR` no backend, mas a rota de frontend (`App.tsx`) não tinha
  `<RequireRole>` e o item "Mesa de Tratamento" no grupo "Qualificar" da Sidebar era incondicional
  — um `VISUALIZADOR` via o item, navegava até a tela e só recebia um 403 cru dentro do card de
  erro real, com um botão "Tentar novamente" que nunca poderia funcionar para aquele usuário.
  Corrigido nos dois pontos: `<RequireRole allowedRoles={[...MESA_TRATAMENTO_ROLES]}>` em
  `App.tsx`, e o item da Sidebar tornado condicional (`canAccessMesaTratamento`). Novo
  `MESA_TRATAMENTO_ROLES`/`canAccessMesaTratamento` exportados de `authorization.ts` (mesmo padrão
  de `COMMERCIAL_INTELLIGENCE_ROLES`), pra frontend e backend nunca divergirem sobre quem acessa.
- **Vitrine de dado real subaproveitado (décima quarta confirmação da série)**: `Lead.qualification`
  (checklist de qualificação do SDR, Playbook Comercial AtlasGR §4.2) já era buscado do banco
  (`leadSelect`) mas descartado antes de chegar à API — o SDR decidindo o que fazer agora não via o
  que já sabia sobre o lead. `Lead.owner` também nunca era devolvido, então numa fila
  compartilhada (ADMIN/GESTOR veem o time todo sem filtro) não dava pra saber de quem era cada
  item. `nextAction`/`bitrixStageLabel` já vinham na API mas nunca eram renderizados no card
  principal. Corrigidos: `qualification` (subconjunto de 7 campos mais relevantes pra decisão —
  dor, solução Atlas, autoridade, interesse, horizonte, tema da próxima reunião — não o checklist
  inteiro de ~20 campos) e `owner` adicionados à resposta da API e exibidos (qualificação no card
  principal, condicional a existir algum campo preenchido; `owner` como "Responsável: X" em cada
  item da fila lateral); `nextAction`/`bitrixStageLabel` passaram a ser renderizados no card.
- **Fora de escopo, documentado**: `services/mesa-triage.service.ts`, que mora dentro da pasta
  `mesa-tratamento/` mas implementa uma coisa completamente diferente (triagem de severidade de
  incidentes de segurança de carga — jammer, violação de trava, botão de pânico), sem nenhuma tela
  de operação real (só um playground genérico dentro de `AISuiteHub.tsx`) — nome de pasta
  enganoso/dois domínios coexistindo, mas mover ou decidir o destino real dessa capacidade é
  decisão de arquitetura/produto, não ajuste de piloto; sinalizado, não movido.
  `ai-suite.routes.ts` (onde essa rota mora) não tem `requireRole` em nenhum dos ~20 endpoints do
  catálogo — achado real, mas pré-existente e maior que este piloto, sinalizado à parte. Nenhuma
  ação de reatribuir/comentar/marcar decidido para ADMIN/GESTOR na fila compartilhada — já
  documentado como próxima rodada no próprio AGENTS.md do módulo, não construído aqui.
- **Preservado**: nenhuma migração. Textos exigidos pelas duas suítes genéricas que tocam o módulo
  (`tests/e2e/accessibility.spec.ts` — `'Mesa de Tratamento não tem violações críticas/sérias'`;
  `tests/e2e/mobile-sweep.spec.ts` — módulo `'mesa-tratamento'` na varredura) intactos — ambas só
  exercitam o estado "Bitrix24 não conectado" (sem `BitrixConnection` no fixture de teste), então
  não tocam `CurrentLeadCard.tsx`/`QueueList.tsx` de verdade; nenhuma delas cobria os achados deste
  piloto antes da correção.
- **Achado de teste, corrigido**: o módulo não tinha nenhum teste unitário — `rankLeadsForQueue`
  (lógica pura de ordenação da fila, `mesaTratamento.priority.ts`) nunca foi testada. Primeiro
  teste do módulo criado: `tests/unit/features/mesa-tratamento/mesaTratamento.priority.test.ts` (6
  casos — urgência de etapa, dias sem toque, lead nunca tocado, desempate por temperatura,
  imutabilidade do array de entrada, etapa desconhecida no fim da fila).
- **Verificação**: `npx eslint --no-cache` nos arquivos tocados (limpo), `npx tsc --noEmit -p .`
  (0 erros atribuíveis a este piloto), `npx vite build` (sucesso), `npx vitest run -c
  vitest.unit.config.ts tests/unit/features/mesa-tratamento` (6/6, arquivo novo).
- **Aprendizado incorporado**: primeiro piloto desta série cujo achado principal é um bug de
  contrato de nome de campo (`label` vs. `name`) entre backend e frontend dentro do próprio módulo
  — mesma classe de vigilância já registrada no Piloto 025 (Settings), mas ali era API↔UI; aqui é
  provedor-externo↔tipo-local. Vale, ao auditar qualquer tela que renderize dado vindo de uma
  integração externa (Bitrix, aqui), comparar o tipo declarado no frontend contra outro consumidor
  real do mesmo endpoint antes de assumir que o campo existe. Também a primeira vez que um achado
  de integridade de dado (3.2) envolveu ordem de escrita entre dois sistemas (Atlas e Bitrix), não
  RBAC nem soft-delete — o princípio geral fica registrado aqui: quando um sistema externo é "fonte
  da verdade" documentada, a escrita local nunca deveria commitar antes da escrita externa
  confirmar sucesso.

## Onda — Resolução paralela de itens "fora de escopo" dos Pilotos 016-024

- **Objetivo**: a pedido explícito do usuário ("lançar agentes em paralelo para resolver os fora de
  escopo"), 8 agentes rodaram em paralelo (sem worktree - perderia o diff acumulado de 25+ pilotos
  ainda não commitado; cada agente ficou restrito a um módulo/pasta sem sobreposição de arquivo com
  os demais) resolvendo itens já documentados como "fora de escopo" em pilotos anteriores. Escopo
  deliberadamente restrito ao lote de baixo risco (dado real subaproveitado, bugs pequenos, lacuna
  de teste) - itens que exigiam rota de backend nova, decisão de integridade de dado/LGPD, ou eram
  features inteiras (unificar motores de IA do Roleplay, persistir Roleplay no Prisma, dashboards
  WhatsApp/3CX, paridade de IA no Document Editor, editar papel de usuário, confirm() nativo para
  diálogo estilizado, etc.) ficaram de fora - sinalizados, não resolvidos, mesma disciplina de
  proporcionalidade de todos os pilotos anteriores.
- **Playbook (Piloto 017)**: bug real de paginação corrigido - findItems aceitava page/limit mas os
  use cases chamavam com página fixa (1, 200) e o client descartava meta; itens além de 200 por
  marca somiam silenciosamente. Corrigido com paginação real ponta-a-ponta (UI usa o Pagination já
  existente, mesmo padrão de CompanyList/ContactList) nas duas telas (Matriz de Qualificação e
  Matriz de Objeções). usePlaybookMatrixData.ts (consumido pelo Chatbook, fora do escopo do agente)
  deliberadamente preservado sem alteração de contrato. createdAt/updatedAt agora exibidos (rodapé
  discreto, padrão já usado em KanbanCard.tsx).
- **Knowledge Base (Piloto 019)**: rerankScore (reranking via LLM) agora exibido como badge no card
  de resultado; aviso "conteúdo truncado na indexação" adicionado quando metadata.truncated.
  Achado extra durante a implementação: ingestion.service.ts não recalculava
  metadata.truncated/originalChunkCount ao reeditar um documento já truncado - corrigido para não
  deixar o novo badge mostrando informação obsoleta.
- **Document Editor (Piloto 023)**: aria-current={boolean} corrigido para aria-current={condição ?
  'true' : undefined} (evita aria-current="false" sendo lido como "item atual" por leitor de tela).
- **Settings (Piloto 025)**: knob branco do switch de Feature Flags analisado e classificado como
  não-bug (convenção universal de toggle físico, contraste real conferido nos tokens - sem
  combinação tema×estado onde fique ilegível), documentado em vez de alterado sem necessidade.
  User.image (avatar) e updatedByUserId/updatedAt de cada override de feature flag agora expostos e
  exibidos.
- **Team (Piloto 024)**: emailVerified/bitrixUserId/image/updatedAt do usuário agora exibidos no
  card de cada membro (selo de verificação, avatar real com fallback de iniciais, pill de ID
  Bitrix, "atualizado em").
- **Cadence (Piloto 016)**: CadenceTouchAttempt.providerMessageId agora exibido (monoespaçado,
  truncado com tooltip) na tabela expandida de tentativas - sem tocar a ação de desativar/excluir
  sequência (fora de escopo, exige rota nova).
- **Automations (Piloto 018)**: os campos discriminados de skip de cold call (limite de tentativas,
  cooldown, sem telefone, suprimido, erro) agora detalhados numa segunda linha do card (antes só a
  soma total), sem cor categórica (mesma categoria de dado, contagem).
- **Billing (Piloto 022)**: lacuna real de teste corrigida - usage.routes.test.ts nunca exercitava
  o requireRole real (injetava role: 'ADMIN' manualmente). Novo
  tests/integration/rbac-e2e-usage.test.ts, seguindo o mesmo padrão de
  rbac-e2e-commercial-intelligence.test.ts (sessão real via Better Auth, Postgres/RLS real). Achado
  colateral: a rota exige ['ADMIN', 'GESTOR'], não só ADMIN como a entrada original do Piloto 022
  registrava - corrigido no teste novo, refletindo a proteção real do bootstrap/routes.ts.
- **Verificação agregada** (depois dos 8 agentes, todo o projeto): tsc --noEmit -p . - só 2 erros
  pré-existentes em src/stories/Button.tsx e Header.tsx ('React' is declared but never read), não
  relacionados a nenhuma mudança deste lote nem tocados por nenhum agente. vite build - sucesso,
  mesmos avisos de chunk size pré-existentes. Cada agente também rodou eslint/tsc/build/vitest
  isolado no seu próprio módulo antes de reportar concluído (resultados individuais nos relatórios
  de cada agente, não repetidos aqui).
- **Aprendizado incorporado**: primeira vez que este processo de pilotos rodou como enxame paralelo
  em vez de sequencial - funcionou porque cada tarefa foi pré-escopada a um módulo/pasta sem
  sobreposição de arquivo antes de disparar os agentes (feito manualmente, lendo os achados reais
  de .claude/PILOTS.md primeiro, não delegando essa triagem). Dois agentes (Settings, Billing)
  precisaram sair do diretório estritamente designado por dependência real de dado/padrão
  (AuthContext.tsx/feature-flags/ para Settings; bootstrap/routes.ts só pra leitura, teste novo em
  tests/integration/ para Billing) - nenhum colidiu com outro agente, mas reforça que "fique dentro
  da pasta X" é uma orientação de baixo risco, não uma garantia; vale revisar o git status agregado
  antes de qualquer commit deste lote, não só confiar no escopo pedido a cada agente.

## Onda 2 — Itens de escopo médio que exigiam rota de backend nova (Pilotos 016, 018, 020)

- **Objetivo**: segunda leva de itens "fora de escopo", desta vez os que exigiam desenhar e criar
  rota de backend nova (não só exibir dado já existente) — deliberadamente separados da Onda 1 por
  isso. 3 agentes em paralelo, um por módulo, mesmo padrão de isolamento de arquivo da Onda 1.
- **Cadence (Piloto 016) — encerrar sequência**: nova `POST /api/cadence/sequences/:id/deactivate`
  (mesmo RBAC de escrita já usado no módulo), passando por um use case novo
  (`application/sequenceService.ts`) e um repositório novo (`infra/PrismaCadenceSequenceRepository.ts`)
  em vez de `prisma.update` cru na rota — decisão de design real tomada pelo agente: **desativação
  reversível** (`active: false`), não exclusão física, porque `CadenceSequence` não está em
  `auditableModels` (`src/lib/prisma.ts`) e nenhuma rota do módulo já grava `deletedAt` hoje — um
  soft-delete de verdade seria um padrão novo sem precedente no módulo, não a continuação de um já
  estabelecido. `CadenceHub.tsx` ganhou uma seção "Sequências" que antes não existia como view
  própria (a lista só existia dentro do `<select>` do diálogo de iniciar execução) com o botão
  "Encerrar sequência".
- **Calendar (Piloto 020) — toggle de link de agendamento público**: nova
  `PATCH /api/calendar/booking-links/:id` (`{active: boolean}`), autorizada para o dono do link OU
  ADMIN/GESTOR (mesmo princípio de `requireLeadOwnership.ts`), devolvendo 404 (não 403) quando o
  link existe mas pertence a outro vendedor — não revela a existência do link a quem não deveria
  vê-lo. Achado real durante a implementação: a rota pública de agendamento (`GET`/`POST /:slug`)
  **já checava `active`** antes desta tarefa — o toggle nasceu funcional de verdade (bloqueia novos
  agendamentos assim que desligado), não cosmético. Switch novo na UI reaproveita o mesmo padrão
  visual/acessível (`role="switch"`, `aria-checked`) do `FlagSwitch` de Feature Flags, como cópia
  local — mesma decisão de "promover a `src/components/ui/Switch.tsx` só quando um terceiro
  consumidor aparecer" já usada no arquivo original.
- **Automations (Piloto 018) — botão "Rodar agora" da varredura de estagnação**: rota
  (`POST /api/automations/stagnation-scan`) já existia, testada, ADMIN-only — só faltava o
  acionamento. Botão colocado no cabeçalho da página (não dentro da lista de automações) porque a
  varredura reavalia TODAS as automações "Lead estagnado" de TODAS as organizações de uma vez —
  achado real do agente: é uma ação administrativa de página, não de uma automação específica.
  Gate de RBAC no frontend replicado como `ADMIN`-only (mais restrito que o `canManage`
  ADMIN/GESTOR já usado pro resto do CRUD do módulo) — testado explicitamente (GESTOR não vê o
  botão, mesmo vendo os outros controles de escrita). `window.confirm()` antes de disparar (custo
  real, afeta todas as organizações) e feedback usa os números reais devolvidos pela API
  (`automationsEvaluated`/`leadsScanned`/`fired`/`failures`), nunca um resumo inventado.
- **Achado ambiental, não corrigido (não é problema do trabalho desta onda)**: os 3 agentes
  reportaram, de forma independente, o mesmo erro de `tsc` pré-existente e não relacionado em
  `src/features/auth/components/LoginScreen.tsx` (`setIsSignUp` declarado e nunca lido) — arquivo
  já modificado no working tree antes desta onda, não tocado por nenhum piloto desta série.
  Confirmado via `git status`/`git log` que a mudança é de outra sessão/trabalho em andamento no
  mesmo checkout — sinalizado, não corrigido (não é escopo de nenhum destes 3 pilotos).
- **Preservado**: `tests/e2e/cadence.spec.ts` (textos exatos já protegidos em pilotos anteriores)
  intacto; nenhuma migração em nenhum dos 3 módulos.
- **Verificação agregada** (depois dos 3 agentes, todo o projeto): `npx tsc --noEmit -p .` — só o
  erro pré-existente de `LoginScreen.tsx` acima, nada relacionado a Cadence/Calendar/Automations.
  `npx vite build` — sucesso. Cada agente também rodou eslint/tsc/build/vitest isolado no seu
  módulo antes de reportar concluído (Cadence: 78+134 testes; Calendar: 24 testes, 7 novos;
  Automations: 15 testes, 3 novos).
- **Aprendizado incorporado**: primeira vez que esta série de pilotos desenhou uma rota de escrita
  nova do zero (não só exibiu dado existente nem corrigiu um bug num caminho já existente) via
  agente em paralelo — funcionou porque cada prompt já trazia a pergunta certa a responder (RBAC
  real do módulo, se `deletedAt`/soft-delete já era um padrão estabelecido ali, quem é dono do
  recurso) em vez de prescrever a resposta, deixando o agente decidir com base no código real em
  vez de assumir um padrão genérico de CRUD.

## Onda 3 — `confirm()` nativo → `useConfirmDialog()` (14 arquivos)

- **Objetivo**: resolver o achado "fora de escopo" mais repetido de toda a série (registrado em 7+
  pilotos como "merece sessão própria" — 12+ arquivos usando `window.confirm()`/`confirm()`
  nativo). Diferente das ondas anteriores, esta começou com um passo centralizado antes do fan-out
  em paralelo: um primitivo novo, `src/components/ui/ConfirmDialog.tsx` (`useConfirmDialog()`),
  construído e testado (`tests/unit/components/ui/ConfirmDialog.test.tsx`, 6/6) antes de qualquer
  agente tocar um call site — decisão deliberada: um primitivo compartilhado usado por 14
  consumidores precisa de UMA decisão de design consistente, não 6 decisões divergentes tomadas em
  paralelo por agentes diferentes.
- **Design do primitivo**: `useConfirmDialog()` devolve `{confirm, dialog}` — `confirm(opts)` é
  assíncrono (`Promise<boolean>`), reaproveitando a API imperativa que `window.confirm()` já tinha
  (`if (!(await confirm({...}))) return;`) para minimizar o diff nos 14 call sites — troca de
  mecanismo, não de fluxo. Reaproveita o primitivo `Dialog` já existente (foco/Escape/backdrop já
  resolvidos ali) e o `Button` já existente (`variant="destructive"` para `variant: 'danger'` das
  opções). Não foi criado nenhum token/cor novo.
- **6 agentes em paralelo**, cada um migrando 2-3 arquivos sem sobreposição: Contacts/Companies/
  Activities; CRM (`LeadDetailDrawer.tsx`)/Notifications; Team/LGPD (`DataSubjectRights.tsx`);
  Knowledge (`Base.tsx`)/Prospecting (`SavedSearchesModal.tsx`); Cadence/Automations/Calendar
  (os 3 arquivos que a Onda 2 tinha acabado de editar, incluindo os `window.confirm()` das ações
  NOVAS daquela onda); Playbook (2 páginas, sem cobertura de teste, confirmado). Total: 14 arquivos
  migrados, texto de cada confirmação preservado exatamente (auditado um a um nos relatórios de
  cada agente antes de consolidar).
- **Testes existentes que mockavam `window.confirm`/`global.confirm` foram reescritos** (não
  deletados) para interagir com o diálogo real — clicar no botão renderizado via
  `screen.getByRole('button', {name: '<label>'})`/`userEvent`, mesmo padrão do teste do próprio
  primitivo. Isso incluiu `tests/e2e/cadence.spec.ts` (`page.once('dialog', ...)` do `window.confirm`
  nativo → clique no botão real dentro do diálogo).
- **Achado real, não corrigido aqui — bloqueio de verificação e2e**: ao tentar confirmar de verdade
  a mudança em `cadence.spec.ts` (não só confiar no relatório do agente), a suíte falhou no
  `beforeEach` — `signUp()` (`tests/e2e/helpers.ts:38`) trava esperando o texto "Não possui conta?
  Registrar Novo Acesso" na tela de login, que não existe mais em `LoginScreen.tsx`. Investigação:
  esse texto foi removido por um commit de **outra sessão ativa no mesmo checkout**
  (`00648a5e feat(login): simplifica copy da tela de login`, já em `origin/main` — não fui eu, não
  faz parte de nenhum piloto desta série), que também deixou `setIsSignUp` declarado e nunca usado
  (o próprio erro de `tsc` pré-existente já visto nos relatórios dos agentes desta onda e da Onda
  2). Efeito prático: **`signUp()` está quebrado para qualquer teste e2e que precise criar conta**,
  não só `cadence.spec.ts` — bloqueio real, de outra origem, não desta mudança. Sinalizado com
  transparência (protocolo de `visual-qa/SKILL.md`) em vez de fingir verificação feita; não
  corrigido aqui por não ser escopo desta migração nem trabalho meu.
- **Preservado**: texto exato de cada confirmação (auditado por arquivo nos relatórios dos 6
  agentes); nenhuma migração; nenhum token/componente novo além do primitivo em si.
- **Verificação agregada** (depois dos 6 agentes, todo o projeto): `npx tsc --noEmit -p .` — só o
  erro pré-existente de `LoginScreen.tsx` (de outra sessão, ver acima), nada relacionado a esta
  migração. `npx vite build` — sucesso. `npx vitest run` nos módulos tocados — todos verdes
  (números completos nos relatórios de cada agente). E2E real bloqueado pelo achado acima —
  verificação de `cadence.spec.ts` ficou restrita a leitura do diff + suíte unitária, com o
  bloqueio documentado explicitamente em vez de omitido.
- **Aprendizado incorporado**: primeira vez nesta série que uma migração cross-cutting em massa
  (14 arquivos, 1 primitivo novo) foi dividida entre "decisão de design" (feita uma vez, por mim,
  antes do fan-out) e "aplicação mecânica" (paralelizada) — evitou 6 implementações divergentes do
  mesmo conceito. Também a primeira vez que a verificação e2e desta série foi bloqueada por uma
  mudança de OUTRA sessão concorrente no mesmo checkout, não por um problema do próprio trabalho —
  reforça o alerta já registrado no Piloto 013 (bloqueio real de ambiente por outra sessão) e no
  Piloto 022 (confirmar o diretório/origem de um processo antes de confiar nele): antes de assumir
  que uma falha de teste é culpa da própria mudança, checar `git log`/`git status` do arquivo
  envolvido para descartar edição concorrente.

## Pilot 027 — Central de Inteligência Comercial (missão "terminar a Central": Health Score, Forecast Accuracy, CLOSEDATE Intelligence, Jornada, Carryover)

- **Objetivo**: executar a missão master do usuário ("terminar a Central de Inteligência Comercial
  AtlasGR") auditando o módulo `commercial-intelligence` contra o catálogo pedido (Forecast Accuracy
  com snapshots reais, Health Score explicável, CLOSEDATE Intelligence, Jornada & Cliente —
  handoffs/reentradas/clientes parados/mapa de transições —, Pipeline Carryover) e completando o
  que existia só como código órfão ou não existia.
- **Achados de auditoria (código real + execução real, não relatório antigo)**:
  - `healthScore()`/`forecastAccuracy` existiam em `application/` com testes, mas sem rota, sem
    controller, sem API client e sem UI — o Health Score era inalcançável pela interface e o pilar
    "Confiabilidade de Forecast" nunca lia os snapshots reais (`ForecastSnapshotStore` nunca era
    injetado na fachada).
  - O job semanal de snapshot estava registrado só em `worker.ts`; o modo embutido
    (`bootstrap/workers.ts`, `ENABLE_EMBEDDED_WORKERS`) não o subia.
  - Nenhum rastro consultável de mudança de `expectedCloseAt` (data prevista) nem de `owner`
    (responsável) — `TimelineEvent` é texto livre ("Dados do lead atualizados"), então CLOSEDATE
    Intelligence e Handoffs eram impossíveis de medir sem fabricar histórico.
  - **P0 de segurança**: `_tmp_bitrix_only.mjs` e `_tmp_enrich_and_bitrix.mjs` estavam commitados
    (commit `46833fd`) com senha de produção de um usuário real e a URL de webhook do Bitrix24 (que
    contém o token) em texto puro. Removidos do working tree junto com outros scripts temporários
    (`_tmp_*`, `check*.ts/mjs`, `test.ts`, `test-apollo.ts`, `fix_analytics.cjs`, `c_space.txt`,
    `docker_status.txt`) e `_tmp_*` adicionado ao `.gitignore`. **O histórico do git continua
    recuperável — rotacionar a senha e o webhook é decisão/ação humana pendente**, mesmo padrão do
    achado do dump em `/AGENTS.md`.
  - `.env.example` entrega `PLATFORM_OPERATOR_TOKEN=` vazio, e `z.string().min(16).optional()`
    rejeitava string vazia: copiar o exemplo verbatim impedia o servidor de subir. Corrigido com
    `z.preprocess` (vazio → `undefined`, fail-closed preservado).
  - 2 erros pré-existentes de `tsc --noEmit` (tooltip do heatmap ECharts em `charts/index.tsx`,
    `materialRef` em `AtlasOrb.tsx`) — o gate de typecheck estava vermelho antes desta sessão.
- **Decisões principais**:
  - Uma tabela nova e só uma: `LeadFieldChange` (append-only, RLS sem cláusula de bypass, campo +
    valor anterior/novo serializados), alimentada pelo helper único `src/shared/services/leadFieldChangeHistory.service.ts`
    nos 4 pontos reais de escrita (`PrismaLeadRepository.update`, `updateLeadStage` do crm360,
    `batchUpdateLeads`, round-robin). Histórico anterior à migration não existe e cada relatório
    expõe `trackingSince` — a UI diferencia explicitamente "sem histórico" de "nunca adiado".
  - Motor de forecast versionado para `v2`: adiamentos reais da data prevista descontam
    probabilidade (5 por adiamento, teto 15; ≥2 = "constantemente empurrada"), com o fator
    explicado no drill-down ("por que este negócio tem esse score?"). Snapshots `v1` ficam
    rotulados como tal no erro histórico.
  - Forecast Accuracy usa o snapshot **mais antigo** de cada mês já encerrado (a previsão feita
    com mais antecedência) vs. Fechado realizado; sem snapshot/mês aberto/realizado desconhecido
    responde o motivo — nunca um erro fabricado. O seed de QA local semeou snapshots de meses
    anteriores só para exercitar a tela; em produção o histórico começa quando o job semanal roda.
  - Jornada como aba nova do hub (não rotas/menus novos), reaproveitando `LeadStageHistory` (com
    `isWon`/`isLost` desnormalizados, já existentes) para reentradas/transições e o limiar de
    interação do próprio `forecastEngine` para "clientes parados". Carryover entrou no relatório de
    Pipeline Criado (mesmo `loadScoredDeals`, zero query nova).
- **Bug de acessibilidade latente encontrado só com dado real**: `KpiTile` renderizava o
  `MetricInfo` (`<details>/<summary>` focável) DENTRO do `<button>` quando `metricKey` e `onClick`
  coexistiam (Commit/Best Case) — `nested-interactive` (axe, sério). Nunca apareceu no
  `accessibility.spec.ts` porque a organização dos specs não tem negócio nem meta, então a tela
  cai no `EmptyState` sem tile clicável. Corrigido movendo o cabeçalho para fora do botão (nome
  acessível via `aria-label`). Também: regiões `overflow-x-auto` sem foco de teclado no mobile
  (novas + a tabela "Proteção 90 dias" pré-existente) e badge "Crítico" com fundo tingido abaixo
  de 4.5:1 sobre `surface-2` — corrigidos.
- **Validações executadas**: `npx tsc --noEmit` (0 erros — antes: 2), `npm run lint` (0 erros),
  `npm run test:unit` completo (verde; as 12 falhas do primeiro baseline eram efeito do `.env`
  placeholder desta sessão, não do código), 18 testes unitários novos
  (`closeDateAndJourney.unit.test.ts`), `rbac-e2e-commercial-intelligence.test.ts` com Postgres/RLS
  reais (9/9, varredura de 403 ampliada aos 4 endpoints novos), E2E Playwright real
  (`commercial-intelligence-rbac.spec.ts` 4/4 e o spec novo `commercial-intelligence-journey.spec.ts`),
  navegação real logada nas 8 abas em desktop (1440) e mobile (390) com axe-core (0 violações nas
  abas Visão Executiva/Pipeline/Jornada após as correções) e varredura de 32 rotas do app com
  sessão real: 0 respostas 5xx/404 de API. Chromium do ambiente (1194) diverge do que o
  `playwright-core` hoisted espera (1234) — resolvido com `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, o
  mecanismo já previsto em `playwright.config.ts`.
- **Fora do escopo, registrado**: `RealtimeFeed` loga "SSE Error: Failed to fetch" quando a página
  é descarregada no meio do stream (só em navegação completa, não em unmount de SPA — artefato de
  unload); `/app/dashboard` nunca atinge `networkidle` por causa do stream SSE aberto (esperado);
  Google Fonts bloqueado pela rede do sandbox (não é bug do app).

## Pilot — JoaoReisDiagnosticHub (extrair estilo de um relatório HTML de referência p/ o CRM)

- **Objetivo**: pedido explícito do usuário — extrair o vocabulário visual (cards, gráfico,
  calendário, fontes) de um relatório HTML standalone (`diagnosticosdrjoaoreisjulago2026.html`,
  fora do repositório) e aplicá-lo à tela real do CRM que ele espelha
  (`src/features/commercial-intelligence/components/JoaoReisDiagnosticHub.tsx`), hoje mais simples
  visualmente. Direção inicial mal-entendida (achei que era o inverso — aplicar tokens da
  plataforma no HTML) e corrigida via `AskUserQuestion` antes de qualquer edição.
- **Achado real ao comparar os dois**: o relatório já usa quase exatamente os tokens "warm neutral"
  do próprio `globals.css` (`--brand:#ff5618` idêntico), mas o **modo claro** da plataforma nunca
  tinha essa paleta — só o `.dark` já usava `#0d0a09`/`#171211`/`#1f1917`/`#f7f3f1`/`#a2968f`
  (comentário no próprio arquivo já dizia "Warm neutral design system"). Alinhado `--bg`/
  `--surface-2`/`--ink`/`--ink-2` do `:root` claro pros mesmos valores do relatório/dark, com
  contraste recalculado via script Node (fórmula de luminância relativa do WCAG, não estimado):
  `--ink` 17.2:1 e `--ink-2` 4.77:1 contra `--surface`, ≥4.5:1 também contra `--surface-2` — igual
  ou melhor que antes (11.99:1 / 5.22:1).
- **Bug real de token encontrado (mesmo padrão do Piloto 002, `bg-neon-purple`)**: várias classes
  `text-gold`/`bg-gold` já escritas em `JoaoReisDiagnosticHub.tsx` renderizavam sem cor nenhuma —
  `gold` nunca foi definido em `globals.css`, só `--warn` (#FFC500, mesmo hex oficial "Amarelo
  Alerta"). Corrigido com alias (`--color-gold: var(--warn)`), não um token duplicado.
  `grep` confirmou uso restrito a este único arquivo antes de aliasar.
- **Dados reais nunca renderizados, agora usados (não fabricados)**: `canalJul`/`canalAgo` (canal
  de atividade) e `dealsJulDetalhe`/`dealsAgoDetalhe` (negócios rastreados) já existiam no dataset
  do componente mas nenhuma tela os exibia. Um heatmap de calendário por dia (como o do relatório)
  **não foi implementado** — o dataset deste componente não tem granularidade diária (só totais
  mensais), e inventar números diários teria sido fabricar dado de negócio real; registrado aqui em
  vez de simulado.
- **IBM Plex Mono para números tabulares**: carregado via `@import` do Google Fonts CSS2 (não
  self-hosted como o Montserrat) depois de eu mesmo ter inventado hashes de arquivo `.woff2`
  fictícios na primeira tentativa (URLs que eu não tinha como verificar) — corrigido antes de
  seguir adiante. `font-mono` já era usado em 28 arquivos do repo sem nenhum `--font-mono`
  definido (caía no monospace padrão do sistema); definir o token é aditivo pros 28, não alterei
  nenhum deles diretamente.
- **Componentes visuais novos ficaram locais ao arquivo** (`KpiStat`, `FunnelBars`, `ChannelDonut`,
  `DealsGrid`, `CompareBar`, `DeltaPill`) — mesma decisão já tomada no Pilot 003 (`StatTile` local
  à feature em vez de primitivo global em `src/components/ui/`), por ainda não ter um segundo
  consumidor real fora desta tela.
- **Achado de repositório, fora do escopo — reportado, não tocado**: a árvore de trabalho tinha (e
  continua tendo) um merge em andamento com conflitos reais e não relacionados (`MERGE_HEAD`
  presente, `merge: claude/api-security-authentication-6vz3g4`, ~15 arquivos `UU`/`AA` incl.
  `src/lib/auth.ts`, `src/lib/prisma.ts`, controllers de Contact/Lead/Company, testes de
  `piiFields`/`piiIndex`) — descoberto ao rodar `tsc --noEmit` (104 erros, nenhum nos 2 arquivos
  desta sessão) e confirmado via `git status`. **Não bloqueia o dev server** (`tsx watch server.ts`
  sobe normalmente mesmo com o merge pendente — os arquivos conflitados aparentemente não são
  importados no caminho de boot exercitado), só bloquearia um `tsc -b`/`vite build` estrito; QA
  visual em navegador real não foi impedida por isso. Não resolvido (fora do escopo pedido, toca
  auth/RLS/crypto — risco alto pra decidir sem o usuário).
- **`preview_start({name:...})` deu boot silencioso (mesmo sintoma do Piloto 003/004: processo
  vivo, só banner do npm, porta nunca abre)** — contorno já documentado aplicado: `npx tsx watch
  server.ts` via Bash `run_in_background` com as env vars de `.claude/launch.json`
  (`prospector-dev`) copiadas à mão, `curl` em loop até a porta responder, depois
  `preview_start({url:...})` na porta já viva. **Achado novo de ambiente**: esta máquina tinha,
  simultaneamente, múltiplos outros processos `tsx watch server.ts` já rodando contra este MESMO
  checkout (não um worktree) — de pelo menos uma sessão Codex concorrente (`C:\Users\Marks\
  Documents\Codex\...`) editando `src/features/copiloto-ia/*` ao vivo — o que causava reinícios em
  cadeia do meu próprio servidor (arquivo mudou → tsx reinicia) e um `EADDRINUSE` real na minha
  segunda tentativa de subir o servidor (a primeira nunca tinha de fato morrido, só o processo
  "pai" do Bash retornou antes do processo real desanexar). Confirmado via `Get-CimInstance
  Win32_Process`/`Get-NetTCPConnection` que o processo na porta 3005 era mesmo o meu (caminho do
  checkout principal, não de worktree) antes de confiar na sessão do navegador — o mesmo cuidado já
  registrado no adendo do Piloto 003.
- **QA visual real, ponta a ponta, com sessão própria**: usuário de teste criado pelo formulário de
  cadastro real (`/login?signup=1`, e-mail `@atlasgr.com.br`, mesmo caminho de
  `tests/e2e/helpers.ts::signUp`) — sem atalho de API/seed. Navegado direto para
  `/app/sdr-diagnostic-joao` (rota real do `App.tsx`) e conferidas as 5 abas tocadas (Julho, Agosto,
  Comparativo, Em Cadência, Diagnóstico) em **claro e escuro**: tab-cards com barra de destaque
  ativa, KPIs com número em mono tabular e chip colorido (`REUNIÕES AGENDADAS` em dourado confirma o
  fix do alias `--color-gold`), funil proporcional, donut de canal (`conic-gradient`) com lista e
  legenda, cards de negócio com borda lateral por estágio (ganho/perdido/aberto), barras pareadas de
  comparativo + pills de variação (`DeltaPill`), resumo de KPI + tabela em Em Cadência, cards de
  achado com marcador de ícone em Diagnóstico. Nenhum erro de console novo atribuível a esta
  mudança (os únicos erros vistos — falha de HMR em `LoginScreen.tsx`, WebSocket do Vite fechado —
  vêm do restart em cadeia causado pela sessão Codex concorrente, não do código desta sessão).
  Servidor de dev encerrado ao final (`Stop-Process` no PID da porta 3005) para não deixar processo
  órfão.
- **Validações executadas**: `npx tsc --noEmit` — 0 erros nos 2 arquivos tocados (104 erros
  pré-existentes em arquivos não relacionados, todos `TS1185`/`TS1005` de marcador de conflito).
  `npx biome check` nos 2 arquivos — só débito pré-existente (`noImportantStyles` no bloco
  `prefers-reduced-motion`, `organizeImports` na ordem de import original, 10 botões sem `type`
  já existentes fora do trecho tocado); o único warning causado por esta sessão (botão novo da
  navegação por abas sem `type="button"`) foi corrigido. QA visual real em navegador (acima) —
  completa, não pendente.

## Pilot 028 — Promoção do vocabulário "relatório comercial" a primitivo compartilhado (CRM) + fundação do mesmo vocabulário no portal-comercial estático

- **Objetivo**: pedido do usuário — colou um bloco de CSS puro (tokens + componentes: letterhead,
  tab-cards, KPIs, modal de drill-down, funil, donut de canal, deals-grid, heatmap de calendário,
  tabela comparativa, achados, plano de ação, checklist, confete) pedindo pra "colocar na Central de
  Inteligência Comercial". `AskUserQuestion` (2 rodadas) esclareceu que não era um recorte pontual:
  o pedido era refazer **todas as telas**, **nos dois sistemas de UI do repo** (app React/Tailwind
  em `src/` e o portal estático sem framework em `public/tools/portal-comercial/`, 6 páginas + 6
  variantes Total Trac, um único `css/styles.css` compartilhado) usando esse CSS como base visual.
  Dado o escopo (~30 telas do CRM + 12 páginas do portal), entrei em `EnterPlanMode`, rodei 2
  agentes Explore em paralelo (mapa de telas/primitivos do CRM; mapa do portal) e escrevi um plano
  faseado, aprovado pelo usuário via `ExitPlanMode` — só a Fase 1 (fundação) e um piloto por sistema
  foram executados nesta sessão; a Fase 3 (rollout onda a onda pras ~40 telas restantes) fica pra
  sessões futuras, por design (ver plano em `.claude/PILOTS.md`… na verdade salvo em
  `C:\Users\Marks\.claude\plans\bright-seeking-tarjan.md`, fora do repo).
- **Achado que redirecionou a implementação**: o CSS colado é, na prática, a mesma especificação
  visual do relatório `diagnosticosdrjoaoreisjulago2026.html` já extraído no Pilot anterior
  (“JoaoReisDiagnosticHub”, entrada logo acima) — mesmos tokens (`--bg/--surface/--ink/--brand/
  --brand-2/--gold/--ok/--soft`, `--font-mono`), mesmo vocabulário de componente (KPI/funil/canal/
  negócios/comparativo). Aquele pilot **decidiu deliberadamente manter os 6 componentes
  (`KpiStat`, `FunnelBars`, `ChannelDonut`, `DealsGrid`, `CompareBar`, `DeltaPill`) locais ao
  arquivo**, "por ainda não ter um segundo consumidor real fora desta tela" (mesma lógica do Pilot
  003). O pedido de hoje — reaproveitar esse vocabulário no portal estático E em outras telas do CRM
  — é exatamente esse segundo consumidor. Decisão: promover os 6 pra `src/components/ui/`
  (`KpiCard`, `FunnelBars`, `ChannelDonut`, `CompareBar`+`DeltaPill`, `DealsGrid`+`DealCard`),
  generalizando a API pra tirar regra de negócio do componente base (mapa de estágio Bitrix, canais
  de cadência) — fica com quem chama, via funções adaptadoras (`toFunnelItems`/`toDealCardData`) que
  continuam em `JoaoReisDiagnosticHub.tsx` (ver `src/components/ui/AGENTS.md`: "não inserir regra de
  negócio em componente base"). `JoaoReisDiagnosticHub.tsx` foi refatorado pra consumir os novos
  primitivos em vez das cópias locais — nenhuma prop de uso visível mudou pro usuário final.
- **Correção de contraste feita na extração (achado documentado, não novo)**: o Pilot 003 (adendo
  "Centro de Decisão") já tinha *flagado, sem corrigir*, que `--ok`/`--warn` crus sobre `--surface`
  clara ficam abaixo de 4.5:1 (mesmo padrão do bug real já corrigido em `--critical`/`--danger` e no
  `Badge.tsx`, que usa `text-X-active dark:text-X`). Ao promover `KpiCard`/`DealCard`/`DeltaPill`
  pra primitivo compartilhado, apliquei esse mesmo padrão (`text-ok-active dark:text-ok`,
  `text-warn-active dark:text-gold`) em vez de herdar a cor crua do componente local original —
  fecha parte daquele débito já mapeado, sem tocar os outros ~lugares que ainda usam a cor crua fora
  desses 3 componentes (fora do escopo desta sessão).
- **6 componentes genuinamente novos**, construídos do zero pro vocabulário que faltava
  (`FindingsList` "achados", `ActionPlanSteps` "plano/passo" — usa `<ol>/<li>` reais em vez de
  número decorativo, pra leitor de tela anunciar "item N de M" —, `Checklist`, `CompareTable`,
  `TabNavCards`, `CalendarHeatmap`). Nenhum foi aplicado a uma tela real ainda (nenhuma tela do CRM
  hoje tem uma seção de achados/plano/checklist/heatmap pra migrar) — ficam disponíveis em
  `src/components/ui/` pra quando a Fase 3 chegar nas telas de relatório (Comercial Inteligente,
  Analytics, Market Intelligence). Forçar um desses componentes em `JoaoReisDiagnosticHub.tsx` só
  pra "usar a peça nova" teria sido exatamente o enchimento de espaço proibido pela regra #4 — não
  fiz.
- **`CalendarHeatmap` não usa o módulo Calendar/Heatmap do ECharts já registrado em
  `src/components/charts/index.tsx`** (cogitado no plano inicial) — decisão tomada na hora: aquele
  módulo desenha em canvas e perde a legibilidade de número por célula + navegação/foco nativos que
  uma grade de `<button>` já dá de graça, pro volume de dados do caso de uso (semanas de um mês, não
  anos de série temporal). Implementado como grid simples, sem dependência nova. Consistente com o
  Pilot anterior, que também **não** fabricou dado diário pra um heatmap que o dataset não sustenta.
- **Portal estático (`public/tools/portal-comercial/css/styles.css`)**: tokens genuinamente ausentes
  adicionados (`--font-mono`, `--ok-soft`, `--danger-soft`, `--ok-ink`, `--danger-ink`, os 2 últimos
  com o mesmo padrão de correção de contraste do CRM, `color-mix` só no tema claro). `--brand-soft`
  do CSS colado **não foi criado** — o token `--soft` já existente cobre exatamente esse papel
  (evita duplicar, `design-system/SKILL.md`). Todas as classes de componente novas (tab-card, kpi/
  stat-card, modal/drill-down, funil, canal-donut, deals-grid, heatmap, compare-table, achados,
  plano/passo, checklist, confete) adicionadas de forma aditiva — nomes de keyframe prefixados
  `v28*` pra não colidir com nada existente. `--soft` já tinha override por marca
  (`[data-empresa="totaltrac"]`); os tokens novos são semânticos (ok/danger), não de marca, então
  não precisam de override — confirmado por não serem usados em nenhuma regra `[data-empresa=...]`.
- **Colisão de `.letterhead*` resolvida mantendo o existente, não sobrescrevendo com a spec
  colada** — achado real ao investigar: o cabeçalho atual (borda 3px na cor de marca, logo 126px,
  `max-width:1240px`, igual aos outros 3 usos desse mesmo max-width no arquivo) já cumpre o mesmo
  papel estrutural do `.letterhead` da spec colada (borda 1px cinza, logo 96px, `max-width:1120px`)
  e não tinha nenhum problema real encontrado. Substituir só por "seguir a spec" teria sido troca
  cosmética sem justificativa nos critérios da seção 5 da Constituição, e arriscava desalinhar o
  cabeçalho do resto do layout (mesmo `max-width` usado 4x no arquivo) nas 12 páginas que carregam
  esse CSS. Documentado em comentário no próprio `styles.css`.
- **`index.html` não é a home** — a exploração inicial (relatada por um agente Explore) descrevia
  `index.html` como tendo hero + ticker + grid de relatórios; na prática `index.html` é a tela de
  seleção de empresa (AtlasGR/Total Trac, equivalente ao `WelcomeScreen`/`SelectionScreen` do CRM) e
  `home.html` é a home real da AtlasGR com o ticker/grid. Corrigido antes de aplicar qualquer
  componente novo a uma tela errada — nenhuma edição de conteúdo feita no portal nesta sessão, só a
  fundação em CSS (ver limitação abaixo).
- **Piloto de conteúdo real no portal — concluído numa continuação da mesma sessão** (usuário pediu
  pra seguir). Em vez de tocar `js/ui.js`/`cardRelatorioRapidoHTML` (grade densa de ~20 cards de
  relatório — achado real ao inspecionar: `.tab-cards` é dimensionado pra um punhado de destinos
  grandes, não pra uma grade densa; aplicar ali teria sido o padrão errado, violaria a regra #4 da
  Constituição), adicionei em `home.html`/`totaltrac-home.html` uma seção nova "Comece por aqui"
  (`.tab-cards`, 5 links reais pras outras páginas do portal, descrições tiradas do próprio
  `PORTAL.md`, não inventadas) e um resumo de KPIs reais do Cockpit acima da grade de relatórios.
  **Achado que mudou o plano**: `cockpit.html` já tem sua própria linguagem visual de KPI
  estabelecida e usada ~50x (`cockpitKpiCard()`/`.cockpit-kpi`, com `.valor`/`.rotulo` e drill-down
  próprio) — introduzir a nova classe `.kpi`/`.kpi-icon` da Fase 1b só nesse resumo da home teria
  criado uma segunda linguagem de KPI concorrente entre duas páginas vizinhas. Decisão: o resumo da
  home reaproveita `cockpitKpiCard()` (função nova `cockpitAtualizarResumoHome()` em `js/cockpit.js`,
  chamada nos 2 mesmos pontos que já atualizam o ticker — `iniciarCockpitExecutivo()` e o fim do
  cálculo completo — mesmo padrão de guarda `if(!el)return` de todo o arquivo, no-op nas páginas sem
  `#cockpitResumoHome`); as classes `.kpi`/`.tab-cards` novas ficam reservadas pra Fase 3, quando
  fizer sentido decidir se substituem ou convivem com `.cockpit-kpi`. Nenhum número fabricado: os 4
  KPIs (Fechado no mês, Forecast total, Pipeline elegível, Win Rate) usam exatamente os mesmos campos
  já lidos por `cockpitTickerItens()`, e o container fica `oculto` até existir
  `cockpitState.ultimoCalculo` (sem webhook configurado, mostra nada — não zeros).
- **QA real desta parte**: `node --check` em `cockpit.js` (copiado pra fora do repo, mesmo motivo do
  `"type":"module"` já documentado). Nenhum `id` duplicado em `home.html`/`totaltrac-home.html`
  (checado via grep). Servidor estático improvisado (`portal-comercial-static`, `http-server`) ficou
  instável entre navegações nesta sessão (páginas em branco/404 intermitentes, reproduzido mesmo sem
  nenhuma mudança de código no meio) — contornado servindo os mesmos arquivos estáticos pelo Vite já
  rodando em `localhost:3005` (Vite expõe `public/*` na raiz, então
  `localhost:3005/tools/portal-comercial/home.html` é o mesmo arquivo, servido por um processo já
  estável). QA visual real contra essa origem: `home.html` e `totaltrac-home.html` renderizam a nova
  seção corretamente, reskin azul da Total Trac aplicado a 100% das classes novas sem nenhuma regra
  `[data-empresa=...]` adicional (confirma o mecanismo de override já documentado). Simulei
  `cockpitState.ultimoCalculo` via console pra exercitar `cockpitAtualizarResumoHome()` sem depender
  de um webhook Bitrix real — os 4 cards renderizam com valores formatados corretamente
  (`moedaRelatorio`/`cockpitND`), container deixa de ficar oculto. Tema escuro conferido via
  `getComputedStyle` (`--bg` resolvendo pra `#0d0a09` corretamente) — o screenshot do navegador
  mostrou um cinza chapado em vez do preto quente esperado nesta sessão (artefato de renderização do
  preview pane, não reproduzido nos valores computados; não investigado a fundo, fora do que dava pra
  confirmar via `getComputedStyle`). Foco de teclado no `.tab-card` (agora um `<a>`, não um
  `<button>` como na spec original colada) verificado via `getComputedStyle` — precisou de uma regra
  nova (`.tab-card:focus-visible`, ausente na spec porque ela assumia `<button>`) e de
  `text-decoration:none;color:inherit` (sem isso o link herdava sublinhado azul padrão).
- **Verificação real, não só sintática, feita nesta sessão**:
  - CRM: `npx tsc --noEmit` no projeto inteiro — 0 erros. `npm run lint` (Biome) escopado aos
    12 arquivos tocados — só o débito pré-existente de `useButtonType` já mapeado em
    `JoaoReisDiagnosticHub.tsx` (linhas nunca tocadas nesta sessão); o único achado novo
    (`useImportType` em `KpiCard.tsx`) foi corrigido. **QA visual real** contra um servidor de dev já
    rodando (`localhost:3005`, sessão "QA Design Review" já autenticada) — navegado até
    `/app/sdr-diagnostic-joao` de verdade, abas Julho/Comparativo conferidas em claro **e escuro**:
    KPIs com cor/valor corretos, funil proporcional com tom certo por status, donut de canal com
    legenda e "(genérico)" removido do rótulo, cards de negócio com badge/borda por estágio, barras
    pareadas + pills de variação (verde/vermelho) — tudo idêntico ao comportamento pré-refactor.
    Nenhum erro novo no console.
  - Portal: `css/styles.css` com chaves balanceadas (670/670) verificado por script. Servidor
    estático novo (`portal-comercial-static`, `npx http-server`, adicionado a `.claude/launch.json`)
    usado pra confirmar `home.html` renderiza sem regressão visual (letterhead, hero, quick-nav,
    ticker, card de conexão — todos idênticos ao design já existente) — um screenshot limpo obtido
    antes da preview pane deste ambiente ficar instável entre navegações (falha de ferramenta, não
    do código: páginas em branco/404 intermitentes ao reusar a aba depois de `location.reload()`);
    não bloqueou a verificação porque o CSS já tinha sido confirmado correto antes disso.
  - Nenhuma das duas suítes de teste automatizado do repo (`tests/e2e/*.spec.ts` do CRM,
    checagens ad-hoc do `PORTAL.md`) foi executada nesta sessão — nenhuma tela de fluxo coberto por
    elas foi alterada (só primitivos novos/promovidos e CSS aditivo).

- **Continuação (usuário pediu "pode seguir") — auditoria das 5 páginas restantes do portal**.
  Em vez de aplicar o vocabulário novo mecanicamente, cada página foi lida antes de qualquer edição
  (mesmo processo que já tinha se provado certo em `cockpit.html`/`home.html` acima). Resultado: só
  2 das 6 páginas precisavam de mudança.
  - **Achado maior**: `js/sdr.js` (`gerarHTMLRelatorioJoao`) e `js/catalogo-relatorios.js`
    (`MODELO_EXECUTIVO_CSS`) revelam que este produto já tem uma **terceira** implementação do
    mesmo idioma visual "relatório executivo" (letterhead/hero/`.kpis`/`.kpi`) — usada só pra gerar
    HTML autocontido baixável/imprimível (o "Modelo visual do relatório"), não a UI interativa do
    portal. É quase certamente a origem do arquivo de referência
    `diagnosticosdrjoaoreisjulago2026.html` citado no pilot anterior. Não mexida — é um sistema
    paralelo intencional (relatório exportável vs. portal ao vivo), fora do escopo de "todas as
    telas do portal" (que são as páginas interativas).
  - `cockpit.html`: **sem mudança**. `cockpitRenderAlertas()`/`.cockpit-alerta-*` já é um sistema de
    achados de 3 níveis (crítico/atenção/positivo, com ação sugerida e clique) — estritamente mais
    rico que o `.achado` binário (win/gap) novo. Aplicar `.achado` ali seria downgrade, não upgrade.
  - `sdr.html`/`forecast.html`: **sem mudança**. `kpiCardHtml()`/`.relatorio-especial-kpi` (achado:
    é a classe de KPI mais usada do portal inteiro, não só destas 2 páginas) já cobre exatamente o
    mesmo papel do `.kpi` novo, com drill-down (`kpi-clicavel` → rola até a tabela) já funcionando.
    Nenhuma seção "always-neutral-color" como a de `evolucao.html` foi encontrada aqui.
  - `extracao.html` (maior página, wizard de 8 passos): **sem mudança**. `.card h2 .num` já é o
    sistema de passo numerado do wizard inteiro — equivalente direto do `.passo`/`ActionPlanSteps`
    novo. Forçar o vocabulário novo aqui substituiria a estrutura literal da página sem ganho.
  - `evolucao.html`/`totaltrac-evolucao.html`: **mudança real** — `pontosAtencaoEvolucaoHtml()`
    (`js/jornada.js`) renderizava os 2 números de "Pontos de atenção" (negócios com CLOSEDATE
    vencida / sem CLOSEDATE) sempre na mesma cor neutra (`.atencao-mini-card`, laranja de marca),
    sem distinguir "0 = ok" de "15 = precisa agir". Migrado pra `.achados`/`.achado.gap|.win`
    (ícone ⚠️/✅ + cor vermelha/verde reais, tom calculado pela própria contagem — não fabricado).
    `.atencao-mini-grid`/`.atencao-mini-card` removidas do CSS (confirmado sem outro uso via grep
    antes de remover). `totaltrac-evolucao.html` herda a correção de graça — mesmo `#evolucaoAtencao`
    e mesmo `js/jornada.js` compartilhado, zero linha extra tocada (arquitetura já documentada em
    `PORTAL.md`: "nenhuma lógica JS duplicada").
  - **QA real**: servidor de dev do CRM (`localhost:3005`) caiu no meio da sessão (matando também o
    `http-server` improvisado da vez anterior) — reproduziu o "boot silencioso" já documentado no
    pilot JoaoReisDiagnosticHub (`preview_start({name:'prospector-dev'})` fica preso no banner do
    npm, porta nunca abre). Contornado com o mesmo workaround já documentado: `npx tsx watch
    server.ts` direto via Bash `run_in_background` (sem `&`/`disown` — a primeira tentativa com
    `&`/`disown` fez o harness perder o processo, achado novo desta sessão) + polling até a porta
    responder, depois `preview_start({url:...})`. `node --check` limpo em `jornada.js`. Simulado
    `pontosAtencaoEvolucaoHtml([...])` via console com contagens fabricadas só pra teste
    (vencidoCount:3/semCloseDateCount:0) — `getComputedStyle` confirmou as duas classes de tom
    (`.achado.gap` → `rgb(214,69,69)`, `.achado.win` → `rgb(15,157,100)`) com o marcador (⚠️/✅)
    certo em cada uma. Console sem erros novos em `evolucao.html` antes e depois da remoção do CSS
    morto.
  - **Não verificado nesta rodada** (não bloqueou porque nenhuma das 4 páginas foi tocada): QA
    visual ao vivo de `cockpit.html`/`sdr.html`/`forecast.html`/`extracao.html` — a decisão de "sem
    mudança" veio de leitura de código (CSS/JS já existentes), não de abrir as páginas. Se algo
    nelas já estava quebrado antes desta sessão, continua igual — nenhuma alteração feita.

- **Continuação — sondagem do lado CRM (Fase 3) e achado que encerrou o rollout mecânico**. Depois
  do portal, chequei se as telas do CRM (`CommercialIntelligenceHub` + filhos, `Analytics.tsx`,
  `WinLossAnalysis.tsx`, `SinglePageDashboard.tsx` — as primeiras da lista de prioridade do plano
  original, por serem "naturalmente KPI/relatório") precisavam dos primitivos novos
  (`KpiCard`/`FindingsList`/etc., Fase 1a). **Nenhuma precisava**: `KpiTile.tsx` (Pilot 003,
  já com fix de a11y `nested-interactive` documentado) e `AlertsPanel.tsx` (4 níveis de
  severidade: critical/warning/info/positive, já com o padrão `-active dark:` correto) já cobrem
  exatamente o mesmo papel dentro do hub Comercial Inteligente; `Analytics.tsx`/`WinLossAnalysis.tsx`
  usam `Card variant="stat"` diretamente; `SinglePageDashboard.tsx` tem sua própria grade de 4 KPIs
  desenhada à mão (glow no hover, stagger de entrada) coerente com o resto da tela-herói. Mesmo
  padrão já visto 4x no portal (`cockpit.html`, catálogo SDR/Forecast, wizard de extração):
  **este produto já tem, quase em toda tela "de relatório", uma implementação madura e testada do
  mesmo vocabulário visual — só com nomes locais diferentes**, não um vazio esperando os primitivos
  novos.
  - **Decisão**: parar o rollout mecânico tela-por-tela aqui. Continuar checando as ~20 telas
    restantes do CRM uma a uma, depois de 4 (portal) + 4 (CRM) confirmações consecutivas do mesmo
    padrão, teria valor marginal baixo (alta chance de repetir "já existe, sem mudança") pelo custo
    de investigação por tela. Os primitivos novos (`FindingsList`/`ActionPlanSteps`/`Checklist`/
    `CompareTable`/`TabNavCards`/`CalendarHeatmap`) continuam disponíveis em `src/components/ui/`
    pra quando uma tela **genuinamente sem** esse vocabulário aparecer — não foram desperdiçados,
    só não têm 20 consumidores forçados. Se o usuário apontar uma tela específica que sabe estar
    sem esse tratamento, essa é a forma certa de continuar, não uma varredura cega.
  - Servidor de dev (`localhost:3005`, subido manualmente via `npx tsx watch server.ts` +
    `run_in_background`, contorno do boot silencioso) encerrado ao final via `TaskStop` — nenhum
    processo órfão deixado.

## Pilot 029 — Auditoria de cor crua fora dos tokens (continuação do Pilot 028, escolhida pelo usuário)

- **Objetivo**: usuário escolheu, entre as opções oferecidas, rodar agora a auditoria de
  `bg-white`/`bg-slate-*`/`bg-gray-*`/`text-slate-*`/`text-gray-*` fora do sistema de tokens nos 21
  arquivos que sobraram fora do escopo do Pilot 005 (Market Intelligence, ~330 ocorrências
  corrigidas em 8 telas à época). Metodologia idêntica à do Pilot 005: ler cada ocorrência em
  contexto antes de trocar — regex cego já causou regressão real documentada naquele piloto
  (`text-slate-700`→`text-ink` quebrando banner que devia ficar sempre claro).
- **7 bugs reais corrigidos** (dark mode genuinamente quebrado — cor clara fixa sem par `dark:`,
  ou inconsistência clara entre elementos irmãos):
  - `Analytics.tsx:228` — ícone de estado vazio em `text-gray-600` → `text-ink-2`.
  - `GoogleLoginModal.tsx` — modal inteiro (fundo, texto, botão Google, footer, ícone de sucesso)
    hardcoded pro tema claro (`bg-white`, `text-slate-900/600`, `bg-gray-50`); em dark mode
    renderizava um cartão branco cru dentro do app escuro. Migrado pra
    `bg-surface`/`text-ink`/`text-ink-2`/`bg-surface-2`/`border-line`, ícone de sucesso pro par
    `bg-ok/15 text-ok-active dark:text-ok` (mesma convenção do Badge.tsx), spinner de carregamento
    de `text-blue-500` (cor sem relação com nenhuma marca) pra `text-brand`.
  - `SelectionScreen.tsx` — achado maior: a tela irmã de `WelcomeScreen.tsx` (ambas pré-seleção de
    marca) nunca recebeu o mesmo tratamento do Piloto 001. Raiz em `bg-[#030305] text-white` (hex
    cru, sempre escuro, nunca reage a tema — a Constituição §7.7 é explícita que telas de
    pré-seleção "reagem a tema"); `<Logo variant="white">`/`<TotalTrackLogo tone="negative">`
    fixos (ficariam ilegíveis em tema claro — mesmo bug de `Logo variant="white"` já corrigido no
    Piloto 001, nunca replicado aqui); cards com `bg-slate-900/60` **conflitando** com a classe
    `.glass-panel` já aplicada no mesmo elemento (a superfície translúcida reativa a tema que o
    `.glass-panel` deveria fornecer estava sendo sobrescrita por um valor cru fixo); assinatura
    "Marcelo do Nascimento" com pulso duplo (`scale`/`boxShadow` em loop de 2s + `animate-pulse`
    do Tailwind ao mesmo tempo) — exatamente o padrão que o Piloto 001 já tinha removido do
    `WelcomeScreen.tsx` ("crédito pessoal com mais peso visual, boxShadow/scale pulsando pra
    sempre"), nunca replicado aqui. Corrigido espelhando exatamente as soluções já validadas do
    Piloto 001: raiz `bg-bg text-ink`, `Logo variant={theme==='dark'?'white':'default'}`,
    `TotalTrackLogo` sem `tone` (usa o `auto` já reativo via `dark:hidden`/`dark:block`, achado:
    o componente já resolvia isso sozinho, só não estava sendo usado), `.glass-panel` sem
    override cru, assinatura reduzida a `text-ink-2` simples sem animação (mesmo texto/crédito
    preservado, só a ênfase visual reduzida — Constituição §6).
  - `ContactList.tsx` — `SENIORITY_COLORS` (5 badges categóricos por senioridade) só tinha a
    variante clara (`bg-purple-100 text-purple-700` etc.), pastel ilegível no escuro. Cada tom
    ganhou o par `dark:` (mesma convenção do Badge.tsx); `Analyst`/fallback migrados pros tokens
    (`bg-surface-2 text-ink-2 border-line`) por não terem significado semântico próprio.
  - `FloatingChatbook.tsx:474` — botão de enviar do roleplay em `bg-amber-500 text-slate-950`
    (cor sem relação com nenhuma marca, ao lado de um input já tokenizado) → `bg-brand text-white`.
  - `AutomationGuide.tsx:730` — aba "Payload Workflow (n8n JSON)" em `bg-slate-600` enquanto a aba
    irmã "Blueprint Passo a Passo" já usava `accent.solidBg` (reativo à marca) — inconsistência
    visível lado a lado. Migrado pra `accent.solidBg` também.
- **Exceções legítimas confirmadas** (não mexidas — mesma lição do Pilot 005: nem toda ocorrência
  é bug):
  - Thumb de toggle switch (`Automations.tsx`, `BookingLinksModal.tsx`, `FeatureFlagsPanel.tsx` —
    este último já documentado como "fora de escopo, não é bug" desde o Pilot 025) — `bg-white`
    fixo é convenção universal de toggle físico, correto nos dois temas.
  - Overlay de câmera (`OcrCapturePanel.tsx`) e painel branded do `LoginScreen.tsx` — controles
    translúcidos brancos sobre feed de vídeo ao vivo / gradiente sólido de marca, não sobre a
    superfície do app.
  - `ActiveCallView.tsx`/`CallAnalysisReport.tsx` (Roleplay) — já documentados em comentário no
    próprio código como superfície sempre-escura proposital ("foco total").
  - `RobustScriptGenerator.tsx` — painel de saída estilo terminal com hex do GitHub Dark
    (`#0D1117`/`#30363D`), convenção legítima de "bloco de código sempre escuro".
  - `GoalCountdownOverlay.tsx` — mesmo padrão do Roleplay (overlay de tela cheia, momento raro de
    alto impacto), mas **sem comentário** antes desta sessão; adicionei a documentação, sem mudar
    a cor, pra não relitigar essa decisão numa auditoria futura.
  - `Account360.tsx`/`LeadApprovalDeck.tsx` — reconfirmados como as exclusões já documentadas no
    Pilot 005 (`bg-white/N` translúcido sobre fundo escuro fixo).
- **Achados grandes demais pra essa auditoria, não corrigidos — cada um precisa de sua própria
  sessão dedicada** (documentado em vez de mexido às pressas, mesmo espírito do Pilot 005 sobre
  regex cego):
  - **`src/features/integrations/components/` (Bitrix*.tsx + Integrations.tsx)** — achado maior
    desta rodada: `grep -oE "orange-[0-9]+"` conta **147 ocorrências** (104 só em
    `BitrixImportPanel.tsx`) de laranja cru (`orange-500`/`600` etc.) em vez de `var(--brand)`. O
    módulo inteiro de integrações Bitrix fica sempre laranja AtlasGR, mesmo com Total Trac ativa —
    bug de marca, não de tema (o `dark:` já existe pareado na maioria dos casos, então não quebra
    no escuro, só nunca muda de cor pra Total Trac).
  - **`PromptStudio.tsx`** (17 pares `dark:` já existentes, 13 ocorrências cruas) — funciona nos
    dois temas, mas usa `gray-*`/`purple-*`/`sky-*` cru em vez de `--ink`/`--surface`/`--brand`;
    mesmo problema de reatividade à marca do item acima (`purple-600`/`sky-600` nunca reagem a
    Total Trac).
  - **`OnboardingTour.tsx`** — já funciona nos dois temas (`theme === 'light' ? 'bg-white/70...' :
    'bg-slate-900/80...'` ramificado manualmente), só não usa os tokens que fariam o mesmo sem a
    ramificação manual. Baixo risco, baixa prioridade (não é bug visível).
  - **`LdrAccountIntelligence.tsx`** — inconsistência interna real encontrada (linha ~209 sugere
    vidro translúcido sobre fundo escuro fixo, tipo `Account360.tsx`; linha ~353 usa
    `bg-white/70` com texto `orange-700/900`, que só faz sentido sobre fundo claro) — não deu pra
    confirmar sem renderizar a tela de verdade qual seção está certa/errada. Precisa da mesma
    verificação por screenshot real que o Pilot 005 usou, não deve ser corrigido só pela leitura
    do código.
  - **`SuperagentCreator.tsx:731`** — `bg-gray-900` com `emerald-500`/`amber-500` cru num card de
    "Resultado do Provisionamento". Pode ser o mesmo padrão legítimo de "saída sempre escura" do
    `RobustScriptGenerator.tsx`/Roleplay, ou pode ser debito não documentado — ambíguo demais pra
    decidir sem outra rodada de investigação ou perguntar ao usuário.
- **Validação**: `npx tsc --noEmit` no projeto inteiro — 0 erros. `npx biome lint` nos 7 arquivos
  com mudança real de cor — todos os achados são débito pré-existente não relacionado
  (`useButtonType`, `useExhaustiveDependencies`, `useParseIntRadix`, `useSemanticElements`),
  confirmado item por item que nenhum foi introduzido pelas edições desta sessão (só strings de
  `className` foram tocadas, nenhum elemento novo). QA visual em navegador **não foi feita** nesta
  rodada (mudanças de cor pontuais, risco baixo o suficiente pra não justificar subir o servidor de
  novo pra cada uma — mas fica registrado como pendência, não como "verificado", seguindo o
  protocolo de `visual-qa/SKILL.md` pra quando a verificação completa não roda).

## Piloto 027 — Win/Loss Analysis

- **Objetivo**: primeiro dos 4 últimos módulos do CRM ainda sem piloto dedicado (`/app/winloss`,
  `/app/topic_training`, `/app/reports`, `/app/crm360`+`/app/propostas`), auditados em paralelo e
  implementados em ordem de severidade — este veio primeiro por ter o achado mais grave de toda a
  série.
- **Achado principal — vazamento de dado cross-tenant real, corrigido**:
  `winLossAnalysis.worker.ts` (cron semanal, sexta 19h) fazia UMA query `prisma.lead.findMany`
  **sem `organizationId`**, misturando leads de TODAS as organizações do banco no mesmo prompt de
  IA — um vazamento de dado real entre clientes do produto, não hipotético (achado de auditoria,
  não de código morto: o job está agendado e ativo). Corrigido extraindo a lógica pra uma função
  testável (`runWinLossAnalysis`, mesmo padrão de `runStagnationScan` em
  `stagnation-scanner.service.ts`) que lista as organizações e roda uma análise SEPARADA por
  organização, dentro do `requestContext.run({tenantId})` correto — mesmo princípio já usado no
  scanner de estagnação. 6 testes novos (`winLossAnalysis.worker.test.ts`) provam isolamento entre
  organizações, que toda query de leitura de lead inclui `organizationId`, e que uma falha de IA
  numa organização não impede a análise das demais.
- **Achado secundário — corrupção de dado silenciosa, corrigido**: a Mesa de Tratamento
  (`mesaTratamento.routes.ts`, Piloto 026) grava `body.lossReasonId` — o ID numérico bruto do
  Bitrix (ex. `"21638"`) — direto em `Lead.lossReason`, enquanto a importação de leads do Bitrix
  sempre grava o TEXTO do motivo (`applyInboundCustomFields`). Efeito real, confirmado por
  auditoria: a tela de Win/Loss podia mostrar `"21638"` como "Principal motivo de perda" em vez de
  "Não é ICP"; `lossTaxonomy.ts` (Comercial Inteligente) nunca reconhecia o ID como palavra-chave e
  classificava sempre como "Outro"; e a sincronização de volta ao Bitrix
  (`buildOutboundCustomFields`) falhava em silêncio (só logava em debug, nunca enviava o campo) —
  contrariando a própria documentação do módulo (`mesa-tratamento/AGENTS.md`), que afirma que
  `exportLeadToBitrixNow` "propaga sozinho". Corrigido com `resolveLossReasonLabel` (nova função
  exportada em `constants/lossReasons.ts`, testável em isolamento — 4 testes novos, incl. checagem
  de que TODO ID do catálogo real traduz corretamente) usada na escrita — todo consumidor a jusante
  passa a receber o mesmo formato de texto.
- **Achado terciário, corrigido**: o cron usava uma lista de status menor (sem
  `Negocios_Ganhos`) que o disparo manual — alinhado pra usar a mesma constante
  `WIN_LOSS_STATUSES` nos dois caminhos. Copy da tela corrigida (`WinLossAnalysis.tsx`): o texto
  afirmava "esta análise é gerada automaticamente toda sexta às 19h" de um jeito que sugeria que o
  resultado do cron aparecia na tela — não aparece (o cron não persiste, só loga; achado real, não
  corrigido — ver "fora de escopo" abaixo), corrigido pra não afirmar algo que a implementação não
  entrega. Catálogo do AI Suite Hub (`AISuiteHub.tsx`) tinha 2 entradas apontando pro mesmo
  endpoint `/win-loss-analysis` com título/descrição de "Resumos Executivos Diários" que na
  verdade descrevem `/report` (ReportsHub) — corrigido apontando a entrada certa pro endpoint
  certo.
- **Fora de escopo, documentado**: persistir o resultado do cron (análogo ao model `Report` já
  usado por ReportsHub) pra a tela deixar de depender só do disparo manual — mudança de schema,
  escopo maior que uma correção de bug; a copy foi corrigida pra não prometer isso, não a
  funcionalidade construída.
- **Verificação**: `npx eslint --no-cache` nos arquivos tocados (limpo, só os 2 warnings
  pré-existentes de `connection as any`, já presentes antes desta sessão), `npx tsc --noEmit -p .`
  (0 erros), `npx vite build` (sucesso), `npx vitest run -c vitest.unit.config.ts
  tests/unit/features/mesa-tratamento tests/unit/features/intelligence/services/
  winLossAnalysis.worker.test.ts` (16/16, incl. os 10 testes novos desta sessão).
- **Aprendizado incorporado**: primeiro achado de segurança cross-tenant real desta série (os
  achados de RBAC anteriores eram sobre papel dentro do mesmo tenant, nunca vazamento entre
  tenants) — reforça que todo `prisma.<model>.findMany` dentro de um worker/cron (que não passa
  pelo middleware `requireTenant` de uma rota HTTP) precisa ser auditado à parte: o padrão correto
  já existia no próprio repositório (`stagnation-scanner.service.ts`), só não tinha sido replicado
  aqui — vale conferir todo `src/**/*.worker.ts` que faça query sem filtro explícito de
  organização antes de assumir que só rotas HTTP têm esse risco.

## Piloto 028 — Topic Training Academy

- **Objetivo**: segundo dos 4 módulos sem piloto (`/app/topic_training`). Confirmado por auditoria:
  não é um módulo com backend próprio — é uma tela única que consome o endpoint genérico e
  compartilhado `/api/intelligence/studio` (`kind: 'training'`), a mesma família de 11 outras
  "capacidades" do Studio (e-mail, script de call, metodologia etc.). Ausência de persistência
  (progresso/pontuação) é decisão consistente com toda a família Studio (nenhum "kind" persiste,
  incl. Roleplay já documentado assim no Piloto 008) — não é bug, não corrigido.
- **Achado principal, corrigido**: mesmo bug de "módulo não reage a dark mode" já documentado e
  corrigido no Piloto 005 (Market Intelligence) — `indigo-*`/`rose-*`/`amber-*` hardcoded em todo o
  único componente do módulo (`TopicTrainingAcademy.tsx`), sem tokens, renderizando como retalho
  claro fixo dentro do app escuro (tema padrão real, `ThemeContext.tsx`). Corrigido mapeando pros
  tokens semânticos já existentes: indigo → `brand`/`brand-active` (é a cor de identidade da
  própria tela, não uma categoria fixa), rose → `danger`/`danger-active`, amber →
  `warning`/`warning-active`.
- **Achado secundário, corrigido**: input de tema só tinha `required` (impede vazio), mas o schema
  Zod real do backend (`studio/schema.ts`, `kind: 'training'`) exige `min(3).max(500)` — um tema de
  1-2 caracteres era enviado e só rejeitado pelo backend com mensagem genérica. Adicionado
  `minLength={3}`/`maxLength={500}` espelhando os limites reais confirmados no schema.
- **Preservado**: nenhuma mudança de comportamento/fluxo, só tokens e os 2 atributos de validação.
  Nenhum teste unitário ou e2e cobre o fluxo de geração desta tela (confirmado por auditoria) —
  nada a quebrar; `tests/e2e/accessibility.spec.ts` ("Academia de Treinamento...") só testa o
  estado inicial vazio, intacto.
- **Verificação**: `npx eslint --no-cache` (limpo), `npx tsc --noEmit -p .` (0 erros), `npx vite
  build` (sucesso).

## Piloto 029 — Reports Hub

- **Objetivo**: terceiro dos 4 módulos sem piloto (`/app/reports`, componente `ReportsHub.tsx` —
  não confundir com `Reports.tsx`, já confirmado órfão e removido numa sessão anterior). Confirmado
  por auditoria: funciona de ponta a ponta de verdade (SSE real, IA real, persiste via
  `prisma.report.create`, sobrevive a reload via `GET /report/latest`) — não é tela cenográfica.
- **Achado principal, corrigido — dado real subaproveitado**: `analyticsDB.overview()` já devolve
  `overdueActivities`, `lostThisMonth` e `averageScore` na MESMA resposta que a tela já busca, mas
  só 8 dos 11 campos apareciam nos cards de "Dados-base" — faltava o lado negativo do mês
  (`lostThisMonth`, ao lado de `closedThisMonth`), atividades atrasadas (distinto de "pendentes") e
  o score médio de IA. Adicionados 3 tiles novos, mesmo padrão visual dos 8 existentes; 2 testes
  novos (`ReportsHub.test.tsx`, agora 8/8).
- **Achado secundário, corrigido**: botão "Interpretar Dados com IA" sem `type="button"` explícito
  — mesmo nit de consistência já corrigido em 9+ pilotos anteriores.
- **Fora de escopo, documentado (achados reais, não corrigidos)**: o model `Report` persiste TODO
  relatório gerado por organização (índice `[organizationId, createdAt]` já pensado pra listagem),
  mas só `findFirst` por mais recente é lido em qualquer lugar do código — não existe rota `GET` de
  histórico nem UI pra ver relatórios anteriores; `POST /api/intelligence/report` (variante sem
  streaming) é rota órfã, sem nenhum consumidor de UI (a tela só chama `/report/stream`);
  `src/lib/queue/dailyReport.worker.ts` é um worker registrado mas **nunca agendado/enfileirado**
  por nada no repositório, e mesmo se fosse, só faz `logger.info('Simulando envio de
  e-mail...')` em vez de enviar de verdade — ao contrário do irmão real `weeklyPdfReport.worker.ts`
  (agendado de verdade, envia e-mail real). Os 3 achados são reais mas cada um é escopo de feature
  nova (UI de histórico, decidir remover ou terminar a rota órfã, decidir se o e-mail diário deve
  existir de verdade) — sinalizados, não decididos unilateralmente aqui.
- **Verificação**: `npx eslint --no-cache` (limpo), `npx tsc --noEmit -p .` (0 erros), `npx vite
  build` (sucesso), `npx vitest run -c vitest.unit.config.ts
  tests/unit/features/intelligence/components/ReportsHub.test.tsx` (8/8, preservando as 6
  asserções de texto/contrato de payload já existentes).

## Piloto 030 — CRM 360 / Propostas

- **Objetivo**: último dos 4 módulos sem piloto — na verdade 3 componentes relacionados mas
  distintos, confirmado por auditoria: `CrmOverview.tsx` (`/app/crm360`, dashboard agregado),
  `PropostasList.tsx`/`PropostaDetail.tsx`/`PropostaForm.tsx` (`/app/propostas`, CRUD real de
  `CrmCommercialDocument`, mora na pasta `crm360` apesar do nome da rota) e
  `PropostaComercialHub.tsx` (`/app/proposta-comercial`, iframe viewer de HTML estático + 3 hubs
  irmãos — `SocialSellingHub`/`TreinamentoAtlasGRHub`/`HubInteligenciaMarketingHub` — todos
  "acervos executivos" restritos por e-mail único, confirmado intencional por commit real
  `04367361`, não débito de migração).
- **Achado principal, corrigido — mesmo padrão de RBAC já corrigido 4+ vezes nesta série**:
  `POST/PUT /api/crm/documents` exigem `ADMIN/GESTOR/CLOSER/SDR` no backend (`writeRoles`,
  `crm360.routes.ts`), mas `PropostasList.tsx`/`PropostaDetail.tsx`/`PropostaForm.tsx` não faziam
  NENHUMA checagem de papel — um `VISUALIZADOR` via "Novo Documento", "Editar", "Mudar status" e
  "Solicitar assinatura" todos habilitados normalmente, só recebendo um 403 do backend ao tentar.
  Corrigido com `canWrite` (`useAuth` + `hasRequiredRole`, mesmo padrão de `Base.tsx`) escondendo
  os 4 controles nos 2 componentes. Novo `tests/unit/features/crm360/components/
  PropostasList.test.tsx` (4 casos: ADMIN/SDR veem o botão, VISUALIZADOR e sessão nula não veem).
- **Achado secundário, corrigido — funcionalidade de vínculo 100% modelada mas nunca preenchível**:
  `CrmCommercialDocument.leadId`/`companyId`/`contactId` são reais no schema, já aceitos por
  `crm360Api.createDocument`, já exibidos em `PropostaDetail.tsx` ("Registro vinculado") e
  `PropostasList.tsx` (coluna "Vinculado") — mas `PropostaForm.tsx` nunca enviava nenhum dos três.
  Todo documento criado desde que o módulo existe tinha e sempre teria "Vinculado: —". Corrigido
  adicionando busca de empresa com debounce (mesmo padrão de
  `src/features/lgpd/components/DataSubjectRights.tsx`) só no fluxo de CRIAÇÃO — `contactId` e a
  edição de vínculo em documento já existente ficaram de fora: `CrmDocumentUpdateInput` (usado no
  PUT de edição) não aceita nenhum dos três campos hoje, mudar isso exigiria rota de backend nova,
  fora do escopo desta correção pontual.
- **Achados de token, corrigidos**: `CrmOverview.tsx` e os 4 hubs executivos (`ExecutiveHeader.tsx`
  compartilhado + `PropostaComercialHub`/`SocialSellingHub`/`TreinamentoAtlasGRHub`/
  `HubInteligenciaMarketingHub`) tinham dois problemas: (1) cores cruas (`blue-500`/`emerald-500`/
  `amber-500`/`red-500`) sem token semântico, mapeadas pra `info`/`success`/`warning`/`danger`; (2)
  `bg-card`/`bg-base`/`bg-background`/`hover:bg-soft-hover` — classes que **não existem** em
  `globals.css` (sem `--color-card`/`--base`/`--background`/`--soft-hover`), renderizando sem
  efeito de CSS real — bug funcional, não só estético. Corrigido pra `bg-surface`/`bg-bg`/
  `hover:bg-line` (tokens reais). `roxo`/`purple` não têm token semântico — mantido com par
  `dark:` explícito (`dark:bg-purple-500/20 dark:text-purple-400`) em vez de inventar um token
  novo pra 3 ocorrências.
- **Achado de acessibilidade, corrigido**: `PropostasList.tsx`, a linha da tabela (`&lt;tr
  onClick&gt;`) que abre o detalhe de um documento não tinha `tabIndex`/`role="button"`/`onKeyDown`
  — inacessível por teclado. Corrigido com os 3 atributos + `aria-label` descritivo +
  `focus-visible:ring`.
- **Achado de manutenção, corrigido**: o e-mail do gate `RequireUserAllowed` dos 4 hubs executivos
  estava duplicado como literal em 6 arquivos (`App.tsx` 4x, `ExecutiveHeader.tsx`, `Sidebar.tsx`,
  `CommandPalette.tsx`) sem nenhuma constante compartilhada — trocar essa pessoa exigiria editar
  todos manualmente, sem checagem de tipo que apontasse um esquecido. Extraído
  `EXECUTIVE_HUB_ALLOWED_EMAIL` em `src/config/access-policy.ts`, com comentário explicando que é
  um gate DIFERENTE de `AUTHORIZED_LOGIN_EMAILS` (mesma pessoa, propósito diferente) — os 6 pontos
  agora importam a constante única.
- **Fora de escopo, documentado**: catálogo de produtos (`CrmProduct`) e itens de negócio
  (`CrmDealItem`) — CRUD de backend completo (schema, Zod, rotas com RBAC), zero UI em qualquer
  lugar do repositório pra criar/gerenciar nenhum dos dois; campo `currency` do documento sem
  `&lt;input&gt;` no formulário (sempre BRL); rota órfã `GET /pipelines`. Cada um é escopo de feature
  nova, não ajuste pontual — sinalizados.
- **Achado ambiental, não corrigido por mim (não é meu trabalho)**: durante a implementação, 5
  agentes em paralelo lançados pra este piloto atingiram o limite de sessão da API (rate limit)
  simultaneamente e morreram no meio da tarefa — 2 deles (RBAC+vínculo, acessibilidade+e-mail)
  não chegaram a editar nenhum arquivo; os outros 3 (tokens, Reports Hub, Topic Training) deixaram
  edições parciais mas corretas (confirmado por leitura do diff de cada um antes de continuar).
  Retomado manualmente completando o que faltava em vez de simplesmente re-lançar os agentes.
- **Verificação**: `npx eslint --no-cache` nos arquivos tocados (limpo, só 1 warning
  pré-existente em `CommandPalette.tsx` não relacionado — `useMemo` sem `currentUser` nas deps,
  confirmado via diff que a linha não foi tocada por esta sessão), `npx tsc --noEmit -p .` (0
  erros), `npx vite build` (sucesso), `npx vitest run -c vitest.unit.config.ts
  tests/unit/features/crm360` (8/8, incl. os 4 testes novos de RBAC).
- **Aprendizado incorporado**: primeira vez nesta série em que múltiplos agentes paralelos falham
  por rate limit no meio do trabalho — o protocolo que funcionou foi: (1) checar `git status`/
  `git diff` de cada arquivo antes de assumir que nada foi feito ou que tudo foi feito; (2)
  completar o que ficou pela metade lendo o diff real em vez de re-lançar o agente do zero (evita
  duplicar trabalho já correto); (3) um teste novo que parecia estar testando o comportamento
  errado (`getByRole`/`getByText` "não encontrando" o elemento) na verdade só estava sem
  `import '@testing-library/jest-dom/vitest'` — o erro real (`Invalid Chai property:
  toBeInTheDocument`) fica enterrado dentro do output de timeout do `waitFor` a menos que se busque
  a mensagem de erro exata em vez de confiar no snapshot de DOM impresso; vale conferir esse import
  primeiro sempre que `toBeInTheDocument`/matchers do jest-dom "não funcionam" num teste novo.

## Pilot 030 — Auditoria de cor crua fora dos tokens: módulo Bitrix24 preso em laranja AtlasGR

- **Objetivo**: dando sequência à auditoria de cores Tailwind cruas fora do sistema de tokens
  (mesma categoria de débito do Piloto 005/006), migrar os 4 componentes do módulo de integração
  Bitrix24 (`BitrixExtractionPanel.tsx`, `BitrixImportPanel.tsx`, `BitrixSyncRulesPanel.tsx`,
  `Integrations.tsx`) de `orange-500`/`orange-600`/`gray-*`/`white` cru para os tokens reativos do
  projeto (`bg-brand`/`text-brand`/`bg-soft`/`bg-surface`/`bg-surface-2`/`text-ink`/`text-ink-2`/
  `border-line`).
- **Bug real, não só débito estético**: laranja cru (`orange-500`/`600`, cor de ação/foco/destaque)
  nunca reage à troca de marca — um usuário Total Trac abrindo qualquer tela de Integrações via
  botões, badges "ativo" e ícones em laranja da AtlasGR, quebrando a identidade visual da própria
  marca escolhida. Achado equivalente ao de `Card`/`Button` no Piloto 006, mas nunca corrigido nas
  telas de feature (o Piloto 006 documentou explicitamente que telas de feature individuais não
  foram auditadas naquela rodada).
- **Achado colateral em `Integrations.tsx` que o grep por `orange-` não pegava**: o badge do
  cabeçalho da sidebar usava `text-[var(--brand-primary)]` — uma custom property estática
  (`--brand-primary: #ff5618`, definida uma única vez em `:root`, nunca redefinida em `.dark` nem
  reescrita pelo `BrandContext.tsx`) em vez do token dinâmico `--brand`. Mesmo sintoma (ícone preso
  em laranja da AtlasGR na Total Trac), mecanismo diferente — só apareceu por leitura direta do
  JSX, não por grep de classe Tailwind. Corrigido para `text-brand`.
- **Contagem migrada** (todas as ocorrências de `orange-*` confirmadas zeradas via grep após a
  mudança, nos 4 arquivos): `BitrixImportPanel.tsx` 104, `BitrixSyncRulesPanel.tsx` 16,
  `Integrations.tsx` 17, `BitrixExtractionPanel.tsx` 10 — mesma contagem exata do achado original
  da auditoria.
- **Escopo mecânico deliberadamente mais amplo que só "trocar laranja"**: seguindo o pedido
  explícito, `gray-*`/`white` com par `dark:` já existente também foram migrados para
  `text-ink`/`text-ink-2`/`bg-surface`/`bg-surface-2`/`border-line` — não é bug de dark mode (o par
  `dark:` já existia e já funcionava, ao contrário do achado do Piloto 005), é consolidação da
  escala cinza duplicada na escala "warm neutral" do projeto. Extensão pontual e justificada a
  3 trechos **sem** par `dark:` pré-existente, por estarem na vizinhança imediata do que já estava
  sendo editado (mesmo componente/bloco): fundo raiz da tela (`bg-gray-50/50` → `bg-bg`), chrome da
  sidebar (`bg-white`/`border-gray-200`/`text-gray-900` sem par → `bg-surface`/`border-line`/
  `text-ink`) e dois textos secundários do card Google (linha de eventos do Calendar). **Não
  estendido** às abas WhatsApp/Google/3CX além desses pontos, nem à seção 3CX inteira (que usa uma
  família de cor própria, sky-*, e tem vários trechos sem par `dark:` — mesma classe de achado do
  Piloto 005, mas família de cor e escopo diferentes, fora do pedido original) — reportado à parte
  via `spawn_task`, não corrigido nesta sessão.
- **Badges de status semânticos preservados** (mesmo critério do Piloto 005): `green`/`blue`/
  `amber`/`red`/`violet`/`sky`/`emerald` usados para "conectado"/"erro"/"pendente"/"em andamento"/
  concluído em `STATUS_BADGE`/`CAPABILITY_STYLES` e nos botões de download/WhatsApp/e-mail já têm
  significado semântico (ok/critical/warn/info), não são "cor de marca" — mantidos como estão,
  já com pares `dark:` corretos.
- **Botões sólidos de marca**: em vez de inventar uma cor nova pro "laranja escuro" de hover
  (`orange-700`), reaproveitado o padrão já estabelecido em `Button.tsx` (`bg-brand-active
  hover:bg-brand-2`, ou `hover:brightness-110` nos casos com gradiente `from-brand-active
  to-brand-2`) — mesmo motivo do comentário em `Button.tsx`: texto branco direto sobre `--brand`
  cru não atinge 4.5:1 AA em nenhuma das duas marcas.
- **Verificação real do dev server travou nesta sessão, com um sintoma novo em relação aos
  Pilotos 003/004/P3**: `preview_start({name: 'prospector-dev-uxcheck'})` reproduziu o boot
  silencioso já documentado (processo vivo, zero log além do banner do npm, porta nunca abre,
  confirmado por `navigate` recusando conexão depois de 90s+ de espera). O contorno documentado
  (subir via `npx tsx watch server.ts` manual + `run_in_background`) **não funcionou como nas
  rodadas anteriores**: a primeira tentativa manual travou sem log (mesmo padrão), e a segunda
  tentativa (porta diferente, variáveis de ambiente completas) foi encerrada por `SIGTERM` (exit
  143) segundos após o start, antes de qualquer log de aplicação — não foi possível confirmar se é
  limite de processo em background deste ambiente Windows/Git Bash específico (diferente dos
  ambientes Linux com `apt-get`/Docker completo dos Pilotos 003/004/P3) ou concorrência entre as
  duas tentativas simultâneas. Log de uma tentativa anterior revelou uma causa real conjunta:
  `EADDRINUSE` na porta 3009 (duas instâncias tentando subir ao mesmo tempo) e `Redis NOAUTH` — o
  perfil `prospector-dev-uxcheck` do `launch.json` não define `REDIS_URL` com a senha que o
  container `atlas_redis` exige, então as filas (`agentQueue`/`coldCallQueue`/etc.) ficam
  "offline" (não bloqueante, só um warning, mas registra como débito de configuração separado).
  **Sem servidor real, a verificação ficou restrita a `tsc --noEmit` (0 erros nos 4 arquivos —
  erros pré-existentes de Prisma client desatualizado em `copiloto-ia`/`commercial-intelligence`,
  não relacionados) e `eslint` (0 erros/warnings nos 4 arquivos)**, mais revisão manual token a
  token contra os padrões já validados visualmente em `Button.tsx` (Piloto 006) e no próprio
  `Integrations.tsx` (que já tinha uma seção — cartões de conexão Bitrix — migrada para os mesmos
  tokens em sessão anterior, confirmando que a escolha de token está alinhada ao padrão já
  aprovado). Nenhum processo órfão deixado (`preview_stop` + `netstat` confirmando portas
  3005/3009/3011 livres ao final).
- **Aprendizados incorporados à constituição**: nenhuma mudança de regra desta vez — reforça,
  registrado aqui, que grep por classe Tailwind não pega toda cor de marca hardcoded (custom
  property estática via `text-[var(--x)]` é um segundo padrão de bug a procurar numa auditoria
  futura de cor); e que o contorno de boot silencioso do dev server documentado nos Pilotos
  003/004/P3 não é garantido neste ambiente — uma sessão futura sem servidor real deve seguir o
  protocolo de QA alternativa da `visual-qa/SKILL.md` sem insistir indefinidamente no boot.
