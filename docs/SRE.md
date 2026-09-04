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

**Atualizado na Fase Final 3 (SRE, `.agents/runs/final-fase-3.md`)**: até 2026-08-17, esta seção
descrevia uma meta aspiracional sem lastro real — o banco de produção (Supabase, plano `free` da
organização) não tinha backup gerenciado nem PITR, e nada no repositório rodava
`scripts/backup.sh` (script local, pensado para o Postgres de desenvolvimento/CI) contra produção.
Isso foi corrigido então com um pipeline próprio, não com upgrade de plano (decisão do dono do
repositório na época).

**Atualização (2026-09-02)**: cotado inicialmente subir o Supabase de produção para o plano Pro
(que teria backup diário gerenciado incluso, mas PITR só como add-on separado de ~US$100-400/mês
dependendo da retenção). Decisão final do dono do repositório, na mesma sessão, foi migrar o banco
para **Neon** em vez de pagar o Supabase Pro — ver `docs/deploy/producao.md` seção 1. No plano
gratuito atual do Neon, o histórico de PITR é de só 6 horas; o plano pago Launch do Neon inclui até
7 dias de PITR **sem cobrança separada** (diferente do Supabase, onde isso é sempre add-on à
parte) — decisão de migrar do free para o Launch fica para o dono do repositório, fora do escopo
desta rodada. Qualquer backup gerenciado do provedor de banco (Supabase ou Neon) deve ser tratado
**como camada adicional** ao pipeline `backup-production.yml` abaixo, não como substituto —
provedor diferente (Cloudflare R2 vs. infraestrutura interna do provedor de banco) continua
reduzindo correlação de falha entre as duas cópias.

- **Mecanismo**: `.github/workflows/backup-production.yml` — `pg_dump` diário (05:00 UTC) contra o
  Postgres real, via papel dedicado `prospector_backup` (somente leitura, `BYPASSRLS` — necessário
  para capturar todos os tenants, nunca usado pela aplicação), saída comprimida e criptografada
  (GPG simétrico, AES256) antes de sair do runner do GitHub Actions, enviada para um bucket
  Cloudflare R2 dedicado (fora do repositório, fora do Supabase — provedor diferente do banco,
  reduz correlação de falha). Retenção de 30 dias, aplicada pelo próprio workflow.
- **Estado desta entrega**: workflow e papel de banco prontos e testados na parte mecânica (ver
  Fase Final 3 §2.2, ciclo backup→restore→validação de RLS executado em ambiente isolado). A
  execução real contra produção depende de 3 secrets do GitHub ainda não configurados
  (`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET`, mais
  `BACKUP_DATABASE_URL`/`BACKUP_ENCRYPTION_PASSPHRASE`) — sem eles o workflow falha ao rodar, não
  falha silenciosamente. Ver instruções de ativação entregues ao dono do repositório na mesma
  sessão desta atualização.
- **RTO (Recovery Time Objective)**: mecanismo de restore comprovado (`scripts/restore.sh`) em
  ambiente isolado, em segundos para um dataset pequeno — não validado em escala de produção
  (volume real do banco não medido nesta rodada). Não declarar um RTO numérico para produção sem
  essa medição.
- **RPO (Recovery Point Objective)**: **< 24h assim que o pipeline acima estiver ativo** (backup
  diário) — meta agora tem mecanismo real por trás, não é mais só uma frase sem lastro. Antes da
  ativação, RPO efetivo é "sem limite conhecido" (nenhum backup existe).
