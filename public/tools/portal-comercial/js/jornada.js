function normalizarTextoChave(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function idBitrixValido(valor) {
  if (valor === null || valor === undefined) return false;
  const s = String(valor).trim();
  if (!s || s === "0" || s === "0.0" || s.toLowerCase() === "null" || s.toLowerCase() === "undefined") return false;
  const n = Number(s);
  return Number.isFinite(n) && n > 0;
}

function idBitrixString(valor) {
  if (!idBitrixValido(valor)) return "";
  return String(Math.trunc(Number(valor)));
}

function limparNomeClienteParaChave(valor) {
  let s = String(valor || "").trim();
  s = s.replace(/\s*[-–—]\s*\((comercial|financeiro|p[oó]s[\s-]*vendas?|implant[aã]ç[aã]o|sucesso do cliente|perfil securit[aá]rio|reembolso|rh|t\.?i\.?)\)\s*[-–—]?\s*$/i, "");
  s = s.replace(/\s*\((comercial|financeiro|p[oó]s[\s-]*vendas?|implant[aã]ç[aã]o|sucesso do cliente|perfil securit[aá]rio|reembolso|rh|t\.?i\.?)\)\s*$/i, "");
  return s.trim();
}

function nomePareceOperacionalJornada(valor) {
  const n = normalizarTextoChave(valor);
  if (!n || n.length < 3) return true;
  const prefixos = [
    "preencher formulario de crm",
    "abertura chamado sc",
    "formulario reembolso",
    "sucesso do cliente",
    "testando",
    "teste"
  ];
  return prefixos.some((p) => n.startsWith(p));
}

const FUNIS_INTERNOS_JORNADA = new Set(["44", "8", "32", "42"]);

function classificarFunilJornada(categoryId) {
  const cat = String(categoryId ?? "");
  if (FUNIS_INTERNOS_JORNADA.has(cat)) return "INTERNO";
  if (cat === "30") return "HISTORICO_CLIENTE";
  return "CLIENTE";
}

function normalizarTelefone(valor) {
  const digitos = String(valor || "").replace(/\D/g, "");
  return digitos.length >= 8 ? digitos.slice(-11) : "";
}

function valoresMulticampo(registro, campo) {
  const v = registro?.[campo];
  if (!v) return [];
  const lista = Array.isArray(v) ? v : [v];
  return lista.map((x) => typeof x === "object" ? (x.VALUE || x.value || "") : x).filter(Boolean);
}

function nomeUsuario(id) {
  const u = mapaUsuariosJornada[String(id || "")];
  return u ? `${u.NAME || ""} ${u.LAST_NAME || ""}`.trim() || `ID ${id}` : (id ? `ID ${id}` : "");
}

async function buscarUsuariosJornada(webhook) {
  try {
    const usuarios = await carregarListaPaginada(webhook, "user.get", {});
    const mapa = {};
    usuarios.forEach((u) => { if (u.ID) mapa[String(u.ID)] = u; });
    mapaUsuariosJornada = mapa;
    return mapa;
  } catch (e) {
    mapaUsuariosJornada = {};
    return {};
  }
}

async function buscarMetadadosFunisEEstagios(webhook) {
  const categorias = {};
  const estagios = {};
  let dinamico = false;
  try {
    const bodyCat = await bitrixFetchComRetentativa(
      `${webhook.replace(/\/$/, "")}/crm.category.list.json?entityTypeId=2`
    );
    const listaCat = bodyCat?.result?.categories || [];
    for (const c of listaCat) {
      categorias[String(c.id)] = `${c.id} — ${c.name}`;
      const entityId = Number(c.id) === 0 ? "DEAL_STAGE" : `DEAL_STAGE_${c.id}`;
      const status = await carregarListaPaginada(webhook, "crm.status.list", {
        "filter[ENTITY_ID]": entityId,
        "order[SORT]": "ASC"
      });
      estagios[String(c.id)] = {};
      status.forEach((st) => {
        estagios[String(c.id)][String(st.STATUS_ID)] = {
          label: st.NAME || st.STATUS_ID,
          semantics: st?.EXTRA?.SEMANTICS || st.SEMANTICS || ""
        };
      });
      await aguardar(ATRASO_ENTRE_PAGINAS_MS);
    }
    dinamico = listaCat.length > 0;
  } catch (e) {
    // Fallback para o mapa embutido, sem interromper a extração.
  }

  if (!dinamico) {
    ENTIDADES.negocios.categorias.forEach((c) => { if (c.code !== "") categorias[String(c.code)] = c.label; });
    Object.entries(ENTIDADES.negocios.estagiosPorCategoria || {}).forEach(([cat, lista]) => {
      estagios[String(cat)] = {};
      lista.forEach((st) => { estagios[String(cat)][String(st.code)] = { label: st.label, semantics: "" }; });
    });
  }

  metadadosFunisJornada = { categorias, estagios, dinamico };
  return metadadosFunisJornada;
}

function dividirEmLotes(lista, tamanho = 100) {
  const lotes = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
  return lotes;
}

async function buscarEntidadesPorIds(webhook, method, ids, campos) {
  const mapa = {};
  const unicos = [...new Set(ids.map(String).filter((x) => x && x !== "0"))];
  for (const lote of dividirEmLotes(unicos, 100)) {
    let start = 0;
    while (true) {
      const url = montarUrl(webhook, method, campos, { "@ID": lote }, start, { ID: "ASC" });
      const body = await bitrixFetchComRetentativa(url);
      const chunk = Array.isArray(body.result) ? body.result : Object.values(body.result || {});
      chunk.forEach((r) => { if (r.ID) mapa[String(r.ID)] = r; });
      if (!body.next || chunk.length === 0) break;
      start = body.next;
      await aguardar(ATRASO_ENTRE_PAGINAS_MS);
    }
    await aguardar(ATRASO_ENTRE_PAGINAS_MS);
  }
  return mapa;
}

async function buscarHistoricoEstagios(webhook, idsNegocio) {
  const todos = [];
  const vistos = new Set();
  const ids = [...new Set(idsNegocio.map(String).filter(Boolean))];

  for (const lote of dividirEmLotes(ids, 100)) {
    let start = 0;
    while (true) {
      const params = new URLSearchParams();
      params.append("entityTypeId", "2");
      ["ID", "OWNER_ID", "STAGE_ID", "CATEGORY_ID", "STAGE_SEMANTIC_ID", "CREATED_TIME"].forEach((c) => params.append("select[]", c));
      lote.forEach((id) => params.append("filter[@OWNER_ID][]", id));
      params.append("order[ID]", "ASC");
      params.append("start", start);
      const body = await bitrixFetchComRetentativa(`${webhook.replace(/\/$/, "")}/crm.stagehistory.list.json?${params.toString()}`);
      const chunk = body?.result?.items || (Array.isArray(body?.result) ? body.result : []);
      chunk.forEach((r) => {
        const id = String(r.ID || `${r.OWNER_ID}_${r.STAGE_ID}_${r.CREATED_TIME}`);
        if (!vistos.has(id)) {
          vistos.add(id);
          todos.push(r);
        }
      });
      if (!body.next || chunk.length === 0) break;
      start = body.next;
      await aguardar(ATRASO_ENTRE_PAGINAS_MS);
    }
    await aguardar(ATRASO_ENTRE_PAGINAS_MS);
  }
  return todos;
}

function construirSinaisDuplicidadeEmpresas(empresasPorId) {
  const porNome = {};
  const porEmail = {};
  const porTelefone = {};

  Object.values(empresasPorId).forEach((e) => {
    const id = String(e.ID || "");
    const nome = normalizarTextoChave(e.TITLE);
    if (nome) (porNome[nome] ||= new Set()).add(id);
    valoresMulticampo(e, "EMAIL").map((x) => String(x).trim().toLowerCase()).filter(Boolean)
      .forEach((x) => (porEmail[x] ||= new Set()).add(id));
    valoresMulticampo(e, "PHONE").map(normalizarTelefone).filter(Boolean)
      .forEach((x) => (porTelefone[x] ||= new Set()).add(id));
  });

  const sinais = {};
  Object.values(empresasPorId).forEach((e) => {
    const id = String(e.ID || "");
    const motivos = [];
    const idsRelacionados = new Set();

    const nome = normalizarTextoChave(e.TITLE);
    if (nome && (porNome[nome]?.size || 0) > 1) {
      motivos.push("nome");
      porNome[nome].forEach((x) => idsRelacionados.add(x));
    }
    valoresMulticampo(e, "EMAIL").map((x) => String(x).trim().toLowerCase()).filter(Boolean).forEach((x) => {
      if ((porEmail[x]?.size || 0) > 1) {
        motivos.push("email");
        porEmail[x].forEach((y) => idsRelacionados.add(y));
      }
    });
    valoresMulticampo(e, "PHONE").map(normalizarTelefone).filter(Boolean).forEach((x) => {
      if ((porTelefone[x]?.size || 0) > 1) {
        motivos.push("telefone");
        porTelefone[x].forEach((y) => idsRelacionados.add(y));
      }
    });

    idsRelacionados.delete(id);
    sinais[id] = {
      duplicado: idsRelacionados.size > 0,
      motivos: [...new Set(motivos)],
      ids: [...idsRelacionados].sort((a, b) => Number(a) - Number(b))
    };
  });
  return sinais;
}

function renderizarAuditoriaJornada() {
  const bloco = document.getElementById("bloco-auditoria-jornada");
  if (!bloco) return;
  bloco.classList.remove("oculto");
  const a = auditoriaJornada || {};
  const itens = [
    ["Clientes elegíveis", a.clientesUnicos || 0],
    ["Negócios brutos", a.negociosBrutos || 0],
    ["Eventos normalizados", a.eventosNormalizados || 0],
    ["Duplicatas de contagem no pipeline", a.repeticoesMesmoPipeline || 0],
    ["Cadastros possivelmente duplicados", a.empresasPossivelmenteDuplicadas || 0],
    ["Trocas no mesmo funil", a.trocasResponsavelMesmoFunil || 0],
    ["Handoffs da jornada cliente", a.handoffsResponsavelCliente || 0],
    ["Handoffs envolvendo funil interno", a.handoffsEnvolvendoFunilInterno || 0],
    ["Lead → negócio com troca", a.trocasResponsavelLeadDeal || 0],
    ["Eventos de estágio", a.historicoEstagios || 0],
    ["Deals que mudaram de funil no histórico", a.negociosComMudancaFunilHistorico || 0],
    ["Mudanças históricas de funil", a.mudancasFunilHistorico || 0],
    ["Reentradas em estágio", a.reentradasEstagioHistorico || 0],
  ];
  document.getElementById("auditoriaJornadaGrid").innerHTML = itens.map(([rotulo, valor]) =>
    `<div class="auditoria-kpi"><span class="valor">${Number(valor).toLocaleString("pt-BR")}</span><span class="rotulo">${rotulo}</span></div>`
  ).join("");

  const notas = [
    `Completude da extração de negócios: ${a.totalBitrix == null ? "total não informado pelo Bitrix" : `${a.negociosBrutos}/${a.totalBitrix} (${a.completudePct}%)`}.`,
    `${a.idsZeroIgnorados || 0} ocorrência(s) de COMPANY_ID=0 foram interpretadas como "sem empresa" — nunca mais como COMPANY:0.`,
    `${a.registrosOperacionais || 0} registro(s) operacional(is)/interno(s) foram preservados no bruto, mas excluídos da contagem da jornada do cliente.`,
    `${a.handoffsEnvolvendoFunilInterno || 0} handoff(s) observados envolvendo RH/TI/Teste/Reembolsos foram retirados do KPI comercial e permanecem apenas para auditoria.`,
    `${a.negociosSemVinculo || 0} negócio(s) de cliente não têm COMPANY_ID, CONTACT_ID nem LEAD_ID e também não puderam usar nome confiável; ficam isolados por DEAL_ID.`,
    `${a.empresasMesmoNome || 0} grupo(s) têm o mesmo nome normalizado em COMPANY_IDs diferentes. Para contagem no pipeline, o nome exato unifica a contagem; os IDs brutos continuam separados para auditoria.`,
    metadadosFunisJornada.dinamico
      ? "Funis e estágios foram descobertos dinamicamente no Bitrix nesta execução."
      : "Funis/estágios usaram o mapa embutido como fallback porque a descoberta dinâmica não respondeu.",
    "A jornada normalizada colapsa repetições consecutivas no mesmo pipeline. Se o cliente sair e depois voltar ao pipeline, a reentrada é preservada como novo evento."
  ];
  document.getElementById("auditoriaJornadaNotas").innerHTML = notas.map((n) => `<li>${n}</li>`).join("");
  document.getElementById("btnHistoricoEstagiosCsv").disabled = !dadosHistoricoEstagios.length;
}

// v11 — adapta a auditoria da Jornada do Cliente para o mesmo modelo visual
// executivo usado no Forecast, para que "todos os itens de relatórios" tenham
// um relatório visual, não só os relatórios do catálogo v6.
function montarResultadoVisualJornada() {
  const a = auditoriaJornada || {};
  if (!a.clientesUnicos && !a.negociosBrutos) return null;
  const tabelaDe = (dados, limite = 10) => (dados || []).length ? camposDeDados(dados).slice(0, limite).map((c) => ({ label: c, valor: c })) : [];
  return {
    chave: "jornada",
    titulo: "Jornada do Cliente — completa",
    subtitulo: "Cliente único por pipeline, histórico de estágios, reentradas e duplicidades.",
    kpis: [
      kpi("Clientes elegíveis", a.clientesUnicos || 0), kpi("Negócios brutos", a.negociosBrutos || 0),
      kpi("Eventos normalizados", a.eventosNormalizados || 0), kpi("Duplicatas no pipeline", a.repeticoesMesmoPipeline || 0),
      kpi("Cadastros possiv. duplicados", a.empresasPossivelmenteDuplicadas || 0), kpi("Handoffs da jornada", a.handoffsResponsavelCliente || 0),
      kpi("Reentradas em estágio", a.reentradasEstagioHistorico || 0), kpi("Mudanças de funil", a.mudancasFunilHistorico || 0)
    ],
    tabelas: [
      { titulo: "Jornada normalizada (amostra de colunas)", dados: dadosJornadaNormalizada, colunas: tabelaDe(dadosJornadaNormalizada) },
      { titulo: "Possíveis duplicidades", dados: dadosDuplicidadesJornada, colunas: tabelaDe(dadosDuplicidadesJornada) },
      { titulo: "Handoffs de responsável", dados: dadosHandoffsCliente, colunas: tabelaDe(dadosHandoffsCliente) }
    ],
    nota: "Amostra limitada às 10 primeiras colunas de cada dataset; baixe o CSV/JSON para o detalhamento completo."
  };
}
function abrirRelatorioVisualJornada() { const h = gerarHTMLRelatorioVisualGenerico(montarResultadoVisualJornada()); if (h) mostrarRelatorioVisualInline(h,"Jornada do Cliente"); }
function baixarHTMLRelatorioVisualJornada() { const h = gerarHTMLRelatorioVisualGenerico(montarResultadoVisualJornada()); if (h) baixarArquivo(h, `jornada_cliente_modelo_atlas_${dataHoje()}.html`, "text/html;charset=utf-8;"); }

function baixarCSVJornadaNormalizada() {
  if (!dadosJornadaNormalizada.length) return;
  baixarArquivo("﻿" + linhasCSVDe(camposExtraidos, dadosJornadaNormalizada), `bitrix_jornada_normalizada_${dataHoje()}.csv`, "text/csv;charset=utf-8;");
}

function baixarCSVDuplicidadesJornada() {
  if (!dadosDuplicidadesJornada.length) return;
  baixarArquivo("﻿" + linhasCSVDe(camposExtraidos, dadosDuplicidadesJornada), `bitrix_jornada_duplicidades_${dataHoje()}.csv`, "text/csv;charset=utf-8;");
}

function baixarCSVHistoricoEstagios() {
  if (!dadosHistoricoEstagios.length) return;
  const campos = [...new Set(dadosHistoricoEstagios.flatMap((r) => Object.keys(r)))];
  baixarArquivo("﻿" + linhasCSVDe(campos, dadosHistoricoEstagios), `bitrix_historico_estagios_${dataHoje()}.csv`, "text/csv;charset=utf-8;");
}

function baixarCSVHandoffsCliente() {
  if (!dadosHandoffsCliente.length) return;
  baixarArquivo("﻿" + linhasCSVDe(camposExtraidos, dadosHandoffsCliente), `bitrix_handoffs_jornada_cliente_${dataHoje()}.csv`, "text/csv;charset=utf-8;");
}


// ---------------------------------------------------------------------------
// v5 — Forecast semanal e Diário SDR
// ---------------------------------------------------------------------------

function escapeHtmlRelatorio(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// v25 — cartão de KPI reutilizado por todos os blocos (Forecast semanal,
// Diário SDR, Análise SDR, Catálogo, Cockpit). Quando `alvoId` aponta pra um
// elemento que existe na página, o card fica clicável e rola até lá — dá
// pra consultar o detalhe sem precisar abrir o modelo visual completo.
function kpiCardHtml(rotulo, valor, alvoId) {
  const clique = alvoId ? ` kpi-clicavel" onclick="rolarParaSecao('${alvoId}')` : "";
  return `<div class="relatorio-especial-kpi${clique}"><span class="valor">${escapeHtmlRelatorio(valor)}</span><span class="rotulo">${escapeHtmlRelatorio(rotulo)}</span></div>`;
}
function rolarParaSecao(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const alvo = el.closest("details") || el;
  if (alvo.tagName === "DETAILS") alvo.open = true;
  alvo.scrollIntoView({ behavior: "smooth", block: "start" });
  alvo.classList.add("secao-realce");
  setTimeout(() => alvo.classList.remove("secao-realce"), 1300);
}

function moedaRelatorio(valor) {
  return "R$ " + (Number(valor) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function parteDataISO(valor) {
  const s = String(valor || "");
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function formatarDataBR(valor) {
  const d = parteDataISO(valor);
  if (!d) return "";
  const [ano, mes, dia] = d.split("-");
  return `${dia}/${mes}/${ano}`;
}
function formatarDataHoraBR(valor) {
  const s = String(valor || "");
  const d = formatarDataBR(s);
  if (!d) return "";
  const m = s.match(/T(\d{2}):(\d{2})/);
  return m ? `${d} ${m[1]}:${m[2]}` : d;
}
const MESES_PT_BR = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
function mesAnoBR(valor) {
  const d = parteDataISO(valor);
  if (!d) return "Sem data";
  const [ano, mes] = d.split("-");
  return `${MESES_PT_BR[Number(mes)-1] || mes} ${ano}`;
}
function chaveMesISO(valor) {
  const d = parteDataISO(valor);
  return d ? d.slice(0,7) : "sem-data";
}
function diferencaDiasAteReferencia(valor, referenciaISO) {
  const d = parteDataISO(valor), ref = parteDataISO(referenciaISO);
  if (!d || !ref) return "";
  return Math.max(0, Math.floor((new Date(`${ref}T12:00:00`) - new Date(`${d}T12:00:00`)) / 86400000));
}

function dataDentroFaixa(valor, inicio, fim) {
  const d = parteDataISO(valor);
  return !!d && (!inicio || d >= inicio) && (!fim || d <= fim);
}

function palavrasConfiguradas(id) {
  return String(document.getElementById(id)?.value || "")
    .split(",")
    .map((x) => normalizarTextoChave(x))
    .filter(Boolean);
}

function textoContemAlgumaPalavra(texto, palavras) {
  const n = normalizarTextoChave(texto);
  return palavras.some((p) => n.includes(p));
}

function nomeFunilSemCodigo(label) {
  return String(label || "").replace(/^\s*\d+\s*[—-]\s*/, "").trim();
}

function encontrarCategoriasPorPalavras(meta, palavras, preferirZero = false) {
  const achadas = [];
  Object.entries(meta.categorias || {}).forEach(([id, label]) => {
    const nome = nomeFunilSemCodigo(label);
    if (textoContemAlgumaPalavra(nome, palavras)) achadas.push(String(id));
  });
  if (preferirZero && achadas.includes("0")) {
    return ["0", ...achadas.filter((x) => x !== "0")];
  }
  return achadas;
}

function semanticaDeal(deal, metaStage) {
  const raw = String(deal.STAGE_SEMANTIC_ID || metaStage?.semantics || "").toLowerCase();
  if (raw === "s" || raw === "success") return "success";
  if (raw === "f" || raw === "failure" || raw === "apology") return "failure";
  return "process";
}

// v11 — Estágios "Piloto" (Comercial e Financeiro) não entram no pipeline
// aberto: são fase de teste/adoção do cliente, não previsão de receita.
//
// ⚠️ FONTE DA VERDADE deste projeto para regras de forecast (metas, estágios
// piloto, fallback de probabilidade, buckets). O navegador não compartilha
// módulo ES com `scripts/forecast-semanal.mjs` (Node, roda fora do navegador
// via GitHub Actions) — não há bundler neste projeto. Qualquer mudança aqui
// (novo estágio piloto, nova regra de fallback, novo bucket) precisa ser
// replicada manualmente em `scripts/forecast-semanal.mjs`, que documenta o
// mesmo aviso no sentido inverso. Ver também METAS_FORECAST_MENSAL_PADRAO em
// js/config.js.
const STAGE_IDS_PILOTO = new Set(["UC_R1YAOS", "UC_JWY0OY", "UC_AM8GK1", "UC_I37148", "UC_EU6LUO", "UC_WBYFT4", "UC_QT3CO8"]);
function ehEstagioPiloto(stageId, stageLabel) {
  if (stageId != null && STAGE_IDS_PILOTO.has(String(stageId))) return true;
  return normalizarTextoChave(stageLabel || "").includes("piloto");
}

// ⚠️ Réplica manual desta função em scripts/forecast-semanal.mjs (Node não
// importa este arquivo). Qualquer mudança de regra precisa ir nos dois lugares.
function probabilidadeFallbackForecast(label, semantica) {
  if (semantica === "success") return 100;
  if (semantica === "failure") return 0;
  const n = normalizarTextoChave(label);
  if (/assinatura|contrato assinado|piloto|termo aceito/.test(n)) return 80;
  if (/proposta|negociacao|negociação/.test(n)) return 60;
  if (/call|visita|reuniao|reunião|diagnostico|diagnóstico/.test(n)) return 40;
  if (/nova oportunidade|novo|entrada/.test(n)) return 20;
  return 30;
}

function classificarBucketForecast(prob, semantica) {
  if (semantica === "success") return "Fechado";
  if (semantica === "failure") return "Perdido";
  if (prob >= 80) return "Commit";
  if (prob >= 50) return "Best Case";
  return "Pipeline";
}

async function listarCompletoRelatorio(webhook, method, campos, filtro = {}, order = { ID: "ASC" }, textoStatus = "") {
  let start = 0;
  let acumulado = [];
  let total = null;
  let duplicados = 0;

  while (true) {
    if (extracaoCancelada) break;
    const url = montarUrl(webhook, method, campos, filtro, start, order);
    if (textoStatus) {
      atualizarStatus(`${textoStatus} ${acumulado.length}${total !== null ? " / " + total : ""}`);
    }
    const body = await bitrixFetchComRetentativa(url);
    const chunk = Array.isArray(body.result) ? body.result : Object.values(body.result || {});
    const merge = mesclarSemDuplicarPorId(acumulado, chunk);
    acumulado = merge.dados;
    duplicados += merge.duplicados;
    total = typeof body.total === "number" ? body.total : total;
    if (!body.next || chunk.length === 0) break;
    start = body.next;
    await aguardar(ATRASO_ENTRE_PAGINAS_MS);
  }

  return { dados: acumulado, total, duplicados };
}

// v27 — contador só para gerar um id único por tabela renderizada nesta
// página (permite ter várias tabelas com busca própria na mesma tela, ex.:
// Diário SDR com 5 tabelas visíveis ao mesmo tempo).
let contadorTabelaRelatorio = 0;

function tabelaRelatorio(campos, dados, limite = 250) {
  if (!dados?.length) return "<p class='rodape-nota' style='padding:10px;'>Nenhum registro encontrado.</p>";
  const lista = dados.slice(0, limite);
  let h = "<table><thead><tr>";
  campos.forEach((c) => { h += `<th>${escapeHtmlRelatorio(c.label)}</th>`; });
  h += "</tr></thead><tbody>";
  lista.forEach((r) => {
    h += "<tr>";
    campos.forEach((c) => {
      let valor = typeof c.valor === "function" ? c.valor(r) : r[c.valor];
      h += `<td>${c.html ? (valor ?? "") : escapeHtmlRelatorio(valor ?? "")}</td>`;
    });
    h += "</tr>";
  });
  h += "</tbody></table>";
  if (dados.length > limite) {
    h += `<p class="rodape-nota" style="padding:8px 10px;">Prévia de ${limite} de ${dados.length} linhas. O CSV contém tudo.</p>`;
  }

  // v27 — campo de busca em tempo real sobre as linhas já renderizadas
  // (filtra no navegador, sem chamar o Bitrix de novo). tabelaRelatorio() é a
  // única função de renderização de tabela usada por Jornada, Diário/Análise
  // SDR, Forecast (semanal/mensal) e todo o Catálogo — colocar a busca aqui
  // cobre "todos os relatórios" de uma vez, sem precisar repetir em cada um.
  const idTabela = `tabelaRel${++contadorTabelaRelatorio}`;
  return `<div class="tabela-relatorio-wrap">` +
    `<div class="tabela-relatorio-busca-row">` +
    `<input type="text" id="${idTabela}Busca" class="tabela-relatorio-busca" placeholder="🔎 Buscar nesta tabela..." oninput="filtrarTabelaRelatorio('${idTabela}')">` +
    `<span class="rodape-nota" id="${idTabela}Contador"></span>` +
    `</div>` +
    `<div id="${idTabela}">${h}</div>` +
  `</div>`;
}

// Filtra as linhas (<tr>) já renderizadas de uma tabelaRelatorio() pelo texto
// digitado — comparação normalizada (sem acento, minúscula) contra todo o
// texto da linha, então funciona em qualquer coluna sem precisar configurar
// nada por relatório.
function filtrarTabelaRelatorio(idTabela) {
  const input = document.getElementById(`${idTabela}Busca`);
  const container = document.getElementById(idTabela);
  const contador = document.getElementById(`${idTabela}Contador`);
  if (!input || !container) return;
  const termo = normalizarTextoChave(input.value);
  const linhas = container.querySelectorAll("tbody tr");
  let visiveis = 0;
  linhas.forEach((tr) => {
    const bate = !termo || normalizarTextoChave(tr.textContent).includes(termo);
    tr.style.display = bate ? "" : "none";
    if (bate) visiveis++;
  });
  if (contador) contador.textContent = termo ? `${visiveis} de ${linhas.length} linha(s)` : "";
}

function camposDeDados(dados) {
  return [...new Set((dados || []).flatMap((r) => Object.keys(r)))];
}


// ----------------------- v6: catálogo de relatórios ------------------------

function periodoCatalogo() {
  return {
    inicio: document.getElementById("dataInicio").value || "",
    fim: document.getElementById("dataFim").value || "",
    referencia: document.getElementById("dataFim").value || formatarDataISO(new Date())
  };
}
function fecharDataDeal(d) { return parteDataISO(d.UF_CRM_1770928318695 || d.CLOSEDATE || ""); }
function valorDeal(d) { return Number(d.OPPORTUNITY) || 0; }
function cicloDealDias(d) {
  const a=parteDataISO(d.DATE_CREATE), b=fecharDataDeal(d); if(!a||!b)return "";
  return Math.max(0,Math.floor((new Date(`${b}T12:00:00`)-new Date(`${a}T12:00:00`))/86400000));
}
function dentroPeriodoCatalogo(v,p){ return (!p.inicio&&!p.fim)?true:dataDentroFaixa(v,p.inicio,p.fim); }
function kpi(rotulo,valor){return{rotulo,valor};}

// v11 — barra de atingimento de meta (semanal/mensal), reutilizada nos blocos
// de Forecast semanal e Forecast mensal para mostrar visualmente se a meta
// já foi batida ou quanto falta.
// v13 — seta de tendência: verde pra cima quando já bateu a meta OU a projeção
// (fechado + pipeline ponderado) aponta para bater; vermelha pra baixo quando
// nem bateu nem está projetando bater. `projetado` é opcional — sem ele, a
// seta usa o próprio `realizado` como referência (comportamento anterior).
function barraAtingimentoMeta(rotulo, realizado, meta, projetado) {
  if (!meta) {
    return `<div class="meta-progress-row"><div class="meta-progress-head"><span>${escapeHtmlRelatorio(rotulo)}</span><span class="meta-progress-valores">${moedaRelatorio(realizado)} · meta não informada</span></div></div>`;
  }
  const pct = Math.max(0, Math.round((realizado / meta) * 1000) / 10);
  const bateu = realizado >= meta;
  const referenciaProjecao = projetado != null ? projetado : realizado;
  const noCaminho = bateu || referenciaProjecao >= meta;
  const largura = Math.min(100, pct);
  const seta = noCaminho
    ? `<span class="meta-seta meta-seta-up" title="Batendo a meta ou projetando bater">▲</span>`
    : `<span class="meta-seta meta-seta-down" title="Não está batendo nem projetando bater a meta">▼</span>`;
  return `<div class="meta-progress-row">
    <div class="meta-progress-head"><span>${seta} ${escapeHtmlRelatorio(rotulo)}</span><span class="meta-progress-valores">${moedaRelatorio(realizado)} de ${moedaRelatorio(meta)} · <strong>${pct}%</strong></span></div>
    <div class="meta-progress-track"><div class="meta-progress-fill ${bateu ? "bateu" : ""}" style="width:${largura}%;"></div></div>
    <div class="meta-progress-status ${bateu ? "ok" : "pendente"}">${bateu ? "✓ Meta batida" : `Faltam ${moedaRelatorio(Math.max(0, meta - realizado))} para bater a meta${projetado != null ? ` · projeção: ${moedaRelatorio(projetado)}` : ""}`}</div>
  </div>`;
}

// ---------------------------------------------------------------------------
// v20 — histórico local de Meta Mensal: como a ferramenta é 100% client-side
// (sem backend/banco), cada extração do Forecast (semanal ou catálogo mensal)
// grava uma "foto" do dia (meta/fechado/projeção) no localStorage deste
// navegador. Serve para desenhar uma mini tendência no relatório visual —
// é histórico só deste navegador/dispositivo, não sincroniza entre pessoas.
// ---------------------------------------------------------------------------
const CHAVE_HISTORICO_FORECAST_LOCAL = "atlas-extrator-historico-forecast";
// v27 — multi-empresa: sufixo por marca (igual ao webhook em bitrix-api.js),
// senão o histórico local de Forecast da Total Trac se misturaria com o da
// AtlasGR (mesma chave global de localStorage antes desta mudança).
function chaveHistoricoForecastAtual() {
  return CHAVE_HISTORICO_FORECAST_LOCAL + (typeof marcaAtiva === "function" ? marcaAtiva().sufixoStorage : "");
}
function carregarHistoricoForecastLocal() {
  try { return JSON.parse(localStorage.getItem(chaveHistoricoForecastAtual()) || "[]"); }
  catch (e) { return []; }
}
function salvarHistoricoForecastLocal(snapshot) {
  if (!snapshot?.data) return;
  try {
    const lista = carregarHistoricoForecastLocal();
    const idx = lista.findIndex((x) => x.data === snapshot.data);
    if (idx >= 0) lista[idx] = snapshot; else lista.push(snapshot);
    lista.sort((a, b) => a.data.localeCompare(b.data));
    while (lista.length > 60) lista.shift();
    localStorage.setItem(chaveHistoricoForecastAtual(), JSON.stringify(lista));
  } catch (e) { /* localStorage indisponível (modo privado, quota) — segue sem histórico */ }
}
// v20 — mini gráfico de tendência (SVG puro, sem lib) comparando fechado no mês
// vs. meta mensal ao longo das últimas extrações registradas neste navegador.
function sparklineHistoricoForecast(historico) {
  const pts = (historico || []).slice(-12);
  if (pts.length < 2) {
    return `<div class="trend-box trend-vazio"><span>📈 Tendência ainda não disponível — aparece a partir da 2ª extração do Forecast feita neste navegador.</span></div>`;
  }
  const w = 320, h = 64, pad = 8;
  const max = Math.max(1, ...pts.map((p) => p.metaMensal || 0), ...pts.map((p) => p.fechadoMes || 0), ...pts.map((p) => p.projecaoMes || 0));
  const stepX = (w - 2 * pad) / (pts.length - 1);
  const coordY = (v) => (h - pad - ((Number(v) || 0) / max) * (h - 2 * pad)).toFixed(1);
  const linha = (campo) => pts.map((p, i) => `${(pad + i * stepX).toFixed(1)},${coordY(p[campo])}`).join(" ");
  const ultimo = pts[pts.length - 1];
  return `<div class="trend-box">
    <div class="trend-head"><span>📈 Tendência (histórico neste navegador)</span><span class="trend-sub">${pts.length} extração(ões) · última em ${formatarDataBR(ultimo.data)}</span></div>
    <svg viewBox="0 0 ${w} ${h}" class="trend-svg" preserveAspectRatio="none" role="img" aria-label="Tendência de fechado, projeção e meta mensal">
      <polyline points="${linha("metaMensal")}" class="trend-line trend-line-meta"/>
      <polyline points="${linha("projecaoMes")}" class="trend-line trend-line-projecao"/>
      <polyline points="${linha("fechadoMes")}" class="trend-line trend-line-fechado"/>
    </svg>
    <div class="trend-legend"><span><i class="trend-dot trend-dot-fechado"></i>Fechado</span><span><i class="trend-dot trend-dot-projecao"></i>Projeção</span><span><i class="trend-dot trend-dot-meta"></i>Meta</span></div>
  </div>`;
}

// ---------------------------------------------------------------------------
// v21 — página Evolução (evolucao.html): combina o histórico local (deste
// navegador, salvo a cada extração do Forecast) com o histórico "oficial"
// gravado pelo script automático semanal (relatorios/forecast-semanal/
// historico.json, versionado no repositório e publicado junto com o site,
// então visível em qualquer dispositivo). Quando os dois têm uma "foto" do
// mesmo dia, a automática vence (é a fonte mais confiável).
// ---------------------------------------------------------------------------
async function carregarHistoricoCompartilhadoForecast() {
  try {
    const resp = await fetch("relatorios/forecast-semanal/historico.json", { cache: "no-store" });
    if (!resp.ok) return [];
    const dados = await resp.json();
    return Array.isArray(dados) ? dados.map((x) => ({ ...x, fonte: "automatico" })) : [];
  } catch (e) {
    return []; // arquivo ainda não existe, ou página aberta via file:// (sem fetch de outro arquivo)
  }
}
function mesclarHistoricosForecast(compartilhado, local) {
  const porData = {};
  (local || []).forEach((x) => { porData[x.data] = { ...x, fonte: "local" }; });
  (compartilhado || []).forEach((x) => { porData[x.data] = { ...x, fonte: "automatico" }; });
  return Object.values(porData).sort((a, b) => a.data.localeCompare(b.data));
}
// Gráfico grande (bem maior que o sparkline embutido no relatório) para a
// página Evolução: eixo com linhas-guia, rótulos de data e círculos com
// tooltip nativo (title) em cada ponto — tudo em SVG puro, sem lib de gráfico.
function graficoEvolucaoForecast(pontos) {
  if (!pontos.length) {
    return `<p class="rodape-nota">Nenhum dado de evolução ainda. Ele aparece automaticamente a cada extração do Forecast (semanal ou catálogo mensal) feita nesta ferramenta, e toda sexta-feira via automação.</p>`;
  }
  if (pontos.length < 2) {
    return `<p class="rodape-nota">Só há 1 registro até agora (${formatarDataBR(pontos[0].data)}). O gráfico aparece a partir do 2º registro — continue extraindo o Forecast normalmente.</p>`;
  }
  const w = 900, h = 320, padL = 92, padR = 24, padT = 20, padB = 40;
  const max = Math.max(1, ...pontos.map((p) => p.metaMensal || 0), ...pontos.map((p) => p.fechadoMes || 0), ...pontos.map((p) => p.projecaoMes || 0)) * 1.08;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const stepX = pontos.length > 1 ? innerW / (pontos.length - 1) : 0;
  const coordX = (i) => padL + i * stepX;
  const coordY = (v) => padT + innerH - ((Number(v) || 0) / max) * innerH;
  const linha = (campo) => pontos.map((p, i) => `${coordX(i).toFixed(1)},${coordY(p[campo]).toFixed(1)}`).join(" ");
  const gridN = 4;
  const grid = Array.from({ length: gridN + 1 }, (_, i) => {
    const valor = (max / gridN) * i, y = coordY(valor);
    const rotulo = "R$ " + Math.round(valor).toLocaleString("pt-BR");
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" class="evo-grid-line"/><text x="${padL - 10}" y="${(y + 3).toFixed(1)}" class="evo-grid-label" text-anchor="end">${rotulo}</text>`;
  }).join("");
  const maxRotulos = 8;
  const cadaN = Math.max(1, Math.ceil(pontos.length / maxRotulos));
  const rotulosX = pontos.map((p, i) => (i % cadaN === 0 || i === pontos.length - 1)
    ? `<text x="${coordX(i).toFixed(1)}" y="${h - padB + 18}" class="evo-grid-label" text-anchor="middle">${formatarDataBR(p.data).slice(0, 5)}</text>` : "").join("");
  const pontosFechado = pontos.map((p, i) => `<circle cx="${coordX(i).toFixed(1)}" cy="${coordY(p.fechadoMes).toFixed(1)}" r="3.4" class="evo-point evo-point-fechado"><title>${formatarDataBR(p.data)} (${p.fonte === "automatico" ? "automático" : "local"})\nFechado: ${moedaRelatorio(p.fechadoMes)}\nProjeção: ${moedaRelatorio(p.projecaoMes)}\nMeta: ${moedaRelatorio(p.metaMensal)}</title></circle>`).join("");
  return `<svg viewBox="0 0 ${w} ${h}" class="evo-svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Evolução de fechado, projeção e meta mensal ao longo do tempo">
    ${grid}
    <polyline points="${linha("metaMensal")}" class="evo-line evo-line-meta"/>
    <polyline points="${linha("projecaoMes")}" class="evo-line evo-line-projecao"/>
    <polyline points="${linha("fechadoMes")}" class="evo-line evo-line-fechado"/>
    ${pontosFechado}
    ${rotulosX}
  </svg>
  <div class="evo-legend"><span><i class="trend-dot trend-dot-fechado"></i>Fechado no mês</span><span><i class="trend-dot trend-dot-projecao"></i>Projeção final</span><span><i class="trend-dot trend-dot-meta"></i>Meta mensal</span></div>`;
}
function tabelaEvolucaoForecast(pontos) {
  if (!pontos.length) return "";
  const linhas = [...pontos].reverse().map((p) => {
    const pct = p.metaMensal > 0 ? `${Math.round((p.fechadoMes / p.metaMensal) * 1000) / 10}%` : "—";
    const fonteLabel = p.fonte === "automatico" ? "🤖 Automático" : "💻 Local";
    return `<tr><td>${escapeHtmlRelatorio(formatarDataBR(p.data))}</td><td>${fonteLabel}</td><td>${moedaRelatorio(p.metaMensal)}</td><td>${moedaRelatorio(p.fechadoMes)}</td><td>${moedaRelatorio(p.projecaoMes)}</td><td>${pct}</td></tr>`;
  }).join("");
  return `<table><thead><tr><th>Data</th><th>Fonte</th><th>Meta mensal</th><th>Fechado</th><th>Projeção</th><th>Atingimento</th></tr></thead><tbody>${linhas}</tbody></table>`;
}
// v26 — "pontos de atenção" (CLOSEDATE vencida / sem CLOSEDATE) calculados
// pela automação semanal (scripts/forecast-semanal.mjs), a partir do mesmo
// laço de negócios que já gera o histórico de meta/fechado/projeção — por
// isso vivem no mesmo registro do historico.json, sem chamada extra ao
// Bitrix. Só existem a partir da 1ª execução automática depois desta
// mudança; registros antigos ficam sem esses campos (tratado como 0/ausente).
// v28 — "Pontos de atenção" virou 2 achados reais (não decorativos: o tom
// reflete o número, não fica sempre laranja neutro como no .atencao-mini-card
// anterior, que não existe mais). Achado > 0 = .gap (vermelho, precisa agir);
// achado = 0 = .win (verde, sem pendência) — melhora real de semântica, não
// só de estilo, já que antes "0 vencidos" e "15 vencidos" renderizavam
// idênticos.
function pontosAtencaoEvolucaoHtml(pontos) {
  const comDados = [...pontos].reverse().find((p) => p.vencidoCount != null || p.semCloseDateCount != null);
  if (!comDados) {
    return `<p class="rodape-nota">Ainda sem pontos de atenção registrados — aparecem a partir da próxima execução automática do Forecast semanal (toda sexta-feira).</p>`;
  }
  const vencido = comDados.vencidoCount ?? 0;
  const semData = comDados.semCloseDateCount ?? 0;
  const achado = (qtd, texto) => `<div class="achado ${qtd > 0 ? "gap" : "win"}">
    <span class="marker">${qtd > 0 ? "⚠️" : "✅"}</span>
    <span class="txt"><b>${qtd}</b> ${texto}</span>
  </div>`;
  return `<div class="achados">
    ${achado(vencido, `negócio(s) com CLOSEDATE vencida ainda aberto(s) — ${moedaRelatorio(comDados.vencidoValor || 0)}`)}
    ${achado(semData, `negócio(s) aberto(s) sem CLOSEDATE preenchida — ${moedaRelatorio(comDados.semCloseDateValor || 0)}`)}
  </div>
  <p class="rodape-nota">Atualizado em ${formatarDataBR(comDados.data)} (fonte: ${comDados.fonte === "automatico" ? "automática, toda sexta-feira" : "local, neste navegador"}).</p>`;
}
async function iniciarPaginaEvolucao() {
  const status = document.getElementById("evolucaoStatus");
  if (status) status.textContent = "Carregando histórico...";
  // v27 — relatorios/forecast-semanal/historico.json é escrito só pela
  // automação da AtlasGR (scripts/forecast-semanal.mjs, webhook fixo dela) —
  // não existe automação equivalente para a Total Trac. Buscar esse arquivo
  // fora da AtlasGR misturaria dado de uma empresa na tela da outra, então só
  // a AtlasGR usa a fonte "automática"; Total Trac fica só com o histórico
  // local (extrações feitas nesta ferramenta).
  const [compartilhado, local] = await Promise.all([
    empresaAtiva() === "atlasgr" ? carregarHistoricoCompartilhadoForecast() : Promise.resolve([]),
    Promise.resolve(carregarHistoricoForecastLocal()),
  ]);
  const pontos = mesclarHistoricosForecast(compartilhado, local);
  const graficoEl = document.getElementById("evolucaoGrafico");
  const tabelaEl = document.getElementById("evolucaoTabela");
  const atencaoEl = document.getElementById("evolucaoAtencao");
  if (graficoEl) graficoEl.innerHTML = graficoEvolucaoForecast(pontos);
  if (tabelaEl) tabelaEl.innerHTML = pontos.length ? tabelaEvolucaoForecast(pontos) : "";
  if (atencaoEl) atencaoEl.innerHTML = pontosAtencaoEvolucaoHtml(pontos);
  if (status) {
    status.textContent = pontos.length
      ? `${pontos.length} registro(s) — ${compartilhado.length ? `${compartilhado.length} automático(s)` : "nenhum automático ainda"}, ${local.length} local(is) neste navegador.`
      : "Nenhum registro encontrado ainda.";
  }
}

async function extrairJornada(webhook) {
  document.getElementById("spinner").style.display = "inline-block";
  document.getElementById("btnExtrair").disabled = true;
  document.getElementById("btnParar").disabled = false;
  extracaoCancelada = false;
  esconderErro();
  document.getElementById("bloco-auditoria-jornada").classList.add("oculto");
  auditoriaJornada = {};
  dadosJornadaNormalizada = [];
  dadosDuplicidadesJornada = [];
  dadosHistoricoEstagios = [];
  dadosHandoffsCliente = [];

  try {
    atualizarStatus("Descobrindo campos, funis e estágios diretamente no Bitrix...");
    const [campos, meta] = await Promise.all([
      buscarCamposDinamicos(webhook, "crm.deal.fields"),
      buscarMetadadosFunisEEstagios(webhook)
    ]);

    const camposNecessarios = [
      "ID", "TITLE", "CATEGORY_ID", "STAGE_ID", "STAGE_SEMANTIC_ID",
      "DATE_CREATE", "DATE_MODIFY", "MOVED_TIME", "CLOSEDATE",
      "ASSIGNED_BY_ID", "CREATED_BY_ID", "MODIFY_BY_ID", "MOVED_BY_ID",
      "COMPANY_ID", "CONTACT_ID", "LEAD_ID", "SOURCE_ID",
      "UTM_SOURCE", "UTM_MEDIUM", "UTM_CAMPAIGN", "UTM_CONTENT", "UTM_TERM"
    ];
    const camposDeals = [...new Set([...camposNecessarios, ...campos])];

    const filtro = {};
    const inicio = document.getElementById("dataInicio").value;
    const fim = document.getElementById("dataFim").value;
    if (inicio) filtro[">=DATE_CREATE"] = inicio + "T00:00:00-03:00";
    if (fim) filtro["<=DATE_CREATE"] = fim + "T23:59:59-03:00";

    let start = 0;
    let acumulado = [];
    let total = null;
    let duplicadosAPI = 0;

    while (true) {
      if (extracaoCancelada) break;
      const url = montarUrl(webhook, "crm.deal.list", camposDeals, filtro, start, { ID: "ASC" });
      atualizarStatus(`Buscando negócios em ordem estável de ID... ${acumulado.length}${total !== null ? " / " + total : ""} registros`);
      const body = await bitrixFetchComRetentativa(url);
      const chunk = Array.isArray(body.result) ? body.result : Object.values(body.result || {});
      const merge = mesclarSemDuplicarPorId(acumulado, chunk);
      acumulado = merge.dados;
      duplicadosAPI += merge.duplicados;
      total = typeof body.total === "number" ? body.total : total;
      if (!body.next || chunk.length === 0) break;
      start = body.next;
      await aguardar(ATRASO_ENTRE_PAGINAS_MS);
    }

    if (extracaoCancelada) {
      atualizarStatus(`Parado pelo usuário. ${acumulado.length} negócio(s) já foram preservados.`);
    }

    // ID=0 no Bitrix significa "sem vínculo". Nunca pode virar COMPANY:0 / CONTACT:0 / LEAD:0.
    const idsEmpresa = [...new Set(acumulado.map((d) => d.COMPANY_ID).filter(idBitrixValido).map(idBitrixString))];
    const idsContatoSemEmpresa = [...new Set(
      acumulado
        .filter((d) => !idBitrixValido(d.COMPANY_ID) && idBitrixValido(d.CONTACT_ID))
        .map((d) => idBitrixString(d.CONTACT_ID))
    )];
    const idsLead = [...new Set(acumulado.map((d) => d.LEAD_ID).filter(idBitrixValido).map(idBitrixString))];

    atualizarStatus(`Enriquecendo ${idsEmpresa.length} empresa(s), ${idsContatoSemEmpresa.length} contato(s) e ${idsLead.length} lead(s) em lotes...`);
    const [empresasPorId, contatosPorId, leadsPorId] = await Promise.all([
      buscarEntidadesPorIds(webhook, "crm.company.list", idsEmpresa, ["ID", "TITLE", "PHONE", "EMAIL", "DATE_CREATE", "ASSIGNED_BY_ID"]),
      buscarEntidadesPorIds(webhook, "crm.contact.list", idsContatoSemEmpresa, ["ID", "NAME", "LAST_NAME", "PHONE", "EMAIL", "DATE_CREATE", "ASSIGNED_BY_ID"]),
      buscarEntidadesPorIds(webhook, "crm.lead.list", idsLead, ["ID", "TITLE", "ASSIGNED_BY_ID", "CREATED_BY_ID", "MODIFY_BY_ID", "DATE_CREATE", "SOURCE_ID", "UTM_SOURCE", "UTM_MEDIUM", "UTM_CAMPAIGN", "UTM_CONTENT", "UTM_TERM"])
    ]);
    await buscarUsuariosJornada(webhook);

    const sinaisDuplicidade = construirSinaisDuplicidadeEmpresas(empresasPorId);

    // Índice por nome exato normalizado. Só esse sinal é usado para unificar a chave de CONTAGEM.
    // Telefone/e-mail continuam sendo sinal de auditoria, nunca fusão automática.
    const nomesParaIds = {};
    Object.values(empresasPorId).forEach((e) => {
      const nome = normalizarTextoChave(e.TITLE);
      if (nome) (nomesParaIds[nome] ||= new Set()).add(String(e.ID));
    });
    const gruposMesmoNome = Object.values(nomesParaIds).filter((set) => set.size > 1).length;

    // Chave de identidade da jornada.
    // COMPANY_ID > CONTACT_ID > LEAD_ID > nome limpo confiável > DEAL isolado.
    const grupos = {};
    let idsZeroIgnorados = 0;
    let registrosOperacionais = 0;

    acumulado.forEach((d) => {
      let chave, tipo, confianca;
      const companyOk = idBitrixValido(d.COMPANY_ID);
      const contactOk = idBitrixValido(d.CONTACT_ID);
      const leadOk = idBitrixValido(d.LEAD_ID);

      if (!companyOk && String(d.COMPANY_ID ?? "").trim() === "0") idsZeroIgnorados++;

      if (companyOk) {
        chave = `COMPANY:${idBitrixString(d.COMPANY_ID)}`;
        tipo = "COMPANY_ID";
        confianca = "ALTA";
      } else if (contactOk) {
        chave = `CONTACT:${idBitrixString(d.CONTACT_ID)}`;
        tipo = "CONTACT_ID";
        confianca = "ALTA";
      } else if (leadOk) {
        chave = `LEAD:${idBitrixString(d.LEAD_ID)}`;
        tipo = "LEAD_ID";
        confianca = "MEDIA";
      } else {
        const nomeLimpo = limparNomeClienteParaChave(d.TITLE || "");
        const nomeNorm = normalizarTextoChave(nomeLimpo);
        if (nomeNorm && !nomePareceOperacionalJornada(nomeLimpo)) {
          chave = `NOME:${nomeNorm}`;
          tipo = "NOME_NORMALIZADO";
          confianca = "MEDIA";
        } else {
          chave = `DEAL:${d.ID}`;
          tipo = "DEAL_ID_ISOLADO";
          confianca = "BAIXA";
        }
      }

      const cat = String(d.CATEGORY_ID ?? "");
      const classificacaoFunil = classificarFunilJornada(cat);
      const registroOperacional = tipo === "DEAL_ID_ISOLADO" && nomePareceOperacionalJornada(d.TITLE || "");
      if (registroOperacional) registrosOperacionais++;

      // Chave específica para CONTAGEM. Se existem COMPANY_IDs diferentes com exatamente
      // o mesmo nome normalizado, conta uma vez no pipeline, mas mantém os IDs separados no bruto.
      let chaveContagem = chave;
      if (companyOk) {
        const empresa = empresasPorId[idBitrixString(d.COMPANY_ID)];
        const nomeEmpresaNorm = normalizarTextoChave(empresa?.TITLE || "");
        if (nomeEmpresaNorm && (nomesParaIds[nomeEmpresaNorm]?.size || 0) > 1) {
          chaveContagem = `NOME_EMPRESA:${nomeEmpresaNorm}`;
        }
      }

      const elegivel = classificacaoFunil !== "INTERNO" && !registroOperacional;

      d.__CLIENTE_KEY = chave;
      d.__CLIENTE_KEY_TIPO = tipo;
      d.__CLIENTE_KEY_CONFIANCA = confianca;
      d.__CLIENTE_CONTAGEM_KEY = chaveContagem;
      d.__FUNIL_CLASSIFICACAO = classificacaoFunil;
      d.__REGISTRO_OPERACIONAL = registroOperacional;
      d.__JORNADA_ELEGIVEL = elegivel;

      (grupos[chave] ||= []).push(d);
    });

    // Ordem e total para "mesmo cliente no mesmo pipeline", usando CLIENTE_CONTAGEM_KEY.
    // Isso evita contar o mesmo cliente várias vezes, inclusive quando há COMPANY_ID duplicado
    // com exatamente o mesmo nome.
    const gruposContagemFunil = {};
    acumulado.forEach((d) => {
      const cat = String(d.CATEGORY_ID ?? "");
      const k = `${d.__CLIENTE_CONTAGEM_KEY}|||${cat}`;
      (gruposContagemFunil[k] ||= []).push(d);
    });

    const infoContagemPorDeal = {};
    Object.values(gruposContagemFunil).forEach((arr) => {
      arr.sort((a, b) => {
        const da = new Date(a.DATE_CREATE || 0).getTime();
        const db = new Date(b.DATE_CREATE || 0).getTime();
        return da !== db ? da - db : Number(a.ID || 0) - Number(b.ID || 0);
      });
      arr.forEach((d, idx) => {
        infoContagemPorDeal[String(d.ID)] = { ordem: idx + 1, total: arr.length };
      });
    });

    // Histórico real de estágio, opcional.
    if (document.getElementById("incluirHistoricoEstagios")?.checked && !extracaoCancelada) {
      atualizarStatus("Buscando histórico real de mudanças de estágio...");
      try {
        dadosHistoricoEstagios = await buscarHistoricoEstagios(webhook, acumulado.map((d) => d.ID));
      } catch (e) {
        dadosHistoricoEstagios = [];
      }
    }

    const historicoPorDeal = {};
    dadosHistoricoEstagios.forEach((h) => (historicoPorDeal[String(h.OWNER_ID)] ||= []).push(h));
    Object.values(historicoPorDeal).forEach((arr) => arr.sort((a, b) => new Date(a.CREATED_TIME || 0) - new Date(b.CREATED_TIME || 0)));

    const linhas = [];
    let repeticoesMesmoPipeline = 0;
    let trocasResponsavelJornada = 0;
    let trocasResponsavelMesmoFunil = 0;
    let handoffsResponsavelEntreFunis = 0;
    let handoffsResponsavelCliente = 0;
    let handoffsEnvolvendoFunilInterno = 0;
    let trocasResponsavelLeadDeal = 0;
    let negociosSemVinculo = 0;

    Object.entries(grupos).forEach(([clienteKey, deals]) => {
      deals.sort((a, b) => {
        const da = new Date(a.DATE_CREATE || 0).getTime();
        const db = new Date(b.DATE_CREATE || 0).getTime();
        return da !== db ? da - db : Number(a.ID || 0) - Number(b.ID || 0);
      });

      const primeiraData = deals[0]?.DATE_CREATE ? new Date(deals[0].DATE_CREATE) : null;

      // Eventos da jornada consideram apenas funis de cliente. Funis internos não criam
      // falsos "retornos" ao Comercial/Pós-Vendas.
      let ultimoFunilElegivel = null;
      let ordemEvento = 0;
      const eventosFlags = [];
      deals.forEach((d) => {
        const cat = String(d.CATEGORY_ID ?? "");
        if (!d.__JORNADA_ELEGIVEL) {
          eventosFlags.push(false);
          return;
        }
        if (cat !== ultimoFunilElegivel) {
          ordemEvento++;
          eventosFlags.push(true);
          ultimoFunilElegivel = cat;
        } else {
          eventosFlags.push(false);
        }
      });
      const totalEventos = ordemEvento;

      let responsavelAnterior = "";
      let categoriaAnterior = "";
      let responsavelAnteriorElegivel = "";
      let categoriaAnteriorElegivel = "";
      let trocasDoCliente = 0;
      let trocasMesmoFunilDoCliente = 0;
      let handoffsDoCliente = 0;

      deals.forEach((d, idx) => {
        const cat = String(d.CATEGORY_ID ?? "");
        const infoContagem = infoContagemPorDeal[String(d.ID)] || { ordem: 1, total: 1 };
        if (d.__JORNADA_ELEGIVEL && infoContagem.ordem > 1) repeticoesMesmoPipeline++;

        const empresa = idBitrixValido(d.COMPANY_ID) ? empresasPorId[idBitrixString(d.COMPANY_ID)] : null;
        const contato = !idBitrixValido(d.COMPANY_ID) && idBitrixValido(d.CONTACT_ID)
          ? contatosPorId[idBitrixString(d.CONTACT_ID)]
          : null;
        const lead = idBitrixValido(d.LEAD_ID) ? leadsPorId[idBitrixString(d.LEAD_ID)] : null;

        let clienteNome = empresa?.TITLE || "";
        if (!clienteNome && contato) clienteNome = `${contato.NAME || ""} ${contato.LAST_NAME || ""}`.trim();
        if (!clienteNome && lead?.TITLE) clienteNome = limparNomeClienteParaChave(lead.TITLE);
        if (!clienteNome) clienteNome = limparNomeClienteParaChave(d.TITLE || "") || `Negócio ${d.ID}`;

        const sinalDup = idBitrixValido(d.COMPANY_ID)
          ? (sinaisDuplicidade[idBitrixString(d.COMPANY_ID)] || { duplicado: false, motivos: [], ids: [] })
          : { duplicado: false, motivos: [], ids: [] };

        const metaStage = meta.estagios?.[cat]?.[String(d.STAGE_ID)] || {};
        const hist = historicoPorDeal[String(d.ID)] || [];

        const responsavelAtual = idBitrixValido(d.ASSIGNED_BY_ID) ? idBitrixString(d.ASSIGNED_BY_ID) : "";
        const mudouNaJornada = !!(responsavelAnterior && responsavelAtual && responsavelAnterior !== responsavelAtual);
        const mudouMesmoFunil = !!(mudouNaJornada && categoriaAnterior && categoriaAnterior === cat);
        const handoffEntreFunis = !!(mudouNaJornada && categoriaAnterior && categoriaAnterior !== cat);

        // KPI da jornada cliente: compara somente registros elegíveis entre si.
        // Funis internos (RH, TI, Teste, Reembolsos) permanecem no bruto, mas não entram
        // no handoff comercial. Assim, um RH → Comercial não infla o indicador.
        const mudouEntreElegiveis = !!(
          d.__JORNADA_ELEGIVEL &&
          responsavelAnteriorElegivel &&
          responsavelAtual &&
          responsavelAnteriorElegivel !== responsavelAtual
        );
        const handoffCliente = !!(
          mudouEntreElegiveis &&
          categoriaAnteriorElegivel &&
          categoriaAnteriorElegivel !== cat
        );
        const trocaMesmoFunilCliente = !!(
          mudouEntreElegiveis &&
          categoriaAnteriorElegivel &&
          categoriaAnteriorElegivel === cat
        );
        const envolveFunilInterno = !!(
          handoffEntreFunis &&
          (
            FUNIS_INTERNOS_JORNADA.has(String(categoriaAnterior || "")) ||
            FUNIS_INTERNOS_JORNADA.has(String(cat || ""))
          )
        );

        if (mudouNaJornada) {
          trocasResponsavelJornada++;
          trocasDoCliente++;
        }
        if (mudouMesmoFunil) {
          trocasResponsavelMesmoFunil++;
          trocasMesmoFunilDoCliente++;
        }
        if (handoffEntreFunis) {
          handoffsResponsavelEntreFunis++;
          if (envolveFunilInterno) handoffsEnvolvendoFunilInterno++;
        }
        if (handoffCliente) {
          handoffsResponsavelCliente++;
          handoffsDoCliente++;
        }

        const respLead = idBitrixValido(lead?.ASSIGNED_BY_ID) ? idBitrixString(lead.ASSIGNED_BY_ID) : "";
        const mudouLeadDeal = !!(respLead && responsavelAtual && respLead !== responsavelAtual);
        if (mudouLeadDeal) trocasResponsavelLeadDeal++;

        if (d.__CLIENTE_KEY_TIPO === "DEAL_ID_ISOLADO" && !d.__REGISTRO_OPERACIONAL) negociosSemVinculo++;

        const linha = { ...d };
        delete linha.__CLIENTE_KEY;
        delete linha.__CLIENTE_KEY_TIPO;
        delete linha.__CLIENTE_KEY_CONFIANCA;
        delete linha.__CLIENTE_CONTAGEM_KEY;
        delete linha.__FUNIL_CLASSIFICACAO;
        delete linha.__REGISTRO_OPERACIONAL;
        delete linha.__JORNADA_ELEGIVEL;

        linha.CLIENTE_KEY = clienteKey;
        linha.CLIENTE_KEY_TIPO = d.__CLIENTE_KEY_TIPO;
        linha.CLIENTE_KEY_CONFIANCA = d.__CLIENTE_KEY_CONFIANCA;
        linha.CLIENTE_CONTAGEM_KEY = d.__CLIENTE_CONTAGEM_KEY;
        linha.CLIENTE_NOME = clienteNome;
        linha.CLIENTE_NOME_NORMALIZADO = normalizarTextoChave(clienteNome);

        linha.FUNIL = meta.categorias[cat] || (cat ? `Categoria ${cat}` : "");
        linha.FUNIL_CLASSIFICACAO = d.__FUNIL_CLASSIFICACAO;
        linha.REGISTRO_OPERACIONAL = d.__REGISTRO_OPERACIONAL ? "S" : "N";
        linha.JORNADA_CLIENTE_ELEGIVEL = d.__JORNADA_ELEGIVEL ? "S" : "N";
        linha.ESTAGIO_LABEL = metaStage.label || d.STAGE_ID || "";
        linha.STAGE_SEMANTIC_NORMALIZED = metaStage.semantics || d.STAGE_SEMANTIC_ID || "";

        linha.ORDEM_NA_JORNADA = idx + 1;
        linha.TOTAL_REGISTROS_CLIENTE = deals.length;
        linha.DIAS_DESDE_PRIMEIRA_ENTRADA = (primeiraData && d.DATE_CREATE)
          ? Math.floor((new Date(d.DATE_CREATE) - primeiraData) / 86400000)
          : "";

        // Duplicidade para CONTAGEM: "CLIENTE_REPETIDO" marca o grupo inteiro;
        // "DUPLICADO" marca apenas a 2ª linha em diante, que deve ser excluída da contagem.
        linha.ORDEM_CLIENTE_NO_FUNIL = infoContagem.ordem;
        linha.TOTAL_NEGOCIOS_CLIENTE_NO_FUNIL = infoContagem.total;
        linha.CLIENTE_REPETIDO_NO_FUNIL = infoContagem.total > 1 ? "S" : "N";
        linha.DUPLICADO_CLIENTE_NO_FUNIL = d.__JORNADA_ELEGIVEL && infoContagem.ordem > 1 ? "S" : "N";
        linha.CONTA_CLIENTE_UNICO_NO_FUNIL = d.__JORNADA_ELEGIVEL && infoContagem.ordem === 1 ? "S" : "N";

        linha.CONTA_COMO_EVENTO_JORNADA = d.__JORNADA_ELEGIVEL && eventosFlags[idx] ? "S" : "N";
        linha.ORDEM_EVENTO_JORNADA = eventosFlags.slice(0, idx + 1).filter(Boolean).length;
        linha.TOTAL_EVENTOS_JORNADA = totalEventos;

        linha.POSSIVEL_DUPLICIDADE_CADASTRAL = sinalDup.duplicado ? "S" : "N";
        linha.MOTIVO_DUPLICIDADE_CADASTRAL = sinalDup.motivos.join("|");
        linha.COMPANY_IDS_RELACIONADOS = sinalDup.ids.join("|");

        linha.RESPONSAVEL_ATUAL_ID = responsavelAtual;
        linha.RESPONSAVEL_ATUAL_NOME = nomeUsuario(responsavelAtual);
        linha.RESPONSAVEL_ANTERIOR_JORNADA_ID = responsavelAnterior;
        linha.RESPONSAVEL_ANTERIOR_JORNADA_NOME = nomeUsuario(responsavelAnterior);
        linha.FUNIL_ANTERIOR_JORNADA = categoriaAnterior ? (meta.categorias[categoriaAnterior] || `Categoria ${categoriaAnterior}`) : "";
        linha.TROCA_RESPONSAVEL_DESDE_REGISTRO_ANTERIOR = mudouNaJornada ? "S" : "N";
        linha.TROCA_RESPONSAVEL_MESMO_FUNIL = mudouMesmoFunil ? "S" : "N";
        linha.HANDOFF_RESPONSAVEL_ENTRE_FUNIS = handoffEntreFunis ? "S" : "N";
        linha.HANDOFF_ENVOLVE_FUNIL_INTERNO = envolveFunilInterno ? "S" : "N";
        linha.HANDOFF_JORNADA_CLIENTE = handoffCliente ? "S" : "N";
        linha.TROCA_RESPONSAVEL_MESMO_FUNIL_JORNADA = trocaMesmoFunilCliente ? "S" : "N";
        linha.RESPONSAVEL_ANTERIOR_ELEGIVEL_ID = responsavelAnteriorElegivel;
        linha.RESPONSAVEL_ANTERIOR_ELEGIVEL_NOME = nomeUsuario(responsavelAnteriorElegivel);
        linha.FUNIL_ANTERIOR_ELEGIVEL = categoriaAnteriorElegivel ? (meta.categorias[categoriaAnteriorElegivel] || `Categoria ${categoriaAnteriorElegivel}`) : "";
        linha.TIPO_TROCA_RESPONSAVEL = mudouMesmoFunil ? "TROCA_MESMO_FUNIL" : (handoffEntreFunis ? "HANDOFF_ENTRE_FUNIS" : "");

        linha.RESPONSAVEL_LEAD_ORIGEM_ID = respLead;
        linha.RESPONSAVEL_LEAD_ORIGEM_NOME = nomeUsuario(respLead);
        linha.TROCA_RESPONSAVEL_LEAD_PARA_NEGOCIO = mudouLeadDeal ? "S" : "N";
        linha.CRIADO_POR_NOME = nomeUsuario(d.CREATED_BY_ID);
        linha.MODIFICADO_POR_NOME = nomeUsuario(d.MODIFY_BY_ID);
        linha.MOVEU_ESTAGIO_POR_NOME = nomeUsuario(d.MOVED_BY_ID);

        linha.QTD_MOVIMENTOS_ESTAGIO = hist.length;
        linha.PRIMEIRO_ESTAGIO_HISTORICO = hist[0]?.STAGE_ID || "";
        linha.PRIMEIRO_MOVIMENTO_ESTAGIO_EM = hist[0]?.CREATED_TIME || "";
        linha.ULTIMO_ESTAGIO_HISTORICO = hist.length ? hist[hist.length - 1].STAGE_ID : "";
        linha.ULTIMO_MOVIMENTO_ESTAGIO_EM = hist.length ? hist[hist.length - 1].CREATED_TIME : "";

        // v4.1: o CSV principal passa a carregar uma representação compacta e também
        // JSON do histórico completo do negócio. Assim um único CSV consegue alimentar
        // a reconstrução evento-a-evento sem depender obrigatoriamente do segundo arquivo.
        // v4.2: cada evento histórico resolve funil e estágio usando o CATEGORY_ID
        // DO PRÓPRIO EVENTO. Um deal pode ter mudado de pipeline ao longo da vida e,
        // nesse caso, usar a categoria atual produziria rótulos históricos incorretos.
        const histEnriquecido = hist.map((h) => {
          const histCat = String(h.CATEGORY_ID ?? cat);
          const stageId = String(h.STAGE_ID || "");
          const stageLabel = (meta.estagios?.[histCat]?.[stageId]?.label) || stageId;
          const funilLabel = meta.categorias?.[histCat] || `Categoria ${histCat}`;
          return { ...h, FUNIL_LABEL: funilLabel, STAGE_LABEL: stageLabel };
        });

        linha.HISTORICO_ESTAGIOS_SEQUENCIA = histEnriquecido
          .map((h) => `${h.FUNIL_LABEL || ""}::${h.STAGE_LABEL || h.STAGE_ID || ""}@${h.CREATED_TIME || ""}`)
          .join(" > ");
        linha.HISTORICO_ESTAGIOS_JSON = histEnriquecido.length ? JSON.stringify(histEnriquecido) : "";

        const categoriasHistoricas = histEnriquecido
          .map((h) => String(h.CATEGORY_ID ?? cat))
          .filter(Boolean);
        const funisHistoricosComprimidos = [];
        categoriasHistoricas.forEach((c) => {
          const label = meta.categorias?.[c] || `Categoria ${c}`;
          if (!funisHistoricosComprimidos.length || funisHistoricosComprimidos[funisHistoricosComprimidos.length - 1] !== label) {
            funisHistoricosComprimidos.push(label);
          }
        });
        linha.HISTORICO_FUNIS_SEQUENCIA = funisHistoricosComprimidos.join(" > ");
        linha.QTD_MUDANCAS_FUNIL_HISTORICO = Math.max(0, funisHistoricosComprimidos.length - 1);
        linha.MUDOU_DE_FUNIL_NO_HISTORICO = funisHistoricosComprimidos.length > 1 ? "S" : "N";

        let reentradasHistoricas = 0;
        const etapasVistas = new Set();
        let etapaAnterior = "";
        histEnriquecido.forEach((h) => {
          const chaveEtapa = `${h.CATEGORY_ID ?? cat}|${h.STAGE_ID || ""}`;
          if (etapasVistas.has(chaveEtapa) && chaveEtapa !== etapaAnterior) reentradasHistoricas++;
          etapasVistas.add(chaveEtapa);
          etapaAnterior = chaveEtapa;
        });
        linha.QTD_REENTRADAS_ESTAGIO_HISTORICO = reentradasHistoricas;

        linhas.push(linha);
        if (responsavelAtual) responsavelAnterior = responsavelAtual;
        categoriaAnterior = cat;
        if (d.__JORNADA_ELEGIVEL) {
          if (responsavelAtual) responsavelAnteriorElegivel = responsavelAtual;
          categoriaAnteriorElegivel = cat;
        }
      });

      // Totais observados do cliente.
      for (let i = linhas.length - deals.length; i < linhas.length; i++) {
        if (i >= 0) {
          linhas[i].QTD_TROCAS_RESPONSAVEL_CLIENTE = trocasDoCliente;
          linhas[i].QTD_TROCAS_RESPONSAVEL_MESMO_FUNIL_CLIENTE = trocasMesmoFunilDoCliente;
          linhas[i].QTD_HANDOFFS_RESPONSAVEL_CLIENTE = handoffsDoCliente;
        }
      }
    });

    linhas.sort((a, b) => {
      const porNome = (a.CLIENTE_NOME || "").localeCompare(b.CLIENTE_NOME || "", "pt-BR");
      if (porNome !== 0) return porNome;
      const porData = new Date(a.DATE_CREATE || 0) - new Date(b.DATE_CREATE || 0);
      return porData !== 0 ? porData : Number(a.ID || 0) - Number(b.ID || 0);
    });

    const camposCalculados = [
      "CLIENTE_KEY", "CLIENTE_KEY_TIPO", "CLIENTE_KEY_CONFIANCA", "CLIENTE_CONTAGEM_KEY",
      "CLIENTE_NOME", "CLIENTE_NOME_NORMALIZADO",
      "FUNIL_CLASSIFICACAO", "REGISTRO_OPERACIONAL", "JORNADA_CLIENTE_ELEGIVEL",
      "ORDEM_NA_JORNADA", "TOTAL_REGISTROS_CLIENTE",
      "ORDEM_CLIENTE_NO_FUNIL", "TOTAL_NEGOCIOS_CLIENTE_NO_FUNIL",
      "CLIENTE_REPETIDO_NO_FUNIL", "DUPLICADO_CLIENTE_NO_FUNIL", "CONTA_CLIENTE_UNICO_NO_FUNIL",
      "CONTA_COMO_EVENTO_JORNADA", "ORDEM_EVENTO_JORNADA", "TOTAL_EVENTOS_JORNADA",
      "FUNIL", "ESTAGIO_LABEL", "STAGE_SEMANTIC_NORMALIZED", "DIAS_DESDE_PRIMEIRA_ENTRADA",
      "POSSIVEL_DUPLICIDADE_CADASTRAL", "MOTIVO_DUPLICIDADE_CADASTRAL", "COMPANY_IDS_RELACIONADOS",
      "RESPONSAVEL_ATUAL_ID", "RESPONSAVEL_ATUAL_NOME",
      "RESPONSAVEL_ANTERIOR_JORNADA_ID", "RESPONSAVEL_ANTERIOR_JORNADA_NOME", "FUNIL_ANTERIOR_JORNADA",
      "TROCA_RESPONSAVEL_DESDE_REGISTRO_ANTERIOR", "TROCA_RESPONSAVEL_MESMO_FUNIL",
      "HANDOFF_RESPONSAVEL_ENTRE_FUNIS", "HANDOFF_ENVOLVE_FUNIL_INTERNO", "HANDOFF_JORNADA_CLIENTE",
      "TROCA_RESPONSAVEL_MESMO_FUNIL_JORNADA",
      "RESPONSAVEL_ANTERIOR_ELEGIVEL_ID", "RESPONSAVEL_ANTERIOR_ELEGIVEL_NOME", "FUNIL_ANTERIOR_ELEGIVEL",
      "TIPO_TROCA_RESPONSAVEL",
      "QTD_TROCAS_RESPONSAVEL_CLIENTE", "QTD_TROCAS_RESPONSAVEL_MESMO_FUNIL_CLIENTE", "QTD_HANDOFFS_RESPONSAVEL_CLIENTE",
      "RESPONSAVEL_LEAD_ORIGEM_ID", "RESPONSAVEL_LEAD_ORIGEM_NOME", "TROCA_RESPONSAVEL_LEAD_PARA_NEGOCIO",
      "CRIADO_POR_NOME", "MODIFICADO_POR_NOME", "MOVEU_ESTAGIO_POR_NOME",
      "QTD_MOVIMENTOS_ESTAGIO", "PRIMEIRO_ESTAGIO_HISTORICO", "PRIMEIRO_MOVIMENTO_ESTAGIO_EM",
      "ULTIMO_ESTAGIO_HISTORICO", "ULTIMO_MOVIMENTO_ESTAGIO_EM",
      "HISTORICO_ESTAGIOS_SEQUENCIA", "HISTORICO_ESTAGIOS_JSON",
      "HISTORICO_FUNIS_SEQUENCIA", "QTD_MUDANCAS_FUNIL_HISTORICO",
      "MUDOU_DE_FUNIL_NO_HISTORICO", "QTD_REENTRADAS_ESTAGIO_HISTORICO"
    ];

    dadosExtraidos = linhas;
    camposExtraidos = [...new Set([...camposCalculados, ...camposDeals])];

    // Dataset recomendado para o mapa de jornada: somente registros elegíveis e um
    // evento por bloco de pipeline.
    dadosJornadaNormalizada = linhas.filter((r) => r.CONTA_COMO_EVENTO_JORNADA === "S");

    // Auditoria ampla: segunda ocorrência no pipeline, cadastro possivelmente duplicado
    // ou qualquer mudança de responsável observável entre registros.
    dadosDuplicidadesJornada = linhas.filter((r) =>
      r.DUPLICADO_CLIENTE_NO_FUNIL === "S" ||
      r.POSSIVEL_DUPLICIDADE_CADASTRAL === "S" ||
      r.TROCA_RESPONSAVEL_DESDE_REGISTRO_ANTERIOR === "S" ||
      r.TROCA_RESPONSAVEL_LEAD_PARA_NEGOCIO === "S"
    );
    dadosHandoffsCliente = linhas.filter((r) => r.HANDOFF_JORNADA_CLIENTE === "S");

    const empresasPossivelmenteDuplicadas = Object.values(sinaisDuplicidade).filter((x) => x.duplicado).length;
    const completudePct = total ? Math.round((linhas.length / total) * 10000) / 100 : 100;
    const clientesElegiveis = new Set(
      linhas.filter((r) => r.JORNADA_CLIENTE_ELEGIVEL === "S").map((r) => r.CLIENTE_CONTAGEM_KEY)
    ).size;

    auditoriaJornada = {
      totalBitrix: total,
      negociosBrutos: linhas.length,
      clientesUnicos: clientesElegiveis,
      eventosNormalizados: dadosJornadaNormalizada.length,
      repeticoesMesmoPipeline,
      empresasPossivelmenteDuplicadas,
      empresasMesmoNome: gruposMesmoNome,
      trocasResponsavelJornada,
      trocasResponsavelMesmoFunil,
      handoffsResponsavelEntreFunis,
      handoffsResponsavelCliente,
      handoffsEnvolvendoFunilInterno,
      trocasResponsavelLeadDeal,
      historicoEstagios: dadosHistoricoEstagios.length,
      negociosComMudancaFunilHistorico: linhas.filter((r) => r.MUDOU_DE_FUNIL_NO_HISTORICO === "S").length,
      mudancasFunilHistorico: linhas.reduce((acc, r) => acc + (Number(r.QTD_MUDANCAS_FUNIL_HISTORICO) || 0), 0),
      reentradasEstagioHistorico: linhas.reduce((acc, r) => acc + (Number(r.QTD_REENTRADAS_ESTAGIO_HISTORICO) || 0), 0),
      negociosSemVinculo,
      registrosOperacionais,
      idsZeroIgnorados,
      duplicadosApiIgnorados: duplicadosAPI,
      completudePct
    };

    mostrarResultado();
    renderizarAuditoriaJornada();
    if (!extracaoCancelada) {
      atualizarStatus(
        `Concluído: ${linhas.length} negócios brutos; ${clientesElegiveis} clientes elegíveis; ` +
        `${dadosJornadaNormalizada.length} eventos normalizados; ${handoffsResponsavelCliente} handoffs da jornada cliente. ${idsZeroIgnorados} COMPANY_ID=0 foram tratados corretamente como "sem empresa".`
      );
    }
  } catch (e) {
    mostrarErro(
      "A extração da jornada do cliente parou por causa de um erro" + (e.definitivo ? "" : " (mesmo após tentar de novo várias vezes)") + ".\n\n" +
      "Detalhe técnico: " + e.message + "\n\n" +
      (e.definitivo
        ? "Esse erro veio do próprio Bitrix — confira se o webhook tem permissão de leitura de CRM."
        : "Se persistir, o motivo mais provável é bloqueio de CORS ou instabilidade temporária. Os registros já preservados não são descartados.")
    );
  } finally {
    document.getElementById("spinner").style.display = "none";
    document.getElementById("btnExtrair").disabled = false;
    document.getElementById("btnParar").disabled = true;
  }
}


