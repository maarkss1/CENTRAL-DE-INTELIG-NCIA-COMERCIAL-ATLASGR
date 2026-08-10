---
name: database-integrity
description: Use ao revisar prisma/schema.prisma, migrations, RLS multi-tenant, índices, uniques ou qualquer mudança de banco. Garante integridade real do PostgreSQL/Prisma — foreign keys, registros órfãos, migration segura, coluna que o código assume mas a migration nunca criou. Não muda schema só para satisfazer o frontend sem antes determinar qual contrato é correto.
---

# Database Integrity — Central de Inteligência Comercial ATLASGR

## Quando usar

Ative ao revisar `prisma/schema.prisma`, uma migration nova, um seed, ou quando o sintoma for
"dado não persiste"/"query lenta"/"erro do Prisma em produção". Também aciona quando
`functional-completeness`/`end-to-end-flow-validator` chegam num elo quebrado cuja causa é o banco.

## Missão

Garantir integridade real do schema PostgreSQL/Prisma e sua compatibilidade com o código que o
assume — sem alterar o schema só para calar um erro do frontend antes de determinar qual dos dois
lados (schema ou código consumidor) reflete o contrato correto.

## Antes de editar

Leia primeiro:

- **`prisma/schema.prisma`** (1207 linhas, 42 migrations em `prisma/migrations/`, nomeadas
  `YYYYMMDDHHMMSS_descrição`) — não assuma o schema pela documentação de produto, ele muda rápido;
  leia o arquivo real.
- **`src/lib/prisma.ts`** — extensão global do Prisma Client, incluindo `auditableModels` (lista de
  models que recebem `deletedAt: null` injetado automaticamente em toda leitura, para soft-delete).
  **Bug de classe real já encontrado neste projeto** (Piloto 002, `.claude/PILOTS.md`):
  `CrmPipeline`, `CrmProduct`, `CrmDealItem` e `CrmCommercialDocument` foram adicionados a
  `auditableModels` sem que a migration correspondente criasse a coluna `deletedAt` nesses 4
  modelos — toda query nessas tabelas quebrava com `PrismaClientValidationError` em produção,
  silenciosamente (nenhuma tela real ainda chamava esse caminho até então). **Sempre que tocar
  `auditableModels`, confirme que todo model listado tem `deletedAt` de fato na migration
  aplicada** — e o inverso: um model com soft-delete no schema mas fora dessa lista está
  vulnerável a hard-delete acidental.
- **Multi-tenant/RLS real**: `Organization` é a raiz do tenant; a maioria dos models tem
  `organizationId` + `@@index([organizationId])`. RLS está habilitado de verdade no banco
  (migrations `enable_rls`/`enable_rls_auto`/`enable_rls_remaining_tables`), reforçado por um papel
  de aplicação `NOSUPERUSER` (`scripts/db/bootstrap-app-role.sh`, usado em CI) — RLS **não** é
  exercitado de verdade com um usuário superuser local, então rodar contra um Postgres local sem
  esse bootstrap dá falso positivo de isolamento funcionando. `authenticateToken.ts` faz bypass de
  RLS deliberadamente (`requestContext.run({bypassRls: true}, ...)`) só para resolver a sessão antes
  do tenant ser conhecido — não é bug, é o único bypass legítimo; qualquer outro bypass de RLS no
  código é suspeito por padrão.
- **Débito de schema já identificado** (`PRODUCT_EXPERIENCE_CENTRAL_ATLASGR.md` §5) — confirme
  contra o schema atual antes de reportar como novidade: três models de RAG sobrepostos
  (`KnowledgeDocument` isolado vs. `Document`/`DocumentChunk` ativos vs. `KnowledgeChunk` paralelo);
  `Prospect` duplica campos de `Company`/`Lead` como pipeline paralelo não relacionado;
  `User.role` é `String` livre (`@default("VISUALIZADOR")`), não um enum Prisma — a hierarquia de
  RBAC (`ADMIN`/`GESTOR`/`VENDEDOR`/`VISUALIZADOR`) só é validada em código
  (`src/lib/auth/authorization.ts`), não no banco.

## Investigação

### Integridade

- **Foreign keys** — toda relação declarada no Prisma tem a FK real na migration correspondente?
- **Registros órfãos** — query direta (`SELECT ... LEFT JOIN ... WHERE parent IS NULL`) para
  relações críticas (Lead sem Organization válida, Contact sem Company quando o schema espera um).
- **Duplicidade** — campos que deveriam ser únicos por tenant (e-mail de Contact, `bitrixLeadId`)
  têm `@@unique` real? O par `(organizationId, bitrixLeadId)`/`(organizationId, bitrixDealId)` já
  existe no schema atual (adicionado depois da auditoria Bitrix, especificamente para fechar uma
  janela de corrida entre import manual e worker automático) — use como referência do padrão
  esperado ao avaliar outras entidades sincronizadas externamente.
- **Relações inválidas** — `onDelete`/`onDelete: Cascade` condizente com a expectativa de negócio
  (deletar uma Company não deveria silenciosamente cascatear a exclusão de Leads/Activities sem
  isso ser intencional e documentado).

### Performance

- **Queries sem índice** — todo campo usado em `WHERE`/`ORDER BY` de uma rota de listagem tem
  `@@index`? `organizationId` já é indexado na maioria dos models — confirme se filtros adicionais
  comuns (status, data, responsável) também são.
- **N+1** — `include`/`select` aninhado sem `select` explícito pode puxar relações inteiras
  desnecessariamente; procure loops que chamam Prisma por item em vez de uma query com `include`.
- **Busca textual** — campos de busca livre (nome de empresa, comentário) sem índice
  apropriado (`gin`/`trigram`) degradam com volume — este projeto também usa `meilisearch` para
  busca em alguns domínios; confirme se a busca em questão deveria estar lá em vez de LIKE no
  Postgres.
