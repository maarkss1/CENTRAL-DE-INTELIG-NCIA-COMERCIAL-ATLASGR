- De: 10
- Para: 08
- Onda: 4
- Status: aberto
- Prioridade: alto
## Problema
Implementei, no chart Helm (`charts/prospector-atlas/templates/migration-job.yaml`, hook
`pre-install,pre-upgrade`) e nos manifests avulsos (`k8s/migration-job.yaml`), um Job que roda
`npx prisma migrate deploy` antes de qualquer Deployment/Rollout novo ser aplicado — implementa a
mesma garantia que `render.yaml` já tem no deploy real (`startCommand: npx prisma migrate deploy
&& npm run start`), agora também na camada k8s/Helm/ArgoCD (ver `/AGENTS.md` bloqueador #5:
"Deploy capaz de iniciar sem aplicar migrações").

Porém o `Dockerfile` da raiz (linha 20: `RUN npm prune --omit=dev`) remove todas as
devDependencies do estágio final, incluindo o pacote `prisma` (a CLI — `package.json` linha 191,
`"prisma": "^7.8.0"` está em `devDependencies`). Só `@prisma/client` (runtime, em
`dependencies`) permanece na imagem publicada por `.github/workflows/cd-homolog.yml` e
`production.yaml` em `ghcr.io`. Nesse estado, `npx prisma migrate deploy` dentro do meu Job falha
(comando não encontrado, ou `npx` tentaria baixar da rede — indesejável/frágil num cluster sem
egress garantido para o npm registry).

Isso não afeta o deploy real hoje (Render usa `buildCommand: npm ci --include=dev && npm run
build`, um caminho de build totalmente diferente que nunca passa pelo `Dockerfile` — mantém a CLI
disponível). Mas deixa o caminho k8s/Helm/ArgoCD com um Job de migração que existe no manifest
mas não funciona de fato, caso esse caminho seja ativado no futuro (ver `charts/README.md`/
`argocd/README.md` — hoje nenhum cluster real está registrado).
## Arquivo(s) envolvido(s)
- `Dockerfile` (raiz, propriedade exclusiva do Agente 08) — linha 20 (`npm prune --omit=dev`)
  remove a CLI `prisma` do estágio final.
- Consumidores do gap (meu lado, já corrigidos/documentados): `charts/prospector-atlas/
  templates/migration-job.yaml`, `k8s/migration-job.yaml`, `charts/README.md`, `k8s/README.md`.
## Alteração necessária
Uma das seguintes (decisão de quem é dono do Dockerfile):
1. Mover `prisma` de `devDependencies` para `dependencies` em `package.json` (fora do meu escopo
   — `package.json` exige aprovação do Agente 00) e deixar o `npm prune --omit=dev` como está.
2. Ajustar o `Dockerfile` para preservar especificamente o pacote `prisma` mesmo depois do prune
   (ex.: reinstalar só a CLI no estágio final: `RUN npm install --no-save prisma@$(node -p
   "require('./package.json').devDependencies.prisma")` antes do `USER nodejs`), mantendo a
   imagem final o mais enxuta possível fora isso.
3. Construir uma imagem "migrator" separada (segundo estágio de build que não faz `npm prune`) e
   apontar `charts/prospector-atlas/values.yaml` → `migrations.image.repository`/`.tag` para ela
   (já deixei esses campos prontos no `values.yaml`, vazios por padrão, para essa opção).
## Teste esperado
`docker run <imagem-final> npx prisma migrate deploy --help` (ou equivalente) não falha com
"command not found"/tentativa de download de rede. No cluster (quando ativado), `kubectl logs
job/<nome>-migrate-<revisão>` mostra a migração rodando de fato, não uma falha de CLI ausente.
## Contexto adicional
Onda 4 (Extensões) — Agente 10, missão "Migração e rollback no cluster". Não bloqueia o release
atual (Render não usa o Dockerfile), mas bloqueia a ativação futura do caminho k8s/Helm/ArgoCD
descrita como "aspiracional" em `charts/README.md`/`argocd/README.md`. Prioridade "alto" e não
"bloqueador" porque nenhum cluster real depende disso hoje.
