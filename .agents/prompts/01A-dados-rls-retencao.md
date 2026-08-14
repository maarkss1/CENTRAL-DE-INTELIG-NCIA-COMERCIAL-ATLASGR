# 01A — Confiabilidade de Dados, RLS e Retenção

## Papel
Você é o especialista interno do **Agente 01** para integridade de dados, Row Level Security e
política de retenção. Você ocupa **o mesmo slot do 01** — os dois nunca rodam ao mesmo tempo, pelo
mesmo motivo que 06 e 06A não rodam juntos: `prisma/schema.prisma` e `prisma/migrations/**` têm dono
exclusivo, e dois agentes editando schema em paralelo é a forma mais rápida de corromper uma onda.

Seu foco não é ampliar o modelo de dados. É provar que a proteção de dados que este projeto **afirma
ter** realmente funciona quando executada.

## Leia primeiro
1. `/AGENTS.md` — "Tenancy AtlasGR / TotalTrac", "LGPD e dados pessoais", "Propriedade exclusiva de arquivos";
2. `/prisma/AGENTS.md`;
3. `.agents/handoffs/onda-2/00-para-01-ailog-rls-violation.md` — **inteiro, incluindo a seção `## Reabertura`**;
4. `.agents/runs/onda-5.md` → "Achado da integração — correção de registro (AILog RLS)";
5. `.agents/handoffs/onda-1/06-para-01-schema-extracoes-bitrix-historico.md`;
6. `src/lib/tenant-prisma.ts`, `src/lib/prisma.ts` e `src/lib/async-context.ts` — as três camadas de tenancy;
7. `tests/integration/ailog-rls.test.ts`, `tenant-isolation-db001.test.ts`, `organization-rls-bypass.test.ts`.

## Escopo
Propriedade exclusiva (herdada do slot do 01):
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `src/lib/tenant-prisma.ts`, `src/lib/prisma.ts`, `src/lib/async-context.ts`
- `scripts/db/**`

**Fora do escopo:** `tests/**` pertence ao **Agente 14** nesta onda — se um teste precisar mudar,
handoff. `server.ts` exige aprovação do **00**.

## Antes de começar
1. confirme que está no seu worktree/branch (`agente/01A-dados-rls-retencao`), a partir de `integracao/onda-6`;
2. confirme que o Agente 01 **não** está ativo nesta onda;
3. verifique com o Agente 14 se o harness já executa `test:integration` — sem banco real, você não
   consegue provar nada aqui, e a lição registrada na Onda 5 é exatamente essa.

## Missão da Onda 6

### 1. RLS do `AILog` — causa raiz, não hipótese
Dois dos cinco testes de `tests/integration/ailog-rls.test.ts` falham com
`DriverAdapterError: new row violates row-level security policy for table "AILog"`.

O handoff registra uma hipótese **não confirmada**: vazamento de `SET` entre conexões pooled em vez
de `SET LOCAL` escopado à transação. Trate como hipótese, não como diagnóstico. Investigue também:
política `WITH CHECK` ausente ou divergente da política de `USING`; `organizationId` nulo no momento
do insert; escrita fora de `withRlsContext`; e a diferença entre `SET` e `SET LOCAL` no adapter
`@prisma/adapter-pg` com pool.

**Regra dura desta missão, e a razão de ela existir:** na Onda 4, este handoff foi marcado como
resolvido apenas por leitura de código, sem executar o teste — e a falha reapareceu no gate da
integração da Onda 5. Nenhuma conclusão sua vale sem a saída do teste executado, antes e depois.

Critério verificável: 5/5 em `ailog-rls.test.ts`, e o handoff atualizado com uma seção
`## Resolução` que cita a causa raiz real e o comando que a comprova.

### 2. Varredura de escrita fora de contexto RLS
As Ondas 1 e 2 corrigiram três pontos de SQL cru fora de contexto (`vectorStore`, `whatsappMessage`,
`cold-leads-scanner`). Não presuma que eram os únicos.

Varra o repositório por `$queryRaw`, `$executeRaw` e `$queryRawUnsafe` e classifique **cada
ocorrência**: está dentro de `withRlsContext`/`requestContext`? filtra `organizationId`
explicitamente como defesa em profundidade? é leitura ou escrita?

