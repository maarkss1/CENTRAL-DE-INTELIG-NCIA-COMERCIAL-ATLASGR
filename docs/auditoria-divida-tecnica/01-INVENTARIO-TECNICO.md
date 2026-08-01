# Inventário Técnico

## 1. Mapa de Tecnologias

| Camada | Tecnologia | Responsabilidade | Localização | Estado |
|---|---|---|---|---|
| Frontend | React 19 + TypeScript + Vite 6 | UI/SPA | `src/` (356 arquivos) | Ativo, maduro |
| Estilo | Tailwind CSS 4 + tailwind-merge/CVA | Design system | `src/components/ui`, `tailwind.config` | Ativo |
| Roteamento | react-router-dom v7 | Navegação SPA | `src/App.tsx` | Ativo, lazy-loading consistente |
| Estado | Context API (Auth/Brand/Theme) + hooks locais | Estado global/local | `src/contexts`, `src/hooks/useDatabase.ts` | Ativo (Redux/Zustand cogitados no passado, não presentes no `package.json` atual) |
| Formulários | react-hook-form + zod + @hookform/resolvers (instalados) | Validação de formulários | — | **Instalado mas não utilizado** nos formulários reais (`CompanyForm`, `ContactForm` usam `useState` manual) |
| Backend | Node 20+ / Express 4 | API REST | `server.ts` (234 linhas) + `src/features/*/routes` | Ativo |
| ORM | Prisma 7.8 + `@prisma/adapter-pg` | Acesso a dados | `prisma/schema.prisma` (493 linhas), `src/features/*/infra` | Ativo, com Row Level Security parcial |
| Banco de dados | PostgreSQL 16 + pgvector | Persistência + embeddings | `docker-compose.yml`, `prisma/migrations/` (12 migrations) | Ativo |
| Cache/Filas | Redis (ioredis) + BullMQ + bull-board | Filas assíncronas, rate limit distribuído | `src/lib/queue/*`, `server.ts` | Ativo, parcialmente instrumentado |
| Busca | Meilisearch | Índice de busca full-text | `src/lib/search/index.ts` | Ativo, mas flag `ENABLE_SEARCH` é "dead config" (inicialização sempre roda) |
| Autenticação | better-auth 1.6.23 + bcrypt + jsonwebtoken (declarado, não usado) | Sessão/login | `src/lib/auth.ts`, `src/contexts/AuthContext.tsx` | **Comprometida** — ver `08-PLANO-DE-SEGURANCA.md` |
| IA/LLM | LiteLLM (proxy), @langchain/core + langgraph + openai, @google/genai | Orquestração de agentes, chat, qualificação de leads | `src/lib/ai/gateway.ts`, `src/features/intelligence/agents/*`, `litellm-config.yaml` | Ativo, arquitetura sofisticada (Swarm multi-agente) com bugs pontuais |
| Observabilidade | Pino + pino-loki, OpenTelemetry (sdk-node), Prometheus (prom-client) | Logs, tracing, métricas | `src/lib/tracing.ts`, `src/shared/middlewares/observability.ts`, `prometheus.yml` | Ativo e genuíno (não é dependência morta) |
| Object Storage | AWS SDK S3 (client + presigner) | Upload de arquivos | `src/lib/storage/index.ts` | Presente, sem rotas que o utilizem hoje (fallback de credenciais MinIO hardcoded como debt latente) |
| Integrações externas | Google (OAuth/Places), WhatsApp (Baileys, RC), Apollo.io, Hunter.io, BrasilAPI, CNPJ.ws, Bitrix24 | Prospecção/enriquecimento/CRM externo | `src/features/integrations/*`, `src/lib/adapters/*` | Qualidade desigual — ver seção 3 |
| Containerização | Docker (multi-stage, `node:22-slim`) | Empacotamento | `Dockerfile` | Funcional, sem prune de devDependencies |
| Orquestração | Kubernetes (manifests raw) + Helm chart + Argo Rollouts (Blue-Green) | Deploy | `k8s/`, `charts/prospector-atlas/` | Duplicado/conflitante entre manifests raw e Helm (ver `01`→`07`) |
| GitOps | ArgoCD | Sincronização de deploy (homolog) | `argocd/`, `k8s/argocd-app-homolog.yaml` | Dois `Application` conflitantes; sem produção representada |
| CI/CD | GitHub Actions (5 workflows) | Build/test/deploy | `.github/workflows/*` | Cobertura desigual — `ci.yml` robusto, `production.yaml` sem teste real |
| Qualidade estática | ESLint 9 (flat config) + Prettier + SonarQube | Lint/estilo/análise estática | `eslint.config.mjs`, `sonar-project.properties` | SonarQube informativo apenas, não bloqueia merge |
| Testes | Vitest (unit/integration), Playwright (e2e), Supertest, MSW (instalado, não usado) | Testes automatizados | `vitest.*.config.ts`, `tests/`, `playwright.config.ts` | Cobertura ~1:9 (arquivo de teste : arquivo fonte); E2E decorativo |

## 2. Aplicações e Sub-projetos

- **Aplicação principal:** monólito full-stack (SPA React servida pelo próprio Express + API REST), único ponto de entrada `server.ts`.
- **`server/marketplace/partners/`**: código órfão (classe `PartnerOnboarding` duplicada em `.js` e `.ts`), não referenciado por `server.ts` nem por `src/`; só é usado por seu próprio teste.
- **`chatbook/`**: sub-aplicação Vite+React **completamente independente e órfã** — `package.json`/`package-lock.json`/`vite.config.js` próprios, não é um workspace do monorepo (sem campo `workspaces` na raiz), não aparece em nenhum workflow de CI/CD nem no `Dockerfile`.
- **Scripts avulsos na raiz:** `seed_users.ts` (script de seed com credenciais reais hardcoded — ver `08-PLANO-DE-SEGURANCA.md`), `test-apollo.ts` (script de depuração ad hoc sem asserções, não é um teste real apesar do nome), `screenshot_script.py` e `video_script.py` (geração de material de documentação, fora do ciclo de build).

