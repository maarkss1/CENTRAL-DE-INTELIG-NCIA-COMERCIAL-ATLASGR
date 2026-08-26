# argocd/ — status real

Estes manifests ArgoCD (`application-production.yaml`, `application-homolog.yaml`) são
**aspiracionais/legados**, não são o caminho de deploy ativo hoje.

**Correção (ITEM-12, 2026-08-25):** nenhum caminho cloud está ativo hoje — o projeto está em modo
local-first (`docs/development/LOCAL_FIRST.md`). **Render** (`render.yaml` na raiz do
repositório) foi a última arquitetura de produção real, mas está **congelado**
(`autoDeployTrigger: off`) desde a migração para local-first; não há Vercel neste projeto
(`vercel.json` tem `git.deploymentEnabled: false` e nunca serviu produção). Ver
[`docs/deploy/README.md`](../docs/deploy/README.md) para o caminho canônico atual por ambiente e
`docs/deploy/producao.md` para a arquitetura Render + Supabase + Cloudflare como candidata
congelada.

Estes `Application` do ArgoCD apontam para o chart em `charts/prospector-atlas` (ver
`charts/README.md` para o mesmo aviso) e assumem um cluster Kubernetes com ArgoCD instalado
sincronizando a partir deste repositório — nenhum cluster real está atualmente registrado contra
esses manifests em produção. Mantidos como caminho alternativo documentado, não removidos.

Qualquer decisão de ativar de fato o caminho Kubernetes/Helm/ArgoCD (registrar o cluster, apontar
o ArgoCD para este repositório, provisionar secrets reais em `charts/prospector-atlas/values.yaml`
via `secrets:`) é decisão de negócio/arquitetura, não uma correção de rotina.
