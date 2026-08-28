# Runbook — Rollback de migração Prisma/Postgres

## Status: 📄 Runbook novo (CPI — item "Migrations sem plano de rollback", Agente 01)

Substitui o checklist textual solto que existia em `prisma/AGENTS.md` (linha "rollback/
compatibilidade foi considerada.") por um processo real e específico deste repositório.
`prisma/AGENTS.md` referencia este arquivo — ver seção "Definição de pronto local" lá.

## Por que isto não tenta ser "68 migrations com down.sql"

Em 26/08/2026 este repositório tem 68 migrations em `prisma/migrations/**`, nenhuma com um
`down.sql` companion nem testada em reversão. Reescrever 68 migrations agora não é viável nem
seguro (cada uma exigiria entender o estado de dados no momento em que rodou, não hoje) — e não é
isso que resolve o problema real. O que resolve é: (1) todo agente saber decidir, na hora, se a
migration que ele está prestes a reverter é segura de reverter, e (2) ter um processo real para os
dois casos que sempre existem — aditiva (reversível) e destrutiva (não reversível sem backup).
Migrations **futuras** de alto risco (destrutivas) devem, a partir de agora, ganhar um bloco
`-- ROLLBACK:` comentado no próprio `migration.sql` (ver seção 4) — isso vai fechando a lacuna aos
poucos, migration por migration, em vez de uma reescrita retroativa de risco desconhecido.

## Antes de tudo: qual `DATABASE_URL` você está mexendo?

Confirme o ambiente antes do primeiro comando. Nunca rode os comandos deste runbook contra
produção usando a `DATABASE_URL` de outro `.env` copiada às pressas — confirme com
`echo $DATABASE_URL | sed -E 's/:[^:@]+@/:***@/'` (mascara a senha) qual host aparece. Produção é
Supabase (Session Pooler); desenvolvimento/CI é o Postgres local (`docker-compose`) ou o banco de
`.env.test`. Ver `docs/SRE.md` §4 para o pipeline de backup real (Cloudflare R2, `pg_dump` diário,
retenção 30 dias) e `scripts/backup.sh`/`scripts/restore.sh`.

## Passo 0 — Classifique a migration antes de decidir qualquer coisa

Abra o `migration.sql` da migration em questão e classifique cada statement:

| Classe | Exemplos reais já existentes neste repo | Reversível sem backup? |
|---|---|---|
| **Aditiva** | `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN` (com `DEFAULT` ou nullable), `CREATE INDEX`, `ALTER TYPE ... ADD VALUE` (ex.: `20260826140000_expand_intelligence_evidence_type`, `20260802140000_automation_action_ligar_sdr_voz`) | **Sim** — reversão manual simples (Passo 1). |
| **Destrutiva** | `DROP COLUMN`, `DROP TABLE`, `RENAME COLUMN`/`RENAME TO`, `ALTER COLUMN ... TYPE` com conversão que perde precisão, qualquer `DELETE`/`UPDATE` em massa embutido na migration (ex.: `20260810130000_remove_knowledge_document`, `20260805220000_two_funnels_and_bitrix_fields`, `20260717183411_sprint3_5_enums_and_cleanup`) | **Não** — dado já foi perdido no momento em que a migration rodou. Vá para o Passo 2. |
| **Ambígua** | `ADD COLUMN ... NOT NULL` sem `DEFAULT` (só roda se a tabela estava vazia ou se o Prisma gerou um backfill antes — leia o SQL completo, não só o nome do arquivo); constraint nova que pode rejeitar linhas existentes | Trate como destrutiva até confirmar o contrário lendo o SQL inteiro. |

Regra de decisão: **se qualquer statement do arquivo remove, renomeia ou converte dado existente,
a migration inteira é destrutiva** — mesmo que 9 de 10 statements sejam aditivos. Reversão parcial
statement-a-statement não é suportada por este runbook (risco de deixar o schema num estado que
nenhuma migration registrada descreve).

## Passo 1 — Reverter uma migration aditiva simples

Aplicável só à classe "Aditiva" do Passo 0. Estes exemplos assumem que a migration já rodou em
produção (`prisma migrate deploy`) e nenhuma migration **posterior** depende do que está sendo
revertido — confira isso primeiro (grep pelo nome da coluna/tipo/tabela nas migrations com
timestamp maior; se alguma migration seguinte já lê/escreve o que você quer reverter, reverta
aquela primeiro, uma de cada vez, da mais nova para a mais antiga).

1. **Escreva o SQL inverso manualmente** (down manual) e rode-o diretamente contra o banco via
   `psql`/`prisma db execute` — nunca crie uma migration nova só para desfazer, isso deixaria duas
   entradas conflitantes em `_prisma_migrations`. Exemplos de inverso por tipo de statement:
   - `ADD COLUMN "x" TYPE` → `ALTER TABLE "Tabela" DROP COLUMN "x";`
   - `CREATE INDEX "idx_x"` → `DROP INDEX "idx_x";`
   - `ALTER TYPE "Enum" ADD VALUE 'X'` → **não tem inverso direto** (Postgres não suporta `DROP
     VALUE` de enum). Se o valor precisa mesmo sair, o caminho é criar um enum novo sem o valor,
     migrar a coluna para o tipo novo, e dropar o antigo — trate isso como migration destrutiva
     nova (Passo 4), não como rollback do Passo 1. Na prática, um valor de enum a mais e não usado
     por nenhuma linha é inofensivo o suficiente para não valer esse custo — considere deixar como
     está em vez de reverter.
2. **Marque a migration como revertida no Prisma**, para que `prisma migrate deploy`/`dev` parem
   de considerá-la aplicada e o histórico continue consistente:
   ```bash
   npx prisma migrate resolve --rolled-back <nome_da_pasta_da_migration>
   ```
   Isso só atualiza a tabela `_prisma_migrations` (marca `rolled_back_at`) — **não** desfaz o SQL
   sozinho. O down manual do passo 1 é sempre executado antes, separadamente.
3. Rode `npx prisma migrate status` e confirme que o schema esperado bate com o real (`npx prisma
   validate` valida só a sintaxe do `.prisma`, não o banco — para comparar contra o banco real use
   `migrate status` e, se disponível, `migrate diff` contra o banco).
4. Se a migration revertida tinha alterado `schema.prisma` (é o caso normal), **reverta também o
   `schema.prisma`** no mesmo commit do down manual, e rode `npx prisma generate` — schema e banco
   nunca podem divergir por mais que o tempo de um commit.

## Passo 2 — A migration é destrutiva: não há solução mágica

Se o Passo 0 classificou a migration como destrutiva, o dado já foi alterado/perdido no banco no
momento em que ela rodou. Não existe SQL que reconstrua uma coluna dropada ou um valor sobrescrito
sem uma cópia anterior do dado. As únicas opções reais são, em ordem de preferência:

1. **Restore seletivo a partir do backup mais recente anterior ao incidente** (preferido — não
   perde as escritas legítimas que aconteceram depois, só repara o que a migration destruiu):
   - Backup real: `pg_dump` diário via `.github/workflows/backup-production.yml`, criptografado
     (GPG/AES256), retido 30 dias em Cloudflare R2 (ver `docs/SRE.md` §4). **Confirme antes de
     depender disso**: em 26/08/2026 o workflow existe e foi validado mecanicamente, mas a
     execução real contra produção depende de secrets do GitHub ainda não configurados
     (`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET`,
     `BACKUP_DATABASE_URL`/`BACKUP_ENCRYPTION_PASSPHRASE`). Se esses secrets ainda não estiverem
     configurados quando você precisar deste passo, **não existe backup automático de produção
     ainda** — pule para a opção 3.
   - Use `scripts/restore.sh` para restaurar o dump mais recente **num banco isolado** (nunca
     restaure por cima de produção direto) — depois exporte/copie só as linhas/colunas afetadas de
     volta para produção com `INSERT ... ON CONFLICT` ou `UPDATE` cirúrgico, escopado por
     `organizationId` e pelo intervalo de tempo do incidente. Restore completo por cima de produção
     descartaria toda escrita legítima feita entre o backup e agora — só aceitável se o RPO de
     "até 24h de dado perdido" for uma perda aceitável para o incidente em questão (decisão de
     negócio, não técnica — escale antes de decidir sozinho).
   - Depois do restore cirúrgico, rode a suite de `tests/integration/tenant-isolation-*.test.ts` e
     confirme manualmente uma amostra de registros restaurados antes de considerar concluído.
2. **Replay de eventos/audit trail**, quando disponível: `AuditLog` guarda `beforeState`/
   `afterState` de toda operação em model auditável (`Company`, `Contact`, `Lead`, `Activity`,
   `CrmPipeline`, `CrmProduct`, `CrmDealItem`, `CrmCommercialDocument` — ver
   `src/lib/prisma.ts`, seção "Audit Log"). Para uma migration destrutiva recente, `AuditLog` pode
   reconstruir o valor anterior de uma linha específica sem precisar de um restore completo — mas
   só cobre esses models, só cobre `create`/`update`/`delete` via Prisma (não SQL cru rodado pela
   própria migration), e não é um mecanismo de rollback formal — trate como uma fonte de dados para
   reconstrução manual, não como um "undo" automático.
3. **Sem backup disponível e sem cobertura de `AuditLog`**: o dado destruído é irrecuperável.
   Documente o incidente (o que foi perdido, desde quando, para quantos registros/tenants),
   comunique ao dono do repositório e ao(s) tenant(s) afetado(s) conforme obrigação de
   transparência (ver `docs/lgpd-base-legal.md`), e trate como incidente de segurança/dados — ver
   `docs/security/runbooks/INCIDENT_RESPONSE.md`.

## Passo 3 — Depois de qualquer rollback (aditivo ou destrutivo)

1. Rode o gate mínimo do domínio (`prisma/AGENTS.md`): `npx prisma validate`, `npx prisma
   generate`, `npx tsc --noEmit`, `npm run lint`, testes relevantes, `npm run build`.
2. Registre o rollback como um handoff em `.agents/handoffs/onda-<n>/` (ver `AGENTS.md` raiz,
   "Protocolo de handoff") se outro agente/onda depende do estado revertido.
3. Nunca edite o arquivo `migration.sql` original da migration revertida — ele é histórico
   (`_prisma_migrations` guarda o checksum de cada arquivo; editar um já aplicado quebra a
   verificação de integridade do Prisma em qualquer ambiente que ainda não rodou aquela migration).
   O down manual é sempre um comando separado, nunca uma edição retroativa.

## Passo 4 — Migrations novas de alto risco: comece a fechar a lacuna prospectivamente

A partir desta mudança, toda migration nova classificada como destrutiva no Passo 0 (por quem a
escreve, dono único de `prisma/migrations/**`) deve incluir um bloco comentado no próprio
`migration.sql`:

```sql
-- ROLLBACK: <descrição curta de como reverter, ou "não reversível sem restore de backup — ver
-- docs/security/runbooks/MIGRATION_ROLLBACK.md Passo 2" se não houver down manual possível>
```

Isso não é retroativo (as 68 migrations existentes não precisam ser editadas agora — ver "Não
pode... editar migração já aplicada" em `prisma/AGENTS.md`), mas garante que toda migration
destrutiva escrita **a partir de agora** já nasça com a decisão do Passo 0 registrada por quem tem
mais contexto sobre ela (quem a escreveu), em vez de deixar isso para reconstruir depois no meio de
um incidente real.
