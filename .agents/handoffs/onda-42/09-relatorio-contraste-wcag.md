# Onda 42 · Auditoria caso a caso de contraste WCAG AA (DEC-17, opção A)

Sessão dedicada solicitada pelo dossiê CPI (DEC-17) para tratar os ~170 casos deixados de fora da
troca mecânica de hex→token da onda anterior: hex crus sem token correspondente exato e usos de
`text-success/danger/info/warning` sem a variante `-active` (padrão DQA-19, já resolvido para
`--color-brand-active`).

## Ferramenta usada

Script utilitário reutilizável em Python (`contrast.py`, calculadora de razão de contraste WCAG a
partir de hex fg/bg, mais `color_mix_pct`/`alpha_over` para reproduzir `color-mix()`/opacidade do
CSS) — usado para medir *todas* as decisões abaixo antes de aplicar qualquer mudança, nunca por
estimativa visual. Não foi commitado (ferramenta de investigação, ver `visual-qa/SKILL.md` sobre
harness descartável não virar arquivo do repo).

## Achado prévio importante: a premissa #3 da tarefa já estava resolvida

A tarefa pedia para "confirmar se a variante `-active` já existe" e, caso não existisse, criá-la em
`globals.css`. **Ela já existe** — `--success-active`, `--warning-active`, `--danger-active`,
`--info-active` e `--ok-active` já estavam definidas em `src/styles/globals.css` (`:root`/`.dark`),
seguindo exatamente o padrão de `--color-brand-active` (DQA-19): valor escurecido via
`color-mix(..., black)` no tema claro, e igual ao token cru no tema escuro (onde o cru já passa
4.5:1). Confirmado por medição:

| Token | Cru vs. `--surface` claro | `-active` vs. `--surface` claro | Cru vs. `--surface` escuro |
|---|---|---|---|
| success | 2.54:1 (falha) | 6.99:1 (passa) | 7.32:1 (passa) |
| warning | 2.15:1 (falha) | 6.18:1 (passa) | 8.65:1 (passa) |
| danger | 3.76:1 (falha) | 7.53:1 (passa) | 4.93:1 (passa) |
| info | 3.68:1 (falha) | 7.35:1 (passa) | 5.05:1 (passa) |

Ou seja: **nenhum token novo precisou ser criado em `globals.css`** (zero linhas alteradas nesse
arquivo) — o trabalho real foi 100% de aplicação caso a caso do padrão já existente (que uma parte
do código já usava corretamente — `Badge.tsx`, `Calendar.tsx`, `WebhookMonitor.tsx`, `Billing.tsx`
— e outra parte, auditada agora, não).

## Parte 1 — `text-success/danger/info/warning` sem `-active`

**Busca**: `text-success|text-danger|text-info|text-warning` em `src/`, filtrando ocorrências que já
tinham a variante `-active`/`dark:` (essas já estavam corretas) e comentários.

- **99 ocorrências corrigidas**, em 34 arquivos — todas trocadas para o padrão já estabelecido
  `text-{cor}-active dark:text-{cor}` (claro: tom escurecido, AA; escuro: cor crua, já AA).
  Verificado por medição: o padrão passa 5.6–7.5:1 no claro e 4.6–9.2:1 no escuro para as 4 cores,
  contra `--bg`/`--surface`/`--surface-2`, inclusive nos casos de badge com fundo tingido
  (`bg-X/10`, `bg-X/15`) e ícone isolado (limiar não-textual 3:1 também coberto).
- **0 ocorrências restantes** no código (grep final confere: as 2 únicas linhas remanescentes com
  `text-success|danger|info|warning` sem `-active` são comentários explicativos em `Badge.tsx` e
  `CandidateCard.tsx`, não código).
- **Já estava OK, documentado sem mudança**: `CompanyList.tsx` (linhas 331/547) usa
  `text-emerald-700 dark:text-success` — um par diferente do convencionado (`-active`/`dark:`), mas
  já medido e comentado no próprio código (`emerald-700` = 4.99:1 sobre a superfície clara). Deixado
  como está — já tem comentário explicando a escolha, não duplica nem quebra nada.

## Parte 2 — hex crus sem token exato

**Busca**: `text-\[#|bg-\[#|border-\[#` (mais `from-[#.../to-[#...]` de gradientes, achados durante a
auditoria) em `src/`.

### Corrigidos (54 ocorrências de hex tocadas)

