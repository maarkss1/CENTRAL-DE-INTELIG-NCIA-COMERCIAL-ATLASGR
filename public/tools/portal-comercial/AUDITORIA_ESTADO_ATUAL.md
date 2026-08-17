# Auditoria do estado atual — Acompanhamentos AtlasGR Comercial

Data da auditoria: 2026-08-15. Base: commit `fc6a55f` (branch `main`).

> **Atualização (mesmo dia, depois desta auditoria):** a aplicação foi
> reestruturada de página única para um **portal com páginas separadas**
> (`index.html`, `cockpit.html`, `extracao.html`, `forecast.html`,
> `sdr.html`) — ver `PORTAL.md` para a estrutura atual, o que cada página
> contém e como a navegação funciona entre elas. A descrição abaixo (seção 1,
> "arquivo único de ~8.510 linhas") descreve o estado **anterior** a essa
> reestruturação; o restante deste documento (fórmulas, riscos, gargalos,
> limitações do Bitrix) continua válido, já que a lógica de negócio em
> `js/*.js` não mudou — só a organização do HTML entre páginas.

---

## 1. Arquitetura atual (histórica — ver nota acima)

Ferramenta 100% client-side, sem backend próprio: um único arquivo `Relatorios AtlasGR.html`
(~8.510 linhas, ~465 KB) contendo HTML + CSS + JavaScript inline. Não há bundler, não há
framework (sem React/Vue), não há dependências de terceiros carregadas no navegador — tudo é
JS vanilla. `index.html` é apenas um redirecionamento (`meta refresh`) para o arquivo principal
(existe provavelmente porque o GitHub Pages exige um `index.html` na raiz).

Fluxo geral:
1. Usuário cola a URL do webhook de entrada do Bitrix24 (REST API) no campo "Conexão com o Bitrix".
2. O JS monta URLs `https://.../rest/.../<metodo>.json` e faz `fetch` diretamente do navegador
   do usuário para o Bitrix (CORS liberado pelo próprio Bitrix para webhooks de entrada).
3. Os dados retornados são paginados (`start`/`next`), mesclados em memória, e alimentam:
   - extração genérica por entidade (negócios, leads, empresas, contatos, atividades, usuários);
   - "relatórios especiais" (Jornada do Cliente, Forecast semanal, Diário SDR, Análise SDR);
   - o "Catálogo de relatórios" (v6+, ~20 relatórios prontos, função `extrairRelatorioCatalogo`).
4. Os resultados são renderizados como tabelas HTML na própria página e podem ser exportados
   (CSV, JSON, HTML "modelo visual" para impressão/e-mail).
5. Automação server-side separada (Node.js, fora do navegador) replica a lógica do Forecast
   semanal via GitHub Actions (`scripts/forecast-semanal.mjs`), sem depender do usuário abrir o HTML.

Organização interna do arquivo (por região aproximada de linhas):
- 1–830: CSS (tema claro/escuro via `localStorage`, variáveis CSS).
- 830–1470: HTML — wizard de passos 1 a 8 (conexão, tipo de relatório, período, campos,
  execução, resultado, sincronização, IA, Python), Central de Inteligência, catálogo de cards.
- 1490–1800: `ENTIDADES` (mapa de entidades Bitrix, campos, estágios) e `RELATORIOS` (catálogo).
- 1800–2600: bootstrap de UI, persistência do webhook, seleção de campos, período.
- 2600–2930: núcleo de chamada HTTP ao Bitrix (retry, paginação, extração genérica).
- 2930–3450: Jornada do Cliente (funções `extrairJornada`, `renderizarAuditoriaJornada`, etc. — a
  parte de "Jornada" propriamente dita está mais abaixo, 6154+; aqui ficam helpers e semântica).
- 3435–4221: Catálogo de relatórios (`extrairRelatorioCatalogo`, ~20 relatórios, um bloco
  `if/else if` monolítico e denso).
- 4221–4700: Forecast semanal (extração, cálculo, "modelo visual" com metas e setas de tendência).
- 4700–5650: Análise SDR (semanal/mensal, "João Reis").
- 5650–6150: Modelo visual da Análise SDR + Diário SDR (extração).
- 6150–6720: Jornada do Cliente (extração completa, `extrairJornada`).
- 6715–6900: exportações CSV/JSON por relatório especial.
- 6900–7500 aprox.: exportação genérica (CSV de qualquer entidade), sincronização com Bitrix.
- 7500–8510: Central de Inteligência (cards por relatório, radar de prioridades, funil visual,
  botão "Analisar com IA", geração de prompt equivalente em Python, barra de ferramentas
  flutuante — imprimir, baixar, sincronizar, ditar).

## 2. Arquivos e para que servem

| Arquivo | Função |
|---|---|
| `Relatorios AtlasGR.html` | Aplicação inteira (UI + lógica + extração Bitrix + relatórios). |
| `index.html` | Redireciona para o arquivo acima (compatibilidade com GitHub Pages). |
| `package.json` | Só declara a dependência `nodemailer` e o script `forecast-semanal` para a automação Node. |
| `scripts/forecast-semanal.mjs` | Script standalone (Node, sem navegador) que replica o cálculo do Forecast semanal Comercial direto do Bitrix e opcionalmente envia por e-mail via SMTP. |
| `.github/workflows/forecast-semanal.yml` | Roda `forecast-semanal.mjs` toda sexta 13h (Brasília) e faz commit do relatório gerado em `relatorios/forecast-semanal/`. |
| `.github/workflows/pages.yml` | Publica o repositório (arquivos `.html` da raiz) no GitHub Pages a cada push em `main`. |
| `relatorios/forecast-semanal/*.md` | Saída histórica do script de automação (gerada, não editada manualmente). |

