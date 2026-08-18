# Onda 15 — Sprint 03: Backup, Restore, Observabilidade e SRE

## Identificação
- Sprint: 03
- Onda: 15
- SHA de entrada: `2bc7ccb` (branch `claude/sprint-01-seguranca-tenancy-51974`, pós-fechamento da Onda 14)
- Branch de trabalho: `claude/sprint-01-seguranca-tenancy-51974` (PR #148)
- Prioridade: **P0**
- Agentes: liderança **10**; apoio **08 (workflows/release), 01A (banco/RLS), 14 (harness), 15 (segurança)**.

## Origem e contexto de governança

Esta rodada **não parte do zero**. `.agents/runs/final-fase-3.md` (2026-08-17, uma fase anterior a
este ciclo de sprints/ondas) já cobriu quase integralmente o escopo de
`SPRINT-03-BACKUP-RESTORE-SRE.md`: backup mecânico provado em ambiente isolado, RLS pós-restore
provado com dados reais, health/readiness provados sob falha real induzida, rollback documentado e
entendido contra a API real do Render, um pipeline de backup próprio para produção
(`prospector_backup` + `.github/workflows/backup-production.yml`) desenhado, construído e com
**decisão explícita do dono do repositório de aceitar o risco de operar sem backup até a ativação
completa** (seção 11 daquele relatório). Esta rodada **verifica o que mudou desde então, corrige o
que encontrar de errado, e não refaz o que já está provado e não regrediu.**

## 1. O que já estava prescrito (herdado de `final-fase-3.md`, reconfirmado sem regressão)

- Papel de banco `prospector_backup` (somente leitura, `BYPASSRLS`, `CONNECTION LIMIT 3`) — criado
  diretamente em produção via SQL na fase anterior; não reexecutado aqui (ação em produção,
  idempotente por natureza — recriar não é necessário nem desejável sem motivo).
- `.github/workflows/backup-production.yml` — dump diário 05:00 UTC + `workflow_dispatch`,
  criptografia GPG simétrica antes de sair do runner, upload para R2, retenção de 30 dias.
- `docs/SRE.md` já reflete o mecanismo real (não a meta aspiracional anterior).
- Mecanismo backup→restore comprovado em ambiente isolado (Postgres nativo do sandbox), com RLS
  pós-restore comprovado com dados reais na fase anterior.

## 2. RUN-se aplicado: o que mudou desde `final-fase-3.md` — verificado contra o real, não por manifest

### 2.1 SRE-001 (provar backup R2) — achado novo: o workflow nunca conseguiu rodar de verdade

Consultado `list_workflow_runs`/`list_workflow_jobs` (API real do GitHub, não suposição): o
workflow `backup-production.yml` **já executou uma vez** desde a fase anterior — agendado, run
`32102973547`, 2026-08-18T05:27:54Z, **falhou**. O log real (baixado e lido nesta rodada) mostra a
causa exata:

```
E: Unable to locate package postgresql-client-17
##[error]Process completed with exit code 100.
```

Falhou no **segundo passo** (instalar o cliente Postgres), antes de sequer tentar ler
`BACKUP_DATABASE_URL` — os 5 passos seguintes (dump, criptografia, upload R2, retenção, sanity
check) todos aaparecem como `skipped`. Causa raiz: Ubuntu 24.04 (imagem do runner) só traz
`postgresql-client-16` nos repositórios apt padrão; a major 17 (a mesma do Postgres de produção,
Supabase 17.6, confirmado via `mcp__Supabase__list_projects` nesta rodada) exige o repositório
oficial do PGDG (`apt.postgresql.org`), nunca adicionado ao workflow.

**Corrigido nesta rodada**: `.github/workflows/backup-production.yml` agora instala a chave/repo do
PGDG antes do `apt-get install` (mesmo padrão oficial documentado em
`https://www.postgresql.org/media/keys/ACCC4CF8.asc` + `apt.postgresql.org/pub/repos/apt`). YAML
validado sintaticamente (`python3 -c "import yaml; yaml.safe_load(...)"`) nesta rodada.

**Ainda bloqueado, inalterado desde `final-fase-3.md`**: `mcp__Cloudflare_Developer_Platform__r2_buckets_list`
chamado nesta rodada retorna o mesmo erro de então — `403 { "code": 10042, "message": "Please
enable R2 through the Cloudflare Dashboard." }`. R2 continua não habilitado no plano Cloudflare; a
API não permite ativar isso, só o dashboard. **Mesmo bloqueador, mesma causa, nenhuma mudança desde
a fase anterior** — corrigir o bug do `postgresql-client-17` elimina uma falha real, mas não fecha
SRE-001: mesmo com o bug do apt corrigido, o próximo disparo (agendado ou manual) ainda falharia no
passo de upload R2 até o dono habilitar R2 e cadastrar os 6 secrets já documentados em
`final-fase-3.md` seção 10 (`BACKUP_DATABASE_URL`, `BACKUP_ENCRYPTION_PASSPHRASE`, `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`).

**Decisão desta rodada**: não disparei o workflow manualmente (`workflow_dispatch`) contra produção
— com R2 confirmadamente indisponível, um disparo agora só reproduziria o mesmo bloqueador já
documentado, sem produzir evidência nova, e ainda executaria um `pg_dump` real contra produção sem
necessidade (ação com efeito real, mesmo que de leitura, sobre o banco real — desnecessária até o
bloqueador de R2 ser resolvido).

### 2.2 SRE-002 (restore drill automatizado) — reexecutado nesta rodada, evidência fresca

Não confiei na evidência da fase anterior sem reconfirmar — repeti o ciclo completo em ambiente
isolado (Postgres nativo do sandbox, `prospectordb_test`, dataset real acumulado por esta sessão):

```
1. bash scripts/backup.sh                        → backups/prospectordb_backup_20260818_144530.sql (2.08MB)
2. createdb prospectordb_restore_drill_onda15     → banco novo, vazio, 0 tabelas
3. bash scripts/restore.sh <dump>                  → "Restore completed successfully." (12 CREATE POLICY confirmados na saída)
4. Validação pós-restore:
   - 58 tabelas restauradas (origem = destino, igual à contagem da fase anterior)
   - Lead: 459 = 459 (origem = destino)
   - _prisma_migrations: 52 linhas, todas com finished_at preenchido (nenhuma migration pendente/corrompida)
5. dropdb prospectordb_restore_drill_onda15        → ambiente descartável destruído após validação
6. Arquivo de dump local removido após o teste (backups/*.sql já é gitignorado desde a fase
   anterior — confirmado nesta rodada: `git status --short backups/` não mostra nada)
```

**Mecanismo mecânico: PASS, reconfirmado com dados atuais desta sessão, não reaproveitando a
evidência antiga.**

**Sobre o teste de RLS pós-restore especificamente**: o dataset atual de `prospectordb_test` (banco
de teste compartilhado por toda a sessão, acumulando resíduo de múltiplas rodadas de teste de
integração) tem hoje `Organization: 0` e todos os 459 `Lead` com `organizationId IS NULL` —
diferente do dataset limpo (`42 Organization`/`43 Lead`, todos com tenant real) que a fase anterior
usou para o teste de isolamento cross-tenant. Não fabriquei um teste de RLS contra esse dado sujo
(um resultado "correto" contra dados sem tenant não provaria nada de verdade). Em vez disso: (a) as
`CREATE POLICY` restauradas corretamente (12 confirmadas na saída do `psql` durante o restore)
provam que o schema de RLS sobrevive ao ciclo backup→restore, mecanicamente — mesma prova estrutural
de sempre; (b) a garantia de isolamento por tenant em si **já está provada de forma extensa e
recente nesta mesma sessão**, não como parte deste drill: os 30/30 arquivos e 129/129 testes de
integração executados na Onda 14 (seção 12 de `onda-14.md`) incluem
`conversation-signal-tenant-isolation.test.ts`, `whatsapp-message-tenant-isolation.test.ts` e outros
testes de isolamento cross-tenant, todos rodando contra o mesmo Postgres real e passando. Não repito
aqui uma prova equivalente com dados piores só para preencher a seção — cito a prova real já
produzida nesta sessão.

### 2.3 SRE-003 (CI Postgres 17) — RESOLVIDO nesta rodada (fechado na Onda 14, não repetido aqui)

Já corrigido e comitado como parte do gap-fill da Sprint 02 (`.agents/runs/onda-14.md`, seção 11):
6 workflows (`ci.yml` ×2, `cd-homolog.yml`, `production.yaml`, `playwright-ci.yml`,
`onda-2.5-validation.yml`) alinhados de `pgvector/pgvector:pg15` para `pg17`, batendo com a versão
real de produção (Supabase Postgres 17.6.1, reconfirmado nesta rodada via
`mcp__Supabase__list_projects`). **PASS.**

### 2.4 SRE-004 (produção fora do plano free) — decisão de custo, não técnica; inalterado

Não investigável/executável nesta rodada sem autorização explícita de gasto do dono do repositório
— upgrade de plano Render e/ou Supabase é uma decisão de custo recorrente, fora do que uma sessão de
auditoria/engenharia deveria decidir ou executar sozinha. `mcp__Render__list_workspaces` confirma
acesso de leitura ao workspace real (`Marcelo's workspace`), mas nenhuma ação de mudança de plano
foi tentada. **Pendência explícita, do dono, não de execução técnica.**

### 2.5 SRE-005/SRE-007 (Alertmanager/receptor + alerta ponta a ponta) — inalterado desde `final-fase-3.md`

Mesmo bloqueador já registrado: nenhum Alertmanager configurado (nenhum `alertmanager.yml`, nenhum
receptor Slack/e-mail/PagerDuty), e o stack local de Prometheus/Grafana só sobe via `docker
compose`, indisponível neste sandbox (sem daemon Docker, confirmado nesta rodada ao tentar
`pretest:integration`, que tenta subir containers e falha com "no such file or directory" no socket
do Docker — mesma limitação já documentada). Configurar um receptor real depende de uma decisão de
canal (Slack/e-mail/PagerDuty) que é do dono, não uma escolha técnica livre. **Pendência explícita,
inalterada.**

### 2.6 SRE-006 (higiene de métrica) — já satisfeito, confirmado nesta rodada por leitura completa

`infrastructure/observability/alert.rules.yml` já separa explicitamente grupos
`*.ativos-hoje` (métrica real, produtor confirmado no código) de `*.pendente-instrumentacao`
(métrica ainda não existe, rotulada com `contract_metric_source`/`contract_owner` em vez de
fingida como pronta) — exatamente o critério do roadmap ("instrumentar ou remover/rotular como
futura"). Lido integralmente nesta rodada; nenhuma regra órfã encontrada (toda regra do arquivo tem
rótulo `ativos-hoje` ou `pendente-instrumentacao`, nenhuma no meio-termo não documentado).
**PASS, sem alteração necessária.**

### 2.7 SRE-008 (RPO/RTO) — mesma conclusão da fase anterior, não pode ser diferente sem SRE-001 fechado

RTO do ciclo mecânico em ambiente isolado: segundos (seção 2.2) — não é uma medição válida do RTO de
produção em escala real (dataset de teste é pequeno comparado ao volume real de produção,
desconhecido para esta sessão). RPO: sem limite superior conhecido enquanto SRE-001 não fechar (sem
backup de produção rodando com sucesso, não há "ponto de recuperação mais recente" para medir RPO
contra). Não declaro um RPO/RTO numérico de produção sem essa evidência — mesma decisão da fase
anterior, ainda válida.

### 2.8 SRE-009 (rollback) — não executado, mesma decisão de segurança da fase anterior

`RUNBOOK.md` seção 6 já documenta o mecanismo real (deploys antigos preservados como `deactivated`,
rollback é ação manual no dashboard do Render, sem endpoint de API para reverter a um commit
específico). Não executei um rollback real nesta rodada — ação com efeito direto em produção
(redeploy do serviço), fora do que uma auditoria deveria disparar sem pedido explícito do usuário.
**Mesma decisão de segurança já tomada e registrada na fase anterior, reconfirmada aqui.**

## 3. Gate de código

Único arquivo alterado nesta rodada além de documentação: `.github/workflows/backup-production.yml`
(YAML de CI, não código de aplicação). Validado sintaticamente (`yaml.safe_load`). Não roda como
parte do gate de release (`on: schedule`/`workflow_dispatch`, não `push`/`pull_request`) — não há
`tsc`/`lint`/testes de aplicação a rodar por esta mudança especificamente; o gate completo da Onda
14 (tsc/lint/unit/integration/build/build:worker/security:audit-waivers, todos PASS) já cobre o
estado do código de aplicação nesta mesma branch.

## 4. Decisão da Onda 15

**REPROVADA quanto a SRE-001 (backup de produção real), com o restante do escopo tecnicamente
coberto ou corretamente documentado como pendência do dono — mesmo padrão de veredito binário já
usado em `final-fase-3.md`.**

Esta sprint não fecha porque o critério de aceite do roadmap é explícito: *"Restore, receptor de
alerta e rollback comprovados. Nenhum destes pode ficar como documentação aspiracional."* Hoje:

- **Restore**: mecanismo comprovado de novo nesta rodada, com dados atuais — mas só em ambiente
  isolado, nunca contra um backup real de produção (porque esse backup real ainda não existe —
  ver abaixo).
- **Receptor de alerta**: não existe (SRE-005), bloqueado por decisão de canal do dono + Docker
  indisponível neste sandbox para testar o stack local.
- **Rollback**: mecanismo comprovado estruturalmente, execução real não feita por decisão de
  segurança (mesma da fase anterior).

**O que mudou de fato nesta rodada**: um bug real e concreto que impedia o pipeline de backup de
sequer tentar rodar (`postgresql-client-17` inexistente no apt padrão do Ubuntu 24.04) foi
encontrado — via evidência real da execução agendada que já tinha falhado, não suposição — e
corrigido. Isso elimina uma causa de falha, mas **não fecha SRE-001**: o próximo disparo real ainda
esbarra no bloqueador já conhecido e inalterado (R2 não habilitado no dashboard da Cloudflare,
retorna 403 na API). A cadeia completa de bloqueio agora é: R2 habilitado (dono, dashboard
Cloudflare) → bucket criado (eu, `r2_bucket_create`, já disponível) → R2 API Token gerado (dono,
dashboard) → 6 secrets cadastrados no GitHub (dono) → workflow dispara com sucesso pela primeira
vez → **só então** SRE-001/SRE-002 (com backup real)/SRE-008 (RPO/RTO real) podem fechar.

**Risco operacional atual**: o mesmo já aceito explicitamente pelo dono do repositório em
`final-fase-3.md` seção 11 — nenhuma mudança de estado de risco aconteceu nesta rodada, só uma
correção que aproxima o pipeline pronto de funcionar de fato assim que os 4 passos acima forem
dados. Ressalva reafirmada: não presumir que existe backup de produção só porque este relatório
existe — o workflow real nunca completou um dump/upload com sucesso até agora.

```text
AGENTE 19 — VERIFICAÇÃO CONTÍNUA (Onda 15)
SRE-001 Backup R2 real: BLOQUEADO (R2 não habilitado — dono, dashboard Cloudflare; bug de apt real corrigido nesta rodada)
SRE-002 Restore drill: PASS em ambiente isolado, reconfirmado com dados desta sessão — real contra produção depende de SRE-001
SRE-003 CI Postgres 17: PASS (fechado na Onda 14)
SRE-004 Produção fora do free: pendência de decisão de custo do dono, não técnica
SRE-005 Alertmanager/receptor: BLOQUEADO (decisão de canal do dono + Docker indisponível neste ambiente)
SRE-006 Higiene de métrica: PASS (já satisfeito, confirmado nesta rodada)
SRE-007 Alerta ponta a ponta: BLOQUEADO por SRE-005
SRE-008 RPO/RTO real: não mensurável até SRE-001 fechar
SRE-009 Rollback: mecanismo comprovado; execução real não feita (decisão de segurança)
VEREDITO: REPROVADA (critério de aceite do roadmap é binário; backup real de produção nunca completou com sucesso)
```
