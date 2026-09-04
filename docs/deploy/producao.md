# Guia de Produção — AtlasGR / Prospector-Atlas

> **Status real (2026-09-02): modo local-first ENCERRADO, arquitetura reativada — migração
> Supabase → Neon EM ANDAMENTO, produção ainda no Supabase.** O critério de saída documentado em
> `docs/development/LOCAL_FIRST.md` ("Critério para voltar à produção") foi cumprido e confirmado
> pelo dono do repositório. `render.yaml` voltou a ter deploy automático
> (`autoDeployTrigger: commit`) e o serviço `prospector-atlas` está em `plan: starter` (Render).
> **O Render ainda aponta para o Supabase de produção** — a decisão foi trocar para Neon (motivo:
> pay-as-you-go sem mínimo mensal, e o plano pago Launch do Neon inclui PITR de 7 dias sem custo
> extra, enquanto o Supabase cobra US$100/mês à parte por isso), mas o corte do `DATABASE_URL` do
> Render ainda não foi aplicado — depende de confirmação explícita. O que já existe hoje: projeto
> Neon `prospector-atlas` no **free tier** (não no Launch pago ainda — free tier só tem 6h de PITR,
> não os 7 dias do Launch) com todos os dados de produção já migrados e validados (seção 1). Este
> guia descreve tanto o estado real atual (Render↔Supabase) quanto a arquitetura de destino
> (Render↔Neon) — as seções abaixo já documentam Neon como o banco, revise a data desta nota antes
> de assumir que o corte já aconteceu. Ver `docs/development/LOCAL_FIRST.md` para o histórico da
> fase local-first (mantido como registro, não apagado).

Este documento é o guia único para colocar (ou manter) a aplicação em produção. Ele assume a
decisão arquitetural tomada nesta rodada: **monólito único no Render** (o mesmo serviço Express
serve a API e o build estático do frontend Vite — ver `server.ts`), **Postgres no Neon + Storage
no Cloudflare R2**, e **Cloudflare como DNS/CDN na frente do domínio público**. Não há split
Vercel/Render porque isso exigiria reescrever autenticação (Better Auth) para cookies
cross-domain — risco de quebrar login sem necessidade real, já que o monólito atual já serve os
dois com um único domínio.

## Arquitetura

```
Usuário → Cloudflare (DNS + CDN + WAF) → Render (Node/Express: API + estático do Vite) → Neon (Postgres) + R2 (Storage)
                                                    ↓
                                          Redis opcional (BullMQ / rate-limit distribuído)
```

## 1. Banco de dados — Neon

Um projeto Neon de produção já foi provisionado nesta sessão via MCP:

- **Projeto**: `prospector-atlas`
- **Project ID**: `lingering-silence-85871098`
- **Região**: `aws-us-east-1` (N. Virginia) — escolhida de propósito para ficar perto da região do
  Render (Oregon hoje; Virginia é a mais próxima do Brasil que o Render oferece — não existe
  região São Paulo no Render), já que o roundtrip app↔banco pesa mais que browser↔app numa
  aplicação com várias queries por request.
- **Postgres**: 17, schema aplicado via `npx prisma migrate deploy` (as mesmas migrations do
  Prisma usadas em qualquer outro ambiente — nenhum schema criado manualmente).
- **Duas roles, papéis diferentes** (diferente do Supabase, onde uma única role bastava):
  - `prospector_app` — dona de todas as tabelas, tem DDL (CREATE/ALTER). **Sempre vem com
    BYPASSRLS** porque foi criada via API/console do Neon — toda role provisionada assim entra
    automaticamente no grupo `neon_superuser`, e isso não pode ser revertido via SQL (só
    superusuário real consegue, e nenhuma role de projeto tem isso no Neon). Use **só** para
    migrations (`DIRECT_URL`), nunca para tráfego de aplicação.
  - `prospector_runtime` — criada via `CREATE ROLE` (SQL puro, não a API do Neon) especificamente
    para **não** cair no grupo `neon_superuser`— confirmado sem BYPASSRLS. Tem apenas
    SELECT/INSERT/UPDATE/DELETE nas tabelas (via `GRANT` + `ALTER DEFAULT PRIVILEGES FOR ROLE
    prospector_app`, para que tabelas novas de migrations futuras também concedam acesso
    automaticamente). Esta é a role do tráfego real (`DATABASE_URL`) — testado e confirmado que
    RLS bloqueia sem contexto de tenant (`app.current_tenant_id`) e libera com o tenant certo.

