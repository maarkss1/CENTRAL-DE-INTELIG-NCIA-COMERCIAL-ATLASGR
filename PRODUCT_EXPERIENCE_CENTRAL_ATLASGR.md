# PRODUCT EXPERIENCE — CENTRAL DE INTELIGÊNCIA COMERCIAL ATLASGR
**Fase 1 do mandato: Inventário real, mapa de fricção e primeira correção.**
Gerado a partir de leitura direta do código (não de nomes de arquivos) em 2026-08-07.

---

## 1. Executive Summary

A plataforma é um SPA React 19 + Vite servido por um backend Express único (`server.ts`), com Prisma/Postgres (Supabase em produção), BullMQ para automações assíncronas, e um gateway multi-provedor de IA (Groq primário, Gemini fallback, LiteLLM/Ollama local). **É um produto muito mais maduro no backend do que sua navegação deixa transparecer**: existem ~22 módulos de frontend mapeados, a maioria genuinamente funcional (CRUD real, dados reais, IA real) — mas a arquitetura de informação atual esconde funcionalidade real atrás de abas quebradas, duplica a mesma capacidade em 3-4 lugares diferentes, e finge ter um recurso central (command palette) que não existe.

**Achado mais crítico (já corrigido nesta sessão):** o "Hub de IA" (`IntelligenceHub`) tinha 9 sub-ferramentas — Swarm, Metodologias de Vendas, Config de IA, Superagente, Gerador de Scripts, Guia de Automação, Ações Pendentes, Gerador B2B, RAG — mas **8 delas eram inacessíveis por navegação**: o componente lia uma prop `initialTab` que nenhum chamador jamais definia com valor diferente do padrão. Era, na prática, funcionalidade construída e paga em desenvolvimento, invisível ao usuário final. Corrigido nesta sessão (ver §13).

---

## 2. Product Map (módulos confirmados no código)

| Módulo | Arquivo principal | Status real |
|---|---|---|
| Dashboard | `src/features/dashboard/components/SinglePageDashboard.tsx` | ✅ Completo |
| Prospecção | `src/features/prospecting/components/ProspectingHub.tsx` | ✅ Completo (CNPJ, Discovery, OCR) |
| CRM / Pipeline | `src/components/CrmBoard.tsx` | ✅ Completo (Kanban dnd-kit, 11 estágios) |
| Empresas | `src/features/companies/components/CompanyList.tsx` | ✅ Completo |
| Contatos | `src/features/contacts/components/ContactList.tsx` | ✅ Completo |
| Atividades | `src/features/activities/components/ActivityList.tsx` | ✅ Completo |
| Inteligência (Hub de IA) | `src/features/intelligence/components/IntelligenceHub.tsx` | ⚠️ 8/9 sub-telas estavam inacessíveis — **corrigido** |
| Chatbook | `ChatbookHub.tsx` + `FloatingChatbook.tsx` | ⚠️ Duas implementações sobrepostas |
| Roleplay | `src/features/roleplay/components/RoleplayHub.tsx` | ✅ Completo, mas duplicado em 2 outros lugares |
| Matriz de Qualificação | `src/features/playbook/components/QualificationMatrixPage.tsx` | ✅ Completo (estático) |
| Matriz de Objeções | `src/features/playbook/components/ObjectionsMatrixPage.tsx` | ✅ Completo (estático) |
| Academia | `TopicTrainingAcademy.tsx` | ✅ Completo |
| Bitrix (guia) | `BitrixGuideHub.tsx` | ⚠️ Estático, duplica a integração real |
| Bitrix (integração real) | `src/features/integrations/components/Integrations.tsx` | ✅ Completo |
| Relatórios | `ReportsHub.tsx` | ✅ Completo, sobrepõe conceitualmente Analytics |
| Integrações | `Integrations.tsx` (WhatsApp/Google/Bitrix/3CX) | ✅ Completo |
| Base de Conhecimento | `src/features/knowledge/components/Base.tsx` | ✅ Completo (RAG real) |
| Editor de Documentos | `src/features/document-editor/components/Editor.tsx` | ⚠️ É o mesmo domínio da Base de Conhecimento, não um editor geral |
| Analytics | `src/features/analytics/components/Analytics.tsx` | ✅ Completo |
| Calendário | `src/features/calendar/components/Calendar.tsx` | ✅ Completo |
| Notificações | `src/features/notifications/components/Notifications.tsx` | ✅ Completo |
| Automações | `src/features/automations/components/Automations.tsx` | ✅ Completo (regra-real, distinta do "Guia de Automação" dentro do Hub de IA) |
| Equipe | `src/features/team/components/Team.tsx` | ✅ Completo, admin-only |
| Configurações | `src/features/settings/components/Settings.tsx` | ❌ Stub ("Em breve"), **nem está roteado** no Sidebar/App.tsx |
| Login/Onboarding | `LoginScreen.tsx`, `OnboardingTour.tsx` | ✅ Completo |
| IA Global / AI Dock | `AIDockWidget.tsx` + `AtlasChatbotTrigger.tsx` | ⚠️ Flutuante, mas não sabe qual registro está aberto |

