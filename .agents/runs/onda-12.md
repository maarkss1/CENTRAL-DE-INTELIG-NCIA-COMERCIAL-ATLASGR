# Onda 12 — Sprint 00: Governança, Roster, Freeze e Baseline

- Prioridade: **P0** — nenhuma outra sprint começa oficialmente antes desta.
- Agentes: liderança **00**; apoio **18, 15, 14, 08**.
- Data: 2026-08-18.
- Branch: `claude/sprint-00-governance-baseline-w7fbd4`.

## Leituras realizadas antes de qualquer edição

`AGENTS.md` (raiz), `EXECUCAO-ONDAS.md`, `.agents/prompts/**` (23 perfis: 00-18 + 01A + 06A + 19/20
citados só em relatórios antigos), `.agents/runs/final-fase-0.md` a `final-fase-4.md`,
`.agents/runs/task-phase8.md` a `task-phase10.md`, `.agents/runs/onda-9.md`, `onda-10.md`,
`optout-unificado.md`, `baseline.md`, os 83 arquivos de handoff em `.agents/handoffs/**`, e os
`AGENTS.md` locais tocados nesta onda (`backups/AGENTS.md`).

---

## GOV-001 — Roster real

**Status: RESOLVIDO.** `AGENTS.md` → "Estrutura oficial de agentes" foi reescrita para incluir o
roster completo e real:

- **01A** e **06A** listados explicitamente como especialistas internos que **compartilham slot**
  com 01 e 06 respectivamente (nunca rodam ao mesmo tempo que o agente principal — mesmo dono de
  `prisma/schema.prisma`/`prisma/migrations/**`).
- **13 a 18** formalizados com uma linha de escopo cada (Enxame Autônomo/Governança de Runtime,
  Ambiente de Execução/Harness, Segurança Aplicada, Runtime/Workers/Escala, Cadência/Receita,
  Contratos/API/Docs) — já tinham prompt real em `.agents/prompts/` mas não apareciam na lista
  normativa da raiz.
- **Agentes 19/20 — removidos do roster ativo.** Relatórios de "Fase Final" anteriores (`final-fase-0.md`
  a `final-fase-4.md`) citam repetidamente "Agente 19 — Verificação Contínua" e "Agente 20 —
  Experiência Real/smoke", que nunca foram formalizados como slots numerados neste `AGENTS.md`. Nova
  seção "Agentes 19/20 — não existem, não usar" documenta a reatribuição:
  - **Verificação contínua** (gate técnico completo: typecheck/lint/unit/integration/E2E/build/
    secret-scan/npm audit/`verify:integrations`/`verify:ai`) → **14 + 08**.
  - **Experiência real** (jornada de usuário ponta a ponta, estados vazio/erro/loading, mobile) →
    **02 + 03 + 08 + 14**.
  - **Ressalva registrada, não resolvida por esta onda**: o antigo Agente 20 também cobria dois
    pontos que não estão claramente em nenhum dos quatro perfis acima — confirmar persistência de
    uma ação de UI **direto no banco** (não só na tela) e confirmar sanitização de PII ponta a ponta
    em produção real. Até ganhar dono explícito, tratar como responsabilidade compartilhada de
    **01/01A** (dimensão dado) e **15** (dimensão segurança), acionados por **08** quando o release
    tocar dado sensível.

Evidência: `git diff AGENTS.md` (seção "Estrutura oficial de agentes").

---

## GOV-002 — Drift factual de segurança

**Status: RESOLVIDO.** Verificação real nesta onda:

```
$ git ls-files | grep -i '\.dump$'
(nenhum resultado)
$ ls backups/
AGENTS.md
```

`AGENTS.md` (raiz, seção "Segurança e higiene") e `backups/AGENTS.md` foram reescritos para refletir
o estado real: o dump **foi removido do working tree atual** (não está mais rastreado), mas **o
histórico do git continua recuperável** (nenhum `git filter-repo`/BFG foi rodado) — o risco de
exposição de dado pessoal está contido no HEAD, não eliminado. A decisão de reescrever o histórico
continua registrada como **decisão humana separada**, não aprovada nem rejeitada por esta onda.

---

## GOV-003 — Freeze de escopo

**Status: RESOLVIDO.** Nova seção "Freeze de escopo (Sprint 00 → Sprint 13)" adicionada a
`AGENTS.md`, entre "Bloqueadores prioritários" e "Regra de autonomia":

