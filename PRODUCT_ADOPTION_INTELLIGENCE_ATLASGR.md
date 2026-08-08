# PRODUCT ADOPTION & COMMERCIAL INTELLIGENCE — CENTRAL ATLASGR

**Data da análise:** 07/08/2026
**Método:** auditoria de código (5 varreduras dirigidas: frontend/`src/features`, schema Prisma, telemetria existente, IA/roleplay/automação, integração Bitrix24) + inspeção ao vivo do banco de produção (Supabase, projeto `atlasgr-prospector-production`).
**Aviso metodológico central:** o banco de produção foi migrado para Supabase **hoje** e está com **0 registros em todas as tabelas de negócio** (Lead, Company, Contact, Activity, User, etc.). Não existe, portanto, nenhum dado de uso real para calcular métricas de adoção, funil ou velocidade hoje. Este relatório é consequentemente um **diagnóstico de capacidade + blueprint de instrumentação**: para cada seção, digo o que já é computável a partir do que existe no código/schema, o que está ausente, e o que precisa ser construído antes que os números da Fase 1–10 do prompt original possam existir de verdade.

---

## 1. Product Adoption Score

Não é possível calcular um Product Adoption Score real hoje — não há eventos de uso, não há sessões logadas, não há dados em produção. Em vez de inventar um número, meço a **maturidade da plataforma para eventualmente sustentar esse score**, por pilar (0–10):

| Pilar | Nota | Justificativa |
|---|---|---|
| CRM Core (Lead/Company/Contact/Activity, Kanban dual-funil) | **8/10** | Completo, com funil Lead + funil Negócio, 18 estágios, soft delete, `closedAt` dedicado (não reaproveita `updatedAt`) — modelagem cuidadosa. |
| Prospecção/Enriquecimento | **8/10** | Busca por CNPJ, Apollo, Hunter, verificação de e-mail, achador de decisor, lookalike scoring via pgvector — pipeline de descoberta genuinamente rico. |
| Integração Bitrix24 | **6/10** | Volume de esforço altíssimo (é a área com mais commits/migrações das últimas 3 semanas), mapeamento de campos robusto — mas push automático é *fire-and-forget* sem retry nem visibilidade de falha (ver Seção 11). |
| Camada de IA | **5/10** | Ampla em funcionalidades (copiloto, roleplay, scoring de lead, redação de e-mail, swarm de agentes) mas rasa em confiabilidade: sem grounding, sem persistência do roleplay, sem métricas de confiança (ver Seção 10). |
| Automação | **3/10** | Motor baseado em regra simples (3 gatilhos, 3 ações, sem encadeamento), sem log de execução por corrida no motor genérico. |
| Analytics/BI de negócio | **4/10** | Dashboard de KPIs de CRM existe e é ao vivo (não pré-agregado), mas não há forecast, não há health score, não há valor monetário no Lead. |
| **Telemetria de produto (uso/adoção)** | **0/10** | Nenhum SDK de analytics, nenhuma tabela de eventos, nenhum tracking de login/sessão/feature. `AuditLog` é log de compliance (quem alterou o quê), não comportamento de uso. |
| Integridade de atribuição (owner → usuário) | **2/10** | `Lead.owner`, `Activity.owner`, `Company.owner` são strings livres, **sem FK para `User`** — bloqueia qualquer relatório por vendedor/gestor (Fase 9) hoje. |

**Média ponderada da "Camada de Inteligência Comercial" (pilares 6–9, os que este prompt pede): ~2,3/10.**
**Média da "Plataforma Operacional Core" (pilares 1–3): ~7,3/10.**

Leitura: a AtlasGR construiu um CRM/prospecção sólido e uma integração Bitrix ambiciosa, mas a camada de inteligência que o prompt original pede (adoção, health score, forecast, next best action) **ainda não existe como produto** — existe como especificação. Isso não é um problema de "funcionalidade ruim", é a ordem natural de um produto em 3 semanas de desenvolvimento intenso que priorizou o operacional antes do analítico.

