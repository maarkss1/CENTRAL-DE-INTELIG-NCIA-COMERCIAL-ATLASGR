# Relatório Completo de Achados

Cada achado tem um ID referenciado na `03-MATRIZ-DIVIDA-TECNICA.md`. Evidências citam arquivo e linha quando disponível.

---

## 1. Validação de Ambiente

| Comando | Resultado | Duração aprox. | Observação |
|---|---|---|---|
| `git status`/`log` | OK | <1s | main, 2 arquivos modificados (`ProspectingHub.tsx`, `apollo.service.ts`) |
| `tsc --noEmit` | ✅ 0 erros | ~15s | Estrito, sem supressões globais |
| `eslint src` | ❌ `FATAL ERROR: Zone Allocation failed - process out of memory`, mesmo com `NODE_OPTIONS=--max-old-space-size=4096` | ~10-12s até crash | O padrão de falha (OOM ocorrendo em ~300-400MB de heap, mesmo com limite de 4GB explícito) sugere restrição de memória do **ambiente sandboxado desta sessão**, não necessariamente do projeto. **Recomenda-se re-executar em CI/máquina padrão antes de tratar como defeito real.** |
| `vite build && esbuild ...` | ❌ Processo Go do esbuild encerrou (`write EPIPE`) após transformar **2952 módulos** com sucesso | ~13s até crash | Mesma ressalva de ambiente. Evidência independente e válida: a árvore de dependências é muito pesada (three.js, framer-motion **e** motion, xlsx, mammoth não utilizado, aws-sdk, langchain) |
| `vitest run` (unitário) | ✅ 76/76 testes, 24 arquivos | 28s | 5 erros de worker não tratados (falha ao resolver módulo `css-tree`/jsdom em workers do Vitest — ambiente Windows); logs de execução revelam avisos reais do runtime: `ZodError` de validação em `legalName`, `"Access denied: Tenant ID missing"`, `"searchQueue offline"` |
| `npm audit --omit=dev` | 9 vulnerabilidades (5 high, 4 moderate) | ~5s | Ver `03-MATRIZ` DEP-001 a DEP-003 |

---

## 2. Arquitetura (Fase 3)

**ARCH-001 — Adoção inconsistente de Clean Architecture entre módulos.** Das ~28 pastas em `src/features`, apenas 5 (`activities`, `companies`, `contacts`, `crm`, `notes`) têm a camada completa domain/application/presentation/routes/infra. Os demais 23 (auth, automations, billing, calendar, chatbook, chatbot, dashboard, document-editor, gamification, notifications, onboarding, reports, roleplay, settings, team, integrations, analytics, intelligence, knowledge) são majoritariamente shells de UI ou têm camadas parciais/ad hoc.
*Impacto:* lógica de negócio migra para dentro de componentes `.tsx` (ver ARCH-006) e para dentro de rotas Express (ver BACK-001), quebrando testabilidade e substituibilidade nessas áreas.
*Solução:* formalizar duas categorias de módulo — "core transacional" (com camadas completas) e "UI-only" (documentado como tal) — e retrofitar `services/`+`routes/` mínimos em billing/settings/team à medida que ganham lógica real.

**ARCH-002 — Componentes "deus".** `src/features/prospecting/components/ProspectingHub.tsx` tem **1690 linhas** e define 5 componentes no mesmo arquivo (`ProspectingHub`, `DecisionMakerSearch` L968, `CandidateCard` L1464, `CnpjResultCard` L864, `InfoTile` L944), incluindo uma chamada `fetch` direta a uma API do governo (IBGE, L195) dentro do componente. `ChatbookHub.tsx` (912 linhas) e `FloatingChatbook.tsx` (741 linhas) seguem o mesmo padrão de misturar orquestração de chat com UI.
*Solução:* extrair `DecisionMakerSearch`/`CandidateCard`/`CnpjResultCard` para arquivos próprios; mover a chamada IBGE para um hook `useIbgeCities` ou `prospecting/services/ibge.service.ts`.

