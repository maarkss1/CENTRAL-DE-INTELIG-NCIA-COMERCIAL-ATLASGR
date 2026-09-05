# Infraestrutura e deploy — índice operacional (fonte de verdade)

Este arquivo é o ponto de entrada único para "qual é o caminho de deploy certo agora". O
repositório documenta **quatro** caminhos de infraestrutura/deploy diferentes, criados em épocas
diferentes; só um está de fato ativo hoje. Antes desta consolidação (ITEM-12), cada caminho
afirmava coisas diferentes sobre qual dos outros estava "ativo em produção" — `docs/deploy/
producao.md`, `charts/README.md`, `k8s/README.md`, `argocd/README.md` e `infrastructure/
observability/RUNBOOK.md` ainda diziam "Render é o deploy ativo em produção", escrito **antes** do
commit `53c55ac` ("chore(infra): move a Central para modo local-first (#180)"), que congelou o
Render (`render.yaml` → `autoDeployTrigger: off`, comentário `LEGACY/FROZEN`) sem que essas outras
páginas fossem atualizadas. Esta página resolve essa divergência sem apagar o trabalho documentado
em cada caminho — cada um continua descrito no lugar de sempre, agora com o status real.

> **Atualização de destino de produção (2026-09-05, ver `docs/ADR/ADR-004-Producao-Oracle-
> Cloud.md`):** o dono do produto decidiu, de forma definitiva, que o destino de produção passa a
> ser **Oracle Cloud Infrastructure (self-hosted, `docker-compose.oci.yml`)**, substituindo a
> escolha anterior (Render + Neon, registrada em 2026-09-02/04). A tabela e a numeração abaixo são
> atualizadas para refletir isso; nenhum caminho documentado é apagado.

## 1. Caminho canônico por ambiente (estado real, 2026-09-05)

| Ambiente | Caminho canônico hoje | Fonte de verdade | Status |
| --- | --- | --- | --- |
| **Desenvolvimento local** | `docker-compose.yml` (Postgres+pgvector, Redis, Meilisearch, MinIO, LiteLLM, Ollama) + `npm run dev` | [`docs/development/LOCAL_FIRST.md`](../development/LOCAL_FIRST.md) | **Ativo** |
| **Homologação** | Nenhum ambiente cloud ativo. `cd-homolog.yml` existe (build de imagem Docker + Helm `values.yaml`) mas não há cluster real consumindo o resultado | [`k8s/README.md`](../../k8s/README.md), [`charts/README.md`](../../charts/README.md) | Pipeline existe, alvo (cluster) não existe |
| **Produção (alvo definitivo)** | **Oracle Cloud Infrastructure, self-hosted** — `docker-compose.oci.yml` (app + postgres + caddy; Redis/worker opt-in), instância Ampere A1, região `sa-saopaulo-1` | [`docs/deploy/oracle-cloud.md`](oracle-cloud.md), [`docs/ADR/ADR-004-Producao-Oracle-Cloud.md`](../ADR/ADR-004-Producao-Oracle-Cloud.md) | **Em preparação** — código/scripts/documentação prontos nesta sessão; provisionamento e validação da instância real, migração de dado de produção e cutover de DNS exigem execução humana com acesso à infraestrutura (fora do alcance desta sessão) |
| **Produção (ainda ativa, fallback durante a transição)** | Render (`prospector-atlas`, `plan: starter`) + Supabase (banco real hoje) — ver nota de cutover Neon pendente | [`docs/deploy/producao.md`](producao.md) | **Ativo, mas congelado para novo investimento** — não desligar antes do Go-Live Oracle estar validado (backup/restore/smoke = PASS) |

O critério anterior ("voltar à produção" a partir do modo local-first) já foi cumprido em
2026-09-02 — ver [`docs/development/LOCAL_FIRST.md`](../development/LOCAL_FIRST.md). O critério
agora é o checklist de cutover em `docs/deploy/oracle-cloud.md` ("Cutover") antes de desligar
qualquer infraestrutura anterior.

## 2. Os quatro caminhos documentados — o que cada um é e seu status real