---

## 2. Feature Adoption Matrix

Classificação por **intenção de design** (não por uso real, que é 0 hoje). Onde a classificação também é reforçada por evidência de código (rota morta, componente órfão), marco explicitamente.

| Módulo | Classe | Evidência |
|---|---|---|
| Dashboard (Painel Central) | **Core** | Tela de entrada, `SinglePageDashboard.tsx` |
| Pipeline CRM (Kanban) | **Core** | `src/components/CrmBoard.tsx`, `src/features/crm/*` |
| Prospecção (CNPJ, Apollo, decisor) | **Core** | `ProspectingHub.tsx` + 6 serviços de enriquecimento |
| Empresas / Decisores (Contacts) | **Core** | CRUD completo, usado pelo funil |
| Agenda (Activities) | **Core** | `ActivityList.tsx`, `Timeline.tsx` |
| Analytics | **Core** | KPIs de funil, conversão, atividades — consumido pelo Dashboard |
| Bitrix24 / Integrações | **Core (crítico, frágil)** | Maior volume de mudança recente; ver Seção 11 sobre fragilidade |
| Hub de IA / Copiloto (AIDockWidget) | **Core-adjacente** | Widget global presente em toda a app |
| Roleplay (treino de vendas) | **Advanced** | Sem persistência — nota se perde ao sair da aba |
| Automações | **Advanced** | Motor de regra simples, não workflow encadeado |
| Base de Conhecimento (RAG) | **Advanced** | pgvector, embeddings, usado pelo agente SDR |
| Matriz de Qualificação / Objeções | **Supporting** | Conteúdo de referência estático |
| Chatbook | **Supporting — possível Duplicate** | Sobrepõe função com Hub de IA/Copiloto; nenhuma diferenciação clara de propósito encontrada no código |
| Relatórios IA (`ReportsHub` em `intelligence/`) | **Supporting — possível Duplicate** | Existe também `features/reports/Reports.tsx` (wrapper fino) — dois "Relatórios" na mesma navegação |
| Calendário | **Supporting** | |
| Notificações | **Supporting** | |
| Editor de Documentos | **Supporting** | |
| Consumo de IA (Billing/usage) | **Supporting** | |
| Equipe | **Supporting** | |
| **Enriquecer** (item de menu em `nav.ts`) | **Zombie por construção** | Definido em `Topbar.tsx`/`nav.ts`, mas a app renderiza `Sidebar.tsx`/`AppTopbar.tsx` — rota inalcançável |
| **Commercial OS / "prompts"** (item de menu em `nav.ts`) | **Zombie por construção** | Mesmo motivo — código morto de navegação |
| **Settings** | **Zombie por construção** | `Settings.tsx` implementado, nunca importado/roteado |
| **Gamification** (`GameWidget`, `SpaceGame`) | **Zombie por construção** | Implementado, nunca importado |
| **Notes** | **Zombie por construção (parcial)** | Camada de domínio/repositório completa, **sem componente de UI** — provavelmente só backend ou abandonado |
| **Forecast** | **Não existe** | Zero menção no código-fonte — não é um módulo de baixa adoção, é um módulo inexistente |

**Total de módulos com evidência de código morto: 5** (Settings, Gamification, Notes-UI, e 2 itens de menu órfãos).

---

## 3. Activation Funnel

Framework pedido: `Login → Dashboard → Primeira ação útil → Primeiro resultado → Segundo uso → Uso recorrente → Power User`.

Mapeamento para eventos reais desta plataforma (nenhum é capturado hoje):

