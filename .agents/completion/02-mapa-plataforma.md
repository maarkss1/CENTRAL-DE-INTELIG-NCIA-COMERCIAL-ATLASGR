# Mapa da Plataforma — Módulos, Inteligências, Motores, Tráfego e Agentes

- Data: 2026-08-14
- Método: leitura direta do código (`src/`, `server.ts`, `prisma/schema.prisma`, `.agents/`, `docs/`),
  não reaproveitamento de auditoria anterior. Onde um documento anterior já cobre o assunto, a
  referência está citada em vez de reescrita.
- Escopo: inventário estrutural. Não é auditoria de qualidade — para isso ver
  `.agents/completion/00-inventario.md`, `01-bloqueadores.md`, `PLATFORM_COMPLETION_REPORT.md`,
  `BITRIX24-LEAD-FLOW-AUDIT.md` e `DESIGN_QA_CENTRAL_ATLASGR.md`.

---

## 1. Camadas da plataforma

Um único processo Node (`server.ts`, 31 KB) hospeda **quatro runtimes distintos** ao mesmo tempo:

| Runtime | O que é | Entrada |
|---|---|---|
| **HTTP/API** | Express + Better Auth + 30 routers montados | `/api/**`, `/health/*`, `/metrics`, `/api-docs` |
| **SSE** | Stream de notificações em tempo real | `/api/notifications/stream` |
| **Filas** | 13 filas BullMQ + workers, gated por `ENABLE_QUEUES` | Redis |
| **Cron** | `node-cron` do scanner de leads frios + 8 agendadores recorrentes BullMQ | tempo |

Além disso, o mesmo servidor serve o SPA (Vite em dev, `dist/` em produção) e mantém **sessões
Baileys de WhatsApp** vivas em memória.

> **Débito arquitetural já registrado** (`01-bloqueadores.md` → "Débitos arquiteturais"): workers e
> sessões Baileys dentro do processo HTTP. Não é bloqueador de release, mas é o fator que mais limita
> escala horizontal hoje — qualquer réplica extra duplica cron e sessões.

Frontend: React 19 + Vite 6 + React Router 7, todas as rotas em `React.lazy`. Também empacotado
como app Android/iOS via Capacitor (`android/`, `ios/`, `capacitor.config.ts`).

---

## 2. Módulos do produto (27 módulos de feature)

Fonte: `src/features/**` + rotas em `src/App.tsx`.

### 2.1 Núcleo comercial (CRM)

| Módulo | Rota | Backend | Estado |
|---|---|---|---|
| `dashboard` | `/app` | agregações de analytics | dados reais |
| `crm` | `/app/crm` | `/api/leads` + Kanban dnd-kit | núcleo; RBAC por captura de lead |
| `crm360` | `/app/crm360` ("Cockpit CRM") | `/api/crm` | rota religada na Onda 1; 2 quick-actions viraram cards informativos |
| `companies` | `/app/companies` | `/api/companies` | dados reais |
| `contacts` | `/app/contacts` | `/api/contacts` | dados reais |
| `activities` | `/app/activities` | `/api/activities` | dados reais |
| `notes` | (embutido em lead) | `/api/leads/:leadId/notes` | dados reais |
| `calendar` | `/app/calendar` | `/api/google` (Workspace) | dados reais |

### 2.2 Prospecção e enriquecimento

| Módulo | Rota | Motores |
|---|---|---|
| `prospecting` | `/app/prospect` | Apollo, Hunter, Google Places, Nominatim/OSM, CNPJ, DuckDuckGo (`duck-duck-scrape`), Cheerio, Tesseract OCR |

Serviços: `apollo.service.ts` (+ `apollo/{client,organizationEnrich,organizationSearch,people}`),
`hunter.service.ts`, `places.service.ts`, `nominatim.service.ts`, `cnpj.util.ts`, `news.service.ts`,
`ocr.service.ts`, `email-verification.service.ts`, `cold-email.service.ts`, `whatsapp.service.ts`,
`lookalike-scoring.service.ts`, `enrichment/{cnpjLookup,domainGuess,fitScore}`.

