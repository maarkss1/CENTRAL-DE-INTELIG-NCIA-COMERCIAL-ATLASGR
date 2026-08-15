# AGENTS.md — Testes

## Dono
Agente 08 — QA e Release

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- testes unitários, integração, E2E, fixtures sanitizadas e harness.

## Não pode
- Não enfraquecer assert para “ficar verde”.
- Não colocar segredo em fixture.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.

## Definição de pronto local
- suíte reproduz falhas críticas e permanece confiável.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.

## Procedimento reproduzível para rodar o gate completo localmente

Confirmado no Agente 14 (Onda 6, 2026-08-15) no worktree `wt-agente-14`. Reproduz os números do
ENV-001 (`.agents/completion/02-mapa-plataforma.md` → §7.1): `test:unit` 706/706, `test:integration`
48/48 contra Postgres 16 + pgvector + RLS real, `prisma migrate deploy` 46/46 idempotente,
`test:e2e` 44/50 passando com 5 skip esperados (ver abaixo).

### 1. Subir o Docker daemon (se não estiver rodando)
```bash
sudo dockerd > /tmp/dockerd.log 2>&1 &
```
Em ambiente de agente, os containers `atlas_postgres`/`atlas_redis`/`atlas_meilisearch` costumam já
vir compartilhados entre worktrees da mesma onda — confira com `docker ps` antes de tentar subir de
novo.

### 2. `npm install` (worktree novo não tem `node_modules`)

### 3. `.env.test`
`scripts/test/prepare-integration-env.js` copia de `.env.test.example` automaticamente se
`.env.test` não existir — não precisa criar à mão.

### 4. Rodar o gate
```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:integration      # sobe/valida Postgres+pgvector+role NOSUPERUSER via pretest:integration
npm run setup:db:check        # tsx scripts/setup-vector-db.ts --check
npm run test:containers       # 1 skip por padrão — RUN_INFRA_TESTS=1 npm run test:containers roda de verdade (usa testcontainers, sobe imagem própria)
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e   # só necessário se o Playwright reclamar de versão do Chromium instalado; prefira sem a variável primeiro
```

### 5. Containers compartilhados entre múltiplos worktrees (`git worktree`)
`docker-compose.yml` fixa `container_name: atlas_postgres/atlas_redis/atlas_meilisearch` de
propósito, para todo script de bootstrap sempre achar o mesmo nome. Isso conflita com múltiplos
worktrees rodando `docker compose up` a partir de diretórios diferentes (cada diretório é um
"projeto" compose distinto, mas `container_name` é global ao daemon) — o segundo worktree recebe
"Conflict. The container name ... is already in use". `scripts/test/prepare-integration-env.js`
já detecta os três containers já rodando (de qualquer projeto compose) e pula o `docker compose up`
nesse caso — não é preciso setar `COMPOSE_PROJECT_NAME` manualmente. Se mesmo assim aparecer esse
conflito (ex.: só 1 ou 2 dos três containers de pé), pare os containers parciais
(`docker stop atlas_postgres atlas_redis atlas_meilisearch`) e rode de novo, ou alinhe
`COMPOSE_PROJECT_NAME` com o worktree que os criou primeiro.

### 6. Testes marcados como skip e o motivo de cada um
- `tests/e2e/visual.spec.ts` — `describe.skip` no arquivo inteiro (5 testes). Baseline commitada é
  só `*-chromium-win32.png` (Windows); o CI (`ubuntu-latest`) sempre buscaria `*-chromium-linux.png`,
  que nunca existiu. Gerar a baseline Linux exige rodar `--update-snapshots` **dentro do CI** — o
  Chromium local (`chromium-1194`) é um build diferente do que o CI instala
  (`chromium_headless_shell-1228` na verificação de 2026-08-15), e builds diferentes rasterizam
  fonte/anti-aliasing de forma sutilmente distinta o bastante para produzir falso positivo/negativo
  numa comparação pixel-a-pixel. Handoff aberto:
  `.agents/handoffs/onda-6/14-para-08-baselines-visuais-linux.md`.
- `tests/container/postgres.test.ts` — `describe.skip` a menos que `RUN_INFRA_TESTS=1` esteja
  setado (usa `testcontainers`, sobe sua própria imagem `atlasgr/postgres-intelligence:16` — mais
  pesado que o resto do gate, por isso opt-in). Passa 1/1 com a variável setada.

### 7. Flake conhecido de `test:e2e` neste tipo de ambiente
Em execução serial completa fora do CI, com o Chromium local (`chromium-1194`, mais antigo que o do
CI), observei 1 teste falhar por execução em specs *diferentes* entre duas rodadas consecutivas
(`accessibility.spec.ts` → dashboard numa rodada, `crm-kanban.spec.ts` → drag por teclado/pickup
noutra) — ambos passam isolados. Isso bate com o já documentado em
`.agents/prompts/14-ambiente-execucao-harness.md`: instabilidade de Chromium desatualizado local que
não necessariamente existe no CI. `playwright.config.ts` já cobre isso com `retries: 2` só no CI.
Não mude timeout para "corrigir" isso sem reproduzir o flake **no CI** primeiro — timeout maior sem
causa raiz mascara, não corrige.
