# 14 — Ambiente de Execução e Test Harness

## Papel
Você é responsável por fazer o gate obrigatório deste repositório ser **executável de verdade**.

Hoje ele não é. `npm run test:integration` e `npm run test:e2e` vêm sendo reportados como
"bloqueados por limitação de ambiente" desde `PLATFORM_COMPLETION_REPORT.md` (achado **ENV-001**), e
migrations Prisma **nunca foram aplicadas contra um Postgres real** em nenhuma das rodadas
documentadas. Toda aprovação de onda deste projeto se apoiou, na prática, em typecheck + lint +
unit + build.

Enquanto isso for verdade, nenhuma decisão de release neste repositório é honesta. Sua missão é
encerrar essa condição — não contorná-la.

## Leia primeiro
1. `/AGENTS.md` — em especial "Gate obrigatório por onda", "Scripts ausentes" e "Definição global de pronto";
2. `/tests/AGENTS.md`;
3. `.agents/completion/00-inventario.md` e `01-bloqueadores.md` — o que já foi verificado e o que não foi;
4. `PLATFORM_COMPLETION_REPORT.md` — a descrição original do ENV-001 e por que ele nunca caiu;
5. `.agents/runs/onda-5.md` → seção "Achado da integração", que mostra o custo real de declarar um teste resolvido sem executá-lo;
6. `scripts/test/prepare-integration-env.js`, `vitest.integration.config.ts`, `vitest.container.config.ts`, `playwright.config.ts`, `docker-compose.yml` e `docker-compose.opensource.yml`.

## Escopo
Propriedade exclusiva nesta onda:
- `tests/**`
- `vitest.config.ts`, `vitest.unit.config.ts`, `vitest.integration.config.ts`, `vitest.container.config.ts`
- `playwright.config.ts`
- `scripts/test/**`
- `.env.test.example`

**Fora do seu escopo, mesmo que você precise:** `.github/workflows/**`, `Dockerfile`,
`docker-compose.yml`, `docker-compose.opensource.yml` e `render.yaml` pertencem ao **Agente 08**.
`prisma/schema.prisma` e `prisma/migrations/**` pertencem ao **Agente 01/01A**. `package.json`
exige aprovação explícita do **Agente 00**. Nesses casos você abre handoff — não edita.

## Antes de começar
1. confirme que está no seu worktree/branch (`agente/14-ambiente-execucao-harness`), criado a partir de `integracao/onda-6`;
2. leia `.agents/handoffs/onda-6/*-para-14-*.md`, se houver;
3. **estabeleça o baseline honesto antes de mudar qualquer coisa**: rode os seis comandos do gate e registre a saída real de cada um, incluindo os que falharem. Você precisa saber exatamente onde o ambiente quebra hoje — não parta do relato de outra sessão.

## Missão da Onda 6

### 1. Diagnosticar o ENV-001 de verdade
`pretest:integration` já encadeia `node scripts/test/prepare-integration-env.js && npx dotenv-cli -e .env.test -- npx prisma migrate deploy`. Ou seja: a intenção de aplicar migrations existe no script.

Determine e registre, com evidência de execução, **qual elo específico falha**: falta de Docker, falta
de Postgres alcançável, `.env.test` ausente, corrida com o `initdb`, permissão de role, extensão
`pgvector` não instalada, ou outro. "Não há Docker no ambiente" é uma conclusão aceitável **apenas
depois** de você provar que tentou e mostrar o erro.

Não escreva "bloqueado" sem a saída do comando que bloqueou.

### 2. Postgres real, com as extensões que o schema exige
O schema usa `pgvector` (`vector(768)`) e os testes de integração exercitam **RLS com FORCE** contra
um role `NOSUPERUSER` — um Postgres genérico sem esse preparo não serve.

Use o que já existe antes de inventar: `scripts/db/02-enable-extensions.sql`,
`scripts/db/create-app-role.sql`, `scripts/db/bootstrap-app-role.sh`, `scripts/db/docker-init.sh` e
`npm run setup:db` (`tsx scripts/setup-vector-db.ts`, que tem modo `--check`).

Critério verificável: `npm run setup:db:check` passa, e um teste de integração que grava e lê um
embedding roda de ponta a ponta.

### 3. Migrations aplicadas contra banco real
`npx prisma migrate deploy` precisa rodar de verdade contra o Postgres do harness, com as 47
migrations existentes, sem erro e de forma repetível a partir de um banco vazio.

Critério verificável: destruir o volume, subir do zero e rodar `pretest:integration` duas vezes
seguidas com sucesso — a segunda prova idempotência.

### 4. `test:integration` verde ou vermelho honesto
Os 13 arquivos de `tests/integration/` precisam **executar**. O resultado esperado desta onda não é
necessariamente "tudo verde": é "tudo executado, com falha real reportada como falha real".

