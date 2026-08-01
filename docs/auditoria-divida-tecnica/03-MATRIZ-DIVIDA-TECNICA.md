# Matriz de Dívida Técnica

Escala: Severidade/Probabilidade/Impacto de 1-5. Esforço: XS (horas) / S (1 dia) / M (2-5 dias) / L (1-2 semanas) / XL (>2 semanas).
Prioridade = Severidade × Probabilidade × Impacto (máx. 125) — usada apenas como ordenação relativa dentro de cada onda, não como métrica absoluta.

| ID | Categoria | Dívida | Localização | Evidência | Sev. | Prob. | Impacto | Esforço | Prior. | Solução |
|---|---|---|---|---|---:|---:|---:|---|---:|---|
| SEC-001 | Segurança | Login backdoor hardcoded autentica admin real | `src/features/auth/components/Login.tsx:11-36`, `src/config/access-policy.ts:4` | `signIn`/`signUp` automático com `admin@prospector.com`/senha fixa | 5 | 5 | 5 | S | 125 | Remover componente e conta da allowlist |
| SEC-002 | Segurança | `AuthContext` retorna admin hardcoded incondicional | `src/contexts/AuthContext.tsx:34-56` | `currentUser` nunca lê sessão real; `canAccessAdminPanel()=&gt;true` | 5 | 5 | 5 | M | 125 | Derivar de `authClient.useSession()` |
| SEC-003 | Segurança | Login por e-mail sem checar senha | `src/features/auth/components/LoginScreen.tsx:50-73` | branch `matchedByEmail` loga sem validar senha | 5 | 4 | 5 | S | 100 | Chamar `authClient.signIn.email` de fato |
| DB-001 | Banco/Segurança | Tabelas de IA/conhecimento sem isolamento de tenant | `prisma/schema.prisma` (KnowledgeChunk, Document, DocumentChunk, Prompt, AgentMemory, AILog); `search.service.ts` | Query sem filtro de organização confirmada em código | 5 | 4 | 5 | M | 100 | Adicionar coluna `organizationId` + RLS |
| SEC-004 | Segurança | SSRF via `webhookUrl` (export Bitrix24) | `src/lib/adapters/crm/Bitrix24Adapter.ts:38-112` | `fetch()` para URL arbitrária fornecida pelo usuário | 5 | 3 | 4 | S | 60 | Allowlist de domínio + bloqueio de IP privado |
| SEC-006 | Segurança | Credenciais reais em texto puro no histórico do Git | `seed_users.ts` (raiz) | E-mails corporativos reais + senha em texto puro (mascarada neste relatório) | 5 | 3 | 5 | S | 75 | Rotacionar senha, remover do histórico |
| DB-002 | Banco | RLS não retrofitado em tabelas novas | `Prospect`, `AIPendingAction` no schema | Migrations `20260726013952`, `20260728183000` sem política RLS | 4 | 3 | 4 | S | 48 | Adicionar política RLS igual às demais tabelas |
| SEC-005 | Segurança | Sessão WhatsApp global cross-tenant | `src/features/integrations/whatsapp/whatsapp.service.ts:12-14` | `sock`/`currentQr`/`status` em variável de módulo | 4 | 3 | 4 | M | 48 | Chavear por `organizationId`, mover para Redis |
| SEC-007 | Segurança | Bypass de dev-auth com default inseguro | `src/config/env.ts:6,20` | `NODE_ENV` default `development`, `ALLOW_DEV_AUTH_BYPASS` default `true` | 4 | 2 | 4 | XS | 32 | Remover defaults inseguros, adicionar assert de boot |
| DEVOPS-001 | DevOps | Deploy de produção sem teste real | `.github/workflows/production.yaml:38-40` | Passo de teste comentado, job "Build & Test" | 4 | 4 | 4 | S | 64 | Reativar teste + lint + gate manual |
| BACK-003 | Backend | Analytics retorna dado fabricado em erro silencioso | `src/features/analytics/routes/analytics.routes.ts:17-84` | Fallback hardcoded sem gate de `NODE_ENV`, alimenta relatório de IA | 4 | 3 | 4 | XS | 48 | Retornar 5xx real em vez de dado fake |
| IA-005 | IA | Aprovação de ação pendente não executa nada | `intelligence.routes.ts:181-206` | Nenhum consumidor de `AIPendingAction{approved:true}` encontrado | 4 | 4 | 3 | M | 48 | Implementar worker executor ou relabel de UI |
| IA-003 | IA | Bug real Swarm→SDR (tipo incompatível) | `supervisor.agent.ts:194-198` vs `sdr.agent.ts:136` | `instruction` passado onde se espera `leadId` | 3 | 5 | 3 | S | 45 | Resolver/propagar `leadId` real na missão |
| IA-006 | IA/LGPD | PII enviada a provedores externos sem minimização | `src/features/intelligence/services/guardrails.service.ts` | Só CPF é redigido, apenas na saída | 4 | 4 | 3 | M | 48 | Redigir PII de entrada antes do prompt |
| DEVOPS-003 | DevOps | Manifests ArgoCD duplicados/conflitantes | `k8s/argocd-app-homolog.yaml` vs `argocd/application-homolog.yaml` | Mesmo nome, repos/namespaces diferentes | 3 | 3 | 3 | XS | 27 | Remover um dos dois, consolidar fonte única |
| ARCH-006 | Frontend/Confiança | Dados de IA fabricados apresentados como reais | `ProspectingHub.tsx:1441,1446`; `CompanyList.tsx:74-92,214-216` | `Math.random()`, `alert()`, `setTimeout` simulando IA/ações | 3 | 5 | 4 | M | 60 | Gate de "modo demonstração" explícito ou implementar de fato |
| BACK-005 | Backend | Integração Google inteiramente mockada | `src/features/integrations/google/google.service.ts` | Retorna tokens/URLs fixos, nunca chama Google | 3 | 5 | 3 | L | 45 | Implementar OAuth real ou remover da UI até então |
| TEST-001 | Testes | Zero cobertura em fluxos de alto risco | billing, WhatsApp, Google, IA, relatórios | Confirmado via grep — nenhum arquivo `__tests__`/`tests/` correspondente | 4 | 4 | 3 | L | 48 | Ver `07-PLANO-DE-TESTES.md` |
| TEST-002 | Testes | E2E decorativo, não roda no CI | `tests/e2e/crm.spec.ts`, `.github/workflows/ci.yml` | Único spec só checa `<title>`; `test:e2e` nunca chamado no CI | 3 | 5 | 3 | S | 45 | Adicionar specs reais + step no CI |
| DEP-001 | Dependências | 9 vulnerabilidades via `npm audit` | `package-lock.json` | xlsx/react-router/lodash/fast-uri (altas) | 3 | 3 | 3 | M | 27 | Ver `03` seção dependências, aplicar correções não-breaking |
| DB-004 | Banco/Performance | Índices ausentes (Contact.email, User.organizationId, vetor ANN) | `prisma/schema.prisma` | Confirmado ausência de `@@index` correspondente | 3 | 4 | 3 | S | 36 | Adicionar migrations de índice |
| BACK-004 | Backend/Performance | Paginação ausente / filtro em memória | `activity.service.ts:49-53`; `prospecting.service.ts:254-263` | `findMany` sem `take/skip`; `.find()` em memória | 3 | 4 | 3 | S | 36 | Adicionar paginação; filtrar no banco |
| ARCH-001 | Arquitetura | Adoção inconsistente de Clean Architecture | 23 de 28 `src/features/*` | Ausência de domain/application em módulos periféricos | 2 | 5 | 3 | L | 30 | Formalizar categorias "core" vs "UI-only" |
| ARCH-002 | Código | Componentes "deus" | `ProspectingHub.tsx` (1690L), `ChatbookHub.tsx` (912L) | Múltiplos componentes/lógica no mesmo arquivo | 2 | 5 | 2 | M | 20 | Decompor em arquivos por responsabilidade |
| ARCH-007 | Código | Duplicação de CRUD entre 5 UseCases | `Company/Lead/Contact/Note/Activity UseCases` | Mesmo padrão find/create/update/delete repetido | 2 | 5 | 2 | M | 20 | Extrair `BaseUseCases` genérico |
| FRONT-001 | Frontend | Formulários sem validação estruturada | `CompanyForm.tsx`, `ContactForm.tsx` | `react-hook-form`/`zod` instalados, não usados | 2 | 5 | 3 | M | 30 | Migrar para `useForm`+`zodResolver` |
| FRONT-003 | Frontend/A11y | `Drawer.tsx` sem role/foco/Escape | `src/components/ui/Drawer.tsx` | Sem `aria-modal`, sem trap de foco | 2 | 4 | 2 | S | 16 | Adicionar padrão de dialog acessível |
| DEP-002 | Dependências | Bibliotecas duplicadas (framer-motion + motion) | `package.json:66,74` | Duas libs de animação do mesmo autor | 1 | 5 | 2 | XS | 10 | Consolidar em uma |
| COD-003 | Código | Dependências mortas (`mammoth`, `jsonwebtoken`, `DataTable.tsx`, `Atlas3DGame.tsx`) | vários | Zero referências em `src/` | 1 | 5 | 1 | XS | 5 | Remover |
| OBS-001 | Observabilidade | Flags `EXPOSE_METRICS`/`ENABLE_SEARCH` mortas | `server.ts` (não lê as flags) | `/metrics` sempre público | 2 | 5 | 2 | XS | 20 | Adicionar gate condicional |
| DEVOPS-005 | DevOps | Imagem Docker carrega devDependencies | `Dockerfile:29` | `node_modules` completo copiado do builder | 2 | 5 | 2 | S | 20 | `npm ci --omit=dev` na etapa final |
| DEVOPS-007 | DevOps | Sem estratégia de rollback documentada | `charts/prospector-atlas/templates/rollout.yaml` | Auto-promote 30s sem `AnalysisTemplate` | 3 | 3 | 3 | M | 27 | Runbook + AnalysisTemplate baseado em métricas |
| DEP-005 | Dependências | `chatbook/` órfão, não integrado ao CI | `chatbook/package.json` | Sem workspaces, sem referência em CI/Dockerfile | 1 | 5 | 1 | S | 5 | Decidir: integrar ou remover |
| DEP-006 | Repositório | Binários commitados no histórico do Git | `dump.rdb`, PNGs, `.mp4` na raiz | Não excluídos por `.gitignore` | 1 | 5 | 1 | S | 5 | Adicionar ao `.gitignore`, avaliar limpeza de histórico |
| DOC-001 | Documentação | `COMPLIANCE_MATRIX.md` desatualizado | `docs/compliance/COMPLIANCE_MATRIX.md` | Descreve RAG como "ausente"; já implementado | 1 | 4 | 2 | XS | 8 | Atualizar ou marcar como histórico |

*Nota: a matriz acima não é exaustiva de todos os ~50 achados detalhados no `02-RELATORIO-COMPLETO.md` — lista os itens com maior prioridade calculada. Itens de severidade Baixa/Informacional adicionais estão descritos no relatório completo e no `05-QUICK-WINS.md`.*
