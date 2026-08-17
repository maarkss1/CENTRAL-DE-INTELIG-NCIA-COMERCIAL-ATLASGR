# PRODUCT_VISUAL_TRUTH_MAP — AtlasGR Revenue OS

Documento de rastreabilidade obrigatório para qualquer peça de comunicação, campanha ou
audiovisual da marca AtlasGR (ver `PROMPT MASTER 2.0`). Regra de ouro: nenhuma cena, número,
funcionalidade ou tela pode aparecer em material de comunicação sem constar aqui, com origem
`TELA REAL → COMPONENTE REAL → FUNCIONALIDADE REAL` rastreável a este repositório.

Levantamento feito em 2026-08-17, branch `integracao/onda-11`. App único (React 19 + Vite + React
Router 7): AtlasGR e Total Trac são a **mesma aplicação**, alternada em runtime por
`src/contexts/BrandContext.tsx` — não são produtos/builds separados. Este mapa cobre o app inteiro
e sinaliza explicitamente o que é condicionado à marca Total Trac (não usar em campanha AtlasGR).

---

## A. Telas reais disponíveis

Formato: **rota** — objetivo — persona principal — ações possíveis — informações exibidas —
elementos visualmente interessantes — valor comercial demonstrável.

| Rota (`/app/...`) | Componente / arquivo | Objetivo | Persona | Ações possíveis | Elementos visuais fortes | Valor comercial demonstrável |
|---|---|---|---|---|---|---|
| `` (Painel Central) | `SinglePageDashboard.tsx` | Visão do dia: saudação, KPIs reais, agenda | Vendedor/gestor no início do dia | Ver KPIs, ver agenda do dia, atalhos | `LiveStatsWidget` (dados ao vivo do backend), `ClockCalendarWidget`, grid de KPI cards | Início do dia já com prioridade clara — prova "contexto antes da ação" |
| `prospect` (Prospecção) | `ProspectingHub.tsx` | Encontrar empresas/leads novos | SDR/BDR | Buscar por CNPJ, descoberta por critério, OCR de cartão/documento | 3 abas (`CnpjSearchPanel`, `DiscoveryResultsPanel`, `OcrCapturePanel`) | Prova **SINAL/DESCOBRIR** — geração real de leads a partir de dados públicos (Apollo/Hunter/CNPJ) |
| `crm` (Pipeline CRM) | `CrmBoard.tsx` | Gerenciar funil de vendas | Vendedor/closer | Arrastar card entre estágios (drag-and-drop), abrir detalhe do lead | Kanban com 6 estágios (Lead) ou 12 estágios incl. "Piloto" (Negócio), `KanbanCard`/`LeadDetailDrawer` | Prova **EXECUTAR** — pipeline real, não maquete |
| `crm360` (Cockpit CRM) | `CrmOverview.tsx` | Visão executiva consolidada do funil | Gestor/Head comercial | Navegar por atalhos para outras telas, ver atividades em atraso | `KpiCard` coloridos por intenção (brand/success/warning/violet) | Prova contexto executivo — "onde existe oportunidade" |
| `mesa-tratamento` (Mesa de Tratamento) | `MesaTratamento.tsx` | Fila priorizada de leads para atendimento | SDR | Pegar próximo lead da fila, tratar, avançar | `QueueList`, `CurrentLeadCard`, estados de loading/erro/vazio explícitos | Prova **PRIORIDADE** — fila que decide "quem agir agora" |
| `intelligence` (Hub de IA) | `IntelligenceHub.tsx` | Console central de ferramentas de IA comercial | Vendedor avançado/gestor | Abrir qualquer uma das 11 ferramentas (grade de cards) | Grade de cards de ferramentas, sem abrir direto numa ferramenta específica | Prova "IA incorporada à operação", não IA solta |
| `companies` (Empresas) | `CompanyList.tsx` | CRUD de empresas prospectadas/clientes | SDR/Vendedor | Listar, filtrar, criar, editar empresa | Lista/tabela real | Prova base de dados comercial real |
| `contacts` (Decisores) | `ContactList.tsx` | CRUD de contatos/decisores | SDR/Vendedor | Listar, filtrar, criar, editar contato | Lista/tabela real | Prova mapeamento de decisores |
| `activities` (Agenda) | `ActivityList.tsx` | Lista/timeline de atividades comerciais | Vendedor | Registrar, ver histórico | Timeline | Prova execução registrada |
| `cadence` (Cadência) | `CadenceHub.tsx` | Gestão de sequências de contato | SDR/BDR | Criar/editar cadência, ver estado vazio | `EmptyState` explícito | Prova **EXECUTAR** — automação de toque |
| `chatbook` (Chatbook) | `ChatbookHub.tsx` | Chat com IA sobre objeções/qualificação | Vendedor em atendimento | Perguntar, alternar busca interna/web | Interface de chat | Prova apoio de IA em tempo real, contextual à marca ativa |
| `roleplay` (Roleplay) | `RoleplayHub.tsx` | Simulação de ligação de vendas com IA | Vendedor em treinamento | Escolher persona/dificuldade, rodar simulação, ver relatório pós-call | Relatório de análise pós-call | Prova **APRENDER** — treinamento real, não decorativo |
| `qualification_matrix` (Matriz de Qualificação) | `QualificationMatrixPage.tsx` | Critérios de qualificação por marca/segmento/persona | Vendedor/gestor | Consultar matriz | Matriz filtrável | Prova padronização de critério comercial |
| `objections_matrix` (Matriz de Objeções) | `ObjectionsMatrixPage.tsx` | Respostas padronizadas a objeções | Vendedor | Consultar matriz | Matriz filtrável | Prova playbook real de vendas |
| `topic_training` (Academy) | `TopicTrainingAcademy.tsx` | Gerar módulo de treinamento sobre um tópico via IA | Gestor/treinador | Pedir geração de módulo | Conteúdo gerado estruturado | Prova **APRENDER** |
| `bitrix` (Guia Bitrix24) | `BitrixGuideHub.tsx` | Documentação viva do funil Bitrix24 | Ops/Admin | Consultar mapeamento de campos/estágios | Documentação técnica | Uso interno — não é cena de campanha de produto |
| `reports` (Relatórios IA) | `ReportsHub.tsx` | Relatório executivo gerado por IA | Gestor | Gerar relatório, ver gráfico de leads ganhos | `GlowChart` (dados reais via `/api/analytics/dashboard`) | Prova **APRENDER/DECIDIR** |
| `integrations` (Integrações) | `Integrations.tsx` | Painel de integrações externas | Admin/Ops | Configurar Bitrix24, WhatsApp Web, Google, 3CX | Painel de status de integração | Prova conectividade real ao ecossistema do cliente |
| `knowledge` (Base de Conhecimento) | `Base.tsx` (`features/knowledge`) | Upload/busca de documentos com RAG | Vendedor/gestor | Upload de documento, busca semântica | Interface de busca | Prova contexto documental real |
| `analytics` (Analytics) | `Analytics.tsx` | Dashboard analítico | Gestor | Ver gráficos `recharts` | Gráficos de barra/linha | Prova **APRENDER** |
| `winloss` (Win/Loss) | `WinLossAnalysis.tsx` | Motivos de ganho/perda via IA | Gestor | Consultar análise | Análise textual + gráfico | Prova aprendizado real do funil |
| `market-intelligence` (Market Intelligence) | `MarketIntelligenceApp.tsx` | Inteligência de mercado (concorrência, score, território) | Gestor/BDR sênior | Explorar concorrentes, score, território | Dados reais de CSV de concorrência verificada (`concorrencia_seed_verificada.csv`) | Prova **DESCOBRIR** com dado real de mercado — cena forte e segura |
| `propostas` (Propostas) | `Propostas.tsx` | Ferramenta de propostas | Vendedor | Ver ferramenta embutida | **Iframe** de app estático `/tools/propostas/index.html`, não React nativo — cuidado ao filmar (recursos/transições podem destoar visualmente do resto do app) | Prova fechamento comercial |
| `commercial_intelligence` (Comercial Inteligente) | `CommercialIntelligenceHub.tsx` (restrito a ADMIN/GESTOR) | Revenue Command Center executivo | Head comercial/CRO | Navegar 7 abas: Visão Executiva, Pipeline & Forecast, Performance, Leading Indicators, Aging, Perdas, Qualidade do CRM | `AiExecutiveSummaryCard`, `AlertsPanel`, `DealDrillDownDrawer`, `KpiTile` | Prova **DECIDIR** — a cena executiva mais forte do produto |
| `calendar` (Calendário) | `Calendar.tsx` | Calendário de atividades | Vendedor | Arrastar atividade entre dias (drag-and-drop) | Grid de calendário | Prova organização de execução |
| `notifications` (Notificações) | `Notifications.tsx` | Central de notificações | Todos | Marcar lida, excluir | Lista de notificações | Cena de apoio, não hero |
| `automations` (Automações) | `Automations.tsx` | CRUD de regras de automação | Ops/Admin | Criar regra gatilho → ação | Lista de regras | Prova automação real (não "IA mágica") |
| `usage` (Consumo de IA) | `Billing.tsx` | Consumo/custo de IA por modelo | Admin | Ver gráfico de uso | Gráfico `recharts` | Uso interno/operacional — não é cena de campanha |
| `editor` (Editor de Documentos) | `Editor.tsx` (`document-editor`) | Editor vinculado à base de conhecimento | Vendedor/gestor | Editar documento | Editor de texto | Cena de apoio |
| `team` (Equipe, restrito ADMIN) | `Team.tsx` | Gestão de usuários/papéis | Admin | CRUD de usuários | Lista de usuários — **contém nomes/e-mails reais da equipe, não filmar sem mascarar** | Uso interno, não é cena de campanha |
| `settings` (Configurações) | `Settings.tsx` | Tema, marca ativa, perfil, integrações, feature flags | Todos | Trocar tema claro/escuro, trocar marca | Toggle de tema (`Sun`/`Moon`) | Boa cena para mostrar dualidade de marca/tema, se relevante à narrativa |

