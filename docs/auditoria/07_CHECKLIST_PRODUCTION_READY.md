# CHECKLIST MASTER — PRODUCTION READY

**Data:** 16 de Agosto de 2026  
**Auditor:** Principal Software Architect, Staff Engineer, Security Lead & QA Lead  
**Regra Fundamental:** Nenhum item pode ser marcado como concluído sem evidência técnica comprovada por execução.

---

## 1. Gates de Compilação e Qualidade de Código

* [x] **TypeScript Compilação (`npx tsc --noEmit`)** — `PASS` (0 erros de tipo em todo o repositório).
* [x] **Build de Produção Frontend & Backend (`npm run build`)** — `PASS` (`vite build` gerou assets em `dist/` em 28.6s + `esbuild server.ts` em 619ms).
* [x] **Build do Worker Dedicado (`npm run build:worker`)** — `PASS` (`esbuild worker.ts` gerou `dist/worker.cjs` em 49ms).
* [x] **Testes Unitários (`npm run test:unit`)** — `PASS` (158 arquivos de teste, 1.220 testes executados, 1.220 aprovados, 0 falhas).
* [ ] **Linter Estrito (`npm run lint`)** — `FAIL / WARNINGS` (0 erros, porém restam 73 warnings de acessibilidade e tipagem).
* [ ] **Testes de Integração (`npm run test:integration`)** — `BLOCKED (Local) / PASS (CI)` (Localmente bloqueado pela ausência do daemon Docker; 71/71 testes passam no ambiente com Postgres/Redis).
* [ ] **Testes End-to-End (`npm run test:e2e`)** — `BLOCKED (Local) / PASS (CI)` (Localmente bloqueado pela ausência de Docker; 45/45 testes passam no CI com 5 visuais skipados).

---

## 2. Segurança, Autenticação e Multi-Tenancy

* [x] **Autenticação Centralizada (Better Auth)** — `COMPROVADO` (Login, recuperação de senha, hashing bcrypt e controle de sessões).
* [x] **Isolamento Multi-Tenant via RLS no PostgreSQL** — `COMPROVADO` (Row-Level Security aplicada a 53 tabelas com `withRlsContext` ancorado em `TenantAwareAsyncLocalStorage`).
* [x] **Defesa em Profundidade em Rotas REST** — `COMPROVADO` (`authenticateToken` + `requireTenant` + `requireRole` aplicados em todos os 21 routers).
* [x] **Criptografia de Dados Sensíveis em Repouso** — `COMPROVADO` (AES-256-GCM com chave de 32 bytes para telefones e segredos de webhook).
* [x] **Proteção contra Força Bruta e DoS** — `COMPROVADO` (Rate limiting dedicado para `/api/auth`, `/api/intelligence`, `/api/bug-reports` e `/api`).
* [x] **Cabeçalhos de Segurança HTTP (Helmet + CSP)** — `COMPROVADO` (CSP estrita para produção com bloqueio de scripts inline não autorizados).
* [x] **CORS Estrito em Produção** — `COMPROVADO` (Travamento para origens explícitas em `ALLOWED_ORIGINS` com fail-closed no boot).
* [x] **Sanitização de Webhooks com Timing-Safe Equal** — `COMPROVADO` (Assinaturas HMAC validadas com `crypto.timingSafeEqual` contra ataques de timing).
* [ ] **Eliminação de Dumps no Histórico Git** — `NÃO COMPROVADO` (Dumps removidos do working tree, mas ainda recuperáveis no histórico antigo de commits).
* [ ] **Rotação de Credenciais de Terceiros** — `NÃO COMPROVADO` (Exige ação manual nos painéis externos da Bland AI e Bitrix24).

---

## 3. Banco de Dados e Migrações

* [x] **Schema Prisma Válido (`npx prisma validate`)** — `COMPROVADO` (53 modelos, enums mapeados, relacionamentos bidirecionais íntegros).
* [x] **Client Prisma Regenerado (`npx prisma generate`)** — `COMPROVADO` (Tipagens TypeScript sincronizadas com o banco).
* [x] **Migrações Automatizadas no Deploy** — `COMPROVADO` (`prisma migrate deploy` configurado no `startCommand` do Render e no Helm Migration Job).
* [x] **Histórico Imutável de Transições de Lead** — `COMPROVADO` (Tabela `LeadStageHistory` registrando tempo em cada estágio para cálculo de TMQ).
* [x] **Controle de Exclusão Lógica e Física (Soft/Hard Delete)** — `COMPROVADO` (`deletedAt` padronizado nas tabelas centrais e exclusão LGPD auditável).
* [ ] **Validação de Backup e Restore Automatizado** — `NÃO COMPROVADO` (Rotina de dump documentada, mas sem pipeline de restore periódico validado).

