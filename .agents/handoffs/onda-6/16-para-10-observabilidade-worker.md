- De: Agente 16 (Runtime, Workers e Escala)
- Para: Agente 10 (Infraestrutura, Observabilidade e SRE)
- Onda: 6
- Status: em-andamento
- Prioridade: normal

## Problema
O novo processo `worker.ts` precisa de monitoramento/alertas próprios, separados do processo HTTP,
depois que o deploy do worker service acontecer (ver handoff `16-para-08-deploy-worker-service.md`).

## Arquivo(s) envolvido(s)
`worker.ts` (novo), `infrastructure/observability/**` (seu escopo)

## Alteração necessária (sugestão, a validar com você)
1. **Readiness como sinal de alerta**: `GET /health/ready` (porta `WORKER_HEALTH_PORT`, default
   `3006`) retorna 503 com `{ status: "degraded", errors: [...] }` quando `queuesEnabled` é falso
   ou quando `sdr-cold-call`/`swarm-scheduler` falharam ao inicializar. Um 503 sustentado nesse
   endpoint é o sinal mais direto de "worker morto em silêncio" (ver "Mentira mais provável do meu
   domínio" no prompt da onda) — sugiro alerta com o mesmo padrão dos outros health checks já
   monitorados.
2. **Métricas `bullmq_queue_*`**: já existiam (Onda 5, `src/lib/queue/metrics.ts`,
   `registerQueueForMetrics`). Continuam corretas depois da separação — cada `Queue`/`Worker` é
   registrado no mesmo módulo de métricas independente de estar em `server.ts` ou `worker.ts`.
   `worker.ts` expõe `/metrics` (porta de health) só quando `EXPOSE_METRICS=true`, mesmo padrão do
   processo HTTP — nenhuma métrica nova foi criada, só o processo que as expõe mudou.
3. **Contagem de workers ativos**: o log estruturado na inicialização
   (`worker.ts: filas registradas nesta inicialização.`) inclui `activeWorkers`/`totalRegistered`
   — um `activeWorkers` abaixo do esperado (excluindo os gated por env/organizações habilitadas,
   que reduzem o total legitimamente) pode virar um painel simples de "quantas filas deveriam estar
   processando vs. quantas estão".
4. **Alerta de shutdown por timeout**: `worker.ts` loga
   `worker.ts: shutdown excedeu o timeout — forçando saída` como `error` quando o `SIGTERM` não
   drena a tempo (25s). Isso indica job preso — vale um alerta de log pattern.

## Teste esperado
N/A — handoff de coordenação, você decide o mecanismo de alerta real (Prometheus/Alertmanager,
Grafana, etc., conforme já usado no projeto).

## Contexto adicional
Inventário completo, comportamento testado localmente e resultado de `SIGTERM` no relatório de
entrega desta onda (Agente 16).

## Resolução (parcial — Agente 10, Onda 8, go-live)

Ver `infrastructure/observability/RUNBOOK.md` → seção 7 ("Worker dedicado (`worker.ts`) —
observabilidade preparada, ainda não aplicável") para o texto completo. Resumo:

- **Confirmado via API real do Render nesta rodada** (não suposição): o serviço
  `prospector-atlas-worker` declarado em `render.yaml` não foi criado de verdade no workspace de
  produção — só o serviço web `prospector-atlas` existe hoje. Isso bate com
  `.agents/handoffs/onda-6/16-para-08-deploy-worker-service.md` (status `em-andamento`,
  deliberado).
- Decidi o mecanismo de alerta (Prometheus, mesmo padrão do resto do projeto) e documentei o
  contrato de porta/endpoint (`WORKER_HEALTH_PORT`, `/health/ready`, `/metrics`) para quando o
  worker for ativado.
- **Não criei uma regra em `alert.rules.yml` apontando para esse endpoint**: como o processo não
  roda separadamente em produção hoje, uma regra Prometheus contra ele ficaria "unknown" de forma
  enganosa (mesmo problema que as regras "pendente-instrumentacao" da Onda 4 já evitavam
  deliberadamente). Métricas `bullmq_queue_*` já estão cobertas independente de onde os workers
  rodam (mesmo módulo `src/lib/queue/metrics.ts`).
- Mantido `em-andamento`, não `resolvido`: falta a regra real de `/health/ready` do worker em
  `alert.rules.yml`, que só faz sentido depois que o Agente 08 ativar o serviço de verdade (junto
  com o corte de `server.ts` do handoff `16-para-00-remover-workers-de-server-ts.md`). Quando isso
  acontecer, adicionar ao grupo `prospector-atlas.filas.ativos-hoje` (ou um grupo novo
  `prospector-atlas.worker-dedicado.ativos-hoje`) uma regra de probe HTTP contra
  `/health/ready` do worker, seguindo o mesmo padrão dos grupos já promovidos nesta rodada.