Telas pré-login (`WelcomeScreen.tsx`, `SelectionScreen.tsx`, `LoginScreen.tsx`,
`ResetPasswordScreen.tsx`) existem mas são gate de autenticação/seleção de marca — não são cenas
de funcionalidade de produto; usar apenas se a peça for institucional sobre a plataforma em si
(ex.: abertura de filme mostrando "duas marcas, um motor").

---

## B. Funcionalidades reais — classificação

| Funcionalidade | Classificação | Nota |
|---|---|---|
| Dashboard com KPIs ao vivo (`LiveStatsWidget`) | **IMPLEMENTADA** | Comentário no código confirma leitura real do backend PostgreSQL |
| Prospecção por CNPJ / descoberta por critério / OCR | **IMPLEMENTADA** | Serviços reais: `apollo.service.ts`, `hunter.service.ts`, `cnpjLookup.ts`, `ocr.service.ts`, `places.service.ts` |
| Pipeline Kanban (CRM) | **IMPLEMENTADA** | Drag-and-drop real via `@dnd-kit`, dois funis reais (Lead/Negócio) |
| Cockpit executivo (`crm360`) | **IMPLEMENTADA** | Dados reais de API |
| Mesa de Tratamento (fila SDR) | **IMPLEMENTADA** | Estados de loading/erro/vazio tratados explicitamente |
| Hub de IA (11 ferramentas) | **IMPLEMENTADA** (nível "grade de acesso") | Cada ferramenta interna precisa ser verificada individualmente antes de detalhar em cena — este mapa confirma a existência da tela-índice, não o comportamento fino de cada uma das 11 |
| Roleplay com relatório pós-call | **IMPLEMENTADA** | Gera relatório real de análise |
| Market Intelligence (concorrência/score/território) | **IMPLEMENTADA** | Dado real de pesquisa verificada em CSV, não sintético |
| Comercial Inteligente (Revenue Command Center, 7 abas) | **IMPLEMENTADA**, acesso restrito (ADMIN/GESTOR via `RequireRole`) | Cena executiva mais forte — ótima para "DECIDIR", mas exige captura com usuário de papel adequado |
| Analytics / Win-Loss / Relatórios IA | **IMPLEMENTADA** | `GlowChart` hoje usa dado real de `/api/analytics/dashboard` (antes era fictício — corrigido, ver seção C) |
| Automações (regras gatilho→ação) | **IMPLEMENTADA** | CRUD real |
| Integrações (Bitrix24, WhatsApp Web, Google, 3CX) | **IMPLEMENTADA**, nível de painel de status | Confirmar estado de conexão real antes de filmar como "conectado" |
| Propostas | **IMPLEMENTADA**, mas via **iframe de app estático separado** (`/tools/propostas/index.html`) | Ao filmar, avisar que a transição visual para essa tela pode não ser idêntica ao resto do produto (não é componente React nativo) |
| Gamificação (nível/XP/sequência de dias) | **NÃO UTILIZAR EM COMUNICAÇÃO como "histórico real"** | Não existe backend de XP/nível hoje — widget foi corrigido para iniciar zerado (Level 1, 0 XP, 0 dias). Não retratar como prova social ou trajetória real de usuário |
| Chatbot/orb 3D (`AtlasOrb.tsx`) | **DEMONSTRATIVA** | Usado apenas no onboarding, é elemento decorativo pesado (~900kB, lazy-loaded) — não é o "cérebro de IA" do produto, não usar como metáfora central de IA |
| SpaceGame (mini-jogo) | **EXPERIMENTAL/DEMONSTRATIVA** | Widget de gamificação decorativo — não é funcionalidade comercial, não usar como prova de valor |
| Comando de voz (`VoiceCommandWidget`) | **PARCIAL** — existência confirmada, comportamento fino não auditado nesta rodada | Verificar antes de mostrar em uso real |
| Reports (`features/reports/components/Reports.tsx`) | **NÃO CONFIRMADO como alcançável pela UI** | Não há rota em `App.tsx` apontando para este componente — a rota `reports` do menu usa `ReportsHub.tsx` de `intelligence/`. Não usar até confirmar |