| # | Caminho | Arquivos | Status |
| --- | --- | --- | --- |
| 1 | **Local-first (docker-compose)** | `docker-compose.yml`, `docs/development/LOCAL_FIRST.md` | **Ativo** — ambiente de desenvolvimento |
| 2 | **Self-hosted Oracle Cloud (Docker Compose + Caddy)** | `docker-compose.oci.yml`, `docs/deploy/oracle-cloud.md`, `scripts/deploy-oci.sh`, `scripts/backup-oci.sh`, `scripts/restore-oci.sh` | **Alvo definitivo de produção (ADR-004)** — preparação de repositório concluída nesta sessão; deploy real na instância ainda pendente de execução humana |
| 3 | **Render + Supabase/Neon + Cloudflare** (monólito Express) | `render.yaml`, `docs/deploy/producao.md`, `docs/deploy/render.md` | **Fallback/rollback durante a transição para Oracle** — continua recebendo tráfego real hoje, não recebe mais investimento de infraestrutura novo, não desligar antes do cutover Oracle validado |
| 4 | **Kubernetes / Helm / ArgoCD** | `k8s/`, `charts/prospector-atlas/`, `argocd/` | Aspiracional — chart e manifests existem e são mantidos corretos (ver `charts/README.md`), mas nenhum cluster real está registrado consumindo isso. `cd-homolog.yml`/`production.yaml` publicam imagem em `ghcr.io` e atualizam `values.yaml`, sem cluster no outro lado |

Nenhum desses caminhos foi removido por esta atualização — remover documentação de arquitetura
real (mesmo congelada) sem decisão de negócio explícita não é escopo desta missão. O que mudou é
que o caminho 2 (Oracle) passa de "candidato não implantado" para "alvo definitivo", e o caminho 3
(Render) passa de "ativo" para "fallback durante a transição" — ver ADR-004.

## 3. Healthcheck e readiness — já padronizado

Toda a aplicação (local, Render, OCI, k8s/Helm) usa os mesmos dois endpoints definidos uma única
vez em `server.ts`:

| Endpoint | Verifica | Usado por |
| --- | --- | --- |
| `GET /health/live` (alias `/healthz`) | Processo no ar | `docker-compose.oci.yml`, `k8s/api-deployment.yaml`, `charts/prospector-atlas` |
| `GET /health/ready` (alias `/readyz`) | Conexão real com o banco (`SELECT 1`) — não só "processo respondeu" | `render.yaml` (`healthCheckPath`), Helm probes |

Não há endpoint divergente (ex.: `/api/health`) usado por nenhum manifest/compose/blueprint da
aplicação hoje — o único `/api/health` citado em `docs/deploy/producao.md` §2.2 é um exemplo do
bug **já corrigido** (rota que não existia, corrigida para `/health/ready`). O worker dedicado
(`worker.ts`) expõe os mesmos dois endpoints numa porta interna própria (`WORKER_HEALTH_PORT`,
padrão `3006`).

## 4. Secrets — já padronizado, não versionado em nenhum caminho

- Local: `.env` (`.gitignore` cobre `.env*`, exceto `.env.example`/`.env.test.example`).
- Render: variáveis `sync: false` em `render.yaml`, preenchidas manualmente no dashboard — nunca
  hardcoded no blueprint.
- OCI: `.env.production` gerado e mantido só no servidor por `scripts/deploy-oci.sh`
  (`chmod 600`), nunca commitado — `.gitignore` cobre os formatos de dump/backup relacionados.
- Kubernetes/Helm: `values.yaml` mantém `secrets:` vazio por padrão de propósito (ver
  `charts/README.md`); segredo real só entraria via mecanismo externo (ex. Sealed Secrets/External
  Secrets), nunca versionado no chart.

Nenhuma mudança necessária aqui — auditado nesta consolidação (ITEM-12) e confirmado correto nos
quatro caminhos.

## 5. Rollback — onde está documentado cada caminho

| Caminho | Mecanismo | Documentado em |
| --- | --- | --- |
| Render | Dashboard → Deploys → "Rollback to this deploy"; sem API scriptável para commit específico; migração não é desfeita pelo rollback | `infrastructure/observability/RUNBOOK.md` §6 "Rollback via Render" |
| Helm (sem ArgoCD) | `helm history` / `helm rollback` — não reexecuta o hook de migração | `infrastructure/observability/RUNBOOK.md` §6 "Rollback via Helm"; `charts/README.md` |
| ArgoCD | `argocd app history` / `argocd app rollback` — reverte o `sync`, não o schema | `infrastructure/observability/RUNBOOK.md` §6 "Rollback via ArgoCD" |
| Manifests k8s avulsos (`k8s/`) | Sem histórico de release — reaplicar YAML de um commit anterior via `git show` + `kubectl apply` | `k8s/README.md` §"Rollback" |
| Local (docker-compose) | `docker compose down` / restaurar volume nomeado / `git checkout` de um commit anterior + `npx prisma migrate resolve` quando aplicável | `docs/development/LOCAL_FIRST.md` |