---

## 3. Mapa de Fricção — duplicações e caminhos quebrados

1. **4 superfícies de IA conversacional sobrepostas** sem porta de entrada única: `ChatbookHub` (página cheia), `FloatingChatbook` (painel flutuante, tabs assistant/roleplay/playbook), `RoleplayHub` (página dedicada), `AIDockWidget` (widget flutuante com 5 sub-ferramentas incluindo roleplay e objeções de novo). Um SDR não tem como saber qual usar para qual tarefa.
2. **Bitrix duplicado**: uma tela "Bitrix24" no menu é só um guia estático de boas práticas; a integração real (conectar, importar, regras de sync) vive dentro de "Integrações". Nome ambíguo, dois lugares, um deles enganoso.
3. **"Editor de Documentos" não é um editor geral** — é o editor da própria Base de Conhecimento (re-vetoriza ao salvar). O nome no menu promete algo que não existe.
4. **Command palette é decorativo.** `AppTopbar.tsx` mostra uma busca com badge "⌘K" mas é um `<span>` estático sem `onClick`, sem input, sem listener de teclado. Não existe pacote `cmdk` no projeto. É a Etapa 10 do mandato — atualmente 0% implementada.
5. **Settings.tsx é órfão** — existe, é um placeholder "Em desenvolvimento", e nem está no roteamento (`App.tsx`/`Sidebar.tsx` não o referenciam). Ninguém consegue nem abrir a versão "em breve".
6. **Navegação morta**: `src/components/layout/nav.ts` e `Topbar.tsx` são um segundo sistema de navegação completo, não usado em lugar nenhum da árvore ativa — inclusive contêm o único toggle mobile/hamburguer do projeto, que por estar no componente morto, nunca roda.
7. **IntelligenceHub — corrigido nesta sessão** (era o pior caso: funcionalidade paga e construída, zero caminho de navegação).

## 4. IA como Copiloto (Etapa 7) — avaliação

O AI Dock (`AIDockWidget`) e o Chatbook flutuante são globais (aparecem em toda tela `/app`), o que é positivo. Mas nenhum dos dois é **contextual**: `useAssistantChat` só recebe `activeBrand`/`brandInfo` — nunca a rota atual, o `companyId`, o `dealId` ou o registro aberto na tela. Ou seja, se um Closer está com o card do negócio "Empresa X" aberto no CRM e abre a IA, a IA não sabe disso. O modelo "Dado → Insight → Explicação → Recomendação → Ação" exigido pelo mandato não está implementado — hoje é "Pergunta → resposta genérica de brand".

## 5. Arquitetura de dados (Prisma) — riscos que precisam de decisão do usuário antes de qualquer alteração