- **Filtros/ordenação/paginação** — listagens de alto volume (leads, contatos, empresas) já usam
  paginação real no backend (`meta.totalPages`, ver Piloto 002) — uma rota de listagem nova sem
  paginação é regressão desse padrão.

### Deploy

- **Migration segura** — toda migration nova é aditiva (nova coluna nullable/com default) ou tem
  estratégia explícita para dado existente antes de um `NOT NULL`/`DROP`/mudança de tipo destrutiva.
- **Rollback** — existe um caminho de reversão razoável, ou a migration é irreversível por natureza
  (documentar se for o caso)?
- **Migration destrutiva** — `DROP COLUMN`/`DROP TABLE` só depois de confirmar que nada em produção
  ainda lê/escreve esse campo (grep no código, não só suposição).
- **Coluna `NOT NULL` sem estratégia** — adicionar `NOT NULL` a uma tabela com dado existente exige
  um passo de backfill antes, na mesma migration ou numa anterior — nunca só declarar `NOT NULL` e
  torcer para não haver linha `NULL` hoje.
- **Alteração de enum** — Postgres trata `ALTER TYPE ... ADD VALUE` de forma especial (não pode
  rodar dentro da mesma transação que usa o valor novo) — confirme que a migration gerada pelo
  Prisma lida com isso corretamente antes de aplicar.
- **Dados existentes incompatíveis** — antes de apertar uma constraint nova (`@@unique`, `NOT NULL`,
  novo enum sem valor "legado"), rode a query que checa se o dado atual já viola essa constraint.
- **Onde a migration realmente roda em produção** — confirme (não assuma) se o deploy real
  (ArgoCD/K8s) executa `prisma migrate deploy` automaticamente ou depende de um passo manual/job
  separado; o `Dockerfile` deste projeto só roda `npm run start`, sem migration embutida. O alvo
  secundário `render.yaml` documenta explicitamente que `preDeployCommand` de migration está
  **desativado** no tier free — não assuma paridade entre os dois ambientes de deploy.

## Processo de execução

1. Para qualquer investigação de integridade, comece por uma query real contra um banco de teste
   (não só leitura de schema) — órfãos e duplicidade só se provam com dado.
2. Ao propor mudança de schema motivada por um sintoma no frontend, primeiro determine qual lado
   está errado: o frontend está pedindo um campo que nunca deveria existir, ou o schema está
   genuinamente incompleto? Documente essa decisão antes de migrar.
3. Toda migration nova segue o padrão já usado no projeto: nome descritivo com timestamp, aditiva
   por padrão, com passo de backfill explícito quando necessário.

## Evidências necessárias

Para "registro órfão"/"duplicidade", cite a query executada e a contagem real de linhas afetadas —
não uma estimativa. Para "migration insegura", cite o SQL gerado (`prisma migrate diff` ou o
arquivo `.sql` da migration) mostrando a operação destrutiva específica.

## Regras de implementação

- **Não mude o schema apenas para satisfazer o frontend.** Determine primeiro qual contrato é
  correto (ver `api-contracts`) — se o frontend está certo, o schema estava incompleto; se o schema
  está certo, o frontend está pedindo algo indevido.
- Toda migration é gerada via Prisma (`prisma migrate dev`/`diff`), nunca editada à mão depois de
  gerada, exceto para adicionar um passo de backfill/dado explícito quando necessário.
- Ao adicionar um model a `auditableModels`, adicione a migration de `deletedAt` na mesma mudança —
  nunca separadamente, para não repetir o bug do Piloto 002.

## Validação

- `npx prisma validate` / `npx prisma migrate status` contra o ambiente alvo.
- `npm run test:integration` — exercita RLS de verdade contra o papel `NOSUPERUSER` real (ver
  `scripts/db/bootstrap-app-role.sh`), não um Postgres local sem esse bootstrap.
- Para mudança de índice/performance, meça antes/depois com `EXPLAIN ANALYZE` na query real, não
  suposição.

## O que não fazer

- Não rode migration destrutiva sem confirmar (com query real) que nenhum dado/código depende do
  que está sendo removido.
- Não adicione um model a `auditableModels` sem a coluna `deletedAt` correspondente na mesma
  mudança.
- Não trate um Postgres local sem o papel `NOSUPERUSER` bootstrapado como prova de que RLS
  funciona — não funciona da mesma forma.
- Não "resolva" uma duplicação de model (ex.: os três modelos de RAG sobrepostos) unificando-os
  sem alinhamento de produto — é uma decisão arquitetural, não uma limpeza mecânica.

## Quando parar e pedir aprovação de escopo/Git

Pare e peça confirmação explícita antes de: rodar qualquer migration contra um ambiente que não seja
local/CI; qualquer `DROP`/mudança de tipo/`NOT NULL` que toque dado existente em produção; ou
consolidar models sobrepostos (RAG, `Prospect` vs. `Company`/`Lead`) — essas são decisões de dono de
produto, não mecânicas de schema.

## Critérios de conclusão

- [ ] Toda afirmação de órfão/duplicidade tem uma query real executada como evidência.
- [ ] Toda migration nova é aditiva, ou tem estratégia de backfill explícita e documentada.
- [ ] `auditableModels` e as colunas `deletedAt` reais estão em sincronia (nenhum model listado sem
      a coluna, nenhum model com soft-delete fora da lista sem motivo).
- [ ] A decisão "schema estava errado" vs. "frontend estava pedindo algo indevido" foi tomada
      explicitamente antes de qualquer mudança de schema motivada por sintoma de frontend.
- [ ] `prisma migrate status`/`test:integration` confirmam o estado depois da mudança.
