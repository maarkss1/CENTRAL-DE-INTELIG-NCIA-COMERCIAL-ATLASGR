# Runbook — Prospector-Atlas (Agente 10, Onda 4 — atualizado na Onda 8, go-live)

Runbook de resposta a incidentes e de go-live para os cenários já mapeados como bloqueadores em
`/AGENTS.md` e para migração/rollback (missão do Agente 10 — ver
`.agents/prompts/10-infraestrutura-sre.md`).

**Antes de tudo: qual é o deploy ativo?** Verifique o ambiente real antes de agir — este projeto
tem dois caminhos de deploy documentados e só um está de fato ativo hoje:

| Caminho | Status | Onde |
| --- | --- | --- |
| Render (monólito Express: API + estático do Vite) + Supabase (Postgres/Storage) + Cloudflare (DNS/CDN) | **Ativo em produção** | `render.yaml`, `docs/deploy/producao.md` |
| Kubernetes/Helm/ArgoCD (`k8s/`, `charts/`, `argocd/`) | Aspiracional/legado, nenhum cluster real registrado | `charts/README.md`, `argocd/README.md`, `k8s/README.md` |

> **Correção de registro (Onda 8):** a missão desta rodada citava "Render+Vercel" como caminho
> real. Verificado nesta rodada — via `docs/deploy/producao.md` (decisão arquitetural explícita:
> "Não há split Vercel/Render porque isso exigiria reescrever autenticação... para cookies
> cross-domain") e via consulta direta ao workspace Render real (MCP Render, ver seção "Go-live"
> abaixo) — **não existe Vercel neste projeto**. É um único serviço Render (`prospector-atlas`,
> `srv-d9qtn8bm8hqs7395qtpg`) servindo API e frontend estático do mesmo processo Express. Não há
> nenhum vestígio de Vercel em `render.yaml`, `package.json` ou no workspace consultado. Este
> runbook usa "Render" para o caminho real a partir daqui.

Os passos abaixo cobrem os dois caminhos (Render real e k8s aspiracional); identifique qual se
aplica antes de executar comandos `kubectl`/`helm`/`argocd` — eles não têm efeito nenhum se o
incidente é no serviço Render real.

## 0. Go-live — passo a passo executável (Render)

Verificado nesta rodada contra o serviço Render real via MCP (workspace "Marcelo's workspace",
serviço `prospector-atlas` = `srv-d9qtn8bm8hqs7395qtpg`, branch `main`, plano `free`, região
`oregon`) — não é um procedimento teórico, é o que o serviço configurado hoje realmente faz.

### 0.1 Pré-checks (antes de mesclar em `main`)

1. `ci.yml` (GitHub Actions) verde no PR/commit que vai para `main` — lint, typecheck, testes
   unitários/integração/E2E, build. O Render **não roda gate de qualidade nenhum**, só
   `buildCommand` (ver `docs/deploy/producao.md` seção 2.3) — se `main` não tiver branch
   protection exigindo `ci.yml`, código quebrado chega direto em produção no próximo push.
2. Se a mudança envolve `prisma/schema.prisma`/migrations: confirmar que a migration é seguramente
   aplicável a dados de produção existentes (`.claude/skills/database-integrity/SKILL.md`) —
   nenhuma migration destrutiva sem plano de compensação. Domínio do Agente 01, não deste runbook,
   mas é o pré-check de maior risco real (ver bloqueador #5 de `/AGENTS.md`: "Deploy capaz de
   iniciar sem aplicar migrações" — aqui o risco inverso, migração que quebra o boot, é o que este
   passo cobre).
3. Confirmar que nenhuma env var nova exigida pelo código já mesclado está faltando no Render
   (**Environment** do serviço) — o processo sobe com a env ausente lida como `undefined`/valor
   default do schema Zod (`src/config/env.ts`), não falha o build; o sintoma só aparece em
   runtime (rota específica quebrando, feature "inacessível").
4. Checklist completo de validação pós-deploy já existe e não deve ser duplicado aqui — ver
   `docs/deploy/producao.md` seção 7 e `docs/deploy/RELEASE_CHECKLIST.md` (domínio do Agente 08).

### 0.2 Ordem de deploy (automática, sem passo manual — confirmado no serviço real)

Cada push em `main` dispara, sem intervenção:

1. **Build**: `npm ci --include=dev && npm run build`.
2. **Migração antes do start** (contrato de `/AGENTS.md` bloqueador #5, implementado por
   Agente 01/08): `startCommand: npx prisma migrate deploy && npm run start` — só migrations novas
   desde o baseline já aplicado rodam; `npm run start` só é executado (logo, só passa a aceitar
   tráfego) depois que `prisma migrate deploy` termina com sucesso.
3. **Health check antes de rotear tráfego**: Render bate em `healthCheckPath: /health/ready`
   (`SELECT 1` real no Postgres, não só "processo respondeu") até responder `200` antes de mover
   tráfego para a instância nova. Instância antiga continua servindo até esse ponto.
4. Se migração ou health check falharem, o deploy é abortado — instância antiga permanece no ar.
   **Não há downtime automático em nenhum desses casos** — o único jeito de ter downtime é a
   instância antiga também cair antes da nova ficar pronta.
5. **Ressalva do plano `free`**: `preDeployCommand` (instância efêmera separada para migração,
   zero-downtime "de verdade") só existe em planos pagos do Render — o serviço está em
   `plan: free` hoje (sem cartão cadastrado no workspace) e roda a migração dentro do
   `startCommand` em vez de uma instância separada. A garantia de "nunca servir tráfego contra
   schema desatualizado" continua valendo (passo 3); só perde o isolamento extra.

Não há passo manual de "disparar o deploy" no fluxo normal — é `git push`/merge em `main`. Um
redeploy manual sem novo commit (ex.: limpar cache de build) é feito pelo botão "Manual Deploy" no
dashboard, ou pela chamada de API/MCP `trigger_deploy` (redeploya sempre o HEAD atual da branch
configurada — não aceita um commit específico, não serve para rollback, ver seção 6).

### 0.3 Confirmar saúde pós-deploy

1. `GET https://<host-do-serviço>/health/live` → `200 { status: "ok" }` (processo vivo).
2. `GET https://<host-do-serviço>/health/ready` → `200` (Postgres real acessível). Se isto já
   passou, o Render já roteou tráfego pra essa instância — checar isto de fora é redundante com o
   próprio health check do Render, mas confirma que continua saudável minutos depois do deploy,
   não só no instante do rollout.
3. Dashboard Render → serviço → aba **Deploys**: status do deploy mais recente deve ser `live`
   (não `deactivated`/`build_failed`/`update_failed`). Confirmado nesta rodada: a API de deploys
   do Render (usada também pelo MCP Render) retorna exatamente esse enum de status por deploy —
   deploys anteriores ficam com status `deactivated` automaticamente quando um novo fica `live`,
   não são apagados (isso é o que sustenta o rollback da seção 6).
4. Métricas nativas do Render (CPU/memória) na aba **Metrics** do dashboard, ou via `get_metrics`
   do MCP Render — confirmado funcionando neste serviço (memória/CPU por instância retornam
   série real). **Gap encontrado nesta rodada**: `http_request_count` retornou vazio para este
   serviço via API — não há confirmação de que a contagem nativa de requisições HTTP do Render
   está populada para este serviço (pode ser limitação do plano `free`, falta de tráfego real
   registrado, ou outra causa não identificada). Não depender só da métrica nativa do Render para
   confirmar tráfego pós-deploy — usar os `/health/*` e os logs (`list_logs`/aba Logs) como fonte
   primária até isso ser investigado.
5. Seguir o checklist funcional completo (login, `/api/companies`, RLS por tenant, IA, TLS) em
   `docs/deploy/producao.md` seção 7 — não duplicado aqui.

### 0.4 Quem aciona rollback e como

**Lacuna que precisa de decisão humana, não técnica**: este repositório não define, em nenhum
documento existente (`/AGENTS.md`, `docs/deploy/**`, `.agents/**`), quem tem autoridade/acesso para
acionar um rollback em produção nem um canal de escalonamento (on-call, Slack, telefone). Isso não
é algo que este agente pode decidir por conta própria — é uma decisão organizacional. Registrado
aqui como pendência explícita para o usuário/gestão definir antes do primeiro incidente real:
- quem tem acesso ao dashboard Render do workspace de produção (rollback de código é uma ação
  manual do dashboard, ver seção 6 — não há automação scriptável para isso hoje);
- canal de decisão para autorizar rollback quando o incidente também envolve dado (migration
  aplicada que precisaria de compensação, não só reverter código — ver seção 6).

