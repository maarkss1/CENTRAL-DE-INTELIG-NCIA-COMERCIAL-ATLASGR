# charts/ — status real

Estes manifests Helm (`prospector-atlas/`) são **aspiracionais/legados**, não são o caminho de
deploy ativo hoje.

**Correção (ITEM-12, 2026-08-25):** nenhum caminho cloud está ativo hoje — o projeto está em modo
local-first (`docs/development/LOCAL_FIRST.md`). Render (`render.yaml`) foi a última arquitetura
de produção real, mas está **congelado** (`autoDeployTrigger: off`, marcado `LEGACY/FROZEN` no
próprio arquivo) desde a migração para local-first; não há Vercel neste projeto (`vercel.json` tem
`git.deploymentEnabled: false` e nunca serviu produção — ver
`infrastructure/observability/RUNBOOK.md`, correção de registro da Onda 8). Ver
[`docs/deploy/README.md`](../docs/deploy/README.md) para o inventário completo dos caminhos e o
canônico atual. `docs/deploy/producao.md` continua descrevendo a arquitetura Render + Supabase +
Cloudflare como candidata congelada, não como estado atual.

Este chart existe para um caminho de deploy Kubernetes/Helm/ArgoCD que não está em uso ativo —
`.github/workflows/cd-homolog.yml` publica a imagem em `ghcr.io` e atualiza `values.yaml`, e
`.github/workflows/production.yaml` faz o mesmo build com aprovação manual, mas nenhum cluster
Kubernetes real está atualmente consumindo isso em produção. Ver `argocd/README.md` para o mesmo
aviso do lado do ArgoCD.

Mantido no repositório como caminho alternativo documentado (não removido), mas qualquer decisão
de migrar o deploy ativo para Kubernetes é decisão de negócio/arquitetura, não uma correção de
rotina.

## Onda 4 (Agente 10) — o que foi corrigido/adicionado neste chart

Mesmo sem cluster real consumindo este chart hoje, ele precisa estar correto quando (se) for
ativado. Nesta rodada:

- **`templates/migration-job.yaml`** (novo): Job Helm com hook `pre-install,pre-upgrade` que roda
  `npx prisma migrate deploy` antes do Deployment/Rollout novo ser aplicado. Se a migração falhar,
  o release inteiro é abortado — mesma garantia que `render.yaml` já tem no deploy real via
  `startCommand: npx prisma migrate deploy && npm run start`. **Caveat conhecido**: a imagem
  publicada pelo `Dockerfile` da raiz roda `npm prune --omit=dev`, removendo a CLI `prisma`
  (devDependency) e deixando só `@prisma/client` — nesse estado, este Job falha ao tentar rodar
  `npx prisma migrate deploy` num cluster real. Handoff aberto para o Agente 08:
  `.agents/handoffs/onda-4/10-para-08-prisma-cli-imagem-producao.md`.
- **`templates/hpa.yaml`** (corrigido): com `blueGreen.enabled: true` (default), o recurso
  escalável é um `Rollout` (`argoproj.io/v1alpha1`), não um `Deployment` — `rollout.yaml` só
  renderiza um `Deployment` quando blue-green está desligado. O HPA apontava para
  `kind: Deployment` incondicionalmente, um recurso que nunca existia nesse caso; o autoscaling
  do serviço principal nunca funcionaria de fato. Corrigido para alternar `apiVersion`/`kind`
  conforme `blueGreen.enabled`, seguindo a integração documentada do Argo Rollouts com HPA.
- **`templates/pdb.yaml`** (novo): `PodDisruptionBudget` para o Deployment/Rollout principal e
  para o worker (`minAvailable: 1` cada) — evita que um drain de nó voluntário zere a capacidade
  de servir tráfego.
- **`templates/worker-hpa.yaml`** (novo, desligado por padrão via
  `worker.autoscaling.enabled: false`): autoscaling do worker por CPU/memória. Desligado por
  padrão porque não há métrica real de profundidade de fila BullMQ exposta ao Prometheus hoje
  (ver `infrastructure/observability/alert.rules.yml` e o handoff para o Agente 07) — CPU/memória
  sozinhos são uma aproximação grosseira para um worker que passa boa parte do tempo esperando
  I/O (chamadas de IA, Bitrix, WhatsApp). `templates/worker-deployment.yaml` foi ajustado para
  omitir `replicas` fixo quando esse HPA está ligado, evitando que cada `helm upgrade` reverta o
  scale-out do HPA.
- O processo web recebe `ENABLE_EMBEDDED_WORKERS=false` explicitamente e o Deployment dedicado
  recebe `ENABLE_QUEUES=true`; reinícios/escala das réplicas HTTP não criam outro conjunto de
  processadores dentro de `server.ts`. O worker expõe a porta interna `3006` e só fica Ready
  quando `/health/ready` confirma Redis e Postgres. Seus probes tornam falhas observáveis pelo
  Kubernetes; o grace period de 35 s supera o timeout de shutdown de 25 s do processo e permite
  fechar os BullMQ Workers antes de o pod antigo ser encerrado.
- Segurança/capacidade que já estavam corretas e não precisaram de mudança: `securityContext`
  (non-root, `drop: [ALL]`), `resources.limits`/`requests` definidos em app e worker, `secrets:`
  vazio por padrão (nunca populado com valor real neste arquivo versionado), health/readiness
  reais (`/health/live`, `/health/ready` — o segundo confere `SELECT 1` no banco, não só "processo
  no ar", ver `server.ts`).
