# Plano de Segurança

Metodologia: OWASP Top 10 / classes CWE. Nenhuma exploração destrutiva foi realizada — todos os achados vêm de leitura estática de código. Nenhum segredo real é reproduzido neste documento; valores encontrados foram mascarados.

## Status da Remediação (atualizado em 2026-08-01)

| ID | Status | Observação |
|---|---|---|
| SEC-001 | ✅ Corrigido e verificado ao vivo | `Login.tsx` removido; conta fora da allowlist |
| SEC-002 | ✅ Corrigido e verificado ao vivo | `AuthContext.tsx` deriva de `authClient.useSession()` real |
| SEC-003 | ✅ Corrigido e verificado ao vivo | `LoginScreen.tsx` chama `authClient.signIn.email` real; `PRESET_USERS` removido |
| SEC-004 | ✅ Corrigido | `Bitrix24Adapter.ts` valida HTTPS + rejeita IP privado/reservado antes do fetch |
| SEC-005 | ✅ Corrigido | Sessão WhatsApp agora chaveada por `organizationId`; reconexão com backoff limitado |
| SEC-006 | ⚠️ Parcialmente corrigido | `seed_users.ts` não hardcoda mais senhas em texto puro; **rotação da credencial real exposta e reescrita do histórico do Git seguem pendentes — decisão do usuário, não executadas unilateralmente** |
| SEC-007 | ✅ Corrigido | Defaults inseguros de `NODE_ENV`/`ALLOW_DEV_AUTH_BYPASS` removidos; assert de boot adicionado |
| SEC-008 | ✅ Corrigido | Rate limiter dedicado (20/15min) em `/api/auth`; `aiLimiter` estendido a `/api/agent` |
| SEC-009 | ✅ Corrigido | `session`/`advanced` (cookies httpOnly/sameSite/secure) explícitos em `src/lib/auth.ts` |
| SEC-010 | ⚠️ Corrigido, não verificado em produção | CSP customizada adicionada a `server.ts`; ambiente sandboxed desta sessão não permitiu build de produção para validação ao vivo — recomenda-se checagem em staging/homolog |
| SEC-011 | ✅ Corrigido | Fallback de credenciais MinIO removido de `src/lib/storage/index.ts` |
| SEC-012 | ❌ Não endereçado | Mecanismos de direito do titular (LGPD) seguem ausentes — fora do escopo desta rodada |
| SEC-013 | ⚠️ Parcialmente corrigido | `minimizePii`/`rehydratePii` (`guardrails.service.ts`) implementados e cobertos por teste unitário; aplicados no chokepoint principal de geração de conteúdo (`AIService.generateContent`, via `buildLeadContext`). **Não** aplicado aos ~14 helpers soltos em `src/lib/ai/features.ts` nem aos agentes LangGraph (`sdr-agent.ts`, `graphs/leadQualification.ts`, `crmTools.ts`), que continuam enviando PII sem minimização — requer refatoração mais ampla dos call-sites |

---

## Achados novos (2026-08-01, descobertos durante DB-001/DB-002 — fora do escopo original desta auditoria, registrados e não corrigidos nesta sessão salvo indicação contrária)

### N1 — CRÍTICO — RLS não protege nada em produção: a aplicação sempre conecta como superusuário do Postgres
- **Evidência:** `k8s/postgres-statefulset.yaml` e `docker-compose.yml` só configuram `POSTGRES_USER`/`POSTGRES_PASSWORD` — o mecanismo de bootstrap do Postgres torna esse usuário **superusuário**, e não existe em nenhum lugar do repositório a criação de um papel de aplicação restrito (`NOSUPERUSER`) com `GRANT` explícito. `DATABASE_URL` em todo ambiente (local, docker-compose, k8s) aponta para esse mesmo papel.
- **Por que isso importa:** o Postgres documenta explicitamente que RLS (mesmo com `FORCE ROW LEVEL SECURITY`) **nunca** se aplica a um superusuário. Confirmado empiricamente nesta sessão: com o papel `postgres` (superusuário), uma leitura sem nenhum `app.current_tenant_id` setado retornou linhas de qualquer tenant; com um papel de teste criado como `NOSUPERUSER`, o isolamento funcionou exatamente como as políticas descrevem.
- **Impacto real:** **todas** as políticas RLS já criadas neste projeto — as de `Company`/`Contact`/`Lead`/`Activity`/`User`/`Organization` (migration `20260722020322_enable_rls`), `Document`/`DocumentChunk` (`20260731170000`), `Automation`/`Notification`/`AILog` (`20260731200000`), e as novas de `KnowledgeChunk`/`Prompt`/`AgentMemory`/`Prospect`/`AIPendingAction` desta sessão — hoje não oferecem nenhuma proteção real. O item L5 deste documento ("o padrão de isolamento de tenant no domínio central é sólido") descrevia corretamente o filtro **de aplicação** (`getTenantPrisma`, `organizationId` explícito nas queries), que é o que de fato protege hoje — a camada de RLS no banco é, na prática, decorativa até este achado ser corrigido.
- **Correção necessária (não executada — decisão do usuário, mexe em infraestrutura de todos os ambientes):** criar um papel de aplicação `NOSUPERUSER` com `GRANT` nas tabelas/sequências necessárias, migrar `DATABASE_URL`/secrets (docker-compose, k8s `prospector-secrets`, `.env` local) para esse papel, e validar que a aplicação continua funcionando sem privilégios de superusuário (ex.: `CREATE EXTENSION vector` deixa de funcionar automaticamente — precisa rodar uma vez como superusuário na criação do banco).

