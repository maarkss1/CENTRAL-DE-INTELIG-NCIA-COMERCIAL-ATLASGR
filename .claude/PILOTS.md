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