Estes **não** foram tocados (mudança de schema tem alto raio de impacto e pode quebrar sync com Bitrix/produção) — ficam registrados para priorização:
- 3 modelos de RAG sobrepostos: `KnowledgeDocument` (órfão, zero relações) vs `Document`/`DocumentChunk` (em uso) vs `KnowledgeChunk` (paralelo).
- `Prospect` duplica `Company`/`Lead` (mesmo cnpj/score/enriquecimento) como pipeline paralelo não relacionado.
- `AIGovernancePolicy` e `AIEvaluation` sem `organizationId` — quebram o padrão de isolamento multi-tenant usado em todo o resto do schema.
- `User.role` é string livre, não enum — arriscado dado que RBAC em `authorization.ts` já define 19 papéis fortemente tipados.
- `Lead` carrega ~12 campos só-Bitrix marcados no próprio schema como "ainda não lidos pelo app" — schema à frente do código.

## 6. Mobile & Acessibilidade

Praticamente inexistentes hoje: nenhum hook de media query no projeto, sidebar fixa em `w-64` sem colapso, o único toggle mobile existe no componente morto (`Topbar.tsx`). A/11y: sem `eslint-plugin-jsx-a11y`, sem `axe`, `aria-*` em só 17 arquivos. Isso é grande o bastante para ser sua própria frente de trabalho, não um "quick win".

---

## 7. Top Problems (impacto = frequência × tempo perdido × nº usuários × impacto comercial × risco)

| # | Problema | Persona afetada | Prioridade | Esforço |
|---|---|---|---|---|
| 1 | 8/9 sub-telas do Hub de IA inacessíveis | SDR, Closer, Gestor | **P0** | Baixo — **✅ corrigido nesta sessão** |
| 2 | Command palette falso (Etapa 10 do mandato, 0% real) | Todos | P1 | Médio |
| 3 | 4 superfícies de IA conversacional sem porta única | SDR, Closer | P1 | Médio–Alto (decisão de produto) |
| 4 | IA não é contextual ao registro aberto | SDR, Closer | P1 | Médio |
| 5 | Bitrix guia-vs-integração confuso | SDR, RevOps | P2 | Baixo |
| 6 | Settings stub não roteado | Admin | P2 | Baixo |
| 7 | Navegação morta (`nav.ts`/`Topbar.tsx`) ocupando espaço mental de manutenção | Eng/RevOps | P3 | Baixo |
| 8 | Mobile praticamente ausente | SDR em campo | P2 | Alto |
| 9 | Modelos Prisma órfãos/duplicados (RAG, Prospect) | RevOps/Eng | P2 | Alto (requer migração de dados) |
| 10 | `User.role` não é enum | RevOps/Eng | P3 | Médio |

---

## 8. Correção implementada nesta sessão

**Problema:** `src/features/intelligence/components/IntelligenceHub.tsx` recebia `initialTab` via prop, mas `src/App.tsx:69` sempre renderiza `<IntelligenceHub />` sem prop — então `activeTab` nunca saía do valor padrão `'swarm'`. Não havia nenhum seletor de abas dentro do componente. As outras 8 visões (Metodologias, Config de IA, Superagente, Scripts, Guia de Automação, Ações Pendentes, Gerador B2B, RAG) existiam no código, funcionavam, e eram 100% inalcançáveis pela UI.

**Causa raiz:** um seletor de abas interno foi removido ou nunca terminado, deixando só a lógica de roteamento condicional.

**Solução:** adicionada barra de abas interna (padrão pill já usado em `ProspectingHub.tsx`, reaproveitando os tokens de tema `bg-surface`/`border-line`/`accent.bgSoft`/`accent.text` já existentes no design system — nenhum componente novo, nenhuma dependência nova). Estado local via `useState<IntelligenceTab>(initialTab)`, então chamadores futuros que queiram abrir numa aba específica continuam funcionando via prop, e o usuário pode navegar livremente entre as 9 abas.

**Impacto:** zero mudança de contrato de API, zero mudança de dados, aditivo puro. Risco de regressão: mínimo.

**Testes executados:** `npx tsc --noEmit` sobre o projeto inteiro — sem erros introduzidos pela mudança.

