# INVENTÁRIO TÉCNICO REAL — CENTRAL DE INTELIGÊNCIA COMERCIAL ATLAS GR

**Data:** 16 de Agosto de 2026  
**Auditor:** Principal Software Architect, Staff Engineer, Security Lead & QA Lead  
**Método:** Inspeção estática de código + execução real de ferramentas de build, linters e testes + verificação forense do banco de dados, rotas e módulos.

---

## 1. Aplicações e Runtimes

| Aplicação / Componente | Runtime / Tecnologia | Entrypoint | Papel / Responsabilidade | Status Operacional |
|---|---|---|---|---|
| **Frontend Web SPA** | React 19.0.1 + Vite 6.2.3 + TailwindCSS 4 | `src/main.tsx`, `src/App.tsx`, `index.html` | Interface unificada de inteligência comercial, CRM, prospecção e dashboards | ✅ Funcional |
| **Backend API Monolítico** | Node.js (>=20.0.0) + Express 4.21.2 + TypeScript 5.8 | `server.ts` (dist/server.cjs) | API REST central, autenticação, proxy Vite em dev, SSE de notificações, handlers de webhook | ✅ Funcional |
| **Worker Assíncrono Dedicado** | Node.js + BullMQ 6.0.9 + ioredis 5.11 | `worker.ts` (dist/worker.cjs) | Processamento de 13 filas BullMQ, agendamentos cron, deduplicação, scans de estagnação | ✅ Funcional (Build OK, runtime requer Redis) |
| **Mobile App (Android/iOS)** | Capacitor 8.5.0 + Android Studio / Xcode | `capacitor.config.ts`, `android/`, `ios/` | Encapsulamento Webview para dispositivos móveis com suporte a deep link e safe-area | ⚠️ Parcial (Deep link pendente DNS) |
| **Gateway / Proxy de IA** | LiteLLM / Google GenAI / Groq / OpenAI | `litellm-config.yaml`, `src/lib/ai/gateway.ts` | Roteamento multi-provedor com fallback, circuit breaker e controle de cotas | ✅ Funcional (Groq ativo, LiteLLM opcional) |

---

## 2. Inventário de Módulos e Features Frontend (`src/features/` e `src/pages/`)

