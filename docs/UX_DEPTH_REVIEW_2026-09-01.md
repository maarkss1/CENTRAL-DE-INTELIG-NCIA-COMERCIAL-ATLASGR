# Revisão UX Depth — Central de Inteligência Comercial

Data: 01/09/2026

## Objetivo

Evoluir a Central de uma interface funcional porém excessivamente plana para um **Revenue Command Center com profundidade, exploração de dados, microinterações, áudio semântico e 3D informativo**, preservando regras de negócio, RBAC, contratos de dados, acessibilidade e performance mobile/Capacitor.

A direção continua sendo **Do Sinal à Ação**. Profundidade não significa ruído visual: cada camada precisa indicar hierarquia, estado, foco ou relação entre dados.

## Diagnóstico

### O que já existia e deve ser preservado

- React 19, Tailwind CSS 4 e tokens multi-brand AtlasGR/Total Trac.
- Framer Motion com `prefers-reduced-motion`.
- Recharts e ECharts para visualização.
- Three.js + React Three Fiber + Drei já instalados.
- `Card`, `Button`, `Badge`, `Dialog`, `Drawer`, `Toaster` e demais primitivos compartilhados.
- Dashboard e Comercial Inteligente já conectados a dados reais e com drill-down.
- Navegação orientada pela jornada comercial e por papel.

### Problemas encontrados

1. **Planicidade visual**: grande parte das telas depende de `border + bg-surface + rounded-xl`, com pouca separação entre plano primário, secundário e controles.
2. **Gráficos subutilizados**: o dashboard recebia `created`, `won` e `lost`, mas mostrava apenas `won`.
3. **Microinteração tímida**: motion concentrado em entrada de tela; pouco feedback local em cards, filtros, navegação e exploração.
4. **Áudio não semântico**: havia um bip global para quase todo clique e, paralelamente, um `soundEffects.ts` pouco integrado.
5. **3D isolado**: Three.js existia em onboarding/gamificação, mas não comunicava informação operacional do dashboard.
6. **Command Center sem presença espacial**: o Comercial Inteligente tinha muita capacidade funcional, mas sua composição visual ainda era cabeçalho + filtros + abas + cards.
7. **Inconsistência de profundidade**: telas criavam sombras e superfícies diretamente em classes locais, sem um vocabulário suficientemente rico nos primitivos.

## Linguagem visual revisada

### Planos

- **Plano 0 — ambiente**: fundo neutro da aplicação. Sem partículas, grid militar ou decoração contínua.
- **Plano 1 — superfície de trabalho**: tabelas, listas e conteúdo principal.
- **Plano 2 — instrumento elevado**: KPI, forecast, command bar, filtros contextuais e widgets importantes.
- **Plano 3 — foco/ação**: drawer, modal, drill-down, menu aberto, controle ativo.

### Profundidade

Profundidade deve combinar no máximo três sinais:

- sombra externa curta ou longa conforme hierarquia;
- hairline/inset de luz no topo;
- deslocamento de 1–4 px no hover/active.

Evitar empilhar glow + blur + gradiente + escala em todo card.

### Motion

- entrada de página: continuidade já existente;
- hover: 120–220 ms;
- cards exploráveis: elevação curta + reforço de borda;
- ações críticas: sem movimento ornamental;
- `prefers-reduced-motion`: obrigatório.

### Som

Som passa a representar significado, não clique:

- `navigate`: mudança de contexto;
- `focus`: abrir exploração/comando;
- `confirm`: alternância ou confirmação explícita;
- `success`: conclusão positiva;
- `warning`: atenção;
- `error`: falha.

O usuário possui controle visível de ligar/desligar no topbar. A preferência é persistida localmente.

### 3D

3D é permitido somente quando representa informação que pode ser explicada em texto equivalente.

Primeiro uso operacional: **Signal Core 3D** no dashboard, alimentado por conversão, atividades pendentes e fechamentos do mês. O Canvas é lazy-loaded e os valores exatos permanecem visíveis em HTML.

## Onda implementada nesta branch

