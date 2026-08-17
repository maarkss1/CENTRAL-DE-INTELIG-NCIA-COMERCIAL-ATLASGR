# Governança de Confiabilidade (SRE)

Este documento centraliza as definições de SLOs (Service Level Objectives), SLIs (Service Level Indicators) e diretrizes de alertas para a plataforma AtlasGR, assegurando monitoramento ativo e respostas rápidas a incidentes.

## 1. SLIs e SLOs

Definimos os seguintes compromissos de nível de serviço para a API:

### 1.1 Disponibilidade Global
- **SLI**: Proporção de requisições HTTP recebendo status `2xx`, `3xx` ou `4xx` em relação ao total (excluindo infraestrutura de roteamento 502/503 e `500` da aplicação).
- **SLO**: 99.9% de sucesso em janelas de 30 dias (Rolling Window).
- **Alerta (Burn Rate)**: Disparar notificação P1 se a taxa de falha (5xx) exceder 2% nos últimos 10 minutos (consumo muito rápido do error budget).

### 1.2 Latência de API (Transacional)
- **SLI**: Percentil 95 (P95) e Percentil 99 (P99) do tempo de resposta (excluindo rotas de `/api/intelligence`).
- **SLO**: 95% das requisições transacionais (ex: leitura de CRM, listagem de contatos) completadas em menos de `500ms`.
- **Alerta**: Aviso (Warning) se P95 for maior que `800ms` por mais de 15 minutos.

### 1.3 Latência de IA e Processamento Assíncrono
- **SLI**: Profundidade da fila (`Queue Depth`) do BullMQ e tempo de espera no pool (`Wait Time`).
- **SLO**: 99% das execuções enfileiradas do Enxame de IA e Integrações (Bitrix) devem iniciar o processamento em menos de `3 minutos`.
- **Alerta**: Disparar P2 se a profundidade da fila `agentWorker` ou `sdr-cold-call` ultrapassar `100 jobs pendentes` por mais de `10 minutos`.

## 2. Readiness e Liveness Probes

Nossas verificações de saúde reais garantem que instâncias com falha saiam da rota de tráfego instantaneamente:

- `/healthz` / `/health/live`: Verifica apenas a capacidade do Node.js de processar o Event Loop.
- `/readyz` / `/health/ready`: Confirma ativamente a conectividade ao banco de dados (Prisma `$queryRaw`) e a prontidão da camada assíncrona (Redis `connection.ping()`). Uma falha transiente no Redis ou Postgres fará o status cair para `503`, removendo a instância do Load Balancer.

## 3. Estrutura de Alertas Recomendada (Prometheus/Alertmanager)

No painel de observabilidade (Grafana), implemente as seguintes regras:

1. **Host_OOM_Kill**: Container morto por falta de memória (Sinal de memory leak nos Scanners ou IA).
2. **Postgres_Connection_Pool_Full**: Uso do Prisma Connection Pool > 90% (Necessita scale-up ou revisão de N+1 queries).
3. **Redis_Memory_Critical**: Uso da RAM do Redis > 85% (Risco de evicção de sessões do WhatsApp e jobs do BullMQ).
4. **BullMQ_Failed_Rate**: Alta taxa de eventos `failed` reportados nas filas do background (Possível regressão lógica ou bloqueio de API externa).

## 4. Backups e Disaster Recovery

A plataforma conta com script formalizado (`scripts/backup.sh`) para o Data Tier primário.

- **Frequência**: O backup deve ser automatizado diariamente via crontab do SO ou via Kubernetes CronJob na camada da nuvem (não embarcado no Node.js).
- **Armazenamento**: Snapshots devem ser criptografados e salvos em um Object Storage secundário e distante (ex: Amazon S3).
- **RTO (Recovery Time Objective)**: < 4 Horas.
- **RPO (Recovery Point Objective)**: < 24 Horas (No pior caso).