### 2.3 Inteligência e IA

| Módulo | Rota | O que é |
|---|---|---|
| `intelligence` | `/app/intelligence` | **Hub de IA com 10 abas** (ver §4) |
| `knowledge` | `/app/knowledge` | RAG: ingestão → chunking → embedding → pgvector → recuperação |
| `commercial-intelligence` | `/app/commercial_intelligence` | BI executivo: forecast, aging, perdas, qualidade de CRM, indicadores antecedentes |
| `analytics` | `/app/analytics` + `/app/winloss` | overview, comparativo, análise ganho/perda |
| `roleplay` | `/app/roleplay` | simulação de ligação + relatório de análise |
| `playbook` | `/app/qualification_matrix`, `/app/objections_matrix` | matrizes de qualificação e objeção |
| `chatbook` | `/app/chatbook` | playbook conversacional + matrizes por marca |
| Market Intelligence | `/app/market-intelligence` | `src/pages/MarketIntelligence.tsx` |

### 2.4 Integrações

| Módulo | Rota | Integração |
|---|---|---|
| `integrations/bitrix` | `/app/integrations`, `/app/bitrix` | Bitrix24 (in/outbound, sync rules, custom fields, ownership guard) |
| `integrations/whatsapp` | `/app/integrations` | Baileys (`@whiskeysockets/baileys`) + conversation intelligence |
| `integrations/birth-voice` | `/app/integrations` | Birthub Voices / Bland AI (cold call, AMD, webhooks) |
| `integrations/threecx` | `/app/integrations` | 3CX (telefonia; persistência real desde a Onda 5) |
| `integrations/google` | `/app/calendar` | Google Workspace (OAuth, Calendar) |

### 2.5 Operação e governança

`automations` (`/app/automations`), `notifications` (`/app/notifications` + SSE), `billing/usage`
(`/app/usage`), `team` (`/app/team`, ADMIN), `settings` (`/app/settings`), `lgpd` (sem UI própria —
API `/api/lgpd`), `document-editor` (`/app/editor`), `gamification` (widget), `onboarding` (tour),
`auth` (`/login`, `/welcome`, `/select-brand`, `/reset-password`).

**Total:** 28 rotas dentro de `/app` + 4 rotas públicas.

---

## 3. Motores (engines)

### 3.1 Motor de dados
- **PostgreSQL + Prisma** (`@prisma/adapter-pg`), 43 models, 46 migrations.
- **RLS Postgres com FORCE** + extensão Prisma que faz `set_config` por transação + injeção de
  `organizationId` — três camadas de tenancy.
- **pgvector** — coluna `vector(768)` para RAG (`KnowledgeChunk`, `DocumentChunk`).
- **Redis** (`ioredis`) — filas BullMQ, cache, rate limit distribuído, circuit breaker do gateway de IA.
- **Meilisearch** (`src/lib/search/`) — busca, gated por `ENABLE_SEARCH`.
- **S3** (`@aws-sdk/client-s3`) — `src/lib/storage/`, upload com presigned URL.

### 3.2 Motor de IA (`src/lib/ai/gateway.ts`)

Cadeia de provedores, nessa ordem, com nomes **lógicos** de modelo desacoplados do provedor:

```
Groq (principal)  →  OpenAI  →  Gemini  →  LiteLLM/Ollama (último recurso)
```

- Aliases: `local-llama3` → `llama-3.3-70b-versatile`; `local-llama3-fast` → `llama-3.1-8b-instant`;
  `gpt-4o`/`claude-sonnet` também resolvem para Groq.
- **3 tentativas por provedor** com backoff que respeita o `retry-after` do Groq (limite de TPM do
  tier gratuito é atingido de verdade quando o enxame roda).