- [x] Remover bip global de todo clique em `main.tsx`.
- [x] Consolidar áudio no `soundEffects.ts`.
- [x] Integrar feedback sonoro a toasts.
- [x] Adicionar controle de som no `AppTopbar`.
- [x] Dar profundidade e microinterações ao topbar.
- [x] Dar profundidade e estados espaciais à Sidebar sem alterar RBAC.
- [x] Ampliar `Card` com variantes `elevated` e `interactive`.
- [x] Transformar `GlowChart` em gráfico multissérie explorável (`created`, `won`, `lost`).
- [x] Reorganizar `SinglePageDashboard` com gráfico dominante, KPIs instrumentais e Signal Core 3D.
- [x] Lazy-load do Three.js no dashboard.
- [x] Transformar o cabeçalho/filtros/abas do Comercial Inteligente em command deck.
- [x] Dar profundidade e feedback a KPIs executivos com drill-down.

## Matriz de revisão de toda a plataforma

| Grupo | Módulos | Direção UX | 3D |
|---|---|---|---|
| Visão geral | Dashboard | cockpit, pulso comercial, KPIs instrumentais, feed/agenda em camadas | Signal Core real |
| Captar | Prospecção, LDR/Market Intelligence | busca em camadas, resultados com confiança, ações rápidas, mapa/território explorável | somente mapa/território se codificar geografia real |
| Qualificar | Empresas, Decisores, Mesa, Matriz de Qualificação | densidade alta, score/estado visual, painel lateral, microfeedback de decisão | não por padrão |
| Relacionar | Agenda, Calendário, Cadência | timeline, ritmo temporal, drag/hover com profundidade, feedback de execução | não |
| Fechar | Pipeline CRM, Cockpit CRM, Propostas | kanban espacial, forecast lateral, cards com risco/valor, transições de estágio | apenas visualização agregada, nunca no card individual |
| Analisar | Comercial Inteligente, Analytics, Win/Loss, Relatórios IA | gráficos exploráveis, drill-down, comparação, brush/zoom quando útil | possível em forecast agregado com fallback 2D |
| IA & Capacitação | Hub IA, Chatbook, Roleplay, Matrizes, Academy, Knowledge, Editor | foco em diálogo/conteúdo, estados claros de processamento, feedback sonoro pontual | apenas agente/orbe com função real, não decoração |
| Administração | Notificações, Bitrix, Integrações, Automações, Consumo, Equipe, Configurações | utilitário, denso, previsível; profundidade menor que cockpits | não |

## Regras por componente

### Cards

- `default`: conteúdo comum;
- `stat`: indicador;
- `elevated`: instrumento de decisão;
- `interactive`: abre drill-down ou executa navegação;
- `accent`: estado de alta prioridade, não decoração.

### Gráficos

Todo gráfico analítico deve avaliar:

1. seleção de série;
2. tooltip com contexto;
3. comparação temporal;
4. drill-down quando houver fonte detalhada;
5. estado vazio/erro distinto;
6. teclado e descrição textual quando a interação gráfica não for acessível.

### Tabelas e listas

Não converter tabelas densas em cartões grandes apenas por estética. Profundidade deve aparecer em cabeçalhos sticky, linhas selecionadas, agrupamentos, painel de detalhe e ações contextuais.

### Formulários

Sem 3D. Microinteração deve reforçar foco, validação, progresso, sucesso e erro. Campos continuam previsíveis e rápidos.

## Performance e acessibilidade

- 3D sempre lazy-loaded.
- Canvas pausado/estático em reduced motion.
- Sem autoplay de áudio.
- Sem áudio contínuo.
- Som desativável no topbar e persistido.
- Nenhuma cor usada como único indicador de estado.
- Nenhuma fórmula comercial foi alterada nesta revisão.
- Nenhum dado fictício foi introduzido.

## Gate obrigatório antes de merge

A branch não deve ser tratada como pronta para merge sem execução real de:

- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes de dashboard/commercial-intelligence
- testes de acessibilidade
- `npm run build`
- `npm run check:bundle-budget`
- QA visual em AtlasGR/Total Trac e light/dark
- smoke mobile/Capacitor ou viewport equivalente

O merge deve ocorrer somente depois de evidência real desses gates.