---

## C. Dados

| Fonte | Tipo | Uso permitido em campanha |
|---|---|---|
| `scripts/seed.ts` (org "Acme Corp Enterprise", `admin@acmecorp.com`) | Dado de desenvolvimento/placeholder técnico | **Não usar** — não é branding AtlasGR |
| `scripts/seed-team.ts` (org "AtlasGR", e-mails reais da equipe, ex. `comercial@atlasgr.com.br`) | **Dado real de pessoas/e-mails internos** | **Não usar em material público sem aprovação explícita** — são identidades reais de colaboradores |
| `seed_users.ts` | Provisionamento manual, senha aleatória por execução | Não relevante para campanha |
| `public/tools/atlas-market-intelligence/concorrencia_seed_verificada.csv` | **Dado real de pesquisa de mercado** (concorrentes de risco de carga, por município/UF, com fonte e confiança) | Uso permitido na tela `market-intelligence` como prova de inteligência real — mas é informação competitiva sensível: confirmar com o time antes de expor em peça pública |
| `bitrix_fields.json` / `parsed_fields.json` | Artefato real de integração (mapeamento de campos) | Uso interno, não é cena de campanha |
| Dados de KPI do dashboard/`GlowChart`/`crm360` | **Dados reais de API**, variam por ambiente/tenant | Antes de gravar: usar ambiente de demonstração com dados criados especificamente para a captura, nunca dado de cliente real de produção |
| Gamificação (XP/nível/streak) | **Fictício por padrão, hoje zerado** | Não usar como se fosse trajetória real de usuário |
| Não há arquivos de mock/fixture (`*mock*`, `*fixture*`, `*demo*`) em `src/` | — | Onde antes existiam números fixos fictícios (GlowChart, Gamificação), o código já foi corrigido para dado real ou zerado — não reintroduzir número inventado ao roteirizar uma cena |

