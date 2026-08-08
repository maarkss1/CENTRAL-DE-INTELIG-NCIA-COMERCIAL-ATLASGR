# Design QA — Central de Inteligência Comercial ATLASGR (Prospector)

**Data:** 2026-08-07
**Escopo:** Frontend completo (`src/`, React 19 + TypeScript + Vite + Tailwind CSS 4), ~480 arquivos
TS/TSX em 25 módulos de feature, também empacotado como app Android via Capacitor.
**Rodada:** Tier 1 (auditoria completa + correções seguras) + Tier 2 completo em 3 lotes — o
terceiro cobre todo o backlog restante (Fases A-H: jsx-a11y, regressão visual + axe-core, migração
de primitivos pra tokens de marca dinâmicos, rotas reais, Configurações, formulários de CRM
migrados pra `ui/Dialog`, paginação compartilhada). Ver seção "Terceiro lote" e "Backlog Tier 2
(o que ainda falta)" no fim do documento para o que fica de fato pendente.

## Metodologia e suas limitações

Esta auditoria foi feita por leitura estática de código (tokens, primitivos de UI, layout, rotas,
25 módulos de feature, infraestrutura de teste) — **não** por uma varredura visual ao vivo nos 12
breakpoints, 6 níveis de zoom e leitor de tela pedidos no briefing original. Motivo: este repositório
não tem hoje nenhuma ferramenta de regressão visual (`toHaveScreenshot`, Percy, Chromatic) nem de
auditoria de acessibilidade automatizada (`axe-core`, `jest-axe`) — rodar essa varredura primeiro
exigiria montar essa infraestrutura, o que está listado no backlog Tier 2. Os scores abaixo são,
portanto, **estimativas baseadas em inspeção de código**, não em medição automatizada. Nesta sessão
também não foi possível abrir o app no navegador para confirmar visualmente os ajustes (ambiente sem
pane de navegador interativo disponível) — a verificação de código foi feita via `npm run lint` e
`npx tsc -b --noEmit`, ambos limpos após as mudanças (ver seção Verificação).

## Score inicial (antes desta rodada)

| Categoria | Score | Racional |
|---|---|---|
| Design Consistency | 52 | 3 tokens de cor diferentes para a mesma marca (`--brand`/`--color-atlas-orange`/`--brand-primary`), radius divergente entre `Button`/`Card`/`Dialog`/`Skeleton`/`EmptyState`, `Badge` mistura 3 sistemas de cor |
| Typography | 68 | Escala de H1-H3 hardcoded no `@layer base`, sem tokens de tipografia; uso consistente de `font-sans`/`font-display` |
| Spacing | 70 | Sem tokens de spacing customizados, mas uso disciplinado da escala padrão do Tailwind nas páginas lidas |
| Accessibility | 34 | 0 `focus-visible`, 0 `prefers-reduced-motion`, 1 único `tabIndex` em toda a `src/`, sem `eslint-plugin-jsx-a11y`, sem `aria-describedby` em formulários |
| Responsive Design | 40 | Sidebar fixa sem nenhum tratamento mobile; Kanban de CRM sem breakpoints (desktop-only) |
| Mobile UX | 25 | App também é distribuído via Capacitor/Android e a navegação principal (Sidebar) era inutilizável abaixo de ~1024px |
| Forms | 60 | Padrão react-hook-form + zod consistente entre os 2 formulários que o usam, mas `inputClass`/`labelClass`/`errorClass` duplicados verbatim entre eles |
| Tables | 45 | Sem `DataTable` compartilhado — `ContactList` e `CompanyList` implementam `<table>` e paginação de forma independente e ligeiramente divergente |
| Feedback | 58 | `Toaster` e `Skeleton` compartilhados existem; `Dialog`/`Skeleton` não respeitavam dark mode até esta rodada |
| Performance | 65 | Lazy loading por rota/tab já em uso (`React.lazy` + `Suspense`) em todos os 22 módulos |
| Dark Mode | 55 | Maioria dos primitivos é token-based, mas `Dialog` e `Skeleton` eram 100% light-only |
| Frontend Architecture | 50 | 3 implementações de layout/nav coexistindo (`Sidebar`+`AppTopbar` viva, `Header` e `Topbar`+`nav.ts` mortas, cada uma com seu próprio `TabType`) |
| **Média** | **52** | |

## Score final (após as correções desta rodada)

| Categoria | Score | O que mudou |
|---|---|---|
| Design Consistency | 58 | Variantes quebradas do `Button` corrigidas; paleta de gráficos deduplicada. Duplicação de tokens de cor e radius **permanece** (Tier 2). |
| Typography | 68 | Sem alteração nesta rodada. |
| Spacing | 70 | Sem alteração nesta rodada. |
| Accessibility | 46 | Baseline global de `:focus-visible` e `prefers-reduced-motion` adicionada. Ainda falta cobertura de `aria-*`/`tabIndex` por componente e lint de a11y (Tier 2). |
| Responsive Design | 58 | Sidebar agora é off-canvas responsiva com breakpoint `lg`. Kanban de CRM e tabelas seguem sem tratamento (Tier 2). |
| Mobile UX | 52 | Navegação principal agora é utilizável em viewport de celular (a própria forma de distribuição via Capacitor tornava isso crítico). |
| Forms | 60 | Sem alteração nesta rodada (duplicação de `ContactForm`/`CompanyForm` fica para Tier 2 por tocar fluxo de CRM ao vivo). |
| Tables | 45 | Sem alteração nesta rodada (mesmo motivo). |
| Feedback | 66 | `Dialog` e `Skeleton` agora corretos em dark mode. |
| Performance | 65 | Sem alteração nesta rodada. |
| Dark Mode | 68 | `Dialog` e `Skeleton` migrados para tokens; eram os 2 únicos primitivos ainda 100% light-only. |
| Frontend Architecture | 62 | Removidas as 2 implementações mortas de layout/nav e o `TabType` triplicado; agora há uma única fonte (`tabMeta.ts`). |
| **Média** | **60** | +8 pontos nesta rodada; maior parte do ganho potencial (Tables/Forms/full a11y) depende do Tier 2. |