## 3. Integrações Externas — Estado Real

| Integração | Estado | Evidência |
|---|---|---|
| Apollo.io / Hunter.io (enriquecimento) | **Maduro** | `apollo.service.ts` (614 linhas), `src/lib/http.ts` com `fetchWithTimeout`/`AbortController`, fallback de plano Apollo→Hunter |
| BrasilAPI / CNPJ.ws | Funcional, com testes (`BrasilApiAdapter.test.ts`, `CnpjWsAdapter.test.ts`) | `src/lib/adapters/data-providers/` |
| Google (OAuth/Calendar/Places) | **Mockado** — `google.service.ts` retorna `mock_token`/URLs placeholder | `src/features/integrations/google/google.service.ts` |
| WhatsApp (Baileys) | **Frágil** — sessão global em memória (não multi-tenant), sem timeout, handler de mensagens recebidas vazio, reconexão sem backoff | `src/features/integrations/whatsapp/whatsapp.service.ts` |
| Bitrix24 (export de leads) | Funcional, mas com **SSRF** via `webhookUrl` fornecido pelo usuário | `src/lib/adapters/crm/Bitrix24Adapter.ts` |
| LiteLLM / Groq / OpenAI / Gemini | Gateway robusto (timeout, fallback, circuit breaker) — porém alias `gemini-*` está silenciosamente roteado para Groq por falta de crédito | `src/lib/ai/gateway.ts`, `litellm-config.yaml` |
| Meilisearch | Wired, fail-soft se offline | `src/lib/search/index.ts` |
| AWS S3 | Código pronto, sem uso ativo | `src/lib/storage/index.ts` |

## 4. Banco de Dados — Visão Geral

- 12 migrations (2026-07-16 a 2026-07-28); nomes indicam pelo menos um evento de *drift* reconciliado (`sync_accumulated_schema_drift`) e rollout de RLS em duas etapas (`enable_rls`, `enable_rls_auto` — este último, apesar do nome, não adiciona políticas novas).
- RLS habilitado para: `Company`, `Contact`, `Lead`, `Activity`, `user`, `Note`, `TimelineEvent`, `Organization`.
- RLS ausente em tabelas com dado de tenant: `Prospect`, `AIPendingAction` (adicionadas após o rollout de RLS), e ausência completa de coluna de tenant real em `KnowledgeChunk`/`Document`/`DocumentChunk`/`Prompt`/`AgentMemory`/`AILog`/`AIGovernancePolicy`/`AiEngineSetting`/`AIEvaluation`.
- Soft delete implementado via extensão do Prisma Client (`src/lib/prisma.ts`) apenas para `Company`/`Contact`/`Lead`/`Activity`.
- `AuditLog` real e populado automaticamente para os 4 modelos acima.

## 5. Comandos Oficiais do Projeto (validados nesta auditoria)

| Comando | Resultado | Observação |
|---|---|---|
| `git status` / `git log` | OK | Branch `main`, 2 arquivos modificados no momento da auditoria |
| `npx tsc --noEmit` | **Sucesso, 0 erros** | Modo estrito habilitado (`strict`, `noImplicitAny`, `noUnusedLocals`) |
| `npm run lint` (`eslint src`) | **Falhou por esgotamento de memória** (mesmo com `--max-old-space-size=4096`) | Ver `02-RELATORIO-COMPLETO.md` §2 — inconclusivo se é falha do projeto ou do ambiente sandboxado desta auditoria; requer validação em CI/máquina padrão |
| `npm run build` (`vite build && esbuild ...`) | **Falhou** — processo do esbuild (binário Go) encerrou por falta de memória após transformar 2952 módulos | Mesma ressalva acima; evidencia árvore de dependências pesada |
| `npm run test:unit` | **76/76 testes passaram** (24 arquivos), com 5 erros de worker não tratados (falha ao resolver `css-tree`/jsdom em alguns workers do Vitest no Windows) | Logs de execução expõem avisos reais: `ZodError` de validação, `"Access denied: Tenant ID missing"`, `"searchQueue offline"` |
| `npm audit --omit=dev` | **9 vulnerabilidades** (5 high, 4 moderate) | `better-auth` (risco já aceito via ADR-001), `xlsx` (sem correção disponível), `react-router` (correção com breaking change), `lodash`, `fast-uri`, `@hono/node-server`/`valibot` (transitivas do Prisma dev tooling) |

## 6. Documentação Pré-Existente Relevante

O repositório já contém uma estrutura extensa de documentação técnica em `docs/` (ADRs, Risk Register, Threat Model, Compliance Matrix, 34 relatórios em `docs/reports/`). Destaques usados como contexto nesta auditoria:
- `docs/ADR/ADR-001-BetterAuth-Vulnerability.md` + `docs/RiskRegister/RISK-001-BetterAuth.md`: risco de `better-auth` já formalmente aceito — **não** tratado como achado novo nesta auditoria, apenas referenciado.
- `docs/compliance/COMPLIANCE_MATRIX.md`: **desatualizado** em pontos específicos (RAG/vetorização descrito como ausente; hoje existe schema pgvector implementado) — classificado como parcialmente obsoleto.
- `docs/security/THREAT_MODEL.md`: descreve mitigações (cookies HttpOnly, CSP, replay-attack nonce) que não foram confirmadas como implementadas no código-fonte revisado nesta auditoria — recomenda-se revalidação.
