# Waivers de dependency audit (npm audit)

Criado na Fase Final 1 (Gate Único de Release, ver `.agents/runs/final-fase-1.md`).

**Fonte de verdade única** para dono, motivo e data de reavaliação de qualquer waiver de
vulnerabilidade de dependência neste repositório — inclusive as duas outras ferramentas que também
checam vulnerabilidade de dependência em PR (ITEM-10, Onda 2):

- `.trivyignore.yaml` — waivers do gate de PR do Trivy (`.github/workflows/security-trivy.yml`,
  job `trivy-fs-pr-gate`) e do scan de imagem em produção (`.github/workflows/production.yaml`).
- `allow-ghsas` em `.github/workflows/dependency-review.yml` — waivers do Dependency Review.

Os dois arquivos acima só espelham o(s) mesmo(s) advisory ID(s) já registrados aqui embaixo, no
formato que cada ferramenta entende. Ao registrar, expirar ou remover um waiver **neste** arquivo,
atualize os outros dois na mesma alteração — eles não leem este arquivo automaticamente.

## Regra

`npm audit --audit-level=high` roda como gate obrigatório (sem `continue-on-error`) em todo
workflow que publica artefato (`ci.yml`, `production.yaml`, `cd-homolog.yml`). Um achado
`HIGH`/`CRITICAL` **bloqueia o pipeline** por padrão.

Se um achado `HIGH`/`CRITICAL` precisar ser aceito temporariamente (ex.: sem fix disponível, ou fix
é breaking change que exige uma onda própria de migração), o waiver precisa:

1. Ser registrado numa entrada nova neste arquivo (não só num comentário de workflow).
2. Ter dono, motivo e data de reavaliação.
3. Ser aprovado pelo Agente 00 (ou pelo dono do repositório) antes de voltar a usar
   `continue-on-error: true` no workflow — e o `continue-on-error` deve citar esta entrada por
   título/data, não ficar solto sem referência.
4. Nunca cobrir mais do que o(s) advisory ID(s) específico(s) listado(s) — não é uma licença para
   ignorar auditoria em geral.

## Waivers ativos

### `GHSA-3f6p-5ww8-9rcr` / `GHSA-rgwj-5xj2-c3m3` — `mysql2` via `prisma` CLI / `@prisma/engines`

- **Advisories:**
  - https://github.com/advisories/GHSA-3f6p-5ww8-9rcr — `mysql2 <3.16.0` possui vulnerabilidade em parsing transitivo em ferramentas CLI (Auth Plugin Downgrade, leak de credencial em texto puro).
  - https://github.com/advisories/GHSA-rgwj-5xj2-c3m3 — `mysql2 <=3.23.0` tem DoS por decompressão ilimitada (zlib inflate) no handler de protocolo MySQL comprimido. Achado em 2026-09-02 (mesmo `node_modules/prisma/node_modules/mysql2`, base de advisories atualizada — o mesmo `package-lock.json` não reportava isso horas antes).
- **Severidade reportada pelo `npm audit`:** high (propaga para `@prisma/engines`, `prisma` e `mysql2`; `GHSA-rgwj-5xj2-c3m3` em si é moderate, mas o pacote `mysql2` agrega como high pela outra entrada).
- **Cadeia:** `prisma@7.10.0` → `@prisma/engines@7.10.0` → `mysql2` — transitivo de desenvolvimento/CLI do Prisma.
- **Por que é aceito temporariamente:** O banco de dados de produção da plataforma é PostgreSQL (`pg` / `@prisma/adapter-pg`). O driver `mysql2` é incluído transitivamente no pacote de CLI do Prisma para suporte multi-driver de desenvolvimento e não é instanciado no runtime de produção Express/Node.js da aplicação — nem o downgrade de auth plugin nem o DoS por decompressão têm superfície de exploração real fora de uma conexão MySQL de verdade, que este processo nunca abre.
- **Dono:** Agente 15 / Agente 01 — reavaliar quando o Prisma atualizar a dependência interna de `mysql2` no pacote CLI.
- **Data de registro:** 2026-09-01 (`GHSA-3f6p-5ww8-9rcr`), estendido em 2026-09-02 (`GHSA-rgwj-5xj2-c3m3`). **Reavaliar em:** próximo bump de minor do Prisma ou em 30 dias.
- **Escopo do waiver:** apenas os dois advisories `GHSA-3f6p-5ww8-9rcr` e `GHSA-rgwj-5xj2-c3m3`, só via esta cadeia de dependência (`prisma` CLI).

