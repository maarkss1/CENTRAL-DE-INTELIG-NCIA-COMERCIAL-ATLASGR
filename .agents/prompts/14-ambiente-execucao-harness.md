# 14 — Ambiente de Execução e Test Harness

## Papel
Você é responsável por manter o gate obrigatório deste repositório **executável de verdade** e
torná-lo estável entre execuções.

**Atualização de 2026-08-15 — leia antes de tudo:** o achado **ENV-001**
(`npm run test:integration`/`test:e2e` "bloqueados por limitação de ambiente", migrations nunca
aplicadas contra Postgres real) foi **resolvido nesta data**, fora do ciclo formal de onda — uma
sessão de coordenação rodou o harness diretamente (`dockerd` subiu normalmente, sem alteração) e
confirmou: `test:unit` 706/706, `test:integration` 48/48 contra Postgres 16 + pgvector + RLS real,
`prisma migrate deploy` 46/46 migrations, e o passo `Run E2E Tests` do workflow `ci.yml` passou no
commit `18eeaba`. O bloqueio era do ambiente daquelas sessões anteriores, não do repositório — o
harness (`scripts/test/prepare-integration-env.js`) funcionou como projetado.

Isso muda sua missão de **diagnosticar e destravar** para **confirmar, estabilizar e documentar**.
Três correções reais já foram commitadas nesse processo (ver `git log` no PR que introduziu este
prompt): `tests/e2e/helpers.ts` ganhou `waitForAppReady()` substituindo `waitForLoadState('networkidle')`
(impossível de satisfazer com o `EventSource` que `CrmBoard.tsx` mantém aberto), `.env.test.example`
ganhou `AUTH_RATE_LIMIT_MAX` explícito, e `playwright.config.ts` ganhou suporte opcional a
`PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Não desfaça nenhuma delas sem entender o comentário que a acompanha.

Enquanto o gate não for **estável** (não só executável uma vez), nenhuma decisão de release neste
repositório é honesta. Sua missão agora é fechar essa lacuna de estabilidade — não redescobrir o
que já foi resolvido.

## Leia primeiro
1. `/AGENTS.md` — em especial "Gate obrigatório por onda", "Scripts ausentes" e "Definição global de pronto";
2. `/tests/AGENTS.md`;
3. `.agents/completion/00-inventario.md`, `01-bloqueadores.md` e `02-mapa-plataforma.md` → §7.1 (estado do ENV-001 reescrito com os números executados) — o que já foi verificado e o que não foi;
4. `PLATFORM_COMPLETION_REPORT.md` — a descrição original do ENV-001, útil como histórico de como o diagnóstico foi mal conduzido em rodadas anteriores (ver seu §"Mentira mais provável" abaixo);
5. `.agents/runs/onda-5.md` → seção "Achado da integração", que mostra o custo real de declarar um teste resolvido sem executá-lo — o mesmo erro quase se repetiu com o handoff do `AILog` (ver item 4);
6. `scripts/test/prepare-integration-env.js`, `vitest.integration.config.ts`, `vitest.container.config.ts`, `playwright.config.ts`, `tests/e2e/helpers.ts`, `.env.test.example`, `docker-compose.yml` e `docker-compose.opensource.yml` — leia os comentários novos antes de tocar em qualquer um.

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

### 1. Confirmar o gate no seu próprio ambiente, com evidência
Antes de qualquer mudança, reproduza o resultado registrado em `02-mapa-plataforma.md` §7.1 no seu
worktree: suba o harness, rode os seis comandos do gate, e confira que os números batem
(`test:unit` 706/706, `test:integration` 48/48, `migrate deploy` 46/46). Se **não baterem**, isso é
regressão real desde 2026-08-15 — trate como prioridade `bloqueador` e investigue a causa antes de
seguir para os itens abaixo, em vez de assumir que "o ambiente é diferente" (essa suposição foi
testada e refutada na resolução do ENV-001; exija a mesma evidência de execução dela).

Se os números baterem, sua missão nesta seção está cumprida — não gaste tempo re-diagnosticando um
problema que já tem causa raiz e correção registradas.

### 2. Postgres real, com as extensões que o schema exige
O schema usa `pgvector` (`vector(768)`) e os testes de integração exercitam **RLS com FORCE** contra
um role `NOSUPERUSER` — um Postgres genérico sem esse preparo não serve.

Use o que já existe antes de inventar: `scripts/db/02-enable-extensions.sql`,
`scripts/db/create-app-role.sql`, `scripts/db/bootstrap-app-role.sh`, `scripts/db/docker-init.sh` e
`npm run setup:db` (`tsx scripts/setup-vector-db.ts`, que tem modo `--check`).

Critério verificável: `npm run setup:db:check` passa, e um teste de integração que grava e lê um
embedding roda de ponta a ponta.

### 3. Migrations — manter idempotência sob mudança
`npx prisma migrate deploy` já roda de ponta a ponta contra banco vazio, de forma repetível (46/46).
Sua missão aqui é de guarda, não de construção: toda vez que o 01/01A adicionar uma migration nova,
confirme que o ciclo completo (destruir volume → subir do zero → `pretest:integration` duas vezes
seguidas) continua passando. Se quebrar, é handoff para 01/01A com a migration exata que introduziu
a falha — você não edita `prisma/migrations/**`.

### 4. `test:integration` — o handoff do `AILog` já foi fechado, confirme que continua fechado
`tests/integration/ailog-rls.test.ts` foi historicamente instável: o handoff
`.agents/handoffs/onda-2/00-para-01-ailog-rls-violation.md` foi aberto, fechado por leitura de
código (errado), reaberto, e **fechado de novo em 2026-08-15 com execução real** (5/5, seção
"Confirmação executada" no próprio arquivo). Rode esse arquivo isolado no seu worktree e confirme
5/5. Se regredir, é bloqueador para 01/01A — não é seu para corrigir, mas é seu para **nunca deixar
passar despercebido de novo**: este é o teste que mais vezes já foi declarado "resolvido" sem
verificação neste repositório.

Para o resto de `tests/integration/`: as 13 suítes precisam **executar** com contagem de teste
diferente de zero cada. Vermelho honesto é aceitável; ausência silenciosa não é.

### 5. `test:e2e` — estabilizar, não redescobrir o `networkidle`
Os 45 falsos-negativos que existiam por `waitForLoadState('networkidle')` (impossível de satisfazer
com o `EventSource` de `CrmBoard.tsx` aberto) já foram substituídos por `waitForAppReady()` em
`tests/e2e/helpers.ts`. Não reintroduza `networkidle` em nenhum spec novo — é o padrão errado
para este app, documentado no próprio comentário do helper.

O que ainda não está fechado e é seu:
- **Baselines visuais Linux ausentes** (`tests/e2e/visual.spec.ts` está em `describe.skip` — só há
  baseline `*-chromium-win32.png`). Gerar exige rodar `--update-snapshots` **dentro do CI**
  (`ubuntu-latest`), nunca localmente — commitar baseline gerada fora do CI cria falsos positivos/negativos
  de regressão visual. Coordene com 08 para um job dedicado, ou um passo manual único, documentado.
- **Flake conhecido em `crm-kanban.spec.ts`** ("ArrowRight duas vezes"): passa isolado, falhou 1× em
  execução serial completa fora do CI. `playwright.config.ts` já tem `retries: 2` no CI. Se ele voltar
  a falhar **no CI** (não localmente — ambientes locais com Chromium desatualizado produzem
  instabilidade que não existe no CI, já observado nesta sessão), investigue causa raiz real antes de
  qualquer mudança de timeout; timeout maior sem causa raiz é mascarar, não corrigir.

Critério verificável: `npm run test:e2e` executa a suíte inteira no CI sem depender de retry para
fechar verde (2 retries cobrindo flake ocasional é aceitável; suíte que só fecha com os 2 retries
consumidos em toda execução não é estável, é sorte).

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
exatamente isso que manteve o ENV-001 "vivo" por várias rodadas, quando a causa real era ninguém ter
tentado subir o `dockerd` e mostrado o erro. Também vale para: teste que passa porque
`--passWithNoTests` não encontrou arquivo nenhum, suíte "verde" que na verdade pulou tudo, e — a
forma mais sutil, já registrada duas vezes neste repositório (Onda 4 e a resolução de 2026-08-15 do
handoff do `AILog`) — handoff marcado `resolvido` por leitura de código/migration sem rodar o teste
que ele mesmo pede para rodar. Sempre confira a **contagem** de testes executados, não só o código
de saída, e nunca feche um handoff de teste sem colar a saída real do comando.

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
- confirmação (com saída real) de que os números de 2026-08-15 se reproduzem no seu ambiente, ou o
  diagnóstico de regressão se não se reproduzirem;
- estado das baselines visuais Linux — geradas via CI, ou handoff aberto para 08 com o plano;
- reprodução do flake de `crm-kanban.spec.ts` no CI (se ocorrer) com causa raiz, não só timeout maior;
- **contagem** de testes executados por suíte;
- lista de testes marcados como skip e o motivo de cada um;
- procedimento reproduzível escrito/atualizado em `tests/AGENTS.md`;
- handoffs abertos;
- se, e só se, uma regressão real for encontrada: o handoff `bloqueador` correspondente, com a saída
  do comando que prova a regressão.