| # | Módulo | Diretório | Componente Principal | Rota Frontend | Status Real |
|---|---|---|---|---|---|
| 1 | **Dashboard** | `src/features/dashboard/` | `SinglePageDashboard.tsx` | `/app` | ✅ COMPROVADO |
| 2 | **Prospecção** | `src/features/prospecting/` | `ProspectingHub.tsx` | `/app/prospect` | ✅ COMPROVADO |
| 3 | **CRM / Kanban** | `src/components/`, `src/features/crm/` | `CrmBoard.tsx` | `/app/crm` | ✅ COMPROVADO |
| 4 | **Cockpit CRM 360** | `src/features/crm360/` | `CrmOverview.tsx` | `/app/crm360` | ✅ COMPROVADO |
| 5 | **Mesa de Tratamento** | `src/features/mesa-tratamento/` | `MesaTratamento.tsx` | `/app/mesa-tratamento` | ✅ COMPROVADO |
| 6 | **Central de IA (Hub)** | `src/features/intelligence/` | `IntelligenceHub.tsx`, `AISuiteHub.tsx` | `/app/intelligence` | ✅ COMPROVADO |
| 7 | **Empresas** | `src/features/companies/` | `CompanyList.tsx` | `/app/companies` | ✅ COMPROVADO |
| 8 | **Contatos** | `src/features/contacts/` | `ContactList.tsx` | `/app/contacts` | ✅ COMPROVADO |
| 9 | **Atividades** | `src/features/activities/` | `ActivityList.tsx` | `/app/activities` | ✅ COMPROVADO |
| 10 | **Cadência Comercial** | `src/features/cadence/` | `CadenceHub.tsx` | `/app/cadence` | ✅ COMPROVADO (Onda 10) |
| 11 | **Chatbook Comercial** | `src/features/chatbook/` | `ChatbookHub.tsx`, `FloatingChatbook.tsx` | `/app/chatbook` | ✅ COMPROVADO |
| 12 | **Roleplay de Vendas** | `src/features/roleplay/` | `RoleplayHub.tsx` | `/app/roleplay` | ✅ COMPROVADO |
| 13 | **Matriz de Qualificação** | `src/features/playbook/` | `QualificationMatrixPage.tsx` | `/app/qualification_matrix` | ✅ COMPROVADO |
| 14 | **Matriz de Objeções** | `src/features/playbook/` | `ObjectionsMatrixPage.tsx` | `/app/objections_matrix` | ✅ COMPROVADO |
| 15 | **Academia de Treinamento** | `src/features/intelligence/` | `TopicTrainingAcademy.tsx` | `/app/topic_training` | ✅ COMPROVADO |
| 16 | **Guia Bitrix24** | `src/features/intelligence/` | `BitrixGuideHub.tsx` | `/app/bitrix` | ✅ COMPROVADO |
| 17 | **Relatórios e BI** | `src/features/intelligence/` | `ReportsHub.tsx` | `/app/reports` | ✅ COMPROVADO |
| 18 | **Integrações** | `src/features/integrations/` | `Integrations.tsx` | `/app/integrations` | ✅ COMPROVADO |
| 19 | **Base de Conhecimento** | `src/features/knowledge/` | `Base.tsx` | `/app/knowledge` | ✅ COMPROVADO |
| 20 | **Analytics** | `src/features/analytics/` | `Analytics.tsx` | `/app/analytics` | ✅ COMPROVADO |
| 21 | **Win/Loss Analysis** | `src/features/analytics/` | `WinLossAnalysis.tsx` | `/app/winloss` | ✅ COMPROVADO |
| 22 | **Market Intelligence** | `src/pages/` | `MarketIntelligence.tsx` | `/app/market-intelligence` | ✅ COMPROVADO |
| 23 | **Propostas Comerciais** | `src/pages/` | `Propostas.tsx` | `/app/propostas` | ✅ COMPROVADO |
| 24 | **Comercial Inteligente** | `src/features/commercial-intelligence/`| `CommercialIntelligenceHub.tsx`| `/app/commercial_intelligence` | ✅ COMPROVADO (RBAC Gated) |
| 25 | **Calendário Executivo** | `src/features/calendar/` | `Calendar.tsx` | `/app/calendar` | ✅ COMPROVADO |
| 26 | **Notificações** | `src/features/notifications/` | `Notifications.tsx` | `/app/notifications` | ✅ COMPROVADO |
| 27 | **Automações de Vendas** | `src/features/automations/` | `Automations.tsx` | `/app/automations` | ✅ COMPROVADO |
| 28 | **Uso e Faturamento** | `src/features/billing/` | `Billing.tsx` | `/app/usage` | ✅ COMPROVADO |
| 29 | **Editor de Documentos** | `src/features/document-editor/`| `Editor.tsx` | `/app/editor` | ✅ COMPROVADO |
| 30 | **Gestão de Equipe** | `src/features/team/` | `Team.tsx` | `/app/team` | ✅ COMPROVADO (Admin-only) |
| 31 | **Configurações** | `src/features/settings/` | `Settings.tsx` | `/app/settings` | ✅ COMPROVADO |
| 32 | **Onboarding Tour** | `src/features/onboarding/` | `OnboardingTour.tsx` | Modal / Tour | ✅ COMPROVADO |
| 33 | **Autenticação & Seleção** | `src/features/auth/` | `LoginScreen.tsx`, `SelectionScreen.tsx` | `/login`, `/select-brand` | ✅ COMPROVADO |

---

## 3. Inventário de Rotas Backend e APIs (`server.ts`)

