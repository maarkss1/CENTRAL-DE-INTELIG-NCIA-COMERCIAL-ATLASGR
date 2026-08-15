- De: Agente 16 (Runtime, Workers e Escala)
- Para: Agente 08 (QA e Release)
- Onda: 6
- Status: aberto
- Prioridade: alto (não bloqueia esta onda — bloqueia o deploy real do runtime separado, que
  depende também do handoff `16-para-00-remover-workers-de-server-ts.md` ser aprovado/aplicado
  primeiro)

## Problema
`worker.ts` (raiz do repo) é o novo entrypoint que sobe apenas os workers BullMQ, agendadores e o
cron de `cold-leads-scanner` — sem Express/SPA/SSE. Precisa virar um Render worker service
dedicado (ou equivalente), separado do serviço HTTP atual.

## Arquivo(s) envolvido(s)
- `worker.ts` (novo, raiz — meu escopo)
- `render.yaml`, `Dockerfile`, CI (fora do meu escopo — seus)
- `package.json` (fora do meu escopo — precisa de aprovação do 00; ver abaixo)

## Alteração necessária
1. **Script de start**: hoje só existe `dev`/`start`/`build` apontando para `server.ts`. Propor a
   inclusão (via aprovação do Agente 00, dono de `package.json`) de:
   - `"build:worker": "esbuild worker.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/worker.cjs"`
   - `"start:worker": "node dist/worker.cjs"`
   - `"dev:worker": "tsx watch worker.ts"`
   (mesmo padrão já usado para `server.ts`/`dist/server.cjs`).
2. **Render**: novo `render.yaml` worker service (`type: worker`, sem porta HTTP pública exigida
   pelo Render para esse tipo de serviço — mas o processo abre uma porta de health check interna,
   ver abaixo) rodando `npm run start:worker`, com as mesmas env vars do serviço web
   (`DATABASE_URL`, `REDIS_URL`/`ENABLE_QUEUES`, `ENABLE_SEARCH`, `SDR_COLD_CALL_ENABLED`,
   `SDR_COLD_CALL_ORGANIZATIONS`, `SWARM_SCHEDULER_ENABLED`, `SWARM_SCHEDULER_ORGANIZATIONS`, mais
   qualquer credencial de provedor usada pelos jobs — Google, Bitrix, SMTP, Birth Voices).
3. **Health check**: `worker.ts` sobe um HTTP server minimalista (sem Express) só para health —
   porta configurável via `WORKER_HEALTH_PORT` (default `3006`):
   - `GET /health/live` e `/healthz` → sempre 200 se o processo está de pé.
   - `GET /health/ready` e `/readyz` → 200 só se `queuesEnabled` E nenhum dos 2 workers de
     inicialização assíncrona (`sdr-cold-call`, `swarm-scheduler`) falhou ao iniciar; 503 com o
     corpo `{ status: "degraded", errors: [...] }` caso contrário. Use esse endpoint como readiness
     probe — worker morto/degradado precisa aparecer no orquestrador, não só nos logs (ver "Mentira
     mais provável do meu domínio" no prompt da onda).
   - `GET /metrics` → exposto só se `EXPOSE_METRICS=true`, mesmo padrão do `server.ts`.
4. **Réplicas**: este processo é seguro para rodar com mais de uma réplica **desde que** o handoff
   `16-para-00-remover-workers-de-server-ts.md` já tenha sido aplicado (senão duplica
   processamento com o `server.ts` atual). O cron de `cold-leads-scanner` já tem trava distribuída
   via Redis (`cold-leads-scanner:lock`, dono: Agente 07) — múltiplas réplicas do worker executam a
   varredura uma única vez, confirmado nesta onda.
5. **Graceful shutdown**: `worker.ts` trata `SIGTERM`/`SIGINT` com timeout de 25s — drena os jobs
   BullMQ em andamento antes de sair (`Worker#close()`), fecha Redis, sai. Configure o
   `terminationGracePeriodSeconds`/equivalente do Render para pelo menos 30s, para não matar o
   processo antes do timeout interno completar.

## Teste esperado
- Subir `worker.ts` isolado (sem `server.ts` no ar) contra o Redis/Postgres de staging e confirmar
  via `/health/ready` que todas as filas esperadas estão ativas (comparar contra o inventário no
  relatório desta onda).
- Matar o processo com `SIGTERM` durante um job em andamento e confirmar que o job não se perde
  (volta pra fila ou completa) e que o processo sai dentro do timeout.

## Contexto adicional
Inventário completo das filas + build/testes locais estão no relatório de entrega desta onda
(Agente 16). Testei localmente com `tsx worker.ts` contra o `atlas_redis`/`atlas_postgres` do
Docker Compose deste ambiente — funcionou (14 filas registradas, SIGTERM drenou e saiu limpo).
Não testei contra o Render real (sem acesso a esse ambiente nesta execução).