| Etapa | Evento candidato nesta plataforma | Capturável hoje? |
|---|---|---|
| Login | Login via Better Auth (`session` criada) | Parcial — `session` existe mas não há histórico de logins (só sessão ativa), sem timestamp de login persistido para análise histórica |
| Dashboard | Abertura de `SinglePageDashboard` | Não — sem pageview tracking |
| Primeira ação útil | Primeira busca de prospecção OU primeiro Lead criado | Parcial — `Lead.createdAt` existe, mas sem `userId` confiável (ver `owner` não é FK) |
| Primeiro resultado | Primeira empresa enriquecida OU primeiro decisor encontrado OU primeira reunião agendada | Não — `EnrichmentLog` existe mas não amarra a um usuário específico de forma consistente |
| Segundo uso | Retorno em sessão distinta dentro de N dias | Não — nenhum registro de sessão histórica |
| Uso recorrente | ≥X ações/semana sustentadas | Não |
| Power User | Uso de módulos avançados (Automação, Roleplay, IA) com frequência | Não |

**Time to First Value / Time to Second Value: não computável hoje.** Pré-requisito mínimo: (a) tabela de eventos com `userId` real, (b) `owner` de Lead/Activity/Company migrado de string livre para FK de `User`.

---

## 4. Critical User Journeys

### Jornada 1 — Pesquisa → CRM
`CnpjSearchPanel`/`DiscoveryFilterPanel` (empresa) → `EnrichmentCacheService` (enriquecimento) → `DecisionMakerSearch` (decisor) → qualificação → `Lead` criado (`funnel=Lead`, `status=Lead_Recebido`).
Todos os passos existem em código. **Gap:** a "qualificação" no meio do funil é hoje conteúdo de referência estático (Matriz de Qualificação) ou o campo `Lead.qualification Json?`, não um scoring automático conectado ao fluxo — o LangGraph de `leadQualification.ts` existe mas não está confirmado como acionado automaticamente neste ponto da jornada (achado dos agentes não confirma o gatilho).

### Jornada 2 — Lead → Contato → Follow-up → Reunião
Progressão de `LeadStatus` (`Lead_Recebido → Cadencia_Iniciada → Qualificacao_SDR → Reuniao_Agendada`) + criação de `Activity` (`type=Reuniao`).
**Gap:** não há distinção entre reunião *confirmada*, *realizada* e *no-show* — `ActivityStatus` só tem `Pendente/Em_andamento/Concluida/Cancelada`. Um no-show hoje vira `Cancelada`, indistinguível de um cancelamento normal — isso quebra a Fase 4 do prompt original ("reunião sem confirmação", "reunião realizada sem atualização").

### Jornada 3 — Reunião → Oportunidade → Proposta → Fechamento
Estágios do funil `Negocio`: `Nova_Oportunidade → Proposta_Enviada → Negocios_Ganhos/Perdidos`.
**Gap crítico:** os campos comerciais dedicados a esta jornada — `dealPackage`, `dealStatus`, `lossReason`, `relationshipLevel`, `commissionPercent`, `partnerBroker` — **existem no schema (migração `20260805220000`) mas estão marcados em comentário de código como "ainda não lidos/escritos pelo `PrismaLeadRepository`"**. Ou seja: o banco está pronto para esta jornada, a aplicação ainda não. É um recurso "meio construído" — nem zombie (não tem UI ainda), nem funcional.

---

## 5. Drop-off Map

Sem dados de uso, não há taxas de abandono reais para reportar. O que dá para afirmar com confiança de código:

- **Pesquisa → Empresa → Enriquecimento → Decisor → Qualificação → CRM**: tecnicamente instrumentável hoje via `createdAt` de `Company`/`Contact`/`Lead` e `EnrichmentLog`, mas sem `userId` amarrado de forma confiável (mesmo bloqueio da Seção 3).
- **Lead → Contato → Follow-up → Reunião**: parcialmente instrumentável via `Activity.status` + `Lead.nextAction`/`resumeDate`, mas nenhum dashboard hoje calcula isso.
- **Reunião → Oportunidade → Proposta → Fechamento**: campos de suporte existem no schema mas não estão sendo escritos pelo app (Seção 4) — **este é literalmente o ponto de maior abandono estrutural do produto**, só que o abandono é do *desenvolvimento*, não do usuário.

---

## 6. Sales Velocity

