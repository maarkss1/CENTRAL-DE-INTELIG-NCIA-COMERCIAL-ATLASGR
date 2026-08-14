# charts/ — status real

Estes manifests Helm (`prospector-atlas/`) são **aspiracionais/legados**, não são o caminho de
deploy ativo hoje.

O deploy ativo em produção é **Render** (`render.yaml` na raiz do repositório) para o backend
Express/API + frontend estático servido pelo mesmo processo, com **Vercel** (`vercel.json` na
raiz) como caminho alternativo/complementar para o frontend. Ver `docs/deploy/producao.md` para a
arquitetura real (Render + Supabase + Cloudflare) e o fluxo de deploy automático.

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
- Segurança/capacidade que já estavam corretas e não precisaram de mudança: `securityContext`
  (non-root, `drop: [ALL]`), `resources.limits`/`requests` definidos em app e worker, `secrets:`
  vazio por padrão (nunca populado com valor real neste arquivo versionado), health/readiness
  reais (`/health/live`, `/health/ready` — o segundo confere `SELECT 1` no banco, não só "processo
  no ar", ver `server.ts`).
