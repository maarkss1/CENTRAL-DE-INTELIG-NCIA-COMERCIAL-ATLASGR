# Portal AtlasGR — estrutura multi-página

Este documento descreve a reestruturação da ferramenta de uma única página
(`Relatorios AtlasGR.html`, ~750 linhas de HTML com tudo empilhado/escondido
via accordion) para um **portal com páginas separadas de verdade**, navegadas
por link real (`<a href="pagina.html">`), pedida explicitamente pelo usuário
depois de rejeitar a abordagem anterior (uma página só, com accordions
recolhidos) por continuar "feia"/confusa. Ver `AUDITORIA_ESTADO_ATUAL.md` para
o levantamento original da arquitetura e `COCKPIT_COMERCIAL.md` para o detalhe
de fórmulas/indicadores do Cockpit (nada disso mudou — só a organização das
páginas).

## Princípio geral

Todas as páginas do portal carregam o **mesmo** `css/styles.css` e os
**mesmos 11 arquivos `js/*.js`**, sempre na mesma ordem (`auth.js`,
`config.js`, `bitrix-api.js`, `extrator.js`, `forecast.js`, `sdr.js`,
`jornada.js`, `catalogo-relatorios.js`, `exportacoes.js`, `cockpit.js`,
`ui.js`, `app.js`). `auth.js` (v26) é o único que roda antes de tudo — ele
cuida do gate de senha única do portal (ver seção "Senha única (acesso
restrito)" mais abaixo) e não depende de nenhum outro arquivo.
**Nenhuma lógica de negócio foi duplicada entre páginas** — só o HTML de cada
página muda (quais seções existem no DOM) e um pequeno `<script>` inline no
fim de cada página cuida da inicialização específica dela (ex.: ler
`?relatorio=` da URL, pré-selecionar um relatório, filtrar os cards por
grupo). Isso é seguro porque `js/app.js` e as funções de boot (`iniciar()`,
`iniciarExperienciaV7()`, etc.) foram revisadas para só tocar em elementos que
realmente existem em cada página (ver seção "O que mudou no JS compartilhado"
abaixo).

## As páginas

> **Nota (2026-08-18):** uma 6ª página, `evolucao.html`, foi adicionada depois
> desta reestruturação original — ver seção "Página 6" logo após a página 5
> abaixo. Ela segue os mesmos princípios gerais (mesmo `css/styles.css` e os
> mesmos `js/*.js`, sem lógica duplicada), mas é mais enxuta: não tem card de
> conexão com o Bitrix nem depende do motor genérico, porque só lê dados já
> salvos (histórico local + `relatorios/forecast-semanal/historico.json`).

### 1. `index.html` — Home do portal
- Cabeçalho/hero simples, ticker do Cockpit ao vivo (`#cockpitTicker`,
  auto-atualiza a cada 5 min **se** o webhook já estiver salvo no navegador —
  reaproveita `cockpitAtualizarTicker`/`cockpitIniciarAutoAtualizacao` de
  `js/cockpit.js`, sem recalcular nada de novo).
- Card de "Conexão rápida" com o Bitrix (compacto) — necessário porque o
  ticker/auto-atualização lê `document.getElementById("webhook").value`
  diretamente; decisão conservadora para não quebrar o requisito de
  auto-atualização do ticker na home.
- Grade de cards "Comece pelo que você quer descobrir"
  (`renderizarAtalhosRelatorios()`, `js/ui.js` — reaproveitada, não
  recriada) com busca por nome/grupo/palavra-chave.
- **Não** contém os passos 1–8 do wizard nem nenhum bloco de resultado —
  clicar em qualquer card navega (link real, `window.location.href`) para
  `extracao.html?relatorio=chave`.

### 2. `cockpit.html` — Cockpit Comercial Executivo
- Card de conexão com o Bitrix (compacto).
- O painel completo do Cockpit (`#cockpit-executivo`): cabeçalho, filtros,
  os 10 `.cockpit-bloco` (Alertas, Resultado do Mês, Forecast, Saúde do
  Pipeline, Proteção de Receita, Pipeline por Estágio, Eficiência da
  Máquina, Geração de Pipeline, SDR, Qualidade dos Dados), drill-down,
  "⚡ Gerar Situação Agora" e todas as exportações (HTML/CSV/JSON/Relatório
  Executivo). Sempre expandido — a antiga classe `cockpit-recolhido` (que
  fazia sentido quando o Cockpit vivia dentro da página única) foi removida
  aqui, já que esta página é dedicada só a ele.