| Métrica pedida | Computável hoje? | Motivo |
|---|---|---|
| Tempo até primeiro contato | Parcial | `Lead.createdAt` + primeira `Activity` existe, mas sem garantia de que toda `Activity` é registrada de forma consistente |
| Tempo entre contatos | Parcial | Idem |
| Tempo sem atividade / aging por estágio | **Não** | `Lead` só tem um `updatedAt` global (atualizado por *qualquer* escrita) — não existe histórico de transição de estágio com timestamp próprio. `TimelineEvent` tem um tipo "movement" que *poderia* capturar isso, mas não há confirmação de que é escrito em 100% das mudanças de status |
| Reuniões / no-show | **Não** | Ver gap da Seção 4 (Jornada 2) |
| Ciclo médio (createdAt → closedAt) | **Sim, uma vez que houver dados** | `Lead.closedAt` foi adicionado deliberadamente (migração `20260805170000`) exatamente para isso, e o comentário de código confirma que foi desenhado para não ser reaproveitado de `updatedAt` — é o campo de melhor qualidade de todo o schema para este fim |
| Conversão / ganho / perda | **Sim** | Já computado ao vivo em `analytics.service.ts` (contagem por `LeadStatus` de fechamento) |

**Recomendação estrutural:** antes de tentar medir velocidade de estágio, é preciso um evento de "mudança de estágio" com timestamp próprio (não apenas `updatedAt`). O `TimelineEvent` é o candidato natural — precisa apenas da garantia de que é escrito de forma sistemática (idealmente por um hook central, não por chamadas manuais espalhadas).

---

## 7. Commercial Health

Framework de 8 fatores do prompt original, avaliado por computabilidade atual:

| Fator | Status |
|---|---|
| Pipeline Health | Parcial — distribuição por estágio existe; **sem valor monetário** (`pipelineValue` está hardcoded `null` em `analytics.service.ts:36-39`, com comentário explícito de que não há campo de valor no `Lead`) |
| Conversion Health | **Computável** — taxa de conversão por estágio já implementada |
| Activity Health | **Computável** — atividades pendentes/atrasadas já implementadas |
| Follow-up Health | Parcial — campos existem (`nextAction`, `resumeDate`), sem agregação/alerta hoje |
| CRM Hygiene | Não implementado — seria fácil de derivar (leads sem telefone/e-mail, negócios sem valor), mas não há query para isso hoje |
| Forecast Health | **Bloqueado** — depende de campo de valor monetário inexistente |
| Team Productivity | **Bloqueado estruturalmente** — `owner` não é FK de `User`; não dá para atribuir produtividade a uma pessoa real de forma confiável |
| Data Quality | Parcial — `enrichmentStatus`/`EnrichmentLog` dão sinal de qualidade de dado de empresa, mas não há score agregado |

**Commercial Health Score hoje: não calculável de forma responsável.** Calcular um "0-100" a partir de 2 dos 8 fatores (Conversion + Activity) seria enganoso — daria uma falsa sensação de completude. Recomendo **não publicar** um health score único até que ao menos Pipeline (com valor), Team Productivity (com owner→User) e CRM Hygiene existam.

---

## 8. Forecast Opportunities

**Pré-requisito bloqueante e não-negociável: não existe campo de valor monetário no `Lead`/`Deal`.** Sem isso, Meta/Realizado/Pipeline ponderado/Forecast/Commit/Best Case são todos impossíveis, independentemente de quanta lógica de IA se construa em cima.

Ordem recomendada para viabilizar a Fase 7 do prompt original:
1. Adicionar `dealValue` (ou usar o `dealPackage` já existente, se ele carregar valor — precisa confirmação com o time) ao modelo `Lead` para o funil `Negocio`.
2. Popular `dealStatus`/`lossReason` de fato no `PrismaLeadRepository` (hoje só existem no schema — Seção 4).
3. Construir pipeline ponderado = Σ(valor × probabilidade por estágio) — probabilidade por estágio ainda precisa ser definida (não existe hoje, nem como config nem como dado histórico).
4. Só então um forecast com confiança/premissas explicadas (como o prompt original exige) faz sentido.