Não há testes automatizados, linter, CI de qualidade, nem `.env`/config separado — segredos
(webhook, SMTP) só existem como GitHub Secrets (na automação) ou `localStorage` (no navegador).

## 3. Funcionalidades existentes

### Extração manual/genérica (wizard passos 1–6)
Permite escolher qualquer entidade Bitrix (Negócios, Leads, Empresas, Contatos, Atividades,
Usuários, ou "Extração completa" das seis), filtrar por categoria/estágio/período/campo
personalizado, escolher campos (inclusive `UF_CRM_*` descobertos dinamicamente via
`crm.*.fields`), e exportar CSV/JSON. Inclui also extração de produtos por negócio
(`crm.deal.productrows.get`).

### Relatórios especiais (handlers dedicados, fora do catálogo genérico)
- **Jornada do Cliente** (`extrairJornada`, `Relatorios AtlasGR.html:6154`): consolida negócios
  de todos os funis por cliente único (empresa/contato/lead), monta histórico de estágios
  (`crm.stagehistory.list` via `buscarHistoricoEstagios`, linha 3089), detecta duplicidades de
  empresa por nome/e-mail/telefone (`construirSinaisDuplicidadeEmpresas`, 3121), reentradas e
  mudanças de funil, aging por estágio. Auditoria dedicada (`renderizarAuditoriaJornada`, 3170).
- **Forecast semanal — Comercial** (`extrairForecastSemanal`, 4357): fechado da semana/mês,
  pipeline aberto ponderado, buckets Commit/Best Case/Pipeline, metas semanal/mensal com seta
  de tendência, "modelo visual" para impressão/e-mail (`gerarHTMLForecastModelo`, 4331).
- **Diário SDR** (`extrairDiarioSDR`, 5698): atividades concluídas no dia, Leads atendidos,
  Leads/negócios "potenciais" ainda sem atividade.
- **Análise SDR — semanal/mensal (João Reis)** (`extrairAnaliseSDR`, 4990): produção diária,
  mix de canais de atividade, jornada mais frequente, backlog, taxas de conversão, SLA de
  primeiro contato — com modelo visual customizado (`gerarHTMLRelatorioJoao`, 5658).

### Catálogo de relatórios (v6+, `RELATORIOS`, `Relatorios AtlasGR.html:1740`)
20 relatórios agrupados em "Jornada & Cliente", "Comercial & Receita", "SDR & Leads",
"Operação & Qualidade", cada um com card próprio na Central de Inteligência. Implementados em
`extrairRelatorioCatalogo` (3609–4221, bloco `if/else if` sequencial):
- `jornada`, `handoffs`, `reentradas`, `duplicidades`, `implantacao_posvenda`
- `forecast_semanal`, `forecast_mensal`, `pipeline_coverage`, `conversao_comercial`,
  `aging_sla`, `performance_vendedores`, `ganhos_perdas_ciclo`, `origens_canais`,
  `produtos_receita`, `clientes_receita`
- `diario_sdr`, `analise_sdr`, `funil_leads`, `produtividade_atividades`,
  `sla_primeiro_contato`, `auditoria_sdr`, `decisao_final_sdr`
- `atividades_pendentes`, `qualidade_crm`

O que cada um calcula está detalhado na seção 6 (fórmulas).

### Central de Inteligência (v10, ~7500–8350)
Painel com cards de todos os relatórios do catálogo, "Radar de prioridades", "Funil visual"
(fluxo Lead → Negócio → Ganho), botão "Analisar com IA" por relatório (gera um prompt/resumo
para colar em um LLM externo — não há chamada de API de IA embutida), geração de código Python
equivalente (passo 8 do wizard) e barra de ferramentas flutuante (imprimir, baixar, sincronizar,
ditar por voz via Web Speech API).

### Sincronização de volta ao Bitrix
Seção "↻ Sincronizar alterações" (linha 1118) permite editar valores extraídos e escrevê-los de
volta via `crm.*.update` — funcionalidade existe na UI mas não foi lida em profundidade nesta
auditoria (recomenda-se revisão dedicada antes do Cockpit, ver seção 10).

## 4. Métodos Bitrix24 usados