### `GHSA-ggr8-5vv4-36mx` / `CVE-2026-40345` — `deepmerge-ts` (stack exhaustion) via `@prisma/config`/`prisma`

- **Advisory:** https://github.com/advisories/GHSA-ggr8-5vv4-36mx — `deepmerge-ts <8.0.0` tem
  esgotamento de pilha (DoS) ao mesclar grafos de objeto recursivos. **Mesma vulnerabilidade**
  aparece na base do Trivy sob `CVE-2026-40345` (confirmado em 2026-08-25 rodando `trivy fs`
  localmente contra este repositório, PR #269 do ITEM-10 — texto do advisory idêntico, mesmo
  pacote, mesma cadeia). `npm audit`/GitHub Advisory Database indexam por GHSA ID; o Trivy indexa
  por CVE ID para este achado — os dois IDs são o mesmo waiver, não dois achados diferentes.
- **Severidade reportada pelo `npm audit`:** high (propaga para `@prisma/config` e `prisma`, ambos
  marcados high por dependerem transitivamente de `deepmerge-ts`).
- **Cadeia:** `prisma@7.10.0` → `@prisma/config@7.10.0` → `deepmerge-ts@7.1.5` (`<8.0.0`) — versões
  resolvidas no `package-lock.json` em 2026-08-28. A cadeia já foi `7.8.0`/`7.8.0` quando este waiver
  foi registrado (2026-08-17); Prisma foi atualizado desde então mas `deepmerge-ts` continua `<8.0.0`
  em todas as versões `7.x` do Prisma publicadas até agora — a atualização não resolveu o achado,
  só mudou o número da versão na cadeia. Atualize esta linha a cada bump de major/minor do Prisma
  para não deixar a documentação do waiver referenciar uma versão antiga.
- **Por que é aceito temporariamente:** o único fix automático (`npm audit fix --force`) rebaixa
  `prisma`/`@prisma/config`/`@prisma/client` para `6.12.0` — downgrade major do ORM que
  todo o schema, as migrations e o RLS multi-tenant do projeto já assumem como Prisma 7 (ver
  handoffs de correção de `AsyncLocalStorage` sob Prisma 7). Reverter a major é um projeto próprio de
  migração, não uma correção pontual de CI. `deepmerge-ts` é usado pelo carregamento de
  `prisma.config.ts` (ferramenta de build/CLI), não processa entrada não confiável de usuário final
  em runtime da aplicação — risco de exploração em produção é baixo.
- **Dono:** Agente 00 / dono do repositório — reavaliar quando o Prisma publicar uma versão `7.x`
  que atualize `deepmerge-ts` para `>=8.0.0`, ou ao planejar a próxima major do Prisma.
  Verificar com `npm audit --audit-level=high` **e** `trivy fs --severity HIGH,CRITICAL` a cada
  reavaliação — as duas ferramentas precisam ficar limpas (ou com este waiver renovado nas duas)
  antes de considerar o achado resolvido.
- **Data de registro:** 2026-08-17. **Reavaliar em:** próxima atualização de `prisma`/`@prisma/config`
  ou em 30 dias, o que vier primeiro (`expired_at: 2026-09-16` em `.trivyignore.yaml` para as duas
  entradas — reavaliar as duas juntas, mesmo prazo).