- **Circuit breaker** distribuído (Redis + fallback em memória): 3 falhas → 30 s de resfriamento.
- Limites de payload: 100 mensagens, 200k chars, 100k chars por embedding.
- Falha total **não inventa resposta** — lança erro nomeando cada provedor configurado.

**Embeddings:** locais por padrão (`@xenova/transformers`, `Xenova/multilingual-e5-base`, 768 dim,
prefixos `query:`/`passage:`). `EMBEDDINGS_PROVIDER=gateway` volta à rota LiteLLM→Google.

**Orquestração:** LangGraph (`@langchain/langgraph`) — `StateGraph` + `MemorySaver`.

### 3.3 Motor de automação (`src/features/automations/automation.engine.ts`)

Hoje: **3 gatilhos × 3 ações** (enum Prisma).

| Gatilhos | Ações |
|---|---|
| Lead criado · Lead mudou de status · Atividade concluída | Notificar equipe · Criar atividade · Ligar via SDR de Voz |

Com histórico de execução (`automation-history.service.ts`), condições por campo e templates de
variáveis. Campanhas de cold call têm API própria (`coldCallCampaign.api.ts`).

### 3.4 Motor de filas (13 filas + 1 cron)

| Fila / job | Arquivo | Função |
|---|---|---|
| `leads` | `queue/index.ts` | processamento de lead |
| `enrichment` | `queue/enrichment.queue.ts` | enriquecimento B2B |
| `search` | `queue/search.queue.ts` | indexação Meilisearch |
| `agent` | `queue/agent.worker.ts` | execução assíncrona de agente |
| `coldCall` | `queue/coldCall.worker.ts` | discagem autônoma |
| `swarmScheduler` | `queue/swarmScheduler.worker.ts` | piloto automático 24/7 |
| `whatsappSignal` | `queue/whatsappSignal.worker.ts` | sinais de conversa |
| `bitrixSync` | `queue/bitrixSync.worker.ts` | sincronização Bitrix |
| `followUp` | `crm/jobs/followUp.worker.ts` | follow-up vencido |
| `deduplication` | `crm/jobs/deduplication.worker.ts` | higiene de base |
| `weeklyPdfReport` | `crm/jobs/weeklyPdfReport.worker.ts` | relatório semanal |
| `autoAnonymize` | `crm/jobs/autoAnonymizeDisqualified.worker.ts` | LGPD: anonimiza desqualificados >90 d |
| `winLoss` | `intelligence/services/winLossAnalysis.worker.ts` | análise ganho/perda |
| **cron** `0 2 * * *` | `automations/application/cold-leads-scanner.service.ts` | varredura de leads frios |

### 3.5 Motor de observabilidade
OpenTelemetry (SDK Node + auto-instrumentations + exporter OTLP), Prometheus (`prom-client`,
`/metrics` atrás de `EXPOSE_METRICS`), Langfuse (traces de IA por geração), Pino + Loki
(`pino-loki`), Bull Board em `/admin/queues` (ADMIN).

Métricas de negócio já instrumentadas: `bitrix_sync_failures_total`, `bullmq_queue_*`,
`ai_usage_cost_usd_total`, `ai_usage_budget_usd_total`.

---

## 4. As "inteligências" da plataforma

### 4.1 Hub de IA — 10 ferramentas (`IntelligenceHub.tsx`)

| Aba | Função |
|---|---|
| **Enxame Autônomo** | dispara missão para o swarm e acompanha em tempo real |
| **Metodologias de Vendas** | SPIN, SNAP, AIDA, MEDDPICC, Challenger |
| **Central de Motores de IA** | escolhe modelo e temperatura por ferramenta (`AiEngineSetting`) |
| **Criador de Superagente** | gera prompt, JSON e scripts de provisionamento |
| **Gerador de Scripts** | scraping, ETL, integrações, agentes SDR |
| **Guia de Automações** | guia + workflow n8n + script para gatilho→ação |
| **Central de Decisões** | aprova/descarta ações recomendadas (`AIPendingAction`) |
| **Gerador B2B** | dores, perguntas de qualificação, objeções a partir do ICP |
| **Outreach Intelligence** | script de ligação, WhatsApp, e-mail, cadência, battlecard |
| **Conhecimento Vetorial (RAG)** | base de embeddings consultada pelo SDR |