### 3. `extracao.html` — Extração & Diagnóstico
- Troca real de tela, não accordion: a seção `#inicio` (busca + grade de
  cards de relatório) e o wrapper `<div class="oculto" id="fluxo-extracao">`
  (passos 1–8: Conexão, Escolha o que fazer, Período, Campos, Executar
  consulta, Sincronizar, Central de Inteligência v10, Analisar com IA/Python)
  nunca ficam visíveis ao mesmo tempo. `revelarFluxoExtracao()` (`js/ui.js`)
  esconde `#inicio` e mostra `#fluxo-extracao` já todo aberto (sem seções
  recolhidas); `voltarParaRelatorios()` desfaz a troca. Disparado ao clicar
  num card de relatório, em "⚙️ Configurar extração manual"
  (`revelarFluxoExtracaoManual()`) ou via `?relatorio=chave` na URL. Um botão
  "← Voltar para os relatórios" no topo do wrapper chama
  `voltarParaRelatorios()`.
- Todos os blocos de resultado por relatório especial e do catálogo
  (`bloco-resultado`, `bloco-auditoria-jornada`, `bloco-analise-sdr`,
  `bloco-forecast-semanal`, `bloco-diario-sdr`, `bloco-relatorio-catalogo`,
  `bloco-campos-produtos`, `bloco-produtos`, `bloco-resultado-completo`,
  `bloco-python`) também ficam dentro do wrapper, escondidos até lá.
- Também tem a grade de cards no topo (`renderizarAtalhosRelatorios()`) para
  quem chega direto aqui, ou quer trocar de relatório sem sair da página.
- Aceita `?relatorio=chave` na URL: ao carregar, se presente, chama
  `selecionarRelatorioRapido(chave)` (mesma função dos cards) para
  pré-selecionar o relatório e revelar a seção de configuração.
- Aceita também `&ia=1` (usado pelos botões "🤖 Perguntar à IA" dos blocos
  dedicados de `forecast.html`/`sdr.html`, que não têm a Central de
  Inteligência v10 embutida): abre a aba de IA já com o relatório em foco.

### 4. `forecast.html` — 📈 Relatórios Comerciais
- Grade de cards **só** do grupo "Comercial & Receita" (`RELATORIOS`
  filtrado por `grupo`, via a nova função `renderizarAtalhosRelatoriosGrupo`
  em `js/ui.js` — reaproveita o mesmo template de card, não duplica).
- Card de conexão compacto.
- O bloco dedicado do **Forecast semanal** (`bloco-forecast-semanal`,
  `extrairForecastSemanal`/`renderizarForecastSemanal`) exibido direto na
  página, já pré-selecionado e com período padrão "semana atual" — basta
  colar o webhook e clicar em "Extrair dados".
- Os outros cards do grupo (Forecast mensal, Pipeline & Coverage,
  Conversão, Aging, Performance, Ganhos/perdas, Origens, Produtos,
  Clientes) — que dependem do motor genérico do Catálogo — levam para
  `extracao.html?relatorio=chave`.
- Contém, ocultos (`class="oculto"`/`style="display:none"`), os elementos do
  motor genérico de que `extrair()`/`aoTrocarEntidade()`/`aoTrocarRelatorio()`
  precisam para existir no DOM (ex.: `#entidade`, `#relatorio`,
  `#card-campos`) — sem eles essas funções compartilhadas quebrariam. Ver
  "Decisões conservadoras" abaixo.

### 5. `sdr.html` — 📞 SDR & Operação
- Grade de cards só do grupo "SDR & Leads".
- Card de conexão compacto.
- Os blocos dedicados de **Diário SDR** e **Análise SDR** (João Reis)
  embutidos direto na página, com um par de botões ("📅 Diário SDR" /
  "📊 Análise SDR") para trocar qual dos dois roda, sem sair da página —
  função local `sdrSelecionarRelatorioLocal(chave, rolar)`.
- Os outros cards do grupo (Funil de Leads, Produtividade de atividades,
  SLA de primeiro contato, Auditoria SDR, Decisão Final SDR) levam para
  `extracao.html?relatorio=chave`.
- Mesmos elementos ocultos do motor genérico que `forecast.html` tem.

### 6. `evolucao.html` — 📈 Evolução (adicionada depois, ver nota no topo)
- Sem card de conexão com o Bitrix e sem nenhum elemento do motor genérico —
  é só leitura de dados já salvos, não faz nenhuma chamada ao Bitrix.