### N2 — BAIXO — Política RLS de `AILog` esconde registros "não atribuídos" de todos os tenants, não só de quem não tem contexto
- **Evidência:** a política de `AILog` (migration `20260731200000`) é `USING (current_setting('app.current_tenant_id') = "organizationId" OR bypass_rls = 'on')`, sem `OR "organizationId" IS NULL`. `src/features/billing/usage.service.ts:78` conta explicitamente `organizationId: null` como métrica "chamadas não atribuídas" exibida a **qualquer** tenant autenticado na tela de Consumo.
- **Impacto:** quando N1 for corrigido (RLS passar a valer de verdade), essa contagem sempre retornará 0, silenciosamente, para todo mundo.
- **Correção sugerida (não executada):** nova migration com `ALTER POLICY` adicionando `OR "organizationId" IS NULL` à política de `AILog`.

### N3 — BAIXO — `prompt.routes.ts` (POST/PUT) está com uma schema-shape incompatível com `validateRequest`, pré-existente
- **Evidência:** `validateRequest` (`src/shared/middlewares/validateRequest.ts:7`) faz `req.body = await schema.parseAsync(req.body)`, mas `createPromptSchema`/`updatePromptSchema` em `prompt.routes.ts` são `z.object({ body: z.object({...}) })` — esperam um `req.body.body` aninhado que nenhum cliente normal envia. Confirmado ao vivo: um POST com `{name, category, variables}` (o formato que `PromptStudio.tsx` de fato envia) recebe 400 "expected object, received undefined". Outras rotas do projeto (ex. `companySchema` em `src/lib/zod.ts`) usam schema plano, sem esse wrapper — é uma anomalia isolada deste arquivo, não do padrão geral.
- **Impacto:** os endpoints de criar/editar prompt customizado nunca funcionaram para um cliente HTTP normal; isso é anterior a esta sessão (não foi introduzido pela correção de DB-001/IDOR feita agora, que está correta na camada de dados — validada diretamente via Prisma, contornando esse bug de validação).
- **Correção sugerida (não executada):** trocar o schema para plano (`z.object({ name, category, variables })`) igual às demais rotas, ou trocar `validateRequest` para validar `{ body, query, params }` — decisão de qual convenção manter é do time.

### N4 — INFORMATIVO — `PromptStudio.tsx` é um componente órfão, nunca importado por nenhuma rota/tela
- **Evidência:** `grep` por `PromptStudio` no `src/` só encontra a própria definição do componente. Não há import em nenhum outro arquivo.
- **Impacto:** nenhum (código morto, sem superfície de risco), mas explica por que N3 nunca foi notado — a única UI que chamaria essas rotas nunca é renderizada.

---

## CRÍTICO