**ARCH-003 — Acesso direto ao Prisma fora de services/repositórios.** `src/features/analytics/routes/analytics.routes.ts` (8 chamadas `prisma.*.count` inline), `src/features/intelligence/routes/intelligence.routes.ts` (`prisma.aiEngineSetting.findMany/$transaction/upsert`), `src/features/intelligence/routes/prompt.routes.ts` (`prisma.prompt.findMany/create/update`) — todos bypassam a camada de serviço usada consistentemente por companies/contacts/crm/activities/notes.
*Solução:* criar `analytics.service.ts` e mover o acesso a `aiEngineSetting`/`prompt` para repositórios dedicados.

**ARCH-004 — Código órfão duplicado.** `server/marketplace/partners/PartnerOnboarding.ts` e `.js` (mesma classe, duas linguagens) não são importados por `server.ts` nem por `src/`, apenas por seu próprio teste.
*Solução:* remover ambos os arquivos e o teste associado, ou mover para `src/features` se a funcionalidade for real.

**ARCH-005 — Estado global/singleton que quebra escalonamento horizontal.** `whatsapp.service.ts:12-14` mantém `sock`/`currentQr`/`status` como variáveis de módulo (uma única sessão do WhatsApp para todo o deployment, não por tenant). `src/lib/ai/gateway.ts:220` implementa o circuit breaker por provedor num `Map` em memória de processo — com múltiplas instâncias, cada pod tem seu próprio estado de circuito, não detectando falhas observadas por outros pods.
*Solução:* mover ambos os estados para Redis (já usado por `rate-limit-redis`/BullMQ no mesmo `server.ts`).

**ARCH-006 — Lógica de negócio embutida em componentes `.tsx`.** `ProspectingHub.tsx:1441` renderiza `Fit de Persona: {Math.floor(Math.random() * 20) + 80}%` como se fosse um score real de IA; `ProspectingHub.tsx:1446` dispara `alert('Gerando Quebra-Gelo com IA...')` sem nenhuma chamada real; `CompanyList.tsx:74-92` (`handleBulkEnrich`/`handleBulkProspect`) apenas simula com `setTimeout` + `alert`; `CompanyList.tsx:214-216,366-368` usa fallback `['React','AWS','Salesforce']` quando a empresa não tem stack de tecnologia real detectada, exibido sem indicação de que é um placeholder.
*Impacto:* usuários (SDRs) tomam decisões de prospecção com base em dados fabricados apresentados como reais — risco direto de confiança no produto.
*Solução:* mover lógica para `application`/`services`, e gate explícito de "modo demonstração" quando não houver dado real, em vez de fallback silencioso.

**ARCH-007 — Duplicação genuína de CRUD entre 5 casos de uso.** `CompanyUseCases`, `LeadUseCases`, `ContactUseCases`, `NoteUseCases`, `ActivityUseCases` repetem a mesma estrutura find/findById/create/update/delete.
*Solução:* extrair `BaseUseCases<T, Repo>` genérico.

**ARCH-008 — Acoplamento cruzado entre features.** `CompanyUseCases`, `ContactUseCases`, `contact.service.ts` e `LeadUseCases` importam `enrichCompany` diretamente de `prospecting/services/enrichment.service`; `LeadDetailDrawer.tsx` (feature `crm`) importa `DecisionMakerSearch` de dentro do arquivo monolítico `ProspectingHub.tsx` (feature `prospecting`); `ContactList.tsx` importa utilitário de `prospecting/utils/contact-links`.
*Solução:* promover `enrichCompany`, `contact-links` e `icp-options` para `src/shared/`.

---

## 3. Código (Fase 4) e Tipagem (Fase 5)

**COD-001 — Maiores arquivos por linha (top 5):** `ProspectingHub.tsx` (1690), `ChatbookHub.tsx` (912), `enrichment.service.ts` (774), `FloatingChatbook.tsx` (741), `AtlasIcons.tsx` (692). Nenhum arquivo de servidor (`server.ts`, 234 linhas) é excessivamente grande — o volume está concentrado no frontend de features de IA/prospecção.

**TIP-001 — `tsc --noEmit` passa sem erros** com `strict: true`, `noImplicitAny`, `strictNullChecks`, `noUnusedLocals` habilitados — sinal positivo real, não superficial.