| Método | Onde (arquivo:linha aprox.) | Uso |
|---|---|---|
| `crm.deal.list` | 1497 (`ENTIDADES.negocios`), 3511 (`baseDealsCatalogo`), 4393 (forecast), 4879 (SDR), 5771, 6196 (jornada), `scripts/forecast-semanal.mjs:157` | Base de quase todos os relatórios comerciais. |
| `crm.deal.fields` | 1498 | Descoberta dinâmica de campos (inclui `UF_CRM_*`). |
| `crm.deal.productrows.get` | 3710 | Produtos por negócio (chamada **individual por deal**, N+1). |
| `crm.deal.update` | seção de sincronização (~1118+) | Grava edições de volta no Bitrix. |
| `crm.lead.list` | 1572, 3533 (`baseLeadsCatalogo`), 5069, 5086, 5756, 5807, 6226 | Base de leads / SDR / origem. |
| `crm.lead.fields` | 1573 | Descoberta dinâmica de campos de lead. |
| `crm.company.list` / `crm.company.fields` | 1609–1610 | Extração de empresas. |
| `crm.contact.list` / `crm.contact.fields` | 1624–1625 | Extração de contatos. |
| `crm.activity.list` / `crm.activity.fields` | 1641–1642, `atividadesCatalogo` (3546) | Atividades (ligações, reuniões, tarefas, e-mails, WhatsApp). |
| `crm.stagehistory.list` | `buscarHistoricoEstagios` (3089) | Histórico de mudança de estágio — base de aging, reentradas, handoffs. |
| `user.get` | 1680, `carregarVendedores` (2501), `scripts/forecast-semanal.mjs:164` | Lista de usuários/vendedores ativos. |
| (implícito) `crm.status.list` / metadados de funil-estágio | `buscarMetadadosFunisEEstagios` (3022) | Labels de estágio/funil dinâmicos (não hardcoded em runtime, mas há fallback hardcoded em `ENTIDADES`). |
| `crm.category.list` (provável, não confirmado nesta leitura) | usado por `carregarOrigens`/categorias | A confirmar em revisão de código. |

Todas as chamadas passam por `bitrixFetchComRetentativa` (2611) — timeout via `AbortController`,
retry com backoff exponencial (até `TENTATIVAS_MAX`), tratamento específico de
`QUERY_LIMIT_EXCEEDED` e erros HTTP 429/5xx. Paginação genérica via `listarCompletoRelatorio`
(3383) e `carregarListaPaginada` (2477).

## 5. Campos Bitrix customizados (`UF_CRM_*`)

- `UF_CRM_1770928318695` — **"Data do contrato assinado (campo oficial)"** (linha 1544/1558,
  usado em `fecharDataDeal`, 3444, e em toda a lógica de fechamento/CLOSEDATE de negócios
  Comercial). É o único `UF_CRM_*` fixo/hardcoded encontrado no código; outros campos
  personalizados só aparecem via descoberta dinâmica (`crm.deal.fields`/`crm.lead.fields`) na
  extração genérica e no modo "Extração completa", não em cálculos de relatório.
- O wizard permite ao usuário adicionar campos personalizados manualmente (`camposExtra`,
  `campoPersonalizadoCodigo`, linhas 899/1082) mas isso não alimenta os relatórios do catálogo,
  só a extração manual.

Ou seja: **os relatórios prontos usam essencialmente campos padrão do Bitrix** (`OPPORTUNITY`,
`STAGE_ID`, `CLOSEDATE`, `MOVED_TIME`, `ASSIGNED_BY_ID`, `SOURCE_ID`, `PROBABILITY` etc.) mais um
único campo customizado de data de contrato assinado. Isso é uma limitação relevante para o
Cockpit (ver seção 15/16).

## 6. Fórmulas de cálculo já implementadas

- **Meta mensal padrão** (`METAS_FORECAST_MENSAL_PADRAO`, `Relatorios AtlasGR.html:1773` e
  duplicada em `scripts/forecast-semanal.mjs:54`): tabela fixa mês→valor R$ hardcoded no
  código (jan a dez de um ano específico), editável na UI mas sem persistência entre anos.
- **Meta semanal implícita** = meta mensal ÷ nº de semanas do mês (`Math.ceil(diasNoMes/7)`),
  linha 3623-3624 e `forecast-semanal.mjs:150-152`.
- **Semântica do estágio** (`semanticaDeal`, 3349): mapeia `STAGE_SEMANTIC_ID` do Bitrix
  (`S`/`success`, `F`/`failure`/`apology`, resto = `process`).
- **Estágios "Piloto" excluídos do pipeline aberto** (`STAGE_IDS_PILOTO`, 3358 —
  `UC_R1YAOS`, `UC_JWY0OY`, `UC_AM8GK1`, `UC_I37148`, `UC_EU6LUO`, `UC_WBYFT4`, `UC_QT3CO8`)
  e detecção textual de fallback (`ehEstagioPiloto`, 3359, procura "piloto" no label).
- **Fallback de probabilidade por estágio** (`probabilidadeFallbackForecast`, 3364): usado
  quando `PROBABILITY` do Bitrix está zerada/ausente — 100% se ganho, 0% se perdido, senão
  regex sobre o label do estágio (assinatura/piloto/termo aceito=80%, proposta/negociação=60%,
  call/visita/reunião/diagnóstico=40%, nova oportunidade=20%, default=30%). Réplica idêntica
  (mas por `STAGE_ID` fixo, não por texto) em `scripts/forecast-semanal.mjs:46-51`.
- **Bucket de forecast** (`classificarBucketForecast`, 3375): Fechado / Perdido / Commit
  (prob≥80) / Best Case (prob≥50) / Pipeline (resto).
- **Pipeline ponderado** = `valor * probabilidade / 100`, usado em forecast, coverage,
  performance por vendedor.