---

## D. Cenas permitidas (rastreabilidade obrigatória)

Toda cena de produto num roteiro/storyboard deve referenciar uma linha desta tabela. Nenhuma cena
fora desta lista é válida sem atualizar este documento primeiro.

| Cena proposta (uso narrativo) | TELA REAL | COMPONENTE REAL | FUNCIONALIDADE REAL |
|---|---|---|---|
| Abertura "sinais dispersos" | `/app` (Painel Central) | `SinglePageDashboard.tsx` | KPIs ao vivo + agenda do dia |
| "Encontre onde existe movimento" (DESCOBRIR) | `/app/prospect` | `ProspectingHub.tsx` | Busca por CNPJ / descoberta por critério |
| "Encontre onde existe movimento" (mercado) | `/app/market-intelligence` | `MarketIntelligenceApp.tsx` | Score/território com dado real de concorrência |
| "Contexto transforma informação em direção" | `/app/crm360` | `CrmOverview.tsx` | Cockpit executivo consolidado |
| "Veja o que merece atenção" (prioridade) | `/app/mesa-tratamento` | `MesaTratamento.tsx` | Fila priorizada de leads |
| "Transforme contexto em ação" (execução) | `/app/crm` | `CrmBoard.tsx` | Pipeline Kanban, drag-and-drop de lead entre estágios |
| "Transforme contexto em ação" (cadência) | `/app/cadence` | `CadenceHub.tsx` | Sequência de contato |
| "Cada ação gera novos sinais" (aprendizado) | `/app/analytics` ou `/app/reports` | `Analytics.tsx` / `ReportsHub.tsx` | Gráficos reais (`GlowChart`) e relatório executivo IA |
| "Aprenda com a operação" (treinamento) | `/app/roleplay` | `RoleplayHub.tsx` | Simulação de venda + relatório pós-call |
| "O próximo movimento começa com o contexto certo" (decisão executiva) | `/app/commercial_intelligence` | `CommercialIntelligenceHub.tsx` | Revenue Command Center, 7 abas executivas |