**Verificação visual:** **não realizada nesta sessão** — o daemon do Docker Desktop não está rodando localmente, e o app requer Postgres local (porta 5434) + login autenticado para chegar nessa tela. Recomendo abrir `npm run docker:up && npm run dev` e conferir a aba "Hub de IA" manualmente, ou pedir para eu subir o Docker e validar visualmente na próxima rodada.

---

## 8b. Segundo bug corrigido nesta sessão (achado ao investigar a busca para o Command Palette)

**Problema:** a busca de "Empresas" e "Contatos" não filtrava nada — cada tecla digitada disparava um novo fetch, mas o resultado era sempre a mesma lista completa paginada.

**Causa raiz:** `src/lib/db.ts` (`companiesDB.list`/`contactsDB.list`) enviava o termo digitado como `?search=...`, mas os controllers reais (`CompanyController.getCompanies`, `ContactController.getContacts`) só leem `req.query.q` — confirmado seguindo a cadeia completa até `PrismaCompanyRepository.findAllWithFilters`/`PrismaContactRepository.findAllWithFilters`, onde o filtro Prisma (`where.OR = [...]`, `contains`/`insensitive`) só é aplicado quando `query` está definido. Como o parâmetro nunca chegava com o nome certo, `query` era sempre `undefined` e o filtro nunca era aplicado.

**Solução:** troquei a chave do query string de `search` para `q` nas duas chamadas (2 linhas). Endpoint do Bitrix (`BitrixImportPanel.tsx`) foi checado e **não** tem esse bug — lá o backend já lê `search` corretamente, então não foi tocado.

**Impacto:** este era, na prática, o segundo pior bug da plataforma depois do Hub de IA — a busca por nome nas telas de Empresas e Contatos, usada dezenas de vezes por dia por SDR/Closer, não fazia nada.

**Testes:** `tsc --noEmit` limpo, `eslint` limpo, `vite build` completo sem erros.

## 8c. Command Palette real — implementado (Etapa 10 do mandato, prioridade escolhida pelo usuário)

**O que existia:** `AppTopbar.tsx` mostrava uma barra de busca com badge "⌘K", mas era decoração pura — `<span>` estático, sem input, sem listener de teclado, sem lógica.

**O que foi construído**, tudo aditivo (nenhum componente/tela existente foi removido ou teve contrato alterado):
- `src/components/ui/CommandPalette.tsx` — paleta global acionada por `⌘K`/`Ctrl+K` (de qualquer tela) ou clicando na barra do topbar. Navegação por setas + Enter, fechamento por Escape ou clique fora.
- **Navegar**: busca fuzzy (com normalização de acentos) sobre os 23 módulos do app — reaproveita o mesmo mapa `TAB_META` que o topbar já usava, agora extraído para `src/components/layout/tabMeta.ts` como fonte única (elimina duplicação futura).
- **Empresas/Decisores**: busca real, debounced (300ms), contra os endpoints já existentes `/api/companies?q=` e `/api/contacts?q=` — os mesmos que acabaram de ser corrigidos no item 8b. Selecionar um resultado navega até o módulo já filtrado pelo nome encontrado.
- **Ações rápidas**: Criar nova atividade (abre o formulário direto), Iniciar prospecção, Abrir Relatórios de IA, Chamar copiloto de IA.
- Como a navegação do app é 100% por troca de aba em memória (sem rota por registro), criei uma ponte leve e explícita (`src/lib/paletteIntent.ts`) para o Palette comunicar "abra X já filtrado/já com o formulário aberto" ao módulo de destino — sem prop-drilling nem estado global novo.
- `AtlasChatbotTrigger.tsx` ganhou um listener de evento para poder ser aberto pelo Palette a partir de qualquer tela.

**Testes executados:** `npx tsc --noEmit` (limpo), `npx eslint` nos 11 arquivos tocados (limpo), `npx vite build` (build de produção completo, sem erros, bundle gerado normalmente).