**TIP-002 — Casts `as any` pontuais em caminhos sensíveis.** `src/features/intelligence/tools/crmTools.ts:60` — `status: toPrismaLeadStatus(status as ...) as any` no caminho em que a IA escreve autonomamente o status de um lead no CRM (ver IA-004). Classificado como **perigoso** (não apenas temporário) por estar no caminho de escrita autônoma sem validação adicional.

**COD-002 — Scripts de depuração esquecidos na raiz.** `test-apollo.ts` (chamada ad hoc a `fetchApolloCandidates` + `console.log`, sem asserções — nome sugere teste automatizado mas não é) e `seed_users.ts` (ver SEC-006) não pertencem ao ciclo de build/test.

**COD-003 — Dependências mortas/não utilizadas no frontend.** `react-hook-form`, `@hookform/resolvers` e o uso de `zod` em formulários: **zero** ocorrências de `useForm(`/`zodResolver` em `src/**/*.tsx`. `mammoth` (parsing de docx): zero referências em `src/`. `jsonwebtoken`: zero chamadas `jwt.sign`/`jwt.verify` em `src/` (better-auth gerencia tokens internamente). `src/components/ui/DataTable.tsx` e `src/features/intelligence/components/Atlas3DGame.tsx`: componentes completos definidos e nunca importados em lugar nenhum.
*Solução:* remover dependências não utilizadas ou adotar `react-hook-form`+`zod` nos formulários existentes (`CompanyForm`, `ContactForm`) que hoje usam `useState` manual sem validação de formato (ex.: CNPJ sem validação de formato).

---

## 4. Frontend e UX (Fase 6)

**FRONT-001 — Formulários sem validação estruturada.** `CompanyForm.tsx`, `ContactForm.tsx` usam `useState<Partial<T>>` + `onChange` manual + apenas validação nativa HTML (`required`, `type="email"`). Nenhum uso de schema compartilhado — regras de validação divergem formulário a formulário (ex.: CNPJ em `CompanyForm.tsx:79-80` sem qualquer validação de formato).

**FRONT-002 — Estados de loading/vazio/erro inconsistentes.** `Skeleton.tsx` e `EmptyState.tsx` existem como primitivos compartilhados, mas `CompanyList.tsx` usa `EmptyState` com spinner inline próprio; `ActivityList.tsx` define seu próprio `SkeletonCard` local e bloco de vazio próprio; `ContactList.tsx` usa `Skeleton` mas não `EmptyState`. `ContactForm.tsx:33-44` não trata erro visível ao usuário se `/api/companies` falhar ao popular o dropdown (apenas `console.error`).

**FRONT-003 — Acessibilidade inconsistente entre primitivos similares.** `Dialog.tsx` usa `<dialog>` nativo (foco/Escape gratuitos do navegador) mas o botão de fechar não tem `aria-label`. `Drawer.tsx` é um `<div>` sem `role="dialog"`, sem `aria-modal`, sem trap de foco, sem handler de `Escape` — usado em `LeadDetailDrawer.tsx` e `FloatingChatbook.tsx`, ambos user-facing. Checkboxes de seleção em massa (`CompanyList.tsx:227-231,349-354`) sem `aria-label`.

**FRONT-004 — Performance/bundle.** `OnboardingTour.tsx` é montado incondicionalmente em todo `AppLayout` (`App.tsx:79-82`) para todo usuário autenticado; como importa `AtlasOrb.tsx` (three.js/@react-three/fiber/drei) no escopo do módulo, o chunk pesado de three.js é baixado/avaliado antes mesmo de checar a flag `has_seen_tour`. `Atlas3DGame.tsx` (também three.js) não é importado em lugar nenhum — código morto no bundle.

**FRONT-005 — Dados mockados/fabricados apresentados como reais na UI.** Ver ARCH-006 (score de fit aleatório, quebra-gelo fake, bulk actions fake, fallback de stack tecnológica fabricado). Adicionalmente, `google.service.ts` retorna sempre `connected: false`/tokens mock, mas a tela de Integrações reflete esse estado como se fosse uma checagem real.

**FRONT-006 — Duas fontes de autenticação coexistindo.** `src/lib/api.ts:17` lê um bearer token de `localStorage` para toda chamada de API, ao mesmo tempo em que `credentials: 'include'` é usado para sessão via cookie do better-auth — dois mecanismos paralelos sem definição clara de qual é a fonte de verdade (agravado pelo achado crítico SEC-001/SEC-002 sobre a autenticação estar, na prática, desabilitada).