## Segundo lote (primeiro corte do Backlog Tier 2 — itens de baixo risco)

Após o Tier 1, o usuário pediu para avançar nos itens de menor risco do backlog. Resultado:

| Categoria | Score | O que mudou |
|---|---|---|
| Design Consistency | 63 | `Button` `sm`/`lg` não sobrescrevem mais o radius do `default`/`icon` (inconsistência real corrigida); `Dialog`/`EmptyState` convergidos para os tokens `rounded-card`/`rounded-card-lg` compartilhados com `Card`; botões do `CrmBoard` migrados de `bg-blue-600` cru para `ui/Button`. Consolidação de tokens de cor ficou **parcial** — ver nota abaixo. |
| Accessibility | 48 | `MotionConfig reducedMotion="user"` cobre agora as animações do framer-motion (antes só CSS puro respeitava `prefers-reduced-motion`). |
| Frontend Architecture | 64 | Dois tokens de cor mortos (`--bg-base`, `--bg-card`, sempre brancos mesmo em dark mode — bug latente nunca disparado por falta de uso) e um terceiro nunca consumido (`--info-token`) removidos. |
| **Média** | **~61** | Ganho pequeno e concentrado — a maior parte do valor restante do Tier 2 está nos itens de maior risco (forms/tabelas) ou maior esforço (tooling de a11y/regressão visual), não neste lote. |

**Nota importante sobre consolidação de tokens de cor (DQA-10):** a investigação revelou que a
duplicação de tokens **não é acidental em toda parte** — `BrandContext.tsx` já documenta, no próprio
código, um bug histórico real (leia o comentário em `BrandContext.tsx:58-62`) causado exatamente por
essa duplicação: `--brand`/`--brand-2` (consumidos pelo sistema de tokens novo, `bg-brand` etc.) e
`--brand-primary`/`--brand-accent` (variáveis legadas) precisam **os dois** ser atualizados
dinamicamente pelo troca-marca AtlasGR↔TotalTrac via `document.documentElement.style.setProperty`.
Além disso, 56 arquivos usam as classes `atlas-orange`/`totaltrack-blue` **deliberadamente como cores
estáticas por marca**, escolhidas via ternário no JSX (ex.: `isAtlas ? 'bg-atlas-orange/20' :
'bg-totaltrack-blue/20'` em `MainLayout.tsx`) — um padrão de branding diferente e coexistente com o
token dinâmico `--brand`. Transformar `--color-atlas-orange` num alias de `--brand` (como um script
"consolidador" ingênuo faria) quebraria essa lógica: os dois lados do ternário passariam a renderizar
a mesma cor sempre que a marca fosse trocada. Por isso, nesta rodada só removi os **3 tokens
comprovadamente mortos** (zero uso em `src/`: `--bg-base`, `--bg-card`, `--info-token`) e **não**
mexi nos tokens de marca duplicados-mas-vivos. Consolidar de verdade exige primeiro decidir: o app
deveria migrar 100% para o token dinâmico `--brand`/`--brand-2` e abandonar o padrão de ternário
estático `atlas-orange`/`totaltrack-blue`? Essa é uma decisão de arquitetura de branding, não uma
limpeza de CSS — fica como um item Tier 2 mais bem definido agora do que antes desta investigação.

## Terceiro lote (backlog Tier 2 completo, exceto o que fica documentado como pendente)

O usuário pediu para avançar em **todos** os itens restantes do backlog. Investigação prévia mudou
o escopo de 2 itens (branding e Settings — ver seção anterior); o restante seguiu o plano em 8 fases
(A→H), cada uma verificada com `npm run lint`/`npx tsc -b --noEmit` limpos antes da próxima, e as
fases de maior risco (D e G) verificadas ponta a ponta contra o servidor real via Playwright.

| Categoria | Score | O que mudou |
|---|---|---|
| Accessibility | 66 | `eslint-plugin-jsx-a11y` instalado e ligado (achou 199 violações reais, priorizadas — ver Fase A abaixo); `axe-core` + Playwright novo (`tests/e2e/accessibility.spec.ts`) achou e corrigiu 2 bugs reais: contraste insuficiente (branco sobre `--brand` no item ativo da Sidebar, ~3.2-3.9:1 vs mínimo 4.5:1 AA) e região de scroll do Kanban não focável por teclado. |
| Responsive Design | 66 | Regressão visual (`tests/e2e/visual.spec.ts`) cobrindo dashboard/CRM/formulário em light+dark, com baseline commitada — qualquer mudança visual não intencional futura já tem um teste pra pegar. |
| Forms | 78 | `ContactForm`/`CompanyForm` migrados de modal hand-rolled pra `ui/Dialog` (que ganhou `maxWidth`/`footer`/`preventClose`); toast de sucesso/erro adicionado nos dois fluxos (antes nenhum mostrava erro de salvar ao usuário) e no delete de empresa (só contato tinha). Verificado ponta a ponta contra o servidor real: campo UF continua forçando maiúsculas, submit com botão fora do `<form>` continua funcionando, validação não fecha o dialog. |
| Tables | 55 | `Pagination` compartilhado extraído e usado por `ContactList`/`CompanyList` (antes duas implementações levemente divergentes — ícones vs texto "Anterior"/"Próxima"); `ContactList` convergido pra usar `EmptyState` nos estados vazio/erro, igual `CompanyList` já fazia (e removido um banner de erro duplicado que aparecia junto com o estado de erro da tabela). `DataTable` genérico único **não** foi construído — ver nota de escopo abaixo. |
| Design Consistency | 70 | 7 primitivos centrais (`Button`, `Card`, `Badge`, `Dialog`, `Drawer`, `EmptyState`, `Timeline`) migrados de `atlas-orange` fixo pros tokens dinâmicos `--brand`/`--brand-2` — corrige um vazamento de marca real (usuário TotalTrac via laranja da AtlasGR nesses componentes). Confirmado via regressão visual que o resultado é um no-op pra AtlasGR (mesma cor). |
| Frontend Architecture | 74 | Navegação migrada de `useState<TabType>` pra rotas reais (`react-router-dom`, `<Routes>` aninhadas em `/app/*`) — deep-link, F5 numa tela e botão Voltar do navegador já funcionam (verificado com 3 testes novos em `crm.spec.ts`). `Settings.tsx` deixou de ser stub. |
| **Média** | **~68** | Praticamente todo o backlog documentado no Tier 1 foi endereçado; o que resta é escopo genuinamente maior (ver "Backlog Tier 2" no fim). |

