# Cockpit Comercial Executivo

Documentação do que foi implementado na tarefa "Cockpit Comercial Executivo" (ver
`AUDITORIA_ESTADO_ATUAL.md` para o mapeamento geral do projeto). O Cockpit é uma
nova visão dentro da mesma ferramenta client-side (`Relatorios AtlasGR.html`),
não um projeto novo, e não removeu nenhuma funcionalidade existente.

Arquivos alterados/criados:
- `js/cockpit.js` (novo) — toda a lógica do Cockpit.
- `Relatorios AtlasGR.html` — nova seção `#cockpit-executivo` (landing), nav
  reorganizada em 4 áreas, modal de drill-down, `<script src="js/cockpit.js">`.
- `css/styles.css` — estilos do Cockpit (bloco final do arquivo).
- `js/app.js` — chama `iniciarCockpitExecutivo()` no boot.

## Navegação reorganizada

A `quick-nav` do topo passou a ter 4 grupos visuais (mesmos links de antes,
nenhum removido): **Cockpit Executivo**, **Relatórios Comerciais** (Forecast
semanal, Central de Inteligência v10, Catálogo), **SDR & Operação** (Diário
SDR, Análise SDR, Jornada) e **Extração & Diagnóstico** (wizard passos 1–8).
O Cockpit passou a ser a primeira seção da página (`<main>`), antes do
wizard de extração manual — a "nova tela inicial" pedida, sem excluir o
acesso às telas antigas.

## Indicadores implementados

Todos os blocos abaixo usam **somente** negócios do funil Comercial
(`CATEGORY_ID=0`), obtidos via `baseDealsCatalogo(webhook, true)` — mesma
função usada pelos relatórios `pipeline_coverage`, `performance_vendedores`
etc. do catálogo (`js/catalogo-relatorios.js:6`). Cada negócio é enriquecido
por `enriquecerDealCatalogo` (`js/catalogo-relatorios.js:22`), que já calcula
`_SEMANTICA`, `_ESTAGIO`, `_CLIENTE`, `_RESPONSAVEL`, `_VALOR`, `_FECHAMENTO`
e `_CICLO` — o Cockpit não recalcula essas fórmulas, só as consome.

### 1. Resultado do Mês (`cockpitCalcular`, `js/cockpit.js:257`, bloco A)
- **Fonte**: negócios com `_SEMANTICA==="success"` e `_FECHAMENTO` dentro do
  **mês-calendário atual** (`cockpitMesAtual`, `js/cockpit.js:238` — mesma
  convenção do Forecast semanal, que também sempre olha o mês atual
  independente do período filtrado, ver `js/forecast.js:303-307`).
- **Meta New MRR**: campo editável `#cockpitMetaMensal`, pré-preenchido por
  `metaMensalPadrao()` (`js/config.js:289`, tabela `METAS_FORECAST_MENSAL_PADRAO`).
- **Fechado** = soma de `_VALOR` dos ganhos do mês.
- **% da Meta** = `Fechado / Meta × 100` (uma casa decimal). "não disponível"
  se meta não informada.
- **Gap** = `max(0, Meta − Fechado)`.
- **Negócios ganhos** = contagem.
- **Ticket médio** = `Fechado / Negócios ganhos`.

### 2. Forecast (`js/cockpit.js`, bloco B)
- **Fonte**: negócios abertos (`_SEMANTICA==="process"`), **excluindo
  estágios "Piloto"** (`ehEstagioPiloto`, `js/jornada.js:421`), com
  `CLOSEDATE` dentro do mês atual.
- **Probabilidade**: reaproveita exatamente `probabilidadeFallbackForecast`
  (`js/jornada.js:437`) via o helper `cockpitClassificarAberto`
  (`js/cockpit.js`) — mesma fonte de probabilidade do Forecast semanal/mensal.
- **Classificação de bucket (Commit/Best Case/Pipeline/Upside)**: usa
  `cockpitClassificarBucketForecast` — thresholds **próprios do Cockpit**
  (70%/40%/10%), **não** a `classificarBucketForecast` compartilhada
  (`js/jornada.js:448`, thresholds 80%/50%, sem tier "Upside") usada pelo
  Forecast Semanal (`js/forecast.js`) e pelo relatório "Forecast Mensal" do
  Catálogo (`js/catalogo-relatorios.js`). Ver "Convergência com a Central de
  Inteligência Comercial" abaixo para o motivo.
- **Commit / Best Case** = soma de `_VALOR` **em valor cheio** (não ponderado).
- **Pipeline** = soma de `_VALOR` (bruto) **e** soma de `_VALOR × probabilidade
  / 100` (ponderado) — só o ponderado entra no Forecast total.
