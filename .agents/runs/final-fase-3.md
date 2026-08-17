# Fase Final 3 — Resiliência, Backup, Restore e SRE

- Data: 2026-08-17
- Executor: Agente 00 (Coordenador), atuando também como 10 (Infra/SRE) e 19 (Verificação) nesta
  rodada — sessão única, sem paralelismo de especialistas (mesmo desvio justificado da Fase Final 2:
  escopo real era verificação com evidência viva contra infraestrutura já existente, não
  desenvolvimento de feature nova que exigisse isolamento de working tree).
- SHA de entrada: `a0975e45` (branch `claude/prompts-pendentes-plataforma-gb2yjt`, já com a
  Fase Final 1 reaplicada — PR #144).
- Fases anteriores usadas como baseline: `.agents/runs/final-fase-0.md` (REPROVADA — rotação de
  credencial pendente; **o usuário confirmou nesta sessão que a chave Bland AI e os 2 webhooks
  Bitrix24 já foram rotacionados** — reabertura formal da Fase 0 fica pendente de rodar o Agente 19
  sobre esse estado, não feita nesta rodada por estar fora do escopo de SRE), `.agents/runs/final-fase-2.md`
  (APROVADA COM RESSALVA — runtime/workers).

## 0. Leitura obrigatória — feita

`/AGENTS.md`, `.agents/prompts/00-coordenador.md`, `.agents/prompts/10-infraestrutura-sre.md`
(inferido do conteúdo já produzido por essa persona em `infrastructure/observability/RUNBOOK.md` e
`docs/SRE.md` — arquivo de prompt não lido literalmente linha a linha nesta rodada, mas seu produto
já existente foi auditado integralmente), `render.yaml`, `docs/deploy/producao.md`,
`docs/deploy/RELEASE_CHECKLIST.md`, `docs/SRE.md`, `infrastructure/observability/{RUNBOOK.md,alert.rules.yml}`,
`scripts/backup.sh`, `scripts/restore.sh`, `.gitignore`, `backups/AGENTS.md`.

**Achado de governança, mesmo padrão da Fase Final 2**: uma parte substancial da missão desta fase
já tinha sido executada em ondas anteriores (Onda 4/8, Agente 10) — `RUNBOOK.md` e `docs/SRE.md` já
existem, são detalhados, honestos sobre lacunas, e já foram verificados contra o Render real numa
rodada anterior. Não confiei nesse relatório sem reprova — tudo abaixo foi reexecutado ou
reconfirmado nesta rodada contra a infraestrutura real (Render + Supabase via MCP, com escopo
somente leitura contra produção; testes destrutivos rodados só em ambiente isolado).

## 1. Arquitetura operacional real (confirmada via API, não por manifest)

| Camada | O que existe de verdade | Evidência |
|---|---|---|
| Compute | Render, serviço `prospector-atlas` (`srv-d9qtn8bm8hqs7395qtpg`), `web_service`, branch `main`, `autoDeploy: commit`, plano `free` (instância), região `oregon` | `list_services`/`get_service` (MCP Render) |
| Worker dedicado | Declarado em `render.yaml` (`type: worker`, `prospector-atlas-worker`) mas **não existe no Render de verdade** — só 4 serviços no workspace, nenhum é este worker | `list_services` retorna 4 serviços; nenhum com este nome/tipo (confirma achado já registrado na Fase Final 2 e no RUNBOOK) |
| Banco | Supabase, projeto `atlasgr-prospector-production` (`hzttamzvokacmcnrfkrm`), Postgres 17.6, `ACTIVE_HEALTHY`, região `sa-east-1` | `list_projects`/`get_project` (MCP Supabase) |
| Plano do banco | **`free`** (organização `MaarksN's Org`, `kslzukzodzexkqfsuszn`) | `get_organization` (MCP Supabase) — achado central da seção 2 |
| Vercel | `vercel.json` existe no repositório e há um App do Vercel instalado no GitHub gerando preview de cada PR (confirmado nesta sessão pelos comentários automáticos do bot em PRs) — mas **não é o caminho de produção**. `docs/deploy/producao.md` documenta a decisão explícita de não usar Vercel (cookies cross-domain quebrariam o Better Auth). `vercel.json` é manifesto órfão/histórico: gera preview visual, não serve produção. Registrado para não confundir um futuro incidente ("por que o Vercel mostra uma versão diferente?" — resposta: é só preview de PR, nunca é onde o tráfego real está). | `docs/deploy/producao.md`, comentários do Vercel bot no PR #144 |
| Migrations | Prisma `migrate deploy` roda a cada boot via `startCommand`; `_prisma_migrations` real da produção consultado via SQL direto (não confiando no `list_migrations` do MCP Supabase, que é o ledger do Supabase CLI — não usado neste projeto, que só usa Prisma) — última migration aplicada `20260817134959_onda11_db_cleanup`, `finished_at` batendo com o commit mais recente do repositório. **Produção está em dia com o schema do código.** | `SELECT ... FROM _prisma_migrations` via MCP Supabase, comparado a `prisma/migrations/` do repo |
| Segurança do banco | `get_advisors` (security): só 2 achados de severidade baixa — `_prisma_migrations` com RLS habilitado sem policy (tabela de sistema, não tenant, não é risco real) e extensão `vector` instalada no schema `public` (higiene, não vulnerabilidade). Nenhum HIGH/CRITICAL. | `get_advisors` (MCP Supabase) |

## 2. Backup e Restore — P0 encontrado

### 2.1 Backup de produção: **não existe hoje**

- Plano Supabase da organização de produção é **`free`**. O plano gratuito da Supabase não inclui
  backup automático nem Point-in-Time Recovery (esses recursos só existem em planos pagos) —
  confirmado pela combinação de `get_organization` (plano `free`) e ausência de qualquer mecanismo
  de backup gerenciado configurável nas ferramentas disponíveis para este projeto.
- `scripts/backup.sh` (o único mecanismo de backup deste repositório) é um script manual local:
  usa `POSTGRES_PORT=5434`/variáveis de docker-compose por padrão, nunca foi apontado para a
  `DATABASE_URL` real de produção, e não há absolutamente nenhuma automação que o dispare — nenhum
  workflow do GitHub Actions com `schedule:` faz backup (os dois únicos `schedule:` existentes são
  `market-intelligence-cnpj.yml`, mensal, e `security-trivy.yml`, semanal — nenhum dos dois é
  backup), e nenhum serviço `type: cron_job` existe no workspace Render (`list_services` confirma
  os 4 serviços existentes, nenhum é cron job).
- **Consequência real**: se o banco de produção (`hzttamzvokacmcnrfkrm`) for perdido ou corrompido
  agora, **não existe nenhum ponto de restauração conhecido**. `docs/SRE.md` declara "RPO < 24h"
  na seção 4 — essa meta é aspiracional, não implementada; nada no ambiente real a sustenta hoje.

**Isto é um P0 de SRE**, não um débito cosmético — é exatamente o cenário que a missão desta fase
existe para impedir ("provar que a plataforma... pode ser operada com segurança").

### 2.2 Mecanismo de backup/restore — testado de verdade, em ambiente isolado (não em produção)

Não executei backup/restore contra o banco de produção real (fora de escopo/perigoso sem
autorização explícita — a missão pede "RESTORE real em **ambiente isolado**", não em produção).
Provisionei Postgres 16 nativo neste sandbox (mesmo procedimento das Fases 0/1/2), populei com o
schema completo (46 migrations aplicadas) e dados reais de teste (42 `Organization`, 43 `Lead`,
58 tabelas), e executei o ciclo completo:

```
1. bash scripts/backup.sh          → backups/prospectordb_backup_20260817_174213.sql (425KB, 5296 linhas)
2. createdb prospectordb_restore_drill (banco novo, vazio, 0 tabelas)
3. bash scripts/restore.sh <dump>  → "Restore completed successfully."
4. Validação pós-restore:
   - 58 tabelas restauradas (igual à origem)
   - Organization: 42 = 42 (origem = destino)
   - Lead: 43 = 43 (origem = destino)
   - _prisma_migrations: 52 linhas com finished_at preenchido (histórico de migration íntegro)
   - RLS ativo em 57/58 tabelas (a exceção, _prisma_migrations, é tabela de sistema — correto não ter RLS)
```

**Teste obrigatório "RLS continua protegendo tenants após restore" — executado com dados reais,
não inspeção de código:**

```
Como prospector_app (papel de aplicação, NOSUPERUSER), sem app.current_tenant_id setado:
  SELECT count(*) FROM "Lead" → 0                          (fail-closed por padrão — correto)

Com app.current_tenant_id = <org A>:
  SELECT organizationId, count(*) FROM "Lead" GROUP BY 1 → só org A, count 1

Com app.current_tenant_id = <org B>:
  SELECT organizationId, count(*) FROM "Lead" GROUP BY 1 → só org B, count 1

Com app.current_tenant_id = <org A>, tentando ler explicitamente a org B:
  SELECT count(*) FROM "Lead" WHERE organizationId = '<org B>' → 0    (RLS bloqueia mesmo com WHERE explícito)
```

RLS sobrevive ao ciclo backup→restore sem intervenção adicional (as `CREATE POLICY` fazem parte do
dump, `scripts/restore.sh` as reaplica como parte do schema). **Mecanismo comprovado.**

### 2.3 Achado corrigido nesta rodada: `.gitignore` não cobria o formato real do backup

`backups/*.dump` está no `.gitignore` desde a correção de segurança documentada em
`backups/AGENTS.md`, mas `scripts/backup.sh` (o único script de backup deste repositório) gera
`.sql`, não `.dump` — **esse padrão nunca esteve coberto**. Confirmado ao rodar o script real nesta
rodada: `git status` mostrou o arquivo de backup como untracked-mas-não-ignorado. Corrigido em
`.gitignore` (`backups/*.sql`, `backups/*.backup`, `backups/*.tar`, `backups/*.tar.gz`,
`backups/*.gz`, além do `.dump` já existente) — sem isso, rodar `scripts/backup.sh` localmente e
depois `git add -A` reintroduziria exatamente o tipo de incidente que a Fase Final 0 já teve que
remediar (dump de banco com PII versionado).

### 2.4 RTO/RPO — declarado, não validado em escala de produção

- **RPO hoje**: efetivamente **sem limite superior conhecido** (nenhum backup agendado — ver 2.1).
  `docs/SRE.md` cita "< 24h no pior caso"; essa meta não corresponde ao estado real.
- **RTO**: o ciclo backup→restore em ambiente isolado (seção 2.2) completou em segundos, mas o
  dataset de teste é pequeno (58 tabelas, dezenas de linhas) — não é uma medição válida do RTO do
  banco de produção real (que tem volume desconhecido para mim, sem acesso a métricas de tamanho
  via as ferramentas disponíveis). **Mecanismo provado; tempo real de restauração em escala de
  produção não medido nesta rodada** — não declaro um RTO numérico para produção sem essa evidência.

## 3. Health, readiness e alertas

### 3.1 Health/readiness — honestos, confirmados com falha real induzida

`/health/live` (liveness) e `/health/ready` (readiness) em `server.ts` e `worker.ts` checam
dependência real (`SELECT 1` no Postgres via Prisma, `connection.ping()` no Redis quando filas
ativas) — não só "processo respondeu". Simulação de falha real, com o servidor Express rodando de
verdade contra Postgres/Redis nativos deste sandbox:

```
17:45:10  Postgres UP    → GET /health/ready → 200 {"status":"ok"}
17:45:17  Postgres parado (service postgresql stop)
17:45:18  GET /health/ready → 503 {"status":"error","message":"Database or Redis unavailable"}
          GET /health/live  → 200 {"status":"ok"}   (correto: processo vivo, só a dependência caiu)
17:45:27  Postgres religado (service postgresql start)
17:45:30  GET /health/ready → 200 {"status":"ok"}   (recuperação automática)
          Mesmo PID do processo Node (11349, sem crash/restart) confirmado via `ps`
```

**Teste obrigatório "health muda corretamente quando dependência crítica cai" — PASS, com
evidência de detecção (<1s) e recuperação automática (sem reinício de processo) medidas ao vivo.**

### 3.2 Alertas — regras reais, mas sem canal de notificação (achado já conhecido, reconfirmado)

`infrastructure/observability/alert.rules.yml` (Prometheus) já documenta, de forma honesta, quais
regras têm métrica real por trás (`InstanceDown`, `HighEventLoopLag`, `HighHeapUsageRatio`,
`QueueBacklogHigh`/`QueueStalled`, `BitrixSyncFailuresHigh`, `AIBudgetOverrun` condicionado a env)
e quais são aspiracionais (`MigrationJobFailed`, exclusivo do caminho k8s não usado; `HighErrorRate5xx`,
métrica HTTP do OTel ainda não instrumentada). **Não existe Alertmanager configurado** — nenhum
`alertmanager.yml`, nenhum receptor (Slack/e-mail/PagerDuty). Uma regra do Prometheus disparando
hoje fica visível em `/alerts`, mas **não notifica ninguém**.

**"Testar pelo menos um alerta crítico ponta a ponta" (objetivo 8): não pude testar o disparo de
uma regra Prometheus real nem sua notificação, porque (a) Docker está indisponível neste sandbox
(o stack local de Prometheus/Grafana só sobe via `docker compose`) e (b) mesmo que o Prometheus
disparasse, não há Alertmanager/receptor para notificar — testar a regra sozinha provaria só a
sintaxe, não uma cadeia ponta a ponta que efetivamente avisa alguém.** Em vez de simular algo que
não seria uma prova real, testei o mecanismo de alerta que **de fato está operante em produção
hoje**: o `healthCheckPath` do Render, que decide se uma instância recebe tráfego, é orientado por
`/health/ready` — a mesma simulação da seção 3.1 é, na prática, o teste ponta a ponta do único
alerta crítico que realmente age sobre o Render hoje (readiness cai → Render para de rotear tráfego
para a instância; ver `RUNBOOK.md` seção 0.2). **Isto não substitui o objetivo 8 como escrito
(Prometheus/Alertmanager) — é um achado de que o objetivo, como formulado, não é testável de ponta
a ponta neste ambiente sem Alertmanager configurado, e essa lacuna já está documentada por uma onda
anterior.** Fica como pendência explícita, não como sucesso disfarçado.

### 3.3 SLI/SLO

`docs/SRE.md` já define SLIs/SLOs (disponibilidade 99.9%/30 dias, latência P95 <500ms para rotas
transacionais, profundidade de fila) e uma seção de alertas recomendados. Revisado nesta rodada:
consistente com o que `alert.rules.yml` implementa, sem contradição. **Objetivo 9 satisfeito** —
documento existe e é coerente com a implementação real (não é uma meta solta sem lastro no código).

## 4. Rollback

`RUNBOOK.md` seção 6 já documenta o mecanismo real, confirmado contra a API do Render nesta e em
rodadas anteriores: histórico de deploys preservado (deploys antigos passam de `live` para
`deactivated`, nunca são apagados — confirmei isso nesta rodada consultando os últimos 15 deploys
reais do serviço, todos com `status`/commit exato preservados), rollback é uma ação manual no
dashboard ("Rollback to this deploy"), sem mecanismo scriptável via API/MCP para reverter a um
commit específico (`trigger_deploy` só redeploya o HEAD da branch).

**Não executei um rollback real contra produção nesta rodada** — é uma ação com efeito direto em
produção (redeploy real do serviço), fora do que uma tarefa de auditoria/SRE deveria disparar sem
pedido explícito do usuário. O mecanismo está comprovado pela estrutura de dados (histórico
íntegro, com status correto), mas o clique real no botão do dashboard não foi executado. Registrado
como decisão de segurança, não como lacuna não percebida — mesma decisão que a onda anterior já
tinha tomado, reconfirmada aqui.

**Lacuna organizacional, não técnica, que já estava documentada e continua sem dono**: quem tem
autorização/acesso para acionar rollback em produção e por qual canal — não decidido nesta rodada
(decisão do usuário/gestão, não de agente).

## 5. Logs e correlação

Testado com requisição real contra o servidor rodando: `x-request-id` gerado automaticamente
(UUID) quando ausente; `x-correlation-id` propagado quando enviado pelo cliente
(`teste-fase3-abc123` → apareceu idêntico no log estruturado). Log de uma tentativa de login com
senha em texto puro no corpo da requisição não expôs a senha em nenhuma linha do log (Better Auth
não ecoa credenciais). **Objetivo 13 confirmado com evidência real, não só leitura de código.**

## 6. Worker/fila — recuperação de falha

Não consegui subir `worker.ts` de forma estável nesta rodada dentro do ambiente (processo em
segundo plano não permaneceu ativo de forma consistente neste sandbox após múltiplas tentativas —
limitação de ambiente, não do código). Em vez de forçar uma prova frágil, revisei
`src/lib/queue/redis.ts`: as 3 conexões Redis usadas pela aplicação (`connection` para BullMQ,
`rateLimiterConnection`, `cacheConnection`) têm `retryStrategy` com backoff (até 5s) e
reconexão automática via `ioredis` — não é reconexão manual nem ausente. Combinado com a evidência
**já obtida ao vivo na Fase Final 2** (SIGTERM durante job não perde trabalho; dois processos não
duplicam o cron; retry com backoff exponencial em job real) — não repeti o que já está provado com
evidência viva recente, mas também não reclamo uma prova nova que não consegui produzir nesta
rodada. **Registrado como parcialmente coberto**: reconexão de Redis é garantida por design
(código revisado, não testada ao vivo nesta rodada); demais aspectos de recuperação de fila/worker
têm evidência viva da Fase Final 2.

## 7. Gate do Agente 19 — nesta rodada

Nenhuma mudança de lógica de produto foi feita nesta fase (só `.gitignore`, mais amplo do que
código de aplicação). Rodar o gate completo (`tsc`/`lint`/`test:unit`/`test:integration`/`test:e2e`/
`build`) de novo sobre um `.gitignore` isolado seria repetição sem valor incremental — o gate já foi
executado de verdade, sobre o mesmo SHA base, no fechamento da Fase Final 1 (PR #144, CI real:
`build-and-test` PASS, `secret-scan` PASS, `e2e-tests` PASS). Confirmo que o `.gitignore` sozinho
não pode quebrar nenhum desses (não é código executável) — verificação proporcional ao risco real da
mudança, não uma omissão do gate.

```text
AGENTE 19 — VERIFICAÇÃO CONTÍNUA (Fase Final 3)
ESTADO VERIFICADO: a0975e45 + 1 alteração (.gitignore)
GATE DE CÓDIGO: herdado do PR #144 (mesmo SHA base) — PASS (ver .agents/runs/final-fase-1.md §10)
BACKUP → RESTORE (ambiente isolado): PASS (dados 42/42, 43/43; migrations 52/52; RLS confirmado)
RLS PÓS-RESTORE: PASS (isolamento cross-tenant confirmado com dados reais, fail-closed por padrão)
HEALTH/READINESS SOB FALHA REAL: PASS (detecção <1s, recuperação automática sem restart)
LOGS/CORRELATION ID: PASS (testado com requisição real)
ALERTA CRÍTICO PONTA A PONTA (Prometheus/Alertmanager clássico): NÃO TESTÁVEL neste ambiente
  (Docker indisponível + Alertmanager nunca configurado — lacuna pré-existente, não desta rodada)
ROLLBACK: mecanismo comprovado estruturalmente; execução real não realizada (decisão de segurança)
BACKUP DE PRODUÇÃO REAL: **AUSENTE — P0**
VEREDITO: BLOCKED (pelo P0 de backup de produção)
```

## 8. P0/P1 — estado final desta fase

**P0:**
1. **Banco de produção (Supabase, plano free) não tem nenhum backup automático, e o repositório não
   tem nenhuma automação apontando `scripts/backup.sh` para produção.** RPO efetivo: sem limite
   conhecido. Este é o bloqueador real da Fase Final 3.

**P1:**
- Sem Alertmanager configurado — alertas do Prometheus não notificam ninguém (débito já
  documentado, não piorado nesta rodada).
- Métrica HTTP 5xx (`HighErrorRate5xx`) ainda não instrumentada (débito do Agente 01, já
  documentado).
- `AI_MONTHLY_BUDGET_USD` não confirmável como configurada em produção via API — `AIBudgetOverrun`
  pode estar `unknown` permanentemente (débito já documentado, precisa confirmação humana no
  dashboard).
- Quem aciona rollback e por qual canal — decisão organizacional pendente, não técnica.

## 9. Decisão da Fase Final 3

**REPROVADA.**

O trabalho de observabilidade/runbook já existente (ondas anteriores) é sólido e foi reconfirmado
com evidência viva nesta rodada: health/readiness reagem corretamente e se recuperam sozinhos sob
falha real induzida, RLS sobrevive a um ciclo real de backup→restore em ambiente isolado, logs têm
correlação real, SLI/SLO estão documentados e coerentes com o código, e o mecanismo de rollback do
Render está corretamente entendido e documentado.

**O gate de saída desta fase é binário e um item central falha: não existe backup real do banco de
produção hoje.** Isso não é um débito cosmético — é exatamente o cenário "a plataforma não apenas
sobe, mas se recupera de falha" que a missão desta fase existe para provar, e hoje ela não se
recupera de uma perda de banco porque não há de onde recuperar.

**Bloqueador exato para reabrir esta fase — decisão do dono do repositório, não técnica:**

Duas rotas possíveis (custo/arquitetura, não decido isso sozinho):
1. **Upgrade do plano Supabase** (`free` → `Pro` ou superior) — ativa backup diário gerenciado e,
   dependendo do tier, PITR — a rota mais simples, sem escrever nenhuma automação nova.
2. **Backup automatizado próprio**: um workflow agendado (GitHub Actions `schedule:`, ou um cron
   job do Render se o plano permitir) rodando `pg_dump` contra a `DATABASE_URL` real de produção e
   enviando o resultado criptografado para um storage externo (S3/R2/Supabase Storage em bucket
   separado) com retenção definida — exige o dono do repositório decidir onde armazenar, prover a
   credencial de acesso a produção como secret do GitHub (nunca em código), e aprovar o custo de
   storage. Não implementado nesta rodada por ser exatamente esse tipo de decisão de custo/arquitetura
   externa que `/AGENTS.md` reserva para aprovação humana — mas o mecanismo (script, formato,
   teste de restore) já está prescrito e testado neste relatório, pronto para ser ligado assim que
   a decisão de armazenamento for tomada.

Depois de uma das duas rotas ser executada: confirmar um backup real de produção existe e testar
esse backup específico com um restore real (não só o ambiente isolado desta rodada), então reabrir
esta fase para `APROVADA`.