### SEC-001 — Autenticação backdoor hardcoded
- **Classe:** CWE-287 (Broken Authentication) / CWE-798 (Hard-coded Credentials)
- **Localização:** `src/features/auth/components/Login.tsx:11-36`, `src/config/access-policy.ts:4`
- **Evidência:** o componente `Login.tsx` executa `authClient.signUp`/`signIn` automaticamente contra o backend real do better-auth usando uma conta hardcoded (`admin@prospector.com` / senha fixa). Esse e-mail está presente em `AUTHORIZED_LOGIN_EMAILS`, a allowlist server-side que decide quem pode logar.
- **Impacto:** qualquer visitante que alcance esse componente se autentica como uma conta permitida pelo servidor, com uma senha publicamente conhecida (está no próprio código-fonte).
- **Mitigação:** remover o componente inteiro; remover a conta da allowlist; auditar se essa conta foi usada e, em caso positivo, tratar como possível comprometimento (revisar logs/auditoria de acesso desse usuário).
- **Critério de validação:** tentativa de acessar/logar com essas credenciais deve falhar após a correção; teste automatizado cobrindo esse caso específico (ver `07-PLANO-DE-TESTES.md`).

### SEC-002 — Bypass incondicional de sessão no frontend
- **Classe:** CWE-287
- **Localização:** `src/contexts/AuthContext.tsx:34-56`
- **Evidência:** `currentUser` é um objeto hardcoded (`role: 'admin'`, `permissions: ['all']`), nunca derivado de `authClient.useSession()`; `canAccessAdminPanel()`/`canAccessBrand()` sempre retornam `true`. `src/components/layout/ProtectedRoute.tsx` verifica apenas `if (!currentUser)`, que nunca é verdadeiro.
- **Impacto:** todo o sistema de rotas protegidas (`/app/*`) é, na prática, público e com privilégio de administrador total.
- **Mitigação:** substituir `currentUser` por dados reais da sessão (`authClient.useSession().data`), mapeados para `UserSession`; implementar `canAccessAdminPanel`/`canAccessBrand` contra papel/permissão reais vindos do servidor.

### SEC-003 — Login por correspondência de e-mail sem checagem de senha
- **Classe:** CWE-287
- **Localização:** `src/features/auth/components/LoginScreen.tsx:50-73`
- **Evidência:** o branch `matchedByEmail` autentica o usuário localmente se o e-mail digitado corresponder a um preset ou passar em `isAuthorizedLoginEmail()`, **sem nunca validar a senha**.
- **Impacto:** conhecer (ou adivinhar) um e-mail corporativo válido é suficiente para logar como aquele usuário.
- **Mitigação:** remover `PRESET_USERS`; toda tentativa de login deve chamar `authClient.signIn.email` e aguardar validação real do servidor.

---

## ALTO

### SEC-004 — SSRF autenticado via `webhookUrl` (export Bitrix24)
- **Classe:** CWE-918
- **Localização:** `src/lib/adapters/crm/Bitrix24Adapter.ts:38,63,82,112`, chamado a partir de `LeadUseCases.exportLeadToBitrix`
- **Evidência:** o servidor faz `fetch()` para uma URL fornecida pelo usuário autenticado, incluindo PII de lead/contato/empresa no corpo, e retorna a resposta ao chamador.
- **Impacto:** qualquer usuário autenticado (de qualquer tenant) pode apontar `webhookUrl` para infraestrutura interna (Redis, Postgres, Meilisearch, serviço de metadados de nuvem, outros serviços do cluster k8s por DNS interno) e usar o servidor como proxy de reconhecimento/exfiltração.
- **Mitigação:** allowlist de domínios Bitrix24 conhecidos; resolver o DNS e rejeitar IPs privados/link-local/loopback antes do fetch (proteção contra DNS rebinding); não ecoar o corpo da resposta verbatim ao cliente.

### SEC-005 — Sessão WhatsApp compartilhada entre tenants
- **Classe:** CWE-284 (Improper Access Control)
- **Localização:** `src/features/integrations/whatsapp/whatsapp.service.ts:12-14`
- **Evidência:** `sock`, `currentQr`, `status` são variáveis de módulo — uma única sessão para todo o deployment, não por `organizationId`, apesar das rotas exigirem `requireTenant`.
- **Impacto:** qualquer usuário autenticado de qualquer tenant pode ver o QR code, desconectar ou enviar mensagens através do número de outro tenant.
- **Mitigação:** chavear socket/QR/status por `organizationId` (Redis), segregar o diretório de auth-state (`whatsapp_auth/`) por tenant, adicionar checagem de autorização por tenant nas rotas.