- **Projeção** = fechado + pipeline aberto ponderado (mesma regra no HTML e no script Node).
- **Seta de tendência / atingimento** (`barraAtingimentoMeta` 3460, `cardMetaDestaque` 3482,
  `setaAtingimento` em `forecast-semanal.mjs:132`): 🟢/▲ se realizado≥meta OU projeção≥meta;
  🔴/▼ caso contrário. % de atingimento = `round(realizado/meta*1000)/10`.
- **Coverage 90 dias** (`pipeline_coverage`, 3654) = (pipeline com fechamento em até 90 dias) ÷
  meta informada, expresso em "x".
- **Aging** = dias desde `MOVED_TIME` até a data de referência (3671); "Fora SLA" se
  `dias > sla` (SLA configurável na UI, default 30 dias).
- **Ciclo de venda** (`cicloDealDias`, 3446) = dias entre `DATE_CREATE` e a data de fechamento
  (`UF_CRM_1770928318695` ou `CLOSEDATE`, o que estiver preenchido — `fecharDataDeal`, 3444).
- **Win Rate** = ganhos ÷ (ganhos+perdas); **Taxa de fechamento** = fechados ÷ total da coorte
  (`taxaPct`, 4815).
- **SLA de primeiro contato** (3745): horas entre `DATE_CREATE` do lead e a primeira atividade
  concluída vinculada a ele (`END_TIME >= created`, ordenada, primeira da lista); mediana
  calculada por ordenação simples do array.
- **Concentração de receita (Top 10)** (`clientes_receita`, 3721): receita dos 10 maiores
  clientes ÷ receita total.
- **Receita de produtos**: usa `PRICE_ACCOUNT` quando disponível, senão `PRICE * QUANTITY`
  (3710, comentário na linha 3715).

## 7. Filtros existentes

- **Período**: presets (Diário/Semanal/Mensal/Trimestral/Semestral/Todas/personalizado — ver
  `calcularIntervaloPreset`, 2265), seleção de mês/dia específico, campo de data configurável
  por entidade (`camposData` em `ENTIDADES`, ex.: `DATE_CREATE`, `MOVED_TIME`, `CLOSEDATE`,
  `UF_CRM_1770928318695`).
- **Vendedor/responsável**: `carregarVendedores` (2501) popula um seletor de usuários ativos;
  usado como filtro em alguns relatórios (extração manual) — nos relatórios do catálogo, a
  segmentação por responsável normalmente é feita no agrupamento da tabela de saída
  (`RESPONSAVEL`), não como filtro de entrada.
- **Categoria/estágio**: seletor de categoria de negócio (`aoTrocarCategoria`, 2116) e de
  estágio (`montarEstagios`, 2124), específico do Bitrix da AtlasGR (hardcoded em `ENTIDADES`).
- **Origem**: `carregarOrigens` (2534) — lista de `SOURCE_ID`; usado em `origens_canais`
  (com fallback para `UTM_SOURCE`, 3701).
- **Produto**: não há filtro dedicado por produto — `produtos_receita` lista todos os produtos
  vendidos, sem seleção prévia.
- **SLA configurável**: campo de horas/dias de SLA na UI para `aging_sla` e
  `sla_primeiro_contato`.
- **Meta comercial**: campo editável `metaRelatorioComercial`, pré-preenchido por
  `metaMensalPadrao` mas sobrescrevível manualmente.

## 8. Exportações existentes

- **CSV genérico** por entidade extraída (`baixarCSVEntidade`, 6786; `linhasCSVDe`, 6770).
- **CSV específico** por relatório especial: Forecast (negócios/vendedores, 6721-6727),
  Análise SDR (diário/clientes/conversões/jornada/backlog, 6733-6748), Diário SDR
  (atividades/leads/potenciais, 6753-6765), Jornada (normalizada/duplicidades/histórico de
  estágios/handoffs, 3238-3264).
- **JSON** por relatório especial (`baixarJSONForecast`, `baixarJSONAnaliseSdr`,
  `baixarJSONDiarioSDR`).
- **HTML "modelo visual"** para impressão/e-mail: gerado por
  `gerarHTMLRelatorioVisualGenerico` (3577, usado por Jornada e Diário SDR),
  `gerarHTMLForecastModelo` (4331) e `gerarHTMLRelatorioJoao` (5658) — todos produzem um
  documento HTML autocontido (cabeçalho, KPIs, tabelas) que pode ser aberto em nova aba
  (`abrirHtmlEmNovaAba`, 4221) ou baixado como arquivo.
- Catálogo genérico também expõe `baixarCSVRelatorioCatalogo` / `baixarJSONRelatorioCatalogo` /
  `abrirRelatorioVisualCatalogo` / `baixarHTMLRelatorioVisualCatalogo` (3592-3608) reutilizados
  por todos os ~20 relatórios do catálogo.
- Não há exportação para Excel (.xlsx), PDF nativo (só "imprimir" via navegador), nem envio
  automático de e-mail a partir do HTML (isso só existe no script Node separado).

## 9. Automações (`.github/workflows`)