---

## 5. Backend e APIs (Fase 7)

**BACK-001 — Painel de filas (`/admin/queues`, BullBoard) acessível a qualquer usuário autenticado de qualquer tenant.** `server.ts` protege a rota com `authenticateToken, requireTenant` mas não com verificação de papel de administrador — expõe dados de jobs (leads, busca, empresa) de **todos** os tenants a qualquer usuário logado.

**BACK-002 — Drift entre schema de ambiente e implementação.** `src/config/env.ts` define `API_RATE_LIMIT_MAX` (default 600), mas `server.ts:92` usa um valor hardcoded (`max: 500`) — a env var nunca é lida nesse ponto. `AI_RATE_LIMIT_MAX` está corretamente conectado.

**BACK-003 — Analytics retorna métricas fabricadas silenciosamente em caso de erro de banco.** `analytics.routes.ts:17-84` engole qualquer erro do banco (comentário "DB offline or empty in dev") e retorna HTTP 200 com números hardcoded (`totalCompanies: 7`, `pipelineValue: 450000`, etc.) **sem qualquer gate de `NODE_ENV`** — uma falha transitória em produção se torna, de forma indistinguível, uma métrica de negócio inventada, inclusive alimentando `/api/intelligence/report`.

**BACK-004 — Paginação ausente / N+1 potencial.** `activity.service.ts:49-53` (`findAll`) não recebe `take`/`skip`, carrega todas as atividades da organização com `include` profundo em toda chamada de `GET /api/activities`. `prospecting.service.ts:254-263` (`findExistingCompany`) carrega todas as empresas com CNPJ não-nulo da organização e faz `.find()` em memória em vez de filtrar no banco — executado a cada promoção de lead para CRM.

**BACK-005 — Integração Google inteiramente mockada.** `google.service.ts`: `getGoogleAuthUrl` retorna URL placeholder, `processGoogleCallback` ignora o `code` recebido e retorna token mock, `getGoogleStatus` sempre retorna desconectado.

**BACK-006 — Integração WhatsApp frágil.** Socket global não multi-tenant (ver ARCH-005); reconexão sem backoff/limite (`whatsapp.service.ts:50-57` chama `initWhatsApp()` novamente de forma irrestrita em caso de queda, risco de banimento); `/send` sem timeout ao redor de `sock.sendMessage`; handler de mensagens recebidas (`messages.upsert`) está vazio — mensagens recebidas são descartadas silenciosamente, sem persistência.

**BACK-007 — Enriquecimento de empresa é uma simulação.** `company.worker.ts:32-33` faz apenas `setTimeout(1500ms)` e marca `enrichmentStatus: 'Enriquecido'` (comentário confirma: "Simulação de chamada a serviços de enriquecimento externos"), contradizendo o comentário da rota que promete enriquecimento real via Receita Federal/heurísticas.

**BACK-008 — Jobs BullMQ sem idempotência nem retry.** Nenhuma chamada `Queue.add()` revisada usa `jobId` (chamadas repetidas para o mesmo `leadId` geram jobs duplicados) nem `attempts`/`backoff` (falha transitória = falha definitiva, sem nova tentativa automática).

**BACK-009 — Ausência total de documentação OpenAPI/Swagger** para a superfície de API da aplicação (`/api/companies`, `/contacts`, `/leads`, `/activities`, `/prospecting`, `/intelligence`, `/analytics`, `/whatsapp`, `/google`, `/agent`).

**Ponto positivo confirmado:** os controllers de Company/Lead/Contact/Activity/Note seguem um padrão consistente try/catch→`next(error)`, sempre delegam a use-cases/serviços (nunca tocam Prisma diretamente), e o gateway de IA (`src/lib/ai/gateway.ts`) é uma peça de engenharia sólida (timeout real via `AbortSignal`, circuit breaker, fallback em cadeia, sanitização de mensagens de erro de provedor) — deve ser tratado como padrão de referência, não como alvo de correção.

---

## 6. Banco de Dados (Fase 8)