**Verificação visual: não realizada.** Sem Docker Desktop rodando neste ambiente não há Postgres local nem sessão autenticada, e o app inteiro fica atrás de login — não há como abrir a tela real. Recomendo fortemente rodar `npm run docker:up && npm run dev` e testar manualmente: abrir com `Ctrl+K`, digitar o nome de uma empresa real, navegar com as setas, confirmar que cai na tela certa já filtrada.

## 8d. Nota: sessão concorrente detectada

Durante este trabalho, identifiquei outra sessão editando o mesmo repositório em paralelo (confirmado com o usuário). Ela cuidou, de forma independente, de dois itens que eu tinha listado no roadmap (§9): a limpeza de navegação morta (removeu `Header.tsx`, `Topbar.tsx`, `nav.ts`) e o início de responsividade mobile (Sidebar off-canvas, backdrop, botão hambúrguer no topbar). As mudanças dela e as minhas ficaram compatíveis — `tsc --noEmit` seguiu limpo o tempo todo. Para não colidir, deixei de fazer a limpeza de navegação (já feita) e não toquei em Sidebar/MainLayout/AppTopbar/Button/Dialog/Skeleton além do estritamente necessário abaixo. Ela também está com uma migration nova de RLS (`enable_rls_remaining_tables`) e mudanças em Analytics/Billing/paleta de gráficos em andamento — não relacionadas a mim, não tocadas.

## 8e. Pequenas correções adicionais (baixo risco)

- **Settings deixou de ser código morto**: `Settings.tsx` existia mas não estava roteado em lugar nenhum. Adicionei `'settings'` ao `TabType`/`TAB_META` (`tabMeta.ts`), um item em "Administração" na Sidebar (admin-only, ao lado de "Equipe") e a linha de renderização em `App.tsx`. Continua sendo um placeholder "Em breve" — isso é honesto e esperado (Etapa 12: estado vazio que ensina o próximo passo) — mas agora é alcançável em vez de invisível.
- **Nome do "Bitrix24" no menu desambiguado**: renomeado para "Guia Bitrix24" (no `TAB_META` e no array local da Sidebar) para deixar claro que é o guia estático, não a conexão real — que continua em "Integrações → Bitrix24".

**Testes:** `npx tsc --noEmit` limpo após as duas mudanças.

## 8f. Consolidação das superfícies de IA sobrepostas (aprovada pelo usuário)

Antes de mexer, investiguei a fundo em vez de assumir duplicação pela aparência: `AIDockWidget` (dock flutuante centro-inferior) e `FloatingChatbook` (drawer lateral) não eram cópias uma da outra — falavam com **backends de IA diferentes**. `AIDockWidget` usava `/api/agent/*`, com prompt de sistema dedicado por modo (`copilot`, `groq`, `objections`, `qualification`, `playbook`), cada um com temperatura própria (`src/features/intelligence/routes/agent.routes.ts`). Dois desses modos eram capacidades reais e únicas, ausentes em qualquer outro lugar do app:
- **`objections`**: gera uma resposta de contorno sob medida para a objeção específica que o vendedor digitar (não é busca — é geração via LLM).
- **`qualification`**: gera de 4 a 6 perguntas SPIN/BANT sob medida a partir do contexto do lead/segmento informado.

A aba "Matrizes & Objeções" do `FloatingChatbook`, por outro lado, era **busca estática** numa lista fixa de objeções/qualificações pré-escritas (`BRAND_OBJECTIONS`/`BRAND_QUALIFICATIONS`), sem geração nenhuma. Remover o `AIDockWidget` sem preservar esses dois modos teria sido regressão real, não limpeza — por isso não apaguei nada até confirmar isso e alinhar o plano com o usuário.