- **`forecast-semanal.yml`**: cron `0 16 * * 5` (sexta 13h Brasília) + `workflow_dispatch`
  manual. Roda `node scripts/forecast-semanal.mjs`, que chama o Bitrix diretamente (sem
  navegador), gera `relatorios/forecast-semanal/AAAA-MM-DD.md` + `latest.md`, comita o
  resultado no repo, e — se `SMTP_HOST` estiver configurado como Secret — envia por e-mail
  (nodemailer) para `marcelo.nascimento@atlasgr.com`, `murilo.marques@atlasgr.com.br`,
  `comercial@atlasgr.com.br` (ou lista sobrescrita por `FORECAST_DESTINATARIOS`).
  Concurrency group evita execuções sobrepostas.
- **`pages.yml`**: em todo push em `main`, copia os `*.html` da raiz para `_site/` e publica no
  GitHub Pages. Sem build step — deploy é literalmente cópia de arquivo.
- Não há workflow de CI para lint/teste (não existem testes), nem workflow de backup de dados,
  nem alerta de falha de automação além do log padrão do Actions.

## 10. Funcionalidades incompletas ou parciais

- **Sincronização de volta ao Bitrix** (seção "↻", linha 1118): existe na UI mas não foi
  auditada em profundidade aqui — risco de escrita não intencional no CRM produtivo merece
  revisão dedicada antes de qualquer expansão.
- **`decisao_final_sdr`** (catálogo): descrito como "sem escrever no Bitrix" — parece ser
  puramente analítico/recomendação textual, não uma automação real de saneamento.
- **Botão "Analisar com IA"**: não há integração de API de IA embutida — provavelmente monta um
  prompt/texto para o usuário copiar e colar em uma ferramenta externa (ChatGPT/Claude). Precisa
  confirmação visual na UI para saber exatamente o que produz.
- **Filtro de vendedor/produto nos relatórios do catálogo**: a maioria dos ~20 relatórios do
  catálogo não aceita filtro de responsável ou produto como parâmetro de entrada — o usuário só
  filtra período (e, em alguns, meta/SLA). Segmentação por vendedor só aparece como coluna de
  agrupamento na saída.
- **Metas mensais fixas em código**: `METAS_FORECAST_MENSAL_PADRAO` está hardcoded para um
  único ano/ciclo; não há UI para cadastrar metas de anos futuros sem editar o HTML/script.
- **"Sem filtro de produto" no Pipeline & Coverage / Performance por vendedor**: cálculos
  agregam tudo por categoria "Comercial" (`baseDealsCatalogo(webhook,true)`), sem segmentação
  por linha de produto/serviço.
- **Dependência de `PROBABILITY` do Bitrix ou de heurística por texto de estágio**: quando o
  Bitrix não tem probabilidade configurada por estágio (comum), todo o forecast roda no
  fallback textual — funciona, mas é frágil a mudanças de nome de estágio.

## 11. Código duplicado ou morto

- **Lógica de forecast duplicada** — **mitigado parcialmente em 2026-08-15**:
  `probabilidadeFallbackForecast`/`STAGE_IDS_PILOTO`/`METAS_FORECAST_MENSAL_PADRAO`/cálculo de
  meta semanal existem **tanto** nos módulos JS do navegador (`js/jornada.js`, `js/config.js`,
  carregados por `Relatorios AtlasGR.html`) **quanto** em `scripts/forecast-semanal.mjs` — não há
  compartilhamento de módulo entre browser (scripts clássicos, sem bundler) e Node, então a
  duplicação de arquivo continua existindo estruturalmente. Nesta revisão foi encontrada e
  corrigida uma divergência real: `STAGE_IDS_PILOTO` no script Node só excluía 1 dos 7 estágios
  piloto do navegador, e o fallback de probabilidade usava uma tabela fixa por `STAGE_ID` em vez
  da mesma regra por texto do label. O script Node agora busca os labels de estágio via
  `crm.status.list` e replica exatamente a lógica de `js/jornada.js` (fonte da verdade). As metas
  mensais já tinham os mesmos valores nos dois lados; foi adicionado um aviso `⚠️` bem visível em
  `js/config.js`, `js/jornada.js` e `scripts/forecast-semanal.mjs` apontando um para o outro.
  **Limitação estrutural que continua não resolvida**: os valores/regras ainda vivem em dois
  arquivos fisicamente separados — uma mudança futura de meta ou regra de estágio ainda depende de
  alguém lembrar de editar os dois lugares; só os comentários e o processo de review protegem
  contra nova divergência silenciosa. Extrair para um `config/metas.json` compartilhado (lido via
  `fetch` no navegador e `fs.readFileSync` no Node) foi avaliado e descartado por ora: o HTML pode
  ser aberto localmente via `file://` (não só via GitHub Pages), onde `fetch` de arquivo local é
  bloqueado por CORS em navegadores modernos — a solução de arquivo compartilhado quebraria esse
  modo de uso sem uma reestruturação maior (ex. embutir o JSON como `<script>` que define uma
  variável global, o que reintroduz a necessidade de manter dois pontos de entrada sincronizados
  de qualquer forma). Ver item P0.3/P0.1 na seção 17.