**DB-001 — Tabelas de IA/conhecimento sem isolamento de tenant.** `KnowledgeChunk`, `Document`, `DocumentChunk`, `Prompt`, `AiEngineSetting`, `AILog`, `AIEvaluation`, `AgentMemory` não têm coluna real de `organizationId` (apenas `KnowledgeChunk.metadata` guarda o id como chave JSON, sem índice, sem FK, sem NOT NULL). Confirmado em código que `search.service.ts`/`ingestion.service.ts` consultam `DocumentChunk`/`Document` **sem filtro algum** de organização — busca de RAG de um tenant retorna documentos de outros tenants.
*Severidade:* Crítica — vazamento de dados entre clientes de um CRM multi-tenant.

**DB-002 — Drift no rollout de RLS.** RLS habilitado para `Company`/`Contact`/`Lead`/`Activity`/`user`/`Note`/`TimelineEvent`/`Organization` em `20260722020322_enable_rls`. `Prospect` (adicionado em `20260726013952`) e `AIPendingAction` (adicionado em `20260728183000`) — ambos **depois** do rollout de RLS — nunca receberam política, dependendo só de filtro de aplicação.

**DB-003 — Migração de reconciliação de drift.** `20260720235926_sync_accumulated_schema_drift` (227 linhas) faz `DROP TABLE "User"` e recria como `"user"` (troca de sistema de auth para better-auth) na mesma migration que adiciona soft-delete e 10 tabelas novas de IA — evidência de que schema e banco divergiram fora do fluxo de migrations normal em algum momento entre 17 e 20 de julho, exigindo uma migration de reconciliação. O `DROP TABLE` descartou quaisquer registros pré-existentes de `User`, incluindo `passwordHash`, sem migração de dados.

**DB-004 — Índices ausentes.** `Contact.email`/`.phone`/`.whatsapp` sem índice (usados em deduplicação); `User.organizationId` sem índice próprio (Postgres não indexa FK automaticamente) — impacta a própria política de RLS que filtra por essa coluna; `KnowledgeChunk` sem índice algum, incluindo ausência de índice ANN (ivfflat/hnsw) sobre a coluna de embedding — busca de similaridade vetorial faz varredura sequencial à medida que a tabela cresce.

**DB-005 — Cascade inconsistente.** `AIPendingAction.organizationId → Organization` usa `Cascade` (deleção de organização apaga silenciosamente todas as ações de IA pendentes), enquanto todo o resto do domínio tenant-scoped (`Company`/`Contact`/`Lead`/`Activity`/`Prospect`) usa `SetNull`, preservando registros órfãos para auditoria — inconsistência introduzida na migration mais recente.

**DB-006 — Fail-open no contexto de tenant para queries raw.** `src/lib/prisma.ts:76` — o bloco que define `app.current_tenant_id`/`app.bypass_rls` via `$executeRawUnsafe` roda dentro de um `try { $transaction(...) } catch { return await prismaPromise }` — se a transação de configuração de contexto falhar por qualquer motivo, a query prossegue **sem** o contexto de tenant definido, em vez de falhar a requisição.

**DB-007 — Credenciais reais em `seed_users.ts`** — ver SEC-006 no plano de segurança (valor mascarado neste relatório).

---

## 7. Segurança (Fase 9)

Ver documento dedicado `08-PLANO-DE-SEGURANCA.md` para a lista completa classificada por severidade OWASP. Resumo dos achados críticos/altos:

- **SEC-001 (Crítico):** login backdoor hardcoded (`Login.tsx`) que autentica `admin@prospector.com`/senha fixa contra o backend real; e-mail presente na allowlist server-side.
- **SEC-002 (Crítico):** `AuthContext.tsx` retorna usuário admin hardcoded incondicionalmente; `ProtectedRoute` nunca bloqueia ninguém.
- **SEC-003 (Crítico):** `LoginScreen.tsx` autentica por correspondência de e-mail contra uma lista de presets **sem checar senha**.
- **SEC-004 (Alto):** SSRF autenticado via `webhookUrl` no export para Bitrix24.
- **SEC-005 (Alto):** sessão WhatsApp global compartilhada entre tenants.
- **SEC-006 (Alto):** credenciais reais de funcionários em texto puro no histórico do Git (`seed_users.ts`).
- **SEC-007 (Alto):** `ALLOW_DEV_AUTH_BYPASS` tem default `true` e `NODE_ENV` tem default `development` no schema de configuração — funciona hoje porque Dockerfile/Helm fixam `NODE_ENV=production`, mas é frágil a drift de configuração.
- **SEC-008 (Médio):** rate limit genérico (500/15min) também cobre `/api/auth/*`, sem limite dedicado mais restrito para login.
- **SEC-009 (Médio):** `/metrics` sempre público independente da flag `EXPOSE_METRICS` (dead config).
- **SEC-010 (Médio):** ausência de mecanismos de direito do titular (LGPD) — exportação/eliminação/consentimento — apesar de o produto afirmar "conformidade total com a LGPD" em texto de marketing.

