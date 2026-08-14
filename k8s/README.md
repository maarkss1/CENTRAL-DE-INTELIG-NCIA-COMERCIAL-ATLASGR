# k8s/ — status real

Estes manifests Kubernetes avulsos (`api-deployment.yaml`, `postgres-statefulset.yaml`,
`redis-deployment.yaml`, `ingress.yaml`, `migration-job.yaml`) são um caminho **local/minikube**,
não o caminho de deploy ativo em produção nem em homologação.

Evidência no próprio conteúdo: `imagePullPolicy: Never # using local docker image for minikube`
(`api-deployment.yaml`, `migration-job.yaml`) e `host: prospector.local` (`ingress.yaml`) só fazem
sentido contra um cluster minikube local, nunca contra um domínio público real.

O deploy ativo em produção é **Render** (`render.yaml` na raiz) + **Vercel**/estático servido pelo
próprio Render — ver `docs/deploy/producao.md`. O caminho Kubernetes "oficial"/versionado para um
cluster real (se algum dia for ativado) é `charts/prospector-atlas/` via ArgoCD
(`argocd/application-*.yaml`), não estes manifests avulsos — ver `charts/README.md` e
`argocd/README.md` para o mesmo aviso do lado deles. Estes manifests aqui existem para
desenvolvimento/teste local contra um minikube, não para produção.

## Ordem de aplicação (migração antes do app)

Diferente do chart Helm (que usa um hook `pre-install,pre-upgrade` — ver
`charts/prospector-atlas/templates/migration-job.yaml`), manifests avulsos não têm mecanismo de
"rodar isto antes daquilo". A ordem precisa ser manual:

```bash
kubectl apply -f k8s/postgres-statefulset.yaml
kubectl wait --for=condition=ready pod -l app=postgres --timeout=120s
kubectl apply -f k8s/migration-job.yaml
kubectl wait --for=condition=complete job/prospector-migrate --timeout=300s
kubectl apply -f k8s/redis-deployment.yaml -f k8s/api-deployment.yaml -f k8s/ingress.yaml
```

Sem essa ordem, `api-deployment.yaml` pode subir e passar no `readinessProbe` (que só confere
`SELECT 1`, não se o schema está atualizado) servindo tráfego contra um banco com migração
pendente. Ver `/AGENTS.md` → bloqueador #5.

## Caveat conhecido: CLI do Prisma na imagem

`migration-job.yaml` roda `npx prisma migrate deploy` usando a mesma imagem
`prospector-atlas:latest` do `api-deployment.yaml`. O `Dockerfile` da raiz (propriedade do
Agente 08) roda `npm prune --omit=dev` no estágio final, removendo o pacote `prisma` (a CLI, hoje
em devDependencies) — só `@prisma/client` (runtime) sobra na imagem final. Nesse estado, o Job de
migração falha. Handoff aberto:
`.agents/handoffs/onda-4/10-para-08-prisma-cli-imagem-producao.md`.

## Rollback

Manifests avulsos não têm histórico de release (ao contrário de Helm). Rollback aqui significa:
reaplicar a versão anterior do YAML (`git show <commit-anterior>:k8s/api-deployment.yaml | kubectl
apply -f -`) com a tag de imagem anterior. Para rollback real com histórico versionado, use o
caminho Helm/ArgoCD (`charts/`, `argocd/`) — ver `infrastructure/observability/RUNBOOK.md` seção
de rollback.
