# argocd/ — status real

Estes manifests ArgoCD (`application-production.yaml`, `application-homolog.yaml`) são
**aspiracionais/legados**, não são o caminho de deploy ativo hoje.

O deploy ativo é **Render** (`render.yaml` na raiz do repositório) + **Vercel**
(`vercel.json` na raiz). Ver `docs/deploy/producao.md` para a arquitetura real (Render +
Supabase + Cloudflare) e o fluxo de deploy automático a cada push.

Estes `Application` do ArgoCD apontam para o chart em `charts/prospector-atlas` (ver
`charts/README.md` para o mesmo aviso) e assumem um cluster Kubernetes com ArgoCD instalado
sincronizando a partir deste repositório — nenhum cluster real está atualmente registrado contra
esses manifests em produção. Mantidos como caminho alternativo documentado, não removidos.

Qualquer decisão de ativar de fato o caminho Kubernetes/Helm/ArgoCD (registrar o cluster, apontar
o ArgoCD para este repositório, provisionar secrets reais em `charts/prospector-atlas/values.yaml`
via `secrets:`) é decisão de negócio/arquitetura, não uma correção de rotina.