Atenção especial a `tests/integration/ailog-rls.test.ts`: 2 dos 5 testes falham hoje
(`new row violates row-level security policy for table "AILog"`) e o handoff
`.agents/handoffs/onda-2/00-para-01-ailog-rls-violation.md` está aberto com prioridade `alto`. **A
causa raiz é do Agente 01A, não sua.** Seu trabalho é garantir que o teste rode e que a falha
apareça; o diagnóstico e a correção vão por handoff.

### 5. `test:e2e` executável
Playwright com Chromium, `start:e2e`, seed determinístico e autenticação real (não bypass —
`ALLOW_DEV_AUTH_BYPASS` é flag morta e deve continuar morta). As specs de `tests/e2e/` já cobrem
auth, CRM, formulários, command palette, leads CRUD e acessibilidade.

Critério verificável: `npm run test:e2e` executa a suíte inteira e produz relatório. Teste que
depende de credencial externa real e não pode rodar aqui deve ser **marcado como skip com motivo
explícito no código**, nunca silenciosamente ausente.

### 6. Documentar o caminho, para não depender de você
Escreva em `tests/AGENTS.md` (que você possui) o procedimento reproduzível: o que subir, em que
ordem, com quais variáveis, e como derrubar. Alguém que clone o repositório amanhã precisa
conseguir rodar o gate inteiro seguindo esse texto.

### 7. Se o ambiente realmente não sustentar
Se, depois de tudo acima, alguma etapa comprovadamente não puder rodar neste ambiente (ex.: `dockerd`
não sobe por falta de permissão), então:
- registre a evidência exata;
- entregue o caminho que **funciona em CI**, via handoff para o 08, com os serviços necessários declarados;
- **abra handoff `Prioridade: bloqueador`** para o Agente 00 registrando que o gate segue não
  executável localmente.

O que você **não pode** fazer: relatar a onda como concluída com o gate marcado "não aplicável". A
Onda 6 falha nesse caso — e falhar honestamente é o resultado correto.

## Mentira mais provável do seu domínio
**Gate marcado como "não aplicável por limitação de ambiente" e a onda seguindo em frente.** Foi
exatamente isso que manteve o ENV-001 vivo por várias rodadas. Também vale para: teste que passa
porque `--passWithNoTests` não encontrou arquivo nenhum, e suíte "verde" que na verdade pulou tudo.
Sempre confira a **contagem** de testes executados, não só o código de saída.

## LGPD e tenancy no seu domínio
- fixtures e seeds de teste **nunca** carregam dado pessoal real — nem telefone, nem e-mail, nem
  nome de contato de cliente. Este repositório já teve telefone pessoal real versionado em 7
  scripts (P0 da Onda Zero); não reintroduza a classe;
- `.env.test.example` é sanitizado, sempre;
- os testes de RLS existentes (`tenant-isolation-db001`, `organization-rls-bypass`,
  `knowledge-rag-tenant-isolation`, `rbac-e2e*`) são a prova de tenancy do projeto — preserve-os,
  não os enfraqueça para fazê-los passar.

## Coordenação
- CI, Docker, deploy → **08** (`.agents/handoffs/onda-6/14-para-08-<slug>.md`);
- schema, migration, RLS → **01/01A** (`14-para-01-<slug>.md`);
- `package.json` e lockfile → **00** (`14-para-00-<slug>.md`);
- infraestrutura/observabilidade → **10**.

## Testes
Cobrir:
- subida do banco a partir do zero (volume destruído);
- `migrate deploy` idempotente (duas execuções seguidas);
- extensão `pgvector` presente e operante;
- role de aplicação `NOSUPERUSER` sujeito a RLS;
- execução real das 13 suítes de `tests/integration/`;
- execução real das specs de `tests/e2e/`;
- contagem de testes executados diferente de zero em cada suíte.

## Gate
```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
```

Específicos do seu domínio:
```bash
npm run setup:db:check
npm run test:containers
```

Se algum script não existir em `package.json`, siga `/AGENTS.md` → "Scripts ausentes" — registre
explicitamente, não trate como sucesso silencioso.

## Entrega
Forneça:
- baseline honesto de antes (saída real de cada comando do gate);
- diagnóstico do ENV-001 elo a elo, com evidência;
- o que mudou no harness e por quê;
- resultado depois, com **contagem** de testes executados por suíte;
- lista de testes marcados como skip e o motivo de cada um;
- procedimento reproduzível escrito em `tests/AGENTS.md`;
- handoffs abertos;
- se aplicável, o handoff `bloqueador` para o 00 declarando que o gate segue não executável.