- bloqueia feature nova fora do que já é promessa existente do produto;
- permite remediação, débito técnico, achado de segurança/RBAC/tenancy/LGPD e trabalho já em
  andamento (as seis "Fases Finais", com a Fase Final 5/Go-Live ainda pendente);
- qualquer ideia de feature nova fora do critério vira handoff com destino "pós-Sprint 13", não
  implementação direta;
- Coordenador (00) arbitra caso de dúvida e registra a decisão no relatório da onda.

Nota de pesquisa: o termo "Sprint 13" não existia em nenhum artefato do repositório antes desta
onda (busca completa em `.agents/`) — o freeze é uma decisão de governança nova desta sprint, não a
formalização de algo que já existia informalmente. O equivalente estrutural mais próximo era o
conceito de "seis fases finais" (PR #137), do qual cinco estão documentadas e a sexta (Go-Live)
segue pendente de abertura.

---

## GOV-004 — Proteção da `main`

**Status: VERIFICADO PARCIALMENTE — checkpoint externo registrado, não "PASS N/A".**

O conjunto de ferramentas GitHub MCP disponível nesta sessão (`mcp__github__*`) não expõe um
endpoint de branch protection/ruleset (list/get de proteção de branch, "required status checks",
"required reviews", "allow force pushes", "enforce admins"). Esta sessão não tem acesso a
`gh`/API REST direta do GitHub por política do ambiente — só as tools MCP listadas. Não foi
possível, portanto, ler programaticamente a configuração formal de proteção da branch `main`.

**Evidência real e direta encontrada em produção, em vez disso** (PR #145, corpo do PR, aberto por
`MaarksN`, 2026-08-17):

> "main agora tem proteção de branch exigindo PR + check `build` obrigatório (`GH006: Protected
> branch update failed`)"

Isto confirma, por um evento real (um workflow de dados tentou `git push origin HEAD:main` e foi
recusado pelo próprio GitHub), que:
- **PR obrigatório**: confirmado (push direto foi rejeitado com `GH006`).
- **Check obrigatório apontando para gate real**: confirmado que ao menos o check `build` é
  obrigatório — três workflows (`market-intelligence-cnpj.yml`, `market-intelligence-rntrc.yml`,
  `market-intelligence-fleet.yml`) tiveram que ser reescritos nesta mesma semana para pararem de
  fazer push direto e passarem a abrir PR.
- **Force push bloqueado / admin bypass bloqueado**: **não confirmado nem negado** — nenhuma
  evidência real observada nesta onda cobre esses dois pontos especificamente.

**Checkpoint externo**: confirmar em GitHub → Settings → Branches → regra de `main` (UI ou API
autenticada fora desta sessão) que "Allow force pushes" e "Do not allow bypassing the above
settings" (admin bypass) estão configurados como esperado, e que a lista de checks obrigatórios
cobre os gates reais deste repositório (`build`/typecheck/lint/unit/integration/e2e/secret-scan,
conforme `.github/workflows/ci.yml`), não apenas `build`. Dono sugerido: **15** (Segurança Aplicada)
ou **10** (Infraestrutura), com evidência anexada ao próximo relatório de onda.

---

## GOV-005 — PRs e branches

**Status: RESOLVIDO — nenhum PR duplicado ou obsoleto encontrado para fechar.**

PRs abertos no momento desta onda (`list_pull_requests`, `state=open`): **2**, ambos legítimos e
sem sobreposição de escopo:

| PR | Título | Situação |
|---|---|---|
| #144 | fix(ci): reaplica e revalida o gate único de release (Fase Final 1) | Draft, `mergeable_state: blocked`. Base registrado como `d344e37` está desatualizado — `main` já absorveu a maior parte deste PR (merge commit `d25883a`, segundo pai `d8b6c30`, ancestral direto do head atual do PR). Restam **2 commits reais não mesclados** (`39d5245`, `b77eded` — sweep mobile da Fase Final 4, docs-only). Recomendação: atualizar a branch contra `main` atual e mesclar; não é duplicado, é uma cauda real de trabalho. |
| #145 | fix(market-intelligence): publica dados via PR em vez de push direto na main protegida | Draft, `mergeable_state: blocked`, 1 commit, não mesclado. Corrige 4 workflows de CI para pararem de dar `git push` direto contra `main` protegida (ver evidência em GOV-004). Legítimo e necessário — sem ele, os workflows de dados de mercado continuam falhando. |

Nenhum PR fechado como duplicado nesta onda porque nenhum foi encontrado. Verificação adicional em
PRs fechados recentes (#89 a #143) não revelou nenhum par de PRs abertos disputando o mesmo escopo —
o padrão observado é PRs fechados após squash-merge manual (aparecem como `merged: false` na API por
não terem sido mesclados pelo botão nativo do GitHub, mas o conteúdo já está em `main`, confirmado
por `git log`), não duplicação real.

---

## GOV-006 — Handoffs

**Status: RESOLVIDO.** Inventário completo dos 83 arquivos de handoff em `.agents/handoffs/**`
(exclui `README.md`) — tabela completa arquivo | de | para | prioridade | status | ainda válido |
sprint destino publicada em `.agents/runs/onda-12-handoffs.md` (anexo desta onda, gerado por
varredura + verificação cruzada com o código atual).

Resumo:
- **83 handoffs totais.**
- **9 handoffs corrigidos nesta onda** — tinham `Status: aberto`/`em-andamento` desatualizado
  porque a correção já estava no código, mas ninguém tinha voltado para fechar o campo. Cada um
  recebeu uma seção `## Resolução` nova (nunca apagando o pedido original, conforme o Protocolo de
  Handoff) com a evidência da verificação: `onda-1/06-para-01-schema-extracoes-bitrix-historico.md`,
  `onda-6/01A-para-06-bitrix-extraction-run-schema.md`, `onda-6/16-para-00-remover-workers-de-server-ts.md`,
  `onda-7/07-para-00-wire-stagnation-scanner-boot.md`, `onda-7/17-para-13-evento-fechamento.md`,
  `onda-7/12-para-06-fallback-whatsapp-informativo.md`, `onda-11/02-para-00-server-ts-env.md`,
  `onda-11/09-para-00-server-ts-tsc-error.md`, `onda-11/09-para-04-commercial-intelligence-tsc-error.md`.
- **1 único bloqueador ainda aberto e válido**: `onda-8/09-para-08-10-dominio-producao-e-verificacao-deep-link.md`
  — `assetlinks.json`/`apple-app-site-association` para o domínio de produção ainda não existem no
  repositório (verificação de deep link Android/iOS incompleta). É o único item da tabela que cai
  diretamente em um dos 14 "Bloqueadores prioritários" de `AGENTS.md`. Não bloqueia as Fases Finais
  0-4 já rodadas, mas bloqueia a Fase Final 5 (Go-Live) — permanece aberto, dono 09/08/10, sprint
  destino onda-13.
- **~16 handoffs** ainda válidos sem dono claro e sem status de bloqueador, endereçados para
  onda-13 ou backlog pós-freeze (ver tabela completa): schema/LGPD (`AgentMemory.leadId` nunca
  migrado, `EnrichmentLog` sem coluna de proveniência, ausência de base legal por titular),
  persistência de evento 3CX, débito de `as any` (3 itens), deploy do worker service no Render,
  deriva de OpenAPI não ligada ao CI, duplicação de 18 interfaces em commercial-intelligence,
  backfill de `Lead.owner`, decisões de produto pendentes (gatilho de discagem, rota de SLO do
  swarm, opt-out unificado voz/WhatsApp/e-mail).
- **~58 handoffs fechados** (49 já estavam `resolvido` com evidência real ou seção `## Resolução`
  própria; 9 corrigidos nesta onda).

---

## GOV-007 — Baseline

**Status: EM EXECUÇÃO NESTA ONDA — contagens reais abaixo, atualizadas conforme os comandos terminam.**

Ambiente: sem daemon Docker disponível no sandbox desta sessão. Postgres 16 + extensão `pgvector`
(`postgresql-16-pgvector`, instalada via apt) e Redis 7 nativos foram provisionados manualmente,
replicando exatamente a topologia do `ci.yml` (porta 5434, role `prospector`/`prospector_app`,
banco `prospectordb_test`, `create-app-role.sql` aplicado) — mesmo padrão já usado em
`final-fase-0.md` quando o Agente 19 precisou rodar o gate real sem Docker. `npm install` executado
do zero (sem `node_modules` prévio).

```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
npm run verify:integrations
npm run verify:ai
npm run setup:db:check
```

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | **PASS** — 0 erros |
| `npm run lint` | **PASS** |
| `npm run test:unit` | **PASS** — 161 arquivos / 1266 testes |
| `npm run test:integration` | **PASS** — 24 arquivos / 114 testes (Postgres real, migrations aplicadas do zero) |
| `npm run test:e2e` | **PASS_WITH_NON_BLOCKING_WARNINGS** — 44 passed + 1 flaky (passou no retry) + 5 skipped, 0 falha real, 3.0min (ver abaixo) |
| `npm run build` | **PASS** — Vite + esbuild (server.cjs), 16.73s, sem erros (avisos de chunk >500kB pré-existentes, não regressão) |
| `npm run verify:integrations` | **CHECKPOINT EXTERNO** — ver detalhe abaixo |
| `npm run verify:ai` | **CHECKPOINT EXTERNO** — ver detalhe abaixo |
| `npm run setup:db:check` | **CHECKPOINT EXTERNO** — ver detalhe abaixo |

### `test:e2e` — 1ª tentativa (ambiente) x 2ª tentativa (real)

**1ª tentativa**: **45 failed, 5 skipped**, 100% das falhas com a mesma causa raiz:

```
Error: browserType.launch: Executable doesn't exist at
/opt/pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell
```

`playwright.config.ts` já documenta essa exata situação em comentário (linhas 5-11) e expõe
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` para apontar para o Chromium completo que de fato existe no
sandbox (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, confirmado funcional via
`--version`) — limitação de ambiente conhecida do projeto, não do produto.

**2ª tentativa**, com `PLAYWRIGHT_CHROMIUM_EXECUTABLE` setado: **PASS_WITH_NON_BLOCKING_WARNINGS**.

```
44 passed (3.0m)
1 flaky  — commercial-intelligence-rbac.spec.ts:10 (timeout de 45s no signUp() sob carga do
           runner, passou no retry — mesma classe de flakiness já documentada em helpers.ts,
           não uma falha de asserção)
5 skipped — tests/e2e/visual.spec.ts (test.describe.skip('Regressão visual', ...) — débito de
           baseline visual Linux já conhecido e documentado em
           .agents/handoffs/onda-6/14-para-08-baselines-visuais-linux.md, item ainda válido no
           inventário GOV-006, não uma regressão desta onda)
```

0 falha real de asserção/produto. Mesmo padrão de veredito (`PASS_WITH_NON_BLOCKING_WARNINGS`) já
usado nas Fases Finais anteriores para esta exata combinação (1 flaky de timeout de carga + 5
skipped de visual) — não é uma regressão introduzida por esta onda.

### `verify:integrations` — detalhe real

```json
{
  "googlePlaces": { "ok": false, "detail": "nenhum resultado; confira ativação, faturamento e restrições da chave" },
  "apollo": { "ok": true, "skipped": true, "detail": "APOLLO_API_KEY ausente — provedor pago desativado por padrão" },
  "hunter": { "ok": true, "skipped": true, "detail": "HUNTER_API_KEY ausente — provedor pago desativado por padrão" },
  "brasilApiCnpj": { "ok": true, "detail": "consulta gratuita disponível" },
  "bitrix24": { "ok": true, "skipped": true, "detail": "BITRIX24_WEBHOOK_URL não configurada" },
  "groq": { "ok": true, "skipped": true, "detail": "GROQ_API_KEY ausente" },
  "litellm": { "ok": true, "skipped": true, "detail": "LITELLM_URL ausente" },
  "langfuse": { "ok": true, "skipped": true, "detail": "LANGFUSE_PUBLIC_KEY/SECRET_KEY/BASEURL ausentes" }
}
```
`brasilApiCnpj` (sem credencial, rede real) passou — confirma que o script em si funciona e que este
sandbox tem saída de rede para pelo menos um provedor público. `googlePlaces` chama a API real
mesmo sem chave configurada (`scripts/verify-integrations.ts:15-26`) e retorna 0 resultados — sem
`GOOGLE_PLACES_API_KEY` neste ambiente, não dá para distinguir "chave ausente" de "chave presente
mas sem faturamento/rede bloqueada". **Checkpoint externo**: reexecutar com credenciais reais de
produção/homologação para confirmar `googlePlaces`, `apollo`, `hunter`, `bitrix24`, `groq`,
`litellm`, `langfuse` — nenhuma dessas 7 pode ser validada de dentro deste sandbox.

### `verify:ai` — detalhe real
```
Nenhum motor de IA configurado. Defina GROQ_API_KEY (gratuito, console.groq.com) ou OPENAI_API_KEY no .env.
```
**Checkpoint externo** — sem `GROQ_API_KEY`/`OPENAI_API_KEY` neste sandbox, não é possível validar o
motor de IA. Precisa reexecução com credencial real.

### `setup:db:check` — detalhe real
```
Preparando o Postgres com pgvector...
  ✗ Docker indisponível: Command failed: docker ps --filter name=atlas_postgres --format "{{.Names}}"
O engine do Docker Desktop não está respondendo. Reinicie o Docker Desktop e rode este script de novo.
```
`scripts/setup-vector-db.ts` verifica exclusivamente via `docker ps` — não tem caminho alternativo
para Postgres nativo, diferente de `scripts/test/prepare-integration-env.js` (que também prefere
Docker, mas cujo requisito foi contornado manualmente nesta onda para os outros gates). Esta sessão
não tem daemon Docker disponível (`docker info` falha: "no such file or directory" no socket).
**Checkpoint externo** — o Postgres+pgvector real desta onda foi provisionado nativamente e validado
via `test:integration` (24/24 passando contra ele), então a extensão `vector` e o schema estão
comprovadamente funcionais; o que não pôde ser confirmado é especificamente o script
`setup:db:check` em si, que assume Docker. Dono sugerido: **14** (harness) — adicionar um caminho
nativo/Postgres-direto a este script evitaria essa lacuna em ambientes sem Docker no futuro.

---

## Aceite

| Critério | Status |
|---|---|
| Roster normativo sem agente inexistente | **Atendido** — GOV-001, 01A/06A/13-18 formalizados, 19/20 removidos e reatribuídos |
| Ownership sem ambiguidade | **Atendido** — reatribuição explícita de verificação contínua (14+08) e experiência real (02+03+08+14), com a ressalva de gap registrada, não escondida |
| Baseline executado | **Atendido** — tsc/lint/unit/integration/build/e2e com evidência real e 100% PASS ou PASS_WITH_NON_BLOCKING_WARNINGS; os 3 comandos que dependem de credencial externa/Docker (`verify:integrations`, `verify:ai`, `setup:db:check`) foram executados de verdade e documentados como checkpoint externo com erro real anexado, nunca como "PASS N/A" |
| Nenhum blocker histórico sem destino | **Atendido** — GOV-006, 83/83 handoffs inventariados, 1 único bloqueador real (`onda-8/09-para-08-10-dominio-producao-e-verificacao-deep-link.md`) com destino explícito (onda-13, dono 09/08/10) |
| `main` protegida | **Parcialmente verificado** — GOV-004, PR obrigatório e ao menos 1 check obrigatório confirmados por evidência real de produção (GH006); force-push e admin-bypass não confirmáveis com as ferramentas desta sessão, checkpoint externo registrado com dono sugerido (15/10) |
| `.agents/runs/onda-12.md` publicado | **Atendido** — este arquivo, mais o anexo `onda-12-handoffs.md` |

### Decisão: **APROVADA**

Todos os critérios de aceite desta onda de governança foram cumpridos com evidência real. Os dois
pontos que não fecham 100% (verificação completa de proteção de branch via API, e as 3 integrações
externas que exigem credencial/Docker) são **checkpoints externos genuínos**, não falhas do
trabalho desta onda — foram executados de verdade, produziram erro real, e ficam registrados com
dono e próximo passo explícitos, conforme a própria regra de `AGENTS.md` sobre dependência externa
impossível de provisionar localmente. Nenhum teste foi marcado como aprovado sem ter sido executado.

Pendências que sobrevivem a esta onda, todas com dono e destino (não bloqueiam a aprovação da
governança em si, mas ficam registradas para a Sprint 13 ou antes):
1. Confirmar em GitHub → Settings → Branches se "Allow force pushes" e "Do not allow bypassing the
   above settings" estão configurados, e se a lista de checks obrigatórios cobre todo o gate
   (`ci.yml`), não só `build`. Dono: 15/10.
2. Rodar `verify:integrations`/`verify:ai`/`setup:db:check` num ambiente com credenciais reais e
   Docker (produção/homologação/CI) para fechar os 3 checkpoints externos. Dono: 14/08.
3. O único bloqueador de handoff ainda aberto (deep link mobile de produção). Dono: 09/08/10,
   destino onda-13.
4. As ~16 pendências válidas sem bloqueador do inventário GOV-006, destino onda-13.

## Próximos passos sugeridos para a Onda 13

- Endereçar os itens acima na ordem de prioridade já registrada no inventário de handoffs.
- Reabrir formalmente a Fase Final 0 (rodando o gate completo pós-rotação de credenciais, conforme
  `final-fase-3.md`) e avançar a Fase Final 5 (Go-Live), hoje bloqueada só pelo item de deep link.
- Nenhuma feature nova fora do freeze de escopo (GOV-003) até a Sprint 13.