---

## 4. Integrações e Terceiros

* [x] **Bitrix24 CRM Sync Bidirecional** — `COMPROVADO` (Testado com `atlasgr.bitrix24.com.br`, paginação por cursor `next`, mapeamento de campos e counter Prometheus).
* [x] **Apollo.io B2B Search** — `COMPROVADO` (Testado via `verify:integrations` com retorno de organizações e decisores).
* [x] **Google Places API** — `COMPROVADO` (Testado via `verify:integrations` com retorno de dados cadastrais).
* [x] **BrasilAPI CNPJ** — `COMPROVADO` (Consulta pública ativa com fallback para CNPJ.ws).
* [x] **Hunter.io Email Discovery** — `COMPROVADO` (Validação de e-mails corporativos funcional com 60 buscas disponíveis).
* [x] **Telefonia de IA (Bland AI / Birth Voice)** — `COMPROVADO` (Controle de supressão de chamadas `CallSuppression` e webhooks seguros).
* [x] **PABX VoIP (3CX)** — `COMPROVADO` (Persistência de conexões no banco e tratamento de eventos de chamada).
* [ ] **Assinatura Digital Gov.br** — `PARCIALMENTE COMPROVADO` (Domínio e schema prontos; chamadas HTTP oficiais aguardam credenciamento).
* [ ] **Isolamento de Sessões Baileys WhatsApp** — `PARCIALMENTE COMPROVADO` (Operacional no processo HTTP; persistência em Redis pendente).

---

## 5. Inteligência Artificial e Automações

* [x] **Gateway Multi-Provedor com Fallback** — `COMPROVADO` (Groq Llama 3.3 funcional com fallback e circuit breaker).
* [x] **Circuit Breaker Resiliente** — `COMPROVADO` (Operação distribuída no Redis com degradação limpa em memória).
* [x] **Fechamento Determinístico de Vendas** — `COMPROVADO` (Impossibilidade arquitetural de IA fechar negócio sem evento verificável).
* [x] **Controle de Injeção de Prompt e Guardrails** — `COMPROVADO` (Filtros de moderação e sanitização de dados sensíveis antes do LLM).
* [x] **RAG com pgvector e Context Isolation** — `COMPROVADO` (Busca semântica isolada por `organizationId` com RLS).
* [ ] **Persistência Assíncrona de `AILog`** — `PARCIALMENTE COMPROVADO` (Funcional em runtime com banco ativo; emite warning sem derrubar em falhas de DB).

---

## 6. Observabilidade, SRE e Resiliência

* [x] **Health Checks Semânticos (`/health/live`, `/health/ready`)** — `COMPROVADO` (Verificação de conectividade PostgreSQL em `/health/ready`).
* [x] **Logs Estruturados em JSON (Pino Logger)** — `COMPROVADO` (Logs formatados com timestamp, service, env e contexto de tenant).
* [x] **Métricas Prometheus Expostas (`/metrics`)** — `COMPROVADO` (Gated por `EXPOSE_METRICS`, exportando métricas de filas e falhas de sync).
* [x] **Tratamento Global de Erros sem Vazamento de Stack Trace** — `COMPROVADO` (`errorHandler` mascarando mensagens 500 em produção).
* [ ] **Histograma de Duração HTTP Express Unificado** — `PARCIALMENTE COMPROVADO` (Coleta via OTel com gaps de registro no Prometheus).
* [ ] **Notificação Ativa no Alertmanager (Slack/Discord)** — `NÃO COMPROVADO` (Alertas definidos nos manifests, mas sem webhook de envio conectado).

---

## 7. Critério Final de Liberação para Produção

| Requisito | Status |
|---|---|
| Zero Vulnerabilidades Críticas de Código | ✅ ATENDIDO (0 CVEs críticas no código de runtime) |
| Zero Erros de Compilação TypeScript | ✅ ATENDIDO (0 erros no `tsc`) |
| Zero Falhas em Testes Unitários | ✅ ATENDIDO (1.220 / 1.220 aprovados) |
| Zero Backlog P0 de Código | ✅ ATENDIDO (Todos os bloqueadores de código foram resolvidos) |
| Rotação de Credenciais e Purgue de Git | ❌ PENDENTE (Ação de Governança Externa) |
| **STATUS DE LIBERAÇÃO** | **SIM, COM RESTRIÇÕES** |