---

## 9. Next Best Action Opportunities

Não existe motor de Next Best Action hoje. O componente mais próximo é o **swarm scheduler** (`swarmScheduler.service.ts`), que já escaneia follow-ups atrasados e sinais de alta intenção via `ConversationSignal` (WhatsApp) e propõe `AIPendingAction`s — mas é estreito (só 2 gatilhos) e só 1 tipo de ação é de fato executável (`send_email`, conforme `aiPendingAction.service.ts`).

**Blueprint de NBA v1, usando dados que já existem hoje** (sem esperar por forecast ou health score):
- **"Lead sem contato"** → `Lead.createdAt` antigo + 0 `Activity` associada.
- **"Negócio parado"** → `Lead.updatedAt` (ou idealmente último `TimelineEvent`) antigo em estágio não-terminal.
- **"Follow-up atrasado"** → `Lead.nextAction`/`resumeDate` no passado.
- **"Sinal de alta intenção não trabalhado"** → `ConversationSignal.urgency` alto sem `Activity` subsequente — já parcialmente coberto pelo swarm scheduler.
- **"Reunião sem confirmação"** → bloqueado pela Seção 4 (falta status de confirmação em `Activity`).

Todas essas regras podem ser implementadas como consultas SQL/Prisma diretas hoje — **não precisam de IA** para a v1. IA deveria entrar depois, para priorizar/explicar, não para detectar.

---

## 10. AI Trust Analysis

| Critério (Fase 11) | Situação encontrada |
|---|---|
| Grounding | Ausente como metadado estruturado — só instrução em prompt ("use apenas os dados fornecidos") |
| Contexto/origem dos dados | Não exposto ao usuário — RAG calcula `similarity` (cosseno) internamente mas não repassa como citação |
| Confiança | Ausente — nenhum schema de resposta de IA tem campo `confidence` |
| Explicabilidade | Ausente |
| Diferenciação FATO / INFERÊNCIA / RECOMENDAÇÃO / PREVISÃO | **Não implementada** — todas as respostas são texto livre; o disclaimer de "notas são estimativas pedagógicas" no roleplay vive só no prompt, não no schema de retorno (`clarity`/`objectionHandling`, sem campo de confiança) |
| Alucinação | Existe um modelo `AIEvaluation` no schema (`precisionScore`, `hallucinationScore`) **mas está desconectado — sem relação com `AILog`, sem chamador em código.** É um recurso especificado e nunca ligado. |
| Salvaguardas reais existentes | PII: `redactSensitiveData` (mascaramento de CPF) e `minimizePii`/`rehydratePii` rodam em toda saída de IA — isso é um ponto positivo genuíno |
| Prompt injection | Prompt de sistema trata conteúdo do usuário como "dado não confiável, não instrução" — mitigação razoável, mas sem detecção ativa |
| Padrão advisory-vs-execução | **Bem desenhado**: `AIPendingAction` força aprovação humana antes de qualquer ação de IA com efeito colateral; motor de automação por regra (não-IA) executa direto, mas isso é esperado dele |

**Maior risco de confiança:** o roleplay entrega uma nota (0-100) apresentada como feedback objetivo de performance, mas é 100% julgamento do próprio LLM, sem rubrica determinística nem histórico — um vendedor pode achar que está "melhorando" ou "piorando" com base em ruído de amostragem do modelo, não sinal real, porque **a pontuação nem sequer é persistida** entre sessões.

---

## 11. Automation Opportunities

