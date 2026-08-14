# Guia de Produção — AtlasGR / Prospector-Atlas

Este documento é o guia único para colocar (ou manter) a aplicação em produção. Ele assume a
decisão arquitetural tomada nesta rodada: **monólito único no Render** (o mesmo serviço Express
serve a API e o build estático do frontend Vite — ver `server.ts`), **Postgres + Storage no
Supabase**, e **Cloudflare como DNS/CDN na frente do domínio público**. Não há split
Vercel/Render porque isso exigiria reescrever autenticação (Better Auth) para cookies
cross-domain — risco de quebrar login sem necessidade real, já que o monólito atual já serve os
dois com um único domínio.

## Arquitetura

```
Usuário → Cloudflare (DNS + CDN + WAF) → Render (Node/Express: API + estático do Vite) → Supabase (Postgres + Storage)
                                                    ↓
                                          Redis opcional (BullMQ / rate-limit distribuído)
```

## 1. Banco de dados — Supabase

Um projeto Supabase de produção já foi provisionado nesta sessão via MCP:

- **Projeto**: `atlasgr-prospector-production`
- **Project ref**: `hzttamzvokacmcnrfkrm`
- **Região**: `sa-east-1` (São Paulo)
- **Postgres**: 17.6, com a extensão `vector` (pgvector) habilitada
- **Migrations**: as 35 migrations de `prisma/migrations/` foram aplicadas e registradas em
  `_prisma_migrations`, então `npx prisma migrate deploy` contra este banco não vai tentar
  reaplicar nada — só migrations novas a partir daqui.
- **Role de aplicação**: `prospector_app` (NOSUPERUSER, sem BYPASSRLS, dono de todas as 35
  tabelas) — mesmo modelo de segurança do self-hosted (`scripts/db/create-app-role.sql`), RLS
  (`FORCE ROW LEVEL SECURITY`) realmente se aplica a ela. **Nunca** conecte a aplicação como o
  usuário `postgres` do Supabase (ele tem `BYPASSRLS`, o que tornaria as políticas decorativas).

### 1.1 Obter as connection strings