- **Padrão repetitivo em `extrairRelatorioCatalogo`**: cada um dos ~20 relatórios repete o
  padrão `baseDealsCatalogo` → `enriquecerDealCatalogo` → `filter/reduce` → `criarResultadoCatalogo`
  quase sempre em uma única linha densa (código extremamente compactado, sem quebras de linha,
  ex. linhas 3626-3757) — não é código morto, mas é altamente duplicado estruturalmente e
  difícil de revisar/testar (uma função de 600+ linhas com dezenas de blocos `if/else if`).
- **`enriquecerDealCatalogo`/`baseDealsCatalogo`** (3506-3529) centralizam parte do enriquecimento,
  mas cada bloco do catálogo ainda recalcula `_SEMANTICA`/`_ESTAGIO`/probabilidade manualmente
  em vez de reutilizar um único helper de "forecast do deal".
- Não foi encontrado código claramente morto (funções nunca chamadas) nesta leitura, mas o
  arquivo não tem nenhuma ferramenta de análise estática para confirmar isso com certeza.

## 12. Riscos técnicos

- **Webhook Bitrix em texto puro no `localStorage`** (linha 2219): a própria UI avisa o usuário
  ("a URL contém uma credencial... faça isso apenas em um computador pessoal ou confiável"), mas
  não há nenhuma proteção técnica (sem criptografia, sem expiração, sem escopo). Qualquer script
  malicioso rodando na mesma origem (XSS) teria acesso total ao CRM.
  Ver seção 13 para o risco de segurança correspondente.
- **Arquivo único de 8.500 linhas**: extremamente difícil de revisar, testar ou dar manutenção
  incremental seguro. Qualquer PR de Cockpit terá alto risco de merge conflict e regressão
  silenciosa (não há testes automatizados que peguem quebra de fórmula).
- **Sem testes automatizados**: todas as fórmulas de negócio (metas, forecast, aging, SLA) não
  têm cobertura de teste — regressões só são detectadas manualmente/visualmente.
- **Duplicação HTML↔Node do forecast** (seção 11): risco real de os dois relatórios (o gerado
  pela automação semanal e o gerado interativamente pelo usuário) divergirem silenciosamente.
- **Extração "tudo" e catálogo fazem N chamadas por entidade grande**: `produtos_receita`
  chama `crm.deal.productrows.get` **uma vez por negócio ganho** (loop em 3710, com `await
  aguardar(100)` entre chamadas) — para uma base grande de negócios isso pode levar minutos e é
  frágil a qualquer timeout de rede no meio do processo (embora haja retry).
- **Metas hardcoded por ano**: ao virar o ano, alguém precisa lembrar de atualizar
  `METAS_FORECAST_MENSAL_PADRAO` em dois arquivos, ou os relatórios silenciosamente reportam
  meta “0”/errada.
- **Sem monitoramento/alerta de falha da automação além do log do GitHub Actions**: se o cron
  falhar (ex. webhook revogado, SMTP com erro), ninguém é avisado proativamente — precisa
  alguém checar a aba Actions manualmente.
- **GitHub Pages serve a ferramenta publicamente** (mesmo que "pouco descoberta"): qualquer
  pessoa com a URL do site pode abrir a página e colar/usar um webhook Bitrix, inclusive
  atacantes com engenharia social — a página em si não exige autenticação alguma.

## 13. Riscos de segurança

- **Credencial de CRM em `localStorage` do navegador** — **mitigado parcialmente em 2026-08-15**:
  o webhook salvo agora é ofuscado (XOR + base64 com chave fixa no código, `js/bitrix-api.js`,
  funções `ofuscarWebhook`/`desofuscarWebhook`) em vez de gravado em texto puro, e a UI (card
  "Conexão com o Bitrix" e ajuda contextual "Webhook e segurança") explica o risco real de forma
  explícita. **Isto NÃO é segurança real** — é uma cifra reversível cuja chave está no próprio
  código público; qualquer pessoa com acesso de fato ao navegador (DevTools, extensão capaz de
  rodar JS, backup do perfil) recupera o webhook original em segundos. O ganho é só evitar
  exposição *trivial* do texto puro (inspeção casual do Local Storage, backups automáticos,
  extensões que fazem apenas grep simples). **Limitação estrutural que continua não resolvida**:
  não é possível eliminar esse risco de verdade numa aplicação 100% client-side sem backend —
  isso exigiria um servidor próprio para custodiar a credencial (proxy com token de sessão),
  fora do escopo desta mitigação. Confirmado nesta revisão que o webhook nunca vaza para HTML
  exportado, CSV/JSON, código Python gerado ou para o payload do chat com IA
  (`coletarDadosParaPrompt()` em `js/exportacoes.js` só inclui dados já calculados, nunca a
  credencial; `gerarCodigoPython()` gera código que lê `BITRIX_WEBHOOK_URL` de variável de
  ambiente, nunca embute o valor).
- **Sem controle de acesso na aplicação**: qualquer pessoa que abra o link do GitHub Pages e
  tenha (ou obtenha) o webhook consegue ler e potencialmente escrever no CRM inteiro
  (a função de sincronização usa `crm.*.update`). Não há autenticação própria da ferramenta,
  nem escopos por relatório/usuário.
