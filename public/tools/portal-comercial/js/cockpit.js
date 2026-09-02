// ---------------------------------------------------------------------------
// Cockpit Comercial Executivo
// ---------------------------------------------------------------------------
// Nova visão (landing) da mesma ferramenta. Não duplica fórmulas de negócio:
// reaproveita os mesmos helpers já usados pelo Forecast semanal e pelo
// Catálogo de relatórios (js/jornada.js, js/catalogo-relatorios.js, js/config.js):
// semanticaDeal, ehEstagioPiloto, probabilidadeFallbackForecast,
// classificarBucketForecast, baseDealsCatalogo, enriquecerDealCatalogo,
// dentroPeriodoCatalogo, metaMensalPadrao, tabelaRelatorio, moedaRelatorio etc.
//
// Regras seguidas (ver AUDITORIA_ESTADO_ATUAL.md / prompt mestre):
// - Pipeline != Forecast: nunca mostramos "Pipeline Total" como número de
//   previsão de fechamento — ficam em blocos e cores separados.
// - Nenhum valor de exemplo hardcoded: tudo vem de cálculo sobre os negócios
//   extraídos do Bitrix nesta sessão.
// - Quando um número não pode ser calculado com confiança (ex: sem meta
//   informada, sem CLOSEDATE, amostra vazia), mostramos "não disponível" —
//   nunca 0 silencioso.
// - Fonte de meta: campos editáveis, pré-preenchidos com
//   METAS_FORECAST_MENSAL_PADRAO (js/config.js) só como ponto de partida.

let cockpitState = {
  carregando: false,
  ultimaAtualizacao: null,
  deals: [],           // negócios Comercial (CATEGORY_ID=0) já enriquecidos (_SEMANTICA, _ESTAGIO, ...)
  dealsFiltrados: [],  // após filtro de vendedor/origem
  meta: null,           // metadados de funil/estágio (buscarMetadadosFunisEEstagios)
  periodo: { inicio: "", fim: "" },
};

// Guarda, por card clicável, a lista de negócios que compõe aquele número —
// é a base do drill-down (requisito 9 do Cockpit).
let cockpitDrill = {};

function cockpitEl(id) { return document.getElementById(id); }

// O painel completo do Cockpit (todos os blocos, filtros, exportações) começa
// recolhido -- a primeira tela deve mostrar só o ticker e os cards de
// relatório. Ver <botão "Ver painel completo"> ou o link do ticker abrem.
function alternarCockpitCompleto() {
  const card = cockpitEl("cockpit-executivo");
  if (!card) return;
  const recolhido = card.classList.toggle("cockpit-recolhido");
  const btn = cockpitEl("cockpitBtnExpandir");
  if (btn) btn.textContent = recolhido ? "▾ Ver painel completo" : "▴ Recolher painel";
}
function expandirCockpitCompleto() {
  const card = cockpitEl("cockpit-executivo");
  if (card && card.classList.contains("cockpit-recolhido")) alternarCockpitCompleto();
  if (typeof revelarFluxoExtracao === "function") revelarFluxoExtracao();
}

// ---------------------------------------------------------------------------
// Inicialização (chamada por js/app.js)
// ---------------------------------------------------------------------------
function iniciarCockpitExecutivo() {
  const hojeISO = formatarDataISO(new Date());
  const metaInput = cockpitEl("cockpitMetaMensal");
  if (metaInput && !metaInput.value) {
    const padrao = metaMensalPadrao(hojeISO);
    if (padrao) metaInput.value = padrao;
  }
  // Metas M/M+1/M+2/M+3 pré-preenchidas com METAS_FORECAST_MENSAL_PADRAO —
  // fonte local e editável, não depende de outra plataforma (requisito do escopo).
  for (let i = 0; i < 4; i++) {
    const d = new Date(hojeISO + "T12:00:00");
    d.setMonth(d.getMonth() + i);
    const mesISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const input = cockpitEl(`cockpitMetaM${i}`);
    if (input && !input.value) {
      const padrao = metaMensalPadrao(mesISO);
      if (padrao) input.value = padrao;
    }
  }
  atualizarRelogioCockpit();
  cockpitRenderEstadoVazio();
  cockpitAtualizarTicker();
  cockpitAtualizarResumoHome();
  cockpitIniciarAutoAtualizacao();
  initDragAndDrop();
}

// ---------------------------------------------------------------------------
// Ticker (faixa "bolsa de valores") — mostrado na primeira tela, junto com os
// cards. Não recalcula nada: só projeta cockpitState.ultimoCalculo (o mesmo
// cache usado pela Situação Agora e pelas exportações) como uma lista curta
// de itens em texto corrido, rolando em loop via CSS.
// ---------------------------------------------------------------------------
function cockpitTickerItens() {
  const cache = cockpitState.ultimoCalculo;
  if (!cache) return ["Sem dados carregados nesta sessão — abra um relatório abaixo ou configure o webhook para atualizar automaticamente."];
  const { c, g, alertasInfo } = cache;
  const itens = [
    `Meta do mês: ${c.resultadoMes.metaMensal ? moedaRelatorio(c.resultadoMes.metaMensal) : "não informada"}`,
    `Fechado: ${moedaRelatorio(c.resultadoMes.fechadoMes)} (${cockpitND(c.resultadoMes.pctMeta, (v) => `${v}%`)} da meta)`,
    `Forecast total: ${moedaRelatorio(c.forecast.forecastTotal)}`,
    `Commit: ${moedaRelatorio(c.forecast.commit)} · Best Case: ${moedaRelatorio(c.forecast.bestCase)}`,
    `Pipeline elegível: ${moedaRelatorio(c.saude.pipelineElegivel)}`,
    `Coverage: ${c.saude.coverage === "meta batida" ? "meta já batida" : cockpitND(c.saude.coverage, (v) => `${v.toFixed(2)}x`)}`,
    `Pipeline criado no período: ${moedaRelatorio(c.saude.pipelineCriadoPeriodo)}`,
    `Win Rate: ${cockpitND(c.eficiencia.winRate, (v) => `${v}%`)}`,
  ];
  if (g) itens.push(`Ritmo de geração de pipeline: ${cockpitND(g.paceRitmoPct, (v) => `${v}%`)}`);
  const nAlertas = alertasInfo?.alertas?.length || 0;
  const nCriticos = alertasInfo?.alertas?.filter((a) => a.nivel === "critico").length || 0;
  itens.push(nAlertas ? `🔔 ${nAlertas} alerta(s) ativo(s)${nCriticos ? ` (${nCriticos} crítico(s))` : ""}` : "🟢 Nenhum alerta ativo");
  return itens;
}

function cockpitAtualizarTicker() {
  const track = cockpitEl("cockpitTickerTrack");
  if (!track) return;
  const itens = cockpitTickerItens();
  // Duplica a lista para o loop do CSS (translateX -50%) ficar contínuo, sem "salto".
  const html = itens.map((t) => `<span class="cockpit-ticker-item">${escapeHtmlRelatorio(t)}</span>`).join("");
  track.innerHTML = html + html;
  const label = document.querySelector("#cockpitTicker .cockpit-ticker-label");
  if (label) label.title = cockpitState.ultimaAtualizacao ? `Atualizado às ${cockpitState.ultimaAtualizacao.toLocaleTimeString("pt-BR")}` : "Ainda sem dados nesta sessão";
}

// Resumo em cards (home.html) dos mesmos números do ticker acima — só existe
// `#cockpitResumoHome` em home.html/totaltrac-home.html, então é um no-op nas
// outras páginas (mesmo padrão de guarda de `cockpitEl` usado no resto do
// arquivo). Reaproveita cockpitKpiCard() (classe `.cockpit-kpi`, já usada no
// Cockpit completo) em vez de inventar uma segunda linguagem visual de KPI
// numa página vizinha. Sem drill-down aqui (chaveDrill=null) — o drill-down
// de verdade já existe nos mesmos números dentro de cockpit.html.
function cockpitAtualizarResumoHome() {
  const el = cockpitEl("cockpitResumoHome");
  if (!el) return;
  const cache = cockpitState.ultimoCalculo;
  if (!cache) {
    el.classList.add("oculto");
    el.innerHTML = "";
    return;
  }
  const { c } = cache;
  el.classList.remove("oculto");
  el.innerHTML = [
    cockpitKpiCard("Fechado no mês", moedaRelatorio(c.resultadoMes.fechadoMes), null, "", `${cockpitND(c.resultadoMes.pctMeta, (v) => `${v}%`)} da meta`),
    cockpitKpiCard("Forecast total", moedaRelatorio(c.forecast.forecastTotal), null),
    cockpitKpiCard("Pipeline elegível", moedaRelatorio(c.saude.pipelineElegivel), null),
    cockpitKpiCard("Win Rate", cockpitND(c.eficiencia.winRate, (v) => `${v}%`), null),
  ].join("");
}

// Atualização automática: só roda sozinha se o usuário já salvou o webhook no
// navegador (não faz sentido tentar em silêncio com um campo vazio, e nunca
// pedimos o webhook de novo sem ação do usuário). A cada 5 minutos — bem
// abaixo de qualquer limite de taxa do Bitrix, já que é sempre uma única
// consulta por vez, igual ao clique manual em "Atualizar agora".
const COCKPIT_AUTO_ATUALIZACAO_MS = 5 * 60 * 1000;
let cockpitAutoAtualizacaoTimer = null;
function cockpitIniciarAutoAtualizacao() {
  if (cockpitAutoAtualizacaoTimer) return;
  cockpitAutoAtualizacaoTimer = setInterval(() => {
    if (cockpitState.carregando) return;
    const salvo = typeof obterWebhookSalvo === "function" ? obterWebhookSalvo() : "";
    if (!salvo) return;
    const campo = document.getElementById("webhook");
    if (campo && !campo.value.trim()) campo.value = salvo;
    atualizarCockpit();
  }, COCKPIT_AUTO_ATUALIZACAO_MS);
}

function atualizarRelogioCockpit() {
  const el = cockpitEl("cockpitUltimaAtualizacao");
  if (!el) return;
  if (!cockpitState.ultimaAtualizacao) {
    el.textContent = "Última atualização: ainda não carregado nesta sessão.";
    return;
  }
  const d = cockpitState.ultimaAtualizacao;
  const dd = String(d.getDate()).padStart(2, "0"), mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0"), mi = String(d.getMinutes()).padStart(2, "0");
  el.textContent = `Última atualização: ${dd}/${mm}/${d.getFullYear()} ${hh}:${mi} · Fonte: Bitrix24`;
}

// ---------------------------------------------------------------------------
// Filtros (período / vendedor / origem / produto)
// ---------------------------------------------------------------------------
function cockpitPeriodoFiltro() {
  const preset = cockpitEl("cockpitPeriodoPreset")?.value || "mensal";
  if (preset === "personalizado") {
    return {
      inicio: cockpitEl("cockpitDataInicio")?.value || "",
      fim: cockpitEl("cockpitDataFim")?.value || "",
    };
  }
  const intervalo = calcularIntervaloPreset(preset) || { inicio: "", fim: "" };
  return intervalo;
}

function aoTrocarPeriodoCockpit() {
  const preset = cockpitEl("cockpitPeriodoPreset")?.value;
  document.querySelectorAll(".cockpit-periodo-custom").forEach((el) => el.classList.toggle("oculto", preset !== "personalizado"));
}

async function carregarVendedoresCockpit() {
  const webhook = document.getElementById("webhook").value.trim();
  const erro = validarWebhook(webhook);
  if (erro) { mostrarErro(erro); return; }
  try {
    const usuarios = await carregarListaPaginada(webhook, "user.get", {});
    const sel = cockpitEl("cockpitVendedor");
    if (!sel) return;
    const anterior = sel.value;
    sel.innerHTML = '<option value="">Todos os vendedores</option>';
    usuarios.slice().sort((a, b) => `${a.NAME || ""} ${a.LAST_NAME || ""}`.localeCompare(`${b.NAME || ""} ${b.LAST_NAME || ""}`))
      .forEach((u) => {
        const opt = document.createElement("option");
        opt.value = u.ID;
        opt.textContent = `${u.NAME || ""} ${u.LAST_NAME || ""}`.trim() + ` (ID ${u.ID})`;
        sel.appendChild(opt);
      });
    if ([...sel.options].some((o) => o.value === anterior)) sel.value = anterior;
  } catch (e) {
    mostrarErro("Não consegui carregar a lista de vendedores para o Cockpit.\n\nDetalhe técnico: " + e.message);
  }
}

async function carregarOrigensCockpit() {
  const webhook = document.getElementById("webhook").value.trim();
  const erro = validarWebhook(webhook);
  if (erro) { mostrarErro(erro); return; }
  try {
    const origens = await mapaOrigensRelatorio(webhook);
    const sel = cockpitEl("cockpitOrigem");
    if (!sel) return;
    const anterior = sel.value;
    sel.innerHTML = '<option value="">Todas as origens</option>';
    Object.entries(origens).forEach(([id, nome]) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = nome;
      sel.appendChild(opt);
    });
    if ([...sel.options].some((o) => o.value === anterior)) sel.value = anterior;
  } catch (e) {
    mostrarErro("Não consegui carregar a lista de origens para o Cockpit.\n\nDetalhe técnico: " + e.message);
  }
}

