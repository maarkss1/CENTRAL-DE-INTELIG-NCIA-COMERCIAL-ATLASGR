# Matriz de Conformidade B2B (Compliance Matrix)

> **DOC-001 (auditoria de dívida técnica):** este documento é um retrato histórico e está
> desatualizado desde então — em especial a seção 1 (IA e Automação), escrita antes da
> introdução real de RAG/pgvector e da orquestração multi-agente (`SwarmOrchestrator`,
> `supervisor.agent.ts`, `sdr.agent.ts` em `src/features/intelligence/`). Para o status atual e
> verificado, ver `docs/auditoria-divida-tecnica/` (mais recente) em vez desta matriz.

## 1. IA e Automação (AI & Automation)
| Componente | Status | Ferramenta Atual | Gargalos / Dívida Técnica | Próximo Passo Enterprise |
| --- | --- | --- | --- | --- |
| LLM Gateway | ✅ Parcial | LiteLLM (`src/lib/ai/gateway.ts`) | URL mockada local, sem resiliência configurada, apenas chave hardcoded | Implementar retry robusto e failover no gateway |
| Agentes Múltiplos | ✅ Implementado (desde então) | LangGraph (`src/features/intelligence/agents/`: `supervisor.agent.ts`, `sdr.agent.ts`, `base.agent.ts`) | Ver `docs/auditoria-divida-tecnica/` para gargalos atuais (ex.: IA-006, PII sem minimização) | — |
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