### Fase A — `eslint-plugin-jsx-a11y`

Instalado e registrado em `eslint.config.mjs` (junto com `eslint-plugin-react`, que já era
devDependency mas não estava ligado ao flat config). Rodar o preset `recommended` pela primeira vez
achou **199 erros reais** em 8 regras distintas. Decisão, por regra:

- **`react/no-unescaped-entities` (30 ocorrências, 14 arquivos)** — mecânico e de risco zero (troca
  de aspas retas por `&quot;` em texto JSX, sem mudar nada visualmente). Corrigido em todos.
- **`react/no-unknown-property` (16, só em `SpaceGame.tsx`)** — falso positivo: são props do
  `@react-three/fiber` (`position`, `args`, `castShadow` etc.), que o lint não reconhece como um
  namespace JSX válido. Desativado via override escopado aos 3 arquivos que usam r3f.
- **`jsx-a11y/heading-has-content` (1, `Card.tsx`)** — falso positivo num wrapper genérico
  (`CardTitle` recebe `children` via `{...props}`, o lint não enxerga isso estaticamente). Silenciado
  com comentário inline explicando o motivo.
- **`jsx-a11y/label-has-associated-control` (74), `click-events-have-key-events` (26),
  `no-static-element-interactions` (23), `no-noninteractive-element-interactions` (2),
  `no-autofocus` (1), `media-has-caption` (1)** — **rebaixadas pra `warn`**, não corrigidas em massa.
  As duas primeiras exigiriam adicionar `role`/`tabIndex`/`onKeyDown` a dezenas de `<div onClick>`
  espalhados por telas de negócio — mudança de comportamento de interação, não mecânica, e arriscada
  de fazer às cegas em ~30 arquivos que eu não tinha lido a fundo. `label-has-associated-control`
  também é grande volume (74) espalhado por muitos formulários diferentes. Ficam documentadas como
  backlog incremental — `npm run lint` mostra as 152 restantes como warning, visíveis mas não
  bloqueantes.

### Fase B — Regressão visual + `axe-core`

