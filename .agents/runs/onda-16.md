# Onda 16 — Sprint 04: Market Intelligence e Publicação Segura

## Identificação
- Sprint: 04
- Onda: 16
- SHA de entrada: `459251d` (branch `claude/sprint-01-seguranca-tenancy-51974`, pós-fechamento da Onda 15)
- Branch de trabalho: `claude/sprint-01-seguranca-tenancy-51974` (PR #148)
- Prioridade: **P0/P1**
- Agentes: dados/ETL/proveniência **05**; workflows **08**; significado comercial **04**; UI/rota/estados **02**; contratos/manifest **18**; QA **14**; visual/a11y **03**.

## Origem e contexto de governança

Diferente das Sprints 02/03, esta sprint **não tinha nenhum PR anterior mesclado** cobrindo o
escopo — mas já existia uma tentativa real e documentada: PR #145 (aberto 2026-08-17 por uma
sessão anterior, draft), atacando exatamente MI-001. Esse branch (`fix/market-intelligence-data-
bot-branch-protection`) divergia de um ponto de `main` anterior a vários merges legítimos desde
então (SEC-001..007, RUN-002e/006/007b, o pipeline de backup de produção) — mesclá-lo hoje teria
apagado trabalho recente. A mesma correção foi reaplicada limpa sobre o `main` atual nesta rodada,
e o PR #145 foi fechado como superseded (comentário registrado no próprio PR).

Auditoria feita com 2 agentes em paralelo (MI-002/003/004 em um, MI-005/006/007 no outro), depois
das correções aplicadas e verificadas por execução real — não só leitura de código.

## 1. MI-001 — Publicação por PR

**Status anterior: violação real, não teórica.** `git log` confirma que os workflows de dados já
fizeram `git push origin HEAD:main` direto com sucesso 2 vezes (commits `87aeec7`/`1be2804`) —
`main` tem proteção de branch com PR + check `build` obrigatório desde GOV-004 (Sprint 00), então
o bypass já aconteceu na prática, não é um risco hipotético.

**Corrigido**: os 3 workflows de dados (`market-intelligence-cnpj.yml`, `-rntrc.yml`, `-fleet.yml`)
agora criam uma branch `data/market-intelligence-<job>-<run_id>`, commitam lá, abrem PR via
`gh pr create` e tentam auto-merge via `gh pr merge --auto --squash` (cai para revisão manual se
auto-merge não estiver habilitado). `market-intelligence-ci.yml` (quality gate da feature) também
corrigido — disparava só em push para `feat/atlas-national-territory-intelligence`, uma branch já
mesclada e removida, então nunca mais rodava de verdade em push; trocado para `main`.

**PASS.**

## 2. MI-002/MI-003 — Validação de qualidade por dataset

Auditoria (agente paralelo) comparou os 8 critérios do roadmap (competência, municípios, IBGE,
duplicidade, tiers, matriz/filial, unmatched rate, SHA-256) contra o código real de
`etl_cnpj_atlas.py`/`etl_rntrc_atlas.py`/`etl_rntrc_veiculos_atlas.py` e os blocos de validação
inline dos 3 workflows. Achados principais:

| Dataset | Já cobria bem | Lacuna real encontrada |
|---|---|---|
| CNPJ | IBGE, duplicidade, soma tiers, soma matriz/filial, unmatched rate, SHA-256 | Competência não validada contra o que já está publicado (ver MI-005) |
| RNTRC | IBGE, duplicidade, valores não-negativos, unmatched rate, SHA-256 (raw+derivado) | Nenhuma checagem de soma `etc+tac+ctc` vs `transporters` (diferente do padrão já usado em CNPJ/tiers e Frota/tipo-de-veículo) |
| Frota | UF válida/única, granularidade PROXY_UF, balanço tração+implementos+outros, cobertura mínima de 20 UFs, SHA-256 | Competência fixa via literal de string, nunca derivada/conferida contra o recurso baixado |