**Ponto positivo confirmado:** `getTenantPrisma`/extensão do Prisma injeta `organizationId` derivado do usuário autenticado em toda operação nos modelos centrais — nenhum IDOR foi encontrado nos controllers de Company/Contact/Lead amostrados; o padrão de isolamento de tenant no domínio central é sólido, o problema está concentrado nas tabelas de IA/conhecimento (DB-001) e nas features periféricas (WhatsApp).

---

## 8. Dependências (Fase 10)

**DEP-001 — 9 vulnerabilidades via `npm audit`:** `xlsx` (alta, sem correção disponível — prototype pollution/ReDoS), `react-router` (alta, correção exige downgrade breaking), `lodash` (alta — prototype pollution/code injection), `fast-uri` (alta), `better-auth` (risco já formalmente aceito via ADR-001/RISK-001), `@hono/node-server`/`valibot` (moderadas, transitivas de `@prisma/dev`).

**DEP-002 — Bibliotecas duplicadas com o mesmo propósito.** `framer-motion` **e** `motion` (sucessor do mesmo time) presentes simultaneamente — peso de bundle redundante.

**DEP-003 — Dependência pré-lançamento em produção.** `@whiskeysockets/baileys` fixado em `7.0.0-rc13` — biblioteca de integração WhatsApp usada presumivelmente em produção presa a uma release candidate.

**DEP-004 — `package.json` com nome de scaffold** (`"name": "react-example"`), nunca renomeado para o produto real.

**DEP-005 — `chatbook/` é uma sub-aplicação totalmente órfã**, com dependências duplicadas (`react`/`react-dom`/`@vitejs/plugin-react` próprios) e não integrada a nenhum workflow de CI/CD ou ao `Dockerfile`.

**DEP-006 — Poluição do histórico do Git com binários.** `.gitignore` não exclui `*.rdb`, `*.mp4` ou PNGs na raiz — `dump.rdb` (dump do Redis), 11 screenshots (~4MB) e um vídeo de navegação estão commitados permanentemente no histórico.

---

## 9. Testes e Qualidade (Fase 11)

Ver `07-PLANO-DE-TESTES.md` para a matriz completa por fluxo crítico. Resumo:

- Proporção teste:código-fonte de aproximadamente **1:9** (≈40 arquivos de teste para 354 arquivos-fonte).
- **Zero cobertura** confirmada para: billing, integração WhatsApp, integração Google, IA generativa (chatbot/intelligence/roleplay além de um teste isolado de schema), relatórios/analytics/exportação.
- E2E é decorativo: único spec Playwright (`tests/e2e/crm.spec.ts`) apenas navega e checa o `<title>` da página; **não roda no CI** (`ci.yml` não chama `test:e2e`).
- `msw` está instalado mas **nunca usado** — mocking de HTTP é feito ad hoc e de forma inconsistente entre arquivos de teste.
- Setup de testes de integração é frágil: porta do Postgres (5434) coincide com a porta que o `docker-compose.yml` expõe, arriscando conflito com os *service containers* nativos que o próprio `ci.yml` já sobe; o script `pretest:integration` depende de um `.env.test` que não existe versionado nem é criado por nenhum step do CI.
- `test-apollo.ts` (raiz) não é um teste real — script de depuração esquecido.

---

## 10. Performance e Escalabilidade (Fase 12)