- **Escopo do waiver:** só estes dois advisory IDs (mesmo achado, dois catálogos), só via esta
  cadeia de dependência. Qualquer outro achado `HIGH`/`CRITICAL` novo continua bloqueando o gate
  normalmente.

## Débito conhecido, fora do escopo deste waiver (severidade abaixo do gate)

_(nenhum no momento — ver Histórico abaixo para o item resolvido em 30/08/2026)_

## Histórico

- 2026-08-30 (Onda 43) — `uuid` (via `exceljs`, dependência direta) — `GHSA-w5hq-g745-h8pq`,
  severidade moderate, listada aqui desde 2026-08-25 como débito rastreado (fix só disponível via
  upgrade major, `exceljs@4`). **Resolvido**: `exceljs` atualizado de `3.10.0` para `4.4.0`
  (`npm audit`/`npm audit --omit=dev` confirmam zero achados moderate depois da atualização, só os
  3 `high` já waivados acima). Único ponto de uso no código
  (`src/features/integrations/bitrix/service/extractionFiles.ts`, `new ExcelJS.Workbook()`) não
  precisou de nenhuma mudança — API usada é estável entre as duas majors. Testes afetados (11/11),
  `tsc`/lint/build sem erro novo.

- 2026-08-25 — ITEM-10, correção pós-CI real (PR #269): o job `trivy-fs-pr-gate` novo (descrito
  na entrada abaixo) falhou na primeira execução real em CI — `trivy fs` reportou HIGH em
  `package-lock.json` mesmo com o waiver `GHSA-ggr8-5vv4-36mx` já em `.trivyignore.yaml`.
  Investigado rodando `trivy fs --severity HIGH,CRITICAL --ignorefile .trivyignore.yaml --format
  table` localmente (via `docker run --network host` com a CA/proxy do ambiente de agente — o
  mesmo achado, não um achado novo): o Trivy indexa esta vulnerabilidade por `CVE-2026-40345`, não
  pelo GHSA ID que `npm audit` usa. Adicionado `CVE-2026-40345` como segunda entrada em
  `.trivyignore.yaml`, mesmo `expired_at`, e a entrada do waiver acima atualizada para citar os
  dois IDs — não é um waiver novo, é o mesmo risco aceito, só reconhecido sob o ID que a
  ferramenta usa.
- 2026-08-25 — ITEM-10 (Onda 2, CodeQL/Trivy/Dependency Review bloqueantes): três gates novos
  passaram a checar vulnerabilidade de dependência em PR, além do `npm audit` já bloqueante em
  `ci.yml`/`production.yaml`/`cd-homolog.yml`: CodeQL (`.github/workflows/codeql.yml`,
  javascript-typescript + python, com gate real de `level: error` em
  `scripts/security/check-codeql-sarif.ts` — `codeql-action/analyze` sozinho não falha o
  workflow), Dependency Review (`.github/workflows/dependency-review.yml`, `fail-on-severity:
  high` no diff de manifests do PR) e Trivy passando a rodar também em PR de forma bloqueante
  (`.github/workflows/security-trivy.yml`, job `trivy-fs-pr-gate` — o scan semanal existente
  continua não-bloqueante, agora só nos eventos `schedule`/`workflow_dispatch`). O scan de imagem
  Docker (`production.yaml`, job `publish`) também passou a rodar Trivy antes do `docker push`,
  bloqueando o release se a imagem tiver achado `HIGH`/`CRITICAL` com fix disponível sem waiver. O
  waiver `GHSA-ggr8-5vv4-36mx` acima passou a ser espelhado em `.trivyignore.yaml` (Trivy) e em
  `allow-ghsas` (Dependency Review) — ver nota no topo deste arquivo.