- **Segredos da automação (`BITRIX_WEBHOOK_URL`, `SMTP_USER`, `SMTP_PASS`) ficam em GitHub
  Secrets** — isso é apropriado, mas o e-mail de saída é enviado em texto simples com o
  relatório completo de forecast (pode conter dados sensíveis do funil comercial) sem controle
  de quem mais tem acesso à caixa de e-mail de destino.
- **Repositório e site aparentemente públicos** (deploy padrão do GitHub Pages é público a
  menos que o repo seja privado com GitHub Pro/Enterprise) — o próprio *código-fonte* de regras
  de negócio (metas, fórmulas) fica exposto, o que é aceitável, mas confirmar se o repo é
  privado é recomendado.
- **Nenhuma sanitização de nomes de cliente/título de negócio antes de embutir em HTML gerado
  para download**: há uma função `escapeHtmlRelatorio` (3264) usada nas tabelas, o que é bom —
  mas vale confirmar que **todos** os pontos de interpolação de dados do Bitrix nos HTMLs
  gerados (`gerarHTMLForecastModelo`, `gerarHTMLRelatorioJoao`, etc.) passam por ela, já que
  dados de CRM podem conter caracteres não controlados vindos de fontes externas (leads via
  formulário web, por exemplo) — um XSS armazenado é tecnicamente possível se algum campo for
  interpolado sem escape.

## 14. Gargalos de performance

- **`produtos_receita`**: 1 chamada HTTP por negócio ganho no período (loop serial com 100ms de
  espera entre chamadas) — para centenas de negócios isso é da ordem de dezenas de segundos a
  minutos.
- **`baseDealsCatalogo`/`baseLeadsCatalogo`** são chamados novamente (nova ida ao Bitrix) a cada
  clique em um relatório diferente do catálogo — não há cache entre relatórios na mesma sessão,
  então gerar vários relatórios seguidos multiplica as mesmas chamadas de `crm.deal.list`
  completo.
- **`crm.stagehistory.list`** (histórico de estágio, usado pela Jornada e por `conversao_comercial`)
  é buscado em lotes de 100 IDs (`dividirEmLotes`, 3064) — correto, mas ainda assim é uma
  chamada por lote, o que para uma base grande de negócios pode ser lento.
  soma-se a isso `buscarEntidadesPorIds` (3070) que faz requisições em lote via `ID` `in`,
  reduzindo N+1 nesse ponto específico (boa prática já aplicada).
  Nem todos os relatórios seguem esse padrão de lote — vale checar caso a caso.
- **Renderização de tabelas em memória** (`tabelaRelatorio`, 3409) limita a 250 linhas por
  padrão para não travar o DOM, mas o CSV usa o dataset completo — ok, mas indica que já houve
  problema de performance de renderização no passado.
- **Sem cache/memorização de metadados** (`buscarMetadadosFunisEEstagios`, `carregarVendedores`,
  `carregarOrigens`) entre chamadas de relatórios diferentes na mesma sessão — cada relatório
  especial parece rebuscar essas listas independentemente.

## 15. Limitações do Bitrix percebidas no código

- **Só existe um campo de "estágio" oficial por entidade** (`STAGE_ID`/`STATUS_ID`) — o cálculo
  de aging depende de `MOVED_TIME` (data da última mudança de estágio), que é um campo de
  sistema; não há como saber quanto tempo o negócio passou em *cada* estágio anterior sem
  reconstruir via `crm.stagehistory.list` (o que a Jornada já faz, mas outros relatórios de
  aging usam só o estágio atual).
- **`PROBABILITY` por estágio raramente está configurada** no Bitrix da AtlasGR — daí a
  necessidade de todo o sistema de fallback textual/por `STAGE_ID` (seção 6), que é uma
  heurística e não a fonte da verdade.
  visitas ao "SDR" (2 categorias hardcoded).
