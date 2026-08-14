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