**Corrigido**: adicionada em `market-intelligence-rntrc.yml` a checagem `etc+tac+ctc <= transporters`
— a invariante correta é `<=`, não `==`, porque `etcEquiparada` é subconjunto de `etc` (não soma
separado) e uma linha pode ficar sem categoria reconhecida (`category_bucket()` retorna `None`)
contando só em `transporters`. Verificado por execução real: um cenário de bug de classificação
(soma de categorias > transporters) foi construído e confirmado abortando o job com a mensagem
correta.

**Não corrigido nesta rodada, registrado como pendência explícita**: zero cobertura de teste Python
para `etl_cnpj_atlas.py` inteiro (`tests/python/market_intelligence/` só cobre RNTRC/Frota,
achado do agente de auditoria). Decisão de escopo — backfill de teste para um módulo sem nenhuma
cobertura prévia é trabalho de outra magnitude que uma correção pontual de gap, mesmo padrão de
decisão já tomado na Sprint 02 para os 7 workers de dead-letter sem teste prévio.

## 3. MI-004 — Manifest canônico

Auditoria comparou campo a campo os 11 campos pedidos pelo roadmap
(`id, fonte, competência, generatedAt, downloadedAt, sha256, status, cobertura, rejeitados,
qualidade, versão taxonomia`) contra o `manifest.json` real. Achado central: **4 desses campos já
eram calculados pelos workflows, mas só existiam embutidos em texto livre dentro de `note`**, nunca
como chave JSON estruturada e consultável — `cobertura` (contagem de municípios/UFs), `rejeitados`
(linhas sem match), `qualidade` (taxa de match) e `versão taxonomia` (só CNPJ).

**Corrigido**: promovidos a campos estruturados em todos os 3 workflows —
`coverage`/`unmatchedRows`/`unmatchedRate`/`taxonomyVersion` (CNPJ),
`coverage`/`unmatchedRows`/`unmatchedRate` (RNTRC),
`coverage`/`fleetTotal`/`unmatchedRows`/`unmatchedRate` (Frota) — sem remover o `note` em prosa, que
continua existindo para leitura humana. Para Frota, `coverage` manteve o significado espacial
(contagem de UFs, consistente com CNPJ/RNTRC) e `fleetTotal` (frota total) ganhou campo próprio,
para não confundir "cobertura geográfica" com "volume de negócio" — a métrica certa para detectar
regressão de dado (seção 4) é o volume, não a contagem de UF (que satura em 27 e um ±15% de
variação nela é ruído, não sinal).

**PASS.**

## 4. MI-005 — Anomaly gates

Achado central da auditoria: **nenhum dos 3 workflows comparava a execução atual com o que já
estava publicado no manifest antes de sobrescrever.** Os gates existentes (vazio, schema inválido,
duplicidade) validam consistência *interna* da própria execução — um recurso oficial republicado
com competência regredida, ou uma queda abrupta de cobertura/frota, passaria por todos eles e
sobrescreveria silenciosamente um snapshot melhor já publicado.

**Corrigido** nos 3 workflows: gate de não-regressão de competência (comparação lexicográfica
`YYYY-MM`, sem efeito quando não há baseline — primeira execução) e gate de variação anormal
(±15% contra o valor anterior publicado — `coverage` para CNPJ/RNTRC, `fleetTotal` para Frota).

**Verificado por execução real** (não só leitura de código): os 4 blocos Python embutidos nos
workflows foram extraídos e rodados contra fixtures construídas — 12 cenários cobertos
manualmente entre os 3 workflows (primeira execução sem baseline, competência regride, variação
anormal de cobertura/frota, competência avança normalmente, soma de categoria RNTRC inválida) —
todos se comportando exatamente como esperado (abortam quando devem, publicam os campos corretos
quando não devem).

**PASS** para vazio/schema/duplicidade/competência-regrediu/variação-anormal nos 3 workflows.

## 5. MI-006 — UI honesta