### 4.2 Geradores do Studio (12)
`studio/generators/`: `assistant`, `automation`, `b2bMatrix`, `callScript`, `email`, `message`,
`methodology`, `ocrExtract`, `roleplay`, `script`, `superagent`, `training`.

### 4.3 Serviços de IA
`CommercialAIService`, `IcebreakerService`, `ai.service`, `ai-settings.service`,
`aiPendingAction.service`, `pending-actions.service`, `autonomyRoleRunner.service`,
`guardrails.service` (minimização/reidratação de PII), `abTesting.service`, `prompt.service`,
`studio.service`, `vector.service`, `vector-search.service`, `voicebox.service`,
`swarmScheduler.service`, `winLossAnalysis.worker`.

### 4.4 Grafos LangGraph
- `graphs/leadQualification.ts` — research → score → summary → status.
- `agents/base.agent.ts` — grafo de turno único reusado por todos os especialistas.
- `agents/supervisor.agent.ts` — grafo de roteamento multi-agente (`MAX_STEPS = 5`).

### 4.5 Governança de IA (models Prisma)
`AIGovernancePolicy`, `AIEvaluation`, `AIPendingAction`, `AiEngineSetting`, `AILog`, `AgentMemory`,
`Prompt`.

---

## 5. Agentes existentes

### 5.1 Agentes de RUNTIME — o Enxame (produto)

Vivem em `src/features/intelligence/agents/`. São o que o cliente final usa.

| Agente | Classe | Papel | Ferramentas |
|---|---|---|---|
| **Supervisor** | `SwarmOrchestrator` | roteia a missão entre especialistas, aplica `enforceLeadGuard`, sintetiza | decisão estruturada (Zod) |
| **SDR (qualificação)** | `SDRQualificationAgent` | qualifica lead **já cadastrado**; exige Lead ID real | `get_lead_context`, `update_lead_qualification`, `search_playbook` |
| **SDR (outbound draft)** | `SDROutboundDraftAgent` | rascunho de primeiro e-mail com RAG | RAG |
| **BDR** | `BDRAgent` | fit outbound a partir de texto livre, sem cadastro | `market_research` |
| **Closer** | `CloserAgent` | objeção, prova de valor, margem, próximo compromisso | — |
| **CRM** | `CRMAgent` | risco de estagnação e próxima ação em deal em andamento | `summarize_lead_history` |
| **Ops** | `OpsAgent` | executa ação concreta | `create_follow_up_task`, `notify_team` |
| **Learning** | `LearningAgent` | aprende estilo do usuário; persiste em `AgentMemory` (`LEARNING_PROFILE`) | — |

**9 ferramentas registradas** (contagem corrigida — AI-008, Sprint 07/onda-20; a lista abaixo já
tinha as 9, só o número no cabeçalho estava desatualizado), classificadas por impacto
(leitura / escrita interna / ação externa) — confirmado por leitura de código, ver
`.agents/runs/onda-7.md` §"Leva 4" para o achado original:

| Ferramenta | Impacto |
|---|---|
| `search_leads` | Leitura |
| `get_lead_context` | Leitura (com minimização de PII antes de retornar ao LLM) |
| `search_playbook` | Leitura |
| `summarize_lead_history` | Leitura |
| `market_research` | Ação externa passiva (busca pública via Tavily/Serper/DuckDuckGo — sem efeito colateral, não envia nem muda nada em terceiro) |
| `update_lead_qualification` | Escrita interna |
| `create_follow_up_task` | Escrita interna (agenda lembrete para humano; não conduz a ação externa) |
| `notify_team` | Escrita interna (notificação no CRM, não envia nada para fora) |
| `generate_cold_email_copy` | Escrita interna (salva rascunho como nota; não envia e-mail apesar do nome) |