1. **Duplicatas do par sucesso/perigo/atenção** (a maior parte do lote) — `#0ca30c` (verde
   "bom/saudável"), `#d95926`/`#199e70` (par "acima da meta"/"ótimo" em Analytics) e `#b8860b`
   (âmbar "atenção") eram, em 9 arquivos (`Analytics.tsx`, `DashboardExtensions.tsx`,
   `WinLossAnalysis.tsx`, `KpiTile.tsx`, `ForecastRangeCard.tsx`, `ExecutiveOverviewTab.tsx`,
   `LeadingIndicatorsTab.tsx`, `CrmQualityTab.tsx`, `AlertsPanel.tsx`), reimplementações ad-hoc do
   mesmo conceito semântico já tokenizado (`--color-success`/`--color-warning`), na maioria das
   vezes literalmente ao lado de `text-critical` (que já usa token) no mesmo ternário/objeto de
   estilo — ex.: `tone === 'good' ? 'text-[#0ca30c]' : tone === 'critical' ? 'text-critical' : ...`.
   Medido: essas cores cruas falham tanto 4.5:1 quanto 3:1 no tema claro (3.0–3.4:1) e só passam no
   escuro (5.1–6.1:1) — o mesmo perfil de falha do DQA-19. Trocadas para
   `text-success-active dark:text-success` / `text-warning-active dark:text-warning` (texto) e
   `bg-success-active`/`bg-warning-active` (preenchimentos decorativos de barra/sparkline, medidos a
   70% de opacidade: 3.36–3.56:1 no claro, acima do mínimo 3:1 pra elemento gráfico não-textual).
2. **`hover:bg-[#E04B12]`** (7 ocorrências, 6 arquivos de ferramentas de prospecção) — hover de
   botão `bg-brand-active` hardcoded em laranja fixo, **vazando a cor da AtlasGR pra Total Trac**
   (mesmo padrão de bug que a Constituição proíbe na seção 7.7). Trocado para `hover:brightness-110`
   — já é o padrão usado nos botões irmãos dos mesmos arquivos (`bg-brand-active
   hover:brightness-110`, ex. `LinkedInTool.tsx:318`), então a correção reaproveita convenção já
   existente, não inventa nada.
3. **`text-[#fff]`** (`Sidebar.tsx`) → `text-white` — trivial, `#fff` não é hex-sem-token, é
   `white` puro do Tailwind; já estava sobre `bg-brand-active` (correto).
4. **`border-[#FFC500]/30`** (`MarketIntelligenceApp.tsx`) → `border-warn/30` — troca mecânica de
   correspondência exata (`--warn: #FFC500`), ao lado de `bg-warn/10` que já usava o token na mesma
   linha.
5. **`text-[#C43E0E]`** (link/hover em `MarketIntelligenceCompanies.tsx`, 2 ocorrências) — passa no
   claro (4.93–5.19:1) mas falha no escuro (3.34–3.80:1) contra `--surface` (o container não tem
   fundo próprio, herda o tema). Adicionado `dark:text-atlas-orange`/`dark:hover:text-atlas-orange`
   (token já existente, passa 5.83–6.2:1 no escuro) — sem inventar token novo.
6. **Bug relacionado, achado durante a auditoria: `info-base` é um token inexistente.** Grep em
   `text-info`/`bg-info` capturou `text-info-base`/`bg-info-base`/`border-info-base` em
   `CrmOverview.tsx`, `VisualOrgChart.tsx` e `ProspectingHub.tsx` — `--color-info-base` **nunca foi
   definido** em `globals.css` (mesmo padrão do bug real já documentado em `design-system/SKILL.md`,
   "HUNTER"/`neon-purple`: classe Tailwind inexistente renderiza sem cor nenhuma, sem erro no
   console). O badge "Radar de IA" do Pipeline (`CrmOverview.tsx`) estava sem nenhum destaque visual
   — ícone/badge/texto todos sem cor. Corrigido para `info`/`info-active` (token real) nos 3
   arquivos; a mesma correção foi aproveitada para alinhar as duas outras abas da barra de tabs do
   Prospecting (`ProspectingHub.tsx:465,471`, que usava `bg-info` cru com texto branco — 3.68:1,
   abaixo de 4.5:1) para `bg-info-active`, igualando ao terceiro botão da mesma barra
   (`bg-brand-active`, já correto).