### SEC-006 — Credenciais reais expostas em texto puro no histórico do Git
- **Classe:** CWE-798 / CWE-312 (Cleartext Storage of Sensitive Information)
- **Localização:** `seed_users.ts` (raiz do repositório)
- **Evidência:** o script contém e-mails corporativos reais (domínios `atlasgr.com.br`/`totaltrac.com.br`) associados a senhas em texto puro hardcoded. **O valor da senha não é reproduzido neste relatório** — tipo do segredo: senha de conta de aplicação/e-mail corporativo em texto puro; localização: `seed_users.ts`, bloco de definição de usuários seed.
- **Impacto:** qualquer pessoa com acesso ao repositório (atual ou histórico) pode recuperar essas credenciais; risco de reuso de senha em outros sistemas.
- **Recomendação:** **rotacionar imediatamente** a(s) credencial(is) da(s) conta(s) real(is) listada(s) no arquivo; remover o arquivo do histórico do Git (`git filter-repo` ou BFG Repo-Cleaner); mover seed de usuários para geração de senha aleatória via variável de ambiente, nunca hardcoded.

### SEC-007 — Bypass de autenticação de desenvolvimento com defaults inseguros
- **Classe:** CWE-489 (Leftover Debug Code) / CWE-1188 (Insecure Default)
- **Localização:** `src/config/env.ts:6,20`
- **Evidência:** `NODE_ENV` tem default `'development'`; `ALLOW_DEV_AUTH_BYPASS` tem default `'true'` se a variável de ambiente não estiver definida. `authenticateToken.ts` faz a checagem dupla correta (`NODE_ENV !== 'development' || !ALLOW_DEV_AUTH_BYPASS`), e o `Dockerfile`/Helm fixam `NODE_ENV=production` — portanto **funciona hoje**, mas depende de dois arquivos de configuração permanecerem sincronizados.
- **Impacto:** qualquer caminho de deploy que não passe exatamente pelo Dockerfile/Helm documentados (execução direta em host, orquestrador mal configurado, `.env` sem `NODE_ENV`) reverte silenciosamente para bypass de autenticação habilitado.
- **Mitigação:** remover os defaults inseguros (sem default para `NODE_ENV`, default `false` para o bypass); adicionar um assert de boot que recusa subir se `NODE_ENV==='production'` e o bypass estiver ativo por qualquer motivo.

---

## MÉDIO

### SEC-008 — Rate limiting genérico em endpoints de autenticação
- **Localização:** `server.ts:90-100,144`
- **Evidência:** o mesmo `apiLimiter` (500 req/15min por IP) cobre `/api/auth/*`; não há limitador dedicado e mais restritivo para login/reset de senha.
- **Mitigação:** limitador dedicado (5-10 tentativas/15min por IP+e-mail) para `/api/auth/sign-in`, `/sign-up` e reset de senha.

### SEC-009 — Cookies/sessão do better-auth sem hardening explícito
- **Localização:** `src/lib/auth.ts:29-116`
- **Evidência:** nenhum bloco `session`/`advanced.useSecureCookies`/`cookies` explícito — depende de defaults da biblioteca, cujo comportamento (secure/httpOnly/sameSite) é condicionado por `NODE_ENV` (ver SEC-007).
- **Mitigação:** declarar explicitamente `session: { expiresIn, updateAge }` e `advanced: { useSecureCookies: true, defaultCookieAttributes: { sameSite: 'lax', httpOnly: true, secure: true } }`.

### SEC-010 — CSP implícito, sem política customizada
- **Localização:** `server.ts:67-69`
- **Evidência:** `contentSecurityPolicy` é `undefined` (default do Helmet) em produção e `false` fora dela — sem política ajustada às origens reais de script/estilo/conexão da aplicação.
- **Mitigação:** definir CSP explícita; confirmar que `TRUST_PROXY` está corretamente configurado em produção para que HSTS funcione atrás do balanceador.

### SEC-011 — Credenciais default hardcoded (MinIO)
- **Localização:** `src/lib/storage/index.ts:6-7`
- **Evidência:** fallback para `minioadmin`/`minioadmin` se variáveis de ambiente ausentes. Não utilizado atualmente (nenhuma rota chama `getUploadUrl`/`getDownloadUrl`), mas é uma armadilha latente se a feature for ativada sem configurar credenciais reais.
- **Mitigação:** remover o fallback; falhar explicitamente se as credenciais não estiverem configuradas.