// Filtro de produto: não existe infraestrutura de filtro por produto nos
// relatórios do catálogo (ver AUDITORIA_ESTADO_ATUAL.md, seção 7) porque
// crm.deal.productrows.get é uma chamada por negócio (N+1, caro). Para não
// pagar esse custo em todo carregamento do Cockpit, o filtro de produto aqui
// é opcional/sob demanda: só busca produtos quando o usuário efetivamente
// filtra por um texto, e só para o conjunto de negócios já carregado.
async function aplicarFiltroProdutoCockpit() {
  const termo = (cockpitEl("cockpitProduto")?.value || "").trim();
  const status = cockpitEl("cockpitProdutoStatus");
  if (!termo) {
    cockpitState.dealsFiltrados = cockpitFiltrarPorVendedorOrigem(cockpitState.deals);
    if (status) status.textContent = "";
    renderizarCockpit();
    return;
  }
  const webhook = document.getElementById("webhook").value.trim();
  if (!cockpitState.deals.length) { mostrarErro("Clique em \"Atualizar agora\" antes de filtrar por produto."); return; }
  if (status) status.textContent = "Buscando produtos dos negócios carregados (pode levar alguns segundos)...";
  const base = cockpitFiltrarPorVendedorOrigem(cockpitState.deals);
  const normTermo = normalizarTextoChave(termo);
  const comProduto = [];
  for (let i = 0; i < base.length; i++) {
    if (extracaoCancelada) break;
    const d = base[i];
    try {
      const body = await bitrixFetchComRetentativa(`${webhook.replace(/\/$/, "")}/crm.deal.productrows.get.json?id=${encodeURIComponent(d.ID)}`);
      const linhas = body.result || [];
      if (linhas.some((x) => normalizarTextoChave(x.PRODUCT_NAME || "").includes(normTermo))) comProduto.push(d);
    } catch (e) { /* ignora negócio com erro pontual, não interrompe o filtro */ }
    await aguardar(60);
  }
  cockpitState.dealsFiltrados = comProduto;
  if (status) status.textContent = `${comProduto.length} negócio(s) com produto correspondente a "${escapeHtmlRelatorio(termo)}" entre os ${base.length} carregados.`;
  renderizarCockpit();
}

// Vendedor/Origem já vieram na extração (só o Comercial é buscado); trocar o
// filtro não precisa de nova ida ao Bitrix, só reaplica sobre o cache local.
function cockpitReaplicarFiltros() {
  if (!cockpitState.deals.length) return;
  const termo = (cockpitEl("cockpitProduto")?.value || "").trim();
  if (termo) { aplicarFiltroProdutoCockpit(); return; }
  cockpitState.dealsFiltrados = cockpitFiltrarPorVendedorOrigem(cockpitState.deals);
  renderizarCockpit();
}