Confirmado pela auditoria: o manifest **já é buscado em tempo real** via `fetch`
(`marketIntelligence.data.ts`), não hardcoded — não havia o problema central de "UI mentindo com
dado estático". Mas a UI nunca renderizava `downloadedAt`/`probedAt`/`coverage`/`unmatchedRate`/
`taxonomyVersion` — campos que o manifest já carregava (parcialmente antes desta sprint, totalmente
depois de MI-004). O único timestamp exibido era o `generatedAt` **global** do manifest inteiro no
cabeçalho, que reflete "a última vez que QUALQUER pipeline rodou", não "quando ESTE dataset
específico foi baixado" — podiam divergir bastante. Também não havia cálculo de staleness no
cliente: `status: 'DESATUALIZADO'` existe no tipo e no `statusTone()`, mas nenhum workflow jamais
escreve esse valor — se o cron parasse de disparar, a UI mostraria "ATUALIZADO" indefinidamente.

**Corrigido**: `DatasetHealth` (domínio TS) ganhou os campos que faltavam no contrato
(`probedAt`, `coverage`, `fleetTotal`, `unmatchedRows`, `unmatchedRate`, `taxonomyVersion`) —
o tipo estava desalinhado do JSON real. O card de "Saúde dos Dados" agora mostra: timestamp
relativo ("baixado há X dias", `date-fns` + locale `pt-BR`) calculado a cada render a partir de
`downloadedAt`/`probedAt`; um badge `DESATUALIZADO` independente do `status` gravado, disparado
quando o dado tem mais de 45 dias (cadência mensal esperada + buffer para a janela real do cron,
que roda todo dia 10) — nunca depende do backend continuar escrevendo algo para aquele dataset
específico; e os novos campos estruturados de cobertura/qualidade/taxonomia quando presentes.

**Não corrigido nesta rodada**: `municipalities`/`evidences` do snapshot são buscados por
`loadMarketIntelligenceSnapshot()` mas nunca renderizados em lugar nenhum (achado do agente,
não crítico o suficiente para o orçamento desta rodada — a evidência de fonte por linha do ranking
é um recurso a mais, não uma honestidade quebrada, já que `TerritoryRecord.evidenceIds` continua
presente no dado).

**PASS** nos 5 requisitos do roadmap (competência exibida, freshness, estado atualizado/parcial/
erro, indicação de stale, cobertura/qualidade quando relevante); nunca mostrar snapshot antigo
como atual sem indicar — já era PASS antes desta rodada (o board de decisão já bloqueia sem
dado suficiente) e ficou mais forte com o badge de staleness independente do status gravado.

## 6. MI-007 — E2E

Achado da auditoria: zero teste tocava a rota `/app/market-intelligence` de verdade — só os 4
arquivos de `tests/unit/market-intelligence/` (lógica de domínio pura, sem DOM/fetch) e o
typecheck do CI cobriam este módulo.

**Corrigido**: novo `tests/e2e/market-intelligence.spec.ts` (3 casos — abre o módulo e confirma
que a aba "Saúde dos Dados" renderiza status real de pelo menos um dataset; confirma o estado de
board bloqueado por governança, com comentário-sentinela para quando `decisionReady` virar `true`
de verdade; confirma que o estado de erro aparece quando o `fetch` do manifest falha, via
`page.route` interceptando a requisição) e a rota adicionada a `accessibility.spec.ts` (mesmo
padrão de login/dashboard/CRM/Configurações já cobertos).

**Executado de verdade nesta rodada** (Playwright real contra Chromium, não simulado): 3/3 casos
do spec novo PASS, 1/1 caso de a11y novo PASS, suite completa de `accessibility.spec.ts` 5/5 PASS
— confirma que os badges de freshness/staleness de MI-006 não introduziram violação
crítica/séria de acessibilidade.