- Junta duas fontes de histórico do Forecast (função `iniciarPaginaEvolucao()`,
  `js/jornada.js`): o histórico local (`localStorage`, gravado a cada
  extração do Forecast feita nesta ferramenta — `salvarHistoricoForecastLocal()`)
  e o histórico "oficial" (`relatorios/forecast-semanal/historico.json`,
  gravado toda sexta-feira por `scripts/forecast-semanal.mjs` via GitHub
  Actions, versionado no repo e publicado com o site). Quando os dois têm um
  registro do mesmo dia, o automático vence.
- Mostra um gráfico grande (SVG puro, `graficoEvolucaoForecast()`) com três
  séries — Fechado, Projeção final e Meta mensal — e uma tabela com o
  detalhe de cada "foto" salva.
- Botão "↻ Atualizar agora" só re-executa `iniciarPaginaEvolucao()` (não
  refaz nenhuma extração) — útil depois que a automação semanal roda.

## Navegação entre páginas

Todas as páginas têm a mesma barra `<nav class="quick-nav">` no topo, com
links reais entre as 5 páginas do portal (Início / Cockpit Executivo /
Relatórios Comerciais / SDR & Operação / Extração & Diagnóstico).
`extracao.html` tem uma segunda barra, só nela, com âncoras internas
(`#conexao`, `#configuracao`, `#bloco-periodo` etc.) para navegar dentro do
motor genérico — já que essa página é longa por natureza (é o "canivete
suíço" da ferramenta).

Cards de relatório (`cardRelatorioRapidoHTML`, usado tanto por
`renderizarAtalhosRelatorios` quanto por `renderizarAtalhosRelatoriosGrupo`)
chamam sempre `selecionarRelatorioRapido(chave)` (`js/ui.js`). Essa função foi
adaptada para o portal multi-página:

1. Se a página atual tem o wrapper `#fluxo-extracao` (hoje, só
   `extracao.html`): comportamento antigo — revela a seção, pré-seleciona o
   relatório, rola até `#configuracao`.
2. Senão, se a página atual já tem embutido o bloco dedicado daquele
   relatório (mapa `RELATORIO_BLOCO_DEDICADO_LOCAL`: `forecast_semanal` →
   `#bloco-forecast-semanal`, `diario_sdr` → `#bloco-diario-sdr`,
   `analise_sdr` → `#bloco-analise-sdr`) — caso de `forecast.html`/
   `sdr.html`: esconde os outros blocos dedicados locais (relevante em
   `sdr.html`, que tem dois), mostra o escolhido, pré-seleciona e rola até
   ele. Nenhuma navegação de página.
3. Senão (todos os outros casos — `index.html` sempre, e a maioria dos
   cards em `forecast.html`/`sdr.html`): navega para
   `extracao.html?relatorio=chave` (link real).

## Webhook entre páginas

`carregarWebhookSalvo()` (`js/bitrix-api.js`, já existia) é chamada na
inicialização de **toda** página que tem um campo `#webhook` (via
`iniciarExperienciaV7()`, chamada incondicionalmente por `js/app.js` em todas
as páginas — é segura em qualquer uma, cada passo interno já checa se o
elemento de que depende existe). Ou seja: se o usuário clicou "💾 Salvar
webhook" em qualquer página, o valor salvo (ofuscado, XOR+base64, não é
criptografia real — mesmo aviso de sempre) é carregado automaticamente em
qualquer outra página que ele abrir depois. Nenhum webhook em texto puro foi
adicionado em lugar novo — todos os cards de conexão reaproveitam exatamente
os mesmos botões/funções (`salvarWebhookNoNavegador`, `esquecerWebhookSalvo`,
`alternarVisibilidadeWebhook`, `testarConexaoBitrix`) e o mesmo aviso de
risco (resumido nas páginas compactas, com link para o aviso completo em
`extracao.html#conexao`).

## O que mudou no JS compartilhado

- **`js/app.js`**: cada função de boot agora só roda se o elemento raiz de
  que depende existe na página (`iniciar()` continua incondicional, mas foi
  ela mesma que ganhou os guards — ver abaixo; `iniciarCentralInteligenciaV10()`
  só roda se `#central-inteligencia-v10` existir; `iniciarFerramentasFlutuantes()`
  só se `#ferramentasFlutuantes` existir; `iniciarCockpitExecutivo()` roda se
  `#cockpit-executivo` **ou** `#cockpitTicker` existir, cobrindo tanto
  `cockpit.html` quanto o ticker de `index.html`).