**O que fiz, com aprovação explícita do usuário para este plano:**
1. Criei `src/hooks/useAiPlaybookGenerator.ts`, chamando os mesmos endpoints (`/api/agent/chat` com `tool: 'objections'`, `/api/agent/qualification`) que o `AIDockWidget` já usava.
2. Adicionei um alternador "Buscar pronto" / "Gerar com IA" dentro da aba "Matrizes & Objeções" do `FloatingChatbook` (`src/features/chatbook/components/FloatingChatbook.tsx`) — a busca estática que já existia continua exatamente igual; o modo "Gerar com IA" é novo e expõe as duas capacidades que estavam presas no widget duplicado.
3. Só depois disso testado (`tsc`, `eslint`, `vite build`, todos limpos, e o chunk `AIDockWidget` sumiu do bundle final — confirma que nada mais o referencia), removi `<AIDockWidget />` de `src/App.tsx`. **O arquivo `AIDockWidget.tsx` não foi apagado** — só parou de ser renderizado — para manter a reversão trivial caso algo precise ser recuperado.
4. O modo "Roleplay" **não foi tocado**: `RoleplayHub` (página dedicada, com reconhecimento de voz) e a aba "Roleplay" do `FloatingChatbook` (só texto) podem servir profundidades diferentes (treino completo vs. prática rápida) — isso não foi investigado a fundo e fica para uma rodada futura, com o mesmo cuidado.

**Resultado:** de 4 superfícies de IA conversacional sobrepostas, ficam 3 com propósitos agora mais claros — `ChatbookHub` (página cheia, pesquisa web+interna), `FloatingChatbook` (copiloto rápido global, agora com busca E geração de objeções/qualificação, mais roleplay-texto), `RoleplayHub` (treino dedicado). Nenhuma capacidade foi perdida.

**Testes:** `npx tsc --noEmit`, `npx eslint` nos arquivos tocados, e `npx vite build` completo — todos limpos.

**Verificação visual: não realizada**, pela mesma limitação de ambiente já registrada (sem Docker local, sem sessão autenticada). Recomendo testar manualmente: abrir o copiloto flutuante → aba "Matrizes & Objeções" → alternar para "Gerar com IA" → testar os dois modos (objeção e qualificação) com um exemplo real.

## 8g. IA contextual ao registro aberto (Etapa 7 do mandato)

Antes desta mudança, o copiloto (`useAssistantChat`) só recebia `activeBrand`/`brandInfo` — nunca sabia se o usuário estava com uma empresa ou negócio aberto na tela. Corrigido de forma aditiva, sem alterar nenhum contrato de API existente:

1. **`src/contexts/ActiveRecordContext.tsx`** (novo) — contexto React leve: `{ type: 'company'|'lead', id, label, summary }`. Telas de detalhe se registram ao montar e se removem ao desmontar (`clearActiveRecord` só limpa se o id ainda for o atual, evitando corrida quando o usuário troca de registro rápido).
2. **`CompanyDetail.tsx`** e **`LeadDetailDrawer.tsx`** (CRM) passaram a registrar o registro aberto — os dois únicos lugares do app que têm uma "tela de detalhe" real hoje (Contatos não tem: `ContactDetail.tsx` existe mas é código morto, nunca importado — Contatos usa formulário modal, não tela de detalhe; não mexi nisso agora).
3. **`useAssistantChat.ts`**: a saudação inicial do copiloto agora menciona o registro aberto quando existe um ("Vi que você está com **Empresa X** aberto..."), e toda pergunta enviada carrega esse contexto para o backend (`/api/intelligence/studio`) — antes esse contexto só era enviado no modo "Base {marca}"; agora vale nos dois modos, porque "o que está na tela" não é a mesma coisa que "base de conhecimento interna da marca".

**Testes:** `npx tsc --noEmit`, `npx eslint` (0 erros — 1 warning cosmético de fast-refresh em arquivo de contexto, mesmo padrão já presente em `BrandContext`/`ThemeContext`), `npx vite build` completo. Todos limpos.

**Verificação visual: não realizada** (mesma limitação de ambiente). Roteiro de teste manual: abrir uma empresa em Empresas → abrir o copiloto flutuante → conferir que a saudação menciona a empresa → perguntar algo sem repetir o nome da empresa e conferir que a resposta usa o contexto certo.

## 8h. Investigação de Roleplay — concluída: não é redundância, é profundidade em camadas