| Prefixo de Rota | Arquivo Router | Autenticação | Tenant Isolation | RBAC Guard | Status |
|---|---|---|---|---|---|
| `/api/auth` | `better-auth` handler | Aberta (Pública) | RLS Bypass Restrito | Não | ✅ COMPROVADO |
| `/api/companies` | `company.routes.ts` | `authenticateToken` | `requireTenant` | Graduado (Service) | ✅ COMPROVADO |
| `/api/contacts` | `contact.routes.ts` | `authenticateToken` | `requireTenant` | Graduado (Service) | ✅ COMPROVADO |
| `/api/leads` | `lead.routes.ts` | `authenticateToken` | `requireTenant` | Graduado (Rotas/Service) | ✅ COMPROVADO |
| `/api/crm` | `crm360.routes.ts` | `authenticateToken` | `requireTenant` | Graduado | ✅ COMPROVADO |
| `/api/leads/:leadId/notes` | `note.routes.ts` | `authenticateToken` | `requireTenant` | Por posse/Tenant | ✅ COMPROVADO |
| `/api/activities` | `activity.routes.ts` | `authenticateToken` | `requireTenant` | Por posse/Tenant | ✅ COMPROVADO |
| `/api/mesa-tratamento` | `mesaTratamento.routes.ts` | `authenticateToken` | `requireTenant` | Operacional | ✅ COMPROVADO |
| `/api/prospecting` | `prospecting.routes.ts` | `authenticateToken` | `requireTenant` | Operacional | ✅ COMPROVADO |
| `/api/intelligence` | `intelligence.routes.ts` | `authenticateToken` | `requireTenant` | Limiter dedicado | ✅ COMPROVADO |
| `/api/prompts` | `prompt.routes.ts` | `authenticateToken` | `requireTenant` | ADMIN / GESTOR | ✅ COMPROVADO |
| `/api/analytics` | `analytics.routes.ts` | `authenticateToken` | `requireTenant` | Operacional | ✅ COMPROVADO |
| `/api/commercial-intelligence` | `commercialIntelligence.routes.ts` | `authenticateToken` | `requireTenant` | `COMMERCIAL_INTELLIGENCE_ROLES` | ✅ COMPROVADO |
| `/api/knowledge` | `knowledge.routes.ts` | `authenticateToken` | `requireTenant` | Limiter de IA | ✅ COMPROVADO |
| `/api/lgpd` | `lgpd.routes.ts` | `authenticateToken` | `requireTenant` | ADMIN/GESTOR (exclusão) | ✅ COMPROVADO |
| `/api/feature-flags` | `featureFlags.routes.ts` | `authenticateToken` | `requireTenant` | ADMIN para mutação | ✅ COMPROVADO |
| `/api/bug-reports` | `bugReport.routes.ts` | `authenticateToken` | `requireTenant` | Limiter por Tenant | ✅ COMPROVADO |
| `/api/notifications` | `notification.routes.ts` | `authenticateToken` | `requireTenant` | Por posse/Tenant | ✅ COMPROVADO |
| `/api/notifications/stream` | `sseService.ts` | `authenticateToken` | `requireTenant` | SSE isolado | ✅ COMPROVADO |
| `/api/automations` | `automation.routes.ts` | `authenticateToken` | `requireTenant` | ADMIN/GESTOR | ✅ COMPROVADO |
| `/api/usage` | `usage.routes.ts` | `authenticateToken` | `requireTenant` | Por Tenant | ✅ COMPROVADO |
| `/api/whatsapp` | `whatsapp.routes.ts` | `authenticateToken` | `requireTenant` | Operacional | ✅ COMPROVADO |
| `/api/integrations/birth-voice` | `birthVoice.routes.ts` | `authenticateToken` | `requireTenant` | Operacional | ✅ COMPROVADO |
| `/api/integrations/3cx` | `threecx.routes.ts` | `authenticateToken` | `requireTenant` | ADMIN/GESTOR | ✅ COMPROVADO |
| `/api/google` | `google.routes.ts` | `authenticateToken` | `requireTenant` | Operacional | ✅ COMPROVADO |
| `/api/bitrix` | `bitrix.routes.ts` | `authenticateToken` | `requireTenant` | ADMIN/GESTOR | ✅ COMPROVADO |
| `/api/team` | `team.routes.ts` | `authenticateToken` | `requireTenant` | ADMIN | ✅ COMPROVADO |
| `/api/agent` | `agent.routes.ts` | `authenticateToken` | `requireTenant` | Operacional | ✅ COMPROVADO |
| `/api/cadence` | `cadence.routes.ts` | `authenticateToken` | `requireTenant` | Operacional | ✅ COMPROVADO |
| `/admin/queues` | `BullBoard ExpressAdapter` | `authenticateToken` | `requireTenant` | `ADMIN` exclusivo | ✅ COMPROVADO |
| `/api/webhooks/voice-result` | `voiceResult.webhook.ts` | Assinatura / Token | RLS escopado | N/A (Webhook externo) | ✅ COMPROVADO |
| `/api/integrations/bitrix` | `bitrix.webhook.ts` | Auth Application Token | RLS por Conexão | N/A (Webhook externo) | ✅ COMPROVADO |
| `/api/integrations/birth-voice/webhook`| `birthVoice.webhook.ts` | Assinatura HMAC | RLS por Conexão | N/A (Webhook externo) | ✅ COMPROVADO |
| `/api/integrations/3cx/webhook` | `threecx.routes.ts` | Token em tempo constante | RLS por Conexão | N/A (Webhook externo) | ✅ COMPROVADO |