Nenhuma das 9 tools executa ação externa de alto impacto diretamente. A única ação externa de alto
impacto do domínio SDR (envio de e-mail) não é uma tool de LangGraph — é `SDROutboundDraftAgent`,
que sempre cria uma `AIPendingAction` (`riskLevel: 'high'`) antes de qualquer envio real.

**Identidade unificada:** `swarm.constants.ts` (`SWARM_IDENTITY`, `SWARM_OUTPUT_CONTRACT`).

**Autonomia 24/7** (`AUTONOMIA_COMERCIAL_24X7.md`): scheduler acordado 24 h; comunicação externa só
na janela comercial; modos `supervised` (padrão) e `full` (7 travas simultâneas para envio autônomo);
discagem autônoma com 2 travas próprias.

### 5.2 Agentes de DESENVOLVIMENTO — a equipe que constrói

Declarados em `AGENTS.md`, prompts em `.agents/prompts/`.

| # | Agente | Prompt existe? |
|---|---|---|
| 00 | Coordenador | ✅ |
| 01 | Plataforma, Segurança e Dados | ✅ |
| 02 | Produto e UX | ✅ |
| 03 | Design e Acessibilidade | ✅ |
| 04 | CRM e BI | ✅ |
| 05 | Prospecção | ✅ |
| 06 | Integrações e Bitrix | ✅ |
| 06A | Extrações Bitrix (mesmo slot do 06) | ✅ |
| 07 | IA e Automações | ✅ |
| 08 | QA e Release | ✅ |
| 09 | Mobile (Capacitor/Android) | ✅ |
| 10 | Infraestrutura, Observabilidade e SRE | ✅ |
| 11 | Marca e Ativos Institucionais | ✅ |
| **12** | **Voz e Telefonia (Birthub Voices)** | ❌ **declarado em `AGENTS.md:22`, sem arquivo de prompt** |

> **Achado 1 — Agente 12 fantasma.** `AGENTS.md` lista o Agente 12 na estrutura oficial, mas
> `.agents/prompts/` não tem `12-*.md` e `.agents/README.md` não o cita. Na prática, voz/telefonia
> (Birth Voice, 3CX, cold call, webhooks de resultado) está sendo tratada dentro do escopo do 06 e
> do 07 — dois donos parciais e nenhum dono formal.

---

## 6. Caminhos de tráfego

### 6.1 Entrada HTTP — ordem real do pipeline (`server.ts`)

```
helmet → cors → compression → rate limit (/api geral)
       → rate limits específicos (/api/intelligence, /api/agent, /api/knowledge, /api/auth)
       → WEBHOOKS COM BODY CRU (antes do express.json!)
       → express.json → /metrics → /api-docs → health/live|ready
       → Better Auth (/api/auth) → /admin/queues (ADMIN)
       → observabilityMiddleware
       → 30 routers de negócio (authenticateToken + requireTenant + requireRole)
       → 404 de API → SPA (Vite dev | dist estático) → errorHandler
```

**Detalhe crítico:** 4 webhooks são montados **antes** do `express.json` porque precisam do corpo cru
para validar assinatura HMAC em tempo constante:
`/api/integrations/birth-voice`, `/api/integrations/3cx/webhook`, `/api/webhooks/voice-result`,
`/api/integrations/bitrix`.

### 6.2 Fluxos de negócio ponta a ponta

**A. Prospecção → CRM**
```
ProspectingHub → /api/prospecting → Apollo/Hunter/Places/CNPJ/OCR
  → fitScore + lookalike-scoring → Lead criado
  → fila `enrichment` → EnrichmentLog
  → motor de automação (trigger "Lead criado")
  → fila `bitrixSync` → Bitrix24 (outbound)
```