- **Comprovado:** `activity.service.ts` sem paginação (BACK-004); `prospecting.service.ts::findExistingCompany` filtra em memória em vez de no banco (BACK-004); ausência de índice ANN para busca vetorial (DB-004).
- **Risco provável, não comprovado em produção:** OOM em build/lint neste ambiente de auditoria (ver seção 1) — indica árvore de dependências pesada, mas requer confirmação em ambiente não sandboxado antes de ser tratado como bug real de produção.
- **Oportunidade futura:** rate limiter de IA (`AI_RATE_LIMIT_MAX`) é por IP, não por tenant — um tenant ruidoso pode esgotar a cota de outro atrás do mesmo NAT/VPN corporativo; rotas `/api/agent/*` (Swarm multi-agente, que dispara até 3 agentes LangGraph por chamada) não estão sob nenhum limitador de IA dedicado.

---

## 11. DevOps, CI/CD e Infraestrutura (Fase 13)

Ver `06-ARQUITETURA-ATUAL-E-ALVO.md` e `04-ROADMAP-CORRECAO.md` para tratamento arquitetural. Achados centrais:

**DEVOPS-001 — `production.yaml` publica imagem `:latest` sem teste real.** O job "Build & Test Code" tem o passo de teste comentado; nenhum lint, nenhum `npm audit`, nenhum type-check. A imagem é publicada automaticamente a cada push em `main`, sem gate de aprovação manual.

**DEVOPS-002 — `cd-homolog.yml` sem validação própria** — builda/publica/atualiza Helm values sem lint/teste, e baixa a ferramenta `yq` via `sudo wget` da tag "latest" do GitHub Releases (versão não fixada — risco de supply chain).

**DEVOPS-003 — Manifests ArgoCD duplicados e conflitantes.** `k8s/argocd-app-homolog.yaml` e `argocd/application-homolog.yaml` declaram o **mesmo nome** de `Application`, no mesmo namespace `argocd`, mas apontam para repositórios (`PROSPECTOR-ATLAS` vs `PROSPECTOR-ATLASGR`) e namespaces de destino diferentes — resíduo aparente de renomeação de repositório nunca limpo.

**DEVOPS-004 — Nenhum manifest de produção existe no repositório** — apenas homolog está representado; o caminho de deploy de produção não é auditável a partir do código.

**DEVOPS-005 — Dockerfile não faz prune de devDependencies** — a imagem final carrega dezenas de pacotes de desenvolvimento (vitest, playwright, eslint, typescript etc.) desnecessariamente.

**DEVOPS-006 — StatefulSet do Postgres e Deployment do Redis sem limites de recursos nem probes** (ao contrário do chart Helm da aplicação, que tem ambos corretamente configurados).

**DEVOPS-007 — Sem estratégia de rollback documentada ou automatizada.** O Argo Rollout Blue-Green promove automaticamente após 30s (`autoPromotionEnabled: true`) sem `AnalysisTemplate` baseado em métricas.

**DEVOPS-008 — SonarQube é apenas informativo** — não há gate de qualidade bloqueando merge.

---

## 12. Observabilidade (Fase 14)

**Ponto positivo confirmado:** Pino estruturado é usado de forma consistente (apenas 2 ocorrências de `console.log` cru em todo `src/`); Correlation/Request/Trace ID são propagados via middleware dedicado (`src/shared/middlewares/observability.ts`); OpenTelemetry é genuinamente inicializado (`src/lib/tracing.ts`, com fallback gracioso se o coletor não estiver disponível), não é uma dependência instalada e esquecida.

**OBS-001 — Duas flags de ambiente mortas.** `EXPOSE_METRICS` e `ENABLE_SEARCH` são definidas e validadas em `src/config/env.ts`, mas nunca lidas em `server.ts` — o endpoint `/metrics` está **sempre** montado publicamente (sem autenticação) independentemente da flag, e a inicialização do Meilisearch sempre roda independentemente de `ENABLE_SEARCH`.

**OBS-002 — Seria possível investigar um incidente real?** Parcialmente sim para erros de aplicação (logs estruturados + correlation ID), mas **não** para incidentes de acesso indevido — dado que a autenticação real está desabilitada (SEC-001/002), não há como diferenciar no log um "administrador legítimo" de "qualquer visitante" logado via o bypass.

---

## 13. IA, Automações e Integrações (Fase 15)