- **`js/ui.js` → `iniciar()`**: a população de `#entidade`/`#relatorio` e a
  chamada de `aoTrocarEntidade(false)` só rodam se ambos os selects
  existirem; `construirCamposProdutosUI()` só roda se
  `#campos-produtos-contexto` existir. Sem essa mudança, `iniciar()` quebraria
  em qualquer página sem o motor genérico completo (`index.html`,
  `cockpit.html`).
- **`js/ui.js` → cards de relatório**: extraído `cardRelatorioRapidoHTML(chave,
  rel)` do corpo de `renderizarAtalhosRelatorios()`; nova
  `renderizarAtalhosRelatoriosGrupo(nomeGrupo, containerId)` reaproveita o
  mesmo template para os mini-portais.
- **`js/ui.js` → `selecionarRelatorioRapido`**: ver seção "Navegação entre
  páginas" acima.

## Decisões conservadoras tomadas (documentação de ambiguidades)

1. **`forecast.html`/`sdr.html` precisam de `#entidade`/`#relatorio`
   funcionais** (mesmo escondidos) porque `extrair()`, `aoTrocarEntidade()` e
   `aoTrocarRelatorio()` (todas em `js/extrator.js`/`js/ui.js`, reaproveitadas
   sem alteração) leem esses elementos incondicionalmente e tocam em
   `#card-campos`, `#bloco-categoria`, `#bloco-estagio`, `#bloco-vendedor`,
   `#bloco-origem`, `#bloco-campo-personalizado`, `#linha-campo-data`,
   `#nota-tudo` e nas 5 divs de nota por handler. A escolha mais segura (evita
   reescrever essas funções centrais, risco alto de regressão) foi manter
   todos esses elementos no DOM dessas duas páginas, escondidos
   (`class="oculto"` e/ou `style="display:none"`), deixando visível só o que
   é relevante (webhook, período, executar, e a(s) nota(s)/bloco(s) do(s)
   relatório(s) dedicado(s) daquela página).
2. **Botão "🤖 Perguntar à IA" nos blocos dedicados de `forecast.html`/
   `sdr.html`**: como a Central de Inteligência v10 só existe em
   `extracao.html`, esse botão passou a navegar para
   `extracao.html?relatorio=chave&ia=1` em vez de chamar
   `abrirIAParaRelatorio()` localmente (que antes silenciosamente não fazia
   nada nessas páginas, por falta do elemento `#central-inteligencia-v10`).
3. **`index.html` precisa de um campo `#webhook`** mesmo não tendo o wizard
   completo, porque o ticker do Cockpit (`cockpitIniciarAutoAtualizacao`)
   lê `document.getElementById("webhook").value` sem guarda. Decisão
   conservadora: incluir um card de "Conexão rápida" compacto (mesmo padrão
   usado em `cockpit.html`/`forecast.html`/`sdr.html`), preservando o
   requisito explícito de auto-atualização do ticker.
4. **`Relatorios AtlasGR.html`** não foi apagado — virou um redirect simples
   para `index.html` (mesmo padrão que `index.html` usava antes, invertido),
   com um comentário no topo explicando a mudança, preservando links antigos
   salvos/compartilhados.

## Checagem de regressão feita

- `node --check` em `js/ui.js` e `js/app.js` (rodado fora da raiz do repo,
  numa pasta sem `package.json`, porque o `package.json` do projeto tem
  `"type": "module"` e faz o Node tratar esses arquivos — que são scripts
  clássicos carregados via `<script src>`, não módulos ES — como ES module,
  gerando falso-positivo; ver observação abaixo) e em cada `<script>` inline
  de cada página nova: todos passam.
- Para cada página nova, todo `onclick`/`onchange`/`oninput`/`onkeydown`
  referenciado tem uma função `function nomeDaFuncao(` correspondente em
  algum `js/*.js` **ou** no próprio `<script>` inline da página (checagem
  automatizada, script Node ad-hoc) — nenhuma pendência encontrada.
- Nenhum `id` duplicado dentro da mesma página (checagem automatizada).
- Nenhuma âncora `href="#id"` quebrada (aponta para um `id` inexistente na
  mesma página) e nenhum link entre páginas (`href="pagina.html"`) aponta
  para um arquivo que não existe (checagem automatizada).
