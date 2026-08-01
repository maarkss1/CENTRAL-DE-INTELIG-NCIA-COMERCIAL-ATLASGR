# Quick Wins
Correções seguras, rápidas (XS/S), de alto impacto relativo e baixo risco de regressão. Não exigem mudança de arquitetura.

## Segurança (fazer primeiro, apesar de "rápidas" — impacto crítico)
1. **Remover `Login.tsx`** e a conta `admin@prospector.com` da allowlist server-side (`src/config/access-policy.ts`). *Esforço: horas.*
2. **Remover `PRESET_USERS`/senhas exibidas em tela** em `LoginScreen.tsx`/`userPresets.ts`. *Esforço: horas.*
3. **Corrigir defaults inseguros** em `src/config/env.ts`: `NODE_ENV` sem default (fail-closed), `ALLOW_DEV_AUTH_BYPASS` default `false`. *Esforço: horas.*
4. **Gate `analytics.routes.ts`**: remover o fallback de métricas fabricadas, retornar erro real em caso de falha de banco. *Esforço: horas.*
5. **Aplicar gate real às flags `EXPOSE_METRICS`/`ENABLE_SEARCH`** em `server.ts` (hoje são lidas do schema mas nunca checadas). *Esforço: 1h.*
6. **Corrigir `API_RATE_LIMIT_MAX`**: usar a env var em vez do valor hardcoded `500` em `server.ts:92`. *Esforço: 1h.*

## Dependências e limpeza
7. Remover dependências mortas: `mammoth`, `jsonwebtoken` (confirmar antes que não são usados em `scripts/`/`chatbook/`). *Esforço: 1h.*
8. Remover componentes não utilizados: `src/components/ui/DataTable.tsx`, `src/features/intelligence/components/Atlas3DGame.tsx`. *Esforço: 1h.*
9. Consolidar `framer-motion`/`motion` em uma única biblioteca de animação. *Esforço: algumas horas (requer ajuste de imports).*
10. Renomear `"name": "react-example"` no `package.json` para o nome real do produto. *Esforço: minutos.*
11. Adicionar `*.rdb`, `*.mp4`, `*.png` (na raiz) ao `.gitignore`; remover `dump.rdb`/screenshots do controle de versão daqui em diante. *Esforço: 1h.*
12. Remover `test-apollo.ts` da raiz (script de depuração, não é teste real) ou movê-lo para `scripts/` com nome claro. *Esforço: minutos.*

## DevOps
13. `Dockerfile`: usar `npm ci --omit=dev` (ou pruning equivalente) na etapa final para não embarcar devDependencies em produção. *Esforço: 1h.*
14. Remover um dos dois manifests ArgoCD duplicados (`k8s/argocd-app-homolog.yaml` ou `argocd/application-homolog.yaml`). *Esforço: 1h.*
15. Fixar a versão do `yq` baixado em `cd-homolog.yml` (parar de usar tag "latest"). *Esforço: 1h.*
16. Adicionar `resources.limits/requests` e probes ao StatefulSet do Postgres e Deployment do Redis em `k8s/`. *Esforço: algumas horas.*

## Backend
17. Adicionar paginação (`take`/`skip`) a `activity.service.ts::findAll`. *Esforço: algumas horas.*
18. Corrigir `prospecting.service.ts::findExistingCompany` para filtrar por CNPJ normalizado diretamente na query em vez de carregar tudo em memória. *Esforço: algumas horas.*
19. Adicionar `jobId` derivado do `leadId` às chamadas `Queue.add()` para idempotência básica. *Esforço: algumas horas.*
20. Adicionar `aria-label` ao botão de fechar do `Dialog.tsx`. *Esforço: minutos.*

## Documentação
21. Marcar `docs/compliance/COMPLIANCE_MATRIX.md` como desatualizado (ou atualizar a seção de RAG/vetorização) até revisão completa. *Esforço: minutos.*

**Nada listado acima requer reescrita de módulo ou migração de dados** — todos podem ser feitos em paralelo por desenvolvedores diferentes sem conflito significativo de merge, com exceção dos itens 1-3 (segurança), que devem ser tratados como prioridade absoluta antes de qualquer outra entrega, conforme `00-RESUMO-EXECUTIVO.md`.