Em todos os caminhos vale a mesma ressalva: reverter o deploy/release **não** desfaz uma migration
já aplicada ao banco. Uma migration destrutiva exige avaliação e, se necessário, migration de
compensação antes ou depois do rollback de código — nunca assumir que reverter o código também
reverte o schema.

## 6. Ambiente local reproduz o essencial da produção, sem exigir serviços desnecessários

`docker-compose.yml` sobe as dependências que a aplicação de fato usa hoje: Postgres+pgvector
(equivalente ao Supabase Postgres), Redis (opcional, `ENABLE_QUEUES`), Meilisearch (opcional,
`ENABLE_SEARCH`), MinIO (equivalente ao Supabase Storage/S3), LiteLLM e Ollama (IA local opcional).
Nenhum desses serviços é obrigatório para `npm run dev` subir — Redis/Meilisearch só passam a ser
necessários quando as respectivas flags (`ENABLE_QUEUES`/`ENABLE_SEARCH`) são ligadas, conforme
`docs/development/LOCAL_FIRST.md`. O verificador `node scripts/local-first/doctor.mjs` falha
explicitamente se algum endpoint de runtime apontar para um provedor cloud (Supabase, Neon, Render,
Railway, Vercel), evitando que o ambiente "local" acabe silenciosamente dependendo de produção.

## 6.1. Overlay opcional de ferramentas extra (`docker-compose.services.yml`)

Além do `docker-compose.yml` descrito acima, existe um **overlay opt-in**,
`docker-compose.services.yml` ("Ondas OS-3 a OS-7"), que define serviços adicionais que nenhuma
rota da aplicação depende hoje: Flowise, OpenWebUI, Qdrant, Superset, n8n, Chatwoot, Uptime Kuma,
Pocketbase e Plane. Ele **não substitui** `docker-compose.yml` nem `docker-compose.opensource.yml`
— é somado por cima, só quando alguém quer usar uma dessas ferramentas localmente:

```bash
docker compose -f docker-compose.yml -f docker-compose.opensource.yml -f docker-compose.services.yml up -d
```

Nenhum desses serviços entra em `docker-compose.oci.yml` (produção self-hosted) nem em
`render.yaml` — mesmo critério da seção 6: só passam a fazer parte de um caminho de deploy real
quando algum código da aplicação de fato depender deles, não só por existirem definidos aqui.
Flowise e OpenWebUI já têm um consumidor real (`src/lib/ai/gateway/providers/litellm.provider.ts`,
roteado por prefixo de modelo `flowise/...`/`openwebui/...`, configurado via `FLOWISE_URL`/
`OPENWEBUI_URL` em `src/config/env.ts`); os demais ainda não têm código de aplicação que os
consuma — rodá-los localmente é opcional e não afeta `npm run dev`.

### Primeiro acesso — Superset, Uptime Kuma, Pocketbase, Plane

Esses quatro não são consumidos pelo código da aplicação — são ferramentas internas que rodam ao
lado do CRM, cada uma com sua própria conta de admin:

| Serviço | URL local | Primeiro login |
| --- | --- | --- |
| **Apache Superset** | http://localhost:8089 | Não vem com admin pronto — rode uma vez `docker compose -f docker-compose.yml -f docker-compose.services.yml --profile tools run --rm superset-init` (aplica migrations + cria o admin via `SUPERSET_ADMIN_USERNAME`/`SUPERSET_ADMIN_PASSWORD` do `.env`) antes de acessar |
| **Uptime Kuma** | http://localhost:3003 | Cria o admin na primeira visita à UI (sem variável de ambiente) |
| **Pocketbase** | http://localhost:8090/_/ | Cria o admin na primeira visita à UI (sem variável de ambiente); serviço com `profiles: [tools, test]`, não sobe com `up -d` sem `--profile` |
| **Plane** | http://localhost:3004 (frontend) / API em :8091 | Cria o workspace/admin na primeira visita à UI |

Nenhum desses quatro tem healthcheck confiável baseado em endpoint documentado oficialmente pelo
projeto upstream, **exceto** Superset e Pocketbase (`/health` e `/api/health`, confirmados na
documentação oficial de cada um) — Plane não define healthcheck nem no próprio
`docker-compose.yml` oficial do makeplane/plane, então não inventamos um aqui.

## 7. Para quem for reabrir um caminho cloud no futuro

Ver `docs/development/LOCAL_FIRST.md` ("Critério para voltar à produção"). Quando esse critério
for atingido, a escolha de arquitetura de produção definitiva é decisão de negócio — este índice
não a antecipa. Os quatro caminhos documentados na seção 2 continuam sendo o inventário de opções
já avaliadas/preparadas; nenhuma delas precisa ser reconstruída do zero.
