# Roadmap de Correção

## Fase 0 — Contenção de Riscos Críticos (imediato, antes de qualquer nova entrega)
**Objetivo:** eliminar os vetores que hoje tornam o controle de acesso não confiável.

| Item | Ação | Esforço | Responsável sugerido |
|---|---|---|---|
| SEC-001 | Remover `Login.tsx` (componente de login backdoor) e a conta `admin@prospector.com` de `AUTHORIZED_LOGIN_EMAILS` | S | Backend/Frontend sênior |
| SEC-002 | Reescrever `AuthContext.tsx` para derivar `currentUser` de `authClient.useSession()` real; implementar `canAccessAdminPanel`/`canAccessBrand` com base em papel/permissão real | M | Frontend sênior |
| SEC-003 | Fazer `LoginScreen.tsx` chamar `authClient.signIn.email` de fato; remover `PRESET_USERS` e senhas exibidas em tela | S | Frontend sênior |
| SEC-006 | Rotacionar a credencial exposta em `seed_users.ts`; remover o arquivo do histórico do Git (`git filter-repo` ou equivalente); mover seed para variáveis de ambiente | S | DevOps + segurança |
| DB-001 | Adicionar `organizationId` + RLS a `KnowledgeChunk`/`Document`/`DocumentChunk`/`Prompt`/`AgentMemory`/`AILog`; filtrar todas as queries de `search.service.ts`/`ingestion.service.ts` por organização | M | Backend + DBA |
| DB-002 | Retrofitar política RLS em `Prospect` e `AIPendingAction` | S | Backend |
| SEC-004 | Corrigir SSRF do Bitrix24 (allowlist de domínio, bloqueio de IP privado/link-local, resolução de DNS antes do fetch) | S | Backend |
| DEVOPS-001 | Reativar passo de teste em `production.yaml`; adicionar gate de aprovação manual antes de publish em produção | S | DevOps |

**Critério de saída da Fase 0:** nenhuma sessão pode ser criada sem senha válida; nenhuma consulta de conhecimento/IA retorna dado de outro tenant; nenhuma imagem chega a produção sem teste executado.

---

## Fase 1 — Estabilização
**Objetivo:** reduzir a superfície de erros silenciosos e de confiança em dado fabricado.

- BACK-003: remover fallback de métricas fabricadas em `analytics.routes.ts`; retornar erro real quando o banco falhar.
- ARCH-006 / FRONT-005: identificar todos os pontos de dado simulado (`Math.random()`, `alert()`, `setTimeout`) na UI de prospecção e CRM; ou implementar de fato, ou colocar atrás de um indicador visível de "demonstração".
- IA-003: corrigir o mismatch de tipo entre `SwarmOrchestrator.sdrNode` e `SDRQualificationAgent.run`.
- IA-005: implementar o executor de `AIPendingAction` aprovadas, ou remover a promessa de "aprovar = enviar" da UI.
- SEC-007: remover defaults inseguros de `NODE_ENV`/`ALLOW_DEV_AUTH_BYPASS`; adicionar assert de boot.
- SEC-005: mover sessão do WhatsApp para armazenamento chaveado por tenant (Redis).
- OBS-001: aplicar gate real às flags `EXPOSE_METRICS`/`ENABLE_SEARCH`.
- BACK-002: corrigir drift entre `API_RATE_LIMIT_MAX` (env) e valor hardcoded em `server.ts`.
- DEVOPS-003: remover um dos dois manifests ArgoCD conflitantes de homolog.
- Validar em CI (não sandboxado) se `npm run lint`/`npm run build` realmente falham por memória insuficiente do projeto ou se foi limitação apenas do ambiente desta auditoria.

---

## Fase 2 — Qualidade e Testes
**Objetivo:** cobrir os fluxos de maior risco identificados como "zero cobertura".

- Ver `07-PLANO-DE-TESTES.md` para a lista completa por fluxo.
- Prioridade: autenticação real (pós Fase 0), RBAC ponta-a-ponta, integração WhatsApp/Google (mesmo que mockadas, testar contrato), fluxo de qualificação de IA (incluindo o bug do Swarm corrigido em IA-003).
- Adicionar `test:e2e` real ao `ci.yml`; escrever ao menos os specs de login, CRUD de lead e navegação principal.
- Resolver o conflito de porta entre `docker-compose.yml` (5434) e os *service containers* do `ci.yml`, e versionar/gerar `.env.test` no pipeline.
- Adotar `msw` de forma consistente para mocks de HTTP no frontend, substituindo as estratégias ad hoc.

---

## Fase 3 — Arquitetura
**Objetivo:** consolidar a camada de domínio e reduzir acoplamento cruzado.

- ARCH-001: decidir formalmente quais features são "core transacional" (camadas completas) vs "UI-only", documentar a decisão.
- ARCH-002: decompor `ProspectingHub.tsx`, `ChatbookHub.tsx`, `FloatingChatbook.tsx` em arquivos por responsabilidade.
- ARCH-003: mover acesso direto ao Prisma em `analytics.routes.ts`/`intelligence.routes.ts`/`prompt.routes.ts` para serviços dedicados.
- ARCH-007: extrair `BaseUseCases` genérico para eliminar duplicação de CRUD.
- ARCH-008: promover `enrichCompany`, `contact-links`, `icp-options` para `src/shared/`.
- ARCH-004: remover código órfão de `server/marketplace/partners/`.
- Ver `06-ARQUITETURA-ATUAL-E-ALVO.md` para o diagrama alvo.

---

## Fase 4 — Performance e Escala
**Objetivo:** preparar o sistema para múltiplas instâncias e crescimento de dados.

- ARCH-005: mover estado de circuito de IA e sessão WhatsApp para Redis (pré-requisito para escalonamento horizontal real).
- BACK-004: adicionar paginação a `activity.service.ts`; corrigir busca em memória em `prospecting.service.ts`.
- DB-004: adicionar índices ausentes, incluindo índice ANN para busca vetorial.
- IA rate limiting por tenant em vez de por IP; cobrir `/api/agent/*` com limitador de IA dedicado.
- Reavaliar o peso de dependências (three.js, xlsx, mammoth não usado) para reduzir tempo/memória de build.

---

## Fase 5 — Evolução
**Objetivo:** modernização e fechamento de lacunas funcionais conhecidas.

- BACK-005: decidir sobre implementar OAuth real do Google ou remover a feature da UI até lá.
- BACK-006: implementar persistência real de mensagens recebidas do WhatsApp; adicionar backoff de reconexão.
- BACK-007: implementar enriquecimento real de empresa (hoje simulado) ou documentar explicitamente como roadmap futuro na UI.
- IA-001/IA-002: decidir sobre restaurar crédito Gemini real ou renomear os aliases de modelo para refletir o roteamento real; consolidar as duas pipelines de embedding.
- IA-006/IA-007: adicionar minimização de PII na entrada de prompts e centralizar o aviso de "dado não confiável".
- DEVOPS-004: representar o deploy de produção no repositório (Terraform/manifest/ArgoCD Application real).
- DEP-005: decidir sobre integrar `chatbook/` ao monorepo ou removê-lo.
- Adicionar documentação OpenAPI para a superfície de API.
- Consolidar/depreciar relatórios antigos em `docs/reports/` em favor desta auditoria e de futuras atualizações incrementais.
