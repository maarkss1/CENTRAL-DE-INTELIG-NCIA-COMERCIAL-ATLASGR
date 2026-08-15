- De: Agente 16 (Runtime, Workers e Escala)
- Para: Agente 10 (Infraestrutura, Observabilidade e SRE)
- Onda: 6
- Status: aberto
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