### SEC-012 — Ausência de mecanismos LGPD
- **Localização:** todo o `src/` (busca não encontrou implementação)
- **Evidência:** nenhum endpoint de exportação/eliminação de dados pessoais, consentimento ou retenção; único artefato relacionado é uma string de marketing em `brandMatrices.ts:181` afirmando "conformidade total com a LGPD".
- **Mitigação:** implementar direitos do titular (acesso, correção, eliminação, portabilidade) antes de manter essa afirmação em produto; documentar base legal para tratamento de dados de contatos/leads.

### SEC-013 — PII enviada a provedores de IA externos sem minimização de entrada
- **Localização:** `src/features/intelligence/services/guardrails.service.ts`, `ai.service.ts::buildLeadContext`, `agents/sdr-agent.ts`
- **Evidência:** `redactSensitiveData` só mascara CPF e apenas na saída do modelo; nome, cargo, e-mail e dados de empresa são enviados como texto de prompt para Groq/OpenAI/Gemini sem qualquer redação na entrada.
- **Mitigação:** estender `guardrails.service.ts` para pseudonimizar dados de entrada (substituir nome por token, re-hidratar na resposta final); documentar a relação de subprocessador para fins de LGPD.

---

## BAIXO / INFORMATIVO

- **L1.** `google.service.ts` é inteiramente mockado — não é atualmente explorável, mas ao implementar OAuth real, garantir `state`/PKCE contra CSRF.
- **L2.** `jsonwebtoken` é dependência direta sem nenhum uso real em `src/` — superfície de supply-chain desnecessária, seguro remover após dupla checagem.
- **L3.** Segredos em manifests k8s/Helm/ArgoCD são referenciados corretamente via `secretRef`/valores comentados — nenhum segredo real commitado nesses arquivos.
- **L4.** CORS em desenvolvimento reflete qualquer origem com `credentials: true` — aceitável por ser gated a `NODE_ENV !== 'production'`, mas herda a fragilidade de SEC-007.
- **L5. (positivo, com ressalva adicionada em 2026-08-01 — ver achado N1)** O padrão de isolamento de tenant no domínio central (`getTenantPrisma`, injeção de `organizationId` derivado do usuário autenticado) é sólido — nenhum IDOR foi encontrado nos controllers de Company/Contact/Lead amostrados. Deve ser preservado como padrão de referência ao estender `DB-001`/`DB-002`. **Esse filtro de aplicação é hoje a única proteção real de tenant que funciona de fato** — a camada de RLS no Postgres, que complementaria como defesa em profundidade, está neutralizada em todos os ambientes porque a aplicação sempre conecta como superusuário (ver N1).
- **Risco já aceito e documentado formalmente:** vulnerabilidade conhecida do `better-auth` (`docs/ADR/ADR-001-BetterAuth-Vulnerability.md`, `docs/RiskRegister/RISK-001-BetterAuth.md`) — não tratado como achado novo, apenas referenciado; monitorar release estável 1.7.x.

---

## Tabela-Resumo

| ID | Achado | Classe | Severidade |
|---|---|---|---|
| SEC-001 | Login backdoor hardcoded | CWE-287/798 | Crítico |
| SEC-002 | Bypass incondicional de sessão no frontend | CWE-287 | Crítico |
| SEC-003 | Login sem checagem de senha | CWE-287 | Crítico |
| SEC-004 | SSRF via webhookUrl (Bitrix24) | CWE-918 | Alto |
| SEC-005 | Sessão WhatsApp cross-tenant | CWE-284 | Alto |
| SEC-006 | Credenciais reais em texto puro no Git | CWE-798/312 | Alto |
| SEC-007 | Defaults inseguros de bypass de dev-auth | CWE-489/1188 | Alto |
| SEC-008 | Rate limit genérico em auth | CWE-307 | Médio |
| SEC-009 | Cookies/sessão sem hardening explícito | CWE-614 | Médio |
| SEC-010 | CSP implícito | CWE-1021 | Médio |
| SEC-011 | Credenciais default MinIO | CWE-798 | Médio |
| SEC-012 | Ausência de mecanismos LGPD | — | Médio |
| SEC-013 | PII sem minimização de entrada para IA | — | Médio |
| L1-L5 | Ver acima | — | Baixo/Info |

**Prioridade imediata:** SEC-001, SEC-002, SEC-003 (sem estas correções, nenhuma outra medida de segurança tem efeito prático), seguidas de SEC-006 (rotação de credencial real exposta) e SEC-004 (SSRF).
