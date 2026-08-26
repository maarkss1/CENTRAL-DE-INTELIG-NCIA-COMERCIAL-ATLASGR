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

## 1. Caminho canônico por ambiente (estado real, 2026-08-25)

| Ambiente | Caminho canônico hoje | Fonte de verdade | Status |
| --- | --- | --- | --- |
| **Desenvolvimento local** | `docker-compose.yml` (Postgres+pgvector, Redis, Meilisearch, MinIO, LiteLLM, Ollama) + `npm run dev` | [`docs/development/LOCAL_FIRST.md`](../development/LOCAL_FIRST.md) | **Ativo** — único ambiente rodando hoje |
| **Homologação** | Nenhum ambiente cloud ativo. `cd-homolog.yml` existe (build de imagem Docker + Helm `values.yaml`) mas não há cluster real consumindo o resultado | [`k8s/README.md`](../../k8s/README.md), [`charts/README.md`](../../charts/README.md) | Pipeline existe, alvo (cluster) não existe |
| **Produção** | Nenhum ambiente cloud ativo. O único deploy de produção real já existiu no Render (`prospector-atlas`, ver histórico em `infrastructure/observability/RUNBOOK.md`) e foi **congelado deliberadamente** durante a migração para local-first | [`docs/development/LOCAL_FIRST.md`](../development/LOCAL_FIRST.md) seção "Situação dos provedores legados" | **Congelado** — preservado só para rollback/migração de dados |

O critério para reabrir a escolha de hospedagem de produção está em
[`docs/development/LOCAL_FIRST.md`](../development/LOCAL_FIRST.md) ("Critério para voltar à
produção"): frontend, backend, autenticação, permissões, banco, integrações, Market Intelligence,
CRM, testes e build final validados localmente primeiro.

## 2. Os quatro caminhos documentados — o que cada um é e seu status real

| # | Caminho | Arquivos | Status |
| --- | --- | --- | --- |
| 1 | **Local-first (docker-compose)** | `docker-compose.yml`, `docs/development/LOCAL_FIRST.md` | **Ativo** — fase atual do projeto |
| 2 | **Render + Supabase + Cloudflare** (monólito Express) | `render.yaml`, `docs/deploy/producao.md`, `docs/deploy/render.md` | **Congelado** (`autoDeployTrigger: off`) — arquitetura de produção candidata, preservada para rollback, não recebe deploy automático |
| 3 | **Self-hosted OCI (Docker Compose + Caddy)** | `docker-compose.oci.yml`, `docs/deploy/oracle-cloud.md`, `scripts/deploy-oci.sh` | Candidato alternativo documentado, não implantado ativamente hoje |
| 4 | **Kubernetes / Helm / ArgoCD** | `k8s/`, `charts/prospector-atlas/`, `argocd/` | Aspiracional — chart e manifests existem e são mantidos corretos (ver `charts/README.md`), mas nenhum cluster real está registrado consumindo isso. `cd-homolog.yml`/`production.yaml` publicam imagem em `ghcr.io` e atualizam `values.yaml`, sem cluster no outro lado |

Nenhum desses caminhos foi removido por esta consolidação — remover documentação de arquitetura
real (mesmo congelada) sem decisão de negócio explícita não é escopo deste item. O que mudou é que
cada um agora aponta para este índice em vez de afirmar, de forma desatualizada, ser "o deploy
ativo em produção".

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

## 7. Para quem for reabrir um caminho cloud no futuro

Ver `docs/development/LOCAL_FIRST.md` ("Critério para voltar à produção"). Quando esse critério
for atingido, a escolha de arquitetura de produção definitiva é decisão de negócio — este índice
não a antecipa. Os quatro caminhos documentados na seção 2 continuam sendo o inventário de opções
já avaliadas/preparadas; nenhuma delas precisa ser reconstruída do zero.