function cockpitFiltrarPorVendedorOrigem(deals) {
  const vendedor = cockpitEl("cockpitVendedor")?.value || "";
  const origem = cockpitEl("cockpitOrigem")?.value || "";
  return deals.filter((d) => {
    if (vendedor && idBitrixString(d.ASSIGNED_BY_ID) !== String(vendedor)) return false;
    if (origem && String(d.SOURCE_ID || "") !== String(origem)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Carregamento principal
// ---------------------------------------------------------------------------
async function atualizarCockpit() {
  const webhook = document.getElementById("webhook").value.trim();
  const erro = validarWebhook(webhook);
  if (erro) { mostrarErro(erro); return; }
  if (cockpitState.carregando) return;
  cockpitState.carregando = true;
  esconderErro();
  extracaoCancelada = false;
  const btn = cockpitEl("cockpitBtnAtualizar");
  if (btn) btn.disabled = true;
  cockpitRenderEstadoSkeleton();
  atualizarStatus("Cockpit: buscando negócios do funil Comercial...");
  try {
    const base = await baseDealsCatalogo(webhook, true); // somenteComercial=true → CATEGORY_ID 0
    const enriquecidos = base.deals.map((d) => enriquecerDealCatalogo(d, base));
    cockpitState.deals = enriquecidos;
    cockpitState.dealsFiltrados = cockpitFiltrarPorVendedorOrigem(enriquecidos);
    cockpitState.meta = base.meta;
    cockpitState.periodo = cockpitPeriodoFiltro();
    cockpitState.ultimaAtualizacao = new Date();
    const filtroProduto = cockpitEl("cockpitProduto")?.value?.trim();
    if (filtroProduto) {
      await aplicarFiltroProdutoCockpit();
    } else {
      renderizarCockpit();
    }
    atualizarRelogioCockpit();
    atualizarStatus(`Cockpit atualizado: ${enriquecidos.length} negócio(s) do Comercial carregado(s).`);
  } catch (e) {
    mostrarErro("Não foi possível atualizar o Cockpit Executivo.\n\nDetalhe técnico: " + e.message);
  } finally {
    cockpitState.carregando = false;
    if (btn) btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Cálculos (reaproveitando fórmulas já existentes — não redefine forecast)
// ---------------------------------------------------------------------------

function cockpitMesAtual() {
  const hojeISO = formatarDataISO(new Date());
  const [ano, mes] = hojeISO.split("-").map(Number);
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = formatarDataISO(new Date(ano, mes, 0));
  return { inicio, fim, referencia: hojeISO, hojeISO };
}

// Classifica um negócio aberto (não-piloto) usando a mesma probabilidade do
// Forecast semanal/mensal (Bitrix quando existir, senão
// probabilidadeFallbackForecast) — mas o BUCKET usa thresholds próprios do
// Cockpit (ver cockpitClassificarBucketForecast abaixo), não
// classificarBucketForecast.
function cockpitClassificarAberto(d) {
  const pr = Number(d.PROBABILITY);
  const usaBitrix = Number.isFinite(pr) && pr > 0 && pr <= 100;
  const prob = usaBitrix ? pr : probabilidadeFallbackForecast(d._ESTAGIO, d._SEMANTICA);
  const bucket = cockpitClassificarBucketForecast(prob);
  return { prob, bucket, ponderado: d._VALOR * prob / 100 };
}

// ---------------------------------------------------------------------------
// Classificação de bucket do Forecast — ESPECÍFICA DO COCKPIT.
// ---------------------------------------------------------------------------
// Convergência com a Central de Inteligência Comercial (auditoria de
// comparação entre os dois projetos, divergência #1): o motor de forecast
// testado da Central (CENTRAL-DE-INTELIGENCIA-COMECIAL-ATLASGR,
// src/features/commercial-intelligence/application/forecastEngine.ts,
// FORECAST_RULES) usa Commit ≥70%, Best Case ≥40%, Pipeline ≥10%, e abaixo
// disso é "Upside" (baixíssima probabilidade).
//
// NÃO reaproveitamos classificarBucketForecast (js/jornada.js, thresholds
// 80%/50%, sem tier "Upside") porque essa função é a fonte de verdade do
// Forecast Semanal (js/forecast.js) e do relatório "Forecast Mensal" do
// Catálogo (js/catalogo-relatorios.js) — mudar os thresholds ali quebraria os
// dois relatórios, que não fizeram parte desta convergência com a Central.
// Por isso o Cockpit ganhou esta função própria, só para si.
function cockpitClassificarBucketForecast(prob) {
  if (prob >= 70) return "Commit";
  if (prob >= 40) return "Best Case";
  if (prob >= 10) return "Pipeline";
  return "Upside";
}

// ---------------------------------------------------------------------------
// Pipeline Elegível — critérios convergidos com pipelineEligibility.ts da
// Central de Inteligência Comercial (divergência #2 da auditoria).
// ---------------------------------------------------------------------------
// A Central exige, para um negócio ser "elegível" (condição real de
// fechar), que TODOS os critérios sejam verdadeiros:
//   1. Aberto (não ganho/perdido)             → já garantido por _SEMANTICA
//   2. Valor > 0                              → d._VALOR > 0
//   3. Data prevista de fechamento preenchida → CLOSEDATE
//   4. Responsável preenchido                 → ASSIGNED_BY_ID
//   5. "Próxima ação" preenchida              → NÃO IMPLEMENTADO AQUI (ver nota abaixo)
//   6. Aging na etapa atual ≤ 45 dias         → MOVED_TIME
//
// LIMITAÇÃO CONHECIDA (documentar sempre que este cálculo for citado): este
// projeto não extrai nenhum campo de "próxima ação"/"próxima atividade
// agendada" para negócios — crm.deal.list (ver ENTIDADES em js/config.js e
// enriquecerDealCatalogo em js/catalogo-relatorios.js) não busca esse dado
// hoje, e não há infraestrutura de N+1 para buscar atividades futuras por
// negócio no Cockpit. Por isso o critério 5 NÃO é aplicado — inventar esse
// dado violaria a regra do projeto de nunca fabricar informação que não
// existe no Bitrix configurado para este cliente. Consequência prática:
// o Pipeline Elegível deste projeto é mais PERMISSIVO que o da Central
// nesse ponto específico (um negócio sem nenhuma próxima ação registrada
// ainda pode contar como elegível aqui, desde que passe nos outros 5
// critérios). Os outros 5 critérios são implementados fielmente, incluindo
// o mesmo threshold de aging crítico (45 dias) usado pela Central
// (STAGE_AGING_CRITICAL_DAYS em pipelineEligibility.ts).
const COCKPIT_AGING_CRITICO_ELEGIBILIDADE_DIAS = 45;

// Aging na etapa atual, em dias — mesma base (MOVED_TIME) já usada pelo
// bloco "Pipeline por Estágio" (G) e pelo alerta de aging alto. `null`
// quando MOVED_TIME não está preenchido (nunca estimamos um valor aqui).
function cockpitAgingAtualDias(d, refISO) {
  const mt = parteDataISO(d.MOVED_TIME);
  if (!mt) return null;
  return Math.max(0, Math.floor((new Date(`${refISO}T12:00:00`) - new Date(`${mt}T12:00:00`)) / 86400000));
}

// Verifica os 5 critérios de elegibilidade aplicáveis (ver nota da
// limitação acima) e devolve os motivos de reprovação — usado no
// drill-down de "Pipeline inelegível" para explicar cada negócio de fora.
function cockpitVerificarElegibilidade(d, refISO) {
  const motivos = [];
  if (ehEstagioPiloto(d.STAGE_ID, d._ESTAGIO)) motivos.push("Estágio Piloto (fora do critério de elegibilidade)");
  if (!(Number(d._VALOR) > 0)) motivos.push("Sem valor válido");
  if (!parteDataISO(d.CLOSEDATE)) motivos.push("Sem data prevista de fechamento (CLOSEDATE)");
  if (!idBitrixValido(d.ASSIGNED_BY_ID)) motivos.push("Sem responsável");
  const aging = cockpitAgingAtualDias(d, refISO);
  if (aging != null && aging > COCKPIT_AGING_CRITICO_ELEGIBILIDADE_DIAS) {
    motivos.push(`Aging acima do crítico (${aging}d > ${COCKPIT_AGING_CRITICO_ELEGIBILIDADE_DIAS}d)`);
  }
  return { elegivel: motivos.length === 0, motivos };
}

// Coverage recomendado — convergido com CommercialIntelligenceUseCases.ts
// da Central (divergência #3 da auditoria): coverageRecommended = 1 /
// (winRate/100), derivado do Win Rate histórico REAL do período filtrado
// (não um threshold fixo). `null` quando o Win Rate não é calculável
// (winRate null ou 0) — nunca inventa um número.
function cockpitCoverageRecomendado(winRate) {
  if (winRate == null || !Number.isFinite(winRate) || winRate <= 0) return null;
  return 1 / (winRate / 100);
}

function cockpitCalcular() {
  const deals = cockpitState.dealsFiltrados || [];
  const mes = cockpitMesAtual();
  const drill = {};

  // -------------------- A) Resultado do Mês (sempre mês-calendário atual) --
  const ganhosMes = deals.filter((d) => d._SEMANTICA === "success" && dentroPeriodoCatalogo(d._FECHAMENTO, mes));
  const fechadoMes = ganhosMes.reduce((a, d) => a + d._VALOR, 0);
  const metaMensal = Number(cockpitEl("cockpitMetaMensal")?.value) || 0;
  const pctMeta = metaMensal > 0 ? Math.round((fechadoMes / metaMensal) * 1000) / 10 : null;
  const gapMeta = metaMensal > 0 ? Math.max(0, metaMensal - fechadoMes) : null;
  const ticketMedioMes = ganhosMes.length ? fechadoMes / ganhosMes.length : null;
  drill.resultadoMesFechado = ganhosMes;
  drill.resultadoMesGap = ganhosMes; // mesmo conjunto: o que falta é sobre o que já foi fechado

  // -------------------- B) Forecast (Commit / Best Case / Pipeline / Upside) --
  // FÓRMULA CONVERGIDA COM A CENTRAL DE INTELIGÊNCIA COMERCIAL (auditoria de
  // comparação, divergência #1 — ver forecastEngine.ts e
  // CommercialIntelligenceUseCases.executiveOverview no outro projeto):
  //   Commit e Best Case entram em VALOR CHEIO (não ponderado) no forecast —
  //   são tiers de alta probabilidade; ponderar por probabilidade os
  //   subestimava sem necessidade. Só o tier "Pipeline" (probabilidade
  //   intermediária) entra PONDERADO (valor × probabilidade/100). O tier
  //   "Upside" (probabilidade muito baixa, <10%) NÃO entra no forecast total
  //   — nem cheio, nem ponderado — é mostrado à parte, só como referência.
  //   ForecastTotal = Fechado + Commit(bruto) + BestCase(bruto) + Pipeline(ponderado).
  //
  // FÓRMULA ANTIGA (divergente, corrigida nesta convergência): todo o
  // pipeline aberto do mês (Commit + Best Case + Pipeline, tudo junto) entrava
  // ponderado por probabilidade (`ponderado += valor*prob/100` para todos os
  // buckets) — isso subestimava sistematicamente o forecast em negócios de
  // alta probabilidade (Commit/Best Case).
  const abertosMes = deals.filter((d) => d._SEMANTICA === "process" && !ehEstagioPiloto(d.STAGE_ID, d._ESTAGIO) && dentroPeriodoCatalogo(d.CLOSEDATE, mes));
  let commit = 0, bestCase = 0, pipelineForecast = 0, upside = 0, pipelinePonderado = 0;
  const linhasCommit = [], linhasBest = [], linhasPipe = [], linhasUpside = [];
  abertosMes.forEach((d) => {
    const { bucket, prob } = cockpitClassificarAberto(d);
    if (bucket === "Commit") { commit += d._VALOR; linhasCommit.push(d); }
    else if (bucket === "Best Case") { bestCase += d._VALOR; linhasBest.push(d); }
    else if (bucket === "Pipeline") { pipelineForecast += d._VALOR; pipelinePonderado += d._VALOR * prob / 100; linhasPipe.push(d); }
    else { upside += d._VALOR; linhasUpside.push(d); }
  });
  const forecastTotal = fechadoMes + commit + bestCase + pipelinePonderado;
  const gapForecast = metaMensal > 0 ? Math.max(0, metaMensal - forecastTotal) : null;
  drill.forecastCommit = linhasCommit;
  drill.forecastBestCase = linhasBest;
  drill.forecastPipeline = linhasPipe;
  drill.forecastUpside = linhasUpside;
  drill.forecastTotal = [...linhasCommit, ...linhasBest, ...linhasPipe]; // Upside não entra no forecast total

  // -------------------- Período do filtro (usado por F, C e D abaixo) ------
  const periodoSelecionado = cockpitPeriodoFiltro();
  const periodoFiltro = (periodoSelecionado.inicio || periodoSelecionado.fim) ? periodoSelecionado : mes;

  // -------------------- F) Eficiência da Máquina ----------------------------
  // (calculado antes de C/D porque o Win Rate daqui alimenta o Coverage
  // Recomendado — divergência #3, ver cockpitCoverageRecomendado.)
  const fechadosPeriodo = deals.filter((d) => d._SEMANTICA !== "process" && dentroPeriodoCatalogo(d._FECHAMENTO, periodoFiltro));
  const ganhosPeriodo = fechadosPeriodo.filter((d) => d._SEMANTICA === "success");
  const perdidosPeriodo = fechadosPeriodo.filter((d) => d._SEMANTICA === "failure");
  const winRate = (ganhosPeriodo.length + perdidosPeriodo.length) > 0
    ? Math.round((ganhosPeriodo.length / (ganhosPeriodo.length + perdidosPeriodo.length)) * 1000) / 10
    : null;
  const receitaGanhaPeriodo = ganhosPeriodo.reduce((a, d) => a + d._VALOR, 0);
  const ticketMedioVendido = ganhosPeriodo.length ? receitaGanhaPeriodo / ganhosPeriodo.length : null;
  const ciclos = ganhosPeriodo.map((d) => Number(d._CICLO)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const cicloMedia = ciclos.length ? Math.round((ciclos.reduce((a, b) => a + b, 0) / ciclos.length) * 10) / 10 : null;
  const cicloMediana = ciclos.length ? (ciclos.length % 2 ? ciclos[(ciclos.length - 1) / 2] : Math.round(((ciclos[ciclos.length / 2 - 1] + ciclos[ciclos.length / 2]) / 2) * 10) / 10) : null;
  drill.winRateGanhos = ganhosPeriodo;
  drill.winRatePerdidos = perdidosPeriodo;
  drill.cicloVenda = ganhosPeriodo;

  // -------------------- C) Saúde do Pipeline --------------------------------
  const abertosTodos = deals.filter((d) => d._SEMANTICA === "process");
  const pipelineTotal = abertosTodos.reduce((a, d) => a + d._VALOR, 0);
  // Pipeline Elegível — CRITÉRIOS CONVERGIDOS COM A CENTRAL (divergência #2,
  // ver cockpitVerificarElegibilidade acima: aberto/não-piloto, valor>0,
  // CLOSEDATE preenchida, responsável preenchido, aging ≤45d na etapa atual
  // — critério de "próxima ação preenchida" da Central NÃO é aplicado aqui,
  // ver limitação documentada em cockpitVerificarElegibilidade), MAIS o
  // filtro de período que já existia neste projeto (CLOSEDATE dentro do
  // período selecionado no Cockpit) — esse recorte por período é uma decisão
  // de arquitetura própria deste Cockpit (Coverage = elegível ÷ gap DO
  // PERÍODO escolhido), não algo definido pela Central, e foi mantido para
  // não quebrar a leitura de Coverage/Proteção de Receita já em uso.
  const elegibilidadeTodos = abertosTodos.map((d) => ({ deal: d, check: cockpitVerificarElegibilidade(d, mes.hojeISO) }));
  const abertosElegiveis = elegibilidadeTodos
    .filter(({ deal, check }) => check.elegivel && dentroPeriodoCatalogo(deal.CLOSEDATE, periodoFiltro))
    .map(({ deal }) => deal);
  const inelegiveisComMotivo = elegibilidadeTodos
    .filter(({ check }) => !check.elegivel)
    .map(({ deal, check }) => ({ ...deal, _MOTIVOS_INELEGIBILIDADE: check.motivos.join("; ") }));
  const pipelineElegivel = abertosElegiveis.reduce((a, d) => a + d._VALOR, 0);
  // Coverage = Pipeline Elegível ÷ Gap da Meta (não ÷ meta cheia) — mostra se o
  // que falta para bater a meta do mês está coberto pelo pipeline compatível
  // com o horizonte do filtro escolhido.
  let coverage = null;
  if (gapMeta === 0) coverage = "meta batida";
  else if (gapMeta != null && gapMeta > 0) coverage = pipelineElegivel / gapMeta;
  // Coverage Recomendado — divergência #3: derivado do Win Rate histórico
  // REAL do período filtrado (calculado no bloco F acima), não um threshold
  // fixo. Exibido AO LADO do semáforo fixo existente (cockpitStatusProtecao),
  // que continua útil como "chão" mínimo simples — ver COCKPIT_COMERCIAL.md.
  const coverageRecomendado = cockpitCoverageRecomendado(winRate);
  const criadosPeriodo = deals.filter((d) => dentroPeriodoCatalogo(d.DATE_CREATE, periodoFiltro));
  const pipelineCriadoPeriodo = criadosPeriodo.reduce((a, d) => a + d._VALOR, 0);
  const ticketMedioPipeline = abertosTodos.length ? pipelineTotal / abertosTodos.length : null;
  drill.pipelineTotal = abertosTodos;
  drill.pipelineElegivel = abertosElegiveis;
  drill.pipelineInelegivel = inelegiveisComMotivo;
  drill.pipelineCriado = criadosPeriodo;

  // -------------------- D) Proteção de Receita M / M+1 / M+2 / M+3 ---------
  const protecao = [];
  for (let i = 0; i < 4; i++) {
    const d0 = new Date(mes.hojeISO + "T12:00:00");
    d0.setMonth(d0.getMonth() + i);
    const ano = d0.getFullYear(), mesNum = d0.getMonth() + 1;
    const inicioM = `${ano}-${String(mesNum).padStart(2, "0")}-01`;
    const fimM = formatarDataISO(new Date(ano, mesNum, 0));
    const metaM = Number(cockpitEl(`cockpitMetaM${i}`)?.value) || 0;
    const elegiveisM = abertosTodos.filter((d) => !ehEstagioPiloto(d.STAGE_ID, d._ESTAGIO) && dentroPeriodoCatalogo(d.CLOSEDATE, { inicio: inicioM, fim: fimM }));
    const pipelineM = elegiveisM.reduce((a, d) => a + d._VALOR, 0);
    const coverageM = metaM > 0 ? pipelineM / metaM : null;
    // Threshold inicial (configurável, não é regra fixa da AtlasGR): <2x
    // crítico, 2x–3x atenção, ≥3x saudável — ver comentário na função
    // cockpitStatusProtecao(). Coverage Recomendado (Win Rate) exibido ao
    // lado — mesmo valor de coverageRecomendado do bloco C (Win Rate é
    // calculado uma única vez por período filtrado, não por mês M/M+1/M+2/M+3).
    const statusM = cockpitStatusProtecao(coverageM);
    protecao.push({ label: `${i === 0 ? "M" : `M+${i}`} (${mesAnoBR(inicioM)})`, meta: metaM, pipeline: pipelineM, coverage: coverageM, coverageRecomendado, status: statusM, deals: elegiveisM });
    drill[`protecao_${i}`] = elegiveisM;
  }

  // -------------------- G) Pipeline por Estágio -----------------------------
  const refAging = new Date(`${mes.referencia}T12:00:00`);
  const porEstagio = {};
  abertosTodos.forEach((d) => {
    const k = d._ESTAGIO || "Sem estágio";
    if (!porEstagio[k]) porEstagio[k] = { estagio: k, qtd: 0, valor: 0, agingSoma: 0, agingN: 0, deals: [] };
    const g = porEstagio[k];
    g.qtd++; g.valor += d._VALOR; g.deals.push(d);
    const mt = parteDataISO(d.MOVED_TIME);
    if (mt) { g.agingSoma += Math.max(0, Math.floor((refAging - new Date(`${mt}T12:00:00`)) / 86400000)); g.agingN++; }
  });
  const totalEstagios = Object.values(porEstagio).reduce((a, g) => a + g.valor, 0);
  const estagiosLista = Object.values(porEstagio).map((g) => ({
    ...g,
    pctTotal: totalEstagios > 0 ? Math.round((g.valor / totalEstagios) * 1000) / 10 : 0,
    agingMedio: g.agingN ? Math.round((g.agingSoma / g.agingN) * 10) / 10 : null,
  })).sort((a, b) => b.valor - a.valor);
  estagiosLista.forEach((g, i) => { drill[`estagio_${i}`] = g.deals; });

  const mesAnteriorObj = new Date(Number(mes.inicio.split("-")[0]), Number(mes.inicio.split("-")[1]) - 1, 1);
  const mFimObj = new Date(mesAnteriorObj.getFullYear(), mesAnteriorObj.getMonth() + 1, 0);
  const mesAnterior = { inicio: formatarDataISO(mesAnteriorObj), fim: formatarDataISO(mFimObj) };
  
  const ganhosMesAnterior = deals.filter((d) => d._SEMANTICA === "success" && dentroPeriodoCatalogo(d._FECHAMENTO, mesAnterior));
  const fechadoMesAnterior = ganhosMesAnterior.reduce((a, d) => a + d._VALOR, 0);
  const qtdAnterior = ganhosMesAnterior.length;
  const ticketMedioMesAnterior = qtdAnterior ? fechadoMesAnterior / qtdAnterior : null;

  function fmtMom(atual, ant) {
    if (!ant) return "";
    const pct = ((atual - ant) / ant) * 100;
    if (pct === 0) return `<span style="color:var(--ink-2); font-weight:bold;">— 0%</span> vs mês anterior`;
    const sinal = pct > 0 ? "▲" : "▼";
    const cor = pct > 0 ? "var(--ok)" : "var(--danger)";
    return `<span style="color:${cor}; font-weight:bold;">${sinal} ${Math.abs(pct).toFixed(1)}%</span> vs mês anterior`;
  }

  const fechadoMesMom = fmtMom(fechadoMes, fechadoMesAnterior);
  const qtdMom = fmtMom(ganhosMes.length, qtdAnterior);
  const ticketMom = fmtMom(ticketMedioMes, ticketMedioMesAnterior);

  cockpitDrill = drill;

  return {
    mes, deals,
    resultadoMes: { fechadoMes, metaMensal, pctMeta, gapMeta, qtd: ganhosMes.length, ticketMedioMes, fechadoMesMom, qtdMom, ticketMom },
    forecast: { commit, bestCase, pipelineForecast, pipelinePonderado, upside, forecastTotal, metaMensal, gapForecast },
    saude: { pipelineTotal, pipelineElegivel, pipelineInelegivelQtd: inelegiveisComMotivo.length, coverage, coverageRecomendado, pipelineCriadoPeriodo, ticketMedioPipeline, qtdAberto: abertosTodos.length, periodoFiltro },
    protecao,
    eficiencia: { winRate, ganhos: ganhosPeriodo.length, perdidos: perdidosPeriodo.length, ticketMedioVendido, cicloMedia, cicloMediana, amostraCiclo: ciclos.length, periodoFiltro },
    estagios: estagiosLista, totalEstagios,
  };
}

// ---------------------------------------------------------------------------
// Geração de Pipeline (seções 17-19 do prompt mestre)
// ---------------------------------------------------------------------------
// Calcula pipeline criado no período, pipeline necessário (hipótese: Meta
// futura ÷ Win Rate), gap, coverage de criação e ritmo (pace) de criação
// considerando dias úteis decorridos vs total do mês.
//
// FÓRMULA (hipótese matemática, documentada e visível, não escondida):
//   Pipeline necessário = Meta do mês seguinte (M+1, já editável no bloco
//   "Proteção de Receita") ÷ (Win Rate / 100)
//   Ex.: Meta M+1 = R$100.000, Win Rate = 25% → é preciso criar R$400.000 em
//   pipeline novo para, estatisticamente, converter a meta do mês seguinte.
//   Usamos a Meta M+1 (não a meta do mês atual) porque pipeline criado hoje
//   tipicamente fecha em meses futuros (mesmo raciocínio do bloco Proteção
//   de Receita). Win Rate vem do bloco Eficiência da Máquina (mesmo cálculo,
//   não uma nova fórmula) — se Win Rate ou Meta M+1 não estiverem
//   disponíveis, o Pipeline necessário fica "não disponível" (nunca 0).
function cockpitCalcularGeracaoPipeline(c) {
  const deals = cockpitState.dealsFiltrados || [];
  const mes = c.mes;
  const drill = {};

  // Pipeline criado no período = negócios abertos ou fechados cujo
  // DATE_CREATE cai no período filtrado (mesmo recorte de "Pipeline criado
  // no período" já usado no bloco Saúde do Pipeline) — não exclui "Piloto"
  // porque o objetivo aqui é medir geração bruta de pipeline, não o pipeline
  // elegível para fechamento.
  const periodoFiltro = c.saude.periodoFiltro;
  const criados = deals.filter((d) => dentroPeriodoCatalogo(d.DATE_CREATE, periodoFiltro));
  const pipelineCriado = criados.reduce((a, d) => a + d._VALOR, 0);
  drill.geracaoCriado = criados;

  const winRate = c.eficiencia.winRate; // % — reaproveitado do bloco Eficiência da Máquina
  const metaFutura = Number(cockpitEl("cockpitMetaM1")?.value) || 0;
  let pipelineNecessario = null;
  if (metaFutura > 0 && winRate != null && winRate > 0) {
    pipelineNecessario = metaFutura / (winRate / 100);
  }
  const gapGeracao = pipelineNecessario != null ? Math.max(0, pipelineNecessario - pipelineCriado) : null;
  const creationCoverage = pipelineNecessario != null && pipelineNecessario > 0 ? pipelineCriado / pipelineNecessario : null;

  // Pace de criação: dias úteis decorridos no mês atual vs total de dias
  // úteis do mês (ehDiaUtilISO, já usado em js/sdr.js). Compara o que seria
  // esperado até hoje (proporcional) com o que foi criado até agora.
  const diasDoMes = [];
  const [anoM, mesM] = mes.inicio.split("-").map(Number);
  const ultimoDiaMes = new Date(anoM, mesM, 0).getDate();
  for (let dia = 1; dia <= ultimoDiaMes; dia++) {
    diasDoMes.push(`${anoM}-${String(mesM).padStart(2, "0")}-${String(dia).padStart(2, "0")}`);
  }
  const diasUteisTotal = diasDoMes.filter((iso) => ehDiaUtilISO(iso)).length;
  const hojeISO = mes.hojeISO;
  const diasUteisDecorridos = diasDoMes.filter((iso) => iso <= hojeISO && ehDiaUtilISO(iso)).length;
  let paceEsperadoAteHoje = null, paceGap = null, paceRitmoPct = null;
  if (pipelineNecessario != null && diasUteisTotal > 0) {
    paceEsperadoAteHoje = pipelineNecessario * (diasUteisDecorridos / diasUteisTotal);
    paceGap = pipelineCriado - paceEsperadoAteHoje; // negativo = atrasado
    paceRitmoPct = paceEsperadoAteHoje > 0 ? Math.round((pipelineCriado / paceEsperadoAteHoje) * 1000) / 10 : null;
  }

  cockpitDrill = { ...cockpitDrill, ...drill };
  return {
    pipelineCriado, pipelineNecessario, gapGeracao, creationCoverage, winRate, metaFutura,
    diasUteisDecorridos, diasUteisTotal, paceEsperadoAteHoje, paceGap, paceRitmoPct,
  };
}

// ---------------------------------------------------------------------------
// SDR — resumo executivo (seções 21-22, versão compacta)
// ---------------------------------------------------------------------------
// LIMITAÇÃO CONHECIDA: o Cockpit extrai apenas negócios do funil Comercial
// (baseDealsCatalogo, CATEGORY_ID=0) — não extrai Leads nem atividades, que
// são a fonte real de "leads trabalhados", "reuniões agendadas/realizadas" e
// conversão Lead→Oportunidade completa (essas métricas existem em
// js/sdr.js: extrairDiarioSDR / extrairAnaliseSDR, que fazem chamadas
// específicas a crm.lead.list e crm.activity.list por usuário SDR). Refazer
// essa extração aqui duplicaria a lógica e o custo de chamadas — em vez
// disso, este bloco mostra só o que é derivável dos negócios já carregados
// no Cockpit (campo LEAD_ID, presente em baseDealsCatalogo) e aponta para os
// relatórios completos de SDR para o resto.
function cockpitCalcularResumoSdr(c) {
  const deals = cockpitState.dealsFiltrados || [];
  const periodoFiltro = c.saude.periodoFiltro;
  const criadosPeriodo = deals.filter((d) => dentroPeriodoCatalogo(d.DATE_CREATE, periodoFiltro));
  // Negócios originados de um Lead (LEAD_ID válido) = proxy de "pipeline
  // qualificado" que passou pela etapa de qualificação SDR antes de virar
  // oportunidade. Não identifica QUAL SDR qualificou (isso exigiria buscar
  // o Lead original e seu ASSIGNED_BY_ID, um custo N+1 fora de escopo aqui).
  const viaLead = criadosPeriodo.filter((d) => idBitrixValido(d.LEAD_ID));
  const semLead = criadosPeriodo.filter((d) => !idBitrixValido(d.LEAD_ID));
  const valorViaLead = viaLead.reduce((a, d) => a + d._VALOR, 0);
  const pctViaLead = criadosPeriodo.length ? Math.round((viaLead.length / criadosPeriodo.length) * 1000) / 10 : null;
  cockpitDrill.sdrViaLead = viaLead;
  cockpitDrill.sdrSemLead = semLead;
  return {
    totalCriados: criadosPeriodo.length, viaLeadQtd: viaLead.length, viaLeadValor: valorViaLead, pctViaLead,
    leadsTrabalhados: null, reunioes: null, conversaoLeadOportunidade: null, // não disponível nesta extração — ver Análise SDR completa
  };
}

// ---------------------------------------------------------------------------
// Qualidade dos Dados (CRM) — Data Quality Score (seções 26-27)
// ---------------------------------------------------------------------------
// IMPORTANTE: "Data Quality Score" mede só COMPLETUDE de campos no CRM — é a
// média simples das % de preenchimento dos campos abaixo. NUNCA deve ser
// interpretado como "Forecast Confidence" ou probabilidade de venda; não tem
// nenhuma relação com PROBABILITY/bucket de forecast.
//
// LIMITAÇÃO: não existe, em nenhum lugar do projeto (config.js,
// catalogo-relatorios.js, forecast.js), um campo mapeado para "motivo de
// perda" (UF_CRM_* ou nativo) — não há relatório nem extração que use esse
// dado hoje. Por isso o campo "Motivo de perda" abaixo é sempre contado como
// "não informado" para 100% dos negócios perdidos, e isso é documentado
// explicitamente na UI (não inventamos um campo que não existe no Bitrix
// configurado para este cliente).
function cockpitCalcularQualidadeDados(c) {
  const deals = cockpitState.dealsFiltrados || [];
  const abertos = deals.filter((d) => d._SEMANTICA === "process");
  const perdidos = deals.filter((d) => d._SEMANTICA === "failure");
  const baseCompletude = abertos.length ? abertos : deals; // preferimos negócios abertos (é o que a operação trabalha agora)

  const pct = (n, total) => (total ? Math.round((n / total) * 1000) / 10 : null);

  const comValor = baseCompletude.filter((d) => Number(d.OPPORTUNITY) > 0);
  const comResponsavel = baseCompletude.filter((d) => idBitrixValido(d.ASSIGNED_BY_ID));
  const comEstagio = baseCompletude.filter((d) => !!d.STAGE_ID);
  const comCloseDate = baseCompletude.filter((d) => !!parteDataISO(d.CLOSEDATE));
  const comOrigem = baseCompletude.filter((d) => !!d.SOURCE_ID);

  const camposCompletude = [
    { label: "Valor (OPPORTUNITY)", pct: pct(comValor.length, baseCompletude.length), lista: comValor },
    { label: "Responsável", pct: pct(comResponsavel.length, baseCompletude.length), lista: comResponsavel },
    { label: "Estágio", pct: pct(comEstagio.length, baseCompletude.length), lista: comEstagio },
    { label: "CLOSEDATE", pct: pct(comCloseDate.length, baseCompletude.length), lista: comCloseDate },
    { label: "Origem", pct: pct(comOrigem.length, baseCompletude.length), lista: comOrigem },
  ];
  camposCompletude.forEach((f, i) => { cockpitDrill[`qualidade_${i}`] = f.lista; });

  // Motivo de perda: campo inexistente no projeto hoje (ver comentário
  // acima) — sempre 0% de completude para negócios perdidos, não é um bug.
  const motivoPerdaPct = perdidos.length ? 0 : null;
  cockpitDrill.qualidadeMotivoPerda = perdidos;

  const valoresValidos = camposCompletude.map((f) => f.pct).filter((v) => v != null);
  const dataQualityScore = valoresValidos.length ? Math.round((valoresValidos.reduce((a, b) => a + b, 0) / valoresValidos.length) * 10) / 10 : null;

  return { baseTotal: baseCompletude.length, campos: camposCompletude, motivoPerdaPct, perdidosQtd: perdidos.length, dataQualityScore };
}

// Threshold de proteção de receita — critério inicial e configurável (não é
// regra fixa acordada com a diretoria): <2x cobertura = crítico, 2x a <3x =
// atenção, ≥3x = saudável. Ajuste aqui se o critério mudar.
function cockpitStatusProtecao(coverage) {
  if (coverage === null || coverage === undefined || !Number.isFinite(coverage)) return { rotulo: "não disponível", classe: "" };
  if (coverage < 2) return { rotulo: "crítico", classe: "cockpit-status-critico" };
  if (coverage < 3) return { rotulo: "atenção", classe: "cockpit-status-atencao" };
  return { rotulo: "saudável", classe: "cockpit-status-saudavel" };
}

// ---------------------------------------------------------------------------
// Alertas Gerenciais (seção 28 do prompt mestre)
// ---------------------------------------------------------------------------
// Gera alertas acionáveis a partir dos indicadores JÁ CALCULADOS por
// cockpitCalcular() e cockpitCalcularGeracaoPipeline() — nenhuma fórmula de
// negócio é redefinida aqui, só thresholds/leitura sobre o que já existe.
//
// Regras implementadas (com a origem do dado reaproveitado):
// 1. Coverage do mês corrente crítico/atenção — reaproveita c.saude.coverage
//    e o MESMO threshold de Proteção de Receita (cockpitStatusProtecao).
// 2. Oportunidades abertas com CLOSEDATE vencida — deriva de c.deals
//    (_SEMANTICA/_VALOR já calculados), comparando CLOSEDATE com hoje.
// 3. Aging alto por estágio — reaproveita c.estagios (agingMedio já
//    calculado no bloco Pipeline por Estágio), com o threshold
//    ALERTA_AGING_ALTO_DIAS abaixo (critério inicial/configurável, mesmo
//    espírito do threshold 2x/3x de Proteção de Receita — não é uma regra
//    fixa acordada com a diretoria).
// 4. Pipeline criado abaixo do necessário / ritmo de criação atrasado —
//    reaproveita g.creationCoverage e g.paceRitmoPct (bloco Geração de
//    Pipeline), sem recalcular.
// 5. Coverage de M+1 em risco — reaproveita c.protecao[1] (Proteção de
//    Receita), mesmo status/threshold já calculado para a tabela M/M+1/M+2/M+3.
//
// Regra DESCARTADA (não implementada) e o motivo:
// - "Win Rate acima ou abaixo da média histórica": o Cockpit (e o restante
//   do projeto — js/forecast.js, js/catalogo-relatorios.js) não armazena
//   nenhum histórico de Win Rate entre sessões/períodos anteriores; cada
//   carregamento recalcula o Win Rate só do período filtrado atual. Sem uma
//   série histórica real para comparar, qualquer "média" seria inventada —
//   por isso este alerta não foi implementado.
const ALERTA_AGING_ALTO_DIAS = 45; // critério inicial/configurável, ver comentário acima

function cockpitCalcularAlertas(c, g) {
  const hojeISO = c.mes.hojeISO;
  const lista = [];

  // 1) Coverage do mês corrente (Saúde do Pipeline) — mesmo threshold 2x/3x
  //    de Proteção de Receita.
  if (c.resultadoMes.gapMeta === 0 && c.resultadoMes.metaMensal > 0) {
    lista.push({ nivel: "positivo", motivo: "Meta do mês já foi batida", valor: moedaRelatorio(c.resultadoMes.fechadoMes), acao: "Nenhuma ação necessária para bater a meta deste mês — considere reforçar M+1/M+2.", tipo: "scroll", alvo: "cockpitResultadoMes" });
  } else if (typeof c.saude.coverage === "number") {
    const status = cockpitStatusProtecao(c.saude.coverage);
    if (status.rotulo === "crítico") {
      lista.push({ nivel: "critico", motivo: "Coverage do pipeline elegível para a meta do mês está crítico", valor: `${c.saude.coverage.toFixed(2)}x (limite crítico <2x)`, acao: "Acelerar geração/qualificação de pipeline elegível para o mês ou revisar a meta.", tipo: "scroll", alvo: "cockpitSaudePipeline" });
    } else if (status.rotulo === "atenção") {
      lista.push({ nivel: "atencao", motivo: "Coverage do pipeline elegível para a meta do mês está em atenção", valor: `${c.saude.coverage.toFixed(2)}x`, acao: "Monitorar de perto; reforçar geração de pipeline elegível se não melhorar.", tipo: "scroll", alvo: "cockpitSaudePipeline" });
    }
  }

  // 2) Oportunidades abertas com CLOSEDATE vencida.
  const vencidas = (c.deals || []).filter((d) => {
    if (d._SEMANTICA !== "process") return false;
    const cd = parteDataISO(d.CLOSEDATE);
    return !!cd && cd < hojeISO;
  });
  const valorVencidas = vencidas.reduce((a, d) => a + d._VALOR, 0);
  if (vencidas.length) {
    cockpitDrill.alertaVencidas = vencidas;
    lista.push({ nivel: "critico", motivo: "Oportunidades abertas com CLOSEDATE vencida (data de fechamento no passado)", valor: `${vencidas.length} negócio(s) · ${moedaRelatorio(valorVencidas)}`, acao: "Atualizar a data de fechamento ou mover o negócio para ganho/perda.", tipo: "drill", alvo: "alertaVencidas", titulo: "Oportunidades com CLOSEDATE vencida" });
  }

  // 2.5) Grandes Negócios Inativos (Alerta Proativo)
  const ticketBase = c.resultadoMes.ticketMedioMes || c.saude.ticketMedioPipeline || 0;
  if (ticketBase > 0) {
    const limiarGrande = ticketBase * 2;
    const diasInativoMax = 15;
    const refHoje = new Date(hojeISO + "T12:00:00");
    const grandesInativos = (c.deals || []).filter(d => {
      if (d._SEMANTICA !== "process" || d._VALOR < limiarGrande) return false;
      const act = d.LAST_ACTIVITY_TIME || d.DATE_MODIFY;
      if (!act) return true;
      const dias = Math.floor((refHoje - new Date(act.split("T")[0] + "T12:00:00")) / 86400000);
      return dias > diasInativoMax;
    });
    if (grandesInativos.length) {
      cockpitDrill.alertaGrandesInativos = grandesInativos;
      const valTotal = grandesInativos.reduce((a,d)=>a+d._VALOR,0);
      lista.push({ nivel: "critico", motivo: `Grandes negócios (>= 2x Ticket Médio) sem interação há >${diasInativoMax} dias`, valor: `${grandesInativos.length} negócio(s) · ${moedaRelatorio(valTotal)} em risco`, acao: "Retomar contato urgentemente para evitar perda da oportunidade (SLA vencido).", tipo: "drill", alvo: "alertaGrandesInativos", titulo: "Grandes Negócios Inativos" });
    }
  }

  // 3) Aging alto por estágio (mesmo aging médio do bloco Pipeline por Estágio).
  const estagiosAltos = [];
  (c.estagios || []).forEach((eg, idx) => {
    if (eg.agingMedio != null && eg.agingMedio > ALERTA_AGING_ALTO_DIAS) {
      estagiosAltos.push(eg);
      lista.push({ nivel: "atencao", motivo: `Estágio "${eg.estagio}" com aging médio acima de ${ALERTA_AGING_ALTO_DIAS} dias`, valor: `${eg.agingMedio}d de aging médio · ${eg.qtd} negócio(s) sem movimento recente`, acao: "Revisar as oportunidades paradas nesse estágio — follow-up ou reclassificação.", tipo: "drill", alvo: `estagio_${idx}`, titulo: `Negócios em ${eg.estagio}` });
    }
  });

  // 4) Geração de Pipeline abaixo do necessário / ritmo atrasado.
  if (g && g.pipelineNecessario != null) {
    if (g.creationCoverage != null && g.creationCoverage < 1) {
      lista.push({ nivel: g.creationCoverage < 0.5 ? "critico" : "atencao", motivo: "Pipeline criado no período está abaixo do necessário para sustentar a Meta M+1", valor: `Criado ${moedaRelatorio(g.pipelineCriado)} de ${moedaRelatorio(g.pipelineNecessario)} necessário (${(g.creationCoverage * 100).toFixed(1)}%)`, acao: "Intensificar prospecção/geração de pipeline neste período.", tipo: "scroll", alvo: "cockpitGeracaoPipeline" });
    } else if (g.paceRitmoPct != null && g.paceRitmoPct < 80) {
      lista.push({ nivel: "atencao", motivo: "Ritmo de criação de pipeline abaixo do esperado para os dias úteis já decorridos no mês", valor: `${g.paceRitmoPct}% do ritmo esperado até hoje`, acao: "Acompanhar diariamente; ritmo abaixo de 100% indica atraso frente ao necessário.", tipo: "scroll", alvo: "cockpitGeracaoPipeline" });
    }
  }

  // 5) Coverage de M+1 em risco (Proteção de Receita).
  const m1 = c.protecao && c.protecao[1];
  if (m1 && m1.meta > 0 && m1.status) {
    if (m1.status.rotulo === "crítico") {
      lista.push({ nivel: "critico", motivo: "Coverage de M+1 (Proteção de Receita) está crítico", valor: m1.coverage != null ? `${m1.coverage.toFixed(2)}x` : "não disponível", acao: "Priorizar geração de pipeline elegível para o mês seguinte.", tipo: "scroll", alvo: "cockpitProtecaoTabela" });
    } else if (m1.status.rotulo === "atenção") {
      lista.push({ nivel: "atencao", motivo: "Coverage de M+1 (Proteção de Receita) está em atenção — risco de virar crítico", valor: m1.coverage != null ? `${m1.coverage.toFixed(2)}x` : "não disponível", acao: "Monitorar de perto nas próximas semanas.", tipo: "scroll", alvo: "cockpitProtecaoTabela" });
    }
  }

  if (!lista.some((a) => a.nivel === "critico" || a.nivel === "atencao")) {
    lista.push({ nivel: "positivo", motivo: "Nenhum alerta crítico ou de atenção identificado nos indicadores monitorados agora", valor: "", acao: "Manter o ritmo atual e seguir acompanhando os blocos abaixo.", tipo: "scroll", alvo: "cockpit-executivo" });
  }

  // Ordena: crítico primeiro, depois atenção, depois positivo.
  const ordem = { critico: 0, atencao: 1, positivo: 2 };
  lista.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);

  return { lista, vencidas, valorVencidas, estagiosAltos };
}

function cockpitAlertaClique(tipo, alvo, titulo) {
  if (tipo === "drill") { cockpitAbrirDrill(alvo, titulo); return; }
  const el = cockpitEl(alvo);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cockpitRenderAlertas(info) {
  const el = cockpitEl("cockpitAlertas");
  if (!el) return;
  const icone = { critico: "🔴", atencao: "🟡", positivo: "🟢" };
  const classe = { critico: "cockpit-alerta-critico", atencao: "cockpit-alerta-atencao", positivo: "cockpit-alerta-positivo" };
  el.innerHTML = info.lista.map((a) => {
    const tituloJs = escapeHtmlRelatorio(a.titulo || a.motivo).replace(/'/g, "\\'");
    return `<div class="cockpit-alerta ${classe[a.nivel]}" onclick="cockpitAlertaClique('${a.tipo}','${a.alvo}','${tituloJs}')">
      <span class="cockpit-alerta-icone">${icone[a.nivel]}</span>
      <div class="cockpit-alerta-corpo">
        <div class="cockpit-alerta-motivo">${escapeHtmlRelatorio(a.motivo)}</div>
        ${a.valor ? `<div class="cockpit-alerta-valor">${escapeHtmlRelatorio(a.valor)}</div>` : ""}
        <div class="cockpit-alerta-acao">Ação sugerida: ${escapeHtmlRelatorio(a.acao)}</div>
      </div>
    </div>`;
  }).join("");
}

// ---------------------------------------------------------------------------
// "⚡ Situação Comercial Agora" — resumo executivo compacto, montado só com
// dados já calculados em renderizarCockpit() (cockpitState.ultimoCalculo),
// sem reprocessar nada nem chamar o Bitrix de novo.
// ---------------------------------------------------------------------------
function cockpitGerarSituacaoAgora() {
  const cache = cockpitState.ultimoCalculo;
  if (!cache) { mostrarErro('Clique em "↻ Atualizar agora" no Cockpit antes de gerar a Situação Comercial Agora.'); return; }
  const { c, g, alertasInfo } = cache;

  const idsVencidas = alertasInfo.vencidas.map((d) => d.ID);
  const idsAgingAlto = alertasInfo.estagiosAltos.flatMap((eg) => eg.deals.map((d) => d.ID));
  const emRiscoQtd = new Set([...idsVencidas, ...idsAgingAlto]).size;

  const agora = new Date();
  const dd = String(agora.getDate()).padStart(2, "0"), mm = String(agora.getMonth() + 1).padStart(2, "0");
  const hh = String(agora.getHours()).padStart(2, "0"), mi = String(agora.getMinutes()).padStart(2, "0");
  const carimbo = `${dd}/${mm}/${agora.getFullYear()} ${hh}:${mi}`;

  const fmtMoeda = (v) => (v == null ? "não disponível" : moedaRelatorio(v));
  const fmtPct = (v) => (v == null ? "não disponível" : `${v}%`);

  const campos = [
    ["Meta do mês", fmtMoeda(c.resultadoMes.metaMensal || null)],
    ["Fechado", fmtMoeda(c.resultadoMes.fechadoMes)],
    ["% da Meta", fmtPct(c.resultadoMes.pctMeta)],
    ["Forecast total do mês", fmtMoeda(c.forecast.forecastTotal)],
    ["Gap do Forecast", fmtMoeda(c.forecast.gapForecast)],
    ["Commit (valor cheio)", fmtMoeda(c.forecast.commit)],
    ["Best Case (valor cheio)", fmtMoeda(c.forecast.bestCase)],
    ["Pipeline ponderado (entra no forecast)", fmtMoeda(c.forecast.pipelinePonderado)],
    ["Upside (não entra no forecast)", fmtMoeda(c.forecast.upside)],
    ["Pipeline Total", fmtMoeda(c.saude.pipelineTotal)],
    ["Pipeline Elegível", fmtMoeda(c.saude.pipelineElegivel)],
    ["Coverage atual (elegível ÷ gap)", c.saude.coverage === "meta batida" ? "meta já batida" : (c.saude.coverage != null ? `${c.saude.coverage.toFixed(2)}x` : "não disponível")],
    ["Coverage recomendado (Win Rate histórico)", c.saude.coverageRecomendado != null ? `${c.saude.coverageRecomendado.toFixed(2)}x` : "não disponível"],
    ["Pipeline criado no período", fmtMoeda(c.saude.pipelineCriadoPeriodo)],
    ["Win Rate", fmtPct(c.eficiencia.winRate)],
    ["Sales Cycle (média)", c.eficiencia.cicloMedia != null ? `${c.eficiencia.cicloMedia}d` : "não disponível"],
    ["Oportunidades abertas", c.saude.qtdAberto],
    ["Oportunidades em risco (vencidas/aging alto)", `${emRiscoQtd}`],
  ];

  const linhasTexto = [];
  linhasTexto.push(`=== SITUAÇÃO COMERCIAL AGORA — ${marcaAtiva().nome} ===`);
  linhasTexto.push(`Gerado em: ${carimbo} · Fonte: Bitrix24 (último "Atualizar agora" do Cockpit)`);
  linhasTexto.push("");
  campos.forEach(([label, valor]) => linhasTexto.push(`${label}: ${valor}`));
  linhasTexto.push("");
  linhasTexto.push("ALERTAS PRINCIPAIS");
  if (alertasInfo.lista.length) {
    alertasInfo.lista.forEach((a) => {
      const icone = a.nivel === "critico" ? "🔴" : a.nivel === "atencao" ? "🟡" : "🟢";
      linhasTexto.push(`${icone} ${a.motivo}${a.valor ? ` — ${a.valor}` : ""} | Ação: ${a.acao}`);
    });
  } else {
    linhasTexto.push("Nenhum alerta no momento.");
  }
  const texto = linhasTexto.join("\n");

  const html = [
    `<div class="cockpit-situacao-grid">` +
    campos.map(([label, valor]) => `<div class="cockpit-situacao-item"><span class="cockpit-situacao-label">${escapeHtmlRelatorio(label)}</span><span class="cockpit-situacao-valor">${escapeHtmlRelatorio(String(valor))}</span></div>`).join("") +
    `</div>`,
    `<div class="relatorio-subtitulo" style="margin-top:14px;">Alertas principais</div>`,
    `<div id="cockpitSituacaoAlertas"></div>`,
  ].join("");

  cockpitEl("cockpitSituacaoConteudo").innerHTML = html;
  cockpitRenderAlertasEm("cockpitSituacaoAlertas", alertasInfo);
  cockpitEl("cockpitSituacaoTexto").textContent = texto;
  cockpitEl("cockpitSituacaoCarimbo").textContent = `Gerado em ${carimbo}`;
  cockpitEl("cockpitSituacaoModal")?.classList.add("aberto");
}

// Variante de cockpitRenderAlertas que escreve em qualquer container (usada
// dentro do modal de Situação Comercial Agora, sem duplicar a lógica de alerta).
function cockpitRenderAlertasEm(idContainer, info) {
  const el = cockpitEl(idContainer);
  if (!el) return;
  const icone = { critico: "🔴", atencao: "🟡", positivo: "🟢" };
  const classe = { critico: "cockpit-alerta-critico", atencao: "cockpit-alerta-atencao", positivo: "cockpit-alerta-positivo" };
  el.innerHTML = info.lista.map((a) => `<div class="cockpit-alerta ${classe[a.nivel]}">
      <span class="cockpit-alerta-icone">${icone[a.nivel]}</span>
      <div class="cockpit-alerta-corpo">
        <div class="cockpit-alerta-motivo">${escapeHtmlRelatorio(a.motivo)}</div>
        ${a.valor ? `<div class="cockpit-alerta-valor">${escapeHtmlRelatorio(a.valor)}</div>` : ""}
        <div class="cockpit-alerta-acao">Ação sugerida: ${escapeHtmlRelatorio(a.acao)}</div>
      </div>
    </div>`).join("");
}

function cockpitCopiarSituacao() {
  const texto = cockpitEl("cockpitSituacaoTexto")?.textContent || "";
  if (!texto) return;
  navigator.clipboard.writeText(texto).then(() => {
    atualizarStatus("Situação Comercial Agora copiada para a área de transferência.");
  });
}

function cockpitBaixarSituacao() {
  const texto = cockpitEl("cockpitSituacaoTexto")?.textContent || "";
  if (!texto) return;
  baixarArquivo(texto, `situacao_comercial_${dataHoje()}.txt`, "text/plain;charset=utf-8;");
}

function fecharSituacaoCockpit() {
  cockpitEl("cockpitSituacaoModal")?.classList.remove("aberto");
}
function fecharSituacaoCockpitPorFundo(ev) {
  if (ev.target && ev.target.id === "cockpitSituacaoModal") fecharSituacaoCockpit();
}

// ---------------------------------------------------------------------------
// Renderização
// ---------------------------------------------------------------------------
function cockpitND(valor, formato) {
  if (valor === null || valor === undefined || (typeof valor === "number" && !Number.isFinite(valor))) return "não disponível";
  return formato ? formato(valor) : valor;
}

function cockpitGerarResumoIA() {
  const c = cockpitState.ultimoCalculo;
  if (!c) {
    alert("Sem dados para gerar resumo. Atualize o Cockpit primeiro.");
    return;
  }
  
  let texto = "🤖 Resumo Executivo (Narrativa):\n\n";
  
  const pct = c.resultadoMes.pctMeta || 0;
  if (pct >= 100) texto += `O mês está excelente! Já batemos a meta com ${pct}% de atingimento e R$ ${c.resultadoMes.fechadoMes.toLocaleString('pt-BR')} em novos negócios.\n`;
  else if (pct >= 80) texto += `Estamos muito perto da meta! Já atingimos ${pct}%. O gap atual é de R$ ${c.resultadoMes.gapMeta.toLocaleString('pt-BR')}.\n`;
  else if (pct > 0) texto += `Até agora, alcançamos ${pct}% da meta. Faltam R$ ${c.resultadoMes.gapMeta.toLocaleString('pt-BR')} para chegarmos ao objetivo do mês.\n`;
  else texto += `Ainda não tivemos fechamentos computados neste mês em relação à meta.\n`;

  const fc = c.forecast;
  texto += `\nO pipeline atual tem um Forecast Total projetado de R$ ${fc.forecastTotal.toLocaleString('pt-BR')}. Deste valor, R$ ${fc.commit.toLocaleString('pt-BR')} são considerados Commit (alta probabilidade).\n`;

  if (c.lista && c.lista.length > 0) {
    texto += `\nPontos de Atenção Identificados:\n`;
    c.lista.forEach(a => {
      if (a.nivel === "critico") texto += `⚠️ CRÍTICO: ${a.motivo}. Ação recomendada: ${a.acao}\n`;
      else if (a.nivel === "atencao") texto += `👀 ATENÇÃO: ${a.motivo}.\n`;
    });
  }

  const cov = typeof c.saude.coverage === 'number' ? c.saude.coverage.toFixed(2) + "x" : "indisponível";
  texto += `\nA Saúde do Pipeline registra um coverage de ${cov}.`;

  alert(texto);
}

function cockpitKpiCard(rotulo, valor, chaveDrill, extraClasse = "", subTexto = "") {
  const clique = chaveDrill ? ` onclick="cockpitAbrirDrill('${chaveDrill}','${escapeHtmlRelatorio(rotulo).replace(/'/g, "\\'")}')"` : "";
  const cls = chaveDrill ? "cockpit-kpi cockpit-kpi-clicavel" : "cockpit-kpi";
  const sub = subTexto ? `<div style="font-size:10px; margin-top:4px; color:var(--ink-2); line-height:1.2;">${subTexto}</div>` : "";
  return `<div class="${cls} ${extraClasse}"${clique}><span class="valor">${valor}</span><span class="rotulo">${escapeHtmlRelatorio(rotulo)}</span>${sub}</div>`;
}

// Ids de todos os containers de KPI/lista do Cockpit que ficam vazios até o
// primeiro carregamento — usados tanto para o estado vazio quanto para não
// deixar "buracos" em branco embaixo de cada título de bloco.
const COCKPIT_CONTAINERS_KPI = [
  "cockpitResultadoMes", "cockpitForecast", "cockpitSaudePipeline",
  "cockpitEficiencia", "cockpitGeracaoPipeline", "cockpitSdrResumo", "cockpitQualidadeDados",
];
const COCKPIT_CONTAINERS_LISTA = ["cockpitAlertas", "cockpitEstagios"];

function cockpitPlaceholderVazio(msg) {
  return `<p class="rodape-nota cockpit-placeholder-vazio">${escapeHtmlRelatorio(msg)}</p>`;
}

// Estado inicial da tela: nenhum negócio foi carregado ainda nesta sessão.
// Sem isso, os grids ficam literalmente vazios (sem nenhum texto) embaixo de
// cada título e o aviso "Pipeline != Forecast" aparece como uma barra colorida
// sem conteúdo — visualmente parece quebrado. Preenche com uma mensagem clara.
function cockpitRenderEstadoVazio() {
  const msg = "Sem dados carregados nesta sessão. Preencha o webhook (seção 1, abaixo) e clique em \"↻ Atualizar agora\".";
  COCKPIT_CONTAINERS_KPI.forEach((id) => { const el = cockpitEl(id); if (el) el.innerHTML = cockpitPlaceholderVazio(msg); });
  COCKPIT_CONTAINERS_LISTA.forEach((id) => { const el = cockpitEl(id); if (el) el.innerHTML = cockpitPlaceholderVazio(msg); });
  const protecao = cockpitEl("cockpitProtecaoTabela");
  if (protecao) protecao.innerHTML = cockpitPlaceholderVazio(msg);
  const aviso = cockpitEl("cockpitAvisoPipelineForecast");
  if (aviso) { aviso.textContent = ""; aviso.classList.add("oculto"); }
  const sdrAviso = cockpitEl("cockpitSdrAviso");
  if (sdrAviso) sdrAviso.textContent = "";
}

function cockpitRenderEstadoSkeleton() {
  const skl = `<div class="skeleton" style="height:38px; margin-bottom:8px; width:100%; border-radius:8px;"></div>`;
  const html = `<div style="display:flex; flex-direction:column; gap:8px;">${skl}${skl}${skl}</div>`;
  COCKPIT_CONTAINERS_KPI.forEach((id) => { const el = cockpitEl(id); if (el) el.innerHTML = html; });
  COCKPIT_CONTAINERS_LISTA.forEach((id) => { const el = cockpitEl(id); if (el) el.innerHTML = html; });
  const protecao = cockpitEl("cockpitProtecaoTabela");
  if (protecao) protecao.innerHTML = html;
  const aviso = cockpitEl("cockpitAvisoPipelineForecast");
  if (aviso) { aviso.textContent = ""; aviso.classList.add("oculto"); }
}

function renderizarCockpit() {
  if (!cockpitState.deals.length) { cockpitRenderEstadoVazio(); return; }
  const aviso = cockpitEl("cockpitAvisoPipelineForecast");
  if (aviso) aviso.classList.remove("oculto");
  const c = cockpitCalcular();

  // A) Resultado do Mês
  cockpitEl("cockpitResultadoMes").innerHTML = [
    cockpitKpiCard("Meta New MRR (mês)", c.resultadoMes.metaMensal ? moedaRelatorio(c.resultadoMes.metaMensal) : "não informada", null),
    cockpitKpiCard("Fechado no mês", moedaRelatorio(c.resultadoMes.fechadoMes), "resultadoMesFechado", "", c.resultadoMes.fechadoMesMom),
    cockpitKpiCard("% da Meta", cockpitND(c.resultadoMes.pctMeta, (v) => `${v}%`), "resultadoMesFechado"),
    cockpitKpiCard("Gap para a meta", cockpitND(c.resultadoMes.gapMeta, moedaRelatorio), "resultadoMesGap"),
    cockpitKpiCard("Negócios ganhos", c.resultadoMes.qtd, "resultadoMesFechado", "", c.resultadoMes.qtdMom),
    cockpitKpiCard("Ticket médio (mês)", cockpitND(c.resultadoMes.ticketMedioMes, moedaRelatorio), "resultadoMesFechado", "", c.resultadoMes.ticketMom),
  ].join("");

  // B) Forecast — visualmente separado do Pipeline (cor/bloco diferentes).
  // Commit e Best Case = valor cheio; Pipeline entra ponderado; Upside fica
  // de fora do forecast total (ver cockpitCalcular, bloco B).
  cockpitEl("cockpitForecast").innerHTML = [
    cockpitKpiCard("Commit (valor cheio)", moedaRelatorio(c.forecast.commit), "forecastCommit"),
    cockpitKpiCard("Best Case (valor cheio)", moedaRelatorio(c.forecast.bestCase), "forecastBestCase"),
    cockpitKpiCard("Pipeline (bruto)", moedaRelatorio(c.forecast.pipelineForecast), "forecastPipeline"),
    cockpitKpiCard("Pipeline (ponderado — entra no forecast)", moedaRelatorio(c.forecast.pipelinePonderado), "forecastPipeline"),
    cockpitKpiCard("Upside (não entra no forecast)", moedaRelatorio(c.forecast.upside), "forecastUpside"),
    cockpitKpiCard("Forecast total do mês", moedaRelatorio(c.forecast.forecastTotal), "forecastTotal", "cockpit-kpi-destaque"),
    cockpitKpiCard("Gap do Forecast", cockpitND(c.forecast.gapForecast, moedaRelatorio), "forecastTotal"),
  ].join("");

  // C) Saúde do Pipeline
  const covTxt = c.saude.coverage === "meta batida" ? "meta já batida" : cockpitND(c.saude.coverage, (v) => `${v.toFixed(2)}x`);
  const covRecTxt = cockpitND(c.saude.coverageRecomendado, (v) => `${v.toFixed(2)}x`);
  cockpitEl("cockpitSaudePipeline").innerHTML = [
    cockpitKpiCard("Pipeline Total", moedaRelatorio(c.saude.pipelineTotal), "pipelineTotal"),
    cockpitKpiCard("Pipeline Elegível (filtro)", moedaRelatorio(c.saude.pipelineElegivel), "pipelineElegivel"),
    cockpitKpiCard("Pipeline inelegível (com motivo)", c.saude.pipelineInelegivelQtd, "pipelineInelegivel"),
    cockpitKpiCard("Coverage atual (elegível ÷ gap)", covTxt, "pipelineElegivel"),
    cockpitKpiCard("Coverage recomendado (Win Rate histórico)", covRecTxt, null),
    cockpitKpiCard("Pipeline criado no período", moedaRelatorio(c.saude.pipelineCriadoPeriodo), "pipelineCriado"),
    cockpitKpiCard("Ticket médio do pipeline", cockpitND(c.saude.ticketMedioPipeline, moedaRelatorio), "pipelineTotal"),
  ].join("");
  cockpitEl("cockpitAvisoPipelineForecast").textContent =
    `Pipeline Total (${moedaRelatorio(c.saude.pipelineTotal)}) é o valor bruto de tudo que está aberto no Comercial — não é previsão de fechamento. A previsão fica nos cards de Forecast acima (Commit/Best Case/Pipeline ponderado). Coverage atual: ${covTxt} · recomendado (baseado no Win Rate histórico do período): ${covRecTxt}.`;

  // D) Proteção de Receita
  cockpitEl("cockpitProtecaoTabela").innerHTML = `<table><thead><tr><th>Mês</th><th>Meta</th><th>Pipeline Elegível</th><th>Coverage</th><th>Status (chão fixo)</th><th>Recomendado (Win Rate)</th></tr></thead><tbody>` +
    c.protecao.map((p, i) => `<tr class="cockpit-linha-clicavel" onclick="cockpitAbrirDrill('protecao_${i}','Pipeline elegível — ${escapeHtmlRelatorio(p.label)}')">` +
      `<td>${escapeHtmlRelatorio(p.label)}</td>` +
      `<td>${p.meta ? moedaRelatorio(p.meta) : "não informada"}</td>` +
      `<td>${moedaRelatorio(p.pipeline)}</td>` +
      `<td>${p.coverage != null ? `${p.coverage.toFixed(2)}x` : "não disponível"}</td>` +
      `<td><span class="cockpit-status-badge ${p.status.classe}">${p.status.rotulo}</span></td>` +
      `<td>${p.coverageRecomendado != null ? `${p.coverageRecomendado.toFixed(2)}x` : "não disponível"}</td>` +
      `</tr>`).join("") + `</tbody></table>`;

  // E) Pipeline por Estágio
  const maxValor = Math.max(1, ...c.estagios.map((g) => g.valor));
  cockpitEl("cockpitEstagios").innerHTML = c.estagios.map((g, i) => `
    <div class="cockpit-estagio-linha" onclick="cockpitAbrirDrill('estagio_${i}','Negócios em ${escapeHtmlRelatorio(g.estagio)}')">
      <div class="cockpit-estagio-nome">${escapeHtmlRelatorio(g.estagio)}</div>
      <div class="cockpit-estagio-barra"><div class="cockpit-estagio-barra-fill" style="width:${Math.max(2, (g.valor / maxValor) * 100).toFixed(1)}%"></div></div>
      <div class="cockpit-estagio-stats">${g.qtd} negócio(s) · ${moedaRelatorio(g.valor)} · ${g.pctTotal}% · aging médio ${g.agingMedio != null ? `${g.agingMedio}d` : "não disponível"}</div>
    </div>`).join("") || `<p class="rodape-nota">Nenhum negócio em aberto no Comercial.</p>`;

  // F) Eficiência da Máquina
  cockpitEl("cockpitEficiencia").innerHTML = [
    cockpitKpiCard("Win Rate", cockpitND(c.eficiencia.winRate, (v) => `${v}%`), "winRateGanhos"),
    cockpitKpiCard("Ganhos no período", c.eficiencia.ganhos, "winRateGanhos"),
    cockpitKpiCard("Perdidos no período", c.eficiencia.perdidos, "winRatePerdidos"),
    cockpitKpiCard("Ticket médio vendido", cockpitND(c.eficiencia.ticketMedioVendido, moedaRelatorio), "winRateGanhos"),
    cockpitKpiCard("Sales Cycle (média)", cockpitND(c.eficiencia.cicloMedia, (v) => `${v}d`), "cicloVenda"),
    cockpitKpiCard("Sales Cycle (mediana)", cockpitND(c.eficiencia.cicloMediana, (v) => `${v}d`), "cicloVenda"),
  ].join("") + `<p class="rodape-nota" style="grid-column:1/-1;">Amostra do ciclo de vendas: ${c.eficiencia.amostraCiclo} negócio(s) ganho(s) com data de criação e de fechamento preenchidas, dentro do período do filtro.</p>`;

  // H) Geração de Pipeline
  const g = cockpitCalcularGeracaoPipeline(c);
  cockpitEl("cockpitGeracaoPipeline").innerHTML = [
    cockpitKpiCard("Pipeline criado no período", moedaRelatorio(g.pipelineCriado), "geracaoCriado"),
    cockpitKpiCard("Pipeline necessário (Meta M+1 ÷ Win Rate)", cockpitND(g.pipelineNecessario, moedaRelatorio), null),
    cockpitKpiCard("Gap de geração", cockpitND(g.gapGeracao, moedaRelatorio), null),
    cockpitKpiCard("Creation Coverage", cockpitND(g.creationCoverage, (v) => `${(v * 100).toFixed(1)}%`), null),
    cockpitKpiCard("Dias úteis decorridos / total do mês", `${g.diasUteisDecorridos} / ${g.diasUteisTotal}`, null),
    cockpitKpiCard("Esperado até hoje (pace)", cockpitND(g.paceEsperadoAteHoje, moedaRelatorio), null),
    cockpitKpiCard("Gap de ritmo", g.paceGap != null ? moedaRelatorio(g.paceGap) : "não disponível", null),
    cockpitKpiCard("Ritmo de criação", cockpitND(g.paceRitmoPct, (v) => `${v}%`), null, g.paceRitmoPct != null && g.paceRitmoPct < 100 ? "cockpit-status-atencao" : ""),
  ].join("");

  // I) SDR — resumo executivo
  const s = cockpitCalcularResumoSdr(c);
  cockpitEl("cockpitSdrAviso").textContent =
    "Este resumo usa só os negócios do Comercial já carregados (não busca Leads/atividades). Leads trabalhados, reuniões e conversão Lead→Oportunidade completa: ver Análise SDR / Diário SDR (links abaixo).";
  cockpitEl("cockpitSdrResumo").innerHTML = [
    cockpitKpiCard("Negócios criados no período", s.totalCriados, null),
    cockpitKpiCard("Originados de Lead (proxy SDR)", s.viaLeadQtd, "sdrViaLead"),
    cockpitKpiCard("Valor originado de Lead", moedaRelatorio(s.viaLeadValor), "sdrViaLead"),
    cockpitKpiCard("% originado de Lead", cockpitND(s.pctViaLead, (v) => `${v}%`), "sdrViaLead"),
    cockpitKpiCard("Leads trabalhados", "não disponível", null),
    cockpitKpiCard("Reuniões agendadas/realizadas", "não disponível", null),
  ].join("");

  // J) Qualidade dos Dados (CRM) — Data Quality Score
  const q = cockpitCalcularQualidadeDados(c);
  cockpitEl("cockpitQualidadeDados").innerHTML = [
    ...q.campos.map((f, i) => cockpitKpiCard(`Completude — ${f.label}`, cockpitND(f.pct, (v) => `${v}%`), `qualidade_${i}`)),
    cockpitKpiCard("Motivo de perda informado", q.perdidosQtd ? "0% (campo não existe no projeto)" : "sem negócios perdidos no período", "qualidadeMotivoPerda"),
    cockpitKpiCard("Data Quality Score", cockpitND(q.dataQualityScore, (v) => `${v}%`), null, "cockpit-kpi-destaque"),
  ].join("") + `<p class="rodape-nota" style="grid-column:1/-1;">Base: ${q.baseTotal} negócio(s) (aberto(s), quando houver; senão todos os filtrados). Data Quality Score = completude de cadastro no CRM, não é confiança de forecast.</p>`;

  // K) Alertas Gerenciais — reaproveita c e g já calculados acima, nenhuma
  // fórmula nova de negócio, só thresholds/leitura (ver cockpitCalcularAlertas).
  const alertasInfo = cockpitCalcularAlertas(c, g);
  cockpitRenderAlertas(alertasInfo);

  // Cache do último cálculo completo — usado por "⚡ Situação Comercial
  // Agora" para montar o resumo sem reprocessar nada (nem chamar o Bitrix).
  cockpitState.ultimoCalculo = { c, g, s, q, alertasInfo };
  cockpitAtualizarTicker();
  cockpitAtualizarResumoHome();
  
  // Customizações (Criação 5 e 10)
  cockpitRenderizarGrafico(c);
  cockpitRenderizarMetasDesdobradas(c);
}

// ---------------------------------------------------------------------------
// Drill-down (requisito 9): clique em qualquer KPI mostra os negócios por trás
// ---------------------------------------------------------------------------
function cockpitAbrirDrill(chave, titulo) {
  const linhas = cockpitDrill[chave] || [];
  const modal = cockpitEl("cockpitDrillModal");
  if (!modal) return;
  cockpitEl("cockpitDrillTitulo").textContent = titulo || "Detalhamento";
  cockpitEl("cockpitDrillContagem").textContent = `${linhas.length} negócio(s)`;
  // Drill de "Pipeline inelegível" ganha uma coluna extra com o(s) motivo(s)
  // de reprovação (ver cockpitVerificarElegibilidade) — os demais drills
  // seguem as colunas padrão.
  const colunas = [
    { label: "Empresa / Cliente", valor: "_CLIENTE" },
    { label: "Valor", valor: (x) => moedaRelatorio(x._VALOR), html: true },
    { label: "Etapa", valor: "_ESTAGIO" },
    { label: "Vendedor", valor: "_RESPONSAVEL" },
    { label: "CLOSEDATE", valor: (x) => formatarDataBR(parteDataISO(x.CLOSEDATE)) },
  ];
  if (chave === "pipelineInelegivel") colunas.push({ label: "Motivo(s) de inelegibilidade", valor: "_MOTIVOS_INELEGIBILIDADE" });
  let tabelaHTML = tabelaRelatorio(colunas, linhas, 300);
  const inputHTML = `<input type="text" id="cockpitDrillBusca" placeholder="Pesquisar nos registros..." style="width:100%; padding:8px 12px; margin-bottom:12px; border-radius:6px; border:1px solid var(--line); font-size:13px; outline:none;" onkeyup="filtrarTabelaDrillDown(this)">`;
  
  cockpitEl("cockpitDrillConteudo").innerHTML = inputHTML + tabelaHTML;
  modal.classList.add("aberto");
}

window.filtrarTabelaDrillDown = function(input) {
  const filtro = input.value.toLowerCase();
  const linhas = document.querySelectorAll("#cockpitDrillConteudo table tbody tr");
  linhas.forEach(linha => {
    const texto = linha.textContent.toLowerCase();
    linha.style.display = texto.includes(filtro) ? "" : "none";
  });
}
function fecharDrillCockpit() {
  cockpitEl("cockpitDrillModal")?.classList.remove("aberto");
}
function fecharDrillCockpitPorFundo(ev) {
  if (ev.target && ev.target.id === "cockpitDrillModal") fecharDrillCockpit();
}

// ---------------------------------------------------------------------------
// Exportações do Cockpit (HTML autônomo, CSV, JSON, Relatório Executivo)
// ---------------------------------------------------------------------------
// Todas as exportações abaixo SÓ SERIALIZAM o que já está calculado em
// cockpitState.ultimoCalculo (preenchido ao final de renderizarCockpit()) —
// nenhuma chamada nova ao Bitrix, nenhum recálculo de fórmula, e NUNCA o
// webhook é incluído em nenhum HTML/CSV/JSON gerado aqui (o webhook nem é
// lido por essas funções).
//
// Limitações documentadas (ver também COCKPIT_COMERCIAL.md):
// - Não existe seção de "Origem"/"Produtos"/"Clientes" agregada no Cockpit —
//   o Relatório Executivo Completo linka para os relatórios do Catálogo que
//   já cobrem isso, em vez de fabricar uma seção vazia.
// - O CSV cobre apenas os KPIs de topo (cards); as listas de negócios por
//   trás de cada KPI (drill-down) continuam disponíveis via clique na tela,
//   não duplicadas aqui para não confundir "resumo" com "extração completa".

function cockpitExigirCache() {
  const cache = cockpitState.ultimoCalculo;
  if (!cache) { mostrarErro('Clique em "↻ Atualizar agora" no Cockpit antes de exportar (nada foi calculado ainda nesta sessão).'); return null; }
  return cache;
}

// Monta a lista plana [bloco, indicador, valor, unidade] usada tanto pelo
// CSV quanto pelos KPIs do HTML exportado — um único lugar formata os números.
function cockpitListaKpisExport(cache) {
  const { c, g, s, q } = cache;
  const moeda = (v) => (v == null ? "" : String(Math.round(v * 100) / 100));
  const num = (v) => (v == null ? "" : String(v));
  const pct = (v) => (v == null ? "" : String(v));
  const linhas = [];
  const add = (bloco, indicador, valor, unidade) => linhas.push({ bloco, indicador, valor: valor == null ? "não disponível" : valor, unidade });

  add("Resultado do Mês", "Meta New MRR (mês)", moeda(c.resultadoMes.metaMensal || null), "R$");
  add("Resultado do Mês", "Fechado no mês", moeda(c.resultadoMes.fechadoMes), "R$");
  add("Resultado do Mês", "% da Meta", pct(c.resultadoMes.pctMeta), "%");
  add("Resultado do Mês", "Gap para a meta", moeda(c.resultadoMes.gapMeta), "R$");
  add("Resultado do Mês", "Negócios ganhos", num(c.resultadoMes.qtd), "qtd");
  add("Resultado do Mês", "Ticket médio (mês)", moeda(c.resultadoMes.ticketMedioMes), "R$");

  add("Forecast", "Commit (valor cheio)", moeda(c.forecast.commit), "R$");
  add("Forecast", "Best Case (valor cheio)", moeda(c.forecast.bestCase), "R$");
  add("Forecast", "Pipeline (bruto, tier Pipeline)", moeda(c.forecast.pipelineForecast), "R$");
  add("Forecast", "Pipeline (ponderado — entra no forecast)", moeda(c.forecast.pipelinePonderado), "R$");
  add("Forecast", "Upside (não entra no forecast)", moeda(c.forecast.upside), "R$");
  add("Forecast", "Forecast total do mês", moeda(c.forecast.forecastTotal), "R$");
  add("Forecast", "Gap do Forecast", moeda(c.forecast.gapForecast), "R$");

  add("Saúde do Pipeline", "Pipeline Total", moeda(c.saude.pipelineTotal), "R$");
  add("Saúde do Pipeline", "Pipeline Elegível (filtro)", moeda(c.saude.pipelineElegivel), "R$");
  add("Saúde do Pipeline", "Pipeline inelegível (qtd)", num(c.saude.pipelineInelegivelQtd), "qtd");
  add("Saúde do Pipeline", "Coverage atual (elegível ÷ gap)", c.saude.coverage === "meta batida" ? "meta batida" : (c.saude.coverage != null ? String(Math.round(c.saude.coverage * 100) / 100) : null), "x");
  add("Saúde do Pipeline", "Coverage recomendado (Win Rate histórico)", c.saude.coverageRecomendado != null ? String(Math.round(c.saude.coverageRecomendado * 100) / 100) : null, "x");
  add("Saúde do Pipeline", "Pipeline criado no período", moeda(c.saude.pipelineCriadoPeriodo), "R$");
  add("Saúde do Pipeline", "Ticket médio do pipeline", moeda(c.saude.ticketMedioPipeline), "R$");
  add("Saúde do Pipeline", "Oportunidades abertas", num(c.saude.qtdAberto), "qtd");

  (c.protecao || []).forEach((p) => {
    add("Proteção de Receita", `Meta — ${p.label}`, p.meta ? moeda(p.meta) : null, "R$");
    add("Proteção de Receita", `Pipeline Elegível — ${p.label}`, moeda(p.pipeline), "R$");
    add("Proteção de Receita", `Coverage — ${p.label}`, p.coverage != null ? String(Math.round(p.coverage * 100) / 100) : null, "x");
    add("Proteção de Receita", `Status (chão fixo) — ${p.label}`, p.status?.rotulo || null, "");
    add("Proteção de Receita", `Recomendado (Win Rate) — ${p.label}`, p.coverageRecomendado != null ? String(Math.round(p.coverageRecomendado * 100) / 100) : null, "x");
  });

  add("Eficiência da Máquina", "Win Rate", pct(c.eficiencia.winRate), "%");
  add("Eficiência da Máquina", "Ganhos no período", num(c.eficiencia.ganhos), "qtd");
  add("Eficiência da Máquina", "Perdidos no período", num(c.eficiencia.perdidos), "qtd");
  add("Eficiência da Máquina", "Ticket médio vendido", moeda(c.eficiencia.ticketMedioVendido), "R$");
  add("Eficiência da Máquina", "Sales Cycle (média)", num(c.eficiencia.cicloMedia), "dias");
  add("Eficiência da Máquina", "Sales Cycle (mediana)", num(c.eficiencia.cicloMediana), "dias");

  (c.estagios || []).forEach((eg) => {
    add("Pipeline por Estágio", eg.estagio, moeda(eg.valor), "R$");
  });

  if (g) {
    add("Geração de Pipeline", "Pipeline criado no período", moeda(g.pipelineCriado), "R$");
    add("Geração de Pipeline", "Pipeline necessário (Meta M+1 ÷ Win Rate)", moeda(g.pipelineNecessario), "R$");
    add("Geração de Pipeline", "Gap de geração", moeda(g.gapGeracao), "R$");
    add("Geração de Pipeline", "Creation Coverage", g.creationCoverage != null ? String(Math.round(g.creationCoverage * 1000) / 10) : null, "%");
    add("Geração de Pipeline", "Ritmo de criação (pace)", num(g.paceRitmoPct), "%");
  }

  if (s) {
    add("SDR (resumo)", "Negócios criados no período", num(s.totalCriados), "qtd");
    add("SDR (resumo)", "Originados de Lead (proxy SDR)", num(s.viaLeadQtd), "qtd");
    add("SDR (resumo)", "Valor originado de Lead", moeda(s.viaLeadValor), "R$");
    add("SDR (resumo)", "% originado de Lead", pct(s.pctViaLead), "%");
  }

  if (q) {
    (q.campos || []).forEach((f) => add("Qualidade dos Dados", `Completude — ${f.label}`, pct(f.pct), "%"));
    add("Qualidade dos Dados", "Data Quality Score", pct(q.dataQualityScore), "%");
  }

  return linhas;
}

function cockpitExportarCSV() {
  const cache = cockpitExigirCache();
  if (!cache) return;
  const linhas = cockpitListaKpisExport(cache);
  const campos = ["bloco", "indicador", "valor", "unidade"];
  baixarArquivo("﻿" + linhasCSVDe(campos, linhas), `cockpit_comercial_kpis_${dataHoje()}.csv`, "text/csv;charset=utf-8;");
}

function cockpitExportarJSON() {
  const cache = cockpitExigirCache();
  if (!cache) return;
  const payload = {
    gerado_em: new Date().toISOString(),
    fonte: `Cockpit Comercial Executivo — ${marcaAtiva().nome} (snapshot já calculado, sem novo acesso ao Bitrix)`,
    periodo_filtro: cache.c?.saude?.periodoFiltro || null,
    dados: cache,
  };
  baixarArquivo(JSON.stringify(payload, null, 2), `cockpit_comercial_${dataHoje()}.json`, "application/json;charset=utf-8;");
}

// Constrói os cards de KPI (grid simples) reaproveitando cockpitListaKpisExport,
// agrupados por bloco — usado tanto no export "resumo" quanto no "completo".
function cockpitHtmlKpiBlocos(cache, blocosIncluir) {
  const linhas = cockpitListaKpisExport(cache);
  const porBloco = {};
  linhas.forEach((l) => {
    if (blocosIncluir && !blocosIncluir.includes(l.bloco)) return;
    (porBloco[l.bloco] ||= []).push(l);
  });
  return Object.entries(porBloco).map(([bloco, itens]) => {
    const cards = itens.map((it) => `<div class="kpi"><div class="label">${escapeHtmlRelatorio(it.indicador)}</div><div class="value">${escapeHtmlRelatorio(String(it.valor))}${it.unidade && it.valor !== "não disponível" ? ` <span style="font-size:.6em;color:var(--muted)">${escapeHtmlRelatorio(it.unidade)}</span>` : ""}</div></div>`).join("");
    return `<h2 class="section">${escapeHtmlRelatorio(bloco)}</h2><div class="kpis">${cards}</div>`;
  }).join("");
}

function cockpitHtmlAlertas(cache) {
  const info = cache.alertasInfo;
  if (!info?.lista?.length) return `<p class="small-note">Sem alertas neste snapshot.</p>`;
  const icone = { critico: "🔴", atencao: "🟡", positivo: "🟢" };
  return `<div class="month-list">` + info.lista.map((a) =>
    `<div class="vcard" style="padding:12px 16px;"><div class="vcard-name">${icone[a.nivel] || ""} ${escapeHtmlRelatorio(a.motivo)}</div>` +
    (a.valor ? `<div class="vcard-stats">${escapeHtmlRelatorio(a.valor)}</div>` : "") +
    `<div class="small-note">Ação sugerida: ${escapeHtmlRelatorio(a.acao)}</div></div>`
  ).join("") + `</div>`;
}

// Gera o HTML autônomo do Cockpit (snapshot resumido) ou do Relatório
// Executivo Completo (mais seções + alertas + links para o Catálogo).
// completo=false → só os KPIs de topo, igual ao Cockpit na tela.
// completo=true  → adiciona Alertas Gerenciais e Pipeline por Estágio por
// extenso, e uma seção final com links para os relatórios que já existem no
// projeto para Origem/Produtos/Clientes (não recalculados aqui).
function cockpitGerarHTMLExport(completo) {
  const cache = cockpitExigirCache();
  if (!cache) return "";
  const marca = marcaAtiva();
  const paginaHome = `${marca.prefixoArquivo}home.html`;
  const agora = new Date();
  const carimbo = formatarDataBR(formatarDataISO(agora)) + " " + String(agora.getHours()).padStart(2, "0") + ":" + String(agora.getMinutes()).padStart(2, "0");
  const titulo = completo ? "Relatório Executivo Completo" : "Cockpit Comercial";
  const cabecalhoInfo = completo
    ? `Resumo Executivo (= Situação Comercial Agora), Resultado do Mês, Forecast, Saúde do Pipeline, Proteção de Receita M/M+1/M+2/M+3, Pipeline por Estágio, Eficiência da Máquina, Geração de Pipeline, SDR, Qualidade dos Dados e Alertas Gerenciais — tudo a partir do snapshot já calculado nesta sessão do Cockpit.`
    : `Snapshot dos KPIs do Cockpit Comercial no momento da exportação — mesmos números já calculados na tela, sem novo acesso ao Bitrix.`;

  let corpo = `<div class="wrap"><div class="overview-panel" id="visao-geral"><h2 class="section" style="margin-top:0;">${escapeHtmlRelatorio(titulo)}</h2><p class="section-sub">${cabecalhoInfo}</p></div>`;

  corpo += cockpitHtmlKpiBlocos(cache, ["Resultado do Mês", "Forecast", "Saúde do Pipeline", "Eficiência da Máquina"]);

  corpo += `<h2 class="section">Alertas Gerenciais</h2>${cockpitHtmlAlertas(cache)}`;

  corpo += cockpitHtmlKpiBlocos(cache, ["Proteção de Receita", "Pipeline por Estágio", "Geração de Pipeline", "SDR (resumo)", "Qualidade dos Dados"]);

  if (completo) {
    corpo += `<h2 class="section">Outras análises (relatórios completos do projeto)</h2>` +
      `<p class="section-sub">O Cockpit não agrega dados de Origem, Produtos ou Clientes numa seção própria (essas fórmulas já existem no Catálogo de Relatórios e não foram duplicadas aqui). Abra a ferramenta e use, na mesma página:</p>` +
      `<ul><li><strong>Catálogo de Relatórios</strong> — origem, produtos, clientes, aging/SLA, ganhos e perdas por ciclo.</li>` +
      `<li><strong>Análise SDR / Diário SDR</strong> — leads trabalhados, reuniões, conversão Lead → Oportunidade.</li>` +
      `<li><strong>Forecast semanal</strong> — visão semana a semana com o mesmo detalhamento de fechados/pendentes/pipeline.</li></ul>` +
      `<p class="small-note">Este HTML é estático (baixado do navegador) e não tem link direto de volta à ferramenta — reabra "${paginaHome}" e navegue pelos menus para essas telas.</p>`;
  }

  corpo += `</div>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtmlRelatorio(titulo)} — ${escapeHtmlRelatorio(marca.nome)}</title><style>${modeloExecutivoCssParaMarca(marca)}</style></head><body>` +
    `<div class="letterhead"><div class="letterhead-inner"><div class="letterhead-brand">${marca.logoSvg}<div class="letterhead-divider"></div><div class="letterhead-tagline">${escapeHtmlRelatorio(marca.tagline)}</div></div><div class="letterhead-ref"><strong>${escapeHtmlRelatorio(titulo)}</strong><br>Gerado em ${carimbo}</div></div></div>` +
    `<header class="hero"><div class="hero-inner"><p class="eyebrow">Cockpit Comercial · Bitrix24</p><h1>${escapeHtmlRelatorio(titulo)}</h1><p class="subtitle">${cabecalhoInfo}</p></div></header>` +
    corpo +
    `<footer><div class="footer-brand">${marca.logoSvg}<span>${escapeHtmlRelatorio(marca.nome)}</span></div>${escapeHtmlRelatorio(marca.nome)} · ${escapeHtmlRelatorio(titulo)} · gerado em ${carimbo} · nenhum webhook/credencial incluído neste arquivo.</footer>` +
    `</body></html>`;
}

function cockpitAbrirHTMLExport() {
  const h = cockpitGerarHTMLExport(false);
  if (h) mostrarRelatorioVisualInline(h,"Cockpit Comercial");
}
function cockpitBaixarHTMLExport() {
  const h = cockpitGerarHTMLExport(false);
  if (h) baixarArquivo(h, `cockpit_comercial_${dataHoje()}.html`, "text/html;charset=utf-8;");
}
function cockpitAbrirRelatorioExecutivo() {
  const h = cockpitGerarHTMLExport(true);
  if (h) mostrarRelatorioVisualInline(h,"Relatório Executivo Completo — Cockpit");
}
function cockpitBaixarRelatorioExecutivo() {
  const h = cockpitGerarHTMLExport(true);
  if (h) baixarArquivo(h, `relatorio_executivo_completo_${dataHoje()}.html`, "text/html;charset=utf-8;");
}

// ---------------------------------------------------------------------------
// Gráfico de Evolução (Criação 10)
// ---------------------------------------------------------------------------
let graficoCockpitInstance = null;
function cockpitRenderizarGrafico(c) {
  const ctx = document.getElementById("graficoEvolucaoPipeline");
  if (!ctx || !window.Chart) return;
  
  // Agrupar fechamentos por dia do mês atual
  const ganhosMes = c.resultadoMesFechado || (c.deals || []).filter(d => d._SEMANTICA === "success" && dentroPeriodoCatalogo(d._FECHAMENTO, c.mes));
  const diasMes = new Date(c.mes.hojeISO).getDate();
  const dados = new Array(diasMes).fill(0);
  ganhosMes.forEach(d => {
    const dia = parseInt(d._FECHAMENTO.split("-")[2], 10);
    if (dia >= 1 && dia <= diasMes) dados[dia-1] += d._VALOR;
  });
  
  const acumulado = [];
  let soma = 0;
  for (let i = 0; i < diasMes; i++) {
    soma += dados[i];
    acumulado.push(soma);
  }
  
  const labels = Array.from({length: diasMes}, (_, i) => `${i+1}`);
  const metaLinha = new Array(diasMes).fill(c.resultadoMes.metaMensal || 0);

  if (graficoCockpitInstance) graficoCockpitInstance.destroy();
  graficoCockpitInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: 'Fechado Acumulado (R$)', data: acumulado, borderColor: '#053eff', backgroundColor: 'rgba(5, 62, 255, 0.1)', fill: true, tension: 0.1 },
        { label: 'Meta Mensal', data: metaLinha, borderColor: '#ccc', borderDash: [5, 5], fill: false, pointRadius: 0 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
  });
}

// ---------------------------------------------------------------------------
// Metas Desdobradas (Criação 5)
// ---------------------------------------------------------------------------
function cockpitRenderizarMetasDesdobradas(c) {
  const tbody = document.getElementById("cockpitMetasDesdobradasTabela");
  const elGlobal = document.getElementById("metaGlobalDesdobramento");
  if (!tbody || !elGlobal) return;
  
  const metaGlobal = c.resultadoMes.metaMensal || 0;
  elGlobal.textContent = moedaRelatorio(metaGlobal);
  
  const ganhosMes = c.resultadoMesFechado || (c.deals || []).filter(d => d._SEMANTICA === "success" && dentroPeriodoCatalogo(d._FECHAMENTO, c.mes));
  
  // Agrupar por vendedor
  const vendasVendedor = {};
  ganhosMes.forEach(d => {
    const v = d._RESPONSAVEL || "Desconhecido";
    vendasVendedor[v] = (vendasVendedor[v] || 0) + d._VALOR;
  });
  const vendedores = [...new Set((c.deals || []).map(d => d._RESPONSAVEL || "Desconhecido"))];
  
  let salvo = {};
  try { salvo = JSON.parse(localStorage.getItem("atlas-metas-desdobradas")) || {}; } catch(e){}
  
  let html = "";
  vendedores.forEach((v, i) => {
    const fechado = vendasVendedor[v] || 0;
    const atribuida = salvo[v] || (metaGlobal > 0 ? (metaGlobal / vendedores.length) : 0);
    const pct = atribuida > 0 ? ((fechado / atribuida) * 100).toFixed(1) + "%" : "—";
    html += `<tr>
      <td>${escapeHtmlRelatorio(v)}</td>
      <td><input type="number" class="meta-vendedor" data-vendedor="${escapeHtmlRelatorio(v)}" value="${atribuida.toFixed(2)}" style="width:120px; padding:4px;"></td>
      <td>${moedaRelatorio(fechado)}</td>
      <td><span class="${parseFloat(pct)>=100 ? 'badge-relatorio ok' : ''}">${pct}</span></td>
    </tr>`;
  });
  tbody.innerHTML = html || "<tr><td colspan='4'>Nenhum vendedor listado.</td></tr>";
}

window.cockpitSalvarMetasIndividuais = function() {
  const inputs = document.querySelectorAll(".meta-vendedor");
  const metas = {};
  inputs.forEach(i => { metas[i.dataset.vendedor] = parseFloat(i.value) || 0; });
  try { localStorage.setItem("atlas-metas-desdobradas", JSON.stringify(metas)); } catch(e){}
  atualizarStatus("Metas individuais salvas localmente!");
  setTimeout(() => renderizarCockpit(), 500);
};

// ---------------------------------------------------------------------------
// Customização de Layout Drag & Drop (Criação 8)
// ---------------------------------------------------------------------------
function initDragAndDrop() {
  const container = document.querySelector('.cockpit-executivo');
  if (!container) return;
  
  const draggables = document.querySelectorAll('.draggable-card');
  draggables.forEach(drg => {
    drg.addEventListener('dragstart', () => { drg.classList.add('dragging'); });
    drg.addEventListener('dragend', () => {
      drg.classList.remove('dragging');
      salvarOrdemLayout();
    });
  });

  container.addEventListener('dragover', e => {
    e.preventDefault();
    const afterElement = getDragAfterElement(container, e.clientY);
    const draggable = document.querySelector('.dragging');
    if (draggable) {
      if (afterElement == null) {
        container.appendChild(draggable);
      } else {
        container.insertBefore(draggable, afterElement);
      }
    }
  });

  restaurarOrdemLayout();
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.draggable-card:not(.dragging)')];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function salvarOrdemLayout() {
  const container = document.querySelector('.cockpit-executivo');
  if (!container) return;
  const ids = [...container.querySelectorAll('.draggable-card')].map(el => el.id);
  try { localStorage.setItem('atlas-layout-ordem', JSON.stringify(ids)); } catch(e){}
}

function restaurarOrdemLayout() {
  try {
    const salvo = JSON.parse(localStorage.getItem('atlas-layout-ordem'));
    if (!salvo) return;
    const container = document.querySelector('.cockpit-executivo');
    if (!container) return;
    salvo.forEach(id => {
      const el = document.getElementById(id);
      if (el) container.appendChild(el);
    });
  } catch(e){}
}
