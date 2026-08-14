# Runbook — Prospector-Atlas (Agente 10, Onda 4)

Runbook mínimo de resposta a incidentes para os cenários já mapeados como bloqueadores em
`/AGENTS.md` e para migração/rollback no nível de cluster (missão do Agente 10 — ver
`.agents/prompts/10-infraestrutura-sre.md`).

**Antes de tudo: qual é o deploy ativo?** Verifique o ambiente real antes de agir — este projeto
tem dois caminhos de deploy documentados e só um está de fato ativo hoje:

| Caminho | Status | Onde |
| --- | --- | --- |
| Render + Vercel + Supabase | **Ativo em produção** | `render.yaml`, `docs/deploy/producao.md` |
| Kubernetes/Helm/ArgoCD (`k8s/`, `charts/`, `argocd/`) | Aspiracional/legado, nenhum cluster real registrado | `charts/README.md`, `argocd/README.md`, `k8s/README.md` |

Os passos abaixo cobrem os dois; identifique qual se aplica antes de executar comandos
`kubectl`/`helm`/`argocd` — eles não têm efeito nenhum se o incidente é no serviço Render real.

## Correlação de logs

Toda request HTTP carrega `x-request-id` e `x-correlation-id` (gerados ou propagados por
`src/shared/middlewares/observability.ts`) e aparecem estruturados no log Pino
(`requestId`, `correlationId`, `traceId`, `spanId`, `userId`, `tenantId`). Ao investigar qualquer
incidente abaixo, comece pedindo ao usuário afetado (ou pegando do header de resposta) o
`x-request-id`/`x-correlation-id` e filtre os logs agregados por ele — muito mais rápido que
procurar por timestamp aproximado. Se o stack Loki local estiver rodando (`npm run infra:up`),
use o mesmo campo como filtro LogQL: `{job="central-comercial"} | json | correlationId="<id>"`.

## 1. Aplicação indisponível (5xx generalizado / instância não responde)

**Sintoma**: `InstanceDown` (Prometheus) ou relato de erro 5xx generalizado.

1. Checar health real, não só "site no ar": `GET /health/live` (processo vivo) e
   `GET /health/ready` (confirma `SELECT 1` no Postgres — se `/health/ready` falha com
   `Database unavailable`, o problema é o banco, não a aplicação).
2. **Render**: dashboard → serviço `prospector-atlas` → aba Logs/Events. Verificar se o deploy
   mais recente falhou no `startCommand` (`npx prisma migrate deploy && npm run start` —
   ver seção 3 abaixo se for isso) ou se é o banco Supabase que está fora.
3. **k8s/Helm** (se ativado): `kubectl get pods -n <namespace>`, `kubectl describe pod <pod>`,
   `kubectl logs <pod> --previous` (se reiniciou). Ver `argocd app get prospector-atlas-<env>`
   para status de sync/health do ArgoCD.
4. Se o Postgres (Supabase) está fora: incidente é do provedor, não corrigível por
   redeploy/restart — verificar status page do Supabase.

## 2. Falha de migração (deploy travado)

**Sintoma**: deploy não conclui; `MigrationJobFailed` (se kube-state-metrics estiver disponível);
no Render, `startCommand` falha antes de `npm run start` rodar.

1. **Render**: aba Logs do deploy que falhou — a saída de `npx prisma migrate deploy` aparece
   ali antes de qualquer log da aplicação. A instância anterior continua servindo tráfego
   (`healthCheckPath` nunca passa para a nova instância) — não há downtime, mas o deploy fica
   bloqueado até corrigir.
2. **k8s/Helm**: `kubectl get jobs -l app.kubernetes.io/component=migration`,
   `kubectl logs job/<nome>-migrate-<revisão>`. O hook `pre-install,pre-upgrade`
   (`charts/prospector-atlas/templates/migration-job.yaml`) aborta o `helm upgrade`/sync do
   ArgoCD — o Deployment/Rollout novo nunca chega a ser aplicado, então não há tráfego servido
   contra schema quebrado.
3. Causa raiz comum: migration com SQL inválido para os dados existentes, ou lock de tabela
   grande demais para o `activeDeadlineSeconds`/timeout do pooler. Ver
   `.claude/skills/database-integrity/SKILL.md` para diagnóstico de migration insegura — domínio
   do Agente 01, abrir handoff se a causa raiz for uma migration específica.