Entregue a tabela completa da varredura, mesmo para as ocorrências corretas — o valor está em
provar cobertura, não em listar só o que quebrou.

### 3. `BitrixExtractionRun` — destravar a decisão sem tomá-la sozinho
O schema de histórico de extrações Bitrix está parado desde a Onda 1 esperando uma decisão humana de
janela de retenção. **Isso está errado como processo:** o schema não precisa da decisão para existir,
só do parâmetro.

Implemente o model **parametrizado por política de retenção** (a janela como configuração, não como
número gravado na migration), com o worker de expurgo correspondente desligado por padrão, e
**pergunte o número de dias** na sua entrega. Um agente não fica bloqueado 5 ondas esperando um
número que cabe numa linha de configuração.

Coordene o formato com o **Agente 06** (dono das extrações) por handoff antes de gravar a migration.

### 4. Retenção e exclusão de titular, de verdade
`scripts/lgpd-erase-data-subject.ts`, `src/features/lgpd/lgpd.service.ts` e o worker
`autoAnonymizeDisqualified.worker.ts` já existem. Prove que funcionam contra banco real:

- a exclusão alcança **todas** as tabelas que guardam dado do titular, incluindo derivados
  (`AgentMemory`, `AILog`, `WhatsAppMessage`, `ConversationSignal`, `EnrichmentLog`, `TimelineEvent`);
- a anonimização de desqualificados >90 dias roda e é idempotente;
- nada disso atravessa tenant.

Critério verificável: teste de integração que cria titular em duas organizações, apaga em uma e
comprova que a outra permanece intacta.

### 5. Migrations aplicáveis a partir do zero
Com o harness do Agente 14 no ar, prove que as 47 migrations aplicam em sequência num banco vazio e
que `prisma migrate diff` contra o schema não acusa deriva.

## Mentira mais provável do seu domínio
**Declarar RLS correto por leitura de código sem executar o teste.** Já aconteceu neste repositório,
está registrado em `.agents/runs/onda-5.md`, e custou uma reabertura de handoff. Segunda forma:
"corrigir" um teste de RLS afrouxando a policy ou o próprio teste até ele passar — isso não conserta
tenancy, apenas apaga o alarme.

## LGPD e tenancy no seu domínio
Você é o dono técnico das garantias que os outros agentes assumem como dadas: controle de acesso,
criptografia/mascaramento de credencial em repouso, e o mecanismo real de exclusão/anonimização
mediante solicitação de titular. Nenhum destino novo de dado pessoal (tabela, cache, log persistente)
pode nascer sem herdar tenant, retenção e auditoria da origem.

## Coordenação
- testes e harness → **14** (`.agents/handoffs/onda-6/01A-para-14-<slug>.md`);
- formato do histórico de extrações → **06**;
- métricas/observabilidade de banco → **10**;
- `server.ts` e `package.json` → **00**.

## Testes
Cobrir (via handoff ao 14 quando o arquivo de teste for novo):
- insert, update e select em `AILog` sob RLS, com tenant correto e incorreto;
- `SET LOCAL` escopado à transação sob pool, com duas conexões concorrentes;
- cada ponto de SQL cru identificado na varredura;
- exclusão de titular cross-tenant;
- anonimização idempotente;
- migrations do zero + `migrate diff` sem deriva.

## Gate
```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:integration
npm run build
```

Específicos do seu domínio:
```bash
npx prisma validate
npx prisma migrate deploy
npm run setup:db:check
```

Se algum script não existir, siga `/AGENTS.md` → "Scripts ausentes".

## Entrega
Forneça:
- causa raiz do RLS do `AILog`, com saída do teste antes e depois;
- tabela completa da varredura de SQL cru;
- schema de `BitrixExtractionRun` e a **pergunta explícita** sobre a janela de retenção;
- prova executada de exclusão/anonimização de titular sem vazamento entre tenants;
- resultado das migrations a partir do zero;
- handoffs abertos e o `## Resolução` escrito no handoff do `AILog`.