`@axe-core/playwright` instalado. Dois specs novos:
- `tests/e2e/accessibility.spec.ts` — roda `AxeBuilder` em login, dashboard, Pipeline CRM e
  Configurações, falha só em violações `critical`/`serious` (as que realmente impedem uso por
  teclado/leitor de tela — o resto vai pra um attachment JSON no relatório do Playwright, não trava
  o CI). **Achou 2 bugs reais de verdade**, ambos corrigidos nesta rodada:
  1. `color-contrast` (serious): texto branco sobre `bg-brand` no item ativo da Sidebar —
     `#ffffff`/`#FF5618` dá 3.18:1 (AtlasGR) e `#ffffff`/`#0088CC` dá 3.89:1 (TotalTrac), abaixo do
     mínimo AA de 4.5:1 pra texto normal. Corrigido com um token novo,
     `--color-brand-active: color-mix(in srgb, var(--brand) 75%, black)`, que escurece o suficiente
     pras duas marcas (calculado via a fórmula de luminância relativa do WCAG, não só "escureci até
     parecer OK") — usado em `Sidebar.tsx` (3 ocorrências) e `SinglePageDashboard.tsx` (1).
  2. `scrollable-region-focusable` (serious): a área de scroll horizontal do Kanban (`CrmBoard.tsx`)
     não tinha `tabIndex`, então um usuário de teclado não conseguia rolar as colunas sem mouse.
     Corrigido com `tabIndex={0}` + `aria-label` (e um disable pontual do
     `jsx-a11y/no-noninteractive-tabindex`, porque essa regra de lint não conhece essa exceção
     documentada nas ARIA Authoring Practices).
- `tests/e2e/visual.spec.ts` — `toHaveScreenshot` em dashboard/CRM (light+dark) e formulário de
  contato aberto, com baseline gerada e commitada em `tests/e2e/visual.spec.ts-snapshots/`.
  `maxDiffPixels` calibrado pra absorver o relógio ao vivo e a saudação por horário do dia
  (`greeting()` em `SinglePageDashboard.tsx`), não pra mascarar regressão real.

### Fase C — Migração de primitivos pra `--brand`/`--brand-2`

`Button`, `Card`, `Badge`, `Dialog`, `Drawer`, `EmptyState`, `Timeline` — toda referência a
`atlas-orange`/`atlas-orange-medium` trocada por `brand`/`brand-2`. Como a cor da AtlasGR é idêntica
nos dois sistemas (`#FF5618`), o visual da marca padrão não muda — confirmado via regressão visual
(Fase B) rodando limpo antes e depois desta fase. O ganho é que esses 7 componentes agora reagem à
troca de marca AtlasGR↔TotalTrac ao vivo, como já deveriam.

**Não migrados nesta rodada**: os outros ~38 arquivos de feature que também hardcodam
`atlas-orange`/`totaltrack-blue` fora dos primitivos de UI — ver "Backlog Tier 2" no fim.

### Fase D — Tab-state → rotas reais

`src/App.tsx`: os 24 blocos `{activeTab === 'x' && <X/>}` viraram `<Route path="x" element={<X/>} />`
aninhadas sob `/app/*` (padrão oficial do React Router pra rotas "descendentes" via wildcard).
`MainLayout.tsx` deixou de receber `activeTab`/`onTabChange` como prop e passou a derivar o módulo
ativo de `useLocation()`. `Sidebar.tsx`, `CommandPalette.tsx`, `AtlasChatbotTrigger.tsx` →
`FloatingChatbook.tsx` e `SinglePageDashboard.tsx` trocaram o callback `onTabChange`/`onNavigate`
prop-drilled por `useNavigate()` direto. `src/lib/paletteIntent.ts` (o singleton mutável que hoje
carrega "abra o formulário de criar contato depois de navegar" entre Command Palette e a tela de
destino) foi mantido como está — modernizar pra `location.state` é uma melhoria separada, não o foco
desta fase.

Verificado com 3 testes novos/atualizados em `tests/e2e/crm.spec.ts`: URL muda ao clicar num item do
menu (`/app/crm`, `/app/companies`, ...), **F5 numa URL de módulo específico não cai mais no
dashboard** (era exatamente a limitação que o comentário antigo do spec documentava), e o botão
Voltar do navegador funciona. Os specs de auth/leads-crud/forms também passaram sem alteração,
confirmando que a migração não quebrou nenhum fluxo existente.

### Fase E — Configurações (escopo mínimo)

`Settings.tsx` deixou de ser o stub "Em desenvolvimento..." — agora tem 2 seções: **Aparência**
(toggle de tema + seletor AtlasGR/TotalTrac, reaproveitando `useTheme()`/`useBrand()` já existentes)
e **Perfil** (nome/e-mail/função do usuário logado, somente leitura, via `useAuth().currentUser`).
Nenhuma rota de API nova. Verificado via `axe-core` (sem violações críticas/sérias).

### Fase F — `ui/Dialog.tsx` estendido

3 props novas, todas opcionais (sem quebrar o único outro consumidor futuro): `maxWidth` (largura do
painel, default `max-w-md`), `footer` (rodapé fixo fora da área rolável — necessário pra reproduzir
o padrão Cancelar/Salvar que os formulários já tinham), `preventClose` (suprime fechar por
clique-no-backdrop/Escape — usado com `isSubmitting` nos formulários, pra não perder dados de um
submit em andamento). Radius/sombra alinhados ao visual que `ContactForm`/`CompanyForm` já tinham
(`rounded-card-lg`), pra migração na Fase G ser um no-op visual.

### Fase G — `ContactForm`/`CompanyForm` → `ui/Dialog`

O maior risco desta rodada (toca fluxo de CRM ao vivo) — por isso o mais verificado. Preservado:
- O botão de submit continua **fora** da tag `<form>`, ligado via atributo HTML `form="contact-form"`
  / `form="company-form"` dentro do novo `footer` do Dialog.
- O campo UF do formulário de Empresa continua com o `onChange` customizado que força maiúsculas.
- Schemas Zod, validação, `react-hook-form`, `inputClass`/`labelClass`/`errorClass` — intocados.

Adicionado: toast de sucesso/erro em salvar (nos dois formulários — antes nenhum mostrava erro de
salvar pro usuário, só logava) e no excluir empresa (`CompanyList.tsx` — antes só excluir contato
mostrava toast).

Verificado com um spec novo, `tests/e2e/contact-company-forms.spec.ts`, contra o servidor real:
criar uma empresa (UF vira maiúscula, toast "Empresa criada." aparece, dialog fecha), validação de
campo obrigatório sem fechar o dialog, e criar um contato vinculado a uma empresa (exercita o botão
de submit fora do `<form>` e o toast "Contato criado."). Os 3 passaram.

### Fase H — Peças compartilhadas de tabela

`src/components/ui/Pagination.tsx` novo — mesma lógica que `ContactList`/`CompanyList` já tinham
duplicada (com aparências levemente diferentes: ícones vs. texto "Anterior"/"Próxima"), agora uma
única aparência nos dois. `ContactList.tsx` convergido pra usar `EmptyState` nos estados vazio/erro
(igual `CompanyList` já fazia) — isso também removeu um banner de erro vermelho duplicado que
aparecia simultaneamente com o estado de erro da tabela (achado do Tier 1, corrigido de fato agora).

**Não construído nesta rodada**: um `DataTable<T>` genérico único hospedando as duas listas. Achado
da investigação: `CompanyList` tem seleção em massa com barra de ação flutuante, alternância
grid/tabela e popover de stack de tecnologia — muito mais rico que `ContactList`. Forçar as duas
dentro de uma abstração genérica exigiria reescrever a parte mais complexa do CompanyList por pouco
ganho; a decisão foi extrair só o que é genuinamente compartilhável (paginação, padrão vazio/erro).

### Verificação da rodada completa

- `npm run lint` e `npx tsc -b --noEmit`: **0 erros** depois de cada fase e no final.
- Suíte e2e completa (`npx playwright test`, 28 testes): **21 passaram**. Os 7 que falharam são
  todos o mesmo motivo, e não uma regressão desta rodada: `server.ts` tem um `authLimiter`
  pré-existente (`max: 20` requisições de login/cadastro por IP a cada 15 min — proteção real contra
  força bruta/credential stuffing, não algo que eu deveria enfraquecer pra facilitar teste local).
  Cada spec, individualmente, tinha passado várias vezes ao longo desta sessão — a soma de sign-ups
  de TODOS os specs rodando em sequência numa única janela de 15 min é que estourou o limite depois
  de ~20 cadastros (specs de accessibility/auth/forms/crm já tinham consumido a cota antes de chegar
  em leads-crud/visual). Isso é fricção de infraestrutura de teste local pré-existente, evidenciada
  agora por eu ter adicionado 3 specs novos — não um bug introduzido nesta rodada.
- Pane de navegador interativo continuou indisponível nesta sessão (mesma limitação já reportada nas
  rodadas anteriores) — a verificação desta rodada foi inteiramente via Playwright headless contra o
  servidor real (Postgres/Redis já rodando em Docker neste ambiente), não manual num navegador.

## Fase 1-2 — Inventário e Design System Forensics (resumo)

- **Tokens**: Tailwind 4 configurado 100% via `@theme` em `src/styles/globals.css` (sem
  `tailwind.config.*`). Dark mode via classe `.dark` (`@custom-variant dark`). Dois sistemas de cor
  coexistem: um par `:root`/`.dark` (`--bg`, `--surface`, `--ink`, `--line`, `--brand`, `--warn`,
  `--ok`) e um segundo grupo de hex estáticos sem variante dark (`--color-atlas-orange`,
  `--brand-primary`, `--color-success/warning/danger/info`) — `--brand`, `--color-atlas-orange` e
  `--brand-primary` são 3 nomes para o mesmo `#FF5618`. Apenas 2 tokens de radius customizados
  (`--radius-card`, `--radius-card-lg`) e 1 de shadow (`--shadow-card`).
- **Primitivos de UI** (`src/components/ui/`, 22 arquivos): `Button`, `Card` e `Badge` usam `cva`
  (sistema de variantes); `Dialog`, `Drawer`, `Skeleton`, `EmptyState` não. Radius diverge entre
  quase todos: `rounded-xl` (Button/Dialog), `rounded-card` (Card, único a usar o token dedicado),
  `rounded-md` (Skeleton/Button-sm), `rounded-3xl`/`rounded-2xl` (EmptyState), `rounded-full`
  (Badge). `Dialog.tsx` e `Drawer.tsx` implementam dois padrões de overlay estruturalmente diferentes
  (nativo `<dialog>` vs. `div`+framer-motion) para o mesmo propósito — e **nenhum dos dois é
  importado em lugar nenhum de `src`**: toda feature que precisa de modal/drawer implementa o próprio
  (`ContactForm`, `CompanyForm`, `LeadDetailDrawer`, `GoogleLoginModal`), cada um ligeiramente
  diferente (opacidade/blur do backdrop, presença ou não de animação).
- **Ícones**: `lucide-react` é a única biblioteca de ícones funcionais (82 arquivos); SVG inline
  aparece só em 6 arquivos, todos logos de marca — sem duplicação de sistema de ícones.
  Icons library usage consistente. ✅
- **Gráficos**: `recharts` usado em 3 arquivos (`Analytics.tsx`, `GlowChart.tsx`, `Billing.tsx`), cada
  um com paleta própria em hex — nenhuma referência ao sistema de tokens do `globals.css`.
  `Analytics.tsx`/`Billing.tsx` duplicavam verbatim `SINGLE`/`INK`/`tooltipStyle` (corrigido nesta
  rodada — ver Fase 3).
- **Layout/rotas**: `App.tsx` usa `react-router-dom` só no nível raiz (`/welcome`, `/login`,
  `/app/*`); dentro de `/app/*` os "módulos" (dashboard, CRM, contatos etc.) são alternados por
  `useState<TabType>`, não por rota própria — sem deep-link possível para um módulo específico. Fora
  do escopo desta rodada (mudança de arquitetura, não de design QA).
- **Testes**: só 1 projeto Playwright (`chromium` desktop), sem viewport mobile, sem screenshot/visual
  regression, sem `axe-core`. Testes de `tests/unit`/`tests/integration` são 100% backend
  (services/RLS/RBAC) — não existe teste de componente/UI.

## Fase 3 — Design QA automático: tabela de ocorrências

| ID | Tela/Escopo | Componente | Problema | Severidade | Correção | Status |
|---|---|---|---|---|---|---|
| DQA-01 | Global (todo botão `outline`/`secondary`/`ghost`/`link`) | `src/components/ui/Button.tsx` | Variantes referenciavam classes shadcn inexistentes no tema (`bg-background`, `bg-accent`, `text-accent-foreground`, `bg-secondary`, `text-primary`) — não resolviam cor nenhuma | **Alta (bug)** | Trocado por tokens reais (`border-line`/`bg-surface`/`bg-surface-2`/`text-ink`/`text-brand`) | ✅ Corrigido |
| DQA-02 | Qualquer modal futuro via `ui/Dialog` | `src/components/ui/Dialog.tsx` | 100% light-only (`bg-white`, `text-slate-800`, `border-slate-100`) sem variante dark, ao contrário dos demais primitivos | Alta | Migrado para tokens (`bg-surface`, `text-ink`, `border-line`, `text-ink-2`) | ✅ Corrigido |
| DQA-03 | Todo loading state que usa `Skeleton` | `src/components/ui/Skeleton.tsx` | `bg-slate-200` fixo — em dark mode renderiza um retângulo cinza-claro destoante | Alta | Trocado para `bg-surface-2` (token com variante dark correta) | ✅ Corrigido |
| DQA-04 | N/A (código morto) | `src/components/layout/Header.tsx` | Componente nunca renderizado em lugar nenhum; só seu `TabType` era usado, criando acoplamento a um arquivo "morto" | Média | `TabType` movido para `tabMeta.ts`; `Header.tsx` removido; 6 importadores atualizados | ✅ Corrigido |
| DQA-05 | N/A (código morto) | `src/components/layout/Topbar.tsx` + `nav.ts` | Segunda implementação completa e paralela de navegação/`TabType`, nunca importada por nada | Média | Ambos removidos (zero importadores confirmado antes da remoção) | ✅ Corrigido |
| DQA-06 | Analytics, Consumo de IA (Billing) | `Analytics.tsx` / `Billing.tsx` | `INK`, `SINGLE`, `tooltipStyle` copiados verbatim entre os dois arquivos | Baixa | Extraído para `src/shared/constants/chartPalette.ts`, importado nos dois | ✅ Corrigido |
| DQA-07 | Toda a navegação principal em telas < 1024px | `src/components/layout/Sidebar.tsx` | `<aside>` fixa `w-64` sempre em fluxo normal, sem colapso/toggle — espreme ou estoura o conteúdo em qualquer viewport estreito, incluindo o app Android via Capacitor | **Crítica** | Sidebar off-canvas (`fixed` + `-translate-x-full`) abaixo de `lg`, com botão hambúrguer no `AppTopbar`, backdrop, fecha em Escape/clique-fora/seleção de item | ✅ Corrigido |
| DQA-08 | Global | `src/styles/globals.css` + `src/App.tsx` | Nenhum tratamento de `prefers-reduced-motion` apesar de 8 keyframes customizados + `transition-all` global e várias animações Framer Motion | Alta (WCAG 2.3.3) | `@media (prefers-reduced-motion: reduce)` pro CSS puro; `<MotionConfig reducedMotion="user">` no provider raiz cobre o Framer Motion também (2º lote) | ✅ Corrigido |
| DQA-09 | Global | `src/styles/globals.css` | Zero uso de `:focus-visible` em toda a `src/` fora de 2-3 componentes pontuais | Alta (WCAG 2.4.7) | Baseline `:focus-visible { outline: 2px solid var(--brand) }` adicionada como rede de segurança, sem sobrepor os `focus-visible:ring-*` já existentes | ✅ Corrigido (baseline). Auditoria completa por componente fica para Tier 2 |
| DQA-10 | 3 tokens de cor de marca | `src/styles/globals.css` (`@theme`) | `--brand`, `--color-atlas-orange`, `--brand-primary` são 3 nomes para `#FF5618`; mesmo padrão em `--warn`/`--color-atlas-yellow` | Média | **Parcial**: os 3 tokens comprovadamente mortos (`--bg-base`, `--bg-card`, `--info-token`, zero uso em `src/`) foram removidos. Os tokens de marca duplicados-mas-vivos **não** foram tocados — ver nota na seção "Segundo lote" acima: 56 arquivos dependem do padrão estático `atlas-orange`/`totaltrack-blue` coexistindo de propósito com o token dinâmico `--brand`, então virar alias quebraria o troca-marca | 🟡 Parcialmente corrigido |
| DQA-11 | Radius entre primitivos | `Button`/`Card`/`Dialog`/`Skeleton`/`EmptyState`/`Badge` | 5 valores de radius diferentes sem escala compartilhada além de `rounded-card` (só usado por `Card`); `Button` tinha uma inconsistência interna real (`sm`/`lg` sobrescreviam o radius do `default`/`icon`) | Baixa | `Button` não sobrescreve mais radius por tamanho; `Dialog` e o container/badge de `EmptyState` convergidos para `rounded-card`/`rounded-card-lg` (mesmos tokens do `Card`). `Skeleton`/`Badge`/`Drawer` mantidos como estão — radius neles é intencional (filler genérico, pill, painel edge-to-edge) | ✅ Corrigido |
| DQA-12 | `ui/Dialog.tsx`, `ui/Drawer.tsx` | Modais/drawers hand-rolled em `ContactForm`, `CompanyForm`, `LeadDetailDrawer`, `GoogleLoginModal` | Dois primitivos de overlay compartilhados existem mas nunca são usados; cada feature reimplementa seu próprio modal com blur/opacidade/animação levemente diferentes | Média | `ContactForm`/`CompanyForm` migrados pra `ui/Dialog` (estendido com `maxWidth`/`footer`/`preventClose`), verificado ponta a ponta contra o servidor real. `LeadDetailDrawer`/`GoogleLoginModal` **não** tocados — fora do escopo desta rodada | 🟡 Parcialmente corrigido |
| DQA-13 | Contatos, Empresas | `ContactList.tsx` / `CompanyList.tsx` | Cada um implementa `<table>`, paginação e estados vazio/erro de forma independente, sem `DataTable` compartilhado | Média | `Pagination` compartilhado extraído e usado nos dois; `ContactList` convergido pra `EmptyState` (igual `CompanyList`). Unificação completa das duas tabelas num `DataTable<T>` genérico **não** foi feita — `CompanyList` tem seleção em massa/grid/popover que tornariam isso um projeto maior, não uma limpeza pontual | 🟡 Parcialmente corrigido |
| DQA-14 | Pipeline CRM | `src/components/CrmBoard.tsx` | Botões de ação usam `bg-blue-600`/`hover:bg-blue-500` (paleta Tailwind crua) em vez de `ui/Button`, misturado com classes token-based no resto do arquivo | Baixa | Os 2 botões do header ("Sincronizar Bitrix24", "Exportar CSV") migrados para `ui/Button` `variant="secondary"`. O spinner de loading (`border-blue-500`) foi deixado como está — fora do escopo "botões" desta correção | ✅ Corrigido |
| DQA-15 | Configurações | `src/features/settings/components/Settings.tsx` | Página é um stub ("Em desenvolvimento...") sem nenhuma configuração real por trás do item de menu | Média | Implementado com escopo mínimo: Aparência (tema + marca) e Perfil (somente leitura), reaproveitando contexts já existentes | ✅ Corrigido |
| DQA-16 | Toda a `src/` | Ausência de `eslint-plugin-jsx-a11y` e de testes de acessibilidade automatizados | Sem enforcement de lint para regras JSX de acessibilidade; sem `axe-core`/`jest-axe`/Playwright visual snapshot | Alta (processo) | `eslint-plugin-jsx-a11y` instalado (achou 199 violações reais — 47 corrigidas/desativadas por falso-positivo, 152 rebaixadas a warning documentado); `@axe-core/playwright` + regressão visual novos em `tests/e2e/` (achou e corrigiu 2 bugs reais de acessibilidade — ver Fase B) | ✅ Corrigido |
| DQA-17 | Toda navegação em `/app/*` | `src/App.tsx`, `MainLayout.tsx` | Módulos alternados por `useState<TabType>`, não por URL — sem deep-link, F5 numa tela específica sempre caía no dashboard | Média (arquitetura) | Migrado pra `<Routes>` aninhadas reais; deep-link, F5 e botão Voltar do navegador verificados via Playwright | ✅ Corrigido |
| DQA-18 | 7 primitivos de UI (`Button`, `Card`, `Badge`, `Dialog`, `Drawer`, `EmptyState`, `Timeline`) | `src/components/ui/*` | Hardcodavam `atlas-orange` fixo — usuário com a marca TotalTrac ativa via laranja da AtlasGR vazando pelos componentes de design system usados em todo o app | Alta (bug de marca) | Migrados pros tokens dinâmicos `--brand`/`--brand-2`; confirmado visual no-op pra AtlasGR. ~38 arquivos de feature fora dos primitivos continuam com o mesmo problema — ver Backlog | 🟡 Parcialmente corrigido |
| DQA-19 | Sidebar (item ativo), atalho "Nova varredura" do dashboard | `Sidebar.tsx`, `SinglePageDashboard.tsx` | Texto branco sobre `bg-brand` puro dava 3.18:1 (AtlasGR) / 3.89:1 (TotalTrac) de contraste — abaixo do mínimo 4.5:1 do WCAG AA. Achado pelo `axe-core` novo desta rodada, não pela auditoria original | **Séria (WCAG AA)** | Token `--color-brand-active` novo (`color-mix` escurecendo 25%, calculado via fórmula de luminância do WCAG) — passa a valer ≥4.5:1 nas duas marcas | ✅ Corrigido |
| DQA-20 | Pipeline CRM (Kanban) | `src/components/CrmBoard.tsx` | Container com scroll horizontal sem `tabIndex` — usuário de teclado não conseguia rolar as colunas do funil sem mouse/trackpad. Achado pelo `axe-core` (`scrollable-region-focusable`) | Séria (WCAG 2.1.1) | `tabIndex={0}` + `aria-label` adicionados | ✅ Corrigido |

## Fase 6/17 — Responsividade e Mobile (o que foi corrigido)

**Antes (DQA-07):** `Sidebar` era um `<aside className="w-64 h-full ...">` sempre em fluxo normal.
Em qualquer viewport mais estreito que sidebar+conteúdo, ou o conteúdo ficava espremido a ponto de
ser inutilizável, ou a página forçava scroll horizontal — sem hambúrguer, sem colapso, sem detecção
de viewport em lugar nenhum do código (`useMediaQuery`/`window.innerWidth` não existiam no repo). Isso
era particularmente grave porque o mesmo bundle React é empacotado como app Android nativo via
Capacitor (`capacitor.config.ts`, `android/`) — ou seja, a tela de navegação principal do app mobile
estava, na prática, quebrada.

**Depois:**
- `Sidebar.tsx` — `<aside>` agora é `fixed inset-y-0 left-0 z-40 w-64 ... lg:static lg:translate-x-0`,
  com `-translate-x-full`/`translate-x-0` controlado por um prop `mobileOpen`. Em `lg` (1024px) e
  acima, volta ao comportamento estático original (sem prejuízo ao desktop).
- `AppTopbar.tsx` — novo botão hambúrguer (ícone `Menu` do lucide-react), visível só `lg:hidden`, com
  `aria-label="Abrir menu de navegação"`.
- `MainLayout.tsx` — dono do estado `mobileNavOpen`; renderiza um backdrop (`fixed inset-0 bg-ink/50
  lg:hidden`) que fecha ao clicar; fecha com `Escape` (mesmo padrão já usado pelo `Drawer`/`Dialog`
  compartilhados); fecha automaticamente ao trocar de módulo (seleção de item de menu).
- Breakpoint escolhido: `lg` (1024px), não `md`, porque os rótulos de navegação são strings longas em
  português distribuídas em 3 seções — `md` ainda deixaria pouco espaço útil de conteúdo ao lado da
  sidebar aberta.

**Não corrigido nesta rodada (permanece no Tier 2):** o Kanban do Pipeline CRM
(`src/components/CrmBoard.tsx`) continua com `overflow-x-auto` sem nenhum breakpoint — é
efetivamente desktop-only independentemente do tamanho de tela.

## Fase 9 — Acessibilidade (o que foi corrigido)

- Baseline global `:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px }` em
  `globals.css` — cobre qualquer elemento interativo que hoje não define seu próprio anel de foco.
  Regras mais específicas (`focus-visible:ring-atlas-orange` etc., já presentes em `Button`/
  `Dialog`/`Drawer`) continuam vencendo por especificidade CSS, então não há regressão visual nos
  componentes que já tratavam foco.
- `@media (prefers-reduced-motion: reduce)` reduzindo a duração de toda `animation`/`transition` CSS
  a `0.01ms` — cobre os 8 keyframes customizados (`float`, `pulse-glow`, `gradient-xy`,
  `gradient-flow`, `spin-slow`, `shimmer`, `fade-in-up`, `toast-in`) e utilitários como
  `.glass-card`/`.hover-lift`/`transition-all`.
- **Gap documentado, não corrigido:** Framer Motion (usado em `MainLayout`, `Drawer`, `EmptyState`,
  dashboards) só respeita `prefers-reduced-motion` se o app envolver a árvore em
  `<MotionConfig reducedMotion="user">` — isso não está configurado hoje. É uma mudança pequena e de
  baixo risco (root provider), mas foi deixada para o Tier 2 por tocar o provider raiz da aplicação
  inteira, fora do escopo "correção pontual e isolada" desta rodada.
- **Gap documentado, não corrigido:** cobertura de `aria-label`/`aria-describedby`/`role`/`tabIndex`
  por componente segue esparsa (16 arquivos com `aria-label`, 1 único `tabIndex` em toda a `src/`,
  zero `aria-describedby` mesmo nos 2 formulários com validação via `react-hook-form`). Corrigir isso
  de forma sistemática exige tocar dezenas de arquivos de feature — fica para Tier 2, idealmente
  precedido pela instalação de `eslint-plugin-jsx-a11y` (DQA-16) para não regredir depois.

## Verificação

- `npm run lint` → **0 erros**, 2 warnings pré-existentes e não relacionados
  (`enrichment.service.ts`, `@typescript-eslint/no-explicit-any`).
- `npx tsc -b --noEmit` → **0 erros** após a relocação de `TabType` e remoção dos 3 arquivos mortos
  (esse era o passo com maior risco de pegar um import esquecido).
- Não há testes de unidade/componente cobrindo `Analytics.tsx`/`Billing.tsx` (confirmado: a suíte de
  testes do repo é 100% backend — services, RLS, RBAC — não há teste de componente React em todo o
  projeto), então não havia suíte a rodar para a mudança do DQA-06.
- **Verificação visual no navegador não foi possível nesta sessão** (pane de navegador interativo
  indisponível no ambiente de execução). As mudanças de CSS/JSX foram revisadas linha a linha via
  diff, mas os comportamentos a seguir **ainda precisam de confirmação visual manual** antes de
  considerar este Tier 1 definitivamente fechado:
  - Sidebar off-canvas abrindo/fechando corretamente em ~390px de largura, com o hambúrguer e o
    backdrop funcionando, e retorno ao layout estático em `lg`+.
  - `Button` `outline`/`secondary`/`ghost`/`link` realmente renderizando fundo/texto visíveis agora.
  - `Dialog`/`Skeleton` em dark mode.
  - Gráficos de Analytics/Billing com as mesmas cores de antes (mudança deveria ser um no-op visual).

**Segundo lote (radius/CrmBoard/MotionConfig/tokens mortos):** `npm run lint` e
`npx tsc -b --noEmit` seguem em **0 erros** depois dessas mudanças também. O pane de navegador
continuou indisponível nesta sessão (tentativa repetida, mesmo resultado) — os itens abaixo também
ficam pendentes de confirmação visual manual:
  - `Button`/`Dialog`/`EmptyState` com o radius convergido (sem “quebra” visual entre `sm`/`lg`/
    `default` do Button, e sem o Dialog/EmptyState parecerem fora do padrão do Card).
  - Botões "Sincronizar Bitrix24"/"Exportar CSV" no Pipeline CRM com a aparência `secondary` em vez
    de azul cru.
  - `prefers-reduced-motion` ativado no SO/navegador realmente suprimindo as animações do
    framer-motion (fade-in dos cards do dashboard, slide do Drawer etc.), não só as CSS puras.

## Quarto lote — migração dos arquivos de feature restantes + paletteIntent modernizado

Dois itens do backlog acima foram fechados numa rodada seguinte:

- **Migração dos ~44 arquivos de feature restantes** (item 1 antigo) para `--brand`/`--brand-2`,
  seguindo a mesma regra da Fase C: só troca quem hardcodava a cor sem nenhum condicional de marca;
  arquivos que já faziam `isAtlas ? atlas-orange : totaltrack-blue` (ou usavam `useBrandAccent()`)
  foram deixados como estão — são um padrão diferente e válido, não um bug. Ficaram de fora por
  decisão explícita, não por engano: as telas de pré-seleção de marca (`WelcomeScreen.tsx`,
  `SelectionScreen.tsx`, que mostram as duas marcas lado a lado antes do usuário escolher — não faz
  sentido "reagir à marca ativa" ali) e um uso isolado de `totaltrack-blue` fora do escopo de tokens
  desta migração (`LiveStatsWidget.tsx`).
  **Achado relevante do processo**: essa migração foi delegada a um agente, e a verificação
  encontrou 2 arquivos (`IntelligenceHub.tsx`, `FloatingChatbook.tsx`) onde o agente, além da troca
  de cor pedida, também **adicionou funcionalidade não solicitada** (um switcher de 10 abas internas
  no Hub de IA; um modo "Gerar com IA" completo dentro do Chatbook, consumindo um hook
  `useAiPlaybookGenerator` que já existia no repo mas nunca tinha sido ligado a nada). Ambas as
  adições foram revertidas cirurgicamente nesta sessão (mantendo só a troca de cor legítima em cada
  arquivo), verificadas de novo com lint/typecheck/e2e, e o restante dos ~40 arquivos foi auditado
  linha a linha pra confirmar que não havia mais nada parecido. Fica registrado porque é exatamente o
  tipo de coisa que checagem automática (lint/tsc) não pega — só revisão de diff pega.
- **`src/lib/paletteIntent.ts` modernizado** (item 4 antigo): o singleton mutável
  (`setPendingPaletteIntent`/`consumePendingPaletteIntent`) foi substituído por `location.state` do
  `react-router-dom`, agora que rotas reais existem (Fase D). `CommandPalette.tsx` passa a intenção
  direto no `navigate()`; os 3 consumidores (`ContactList`, `CompanyList`, `ActivityList`) leem
  `useLocation().state` e limpam a entrada de histórico (`navigate(path, { replace: true, state:
  null })`) logo depois de consumir — sem isso, um F5 na tela reaplicaria a mesma busca/reabriria o
  mesmo formulário indefinidamente, já que `location.state` (ao contrário do singleton antigo)
  sobrevive a reload. Verificado com um spec novo, `tests/e2e/command-palette.spec.ts`.

## Backlog Tier 2 (o que ainda falta)

Depois de 4 lotes, o backlog original do Tier 1 está praticamente todo endereçado. O que
genuinamente resta — nenhum item é mais uma correção pontual de baixo esforço; todos exigem decisão
de arquitetura/produto ou um projeto à parte:

1. **`DataTable<T>` genérico unificando `ContactList`/`CompanyList`** — só faz sentido depois de uma
   decisão de produto sobre se a seleção em massa/alternância grid-tabela do CompanyList devem virar
   parte da API genérica ou ficar como uma composição por cima dela.
2. **As 152 violações `warn` do `jsx-a11y`** (`label-has-associated-control`,
   `click-events-have-key-events`, `no-static-element-interactions` — ver Fase A) — exigem revisão
   caso a caso de cada `<div onClick>`/label sem associação, não uma correção em lote.
3. **Rotas aninhadas pros 10 painéis internos do `IntelligenceHub`** (`IntelligenceTab`, estado local
   próprio) — não migrado na Fase D por não ter necessidade de deep-link comprovada; reavaliar se
   isso virar um pedido real.
4. **CI**: os specs novos (`accessibility.spec.ts`, `visual.spec.ts`, `contact-company-forms.spec.ts`,
   `command-palette.spec.ts`)
   já rodam automaticamente via `npm run test:e2e` (nenhuma mudança de pipeline necessária), mas a
   suíte completa agora se aproxima do limite de 20 requisições/15min do `authLimiter` de
   login/cadastro quando rodada em série numa janela curta (ver "Verificação da rodada completa"
   acima) — vale considerar um `AUTH_RATE_LIMIT_MAX` mais alto especificamente pro ambiente de teste
   (nunca em produção) se a suíte continuar crescendo.