- Revisão manual, função por função, de todo o caminho de inicialização
  (`iniciar()` → `aoTrocarEntidade()` → `aoTrocarRelatorio()` →
  `aplicarPeriodoRelatorioEspecial()`, e a cadeia do Cockpit `iniciarCockpitExecutivo()`
  → `cockpitAtualizarTicker()`/`cockpitIniciarAutoAtualizacao()`) confirmando
  que cada elemento tocado incondicionalmente (sem `?.`) existe em toda
  página onde a função é chamada.

**Achado pré-existente, fora do escopo desta tarefa** (não introduzido por
esta reestruturação): `js/ui.js` tinha (antes desta tarefa também) duas
declarações da função `aplicarFiltroCampos` — a primeira é código morto,
sobrescrita pela segunda. Isso faz `node --check js/ui.js` falhar quando
rodado a partir da raiz do repo (por causa do `"type": "module"` do
`package.json`), embora não afete o navegador (scripts clássicos permitem
redeclaração de função). Foi aberta uma tarefa separada para remover a
duplicata — ver chip/tarefa "Remove duplicate aplicarFiltroCampos in
ui.js".

## Regras seguidas (não violadas)

- Regressão zero: toda funcionalidade que existia continua acessível a
  partir de alguma página do portal (ver mapeamento "o que foi movido pra
  onde" acima).
- Nenhuma lógica JS duplicada — todas as páginas carregam os mesmos
  `js/*.js`; a duplicação que existe é só de HTML (permitida explicitamente
  pelo escopo desta tarefa, já que cada página é um documento HTML
  separado).
- Nenhum webhook em texto puro em lugar novo — todos os cards de conexão
  reaproveitam os mesmos padrões de ofuscação/aviso já existentes.
- `.github/workflows/pages.yml` já publica todo `*.html` da raiz
  automaticamente (`cp *.html _site/`) — nenhuma mudança necessária.

## Senha única (acesso restrito) — v26

Todas as 6 páginas do portal (não o redirect `Relatorios AtlasGR.html`)
carregam um overlay `#loginGate` logo após `<body class="aguardando-login">`
e `js/auth.js` como o **primeiro** `<script>` da página. Enquanto o `<body>`
tiver a classe `aguardando-login`, uma regra CSS (`css/styles.css`) esconde
tudo que não seja o próprio gate — não há flash de conteúdo antes do JS
rodar, porque a classe já vem escrita no HTML, não é adicionada via JS.

`js/auth.js` compara a senha digitada (hash SHA-256, via Web Crypto —
`crypto.subtle.digest`) contra uma constante `SENHA_HASH`. **Não é
segurança forte** — é só para afastar acesso casual de quem não tem o
link/senha, conforme pedido explicitamente. Ao acertar, grava
`atlas-portal-auth-ok=1` no `localStorage` (desbloqueio persiste entre
sessões, até alguém clicar em "🔒 Sair" na navegação ou limpar os dados do
navegador). Para trocar a senha, gere o novo hash SHA-256 e substitua
`SENHA_HASH` em `js/auth.js` (comentário no topo do arquivo explica como).

## Pontos de atenção + alerta expandido — v26

`scripts/forecast-semanal.mjs` (a mesma automação semanal que já gravava
`relatorios/forecast-semanal/historico.json`) agora também conta, a partir
do mesmo laço de negócios que já percorre (sem chamada extra ao Bitrix):
negócios com CLOSEDATE vencida ainda abertos, e negócios abertos sem
CLOSEDATE preenchida. Esses números entram (a) no `historico.json`
compartilhado (lido por `evolucao.html`, novo card "Pontos de atenção"), (b)
na seção nova do relatório em Markdown, e (c) no alerta proativo
(`ALERTA_WEBHOOK_URL`), que agora dispara por qualquer um dos três motivos
(projeção fora da meta, CLOSEDATE vencida, ou sem CLOSEDATE) — cada motivo
some do texto quando não se aplica.

## Baixar PDF — v26

O botão "🖨️ PDF" no modal de relatório (`js/forecast.js`,
`baixarRelatorioVisualPDF()`) chama `iframe.contentWindow.print()` — o
relatório já tem regras `@media print` próprias (sem "pisca", sem cortar
cards no meio de página). "Salvar como PDF" é uma das impressoras do
diálogo nativo do navegador; não há biblioteca de PDF nova (o portal
continua 100% estático, sem etapa de build).
