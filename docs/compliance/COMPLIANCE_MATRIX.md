# Matriz de Conformidade B2B (Compliance Matrix)

> **⚠️ DOC-001 (auditoria de dívida técnica) — NÃO TOMAR ESTE DOCUMENTO COMO ESTADO ATUAL.**
> Este documento é um retrato histórico e está desatualizado em várias seções, não só na 1.
> Auditoria de 27/08/2026 confirmou pelo menos mais duas linhas específicas que não refletem
> mais o código real:
>
> - **Seção 1 (IA e Automação):** escrita antes da introdução real de RAG/pgvector e da
>   orquestração multi-agente (`SwarmOrchestrator`, `supervisor.agent.ts`,
>   `sdrQualification.agent.ts` em `src/features/intelligence/`).
> - **Seção 3, linha "Auditoria e LGPD" (marcada ❌ Ausente):** desatualizada. `AuditLog` hoje
>   tem `FORCE ROW LEVEL SECURITY` de tenant (ver migration
>   `20260825120000_scope_rls_bypass_to_bootstrap_allowlist` e `src/lib/security/auditLog.middleware.ts`),
>   e há chamadas reais a `AuditService.log` em múltiplos pontos do domínio (CRM, integrações
>   Bitrix) — não é mais "modelo existe mas nada grava automaticamente".
> - **Seção 3, linha "Proteção de Rede" (implícito "sem gestão de Secrets profunda"):**
>   desatualizado quanto a credenciais de integrações — `src/lib/crypto/secretFields.ts`
>   implementa cifra autenticada AES-256-GCM em repouso para credenciais antes gravadas em texto
>   puro (ex.: tokens do Google Workspace, webhook do Bitrix).
>
> Nenhuma linha desta matriz — inclusive as marcadas ✅ nas seções 2, 4 e 5 — deve ser citada
> como prova de conformidade atual sem reverificação; este documento não foi mantido em
> sincronia com o código desde sua escrita original. Para o estado real e verificado, ver, em
> ordem de preferência: `docs/auditoria-divida-tecnica/` (mais recente), `.claude/PILOTS.md`,
> `/AGENTS.md` (seção "LGPD e dados pessoais" e "Bloqueadores prioritários"), e os handoffs em
> `.agents/handoffs/**` do domínio específico (01/01A para dados/RLS/retenção, 15 para segurança
> aplicada).

## 1. IA e Automação (AI & Automation)
| Componente | Status | Ferramenta Atual | Gargalos / Dívida Técnica | Próximo Passo Enterprise |
| --- | --- | --- | --- | --- |
| LLM Gateway | ✅ Parcial | LiteLLM (`src/lib/ai/gateway.ts`) | URL mockada local, sem resiliência configurada, apenas chave hardcoded | Implementar retry robusto e failover no gateway |
| Agentes Múltiplos | ✅ Implementado (desde então) | LangGraph (`src/features/intelligence/agents/`: `supervisor.agent.ts`, `sdrQualification.agent.ts`, `base.agent.ts`) | Ver `docs/auditoria-divida-tecnica/` para gargalos atuais (ex.: IA-006, PII sem minimização) | — |
| RAG & Vetorização | ✅ Implementado (desde então) | pgvector (`KnowledgeChunk`/`DocumentChunk` em `prisma/schema.prisma`, isolado por tenant desde DB-001) | Ver `docs/auditoria-divida-tecnica/` para gargalos atuais | — |
| Tool Calling | ⚠️ Não reverificado nesta atualização | N/A | Não confirmado neste ciclo de correção — validar antes de confiar nesta linha | — |

## 2. Dados e Buscas (Data & Search)
| Componente | Status | Ferramenta Atual | Gargalos / Dívida Técnica | Próximo Passo Enterprise |
| --- | --- | --- | --- | --- |
| Banco de Dados Relacional | ✅ Sim | PostgreSQL + Prisma | FKs complexas acoplaram models na v1. Precisa de granularidade e índices | Refinar índices Prisma e adicionar pgvector |
| Cache & Fila | ✅ Parcial | Redis + BullMQ | Usado apenas em `queue/index.ts` (Workers) de forma incipiente | Expandir para Dead Letter Queues e Rate Limiting global |
| Search Engine | ✅ Parcial | Meilisearch | Estrutura declarada mas integração com Prisma é assíncrona/frágil no setup atual | Sincronizar Prisma Middleware com MeiliSearch |

## 3. Segurança e Acesso (Security & Access)
| Componente | Status | Ferramenta Atual | Gargalos / Dívida Técnica | Próximo Passo Enterprise |
| --- | --- | --- | --- | --- |
| Autenticação Core | ✅ Sim | Better-Auth + JWT | Falta MFA/2FA, RBAC e ABAC estruturados. | Implementar 2FA/SSO Enterprise via Better-Auth |
| Proteção de Rede | ✅ Sim | Helmet, Rate Limit | Básico, sem WAF ou gestão de Secrets profunda (Vault) | Adicionar configuração CSP estrita e Integração Vault |
| Auditoria e LGPD | ❌ Ausente | Prisma (AuditLog model) | Modelo `AuditLog` existe no Prisma mas middlewares globais não registram as mutações de forma automática | Implementar Prisma Extension para Audit Logs (LGPD) |

## 4. Observabilidade (Observability)
| Componente | Status | Ferramenta Atual | Gargalos / Dívida Técnica | Próximo Passo Enterprise |
| --- | --- | --- | --- | --- |
| Tracing & Logs | ✅ Parcial | OpenTelemetry (`tracing.ts`) | Exportador vai para o `ConsoleSpanExporter` | Trocar para OTLP Exporter para Jaeger/Prometheus/Grafana |
| Health Checks | ✅ Sim | Express endpoints | Básico (`/health/live`, `/health/ready`) | Evoluir para métricas detalhadas (Prometheus metrics endpoint) |

## 5. Qualidade do Código (Quality & Architecture)
| Componente | Status | Ferramenta Atual | Gargalos / Dívida Técnica | Próximo Passo Enterprise |
| --- | --- | --- | --- | --- |
| Tipagem e Linting | ✅ Sim | TypeScript, ESLint | 46 warnings (uso de `any`, vars não usadas). Acoplamentos no domínio | Remover dívidas de `any` em components e middlewares |
| Cobertura de Testes | ❌ Falho | Vitest, Playwright | Unitário (~11%), Integração (~4%), E2E (Apenas 1 teste de rota) | Escrever testes obrigatórios para core features com mocks reais |
| Pipeline CI/CD | ✅ Sim | Github Actions | Testes isolados com banco local OK | Adicionar gates de cobertura de teste no CI (Codecov) |