- **Ownership só reflete o responsável atual** (`ASSIGNED_BY_ID`) — não há histórico nativo de
  quem foi responsável em cada momento (o código explicita isso: "ASSIGNED_BY_ID representa o
  responsável atual, não todo o histórico de ownership", linha 3687) — métricas de handoff
  (seção "handoffs") são aproximações baseadas em comparação entre entidades relacionadas
  (Lead→Negócio), não em um log de auditoria real do Bitrix.
- **Sem `user.fields`**: Bitrix não expõe um método de descoberta de campos de usuário — a lista
  de campos de usuário é hardcoded (`CAMPOS_USUARIO_COMPLETO`, 1784).
- **Metas de vendas não existem como entidade no Bitrix** (não há um módulo nativo de metas
  usado) — por isso a ferramenta mantém sua própria tabela de metas mensais no código-fonte.
- **Categoria "Comercial" fixa como `CATEGORY_ID=0`** em vários pontos (`CATEGORIA_COMERCIAL` no
  script Node, `baseDealsCatalogo(webhook,true)` no HTML) — qualquer mudança na estrutura de
  funis do Bitrix (novo funil Comercial, renumeração de categoria) quebra silenciosamente os
  relatórios comerciais.

## 16. Dados já disponíveis hoje vs. dados ainda não explorados

**Já disponíveis / já extraídos por algum relatório:**
- Negócios (todas as categorias/funis), com valor, estágio, probabilidade, responsável, datas.
- Leads, com origem/UTM, status, conversão para negócio.
- Empresas e contatos (dados cadastrais básicos).
- Atividades (ligações, reuniões, tarefas, e-mails, WhatsApp) com vínculo a Lead/Negócio.
- Histórico de mudança de estágio (`crm.stagehistory.list`).
- Produtos por negócio ganho (via `crm.deal.productrows.get`, mas caro em performance).
- Usuários/vendedores ativos.
- Data de contrato assinado (campo customizado oficial).

**Não explorados / não usados por nenhum relatório atual (potencial para o Cockpit):**
- Campos personalizados `UF_CRM_*` além do de data de contrato assinado — o Bitrix
  provavelmente tem outros campos customizados (setor do cliente, porte, motivo de perda,
  concorrente, etc.) que hoje só aparecem na extração manual genérica, nunca em relatórios
  prontos/KPIs do catálogo.
- Motivo de perda estruturado (não há menção a um campo `LOSE_REASON`/similar no código lido).
- Dados de outras categorias além de Comercial (Financeiro, Implantação, Pós-Vendas,
  Sucesso do Cliente, RH, T.I) — existem no mapa `ENTIDADES.negocios.categorias` mas não têm
  relatórios de negócio dedicados no catálogo além de "Implantação, Onboarding e Pós-Venda"
  (`implantacao_posvenda`), que não foi lido em detalhe nesta auditoria.
- Recorrência/expansão de receita por cliente ao longo do tempo (LTV, churn) — `clientes_receita`
  calcula só receita/concentração no período, não série histórica por cliente.
- Cruzamento de performance de SDR com performance comercial (taxa de handoff Lead→Negócio→Ganho
  por *par* de SDR/vendedor) — hoje analisado separadamente (Análise SDR vs. Performance por
  vendedor).
- Nenhum dado externo ao Bitrix (sem integração com e-mail marketing, telefonia, financeiro
  externo, ERP) é combinado nos relatórios.

## 17. Melhorias recomendadas (priorizadas)

**P0 — antes de expandir o Cockpit:**
1. Eliminar a duplicação de regras de forecast entre `Relatorios AtlasGR.html` e
   `scripts/forecast-semanal.mjs` — extrair para um módulo JS único compartilhado (ex. um
   arquivo `forecast-core.mjs` importado nos dois lugares, ou gerar o HTML a partir do mesmo
   script Node) para eliminar risco de divergência silenciosa.
2. Endereçar o risco do webhook em `localStorage`: no mínimo, documentar/circunscrever o uso a
   máquinas confiáveis (já existe aviso), avaliar um proxy server-side com token de sessão
   próprio da ferramenta em vez de expor o webhook Bitrix bruto ao navegador — especialmente se
   o Cockpit vai ser usado por mais pessoas/em mais dispositivos.
3. Mover metas mensais para uma fonte de dados editável fora do código (ex. JSON versionado ou
   pequena tabela num banco/planilha) — hoje qualquer mudança de meta exige editar dois arquivos
   de código e fazer deploy.

**P1 — estrutural, para viabilizar o Cockpit Comercial Executivo:**
4. Quebrar `Relatorios AtlasGR.html` em módulos (ainda que continue sendo publicado como site
   estático simples): separar `ENTIDADES`/`RELATORIOS` (config), núcleo de chamada Bitrix
   (retry/paginação), cada relatório do catálogo, e camada de renderização/exportação. Isso é
   praticamente pré-requisito para adicionar um "Cockpit" com dashboards vivos sem tornar o
   arquivo ainda mais difícil de manter.
5. Introduzir cache de sessão para `baseDealsCatalogo`/`baseLeadsCatalogo`/metadados de
   funil-estágio, para que abrir vários relatórios/o Cockpit não multiplique chamadas idênticas
   ao Bitrix.
6. Resolver a performance de `produtos_receita` (usar `crm.deal.productrows.get` em lote, se o
   Bitrix suportar `batch`, ou aceitar amostragem/paralelismo controlado em vez de loop serial).
7. Adicionar testes automatizados (mesmo que só unitários em Node, extraindo as funções puras de
   cálculo — `probabilidadeFallbackForecast`, `classificarBucketForecast`, `taxaPct`,
   `cicloDealDias`, etc. — para um módulo testável) antes de acrescentar novas fórmulas para o
   Cockpit.

**P2 — funcional, para o próprio Cockpit:**
8. Padronizar filtro de vendedor/produto como parâmetro de entrada em todos os relatórios
   relevantes do catálogo (hoje é inconsistente — alguns relatórios agrupam por vendedor na
   saída, mas nenhum filtra por vendedor/produto na consulta).
9. Explorar campos `UF_CRM_*` adicionais do Bitrix (motivo de perda, setor, porte) para
   enriquecer segmentação do Cockpit — hoje só a data de contrato assinado é usada.
10. Considerar registrar/perguntar por um "motivo de perda" estruturado se o Bitrix tiver esse
    campo, para alimentar um KPI de motivo de perda no Cockpit (hoje inexistente).
11. Adicionar alerta ativo (e-mail/Slack) quando o cron do Forecast semanal falhar, não só log
    silencioso no Actions.
12. Avaliar exportação para Excel (.xlsx) além de CSV/JSON/HTML, comum em pedidos de diretoria.