**IA-001 — Roteamento de modelo enganoso.** `litellm-config.yaml` roteia os aliases `gemini-pro`/`gemini-flash` silenciosamente para `groq/llama-3.3-70b-versatile`/`groq/llama-3.1-8b-instant` por falta de crédito prepago na conta Gemini (comentário no próprio arquivo confirma). Código da aplicação (`gateway.ts`) continua se referindo a "Gemini", mas o tráfego real vai para outro modelo/família — prompts foram ajustados assumindo comportamento do Gemini.

**IA-002 — Duas pipelines de embedding paralelas.** `lib/ai/gateway.ts::generateEmbedding` (via LiteLLM) e `lib/ai/embeddings.ts::generateEmbedding` (via `@google/genai` direto, mesma chave Gemini sem crédito) — `vector-search.service.ts`, que usa a segunda, está provavelmente quebrado silenciosamente em produção.

**IA-003 — Bug real de integração Swarm↔SDR.** `supervisor.agent.ts` (`sdrNode`, L194-198) passa uma string livre de instrução/missão para `SDRQualificationAgent.run()`, que espera um **ID de lead do CRM** — toda vez que o Swarm roteia para o agente SDR, a ferramenta de busca de contexto falha (`"Erro: Lead não encontrado no CRM"`), produzindo uma qualificação vazia/errada sem que nenhum teste cubra esse caminho.

**IA-004 — Escrita autônoma de IA no CRM sem segunda validação.** `crmTools.ts` permite que o modelo decida e persista `score`/`status` de um lead diretamente via tool-calling, com um cast `as any` (ver TIP-002) e sem etapa de aprovação humana — inconsistente com o agente de rascunho de e-mail (`sdr-agent.ts`), que passa por `AIPendingAction` antes de qualquer ação externa.

**IA-005 — Aprovação de ação pendente é um "no-op".** `POST /pending/:id/approve` apenas marca `approved: true` no banco — não existe nenhum consumidor no código que efetivamente dispare o e-mail/ação aprovada. Um usuário que clica "aprovar" acredita que algo será enviado; nada é enviado.

**IA-006 — PII enviada a provedores externos sem minimização.** `guardrails.service.ts::redactSensitiveData` só mascara CPF, e apenas na **saída** do modelo — nome, cargo, empresa e demais dados pessoais de contatos/leads são enviados como texto de prompt para Groq/OpenAI/Gemini sem qualquer redação na **entrada**. Risco LGPD (ver também SEC-010).

**IA-007 — Risco de prompt injection não tratado uniformemente.** `src/lib/ai/features.ts` concatena texto livre (potencialmente controlado por dados de CRM/enriquecimento) diretamente em 14 prompts sem framework de "dado não confiável" nem validação de saída — em contraste com código mais novo (`sdr-agent.ts`, `agent.routes.ts`, `studio.service.ts`) que já inclui esse aviso, mas de forma duplicada em 3 lugares em vez de centralizada.

**Ponto positivo confirmado:** a arquitetura de agentes (LangGraph, `SwarmOrchestrator`, `SDRQualificationAgent`) é genuína e sofisticada, não é uma integração superficial; o gateway de IA tem timeout/fallback/circuit breaker real e funcionando; o rate limiter de IA (`AI_RATE_LIMIT_MAX`) está corretamente conectado via Redis.

---

## 14. Documentação e Conhecimento (Fase 16)

| Documento | Classificação |
|---|---|
| `docs/ADR/ADR-001-BetterAuth-Vulnerability.md`, `docs/RiskRegister/RISK-001-BetterAuth.md` | Atual |
| `docs/compliance/COMPLIANCE_MATRIX.md` | Parcialmente obsoleto (descreve RAG/vetorização como ausente; já implementado) |
| `docs/security/THREAT_MODEL.md` | Parcialmente conflitante — descreve mitigações não confirmadas no código atual (cookies HttpOnly, CSP, nonce anti-replay) |
| `docs/reports/*.md` (34 arquivos) | Fragmentado — muitos relatórios curtos (a maioria <90 linhas) e sobrepostos, sem única fonte de verdade consolidada |
| `docs/index.md`, `docs/README.md` | Estrutura mínima/placeholder |
| Documentação de API (OpenAPI) | Ausente |