- **Motor de automação genérico**: 3 gatilhos, 3 ações, sem encadeamento, sem log por execução (só `lastRunAt`/`runCount` agregados) — falhas só vão para log, nunca para uma tabela consultável.
- **Contraste positivo**: `ColdCallRun` é um exemplo do padrão certo — log por execução com motivos de skip granulares (`skippedMaxAttempts`, `skippedCooldown`, `skippedNoPhone`, `skippedSuppressed`, `skippedError`). **Recomendação: replicar esse padrão para o motor de automação genérico.**
- **Maior risco operacional do produto inteiro, na minha leitura:** o push automático de Lead → Bitrix é **fire-and-forget** por design explícito (comentário de código: "uma falha aqui não pode impedir o lead de existir no Atlas") — o que é uma decisão de produto defensável, MAS a consequência é que **hoje uma falha de sync com o Bitrix é 100% invisível ao usuário**. Não há retry, não há fila de mortos, não há badge de "não sincronizado". Um vendedor pode achar que um lead está no Bitrix quando não está, por tempo indefinido.
- Sem rate-limit handling nas chamadas HTTP ao Bitrix (sem backoff em 429/503).

**Oportunidade concreta e de baixo esforço**: adicionar `syncStatus`/`lastError`/`errorCount` ao modelo `BitrixConnection` (ou por `Lead`) e um indicador de UI — isso sozinho resolveria a Fase 12 ("integração quebrada") para o maior ponto de fragilidade do sistema.

---

## 12. Zombie Features

Confirmados por evidência de código (não por falta de uso, já que uso ainda é zero):

1. **Settings** (`src/features/settings/components/Settings.tsx`) — construído, nunca roteado.
2. **Gamification** (`GameWidget.tsx`, `SpaceGame.tsx`) — construído, nunca importado.
3. **Notes (UI)** — camada de domínio completa, sem componente visual.
4. **Item de menu "Enriquecer"** e **"Commercial OS"** (`nav.ts`) — definidos em um `Topbar.tsx` que não é o componente realmente renderizado (`Sidebar.tsx`/`AppTopbar.tsx` são usados) — navegação morta.
5. **`AIEvaluation`** (schema) — modelo existe, nunca é escrito nem lido em nenhum lugar do código.
6. **`AIGovernancePolicy`** (schema) — mesmo padrão: modelo stub, sem chamador.

**Candidatos a Duplicate** (não confirmados como redundantes, mas sem diferenciação clara no código — recomendo validar com o time de produto):
- **Chatbook** vs. **Copiloto/Hub de IA** — dois surfaces de chat com IA.
- **Reports** (`features/reports`) vs. **Relatórios IA** (`intelligence/ReportsHub`) — dois itens "Relatórios" na navegação.

---

## 13. Missing Telemetry

Lacunas de instrumentação, em ordem de bloqueio para o resto do relatório:

1. **Nenhum SDK de analytics de produto** (PostHog/Mixpanel/Amplitude/Segment/GA) — busca no repositório inteiro não encontrou nenhuma integração.
2. **Nenhuma tabela de eventos de comportamento.** `AuditLog` é log de compliance por *escrita de registro* (quem mudou o quê), sem taxonomia de evento de produto (nome, categoria, propriedades JSON), sem contexto de sessão/página.
3. **Sem histórico de login/sessão** para calcular ativação, retenção, recorrência.
4. **`owner` não é FK de `User`** em `Lead`/`Activity`/`Company` — bloqueia toda métrica por pessoa (produtividade de time, quem precisa de ajuda, quem está acima/abaixo da meta).
5. **Sem timestamp por transição de estágio** — só `updatedAt` global, que qualquer escrita sobrescreve.
6. **Sem status de confirmação/no-show em `Activity`** — reunião confirmada, realizada e cancelada são indistinguíveis de no-show.
7. **Sem valor monetário no funil `Negocio`** — bloqueia forecast inteiro.
8. **Sem persistência de sessão de roleplay** — cada treino é efêmero, sem histórico de evolução do vendedor.
9. **Sem log por execução do motor de automação genérico** (ao contrário do `ColdCallRun`, que faz isso bem).
10. **Sem `syncStatus`/erro visível para o push automático ao Bitrix.**

---

## 14. Experiments

Três experimentos prontos para rodar assim que a base de instrumentação mínima (Seção 15, P1) existir:

**Experimento 1**
- Hipótese: mostrar "Next Best Action" no Dashboard reduz o tempo até o primeiro contato em leads novos.
- Baseline: mediana de tempo entre `Lead.createdAt` e a primeira `Activity`.
- Métrica: Median Time to First Contact.
- Mudança: card de NBA (Seção 9) fixado no topo do Dashboard.
- Decisão: adotar se redução ≥ 20% sem queda de qualidade de atividade (medida por taxa de não-conclusão).

**Experimento 2**
- Hipótese: expor `syncStatus` do Bitrix reduz reclamações de "lead sumiu" e aumenta confiança no módulo Bitrix.
- Baseline: hoje não medível (falha é invisível) — este experimento em si já é a instrumentação.
- Métrica: nº de leads com sync falho detectados e corrigidos proativamente vs. hoje (zero).

**Experimento 3**
- Hipótese: persistir histórico de roleplay e mostrar evolução de nota ao longo do tempo aumenta `roleplay_started` recorrente (retenção do módulo).
- Baseline: 0 (não existe persistência hoje para medir).
- Métrica: nº médio de sessões de roleplay por usuário por mês, antes/depois de adicionar histórico visível.

---

## 15. Recommended Changes

### P0 — Bloqueante, resolver antes de qualquer trabalho de "inteligência"
1. **Segurança:** habilitar RLS nas 11 tabelas expostas no Supabase (`session`, `account`, `verification`, `AuditLog`, etc. — ver alerta no início da conversa). Requer políticas antes de ativar, não é "ligar e esquecer".
2. **`owner` → FK de `User`** em `Lead`, `Activity`, `Company`. Sem isso, nenhuma métrica por vendedor/gestor (Fase 9/10) é possível.
3. **Campo de valor monetário** no funil `Negocio` (`Lead.dealValue` ou equivalente) — pré-requisito de Forecast (Fase 7) e Pipeline Health (Fase 6).
4. **Conectar os campos já existentes** (`dealStatus`, `lossReason`, `dealPackage`, etc.) ao `PrismaLeadRepository` — o schema já paga por eles, a aplicação não os usa.

### P1 — Fundação de instrumentação
5. Criar uma tabela de eventos de produto real (`ProductEvent`: nome, `userId`, `organizationId`, propriedades JSON, timestamp, indexada por `[organizationId, name, timestamp]`) — não reaproveitar `AuditLog`.
6. Instrumentar os eventos-chave listados no prompt original (Fase 1) nos pontos de entrada já existentes (não precisa reescrever nada, só adicionar chamadas de log nos use-cases que já existem em `application/*UseCases.ts`).
7. Adicionar timestamp por transição de estágio (via `TimelineEvent` sistemático, não manual).
8. Adicionar status de confirmação/no-show a `Activity` (`ActivityStatus` +1 valor, ou campo separado).
9. Dar visibilidade de falha ao push automático do Bitrix (`syncStatus`/`lastError` + indicador de UI).

### P2 — Camada de inteligência v1
10. Construir Next Best Action v1 puramente por regra SQL (Seção 9) — sem IA.
11. Construir CRM Hygiene score simples (leads sem telefone/e-mail/valor).
12. Persistir histórico de roleplay (`RoleplaySession` model) com nota e feedback.
13. Adicionar rótulo FATO/INFERÊNCIA/RECOMENDAÇÃO/PREVISÃO no schema de resposta de todo endpoint de IA — é uma mudança pequena de schema com grande ganho de confiança.

### P3 — Limpeza e consolidação
14. Remover ou finalizar: `Settings`, `Gamification`, `Notes`-UI, itens de menu mortos em `nav.ts`, modelos `AIEvaluation`/`AIGovernancePolicy` (decidir: conectar ou remover).
15. Esclarecer com o time de produto se Chatbook/Copiloto e Reports/Relatórios IA são intencionalmente distintos ou candidatos a fusão.
16. Só depois de P0–P2: publicar um Commercial Health Score único e um Forecast — publicar antes disso seria dar uma falsa sensação de precisão.