**Mecanismo (como), já confirmado tecnicamente** — ver seção 6, "Rollback via Render".

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
2. **Render**: dashboard → serviço `prospector-atlas` (`srv-d9qtn8bm8hqs7395qtpg`, confirmado
   nesta rodada) → aba Logs/Events. Verificar se o deploy mais recente falhou no `startCommand`
   (`npx prisma migrate deploy && npm run start` — ver seção 2 abaixo se for isso; corrigido nesta
   rodada: a referência anterior apontava para "seção 3", que é "Fila travada", não "Falha de
   migração") ou se é o banco Supabase que está fora.
3. **k8s/Helm** (se ativado): `kubectl get pods -n <namespace>`, `kubectl describe pod <pod>`,
   `kubectl logs <pod> --previous` (se reiniciou). Ver `argocd app get prospector-atlas-<env>`
   para status de sync/health do ArgoCD.
4. Se o Postgres (Supabase) está fora: incidente é do provedor, não corrigível por
   redeploy/restart — verificar status page do Supabase.

## 2. Falha de migração (deploy travado)

**Sintoma**: deploy não conclui; `MigrationJobFailed` (só aplicável ao caminho k8s aspiracional,
requer kube-state-metrics — ver `alert.rules.yml`); no Render (caminho real, ver seção 0.2),
`startCommand` falha antes de `npm run start` rodar.

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

**Sintoma**: `QueueBacklogHigh`/`QueueStalled` — métrica real desde a Onda 5-7
(`src/lib/queue/metrics.ts`, ver `alert.rules.yml` → grupo `prospector-atlas.filas.ativos-hoje`),
só ausente de `/metrics` se `ENABLE_QUEUES=false` (padrão hoje no serviço web do Render) — ou
relato de leads não enriquecidos/mensagens não enviadas.

1. Painel de filas: `GET /admin/queues` (autenticado) — mostra jobs waiting/active/failed/delayed
   por fila (enriquecimento, sync Bitrix, agente IA, WhatsApp, relatórios — ver
   `src/lib/queue/**`).
2. Filas exigem `ENABLE_QUEUES=true` + `REDIS_URL` configurado — se essas envs estiverem ausentes
   (comportamento padrão hoje no Render, ver `render.yaml`), a fila está **desligada por
   design**, não travada. Confirme isso antes de tratar como incidente.
3. **Quem processa a fila hoje (Render real)**: o serviço `prospector-atlas-worker` (`type:
   worker` em `render.yaml`, preparado pelo Agente 16/08 na Onda 6) **ainda não foi criado de
   verdade no Render** — confirmado nesta rodada consultando o workspace real via API: só existe
   o serviço web `prospector-atlas`. Se `ENABLE_QUEUES=true` for ligado sem o worker dedicado
   ativo, é o próprio `server.ts` quem processa os jobs (workers ainda não foram removidos de lá —
   ver `.agents/handoffs/onda-6/16-para-00-remover-workers-de-server-ts.md`, `status:
   em-andamento`, corte proposital ainda não aplicado). Não assuma que o worker dedicado está
   rodando só porque `render.yaml` o declara.
4. Se Redis está acessível mas jobs não avançam: checar logs do processo que está de fato
   processando (server.ts hoje, ou o worker dedicado quando for ativado) por exceção repetida no
   mesmo job (job "poison pill" sendo re-tentado infinitamente). No caminho k8s aspiracional,
   `charts/prospector-atlas/templates/worker-deployment.yaml` cobre o mesmo cenário.
5. Autoscaling do worker por profundidade de fila não existe no Render (plano `free`/`starter` não
   tem esse mecanismo) nem está ligado no caminho k8s (`worker.autoscaling.enabled: false` por
   padrão em `charts/prospector-atlas/values.yaml`) — hoje, fila crescendo mais rápido que a
   capacidade de processamento exige intervenção manual (mais réplicas manualmente, ou investigar
   por que o processamento está lento).

## 4. Sincronização Bitrix falhando (silenciosamente ou não)

**Sintoma**: leads/negócios não aparecem no Bitrix ou ficam desatualizados; `BitrixSyncFailuresHigh`
— métrica real desde a Onda 5 (`bitrix_sync_failures_total`, ver `alert.rules.yml` → grupo
`prospector-atlas.bitrix.ativos-hoje`), disparando de fato quando `EXPOSE_METRICS=true`.

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
`AIBudgetOverrun` — métrica real desde a Onda 5-7 (`ai_usage_cost_usd_total`/
`ai_usage_budget_usd_total`, `src/lib/ai/metrics.ts`, ver `alert.rules.yml` → grupo
`prospector-atlas.orcamento-ia.ativos-hoje`), **mas só dispara se `AI_MONTHLY_BUDGET_USD` estiver
configurada no ambiente**. `AI_MONTHLY_BUDGET_USD` **não está declarada em `render.yaml`**
(confirmado nesta rodada — a variável não aparece na lista de `envVars` do blueprint) — como o
Render MCP não expõe os valores/nomes de env vars efetivamente configuradas no serviço (só o
dashboard mostra isso), não dá para confirmar 100% se alguém já a adicionou manualmente fora do
blueprint. **Lacuna que precisa de confirmação humana com acesso ao dashboard Render**: verificar
em Environment se `AI_MONTHLY_BUDGET_USD` está definida; se não estiver, este alerta fica
`unknown` permanentemente em produção. Sem orçamento configurado, o custo de IA continua sendo
registrado (`ai_usage_cost_usd_total` e a tabela `AILog`), só não há um limiar automático para
alertar sobre estouro.

1. Verificar `verify:ai` (`npm run verify:ai`, script `scripts/verify-ai-studio.ts`) — cobre
   conectividade dos provedores de IA configurados.
2. Checar quais chaves de provedor estão presentes no ambiente real (`GROQ_API_KEY`,
   `GEMINI_API_KEY` no Render — ver `render.yaml`) vs. as que o código tenta em ordem de
   fallback (`src/lib/ai/gateway.ts`) — "inacessível" às vezes é só "chave ausente", não uma
   falha de infraestrutura.
3. Se `AI_MONTHLY_BUDGET_USD` estiver configurada e `AIBudgetOverrun` disparar: orçamento de IA é
   lógica do Agente 07 (não há enforcement que bloqueie chamadas automaticamente — a métrica só
   alerta, não corta). Se uma ferramenta do Hub de IA está bloqueada, a correção de lógica é do
   Agente 07; este runbook cobre só o "o que checar primeiro" antes de escalar.

## 6. Rollback

### Rollback via Render (caminho real de produção)

Verificado nesta rodada contra o serviço real (`prospector-atlas`, `srv-d9qtn8bm8hqs7395qtpg`) via
MCP Render — não é suposição:

- Cada deploy tem um `status` (`live`, `deactivated`, `build_failed`, `update_failed`, etc.) e o
  histórico completo continua disponível depois que um deploy novo assume — o deploy anterior
  passa de `live` para `deactivated`, não é apagado. Confirmado consultando os últimos 10 deploys
  reais do serviço nesta rodada (todos os `deactivated` anteriores continuam listados com seu
  commit exato).
- **Mecanismo de rollback**: dashboard Render → serviço → aba **Deploys** → menu de contexto de
  um deploy anterior com status `live`/`deactivated` bem-sucedido → **"Rollback to this deploy"**.
  Isso reconstrói/reimplanta o commit exato daquele deploy (documentado publicamente pela Render
  em render.com/docs/deploys). Este runbook não executou esse botão nesta rodada (ação real de
  produção, fora do escopo de uma tarefa de documentação/observabilidade e não autorizada sem
  pedido explícito) — **o mecanismo em si está confirmado pela própria estrutura de dados de
  deploy do Render (histórico completo, com status, preservado)**, mas o texto exato do menu/fluxo
  de clique não foi verificado ao vivo nesta sessão. Se o texto do botão mudou na UI do Render,
  quem for executar o rollback real deve confirmar visualmente antes de agir sob pressão de
  incidente.
- **Sem mecanismo scriptável/API neste toolset para rollback a um commit específico**: a
  ferramenta de deploy do MCP Render (`trigger_deploy`) só redeploya o HEAD atual da branch
  configurada — não aceita um commit/deploy ID alvo. Rollback para uma versão anterior específica
  é, hoje, uma ação manual no dashboard, não scriptável a partir daqui. Se isso for um problema
  operacional (ex.: querer rollback automatizado por CI), é uma decisão de produto/infra futura,
  não implementada nesta rodada.
- **Env vars não são versionadas por deploy**: rollback de código no Render reimplanta o commit
  antigo com as env vars **atuais** do serviço (Environment), não as que estavam ativas no momento
  daquele deploy antigo. Se o incidente foi causado por uma env var nova mal configurada (não pelo
  código), rollback de deploy não resolve — corrija a env var diretamente.
- **Migração não é desfeita pelo rollback**: `startCommand: npx prisma migrate deploy && npm run
  start` roda a cada deploy, incluindo um rollback (que é, mecanicamente, um novo deploy do commit
  antigo). Se a migration mais recente já rodou e é destrutiva (coluna removida, tipo alterado),
  reverter só o código não desfaz o schema — o código antigo pode nem funcionar contra o schema
  novo. Avaliar com o Agente 01 se é necessária uma migration de compensação antes do rollback.
  Nunca assumir que "reverter o deploy" também reverte o banco — mesma ressalva que já valia para
  o caminho k8s abaixo.
- **Sem downtime automático conhecido durante o rollback**: mesmo mecanismo de health check da
  seção 0.2 se aplica — a instância antiga (que está falhando) só é substituída pela instância do
  commit revertido depois que ela passar em `/health/ready`.

### Caminho k8s/Helm/ArgoCD (aspiracional — só aplicável se um cluster real existir)

Aplicável apenas ao caminho k8s/Helm/ArgoCD, que **não é o deploy ativo hoje** (ver topo deste
documento). Mantido aqui como referência caso o projeto migre para esse caminho no futuro.

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

## 7. Worker dedicado (`worker.ts`) — observabilidade preparada, ainda não aplicável

Resposta ao handoff `.agents/handoffs/onda-6/16-para-10-observabilidade-worker.md` (Agente 16,
Onda 6, `status: aberto`).

**Status real confirmado nesta rodada**: o serviço `prospector-atlas-worker` declarado em
`render.yaml` (`type: worker`, `startCommand: npx prisma migrate deploy && npm run start:worker`)
**não existe no Render de verdade** — consultado o workspace real via API, só o serviço web
`prospector-atlas` está provisionado. Isso está alinhado com o próprio handoff de deploy
(`.agents/handoffs/onda-6/16-para-08-deploy-worker-service.md`, `status: em-andamento`
deliberadamente): falta (a) aplicar o corte de `server.ts` que hoje ainda processa as filas
(`16-para-00-remover-workers-de-server-ts.md`) e (b) autorização de gasto do usuário, já que
serviços `type: worker` do Render não têm plano `free`.

Enquanto isso não acontecer, monitorar `worker.ts` como processo separado **não é aplicável** —
não há processo separado rodando em produção. O runbook desta seção documenta o contrato para
quando ele for ativado, não um estado atual:

1. **Readiness como sinal de alerta**: `GET /health/ready` na porta `WORKER_HEALTH_PORT` (`3006`
   por padrão) retorna 503 com `{ status: "degraded", errors: [...] }` quando `queuesEnabled` é
   falso ou quando `sdr-cold-call`/`swarm-scheduler` falharam ao iniciar. Sugestão de alerta (não
   criada em `alert.rules.yml` ainda — sem endpoint HTTP real para o Prometheus fazer probe até o
   serviço existir): `probe_success{instance="<worker>:3006/health/ready"} == 0` via
   `blackbox_exporter` (não incluído no stack local hoje, seria dependência nova) ou, se o
   ambiente de destino oferecer HTTP health check nativo (Render supõe isso via
   `healthCheckPath`, mas services `type: worker` do Render não expõem porta pública/health check
   HTTP gerenciado pela plataforma — confirmar isso é uma lacuna, ver seção 8), via readiness probe
   do orquestrador equivalente.
2. **Métricas `bullmq_queue_*`**: já cobertas pelo grupo `prospector-atlas.filas.ativos-hoje` em
   `alert.rules.yml` — continuam corretas independente de rodar em `server.ts` ou `worker.ts`
   (mesmo módulo `src/lib/queue/metrics.ts`), desde que o processo que efetivamente roda os
   workers exponha `/metrics` com `EXPOSE_METRICS=true`.
3. **Contagem de workers ativos / shutdown por timeout**: `worker.ts` já loga
   `activeWorkers`/`totalRegistered` na inicialização e `worker.ts: shutdown excedeu o timeout —
   forçando saída` como `error` quando `SIGTERM` não drena a tempo (25s). Sem um coletor de logs
   estruturado versionado neste repositório com alerta por padrão de mensagem (Loki/Grafana Loki
   local existe via `infrastructure/observability/loki.yml`, mas sem regra de alerta baseada em
   `LogQL` neste arquivo — Prometheus só lê métricas, não logs), este item fica como
   **recomendação para quando o worker for ativado**, não uma regra pronta.

**Resolução parcial deste handoff**: mecanismo de alerta decidido (Prometheus, consistente com o
resto do projeto) e contrato de porta/endpoint documentado; regra concreta em `alert.rules.yml`
**não adicionada** porque apontar para um endpoint que não existe em produção seria o mesmo erro
que a Onda 4 evitou para as outras métricas (regra "pronta" mas enganosa). Deixado como
`em-andamento` no handoff original — quem ativar o worker de verdade (Agente 08, junto com o corte
de `server.ts`) deve avisar o Agente 10 (ou adicionar a regra diretamente, seguindo o padrão dos
grupos `ativos-hoje` deste arquivo) para promover isso a uma regra real.

## 8. Lacunas conhecidas (Onda 8 — não inventadas, documentadas para decisão)

| Lacuna | Detalhe | Quem decide/resolve |
| --- | --- | --- |
| Sem dashboard Grafana versionado | `infrastructure/observability/` tem datasources (`grafana-datasources.yml`) mas nenhum `dashboards/*.json` — Grafana sobe "em branco", só com os datasources provisionados. Não criado nesta rodada por falta de tempo dentro do escopo de go-live (priorizado runbook/alertas executáveis) — fica como próximo passo, não crítico para o go-live em si (Prometheus `/alerts` e consultas ad-hoc já cobrem o mínimo). | Agente 10, próxima rodada |
| `AI_MONTHLY_BUDGET_USD` possivelmente não configurada em produção | Não está em `render.yaml`; não é possível confirmar via API/MCP se foi setada manualmente no dashboard. Sem ela, `AIBudgetOverrun` fica `unknown` para sempre. | Confirmação humana (dashboard Render) + decisão de negócio do valor do orçamento |
| Métrica HTTP por status code (`HighErrorRate5xx`) | Auto-instrumentação OTel emite métricas de runtime/GC mas não a métrica HTTP com a versão instalada de `instrumentation-http`. Ver `alert.rules.yml` para o diagnóstico completo. | Agente 01 (dono de `src/lib/tracing.ts`) |
| `MigrationJobFailed` (grupo k8s) não tem contraparte real no Render | Não é uma lacuna a fechar — é a confirmação de que o caminho k8s é aspiracional. A garantia equivalente no Render já existe via `startCommand`+`healthCheckPath` (seção 0.2). Nenhuma ação necessária a menos que o projeto migre para k8s de verdade. | N/A |
| Quem aciona rollback e por qual canal | Ver seção 0.4 — decisão organizacional, não técnica. | Usuário/gestão |
| Worker dedicado sem observabilidade aplicável | Ver seção 7 — não há processo separado rodando ainda. | Agente 08 (ativação) + Agente 10 (regra de alerta quando ativar) |
| `http_request_count` nativo do Render vazio para `prospector-atlas` | Confirmado via `get_metrics` do MCP Render nesta rodada — pode ser limitação do plano `free`, falta de tráfego capturado no intervalo consultado, ou outra causa não identificada. Não impede os `/health/*` nem os logs de servirem como fonte de verdade, mas reduz a confiança em métricas nativas do Render para SLO de erro 5xx (reforça a importância de resolver a lacuna de `HighErrorRate5xx` acima). | Confirmação humana (dashboard Render, plano pago) se for crítico |
| Sem Alertmanager configurado | Já documentado no cabeçalho de `alert.rules.yml` desde a Onda 4 — alertas ficam visíveis em `/alerts` do Prometheus mas não notificam ninguém (Slack/e-mail/PagerDuty) até um receptor ser configurado. Continua verdade nesta rodada. | Decisão de produto/operação (qual canal usar) |

## 9. Verificação pós-incidente

Depois de qualquer ação acima: confirmar `GET /health/ready` voltou a `200`, confirmar no painel
`/admin/queues` (se aplicável) que a fila voltou a processar, e registrar causa raiz + ação
tomada — este runbook não substitui um post-mortem quando o incidente afetou produção real.