- **Upside** = soma de `_VALOR` (probabilidade <10%) — mostrado só como
  referência, **não entra no Forecast total** (nem cheio, nem ponderado).
- **Forecast total do mês** = Fechado do mês + Commit (cheio) + Best Case
  (cheio) + Pipeline (ponderado).
- **Gap do Forecast** = `max(0, Meta − Forecast total)`.
- O aviso fixo no bloco "Saúde do Pipeline" (`#cockpitAvisoPipelineForecast`)
  deixa explícito que **Pipeline Total não é o mesmo número que aparece
  aqui como previsão** — requisito P0 do escopo.

### 3. Saúde do Pipeline (bloco C)
- **Pipeline Total** = soma de `_VALOR` de todos os negócios abertos do
  Comercial (inclui estágios "Piloto" — é o valor bruto do funil, não uma
  previsão).
- **Pipeline Elegível** = negócios abertos que passam em **todos** os
  critérios de `cockpitVerificarElegibilidade` (aberto/não-Piloto, valor>0,
  `CLOSEDATE` preenchido, `ASSIGNED_BY_ID` preenchido, aging na etapa atual
  ≤45 dias — ver "Convergência com a Central" abaixo), **mais** o filtro de
  período já existente neste projeto: `CLOSEDATE` dentro do **período
  selecionado no filtro** (`cockpitPeriodoFiltro`, `js/cockpit.js` — usa
  `calcularIntervaloPreset`, `js/bitrix-api.js:119`). Se nenhum período
  estiver selecionado, cai no mês atual. O filtro de período é uma decisão
  de arquitetura própria deste Cockpit (não vem da Central).