### 1.1 Obter as connection strings

1. Dashboard: [console.neon.tech](https://console.neon.tech) → projeto `prospector-atlas`.
2. **Connection string** (aba Connect) → selecione a role desejada:
   - `prospector_runtime` → vira `DATABASE_URL` no Render.
   - `prospector_app` → vira `DIRECT_URL` no Render (**obrigatória aqui**, diferente do Supabase
     onde era opcional — `prospector_runtime` sozinha não tem privilégio pra `prisma migrate
     deploy`; sem `DIRECT_URL`, `prisma.config.ts` cairia para `DATABASE_URL` e a migration
     falharia por falta de DDL).
   - Ambas usam o mesmo host pooler: `ep-flat-thunder-auro8d82-pooler.c-10.us-east-1.aws.neon.tech`,
     banco `prospector`, parâmetros `?channel_binding=require&sslmode=require`.
3. As senhas foram geradas nesta sessão e **entregues a você diretamente no chat** (não estão em
   nenhum arquivo do repositório). Se perder alguma, use `reset_postgres_role_password` (Neon MCP)
   ou o dashboard → Roles → Reset password.

### 1.2 Migração de dados (Supabase → Neon)

Já executada e validada nesta sessão:
- `pg_dump --data-only` do Supabase (via Session Pooler — a Direct Connection do Supabase só tem
  endereço IPv6, sem rota de saída no Docker do Windows usado nesta migração) → `pg_restore` no
  Neon.
- Todas as tabelas com dado real conferidas linha a linha contra o Supabase: `Company` (257),
  `Contact` (278), `Lead` (187), `Organization` (1), `user` (4), `AuditLog` (891), etc. — contagens
  idênticas.
- Removido um registro de fixture de teste E2E (`MarketIntelligenceDataset` id
  `e2e-fixture-cnpj-active`) que uma migration do Prisma insere ao rodar contra um banco vazio —
  achado à parte, não específico desta migração (vale revisar a migration que faz isso).
- Uso atual: ~40 MB dos 512 MB do free tier do Neon (7,8%).

### 1.3 Storage (uploads) — Cloudflare R2, S3-compatível

- `src/lib/storage/index.ts` usa o SDK `@aws-sdk/client-s3` genérico — funciona contra MinIO (dev
  local), Cloudflare R2 ou Supabase Storage sem mudança de código, só trocando env vars. Neon não
  tem storage de objetos, então a troca para Neon também exige sair do Supabase Storage.
- R2 precisa ser habilitado manualmente uma vez no [dashboard da Cloudflare](https://dash.cloudflare.com)
  → R2 → "Enable R2" (tem tier gratuito: 10 GB, sem cobrança de egress) — não é possível via API
  sem esse opt-in de conta primeiro.
- Depois de habilitado, criar bucket `prospector-assets` e gerar credenciais S3 (R2 → bucket →
  **Manage API tokens**), configurar no Render:
  ```
  STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
  STORAGE_REGION=auto
  STORAGE_BUCKET=prospector-assets
  STORAGE_ACCESS_KEY_ID=<gerado no R2>
  STORAGE_SECRET_ACCESS_KEY=<gerado no R2>
  ```
- **Nota de escopo**: `getUploadUrl`/`getDownloadUrl` existem no código mas ainda não estão
  conectados a nenhuma rota HTTP (não há endpoint `/api/uploads` ainda) — hoje é infraestrutura
  pronta para uso, não uma feature exposta. Ver Roadmap.

### 1.4 Extensões e RLS

- `vector` (pgvector) — Neon suporta a extensão nativamente; habilitar via migration se alguma
  feature passar a depender dela (hoje as tabelas de embeddings existem no schema mas com 0 linhas
  em produção).
- RLS multi-tenant já aplicado em todas as tabelas que precisam (ver migrations
  `20260722020322_enable_rls`, `20260731170000_knowledge_base_tenant_scope`,
  `20260801120000_tenant_scope_ai_memory_prompts_and_rls`) e **validado empiricamente no Neon**
  nesta sessão (seção 1 acima).
- Achado herdado da auditoria original (não corrigido nesta sessão, fora do escopo do
  provisionamento): a política RLS de `AILog` não tem `OR "organizationId" IS NULL`, então
  registros de custo de IA "não atribuídos" ficam invisíveis fora de `bypass_rls`. Ver nota em
  `20260801120000_tenant_scope_ai_memory_prompts_and_rls/migration.sql`.

## 2. Backend + Frontend — Render

O `render.yaml` na raiz do repositório é um Blueprint: importe-o uma vez e o Render provisiona o
serviço a partir dele.

### 2.1 Primeira configuração

1. [Dashboard do Render](https://dashboard.render.com) → **New → Blueprint** → conecte o
   repositório GitHub → selecione a branch de produção (`main`).
2. O Render lê `render.yaml` e cria o serviço `prospector-atlas` (web, Node, `plan: starter` —
   exige cartão cadastrado no workspace; `preDeployCommand` só existe em planos pagos, ver seção
   2.2). Não cria mais um Postgres do Render — o banco é o Neon externo (seção 1).
3. Em **Environment**, preencha todas as variáveis marcadas `sync: false` no `render.yaml`:

   | Variável | Valor |
   | --- | --- |
   | `DATABASE_URL` | Connection string do Neon com a role `prospector_runtime` (seção 1.1) |
   | `DIRECT_URL` | **Obrigatória** — connection string do Neon com a role `prospector_app` (seção 1.1) |
   | `ALLOWED_ORIGINS` | `https://app.atlasgr.com.br` (mais qualquer outro domínio real que sirva o frontend) |
   | `BETTER_AUTH_URL` | `https://app.atlasgr.com.br` |
   | `PUBLIC_BASE_URL` | `https://app.atlasgr.com.br` |
   | `GOOGLE_MAPS_API_KEY`, `APOLLO_API_KEY`, `HUNTER_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY` | Chaves reais de cada provedor |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Credenciais OAuth do "Entrar com Google" (Better Auth) — sem elas o botão fica inerte |
   | `PLATFORM_OPERATOR_TOKEN` | Necessária para `/admin/queues` e `/metrics` deixarem de ser fail-closed |
   | `BITRIX24_WEBHOOK_URL`, `BIRTH_VOICES_WEBHOOK_SECRET` | Se as integrações estiverem em uso |
   | `STORAGE_*` | Seção 1.2 |
   | `REDIS_URL` | Opcional — ver seção 2.4 |

   `BETTER_AUTH_SECRET` já é gerado automaticamente pelo blueprint (`generateValue: true`).

4. Deploy manual da primeira vez (Render faz isso automaticamente ao importar o Blueprint).

### 2.2 O que roda em cada deploy (automático, sem intervenção manual)

Com o serviço conectado ao GitHub, **todo push na branch configurada** dispara, sem nenhum passo
manual:

1. Render clona o commit novo.
2. `buildCommand`: `npm ci --include=dev && npm run build` (build do Vite + bundle do server via
   esbuild).
3. `preDeployCommand`: `npx prisma migrate deploy` — roda numa instância efêmera separada, ANTES
   da nova instância receber tráfego, com a instância antiga ainda no ar (zero-downtime de
   verdade). Só migrations novas desde o baseline aplicado na seção 1 são executadas; se a
   migração falhar, o deploy é abortado antes mesmo de a instância nova ser criada. Disponível
   porque o serviço está em `plan: starter` — em `plan: free` esse recurso não existe
   (["The pre-deploy command is available for paid web services, private services, and background
   workers"](https://render.com/docs/deploys)), e a alternativa era rodar a migração dentro do
   `startCommand`.
4. Render bate em `healthCheckPath: /health/ready` (checa `SELECT 1` no banco, não só "processo
   no ar" — ver `server.ts`) até responder `200` antes de rotear tráfego pra ela.
5. Se a migração falhar ou o health check falhar, o deploy é abortado e a instância antiga
   continua servindo — nunca fica no ar uma versão quebrada.

> Corrigido nesta sessão: `healthCheckPath` apontava para `/api/health`, rota que não existe
> (cai no 404 genérico de `/api/*` em `server.ts`) — o Render não tinha como saber se o banco
> estava realmente acessível antes de rotear tráfego. Agora aponta para `/health/ready`.

### 2.3 Gate de qualidade antes do deploy

O Render **não** roda lint/typecheck/testes — só `buildCommand`. Quem gate isso é o GitHub:

- `.github/workflows/ci.yml` já roda lint, typecheck, testes unitários/integração/E2E e build em
  todo PR contra `main`.
- **Ação manual única recomendada** (não configurável via API neste momento): em
  **Settings → Branches** do repositório GitHub, adicione uma regra de proteção para `main`
  exigindo que o check `build-and-test` (de `ci.yml`) passe antes de permitir merge. Com isso,
  nada quebrado chega a `main` — e como o Render decoux o deploy `main`, nada quebrado é
  implantado, sem precisar de aprovação manual a cada deploy.
- Isso é **independente** do gate de aprovação manual já existente em
  `.github/workflows/production.yaml` (ambiente `production` do GitHub Actions) — aquele
  pipeline publica uma imagem Docker em `ghcr.io` para o caminho alternativo de deploy via
  Kubernetes/Helm/ArgoCD (`charts/`, `argocd/`, `k8s/`), não é usado pelo Render. Os dois
  pipelines coexistem sem conflito.

### 2.4 Redis (opcional)

`ENABLE_QUEUES`/filas BullMQ e rate-limit distribuído por Redis ficam desligados por padrão
(`REDIS_URL` vazia). Para habilitar: provisione um Redis (Render Key Value ou Upstash), defina
`REDIS_URL` e `ENABLE_QUEUES=true`. Sem Redis, a aplicação sobe normalmente — só os workers de
fila (leads, agente IA, enriquecimento, WhatsApp, Bitrix sync) ficam sem persistência entre
reinícios do processo e o rate-limit vira "por instância" em vez de global.

## 3. Domínio — Cloudflare

Sem tooling de DNS automatizado disponível nesta sessão (o conector Cloudflare conectado só
expõe R2/D1/KV/Workers, não gestão de zona DNS) — este passo é manual:

1. [Dashboard Cloudflare](https://dash.cloudflare.com) → **Add a site** → `atlasgr.com.br` (se
   ainda não estiver na Cloudflare) → siga o fluxo de troca de nameservers no seu registrador.
2. **DNS → Add record**:
   - Tipo `CNAME`, nome `app`, destino `prospector-atlas.onrender.com` (ou o hostname `.onrender.com`
     real do seu serviço, visível em Render → serviço → topo da página), proxy **ligado** (nuvem
     laranja) para ganhar CDN/WAF/DDoS protection na frente do Render.
3. No Render, **Settings → Custom Domains** → adicione `app.atlasgr.com.br` e siga a verificação
   (Render emite certificado TLS automaticamente via Let's Encrypt).
4. Cloudflare → **SSL/TLS** → modo **Full (strict)** — com o certificado do Render válido, isso
   evita o modo "Flexible" (que deixaria o tráfego Cloudflare↔Render sem TLS).
5. Atualize `ALLOWED_ORIGINS`, `BETTER_AUTH_URL` e `PUBLIC_BASE_URL` no Render para
   `https://app.atlasgr.com.br` e faça um novo deploy (ou "Clear build cache & deploy") para a
   mudança de env var surtir efeito.

> Por que não `app.birthhub.ai`: o prompt original citava esse domínio, mas o código deste
> repositório já referencia `atlasgr.com.br`/`totaltrac.com.br` como domínios corporativos reais
> (ver `.env.example`, `android-build.yml`). Trocar de domínio é decisão de negócio, não técnica —
> se `birthhub.ai` for o domínio correto, repita os passos acima substituindo o hostname.

## 4. CI/CD — GitHub Actions

Nada precisou mudar nos workflows existentes — já cobrem o necessário:

| Workflow | Função |
| --- | --- |
| `ci.yml` | Lint, typecheck, testes (unit/integration/E2E), build — todo push/PR em `main`/`develop` |
| `production.yaml` | Mesmo gate de testes + build de imagem Docker (`ghcr.io`) com aprovação manual — caminho K8s/Helm/ArgoCD, não usado pelo Render |
| `cd-homolog.yml` | Deploy de homologação (branch `develop`) via imagem Docker + Helm |
| `sonarqube.yml` | Análise estática de qualidade/cobertura |
| `deploy-pages.yml` | Publica build estático (sem backend) no GitHub Pages — gatilho manual (`workflow_dispatch`), não roda mais em todo push em `main`; não é a URL de produção nem um ambiente funcional (API não existe nesse build) |
| `android-build.yml` | Gera APK do app mobile via Capacitor |

O único ajuste recomendado (manual, seção 2.3) é a branch protection rule em `main` exigindo o
check de `ci.yml`.

## 5. Ambientes

| Ambiente | Branch | Banco | Deploy |
| --- | --- | --- | --- |
| Development | local | Docker Compose (`docker-compose.yml`, Postgres+pgvector local) | `npm run dev` |
| Homologação | `develop` | A definir (recomenda-se um segundo projeto Neon, free tier, mesma região da produção) | `cd-homolog.yml` → imagem Docker + Helm |
| Produção | `main` | Neon `prospector-atlas` (ref `lingering-silence-85871098`) (seção 1) | Auto-deploy Render (seção 2.2) |

Para criar o ambiente de homologação com o mesmo nível de isolamento, repita a seção 1 criando um
segundo projeto Neon (ex.: `prospector-atlas-staging`) e aponte as variáveis do serviço Render de
homologação (ou do Helm `values.yaml` em `charts/prospector-atlas/`) para ele.

## 6. Variáveis de ambiente — referência completa

Ver `.env.example` na raiz — todas as variáveis usadas pela aplicação estão documentadas lá, com
comentários explicando o efeito de cada uma. Nunca commite valores reais: `.env` está no
`.gitignore`, e no Render/GitHub Actions cada secret fica marcado `sync: false` (Render) ou como
GitHub Actions Secret, nunca hardcoded em `render.yaml`/workflow YAML.

## 7. Checklist de validação pós-deploy

- [ ] `GET https://app.atlasgr.com.br/health/live` → `200 { status: "ok" }`
- [ ] `GET https://app.atlasgr.com.br/health/ready` → `200` (confirma conexão real com o Neon)
- [ ] `GET https://app.atlasgr.com.br/` → carrega o SPA (index.html do build do Vite)
- [ ] Login (e-mail/senha e "Entrar com Google") funcionando via Better Auth
- [ ] `GET https://app.atlasgr.com.br/api/companies` (autenticado) retorna `200`, não `404`/`503`
- [ ] Criar um lead de teste e confirmar que só aparece para o tenant que o criou (RLS)
- [ ] IA: uma chamada a `/api/intelligence/*` completa sem erro de timeout/chave ausente
- [ ] Certificado TLS válido (cadeado no navegador) em `app.atlasgr.com.br`
- [ ] `ci.yml` verde no commit implantado (branch protection, seção 2.3)

## 8. URLs finais

| Serviço | URL |
| --- | --- |
| Aplicação (frontend + API) | `https://app.atlasgr.com.br` (após seção 3) — até lá, `https://prospector-atlas.onrender.com` |
| Health (liveness) | `/health/live` |
| Health (readiness, checa banco) | `/health/ready` |
| Documentação da API (Swagger) | `/api-docs` (só quando `EXPOSE_API_DOCS=true`) |
| Painel de filas (BullMQ) | `/admin/queues` (autenticado) |
| Métricas Prometheus | `/metrics` (só quando `EXPOSE_METRICS=true`) |
| Neon — projeto | `https://console.neon.tech` → projeto `prospector-atlas` |

## 9. Roadmap sugerido (não implementado nesta sessão)

1. **Conectar `getUploadUrl`/`getDownloadUrl` a uma rota real** (`/api/uploads`) — o storage está
   pronto (seção 1.3) mas nenhum endpoint HTTP o usa ainda.
2. **Homologação isolada de verdade**: segundo projeto Neon + segundo serviço Render (ou
   Preview Environments do Render) para `develop`, hoje só coberto pelo caminho Docker/K8s.
2. **Redis gerenciado** para habilitar `ENABLE_QUEUES=true` em produção (filas persistentes,
   rate-limit distribuído de verdade entre múltiplas instâncias).
3. **Branch protection + required reviewers** no ambiente `production` do GitHub — confirme que
   está configurado (o código já assume isso, ver comentário `DEVOPS-001` em `production.yaml`).
4. **Corrigir a política RLS de `AILog`** (seção 1.4) para não esconder custo de IA não atribuído
   de tenants legítimos.
5. **Autoscaling no Render** — plano pago (`starter`) já adotado (2026-09-02), mas ele sozinho não
   escala horizontalmente; revisar upgrade para um plano com autoscaling antes de picos de
   tráfego previstos.
6. **Habilitar R2 na conta Cloudflare** (painel, opt-in de conta) e criar o bucket
   `prospector-assets` — passo pendente antes do Storage funcionar no Neon (seção 1.3), já que o
   Neon não tem storage de objetos próprio.
7. **Ativar o add-on de PITR no Neon** se o time decidir que backup diário (incluso, seção 1) não
   é suficiente — US$100-400/mês adicionais dependendo da retenção, ver seção de custos discutida
   com o dono do repositório.