**B. Enxame autônomo 24/7**
```
cron/BullMQ `swarmScheduler` → detecta gatilho (WhatsApp de alta intenção, proposta parada,
  follow-up vencido, score alto sem próxima ação, deal estagnado, lead novo sem toque)
  → dedup por lead + prioriza + cooldown + chave de idempotência
  → SwarmOrchestrator → supervisor decide rota (Zod) → especialista (SDR/BDR/Closer/CRM/Ops)
  → AIPendingAction (risco, confiança, evidência)
  → modo `supervised`: espera aprovação humana na Central de Decisões
  → modo `full`: 7 travas → envia e-mail via SMTP real
  → nota auditável no histórico do lead + AILog + AgentMemory
```

**C. RAG**
```
upload → ingestion.service → chunking.ts → local-embeddings (e5, 768d)
  → pgvector (KnowledgeChunk/DocumentChunk, com withRlsContext)
  → vector-search (operador <=> cosine) → contexto → resposta com proveniência
```

**D. Voz**
```
Automação "Ligar via SDR de Voz" | campanha cold call
  → coldCall.policy (janela, tentativas, cooldown, CallSuppression)
  → fila `coldCall` → Birthub Voices/Bland (AMD, retry, reduce_latency)
  → ColdCallRun
  → webhook /api/webhooks/voice-result (HMAC, corpo cru, idempotente, fail-closed sem env)
  → fallback WhatsApp
```

**E. WhatsApp**
```
Baileys (sessão em memória no processo HTTP) → WhatsAppMessage
  → conversation-intelligence.service → ConversationSignal
  → fila `whatsappSignal` → gatilho do enxame
```

**F. Bitrix24 (bidirecional)**
```
IN : webhook Bitrix (token por conexão + timingSafeEqual) → bitrix.webhook → Lead/Deal
OUT: bitrixSync.worker → client.ts → syncRules + customFields + ownershipGuard → BitrixSyncLog
```

### 6.3 Tráfego de saída (todas as dependências externas)

IA: Groq, OpenAI, Gemini, LiteLLM/Ollama, Langfuse.
Prospecção: Apollo, Hunter, Google Places, Nominatim, provedor de CNPJ, DuckDuckGo.
Comunicação: SMTP (nodemailer), Baileys/WhatsApp, Birthub Voices/Bland, 3CX.
Produtividade: Google Workspace (OAuth + Calendar).
CRM externo: Bitrix24.
Infra: Postgres, Redis, Meilisearch, S3, OTLP collector, Loki.

---

## 7. O que falta para a plataforma estar terminada

Consolidado do código + handoffs abertos + docs de bloqueio. **Não é opinião — cada item tem origem
rastreável.**

### 7.1 ENV-001 — RESOLVIDO em 2026-08-15, e nunca foi um defeito do projeto

`ENV-001` aparecia em `PLATFORM_COMPLETION_REPORT.md` e voltava em todas as rodadas seguintes: sem
Docker/Postgres/Redis/navegador, `test:integration` e `test:e2e` ficavam "bloqueados" e migrations
**nunca eram aplicadas contra Postgres real**. Toda aprovação de onda se apoiava, na prática, em
typecheck + lint + unit + build.

