# GAPS DE IMPLEMENTAÇÃO — CENTRAL DE INTELIGÊNCIA COMERCIAL ATLAS GR

**Data:** 16 de Agosto de 2026  
**Auditor:** Principal Software Architect, Staff Engineer & Product Auditor  

---

## 1. Classificação Geral de Lacunas

Este documento registra de forma granular o que **não foi construído**, o que está **incompleto**, o que é **débito de refatoração** e o que são **ações operacionais pendentes**, sem misturar bugs com requisitos ausentes.

---

## 2. Lacunas por Categoria

### A. A IMPLEMENTAR (Novas Funcionalidades / Expansões Planejadas)

| Item | Domínio | Descrição da Lacuna | Prioridade | Esforço |
|---|---|---|---|---|
| **GAP-IMP-01** | Integração Gov.br | Adaptador REST oficial para emissão de solicitações de assinatura e recebimento de webhooks de assinatura de propostas comerciais. | P1 | L |
| **GAP-IMP-02** | Auto-atendimento LGPD | Interface self-service para o titular solicitar exclusão/portabilidade sem intervenção de administrador via API/script. | P2 | M |
| **GAP-IMP-03** | Command Palette Global | Implementação interativa do atalho `⌘K` / `Ctrl+K` para busca universal rápida (Leads, Empresas, Ações e Rotas). | P2 | M |
| **GAP-IMP-04** | Painel de Billing com Gateway | Conexão do consumo de cotas de IA e storage com gateway de cobrança (ex.: Asaas, Stripe, Iugu) para faturamento real. | P3 | L |
| **GAP-IMP-05** | Integração Nativa Outlook / Office 365 | Sincronização de calendário e envio de e-mails para ambientes corporativos Microsoft (além do Google Workspace). | P3 | L |
| **GAP-IMP-06** | White-label e Domínio Customizado | Suporte para que clientes corporativos acessem sob subdomínio próprio com customização dinâmica de paleta. | P3 | XL |

---

### B. INCOMPLETO (Funcionalidades Iniciadas com Etapas Finais Pendentes)

| Item | Domínio | O que está feito | O que falta concluir | Prioridade |
|---|---|---|---|---|
| **GAP-INC-01** | Cadência Comercial (Toques 3 a 5) | Schema, máquinas de estado, opt-out unificado, testes unitários, CadenceHub UI. | Conexão com cron de disparo periódico e adaptador de e-mail inbound (IMAP/Webhook) para reply-tracking em produção. | P1 |
| **GAP-INC-02** | Deep Links Mobile | Configuração no Capacitor, tratamento no NavigationBus e rotas preparadas. | Publicação do `assetlinks.json` e certificado de domínio em produção. | P2 |
| **GAP-INC-03** | Gamificação de Vendas | Componentes de pontuação e ranking na interface (UX/UI). | Persistência do XP do usuário em banco (atualmente é estado em memória por decisão registrada). | P3 |
| **GAP-INC-04** | Extrações Massivas Bitrix | Schema `BitrixExtractionRun`, worker de expiração (90 dias), paginação por cursor. | Interface visual dedicada para disparo de extrações assíncronas em lote na UI. | P2 |

---

### C. REFATORAÇÃO & ARQUITETURA

| Item | Domínio | Situação Atual | Arquitetura Alvo | Prioridade |
|---|---|---|---|---|
| **GAP-REF-01** | Isolamento de Workers | `server.ts` e `worker.ts` contêm o setup dos mesmos workers BullMQ. | `server.ts` puramente HTTP/SSE; `worker.ts` como serviço independente no Render/K8s. | P1 |
| **GAP-REF-02** | God Services Legados | `enrichment.service.ts` e `bitrix.service.ts` concentram regras e persistência. | Desacoplamento completo em UseCases, Repositories e Domain Adapters. | P2 |
| **GAP-REF-03** | Sessões Baileys WhatsApp | Conexões mantidas no processo HTTP. | Microsserviço de mensageria isolado com persistência de auth state no Redis. | P2 |
| **GAP-REF-04** | Consolidação de RAG | Coexistência residual dos models `Document`/`DocumentChunk` com `KnowledgeChunk`. | Remoção definitiva dos models e tabelas legadas sem uso após migração. | P3 |

---

### D. SEGURANÇA & GOVERNANÇA

| Item | Domínio | Ação Necessária | Prioridade |
|---|---|---|---|
| **GAP-SEC-01** | Higienização do Histórico Git | Remoção definitiva dos arquivos `backups/*.dump` do histórico do repositório via `git filter-repo`. | P0 |
| **GAP-SEC-02** | Rotação de Credenciais Externas | Rotação nos provedores Bland AI e Bitrix24 dos webhooks que estiveram expostos no passado. | P1 |
| **GAP-SEC-03** | Auditoria Periódica de Secrets | Configuração de scanner contínuo (Gitleaks / TruffleHog) em todas as branches no GitHub Actions. | P1 |

---

### E. QUALIDADE & TESTES

| Item | Domínio | Lacuna Identificada | Prioridade |
|---|---|---|---|
| **GAP-QA-01** | Suíte de Integração no CI | Garantir que o pipeline de CI do GitHub Actions execute os 71 testes de integração contra Postgres e Redis em todo PR. | P1 |
| **GAP-QA-02** | Baselines Visuais Linux E2E | Regenerar os snapshots de Playwright no ambiente Linux do CI para eliminar os 5 testes skipados. | P2 |
| **GAP-QA-03** | Zero Warnings no Linter | Corrigir os 73 warnings restantes do ESLint (`jsx-a11y` e `any`). | P2 |

---

### F. INFRAESTRUTURA & OBSERVABILIDADE

| Item | Domínio | Lacuna Identificada | Prioridade |
|---|---|---|---|
| **GAP-INF-01** | Unificação de Métricas Express | Corrigir o histograma de latência HTTP (`http_server_duration`) no Prometheus. | P2 |
| **GAP-INF-02** | Dashboard Grafana para Workers | Criar dashboard específico para monitorar taxas de processamento, retries e latência das 14 filas BullMQ. | P2 |
| **GAP-INF-03** | Configuração do Alertmanager | Conectar os alertas de erro 5xx e falha de sync do Bitrix a canais de notificação (Slack/Discord/Telegram). | P2 |