Cenas explicitamente fora de escopo para o Filme Hero/institucional principal: `team` (dados
pessoais reais), `settings`/`integrations`/`bitrix`/`usage` (operacional, não narrativo),
Gamificação/SpaceGame/AtlasOrb (não são prova real de valor, ver seção B).

---

## Divergência de identidade visual encontrada (aplicar nas peças)

`docs/BrandConstitution.md` e os tokens em `identidade-visual/atlasgr/tokens/atlasgr.json` citam
tipografia "Mont"/"Space Grotesk". **O runtime real (`src/styles/globals.css`) usa apenas
Montserrat** para `--font-brand-sans` na marca AtlasGR (Total Trac usa "Fivo Sans", não relevante
aqui). **Usar Montserrat como tipografia oficial nas peças AtlasGR** — é o que o produto
efetivamente renderiza, e a Seção 17 do `PROMPT MASTER 2.0` já indica Montserrat como primária.

Paleta de runtime confirmada: `--brand: #FF5618`, `--brand-2: #FF8008`, `--warn: #FFC500`,
`--ok: #0F9D64`. Fundo/tinta variam por tema (claro: `--bg #FBF9F7` / `--ink #1A1513`; escuro,
padrão do produto: `--bg #0D0A09` / `--ink #F7F3F1`). Compatível com a paleta descrita na Seção 16
do briefing.

---

## Checklist de conformidade para qualquer peça

- [ ] Toda cena de produto está na tabela da seção D (ou foi adicionada a ela antes de roteirizar).
- [ ] Nenhum dado de `scripts/seed-team.ts` (e-mails/nomes reais da equipe) aparece em tela.
- [ ] Nenhuma métrica de Gamificação é usada como prova de resultado real.
- [ ] Captura feita em ambiente de demonstração com dados criados para a gravação, não produção.
- [ ] Tipografia Montserrat, paleta de tokens de runtime (`#FF5618`/`#FF8008`/`#FFC500`).
- [ ] Módulo `commercial_intelligence` só é filmado com sessão de usuário ADMIN/GESTOR válida.