1. Abra o [dashboard do projeto](https://supabase.com/dashboard/project/hzttamzvokacmcnrfkrm) →
   **Connect** (botão no topo).
2. Copie a **Session pooler** connection string (porta `5432`,
   `aws-0-sa-east-1.pooler.supabase.com` — confirme a região exata mostrada no seu dashboard).
   Formato:
   ```
   postgresql://prospector_app.hzttamzvokacmcnrfkrm:<SENHA>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
   ```
3. Troque o usuário de `postgres.hzttamzvokacmcnrfkrm` (padrão mostrado pelo dashboard) para
   `prospector_app.hzttamzvokacmcnrfkrm` — o dashboard só oferece o atalho para o usuário
   `postgres`; edite a string manualmente para usar o papel de aplicação.
4. A senha de `prospector_app` foi gerada nesta sessão e **entregue a você diretamente no chat**
   (não está em nenhum arquivo do repositório). Se perdê-la, redefina com:
   ```sql
   ALTER ROLE prospector_app WITH PASSWORD 'nova-senha-forte-aqui';
   ```
   (rode no SQL Editor do Supabase, autenticado como `postgres`).
5. Use essa string como `DATABASE_URL` no Render. Ela serve tanto para o tráfego normal da
   aplicação quanto para `prisma migrate deploy` (Session Pooler mantém uma conexão fixa por
   sessão, ao contrário do Transaction Pooler na porta 6543 — evita o problema de "sticky state"
   documentado pelo Supabase para pooling em modo transação).
6. `DIRECT_URL` é opcional — só defina se `prisma migrate deploy` falhar por causa de advisory
   locks; aponte para a **Direct connection** (`db.hzttamzvokacmcnrfkrm.supabase.co:5432`) nesse
   caso. Sem ela, `prisma.config.ts` cai automaticamente para `DATABASE_URL`.

### 1.2 Storage (uploads) — Supabase Storage, S3-compatível

- Bucket já criado: `prospector-assets` (privado).
- `src/lib/storage/index.ts` usa o SDK `@aws-sdk/client-s3` genérico — funciona contra
  MinIO (dev local), Cloudflare R2 ou Supabase Storage sem mudança de código, só trocando env vars.
- Para gerar as credenciais S3 do Supabase Storage:
  1. Dashboard → **Project Settings → Storage → S3 Connection**.
  2. Gere um par Access Key ID / Secret Access Key (fica visível uma única vez — salve num
     cofre de senhas).
  3. Copie também o **endpoint** (`https://hzttamzvokacmcnrfkrm.storage.supabase.co/storage/v1/s3`
     — use o subdomínio `storage.supabase.co`, não `supabase.co`, para melhor performance em
     uploads grandes) e a **region** mostrados na mesma tela.
- Configure no Render:
  ```
  STORAGE_ENDPOINT=https://hzttamzvokacmcnrfkrm.storage.supabase.co/storage/v1/s3
  STORAGE_REGION=<region mostrada no dashboard>
  STORAGE_BUCKET=prospector-assets
  STORAGE_ACCESS_KEY_ID=<gerado no passo acima>
  STORAGE_SECRET_ACCESS_KEY=<gerado no passo acima>
  ```
- **Nota de escopo**: `getUploadUrl`/`getDownloadUrl` existem no código mas ainda não estão
  conectados a nenhuma rota HTTP (não há endpoint `/api/uploads` ainda) — hoje é infraestrutura
  pronta para uso, não uma feature exposta. Ver Roadmap.

### 1.3 Extensões e RLS

- `vector` (pgvector 0.8.2) já habilitada pela migration `20260717141021_add_lead_enrichment`.
- RLS multi-tenant já aplicado em todas as tabelas que precisam (ver migrations
  `20260722020322_enable_rls`, `20260731170000_knowledge_base_tenant_scope`,
  `20260801120000_tenant_scope_ai_memory_prompts_and_rls`).
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
2. O Render lê `render.yaml` e cria o serviço `prospector-atlas` (web, Node, plano `free` até o
   workspace ter cartão cadastrado — trocar para `starter` no dashboard depois, ver comentário em
   `render.yaml`; note que `preDeployCommand` só existe em planos pagos, ver seção 2.2).
   Não cria mais um Postgres do Render — o banco é o Supabase externo (seção 1).
3. Em **Environment**, preencha todas as variáveis marcadas `sync: false` no `render.yaml`:

   | Variável | Valor |
   | --- | --- |
   | `DATABASE_URL` | Session Pooler do Supabase (seção 1.1) |
   | `DIRECT_URL` | Opcional (seção 1.1) |
   | `ALLOWED_ORIGINS` | `https://app.atlasgr.com.br` (mais qualquer outro domínio real que sirva o frontend) |
   | `BETTER_AUTH_URL` | `https://app.atlasgr.com.br` |
   | `PUBLIC_BASE_URL` | `https://app.atlasgr.com.br` |
   | `GOOGLE_MAPS_API_KEY`, `APOLLO_API_KEY`, `HUNTER_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY` | Chaves reais de cada provedor |
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
3. `startCommand`: `npx prisma migrate deploy && npm run start` — só migrations novas desde o
   baseline aplicado na seção 1 são executadas; a instância nova só fica pronta para o health
   check depois que a migração terminar com sucesso.
   > **Nota sobre o plano `free`**: o ideal seria `preDeployCommand: npx prisma migrate deploy`
   > (roda numa instância efêmera separada, com a instância antiga ainda servindo tráfego —
   > verdadeiro zero-downtime), mas esse recurso só existe em planos pagos do Render
   > (["The pre-deploy command is available for paid web services, private services, and
   > background workers"](https://render.com/docs/deploys)). Enquanto o serviço estiver em
   > `plan: free` (`render.yaml`, sem cartão cadastrado no workspace), a migração roda dentro do
   > `startCommand` — a garantia de "nunca servir tráfego contra schema desatualizado" continua
   > valendo (ver passo 5), só perde a instância efêmera separada. Ao migrar para `plan: starter`,
   > trocar para `preDeployCommand` + `startCommand: npm run start` (ver comentário em
   > `render.yaml`).
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
| Homologação | `develop` | A definir (recomenda-se um segundo projeto Supabase, plano free, região igual à de produção) | `cd-homolog.yml` → imagem Docker + Helm |
| Produção | `main` | Supabase `atlasgr-prospector-production` (seção 1) | Auto-deploy Render (seção 2.2) |

Para criar o ambiente de homologação com o mesmo nível de isolamento, repita a seção 1 criando um
segundo projeto Supabase (ex.: `atlasgr-prospector-staging`) e aponte as variáveis do serviço
Render de homologação (ou do Helm `values.yaml` em `charts/prospector-atlas/`) para ele.

## 6. Variáveis de ambiente — referência completa

Ver `.env.example` na raiz — todas as variáveis usadas pela aplicação estão documentadas lá, com
comentários explicando o efeito de cada uma. Nunca commite valores reais: `.env` está no
`.gitignore`, e no Render/GitHub Actions cada secret fica marcado `sync: false` (Render) ou como
GitHub Actions Secret, nunca hardcoded em `render.yaml`/workflow YAML.

## 7. Checklist de validação pós-deploy

- [ ] `GET https://app.atlasgr.com.br/health/live` → `200 { status: "ok" }`
- [ ] `GET https://app.atlasgr.com.br/health/ready` → `200` (confirma conexão real com o Supabase)
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
| Supabase — projeto | `https://supabase.com/dashboard/project/hzttamzvokacmcnrfkrm` |

## 9. Roadmap sugerido (não implementado nesta sessão)

1. **Conectar `getUploadUrl`/`getDownloadUrl` a uma rota real** (`/api/uploads`) — o storage está
   pronto (seção 1.2) mas nenhum endpoint HTTP o usa ainda.
2. **Homologação isolada de verdade**: segundo projeto Supabase + segundo serviço Render (ou
   Preview Environments do Render) para `develop`, hoje só coberto pelo caminho Docker/K8s.
2. **Redis gerenciado** para habilitar `ENABLE_QUEUES=true` em produção (filas persistentes,
   rate-limit distribuído de verdade entre múltiplas instâncias).
3. **Branch protection + required reviewers** no ambiente `production` do GitHub — confirme que
   está configurado (o código já assume isso, ver comentário `DEVOPS-001` em `production.yaml`).
4. **Corrigir a política RLS de `AILog`** (seção 1.3) para não esconder custo de IA não atribuído
   de tenants legítimos.
5. **Autoscaling/plano pago no Render** — o plano `starter` não escala horizontalmente; revisar
   antes de picos de tráfego previstos.
6. **Cloudflare R2 como alternativa/backup ao Supabase Storage** — o cliente já é
   S3-compatível (seção 1.2), então migrar é só trocar `STORAGE_*`; falta habilitar R2 na conta
   Cloudflare (painel, 1 clique) e criar o bucket.
