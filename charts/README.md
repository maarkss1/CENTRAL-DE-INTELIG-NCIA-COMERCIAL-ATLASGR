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
  `startCommand: npx prisma migrate deploy && npm run start`. **Caveat da CLI do prisma na
  imagem: resolvido.** O `Dockerfile` da raiz roda `npm prune --omit=dev` (remove `prisma`,
  devDependency), mas reinstala só a CLI (`npm install --no-save prisma@...`) no estágio final
  antes do estágio runner copiar `node_modules` — confirmado no Dockerfile atual e no handoff
  `.agents/handoffs/onda-4/10-para-08-prisma-cli-imagem-producao.md` (Status: resolvido).
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

## Roadmap v2 — Onda 4 (Agente 10) — auditoria fail-closed desta rodada

Confirmado sem retrabalho (já corrigido em rodadas anteriores, ver seção acima): probes reais,
`resources.limits`/`requests` em app e worker, worker dedicado sem duplicação de processadores
(`ENABLE_EMBEDDED_WORKERS=false` no processo web, `ENABLE_QUEUES=true` só ativa publicação de
job — os processadores só existem em `worker-deployment.yaml`), nenhum segredo real versionado
(`secrets:` vazio por padrão).

Achado novo corrigido nesta rodada:

- **`templates/deployment.yaml`, `rollout.yaml`, `service.yaml`, `service-preview.yaml`,
  `pdb.yaml`** (selector de label incompleto): o selector do app principal usava só
  `prospector-atlas.selectorLabels` (`app.kubernetes.io/name` + `.../instance`), sem nenhum
  discriminador de componente — enquanto `worker-deployment.yaml`/`worker-hpa.yaml` já usam
  `app.kubernetes.io/component: worker` para o lado deles. Como um selector `matchLabels` em
  Kubernetes casa por presença/igualdade das chaves especificadas (labels extras no pod não
  desqualificam o match), e os pods do worker carregam os dois labels base **mais**
  `component: worker`, esse selector "solto" também batia com os pods do worker. Efeitos reais:
  - `hpa.yaml` (app principal) lê o selector do Deployment/Rollout via scale subresource para
    calcular a média de CPU/memória — as métricas dos pods do worker (workload não-HTTP,
    padrão de uso de CPU/I/O completamente diferente) entravam nessa média, distorcendo decisões
    de autoscaling do tier HTTP.
  - `pdb.yaml` (PDB do app principal) contava pods do worker no total de "pods que casam com o
    selector" — um drain de nó podia evictar as duas réplicas do app principal mantendo
    `minAvailable: 1` satisfeito só com réplicas do worker de pé, zerando a capacidade HTTP real
    sem violar a política de disrupção do Kubernetes.
  - `service.yaml`/`service-preview.yaml`: sem impacto de roteamento de tráfego de fato (o pod do
    worker não expõe porta nomeada `http`/numérica `3000`, então o controller de Endpoints não o
    inclui para essa porta), mas o selector continuava semanticamente incorreto.
  Corrigido adicionando `app.kubernetes.io/component: web` ao `selector.matchLabels`/
  `spec.selector` e ao `template.metadata.labels` desses cinco arquivos (Deployment e Rollout
  precisam do label em ambos os lugares — Kubernetes exige que o pod template contenha todo
  label do selector). Seguro aplicar agora: `spec.selector` de Deployment é imutável após criado,
  mas nenhum cluster real está sincronizando este chart hoje (ver aviso no topo deste arquivo),
  então não há release existente para quebrar.
- **Documentação desatualizada**: o comentário de `templates/migration-job.yaml` e o parágrafo
  correspondente acima descreviam o gap da CLI do `prisma` na imagem como um caveat aberto. O
  handoff já está `Status: resolvido` e o `Dockerfile` atual já reinstala a CLI no estágio final
  — atualizado para refletir o estado real em vez de repetir um bloqueador já corrigido.