**Executado nesta data, contra serviços reais:**

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` | 0 erros |
| `npm run lint` | 0 erros, 101 warnings |
| `npm run test:unit` | **706/706** (109 arquivos) |
| `npm run test:integration` | **48/48** (13 arquivos), contra Postgres 16 + pgvector + RLS real |
| `prisma migrate deploy` | **46/46 migrations aplicadas** |
| `npm run build` | OK |
| `npm run test:e2e` | executável (ver §7.2) |

O bloqueio era do **ambiente de execução daquelas sessões**, não do repositório: aqui o `dockerd`
subiu normalmente e o harness (`scripts/test/prepare-integration-env.js`) funcionou como projetado,
sem nenhuma alteração. A lição registrada é de método, não de código — "bloqueado por ambiente" foi
aceito por várias rodadas sem que ninguém tentasse subir o daemon e mostrasse o erro.

### 7.2 Handoffs ainda abertos

| Handoff | Prioridade | Assunto |
|---|---|---|
| `onda-2/00-para-01-ailog-rls-violation.md` | **alto** | 2 de 5 testes de RLS do `AILog` falham; hipótese: `SET` vazando entre conexões pooled em vez de `SET LOCAL` |
| `onda-4/10-para-01-metricas-http-otel.md` | normal (em andamento) | métricas HTTP via OTel incompletas |
| `onda-1/00-para-01-legacy-services-repo-migration.md` | normal | migração de services legados |
| `onda-1/01-para-04-role-gates-crm.md` | normal | limiares de RBAC no CRM |
| `onda-1/06-para-01-schema-extracoes-bitrix-historico.md` | normal | schema `BitrixExtractionRun` — **travado em decisão humana de retenção** |
| `onda-4/11-para-00-videos-institucionais-duplicados.md` | normal | vídeos institucionais duplicados |
| `onda-5/01-para-06-persistencia-3cx-implementada.md` | normal | revisão da persistência 3CX |
| `onda-3/07-para-11-lgpd-service-fix.md` | **sem cabeçalho de status/prioridade** | formato fora do protocolo de `AGENTS.md` |

### 7.3 Ações externas obrigatórias (fora do alcance de qualquer agente)
1. Rotacionar a chave da Bland AI (esteve versionada com remote no GitHub — dispara ligações pagas).
2. Rotacionar os 2 webhooks Bitrix24 (AtlasGR e TotalTrac — a URL **é** a credencial).
3. Decidir sobre `git filter-repo`/BFG para o dump `backups/prospector-*.dump`, ainda recuperável no
   histórico (commits `2e30b2f`, `543c5b0`, `8b1bc38`).

### 7.4 Débitos arquiteturais conhecidos
Workers/Baileys no processo HTTP · `process-guards.ts` engolindo `unhandledRejection` global ·
graceful shutdown não fecha HTTP/SSE/Redis explicitamente · `/metrics` sem auth quando exposto ·
`piiSanitizer` é código morto e o consentimento LGPD não é verificado em
`conversation-intelligence`/`birth-voice` · 4 vulnerabilidades moderate · gamificação com XP efêmero
(decisão de produto pendente) · `OverviewMetrics` duplicado entre front e back sem fonte compartilhada.

### 7.5 Lacunas de produto para autonomia de ciclo completo
Listadas em `AUTONOMIA_COMERCIAL_24X7.md` → "Próximas integrações", nenhuma implementada:
proposta versionada + assinatura eletrônica · agendamento direto no Google Calendar após
disponibilidade confirmada · cadência multicanal com opt-out unificado (e-mail/WhatsApp/voz) ·
reply tracking de e-mail no classificador de intenção · fechamento determinístico por evento de
aceite/pagamento · painel de SLO por agente (cobertura, conversão, custo, latência, erro, override).

### 7.6 Cobertura de automação estreita
3 gatilhos e 3 ações no enum Prisma. Todo o restante da inteligência (WhatsApp, voz, enriquecimento,
enxame) roda **fora** do motor de automação, por caminhos próprios — o usuário final não consegue
compor essas capacidades sozinho.

---

## 8. Sumário quantitativo

| Dimensão | Quantidade |
|---|---|
| Módulos de feature | 27 |
| Rotas de UI | 28 privadas + 4 públicas |
| Routers de API | 30 |
| Models Prisma | 43 |
| Migrations | 46 |
| Filas BullMQ | 13 (+1 cron `node-cron`) |
| Provedores de IA em cadeia | 4 |
| Agentes de runtime (enxame) | 8 |
| Ferramentas de agente | 9 |
| Ferramentas do Hub de IA | 10 |
| Geradores do Studio | 12 |
| Integrações externas | 6 diretas + 6 de prospecção |
| Agentes de desenvolvimento | 13 com prompt + 1 declarado sem prompt |
