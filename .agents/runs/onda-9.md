# Onda 9 — Agente 01A (Confiabilidade de Dados, RLS e Retenção)

- Data: 2026-08-15
- Executor: Agente 01A
- Worktree: `.claude/worktrees/agent-accfcdc4799346186`
- Missão: reproduzir e corrigir o bug determinístico de `tests/integration/threecx-persistence.test.ts`
  (visibilidade perdida entre `requestContext.run()` de nível superior separados), suspeita em
  `executeWithRls` (`src/lib/prisma.ts`).

## Status final: BLOQUEADO por infraestrutura ausente — nenhuma correção foi aplicada

Não declaro o bug corrigido. Não consegui nem reproduzi-lo neste ambiente, e por regra do próprio
`AGENTS.md` ("Não marcar teste como aprovado se não foi executado... salvo dependência externa
impossível de provisionar localmente") isso deve ser registrado como bloqueio, não como sucesso.

## O que foi tentado, em ordem, com saída real

1. `npx vitest run -c vitest.integration.config.ts tests/integration/threecx-persistence.test.ts`
   (direto, sem o script npm) →
   ```
   Error: Testes de integração recusaram rodar: DATABASE_URL não aponta para um banco de teste
   isolado (esperado um nome de banco contendo "test"... recebido "(vazio)")
   ```
   Esperado — este comando exige `.env.test` já preparado pelo `pretest:integration`.

2. `node scripts/test/prepare-integration-env.js` (o passo que o `pretest:integration` roda antes
   de `test:integration`, e que sobe Postgres/Redis/Meilisearch via `docker-compose.yml`) →
   ```
   unable to get image 'atlasgr/postgres-intelligence:16': failed to connect to the docker API at
   npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is
   running: open //./pipe/dockerDesktopLinuxEngine: O sistema não pode encontrar o arquivo
   especificado.
   Falha ao subir docker-compose (postgres/redis/meilisearch).
   ```

3. Verificação direta de Docker Desktop:
   - `docker ps` → `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`
   - `Get-Process 'Docker Desktop'` e `Get-Service -Name '*docker*'` → nenhum processo/serviço
     encontrado (Docker Desktop não está instalado/rodando neste ambiente, não é só um daemon
     parado).

4. Verificação de Postgres local alternativo:
   - `where postgres` / `where pg_ctl` / `where psql` → nenhum binário encontrado no PATH.
   - `Test-NetConnection -ComputerName localhost -Port 5432` → `TcpTestSucceeded: False`.

**Conclusão desta parte:** este worktree não tem acesso a Docker nem a um Postgres local de
qualquer forma. Não é o cenário "containers compartilhados entre worktrees" que a Onda 7 descreveu
(`atlas_postgres` reaproveitado) — aqui não há Docker Desktop operante de forma nenhuma. Sem
Postgres real, não há como:
- reproduzir a falha determinística relatada;
- validar qualquer alteração em `executeWithRls`/RLS sem risco real de "corrigir" às cegas um
  código de segurança crítico — exatamente a "Mentira mais provável" que meu próprio prompt
  (`01A-dados-rls-retencao.md`) me instrui a não cometer;
- rodar `npx prisma migrate deploy`, `npm run setup:db:check`, ou qualquer item 2-5 da missão que
  dependa de banco real (varredura de SQL cru posso fazer estaticamente, mas provar exclusão/
  anonimização cross-tenant e migrations do zero exigem banco real).

## Análise de causa raiz feita por leitura de código (não verificada por execução — não tratar como conclusão)

Documentando o raciocínio para quem retomar isto com banco disponível, sem declarar como resolvido:

`executeWithRls` (`src/lib/prisma.ts:160-178`) usa a forma array de `$transaction`:
```ts
const [, res] = await basePrisma.$transaction([
  basePrisma.$executeRawUnsafe(`SELECT set_config(...)`, ...),
  prismaPromise
]);
```//
Três agentes independentes (07, 12, 13 — Onda 7) encontraram o mesmo padrão: escrita e leitura em
dois `requestContext.run()` de nível superior separados (não aninhados) perdem visibilidade entre
si; o mesmo padrão dentro de um único `.run()` (ou aninhado) sempre funciona.

Pontos que precisam de verificação com banco real antes de qualquer mudança, na ordem que eu
seguiria:
1. Confirmar se `basePrisma.$transaction([a, b])` (forma array/batch) com o adapter
   `@prisma/adapter-pg` (Prisma 7.8, `client-engine-runtime`) de fato garante a mesma conexão
   física do pool `pg.Pool` para os dois elementos do array — isso é a premissa que todo o
   mecanismo de `SET ... TRUE` (SET LOCAL, escopo de transação) depende. Um teste mínimo (fora do
   meu domínio de RLS) seria: dentro da mesma chamada a `executeWithRls`, capturar o PID da conexão
   Postgres (`SELECT pg_backend_pid()`) para o `$executeRawUnsafe` do `set_config` e para a query
   seguinte, e comparar.
2. Se as conexões divergirem, a correção descrita no handoff `07-para-01-...` (migrar
   `executeWithRls` para `$transaction(async (tx) => {...})`, forma callback/interativa, que é o
   padrão que `withRlsContext` já usa com sucesso no mesmo arquivo) é a direção mais defensável —
   mas exige reescrever como `query(args)` roda dentro do `tx` em vez de `basePrisma`, o que dentro
   de uma extensão `$allOperations` não é trivial (a extensão intercepta chamadas em `prisma.*`, e
   `query(args)` já é a chamada "downstream"; redirecionar para `tx.<model>.<operation>(args)`
   exigiria reconstruir a chamada por model/operation dentro do próprio `tx`, não só reusar
   `query`).
3. Se as conexões forem as mesmas (hipótese de conexão descartada), a causa é outra — possivelmente
   ligada a `allowExitOnIdle: true` do pool encerrando a conexão física antes do commit assíncrono
   se propagar, ou a alguma peculiaridade do `client-engine-runtime` do Prisma 7 com adapters em
   modo teste (`singleThread: true` do Vitest). Não tenho como distinguir essas hipóteses sem
   executar contra Postgres real.

**Nenhuma alteração foi feita em `src/lib/prisma.ts`, `src/lib/tenant-prisma.ts`,
`src/lib/async-context.ts` ou `prisma/schema.prisma`.** Mudar código de RLS sem poder provar o
efeito com teste real é exatamente o erro que este domínio já cometeu antes (ver
`.agents/handoffs/onda-2/00-para-01-ailog-rls-violation.md`, duas reaberturas por "corrigido só por
leitura de código").

## Itens 2-5 da missão original (`.agents/prompts/01A-dados-rls-retencao.md`)

Não executados nesta rodada porque dependem, em maior ou menor grau, de banco real para *provar*
(não só descrever) o resultado — e a instrução de "Definição global de pronto" do `/AGENTS.md`
exige evidência de teste executado, não leitura de código. Registrando como próximo passo, não como
concluído:
- **Varredura de `$queryRaw`/`$executeRaw`/`$queryRawUnsafe`**: pode ser feita estaticamente (só
  grep + classificação manual) sem banco. Não foi feita nesta rodada por prioridade — o item 1
  (bug crítico do handoff) consumiu o tempo desta execução tentando obter reprodução. Fica como
  próxima ação de alto valor mesmo sem banco disponível.
- **`BitrixExtractionRun` parametrizado por retenção**: o handoff
  `.agents/handoffs/onda-6/01A-para-06-bitrix-extraction-run-schema.md` já registra retenção
  confirmada em 90 dias (ver Onda 7, Leva 1) — não voltei a mexer em schema sem revalidar esse
  handoff a fundo, por falta de tempo nesta execução.
- **Exclusão/anonimização cross-tenant, migrations do zero**: bloqueados pela mesma ausência de
  Postgres.

## Comandos executados (resumo para replicação em ambiente com Docker)

```bash
npx vitest run -c vitest.integration.config.ts tests/integration/threecx-persistence.test.ts
node scripts/test/prepare-integration-env.js
docker ps
where postgres; where pg_ctl; where psql
Test-NetConnection -ComputerName localhost -Port 5432
```

## Recomendação ao Coordenador (00)

Este bug crítico de plataforma (elevado a prioridade crítico no gate final da Onda 7) **não pode
ser fechado neste worktree** — falta Docker Desktop ou um Postgres acessível de qualquer forma.
Recomendo:
1. Registrar este bloqueio de ambiente como impeditivo de release para este item específico, não
   como "resolvido" nem como "ainda não investigado" — foi investigado até o limite que a
   infraestrutura disponível permite.
2. Repassar a um worktree/ambiente onde Docker Desktop esteja de fato operante (ou um Postgres real
   acessível via `DATABASE_URL`) para a próxima tentativa de reprodução + correção.
3. Não aceitar uma correção de `executeWithRls` sem a saída de teste "antes/depois" de
   `threecx-persistence.test.ts` — isso vale tanto para mim quanto para qualquer outro agente que
   pegue este item a seguir.