Investiguei se `RoleplayHub` (página dedicada) e a aba "Roleplay" do `FloatingChatbook` (widget flutuante) eram duplicação, como suspeitava. **Não são.** Os dois usam o mesmo backend (`/api/intelligence/studio`, `kind: 'roleplay'` — sem fragmentação de backend aqui, ao contrário do caso do AIDockWidget). A diferença é de profundidade, e é uma diferença legítima:

| | `RoleplayHub` (dedicado) | Aba Roleplay do `FloatingChatbook` |
|---|---|---|
| Modalidade | Voz (microfone + texto-para-fala) | Só texto |
| Dificuldade | 3 níveis selecionáveis | Não tem |
| Personas | 3 por marca, descrições ricas | 3 genéricas, iguais nas duas marcas |
| Ao final | Relatório de análise dedicado (pontuação média, pontos fortes, melhorias) | Nota inline por turno, sem relatório final |

Ou seja: uma é a sessão de treino completa, a outra é a prática rápida sem sair do que você está fazendo. É o padrão correto — como uma barra de resposta rápida ao lado de uma janela de composição completa. **Não mexi em nenhuma delas.**

O único problema real era de descoberta: nada dentro do widget rápido avisava que a versão completa existe. Corrigido de forma mínima:
- `AtlasChatbotTrigger.tsx` e `FloatingChatbook.tsx` ganharam uma prop `onNavigate` opcional (mesmo padrão já usado pelo Command Palette), passada por `MainLayout.tsx`.
- A aba Roleplay do `FloatingChatbook` agora mostra um aviso no topo: "Isto é a prática rápida por texto. Para simulação completa por voz e nota final, abra o Roleplay dedicado" — clicar leva direto ao módulo `RoleplayHub` e fecha o widget.

**Testes:** `npx tsc --noEmit`, `npx eslint`, `npx vite build` — todos limpos.

**Verificação visual: não realizada** (mesma limitação de ambiente).

## 8i. Automação (Etapa 8) — reclassificação + uma correção real, sem tocar no schema

Investiguei `automation.engine.ts` a fundo antes de mexer. Correção da minha própria avaliação inicial (§ nota geral do relatório): este motor está **mais maduro do que um "3/10, regra simples" sugere** — isolamento de erro por regra (uma automação quebrada não derruba as outras nem o fluxo principal), template `{{campo}}` nas notificações, respeito à lista de bloqueio (opt-out) nas ligações via SDR de voz, contagem de execuções, e cobertura de teste real (`automation-engine-run.test.ts`, `automation-triggers.test.ts`, `automation-sdr-voz.test.ts` — 3 arquivos, todos passando). Os 3 gatilhos (`Lead criado`, `Lead mudou de status`, `Atividade concluída`) estão genuinamente conectados de ponta a ponta, não são decorativos.

**Bug real encontrado e corrigido:** o formulário de criação (`Automations.tsx`) deixava configurar qualquer combinação de gatilho + ação livremente, mas o motor sempre falhava (silenciosamente, só no log do servidor) para duas combinações: `Atividade concluída` + `Criar atividade`, e `Atividade concluída` + `Ligar via SDR de Voz` — porque o motor usava o id do evento como `leadId`, e num evento de atividade esse id é o da própria atividade, não de um lead. O usuário criava a regra, ela nunca disparava com sucesso, e não havia nenhuma pista visível do motivo — só "0 execuções" para sempre.

- **`Criar atividade` — corrigido de verdade**, não só escondido: o evento de "Atividade concluída" já carrega `leadId` em `event.data` (visto em `activity.service.ts`); o motor agora usa esse campo quando o evento não é de lead. Isso **habilita uma automação real que antes era impossível de configurar**: "toda vez que uma atividade for concluída, agende automaticamente um follow-up no mesmo lead." Adicionei teste cobrindo o novo caminho de sucesso, mantendo o teste existente que cobre a recusa quando não há `leadId` no evento.
- **`Ligar via SDR de Voz`** — mantive a restrição (ligar automaticamente toda vez que qualquer atividade for concluída tem risco real de discagem duplicada/indesejada; isso é uma decisão de produto, não uma correção técnica). Só filtrei essa opção do formulário quando o gatilho é `Atividade concluída`, pra parar de oferecer uma combinação que nunca funciona.