### Já estava OK, documentado sem mudança (nenhuma alteração)

- **`LdrAccountIntelligence.tsx:234,256`** — `text-[#C43E0E]` dentro do card "Account Score", que é
  deliberadamente construído com paleta clara fixa (`bg-orange-50`, `border-orange-200`,
  `text-orange-700/800/900`, sem nenhuma variante `dark:`). Medido contra o fundo real
  (`bg-orange-50` = `#fff7ed`, não contra `--surface`): 4.89–5.19:1, passa AA. Card não reage a
  tema por design (mesmo padrão de destaque fixo usado em outros lugares do produto).
- **`SwarmDashboard.tsx`** (paleta categórica de 5 agentes — sdr/bdr/closer/crm/ops, ícones
  `text-[#008cb8] dark:text-[#00C2FF]` etc.) — paleta de identidade por categoria, não semântica
  (nenhuma sobreposição com sucesso/perigo/aviso/info). Medido como uso não-textual (ícone, limiar
  3:1): 3.14–6.41:1 no claro, 4.69–14.83:1 no escuro — todos passam. Fundos/bordas tingidos (`/10`,
  `/30`) usam `text-ink` para o texto, não a cor da categoria — sem risco de contraste. Não
  tokenizado: é uma decisão de produto (criar 5 tokens categóricos novos), fora do escopo desta
  auditoria de contraste (ver `design-system/SKILL.md`, "cor de interação sem significado externo").
- **`RobustScriptGenerator.tsx`/`AutomationGuide.tsx`** (`#0D1117`/`#30363D`/`#010409`/`#050811`) —
  skin fixo de terminal/editor de código (convenção GitHub-dark), com texto já claro
  (`text-sky-300`/`text-amber-200`) sobre fundo quase preto — contraste alto por construção,
  deliberadamente não reativo a tema (um bloco de código continua "modo escuro" mesmo com o app em
  claro, convenção universal de editores).
- **`ActiveCallView.tsx:24`** (`bg-[#0b0f19] text-white`) — tela de chamada de roleplay, "imersiva"
  de propósito (como uma tela de chamada real), branco sobre quase-preto, contraste altíssimo; já
  reage à marca ativa via gradiente radial (`from-sky-500`/`from-orange-500` conforme
  `activeBrand`), só a base é fixa.
- **`SelectionScreen.tsx:14`** (`bg-[#030305] text-white`) — tela pré-seleção de marca (mesma
  categoria do Piloto 001/`WelcomeScreen.tsx`, exceção justificada pela seção 5 da Constituição:
  tela antes da escolha de marca, precisa mostrar as duas marcas com peso visual igual). Branco
  sobre quase-preto, contraste altíssimo.

## O que ficou fora do escopo desta rodada (achados relacionados, não corrigidos)

Estes casos usam padrões parecidos mas **não** são literalmente `text-success/danger/info/warning`
nem hex sem correspondência — documentados aqui para não serem "redescobertos", mas deixados de
fora porque exigem uma decisão de token nova, ou porque não bateram na busca pedida:

1. **`text-warn`/`border-warn` cru** (`PropostasList.tsx`, `PropostaDetail.tsx`, `ApolloTool.tsx`,
   3 ocorrências) — `--warn: #FFC500` é um token **separado** de `--color-warning`, sem variante
   `-active` própria. Medido: **1.51–1.59:1** contra superfície clara — falha grave, pior que os
   casos corrigidos nesta rodada. Não corrigido porque criar `--warn-active` é uma decisão de token
   nova fora do pedido explícito (que listava só `text-warning`, não `text-warn`).
2. **`bg-danger`/`bg-info` sólido + `text-white`** (não é `text-danger`, é `text-white` sobre fundo
   semântico sólido) — `DiscoveryFilterPanel.tsx:384` (pill de cargo selecionado,
   `bg-danger border-danger text-white`, 3.76:1, abaixo de 4.5:1 pra texto pequeno) e
   `SwarmDashboard.tsx:628` (botão de encerrar chamada, `bg-danger/90 hover:bg-danger text-white`).
   Mesma família de bug do DQA-19 original (branco sobre cor sólida), mas fora da busca pedida
   (`text-danger` etc.), e exigiria decidir entre `bg-danger-active` (ainda não usado como
   background sólido em lugar nenhum do código) ou reduzir o texto. Sugiro tarefa dedicada.