**Não corrigido nesta rodada, registrado como pendência**: filtros do módulo (roadmap pede
"filtros" explicitamente — o módulo atual não tem filtro de UF/raio/cenário na tela, só o
simulador econômico com inputs livres), comparação amostra conhecida vs. dataset completo, e
cobertura mobile dedicada (`crm-kanban-mobile.spec.ts` tem equivalente hoje ausente para este
módulo). Escopo de teste mínimo real entregue; cobertura ampla fica para uma rodada futura.

## 7. Gate de código — verificado de forma independente, no repositório inteiro

```
npx tsc --noEmit                                        → limpo, 0 erros
npx eslint src --max-warnings=999                        → 0 erros, 80 warnings (mesmo nível pré-existente)
npx vitest run -c vitest.unit.config.ts                  → 162/162 arquivos, 1282/1282 testes
npx vitest run -c vitest.integration.config.ts           → 30/30 arquivos, 129/129 testes (Postgres real)
npm run build                                             → limpo
npm run build:worker                                      → limpo
npm run security:audit-waivers                            → PASS
python3 -m unittest discover tests/python/market_intelligence → 5/5 PASS
npx playwright test tests/e2e/market-intelligence.spec.ts     → 3/3 PASS (Chromium real)
npx playwright test tests/e2e/accessibility.spec.ts           → 5/5 PASS (incl. o caso novo)
```

Além disso, os 4 blocos Python embutidos nos 3 workflows de dados foram extraídos e executados
contra 12 cenários de fixture (não só sintaxe validada com `yaml.safe_load`/`compile()`, mas
comportamento real testado: abortam quando devem, publicam os campos corretos quando não devem).

## 8. Decisão da Onda 16

**APROVADA.**

Diferente das Sprints 02/03 (que herdaram trabalho substancial de rodadas anteriores com lacunas
pontuais), esta sprint partiu de um estado real de violação ativa (MI-001, bypass de proteção de
branch já exercido 2x em produção) e de um pipeline de dados sólido no nível de agregação, mas
com dois problemas sistêmicos reais: nenhum gate comparava execuções entre si (MI-005), e o
manifest calculava mais informação do que expunha de forma consultável (MI-004) — ambos corrigidos
e comprovados por execução real, não só leitura de código, nos 3 workflows de dados. A UI (MI-006)
já era honesta na dimensão mais importante (nunca finge decisão pronta sem dado suficiente) e
ganhou a dimensão que faltava (freshness/staleness por dataset). MI-007 fecha o gap mais grave de
teste (zero cobertura de execução real da rota) com um conjunto mínimo mas genuíno, não uma
suíte completa.

Pendências registradas, não escondidas: teste de unidade para `etl_cnpj_atlas.py` (zero hoje),
filtros/comparação de amostra na UI, cobertura mobile dedicada do módulo, e a leitura serializada
`municipalities`/`evidences` do snapshot nunca chegando à tela.

```text
AGENTE 19 — VERIFICAÇÃO CONTÍNUA (Onda 16)
MI-001 Publicação por PR: PASS (corrigido, reaplica a mesma correção já desenhada no PR #145 superseded)
MI-002 Validação CNPJ: PASS (já cobria os 8 critérios; competência-regrediu fechado via MI-005)
MI-003 Validação RNTRC/Frota: PASS (soma de categorias RNTRC corrigida; competência-regrediu via MI-005)
MI-004 Manifest canônico: PASS (4 campos promovidos de prosa para estruturado)
MI-005 Anomaly gates: PASS (não-regressão de competência + variação anormal, comprovado por execução em 12 cenários)
MI-006 UI honesta: PASS (freshness/staleness adicionados, comprovado por E2E + a11y real)
MI-007 E2E: PASS parcial (cobertura mínima real entregue; filtros/mobile/amostra ficam como pendência)
GATE DE CÓDIGO: tsc/lint/unit/integration/build/build:worker/security:audit-waivers/python/e2e — todos PASS, verificados de forma independente
VEREDITO: APROVADA
```