---

## 4. Inventário de Modelos de Banco de Dados (`prisma/schema.prisma`)

**Total de Modelos Identificados:** 53 modelos mapeados com Row-Level Security (RLS) e índices.

1. `Company` (Empresas B2B, CNPJ, dados de enriquecimento e score)
2. `EnrichmentLog` (Log de proveniência de dados e fontes externas)
3. `Contact` (Contatos, telefones criptografados, validação de e-mail)
4. `Lead` (Entidade central do funil, status, temperaturas, campos Bitrix)
5. `Activity` (Tarefas, ligações, e-mails, reuniões)
6. `TimelineEvent` (Linha do tempo de interações)
7. `Note` (Anotações internas de SDRs e Closers)
8. `AuditLog` (Auditoria de mutações para conformidade LGPD)
9. `User` (Usuários, papéis, autenticação)
10. `Organization` (Tenants, marcas AtlasGR e TotalTrac)
11. `CommercialGoal` (Metas comerciais por equipe/mês)
12. `LeadStageHistory` (Histórico de transições de status para cálculo de TMQ)
13. `ProspectRejection` (Motivos de descarte e perda)
14. `CrmPipeline` (Pipelines de CRM customizáveis)
15. `CrmPipelineStage` (Estágios dos pipelines)
16. `CrmProduct` (Catálogo de produtos e serviços)
17. `CrmDealItem` (Itens vinculados a negociações)
18. `CrmCommercialDocument` (Documentos, orçamentos e contratos)
19. `KnowledgeChunk` (Chunks legados para busca)
20. `Session` (Sessões do Better Auth)
21. `Account` (Contas de autenticação social)
22. `Verification` (Tokens de verificação e reset)
23. `Prompt` (Registro central de prompts de IA)
24. `Document` (Documentos da base de conhecimento RAG)
25. `DocumentChunk` (Fragmentos vetorizados com pgvector)
26. `AgentMemory` (Memória de longo prazo dos agentes autônomos)
27. `AILog` (Registro de consumo, tokens e custos de IA)
28. `Report` (Relatórios analíticos persistidos)
29. `Notification` (Notificações do sistema)
30. `Automation` (Regras de automação comercial)
31. `CallSuppression` (Controle de supressão de chamadas e não-perturbe)
32. `WhatsAppMessage` (Mensagens trocadas via Baileys)
33. `ConversationSignal` (Sinais de engajamento detectados por IA)
34. `GoogleWorkspaceConnection` (OAuth Google Calendar/Gmail)
35. `BitrixConnection` (Conexões de webhooks com Bitrix24)
36. `BitrixSyncRule` (Regras de sincronização automática)
37. `BitrixSyncLog` (Logs de execução de sync)
38. `BitrixExtractionRun` (Histórico de extrações massivas do Bitrix)
39. `ThreeCXConnection` (Credenciais PABX 3CX criptografadas)
40. `OptOutRecord` (Registro unificado de opt-out LGPD)
41. `ColdCallRun` (Campanhas de ligações frias automáticas)
42. `AIGovernancePolicy` (Políticas de moderação e governança)
43. `AIEvaluation` (Avaliações de qualidade de outputs de IA)
44. `AIPendingAction` (Fila de ações que exigem aprovação humana)
45. `AiEngineSetting` (Configurações de modelos por tenant)
46. `Prospect` (Entidade temporária de descoberta de leads)
47. `FeatureFlag` (Catálogo de flags globais)
48. `OrganizationFeatureFlag` (Overrides por organização)
49. `BugReport` (Relatos de bugs sanitizados)
50. `CadenceSequence` (Sequências de toques da cadência)
51. `CadenceRun` (Instâncias de execução de cadência por lead)
52. `CadenceTouchAttempt` (Tentativas reais de contato multicanal)
53. `EmailMessage` (Mensagens de e-mail rastreadas)
54. `CadenceCalendarEvent` (Reuniões agendadas com confirmação verificável)
55. `CrmCommercialDocumentVersion` (Snapshot imutável de propostas)
56. `CrmDocumentSignatureRequest` (Solicitação de assinatura gov.br)
57. `DealClosureEvent` (Ledger append-only de fechamento determinístico)