- **Pipeline inelegível** (novo) = contagem/lista dos negócios abertos que
  falham em pelo menos um dos 5 critérios aplicados (independente do
  período) — o drill-down mostra o(s) motivo(s) de cada um (ex.: "Sem
  responsável", "Aging acima do crítico (52d > 45d)").
- **Coverage atual** = `Pipeline Elegível ÷ Gap da meta` (não ÷ meta cheia).
  Se o Gap for zero, mostra "meta batida"; se a meta não foi informada,
  mostra "não disponível".
- **Coverage recomendado** (novo) = `1 ÷ (Win Rate histórico do período
  filtrado / 100)` — ver "Convergência com a Central" abaixo. Mostrado ao
  lado do Coverage atual, "não disponível" se o Win Rate não for calculável.
- **Pipeline criado no período** = soma de `_VALOR` dos negócios cujo
  `DATE_CREATE` cai no período filtrado.
- **Ticket médio do pipeline** = `Pipeline Total ÷ quantidade de negócios abertos`.

### 4. Proteção de Receita M / M+1 / M+2 / M+3 (bloco D)
- Para cada um dos 4 meses (atual + 3 seguintes): Meta (campo editável,
  pré-preenchida por `metaMensalPadrao` do mês correspondente), Pipeline
  Elegível daquele mês (mesma regra de "aberto + não-Piloto + `CLOSEDATE` no
  mês"; **não** reaplica os 5 critérios completos de elegibilidade do item 3
  — só o recorte histórico de "aberto/não-Piloto/CLOSEDATE no mês", para não
  alterar o comportamento já existente desta tabela específica), Coverage
  (`Pipeline ÷ Meta`), Status (chão fixo) e Recomendado (Win Rate).
- **Threshold de status — "chão fixo"** (`cockpitStatusProtecao`):
  `<2x` = crítico, `2x–3x` = atenção, `≥3x` = saudável. **Critério inicial e
  configurável**, documentado em comentário no código — não é uma regra de
  negócio fixa acordada com a diretoria, só um ponto de partida razoável.
  Continua exibido (não foi removido).
- **Recomendado (Win Rate)** (novo) = mesmo `coverageRecomendado` do bloco 3
  (`1 ÷ Win Rate/100` do período filtrado), repetido nas 4 linhas — é um
  único Win Rate por carregamento, não um por mês. "não disponível" quando o
  Win Rate não é calculável.

## Convergência de fórmulas com a Central de Inteligência Comercial

Auditoria (comparação lado a lado entre este Cockpit e o "Comercial
Inteligente" do projeto `CENTRAL-DE-INTELIGENCIA-COMECIAL-ATLASGR`, que tem
testes unitários dedicados — `forecastEngine.unit.test.ts`,
`pipelineEligibility.unit.test.ts`) encontrou 3 divergências, resolvidas
adotando a fórmula da Central como oficial. A lógica foi **reimplementada em
JavaScript vanilla** (sem import/export, no padrão já existente deste
arquivo) — nenhum código React foi copiado.

### Divergência 1 — Forecast total
- **Fonte de verdade**: `forecastEngine.ts` (`FORECAST_RULES`) e
  `CommercialIntelligenceUseCases.executiveOverview` da Central.
- **Fórmula antiga (`js/cockpit.js`, bloco B)**: todo o pipeline aberto do
  mês — Commit, Best Case e Pipeline juntos — entrava ponderado por
  probabilidade (`ponderado += valor × prob/100` para todos os buckets).
  `ForecastTotal = Fechado + Ponderado(tudo)`.
- **Fórmula nova**: Commit e Best Case entram em **valor cheio**; só o tier
  "Pipeline" entra ponderado; o novo tier "Upside" (probabilidade <10%,
  antes misturado dentro de "Pipeline") **não entra** no forecast total.
  `ForecastTotal = Fechado + Commit(bruto) + BestCase(bruto) +
  Pipeline(ponderado)`. Thresholds de bucket: Commit ≥70%, Best Case ≥40%,
  Pipeline ≥10%, Upside <10%.
- **Implementação**: nova função `cockpitClassificarBucketForecast`
  (`js/cockpit.js`), **isolada** da `classificarBucketForecast` compartilhada
  de `js/jornada.js` (thresholds 80%/50%, sem "Upside") — essa função
  compartilhada continua intocada e continua sendo a fonte de verdade do
  Forecast Semanal (`js/forecast.js`) e do "Forecast Mensal" do Catálogo
  (`js/catalogo-relatorios.js`), que não fizeram parte desta convergência e
  não podiam ter seu comportamento alterado.
- Convergido com a fórmula testada da Central de Inteligência Comercial (ver
  auditoria de comparação).

### Divergência 2 — Pipeline Elegível
- **Fonte de verdade**: `pipelineEligibility.ts` (`checkEligibility`) da
  Central, validado por `pipelineEligibility.unit.test.ts`.
- **Fórmula antiga (`js/cockpit.js`, bloco C)**: um negócio era "elegível" se
  estivesse aberto, fora de estágio "Piloto" e com `CLOSEDATE` dentro do
  período do filtro — só 3 critérios.
- **Fórmula nova**: um negócio só é elegível se **todos** os critérios forem
  verdadeiros — (1) aberto, (2) valor > 0, (3) `CLOSEDATE` preenchido, (4)
  responsável (`ASSIGNED_BY_ID`) preenchido, (5) aging na etapa atual ≤45
  dias (`MOVED_TIME`) — **mais** o filtro de período que já existia neste
  projeto.
- **Limitação documentada**: a Central também exige (6) "próxima ação
  preenchida" — este projeto **não extrai** nenhum campo de próxima
  ação/atividade agendada para negócios (`crm.deal.list` não busca esse
  campo hoje, ver `ENTIDADES` em `js/config.js` e `enriquecerDealCatalogo`
  em `js/catalogo-relatorios.js`). Esse critério **não foi implementado**
  para não fabricar um dado inexistente — **o Pipeline Elegível deste
  projeto é mais permissivo que o da Central nesse ponto específico**. Os
  outros 5 critérios foram implementados fielmente, incluindo o mesmo
  threshold de aging crítico (45 dias) da Central
  (`STAGE_AGING_CRITICAL_DAYS`).
- **Drill-down**: o card "Pipeline inelegível (com motivo)" abre uma lista
  com o(s) motivo(s) de reprovação de cada negócio (`cockpitVerificarElegibilidade`).
- Convergido com a fórmula testada da Central de Inteligência Comercial (ver
  auditoria de comparação).

### Divergência 3 — Coverage recomendado
- **Fonte de verdade**: `CommercialIntelligenceUseCases.ts`
  (`coverageRecommended = 1 / (winRate/100)`) da Central.
- **Fórmula antiga (`js/cockpit.js`, `cockpitStatusProtecao`)**: threshold
  fixo hardcoded — `<2x` crítico, `2x–3x` atenção, `≥3x` saudável —
  documentado como "não validado com a diretoria".
- **Fórmula nova**: adicionado `coverageRecomendado = 1 ÷ (Win Rate
  histórico do período filtrado / 100)`, calculado a partir do Win Rate já
  calculado no bloco Eficiência da Máquina. Exibido **ao lado** do threshold
  fixo (ex.: "Coverage atual: 2,10x · recomendado (Win Rate histórico):
  2,80x"), sem remover o semáforo fixo existente — ele continua útil como um
  "chão" mínimo simples. Se o Win Rate for `null`/não calculável, mostra
  "não disponível" para o recomendado, mantendo só o threshold fixo.
- Convergido com a fórmula testada da Central de Inteligência Comercial (ver
  auditoria de comparação).

### 5. Pipeline por Estágio (bloco G, `js/cockpit.js:339-354`)
- Agrupa **todos** os negócios abertos do Comercial (inclui "Piloto", para
  mostrar o funil completo) por `_ESTAGIO`.
- Por estágio: quantidade, soma de valor, % do total, e **aging médio** —
  média de dias entre `MOVED_TIME` e a data de referência, mesma lógica de
  aging usada em `aging_sla` (`js/catalogo-relatorios.js:169-176`). Estágios
  sem `MOVED_TIME` preenchido ficam com aging "não disponível" (não entram
  na média, mas contam na quantidade/valor).
- Clique no estágio abre o drill-down com os negócios daquele estágio.

### 6. Eficiência da Máquina (bloco F, `js/cockpit.js:325-336`)
- **Fonte**: negócios fechados (`_SEMANTICA!=="process"`) com `_FECHAMENTO`
  dentro do período filtrado — mesmo recorte do relatório
  `ganhos_perdas_ciclo` (`js/catalogo-relatorios.js:190-196`).
- **Win Rate** = `Ganhos / (Ganhos + Perdidos) × 100`. "não disponível" se
  não houver nenhum fechamento no período.
- **Ticket médio vendido** = receita ganha ÷ quantidade de ganhos.
- **Sales Cycle** = média e mediana de `_CICLO` (dias entre `DATE_CREATE` e
  a data de fechamento, `cicloDealDias`, `js/jornada.js:508`) só dos ganhos
  com as duas datas preenchidas. O tamanho da amostra é mostrado
  explicitamente na nota abaixo do bloco.

### 7. Geração de Pipeline (bloco H, `cockpitCalcularGeracaoPipeline`, `js/cockpit.js`)
- **Pipeline criado no período** = soma de `_VALOR` dos negócios (do funil Comercial,
  filtrados por vendedor/origem) cujo `DATE_CREATE` cai no período selecionado
  (mesmo período usado em "Pipeline criado no período" da Saúde do Pipeline).
  Inclui estágios "Piloto" (mede geração bruta, não elegibilidade de fechamento).
- **Pipeline necessário** — **hipótese matemática documentada, não uma regra
  validada com a diretoria**: `Meta M+1 ÷ (Win Rate / 100)`. Usa a Meta M+1
  (campo `#cockpitMetaM1`, já existente no bloco Proteção de Receita) porque
  pipeline criado hoje tipicamente fecha em meses futuros, e reaproveita o
  Win Rate calculado no bloco Eficiência da Máquina (não recalcula). Se Meta
  M+1 ou Win Rate não estiverem disponíveis, o valor é "não disponível".
- **Gap de geração** = `max(0, necessário − criado)`.
- **Creation Coverage** = `criado ÷ necessário` (%).
- **Pipeline Creation Pace**: compara dias úteis decorridos no mês atual
  contra o total de dias úteis do mês (`ehDiaUtilISO`, reaproveitado de
  `js/sdr.js`) para calcular quanto de pipeline necessário já deveria ter
  sido criado até hoje (`esperado até hoje = necessário × decorridos/total`),
  o gap contra o que foi realmente criado, e o ritmo em % (`criado ÷
  esperado × 100`).

### 8. SDR — resumo executivo (bloco I, `cockpitCalcularResumoSdr`, `js/cockpit.js`)
- Bloco compacto, **não substitui** os relatórios completos de SDR
  (`js/sdr.js`: Diário SDR e Análise SDR), que continuam acessíveis por
  links diretos no próprio bloco do Cockpit.
- **Negócios originados de Lead** (proxy de "pipeline qualificado por SDR")
  = negócios criados no período com `LEAD_ID` válido (campo já presente em
  `baseDealsCatalogo`, `js/catalogo-relatorios.js:13`) — indica que o
  negócio passou pela etapa de qualificação de Lead antes de virar
  oportunidade, mas **não identifica qual SDR fez a qualificação** (isso
  exigiria buscar o Lead original e seu `ASSIGNED_BY_ID`, uma chamada N+1
  fora do escopo deste resumo).
- **Limitação documentada explicitamente na UI**: "Leads trabalhados" e
  "Reuniões agendadas/realizadas" mostram **"não disponível"** porque o
  Cockpit só extrai negócios (`CATEGORY_ID=0`), não Leads nem atividades —
  esses dados só existem na extração específica de `js/sdr.js`
  (`extrairDiarioSDR`/`extrairAnaliseSDR`), que faz chamadas dedicadas a
  `crm.lead.list` e `crm.activity.list` por usuário SDR configurado.

### 9. Qualidade dos Dados (CRM) — Data Quality Score (bloco J, `cockpitCalcularQualidadeDados`, `js/cockpit.js`)
- **Nunca chamar de "Forecast Confidence" ou similar** — é só completude de
  cadastro no CRM, sem nenhuma relação com `PROBABILITY`/bucket de forecast.
  Documentado em comentário no código, acima da função.
- Base: negócios abertos do filtro atual (se não houver nenhum aberto, cai
  para todos os filtrados).
- Completude calculada por campo (% de negócios com o campo preenchido):
  **Valor** (`OPPORTUNITY > 0`), **Responsável** (`ASSIGNED_BY_ID` válido),
  **Estágio** (`STAGE_ID` preenchido), **CLOSEDATE** (data válida), **Origem**
  (`SOURCE_ID` preenchido).
- **Motivo de perda** — **limitação conhecida**: não existe, em nenhum lugar
  do projeto (`js/config.js`, `js/catalogo-relatorios.js`, `js/forecast.js`),
  um campo mapeado para motivo de perda (nem `UF_CRM_*` customizado, nem
  nativo do Bitrix). Por isso este indicador é sempre **"0% informado"**
  para negócios perdidos no período — não foi inventado nenhum campo novo.
- **Data Quality Score** = média simples das % de completude dos campos
  acima (motivo de perda **não entra** nessa média, porque não é um campo
  disponível para calcular — entraria só se um campo real existisse).

### 10. Alertas Gerenciais (seção 28, `cockpitCalcularAlertas`, `js/cockpit.js`)
- Renderizado no topo do Cockpit, logo abaixo do cabeçalho/filtros, em
  `#cockpitAlertas` (`cockpitRenderAlertas`). Cada alerta tem nível (🔴
  crítico / 🟡 atenção / 🟢 positivo), motivo, valor/quantidade e uma ação
  sugerida em texto; alertas ordenados crítico → atenção → positivo.
- **Não recalcula nenhuma fórmula de negócio** — só lê thresholds sobre o que
  `cockpitCalcular()` e `cockpitCalcularGeracaoPipeline()` já calcularam.
- Clique em um alerta abre o drill-down (`cockpitAbrirDrill`) quando há uma
  lista de negócios associada, ou rola a tela até o bloco relacionado
  (`cockpitAlertaClique`) — implementado como `data`/`onclick` gerados em
  `cockpitRenderAlertas`.
- **Regras implementadas**:
  1. Coverage do mês corrente crítico/atenção — reaproveita
     `c.saude.coverage` e o **mesmo threshold 2x/3x** de Proteção de Receita
     (`cockpitStatusProtecao`).
  2. Oportunidades abertas com `CLOSEDATE` vencida (no passado) — soma valor
     e conta quantidade, a partir de `c.deals` (`_SEMANTICA`/`_VALOR` já
     calculados).
  3. Aging alto por estágio — reaproveita `agingMedio` já calculado no bloco
     Pipeline por Estágio; dispara quando `agingMedio > ALERTA_AGING_ALTO_DIAS`
     (constante = 45 dias, **critério inicial/configurável, não é uma meta
     validada com a diretoria** — mesmo espírito do threshold 2x/3x).
  4. Pipeline criado abaixo do necessário / ritmo de criação atrasado —
     reaproveita `g.creationCoverage` e `g.paceRitmoPct` do bloco Geração de
     Pipeline, sem recalcular.
  5. Coverage de M+1 em risco — reaproveita `c.protecao[1]` (mesmo status já
     calculado na tabela de Proteção de Receita).
- **Regra descartada (não implementada) e o motivo**: "Win Rate acima ou
  abaixo da média histórica" — o Cockpit e o restante do projeto
  (`js/forecast.js`, `js/catalogo-relatorios.js`) **não armazenam nenhum
  histórico de Win Rate** entre sessões ou períodos anteriores; cada
  carregamento recalcula o Win Rate só do período filtrado atual. Sem uma
  série histórica real para comparar, qualquer "média" seria inventada — por
  isso esse alerta não foi implementado.

### 11. "⚡ Situação Comercial Agora" (`cockpitGerarSituacaoAgora`, `js/cockpit.js`)
- Botão no cabeçalho do Cockpit ("⚡ Gerar Situação Agora"), ao lado de
  "↻ Atualizar agora". Abre um modal compacto (reaproveita a mesma estrutura
  visual `.help-modal`/`.help-dialog` do modal de ajuda e do drill-down) com
  um resumo de uma tela só.
- **Não reprocessa nada nem chama o Bitrix de novo**: lê de
  `cockpitState.ultimoCalculo`, um cache preenchido ao final de
  `renderizarCockpit()` com o resultado já calculado de `cockpitCalcular()`
  (`c`), `cockpitCalcularGeracaoPipeline()` (`g`), resumo de SDR (`s`),
  qualidade de dados (`q`) e os alertas (`alertasInfo`) daquele render. Se o
  Cockpit ainda não foi carregado nesta sessão (`↻ Atualizar agora` nunca
  clicado), mostra erro pedindo para atualizar antes.
- Campos exibidos: Meta do mês, Fechado, % da Meta, Forecast total do mês,
  Gap do Forecast, Commit, Best Case, Pipeline Total, Pipeline Elegível,
  Coverage, Pipeline criado no período, Win Rate, Sales Cycle (média),
  Oportunidades abertas (`c.saude.qtdAberto`) e Oportunidades em risco —
  união (sem duplicar) dos negócios com `CLOSEDATE` vencida e dos negócios em
  estágios com aging alto (as duas listas usadas pelos Alertas Gerenciais).
  Cada campo ausente mostra "não disponível", nunca zero.
- Logo abaixo, a lista completa de Alertas Gerenciais daquele momento
  (mesma renderização visual do bloco principal, via
  `cockpitRenderAlertasEm`).
- **Copiar/baixar**: reaproveita o mesmo padrão já usado em
  `js/exportacoes.js` (`copiarPromptIA`/`baixarPromptIA` — `navigator.clipboard.writeText`
  e o helper genérico `baixarArquivo`, `js/config.js:379`) — não foi criado
  nenhum mecanismo novo de exportação. Botões "Copiar como texto"
  (`cockpitCopiarSituacao`) e "Baixar .txt" (`cockpitBaixarSituacao`) atuam
  sobre o mesmo texto plano montado em `cockpitGerarSituacaoAgora` (guardado
  num `<pre>` oculto, `#cockpitSituacaoTexto`).

## Exportações do Cockpit (`js/cockpit.js`, funções `cockpit*Export*`/`cockpit*RelatorioExecutivo*`)

Botões no cabeçalho do Cockpit, ao lado de "↻ Atualizar agora" e "⚡ Gerar
Situação Agora": **🌐 Abrir HTML**, **⬇️ Baixar HTML**, **⬇️ CSV**,
**⬇️ JSON**, **📄 Gerar Relatório Executivo Completo** e **⬇️ Baixar Relatório
Executivo**. Todas exigem que o Cockpit já tenha sido carregado nesta sessão
(`cockpitState.ultimoCalculo` preenchido por `renderizarCockpit()`); senão
mostram erro pedindo para clicar em "↻ Atualizar agora" antes — **nenhuma
exportação chama o Bitrix de novo nem recalcula fórmula alguma**, só
serializa o que já está na tela.

- **HTML autônomo do Cockpit** (`cockpitGerarHTMLExport(false)`,
  `cockpitAbrirHTMLExport`/`cockpitBaixarHTMLExport`) — reaproveita o mesmo
  CSS/logo/letterhead usados no modelo visual do Forecast
  (`MODELO_EXECUTIVO_CSS`/`MODELO_EXECUTIVO_LOGO`, `js/forecast.js`) e o
  padrão `abrirHtmlEmNovaAba`/`baixarArquivo` já existente. Mostra os KPIs de
  Resultado do Mês, Forecast, Saúde do Pipeline, Eficiência da Máquina,
  Alertas Gerenciais, Proteção de Receita, Pipeline por Estágio, Geração de
  Pipeline, SDR e Qualidade dos Dados — todos os blocos com indicadores
  numéricos do Cockpit. Funciona sozinho após baixado (sem servidor).
- **CSV** (`cockpitExportarCSV`) — uma linha por indicador, colunas
  `bloco;indicador;valor;unidade`, reaproveitando `linhasCSVDe`/`baixarArquivo`
  de `js/exportacoes.js`. A lista de campos vem de
  `cockpitListaKpisExport(cache)`, a mesma função usada para montar os cards
  do HTML exportado (uma única fonte de verdade para os dois formatos).
- **JSON** (`cockpitExportarJSON`) — baixa `cockpitState.ultimoCalculo`
  completo (`{c, g, s, q, alertasInfo}`, a mesma estrutura interna calculada
  por `cockpitCalcular`/`cockpitCalcularGeracaoPipeline`/
  `cockpitCalcularResumoSdr`/`cockpitCalcularQualidadeDados`/
  `cockpitCalcularAlertas`), envolvida num objeto com `gerado_em` e
  `periodo_filtro`. Não é uma reextração — é o cache interno já calculado.
- **Relatório Executivo Completo** (`cockpitGerarHTMLExport(true)`,
  `cockpitAbrirRelatorioExecutivo`/`cockpitBaixarRelatorioExecutivo`) — HTML
  mais longo, com os mesmos blocos do export resumido **mais** uma seção
  final "Outras análises" que **linka para os relatórios que já existem no
  projeto** (Catálogo de Relatórios para Origem/Produtos/Clientes/aging-SLA,
  Análise SDR/Diário SDR, Forecast semanal) em vez de fabricar uma seção
  vazia — o Cockpit não agrega esses dados numa estrutura própria hoje, então
  não foi inventado nenhum cálculo novo só para preencher o relatório.

### Limitações das exportações

1. **O que NÃO é incluído**: o webhook/credencial do Bitrix nunca é escrito
   em nenhum HTML/CSV/JSON exportado (as funções de exportação nem leem o
   campo `#webhook`); nenhuma lista de negócios individuais (drill-down) é
   exportada — só os KPIs agregados. Para exportar os negócios por trás de um
   KPI, use o drill-down na tela (clique no card) e, se precisar de um
   arquivo, use as exportações já existentes do Catálogo/Forecast/SDR.
2. **Snapshot, não relatório ao vivo**: os arquivos exportados refletem o
   momento do último "↻ Atualizar agora" — se os dados do Bitrix mudarem
   depois, é preciso atualizar o Cockpit e exportar de novo.
3. **Relatório Executivo Completo não inclui Origem/Produtos/Clientes como
   seção de dados** — decisão deliberada (ver comentário acima) para não
   fabricar uma seção com dados que o Cockpit não calcula; em vez disso,
   linka para as telas que já calculam isso na mesma ferramenta.
4. **CSV cobre só os cards de KPI**, não a tabela completa de Pipeline por
   Estágio com aging por linha nem a tabela de Proteção de Receita com todas
   as colunas — os valores principais de cada uma aparecem como linhas do
   CSV (ex.: uma linha por estágio, uma linha por mês de Proteção de
   Receita), mas formatação tabular rica fica só no HTML/tela.

## Drill-down (requisito 9)

Toda métrica numérica relevante tem `data-drill` associado a uma lista de
negócios guardada em `cockpitDrill` (populada dentro de `cockpitCalcular`).
Clicar no card/linha chama `cockpitAbrirDrill(chave, titulo)`, que abre um
modal (reaproveitando a mesma estrutura visual do modal de ajuda já
existente, `#helpModal`) com a tabela via `tabelaRelatorio`
(`js/jornada.js:482`): Empresa/Cliente, Valor, Etapa, Vendedor, CLOSEDATE.
O drill-down `pipelineInelegivel` ("Pipeline inelegível") ganha uma coluna
extra, "Motivo(s) de inelegibilidade", com o(s) critério(s) reprovado(s) de
cada negócio (ver `cockpitVerificarElegibilidade`).

## Filtros

- **Período**: presets rápidos (mensal/semana atual/trimestral/todas/
  personalizado) reaproveitando `calcularIntervaloPreset`.
- **Vendedor**: `carregarVendedoresCockpit()` busca `user.get` (mesmo padrão
  de `carregarVendedores`, `js/bitrix-api.js:355`), popula `#cockpitVendedor`;
  a troca de vendedor **não refaz a chamada ao Bitrix** — só refiltra o
  cache local (`cockpitReaplicarFiltros`).
- **Origem**: `carregarOrigensCockpit()` usa `mapaOrigensRelatorio`
  (`js/catalogo-relatorios.js:1`), mesmo padrão de origem do catálogo.
- **Produto**: **limitação conhecida** — o Bitrix não tem filtro de produto
  em `crm.deal.list`; produtos só são obtidos via `crm.deal.productrows.get`
  **por negócio** (N+1, já sinalizado como gargalo de performance na
  auditoria, seção 14). Para não pagar esse custo em todo carregamento do
  Cockpit, o filtro de produto é opt-in: só dispara buscas quando o usuário
  digita um termo, e só sobre os negócios já carregados na tela (não refaz a
  extração completa). Ver `aplicarFiltroProdutoCockpit`, `js/cockpit.js:146`.

## Limitações conhecidas (não implementado ou implementado com ressalva)

1. **Filtro de produto é uma busca sob demanda, não um filtro de query** —
   por causa do custo de `crm.deal.productrows.get` por negócio (mesma
   limitação já documentada na auditoria original, seção 14). Não há como
   evitar isso sem uma mudança maior (batch de produtos, cache persistente,
   ou um endpoint agregado que o Bitrix não oferece).
2. **Coverage e Proteção de Receita dependem de `CLOSEDATE` preenchido** —
   negócios abertos sem `CLOSEDATE` não entram no "Pipeline Elegível" de
   nenhum mês (nem M, nem M+1/2/3). Isso é intencional (não adivinha data de
   fechamento), mas significa que Pipeline Elegível pode subestimar o
   pipeline real se a higiene de CLOSEDATE estiver ruim — mesmo aviso já
   feito no Forecast semanal sobre negócios "Sem CLOSEDATE". Desde a
   convergência com a Central de Inteligência Comercial (ver seção acima),
   Pipeline Elegível também exige valor>0, responsável e aging ≤45 dias — e
   **não** exige "próxima ação preenchida" (campo que este projeto não
   extrai), tornando este critério mais permissivo que o da Central nesse
   ponto específico.
3. **`ASSIGNED_BY_ID` é o responsável atual, não histórico** — igual ao
   resto do projeto (ver auditoria, seção 15), o filtro de "Vendedor" reflete
   quem é responsável **hoje**, não quem trabalhou o negócio ao longo do
   tempo.
4. **Threshold de Proteção de Receita (2x/3x) é um ponto de partida, não uma
   meta corporativa validada** — precisa de validação com a diretoria antes
   de virar critério oficial de alerta. Desde a convergência com a Central,
   o Coverage Recomendado (`1 ÷ Win Rate/100`) é exibido ao lado como
   referência derivada de dado real — mas o semáforo fixo 2x/3x continua
   sendo o "chão" oficial até uma decisão da diretoria.
5. **Sales Cycle usa `UF_CRM_1770928318695` (data de contrato assinado) como
   preferência sobre `CLOSEDATE`** (via `fecharDataDeal`/`cicloDealDias`,
   igual ao resto do catálogo) — se esse campo customizado não estiver
   preenchido em negócios antigos, o ciclo cai para `CLOSEDATE`; se nenhum
   dos dois estiver preenchido, o negócio não entra na amostra (mostrado no
   contador de amostra, nunca disfarçado).
6. **Não há teste automatizado end-to-end contra um Bitrix real** — como já
   apontado na auditoria (seção 12), o projeto não tem testes automatizados;
   a verificação desta tarefa foi `node --check` em `js/cockpit.js` e revisão
   estática cuidadosa dos IDs/handlers entre HTML e JS (sem webhook real
   disponível neste ambiente para testar contra dados de produção).
7. **Performance**: o Cockpit reusa `baseDealsCatalogo`, que já busca todos
   os campos de todos os negócios do Comercial numa única extração paginada
   — não há cache entre a aba do Cockpit e as abas antigas do catálogo
   (mesma limitação de "sem cache de sessão" já registrada na auditoria,
   seção 14, item P1.5). Cada clique em "↻ Atualizar agora" refaz a busca
   completa.
8. **Pipeline necessário (Geração de Pipeline) é uma hipótese matemática**
   (`Meta M+1 ÷ Win Rate`), não uma fórmula validada com a diretoria — ver
   comentário em `cockpitCalcularGeracaoPipeline`, `js/cockpit.js`.
9. **Resumo de SDR não identifica qual SDR qualificou cada negócio** e não
   mostra "Leads trabalhados" nem "Reuniões" — o Cockpit não extrai Leads
   nem atividades; essas métricas exigem os relatórios completos de
   `js/sdr.js` (Diário SDR / Análise SDR), linkados no próprio bloco.
10. **Não existe campo de "motivo de perda" mapeado em nenhum lugar do
    projeto** — o bloco Qualidade dos Dados sempre mostra 0% de completude
    para esse campo nos negócios perdidos; não foi inventado nenhum
    `UF_CRM_*` novo para simular esse dado.
11. **Threshold de aging alto dos Alertas Gerenciais (45 dias) é um ponto de
    partida, não uma meta corporativa validada** — mesma ressalva do
    threshold 2x/3x de Proteção de Receita, ver `ALERTA_AGING_ALTO_DIAS`,
    `js/cockpit.js`.
12. **Alerta de Win Rate x média histórica não foi implementado** — nenhum
    lugar do projeto armazena histórico de Win Rate entre períodos/sessões
    anteriores; ver seção "Alertas Gerenciais" acima para o detalhe.