- 2026-08-16 — Fase Final 1: removido `continue-on-error: true` do step de audit em `ci.yml` e
  `production.yaml`. O comentário anterior ("known issue with better-auth pending upstream
  resolution") já não correspondia a nenhum achado real no momento da remoção — o audit já passava
  limpo sozinho, e o `continue-on-error` estava mascarando isso em vez de proteger contra algo.
- 2026-08-17 — Fase Final 1, reaplicação: um commit posterior (`cf7bffd1`, merge de correção de
  mock do Baileys não relacionado) havia revertido acidentalmente o gate único de release inteiro
  (removeu `secret-scan` de `production.yaml`, o `needs:` nos 4 workflows secundários, e
  reintroduziu `continue-on-error` sem waiver). Reaplicado o gate original. Nesta reaplicação,
  `npm audit --audit-level=high` já não retorna mais zero — encontrou o waiver `GHSA-ggr8-5vv4-36mx`
  acima (não existia em 2026-08-16, surgiu de uma atualização do Prisma entre essa data e agora).
  `continue-on-error: true` foi reintroduzido em `ci.yml`, `production.yaml` e `cd-homolog.yml`
  citando esta entrada — não é o mesmo débito vestigial de antes.
- 2026-08-18 — Sprint 01/Onda 13 (SEC-005): o `continue-on-error: true` foi removido dos 3
  workflows e substituído por `npm run security:audit-waivers`
  (`scripts/security/check-audit-waivers.ts`), que roda `npm audit --audit-level=high --json`,
  atravessa a cadeia de dependência de cada achado até o advisory real, e falha o gate para
  qualquer `HIGH`/`CRITICAL` cujo advisory ID não esteja listado na seção "## Waivers ativos"
  deste arquivo. O escopo do waiver `GHSA-ggr8-5vv4-36mx` (só esse advisory, só essa cadeia) agora
  é verificado automaticamente, não só por convenção de comentário. Também corrigido nesta sprint:
  `package.json` tinha `overrides.uuid: "^10.0.0"` conflitando com a dependência direta
  `uuid@^14.0.1` (adicionado sem reconciliar em `41d5d98`, remediação GitGuard) — isso fazia
  `npm audit`/`npm install` falharem com `EOVERRIDE` **antes** de produzir qualquer relatório,
  e o `continue-on-error: true` antigo mascarava esse erro estrutural junto com o achado real de
  vulnerabilidade. Override alinhado para `^14.0.1`, igual à dependência direta.
- 2026-08-25 — ITEM-11 (SBOM e governança de dependências, Onda 3): removidas 11 dependências de
  produção e 1 devDependency sem uso real no repositório (`@langchain/community` — também
  deprecated pelo mantenedor —, `langchain`, `@hello-pangea/dnd`, `@react-oauth/google`,
  `@tanstack/react-query`, `@tanstack/react-table`, `axios`, `cheerio`, `chromadb`,
  `duck-duck-scrape`, `eslint-config-prettier`), reduzindo a superfície auditada por
  `npm run security:audit-waivers`/CodeQL/Trivy/Dependency Review sem trocar nenhum comportamento
  coberto por teste. Nenhuma delas tinha achado `HIGH`/`CRITICAL` aberto no momento da remoção —
  não é um waiver novo nem fecha um waiver existente, só reduz o que precisa ser auditado daqui
  para frente. Adicionada geração de SBOM (CycloneDX, `npm run security:sbom`) por release real e
  um inventário de dependências RC/beta/deprecated
  (`docs/security/DEPENDENCY_INVENTORY.md`, `npm run security:dependency-inventory`). Detalhe
  completo, incluindo a justificativa de `@whiskeysockets/baileys@rc` (única dependência direta de
  produção em pré-release) e a política de atualização, em `docs/security/DEPENDENCY_POLICY.md` —
  este arquivo (`AUDIT_WAIVERS.md`) continua sendo a única fonte de verdade para waiver de
  vulnerabilidade conhecida (CVE/GHSA); `DEPENDENCY_POLICY.md` não duplica isso, só referencia.