**Por que não fui além:** qualquer gatilho ou ação nova (ex.: "lead parado há N dias", que resolveria a dor de Gestor identificada na Etapa 4) exige um novo valor de enum no Prisma (`AutomationTrigger`/`AutomationAction`) — ou seja, migration de schema. Mantive isso fora do escopo desta rodada, junto com a limpeza de schema, pelos mesmos dois motivos: risco em produção e a migration de RLS em andamento na outra sessão.

**Testes:** `npx vitest run` nos 3 arquivos de teste do módulo (21 testes, todos passando, incluindo o novo), `npx tsc --noEmit`, `npx eslint`, `npx vite build` — todos limpos.

**Verificação visual: não realizada** (mesma limitação de ambiente). Roteiro de teste manual: criar uma automação com gatilho "Atividade concluída" e ação "Criar atividade" → concluir uma atividade de um lead → conferir que o follow-up foi criado automaticamente nesse lead.

## 8j. Varredura de mais bugs do tipo "parâmetro com nome errado" — nenhum encontrado

Antes de seguir para outra frente, fiz uma varredura sistemática (não só amostral) em todo o app procurando mais casos da mesma classe de bug do item 8b (frontend manda um parâmetro de busca/filtro com um nome, backend lê outro nome, filtro não faz nada). Cobri Notificações, Calendário, Analytics, Base de Conhecimento, Equipe, Bitrix (todos os painéis), WhatsApp e Prospecção/enriquecimento — comparando cada chamada que monta query string no frontend com o `req.query.X` real lido no backend correspondente. **Nenhum novo caso encontrado** — todos os nomes batem. O caso de Empresas/Contatos (item 8b) era isolado, não um padrão sistêmico.

Nota lateral sem impacto em produção: `ActivityController.ts` (`src/features/activities/presentation/`) só lê `req.query.date`, ignoraria `from`/`to` — mas esse controller está registrado no container de injeção de dependência e **nunca foi ligado a nenhuma rota Express real** (a rota ativa é outro handler, que lê `from`/`to` corretamente). É código morto, não um bug ativo.

## 8k. Dashboard sem estado de erro (Etapa 12) — corrigido

Achado original confirmado e corrigido: `SinglePageDashboard.tsx` usava `useAnalytics()` e `useActivities()`, mas descartava o `error` que os dois hooks já expõem (só pegava `data`/`loading`). Se a chamada de métricas ou de agenda falhasse, os KPIs ficavam travados em "—" para sempre e a "Agenda de hoje" mostrava "Nenhum compromisso agendado" — **indistinguível de "sem falha, só não tem nada hoje"**. O usuário não tinha como saber se era um dia livre ou o dashboard quebrado.

Corrigido de forma aditiva: as duas seções agora capturam `error`/`refetch` (já existiam nos hooks, só não eram usados) e mostram um aviso vermelho com "Tentar novamente" quando a chamada falha, em vez de cair no mesmo texto do estado vazio genuíno.

**Testes:** `npx tsc --noEmit`, `npx eslint`, `npx vite build` — todos limpos.

**Verificação visual: não realizada** (mesma limitação de ambiente).

## 9. Próximos passos — decisão de priorização necessária

Restam do mandato original: arquitetura da informação mais ampla (Etapa 9, parcialmente já endereçada pela limpeza de navegação feita na outra sessão) e qualquer novo gatilho/ação de automação ou limpeza de modelo — ambos exigem migration de schema Prisma, que decidi não tocar enquanto a outra sessão estiver com a migration de RLS em andamento no mesmo repositório. Os módulos com maior densidade de fricção documentada (§3–§6) que ainda não foram tocados: mobile (em andamento pela outra sessão), consolidação dos 3 modelos de RAG sobrepostos no schema, e o pipeline `Prospect` paralelo não ligado a `Company`/`Lead` — todos exigem schema.