---

## 5. Filas BullMQ e Jobs em Background

| Nome da Fila | Worker | Agendamento Cron | Propósito |
|---|---|---|---|
| `leads` | `leads.worker.ts` | Sob demanda | Criação e enriquecimento assíncrono de leads |
| `search` | `search.queue.ts` | Sob demanda | Indexação em tempo real no Meilisearch |
| `agent` | `agent.worker.ts` | Sob demanda | Execução de agentes autônomos (SDR, Closer, Supervisor) |
| `enrichment` | `enrichment.queue.ts` | Sob demanda | Cascata de provedores (BrasilAPI, Google, Apollo, Hunter) |
| `whatsapp-signal` | `whatsappSignal.worker.ts` | Sob demanda | Detecção de sentimento e sinais em mensagens de WhatsApp |
| `bitrix-sync` | `bitrixSync.worker.ts` | `*/15 * * * *` (15 min) | Sincronização bidirecional de leads/deals com Bitrix24 |
| `follow-up` | `followUp.worker.ts` | `0 8 * * *` (Diário 08:00) | Verificação de leads sem interação e alertas de follow-up |
| `executive-summary` | `dailyExecutiveSummary.worker.ts` | `0 7 * * *` (Diário 07:00) | Compilação do resumo diário para gestores |
| `deduplication` | `deduplication.worker.ts` | `0 2 * * 0` (Semanal dom) | Varredura de leads e empresas duplicadas |
| `win-loss` | `winLossAnalysis.worker.ts` | `0 1 * * *` (Diário 01:00) | Extração de motivos de ganho e perda de negócios |
| `weekly-pdf` | `weeklyPdfReport.worker.ts` | `0 6 * * 1` (Segunda 06:00) | Geração de relatórios executivos em PDF |
| `auto-anonymize` | `autoAnonymizeDisqualified.worker.ts` | `0 3 * * *` (Diário 03:00) | Anonimização LGPD de leads desqualificados > 90 dias |
| `cold-call` | `coldCall.worker.ts` | Horário comercial | Disparos de ligações ativas via Bland AI / Birth Voices |
| `swarm-scheduler` | `swarmScheduler.worker.ts` | `*/10 * * * *` (10 min) | Orquestração do enxame autônomo de SDRs de IA |

---

## 6. Provedores Externos e Integrações

| Provedor | Tipo | Autenticação / Protocolo | Status Atual no Repositório |
|---|---|---|---|
| **Bitrix24** | CRM Externo | Webhook REST + HMAC Token | ✅ Ativo e Testado (`atlasgr.bitrix24.com.br`) |
| **Apollo.io** | Enriquecimento B2B | API Key via Header | ✅ Ativo e Testado (60 buscas válidas) |
| **Google Places** | Enriquecimento Local | API Key REST | ✅ Ativo e Testado |
| **Hunter.io** | Enriquecimento E-mail | API Key REST | ✅ Ativo e Testado |
| **BrasilAPI / CNPJ.ws** | Dados Cadastrais CNPJ | REST Público | ✅ Ativo e Testado |
| **Groq (Llama 3.3)** | Modelo de IA Principal | API Key REST | ✅ Ativo e Testado |
| **Bland AI / Birth Voice** | Telefonia de IA | API Key + Webhook HMAC | ✅ Ativo e Testado (call suppression integrado) |
| **3CX PABX** | Telefonia VoIP | Webhook HMAC + Basic Auth | ✅ Ativo e Testado (persistência em banco) |
| **WhatsApp (Baileys)** | Mensageria | Socket WebSocket local | ⚠️ Ativo no servidor HTTP (planejado isolar) |
| **Google Workspace** | Calendário / E-mail | OAuth2 + HMAC State | ✅ Ativo e Testado |
| **Meilisearch** | Busca Full-Text | HTTP REST + Master Key | ✅ Ativo (gated por `ENABLE_SEARCH`) |
| **Gov.br** | Assinatura Eletrônica | REST OAuth / Webhook | ⚠️ Schema e Portas prontos; integração real em aberto |