4. **Nunca** rode `prisma db push` em produção como "solução rápida" — mascarra o histórico de
   migrations e diverge do schema real (ver `/AGENTS.md` bloqueador #5).

## 3. Fila travada (BullMQ)

**Sintoma**: `QueueBacklogHigh`/`QueueStalled` (quando a métrica existir — ver
`alert.rules.yml`, hoje pendente de instrumentação pelo Agente 07) ou relato de leads não
enriquecidos/mensagens não enviadas.

1. Painel de filas: `GET /admin/queues` (autenticado) — mostra jobs waiting/active/failed/delayed
   por fila (enriquecimento, sync Bitrix, agente IA, WhatsApp, relatórios — ver
   `src/lib/queue/**`).
2. Filas exigem `ENABLE_QUEUES=true` + `REDIS_URL` configurado — se essas envs estiverem ausentes
   (comportamento padrão hoje no Render, ver `render.yaml`), a fila está **desligada por
   design**, não travada. Confirme isso antes de tratar como incidente.
3. Se Redis está acessível mas jobs não avançam: checar logs do worker
   (`command: ["npm", "run", "start:worker"]`, ver `charts/prospector-atlas/templates/
   worker-deployment.yaml`) por exceção repetida no mesmo job (job "poison pill" sendo
   re-tentado infinitamente).
4. Se o worker está saudável mas a fila cresce mais rápido que processa: considerar
   `worker.autoscaling.enabled: true` (`charts/prospector-atlas/values.yaml`, desligado por
   padrão hoje — ver comentário no values.yaml sobre a limitação de escalar só por CPU/memória).

## 4. Sincronização Bitrix falhando (silenciosamente ou não)

**Sintoma**: leads/negócios não aparecem no Bitrix ou ficam desatualizados; `BitrixSyncFailuresHigh`
quando a métrica existir (pendente — ver handoff ao Agente 06).

1. Bloqueador prioritário de `/AGENTS.md`: "Sincronizações Bitrix que podem falhar
   silenciosamente" — trate como candidato a bloqueador de release, não como ruído.
2. Ver `BITRIX24-LEAD-FLOW-AUDIT.md` (auditoria já existente no repositório) antes de investigar
   do zero.
3. Verificar `src/lib/queue/bitrixSync.worker.ts` nos logs por status de job falho e a rota de
   webhook de entrada (`/api/integrations/bitrix`, autenticada por `auth.application_token` por
   conexão, não HMAC) por 401/403 repetidos — token de conexão pode ter expirado/sido revogado
   no lado do Bitrix.
4. Domínio de correção é do Agente 06 — se a causa raiz for lógica de sync (não infraestrutura),
   abrir handoff em vez de tentar corrigir fora do escopo deste agente.

## 5. Hub de IA inacessível / orçamento de IA estourado

**Sintoma**: bloqueador prioritário de `/AGENTS.md` ("Ferramentas do Hub de IA inacessíveis");
`AIBudgetOverrun` quando a métrica existir (pendente — handoff ao Agente 07).

1. Verificar `verify:ai` (`npm run verify:ai`, script `scripts/verify-ai-studio.ts`) — cobre
   conectividade dos provedores de IA configurados.
2. Checar quais chaves de provedor estão presentes no ambiente real (`GROQ_API_KEY`,
   `GEMINI_API_KEY` no Render — ver `render.yaml`) vs. as que o código tenta em ordem de
   fallback (`src/lib/ai/gateway.ts`) — "inacessível" às vezes é só "chave ausente", não uma
   falha de infraestrutura.
3. Orçamento de IA é lógica do Agente 07 (não há enforcement de orçamento observável via métrica
   Prometheus hoje — custo fica registrado em banco, tabela `AILog`). Se uma ferramenta do Hub de
   IA está bloqueada por orçamento, a correção de lógica é do Agente 07; este runbook cobre só o
   "o que checar primeiro" antes de escalar.

## 6. Rollback (nível de cluster/Helm/ArgoCD)

Aplicável apenas ao caminho k8s/Helm/ArgoCD. **Para o deploy real (Render)**: usar o botão
"Rollback to this deploy" no histórico de deploys do dashboard Render (reverte para a imagem
buildada de um commit anterior) — não há comando de infraestrutura equivalente neste repositório
para o Render, pois ele não expõe API de rollback via IaC versionado aqui.

### Rollback via Helm (chart aplicado diretamente, sem ArgoCD gerenciando)

```bash
helm history prospector-atlas -n <namespace>          # lista revisões
helm rollback prospector-atlas <revisão-anterior> -n <namespace>
```

`helm rollback` reaplica os manifests da revisão anterior, incluindo a tag de imagem anterior em
`image.tag` — **não** re-executa o hook `pre-upgrade` de migração (Helm não roda hooks de
rollback por padrão). Se a revisão que está sendo revertida introduziu uma migration destrutiva
(coluna removida, tipo alterado), reverter o Deployment/Rollout sozinho não desfaz o schema —
avaliar com o Agente 01 se é necessária uma migration de compensação antes ou depois do rollback
de código. Nunca assumir que "reverter o deploy" também reverte o banco.

### Rollback via ArgoCD (caminho documentado como ativo em `argocd/README.md`, quando houver
cluster real)

```bash
argocd app history prospector-atlas-production
argocd app rollback prospector-atlas-production <ID-da-revisão>
```

Mesma ressalva do Helm acima quanto a migrations — `argocd app rollback` reverte o `sync` para um
`targetRevision` anterior do Git, não desfaz mudanças de schema já aplicadas.

### Rollback do Rollout (Argo Rollouts, blue-green)

Com `blueGreen.enabled: true` (default em `values.yaml`), o recurso é um `Rollout`, não um
`Deployment` simples. Se a promoção automática (`autoPromotionSeconds: 30`) ainda não ocorreu:

```bash
kubectl argo rollouts abort <nome-do-rollout> -n <namespace>   # cancela a promoção da versão "green"
kubectl argo rollouts undo <nome-do-rollout> -n <namespace>    # volta pra última versão estável
```

Isso é mais rápido que `helm rollback`/`argocd app rollback` quando a versão nova ainda está na
janela de preview (antes da promoção automática) — a versão "blue" (estável) nunca parou de
servir tráfego de produção durante esse período.

## 7. Verificação pós-incidente

Depois de qualquer ação acima: confirmar `GET /health/ready` voltou a `200`, confirmar no painel
`/admin/queues` (se aplicável) que a fila voltou a processar, e registrar causa raiz + ação
tomada — este runbook não substitui um post-mortem quando o incidente afetou produção real.