3. **`bg-amber-500/15 text-amber-400 border-amber-500/30`** (`IntelligenceHub.tsx:243`, badge "Sem
   trechos") — cor Tailwind padrão (não é `--color-warning`), não bateu em nenhuma das buscas
   pedidas. Não medido nem corrigido.

## Verificação executada

- **`npx tsc --noEmit`** — 0 erros.
- **`npm run lint`** — 0 erros, 154 warnings (nenhum novo introduzido pelas mudanças desta rodada;
  nenhum dos 49 arquivos tocados aparece na lista de warnings do lint — confirmado por diff).
- **`npm run build`** — build de produção completo com sucesso (frontend Vite + bundle do servidor).
- **`npx playwright test tests/e2e/accessibility.spec.ts`** — **não pôde ser executado neste
  ambiente**: `DATABASE_URL` de `.env.test.example` aponta pra Postgres em `localhost:5434`
  (docker-compose do projeto) e Meilisearch em `localhost:7700`; neste sandbox só existe um Postgres
  nativo em `5432` (credenciais diferentes das esperadas) e nenhum Meilisearch — o `webServer` do
  Playwright (servidor Express real, `better-auth`, signup real) não sobe. Mesmo bloqueio já
  registrado no Piloto 001/Piloto 002 (`.claude/PILOTS.md`): sem Docker/Postgres/Redis compatíveis
  com o `.env.test`, a suíte oficial de e2e não roda neste ambiente. **Não declarado como
  "passou"** — ver protocolo de `visual-qa/SKILL.md`.
- **Validação alternativa real, no lugar do axe-core**: todas as ~153 mudanças de cor desta rodada
  foram cada uma delas medida contra sua superfície real de fundo com a calculadora de contraste
  (script descartável, não commitado) antes de ser aplicada — não é equivalente a rodar o axe-core
  contra o DOM renderizado (não captura empilhamento real de `z-index`/opacidade sobreposta,
  herança de cor via `currentColor`, ou erros de digitação em classe Tailwind), mas cobre a métrica
  específica desta tarefa (razão de contraste, WCAG 1.4.3/1.4.11) para cada combinação fg/bg
  identificada estaticamente no código.
- **Duas marcas**: as mudanças usam apenas tokens dinâmicos (`--color-success` etc., que não variam
  por marca) ou tokens de marca já existentes (`bg-brand-active`, `text-atlas-orange`,
  `hover:brightness-110` sobre `bg-brand-active`) — nenhuma mudança introduz dependência de marca
  nova; o único caso que tocou marca (`hover:bg-[#E04B12]` → `hover:brightness-110`) foi justamente
  para **remover** um vazamento de laranja fixo que quebrava a Total Trac.

## Resumo numérico

| Categoria | Quantidade |
|---|---|
| `text-success/danger/info/warning` sem `-active` — corrigidos | 99 ocorrências, 34 arquivos |
| `text-success/danger/info/warning` sem `-active` — já OK, documentado | 2 ocorrências (`CompanyList.tsx`) |
| `text-success/danger/info/warning` sem `-active` — pendente | 0 |
| Hex cru sem token exato — corrigido (token aplicado ou variante de tema adicionada) | 54 ocorrências, ~20 arquivos |
| Hex cru sem token exato — já OK, documentado (passa contraste real, sem mudança) | 21 ocorrências, 6 arquivos |
| Hex cru sem token exato — pendente/ambíguo | 0 |
| Tokens novos criados em `globals.css` | 0 (`-active` de success/warning/danger/info já existiam) |
| Bug relacionado achado e corrigido (token `info-base` inexistente) | 3 arquivos |
| Achados relacionados, fora do escopo pedido, não corrigidos (listados acima) | 3 casos — candidatos a tarefa separada |

Nenhum caso do escopo pedido (itens 1–3 do prompt: `text-success/danger/info/warning` sem
`-active`, e hex sem token exato) ficou pendente por ambiguidade — todos os 55+ hex e 99 ocorrências
semânticas foram corrigidos ou documentados com a razão de contraste medida. Os 3 itens "fora do
escopo" são achados adjacentes que não bateram na busca literal pedida (`text-warn` ≠ `text-warning`;
`bg-danger text-white` ≠ `text-danger`) e foram deixados para não expandir o escopo sem pedido
explícito, mas documentados para não serem perdidos.
