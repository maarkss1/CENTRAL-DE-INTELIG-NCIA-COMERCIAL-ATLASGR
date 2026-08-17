function abrirHtmlEmNovaAba(html) {
  const blob = new Blob([html], {type:"text/html;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener");
  if (!win) {
    baixarArquivo(html, `relatorio_visual_${dataHoje()}.html`, "text/html;charset=utf-8;");
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// -------------------------- Forecast semanal -------------------------------


function chaveClienteDealModelo(d) {
  if (idBitrixValido(d.COMPANY_ID)) return `COMPANY:${idBitrixString(d.COMPANY_ID)}`;
  if (idBitrixValido(d.LEAD_ID)) return `LEAD:${idBitrixString(d.LEAD_ID)}`;
  if (idBitrixValido(d.CONTACT_ID)) return `CONTACT:${idBitrixString(d.CONTACT_ID)}`;
  const n = normalizarTextoChave(d.TITLE || "");
  return n ? `NOME:${n}` : `DEAL:${d.ID}`;
}
function contarClientesUnicosModelo(rows) {
  return new Set((rows || []).map((x)=>x.CLIENTE_KEY).filter(Boolean)).size;
}
function somarModelo(rows,campo="VALOR"){return (rows||[]).reduce((a,x)=>a+(Number(x[campo])||0),0);}
function agruparPorModelo(rows,fn){const o={};(rows||[]).forEach((x)=>(o[fn(x)]||=[]).push(x));return o;}
function origemLabelModelo(id,mapa){const s=String(id||"").trim();return s?(mapa?.[s]||s):"origem não informada";}

async function construirDadosModeloForecast(webhook, meta, inicio, fim, dealsComercial) {
  const catsFin = encontrarCategoriasPorPalavras(meta, ["financeiro"], false);
  const campos = ["ID","TITLE","CATEGORY_ID","STAGE_ID","STAGE_SEMANTIC_ID","OPPORTUNITY","ASSIGNED_BY_ID","COMPANY_ID","CONTACT_ID","LEAD_ID","SOURCE_ID","DATE_CREATE","MOVED_TIME","CLOSEDATE"];
  let fin = [];
  if (catsFin.length) {
    const filtro = catsFin.length===1 ? {"CATEGORY_ID":catsFin[0]} : {"@CATEGORY_ID":catsFin};
    fin = (await listarCompletoRelatorio(webhook,"crm.deal.list",campos,filtro,{ID:"ASC"},"Forecast visual: Financeiro...")).dados;
  }
  const todos=[...(dealsComercial||[]),...fin];
  const ids=[...new Set(todos.map((d)=>d.COMPANY_ID).filter(idBitrixValido).map(idBitrixString))];
  const [empresas,origens]=await Promise.all([
    buscarEntidadesPorIds(webhook,"crm.company.list",ids,["ID","TITLE"]),
    mapaOrigensRelatorio(webhook)
  ]);
  const ref=fim||formatarDataISO(new Date());
  const mapRow=(d)=>{
    const cat=String(d.CATEGORY_ID??""), sm=meta.estagios?.[cat]?.[String(d.STAGE_ID)]||{};
    const data=parteDataISO(d.MOVED_TIME)||parteDataISO(d.DATE_CREATE);
    return {
      DEAL_ID:d.ID,CLIENTE_KEY:chaveClienteDealModelo(d),
      CLIENTE:idBitrixValido(d.COMPANY_ID)?(empresas[idBitrixString(d.COMPANY_ID)]?.TITLE||d.TITLE||""):(d.TITLE||""),
      ESTAGIO:sm.label||d.STAGE_ID||"",SEMANTICA:semanticaDeal(d,sm),
      RESPONSAVEL:nomeUsuario(d.ASSIGNED_BY_ID)||(d.ASSIGNED_BY_ID?`ID ${d.ASSIGNED_BY_ID}`:"Sem responsável"),
      ORIGEM:origemLabelModelo(d.SOURCE_ID,origens),VALOR:Number(d.OPPORTUNITY)||0,
      DATA_MOVIMENTO:data,DATA_MOVIMENTO_BR:formatarDataBR(data),MES_CHAVE:chaveMesISO(data),MES_LABEL:mesAnoBR(data),
      DIAS_NO_ESTAGIO:diferencaDiasAteReferencia(data,ref)
    };
  };
  const comercial=(dealsComercial||[]).map(mapRow), financeiro=fin.map(mapRow);
  const fechados=financeiro.filter((x)=>{
    const n=normalizarTextoChave(x.ESTAGIO);
    return (n.includes("contrato assinado")||(x.SEMANTICA==="success"&&n.includes("assin"))) &&
      dataDentroFaixa(x.DATA_MOVIMENTO,inicio,fim);
  });
  // v12 — "Pendentes Assinatura" e "Pipeline Aberto" no modelo visual mostram só
  // negócios parados na etapa atual há no máximo 60 dias, e nunca estágios "Piloto".
  const dentroJanela60d=(x)=>x.DIAS_NO_ESTAGIO!==""&&x.DIAS_NO_ESTAGIO<=60;
  const pendentes=financeiro.filter((x)=>{
    const n=normalizarTextoChave(x.ESTAGIO);
    return x.SEMANTICA==="process" && (n.includes("aguardando assinatura")||n.includes("analise de documentos")||n.includes("assinatura de contrato")) && !n.includes("contrato assinado")
      && !ehEstagioPiloto(null,x.ESTAGIO) && dentroJanela60d(x);
  });
  const pipeline=comercial.filter((x)=>x.SEMANTICA==="process"&&!ehEstagioPiloto(null,x.ESTAGIO)&&dentroJanela60d(x));
  const porVend=(rows)=>{
    const m={};rows.forEach((x)=>{const k=x.RESPONSAVEL;if(!m[k])m[k]={RESPONSAVEL:k,VALOR:0,NEGOCIOS:0,CLIENTES:new Set()};m[k].VALOR+=x.VALOR;m[k].NEGOCIOS++;m[k].CLIENTES.add(x.CLIENTE_KEY)});
    return Object.values(m).map((x)=>({RESPONSAVEL:x.RESPONSAVEL,VALOR:x.VALOR,NEGOCIOS:x.NEGOCIOS,CLIENTES:x.CLIENTES.size})).sort((a,b)=>b.VALOR-a.VALOR);
  };
  return {
    periodo_inicio:inicio,periodo_fim:fim,referencia:ref,fechados,pendentes,pipeline,
    vendedores_fechados:porVend(fechados),vendedores_pipeline:porVend(pipeline),
    resumo:{
      FECHADOS_VALOR:somarModelo(fechados),FECHADOS_NEGOCIOS:fechados.length,FECHADOS_CLIENTES:contarClientesUnicosModelo(fechados),
      PENDENTES_VALOR:somarModelo(pendentes),PENDENTES_NEGOCIOS:pendentes.length,PENDENTES_CLIENTES:contarClientesUnicosModelo(pendentes),
      PIPELINE_VALOR:somarModelo(pipeline),PIPELINE_NEGOCIOS:pipeline.length,PIPELINE_CLIENTES:contarClientesUnicosModelo(pipeline)
    }
  };
}

function renderBarModelo(rows) {
  if(!rows?.length)return `<p class="small-note">Sem dados no período.</p>`;
  const max=Math.max(1,...rows.map((x)=>x.VALOR||0)),cores=["#2a78d6","#eb6834","#1baf7a","#eda100","#e87ba4","#7254c7"];
  return `<div class="mini-chart"><div class="mini-chart-title">Visão geral por vendedor(a)</div>`+rows.map((x,i)=>`<div class="barrow"><div class="barlabel">${escapeHtmlRelatorio(x.RESPONSAVEL)}</div><div class="bartrack"><div class="barfill" style="width:${Math.max(2,(x.VALOR/max)*100).toFixed(1)}%;background:${cores[i%cores.length]}"></div></div><div class="barvalue">${moedaRelatorio(x.VALOR)}</div></div>`).join("")+`</div>`;
}
function cardForecastModelo(x,tipo) {
  const badge=tipo==="fechado"?"s-won":tipo==="pendente"?"s-pend":"s-2";
  let txt=`Nesta etapa desde ${x.DATA_MOVIMENTO_BR||"—"}`;
  if(tipo==="fechado")txt=`Assinado em ${x.DATA_MOVIMENTO_BR||"—"}`;
  if(tipo==="pendente")txt=`Aguardando assinatura ${x.DIAS_NO_ESTAGIO===0?"hoje":`há ${x.DIAS_NO_ESTAGIO} dia(s)`} (desde ${x.DATA_MOVIMENTO_BR||"—"})`;
  return `<div class="ccard"><div class="ccard-top"><span class="stage-badge ${badge}">${escapeHtmlRelatorio(x.ESTAGIO)}</span><span class="ccard-value">${moedaRelatorio(x.VALOR)}</span></div><div class="ccard-name">${escapeHtmlRelatorio(x.CLIENTE)}</div><div class="ccard-meta"><span>👤 ${escapeHtmlRelatorio(x.RESPONSAVEL)}</span><span>🎯 ${escapeHtmlRelatorio(x.ORIGEM)}</span></div><div class="ccard-date">${txt}</div></div>`;
}
function mesesForecastModelo(rows,tipo,porEtapa=false) {
  const grupos=agruparPorModelo(rows,(x)=>x.MES_CHAVE||"sem-data"),keys=Object.keys(grupos).sort().reverse();
  return keys.map((k)=>{
    const a=grupos[k],label=a[0]?.MES_LABEL||"Sem data",stats=`${a.length} negócio(s) · ${contarClientesUnicosModelo(a)} cliente(s) · ${moedaRelatorio(somarModelo(a))}`;
    let body="";
    if(porEtapa){
      const st=agruparPorModelo(a,(x)=>x.ESTAGIO||"Sem etapa");
      body=`<div class="stage-list">`+Object.entries(st).map(([nome,r])=>`<details class="vcard stage-card"><summary><span class="stage-badge s-2">${escapeHtmlRelatorio(nome)}</span><span class="vcard-stats">${r.length} negócio(s) · ${contarClientesUnicosModelo(r)} cliente(s) · ${moedaRelatorio(somarModelo(r))}</span><span class="vcard-chevron">▾</span></summary><div class="vcard-body"><div class="cgrid">${r.map((x)=>cardForecastModelo(x,tipo)).join("")}</div></div></details>`).join("")+`</div>`;
    } else body=`<div class="cgrid">${a.map((x)=>cardForecastModelo(x,tipo)).join("")}</div>`;
    return `<details class="vcard month-card"><summary><span class="vcard-name">🗓️ ${escapeHtmlRelatorio(label)}</span><span class="vcard-stats">${stats}</span><span class="vcard-chevron">▾</span></summary><div class="vcard-body">${body}</div></details>`;
  }).join("")||`<p class="small-note">Nenhum registro encontrado.</p>`;
}
function gerarHTMLForecastModelo(resultado,tipo="semanal") {
  const r=resultado?.modelo_visual;if(!r)return "";
  const periodo=tipo==="mensal"?mesAnoBR(r.periodo_fim):`${formatarDataBR(r.periodo_inicio)} a ${formatarDataBR(r.periodo_fim)}`;
  const metaMensal=tipo==="semanal"?(Number(resultado?.meta?.meta_mensal)||0):(Number(resultado?.meta_visual)||0);
  const stats=(n,c)=>`${n} negócio(s) · ${c} cliente(s)`;
  // v17 — meta mensal como KPI simples ao lado do Pipeline Aberto: só o
  // número da meta, sem "entregue" e sem seta.
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Forecast Comercial — ${escapeHtmlRelatorio(periodo)} · Atlas</title><style>${MODELO_EXECUTIVO_CSS}</style></head><body>`+
  `<div class="letterhead"><div class="letterhead-inner"><div class="letterhead-brand">${MODELO_EXECUTIVO_LOGO}<div class="letterhead-divider"></div><div class="letterhead-tagline">Gerenciamento de Risco em Processos Logísticos</div></div><div class="letterhead-ref"><strong>Relatório Comercial</strong><br>Extraído do Bitrix24 em ${formatarDataBR(formatarDataISO(new Date()))}</div></div></div>`+
  `<header class="hero"><div class="hero-inner"><p class="eyebrow">Relatório Comercial · Bitrix24</p><h1>Forecast Comercial — ${escapeHtmlRelatorio(periodo)}</h1><p class="subtitle">Fechados, pendentes de assinatura e pipeline aberto, preenchidos automaticamente pelo extrator.</p></div></header>`+
  `<div class="wrap"><div class="overview-panel" id="visao-geral"><h2 class="section" style="margin-top:0;">Visão geral</h2><div class="kpis">`+
  `<div class="kpi good kpi-clickable" onclick="abrirDetalhe('detail-fechados')"><div class="label">Fechados →</div><div class="value">${moedaRelatorio(r.resumo.FECHADOS_VALOR)}</div><div class="small">${stats(r.resumo.FECHADOS_NEGOCIOS,r.resumo.FECHADOS_CLIENTES)}</div></div>`+
  `<div class="kpi warn kpi-clickable" onclick="abrirDetalhe('detail-pendentes')"><div class="label">Pendentes Assinatura →</div><div class="value">${moedaRelatorio(r.resumo.PENDENTES_VALOR)}</div><div class="small">${stats(r.resumo.PENDENTES_NEGOCIOS,r.resumo.PENDENTES_CLIENTES)}</div></div>`+
  `<div class="kpi kpi-clickable" onclick="abrirDetalhe('detail-forecast')"><div class="label">Pipeline Aberto →</div><div class="value">${moedaRelatorio(r.resumo.PIPELINE_VALOR)}</div><div class="small">${stats(r.resumo.PIPELINE_NEGOCIOS,r.resumo.PIPELINE_CLIENTES)}</div></div>`+
  `<div class="kpi"><div class="label">Meta Mensal</div><div class="value ${metaMensal?"":"meta-missing"}">${metaMensal?moedaRelatorio(metaMensal):"A definir"}</div></div></div></div>`+
  `<div class="note"><b>Negócios ≠ clientes</b>O relatório mostra as duas contagens separadamente. Assim, se existirem 31 negócios de 20 clientes, você verá 31 negócios e 20 clientes.</div>`+
  `<h2 class="section">Fechados, Pendentes e Pipeline Aberto</h2><p class="section-sub">Mesma lógica visual do modelo fornecido, agora abastecida diretamente pelo Bitrix. Pendentes Assinatura e Pipeline Aberto mostram só negócios parados na etapa atual há até 60 dias, sem estágios "Piloto".</p><div class="top3grid">`+
  `<details class="vcard section-card" id="detail-fechados"><summary><span class="vcard-name">✅ Fechados</span><span class="vcard-stats">${stats(r.resumo.FECHADOS_NEGOCIOS,r.resumo.FECHADOS_CLIENTES)} · ${moedaRelatorio(r.resumo.FECHADOS_VALOR)}</span><span class="vcard-chevron">▾</span></summary><div class="vcard-body">${renderBarModelo(r.vendedores_fechados)}<div class="cgrid">${r.fechados.map((x)=>cardForecastModelo(x,"fechado")).join("")}</div></div></details>`+
  `<details class="vcard section-card" id="detail-pendentes"><summary><span class="vcard-name">⏳ Pendentes Assinatura</span><span class="vcard-stats">${stats(r.resumo.PENDENTES_NEGOCIOS,r.resumo.PENDENTES_CLIENTES)} · ${moedaRelatorio(r.resumo.PENDENTES_VALOR)}</span><span class="vcard-chevron">▾</span></summary><div class="vcard-body"><div class="month-list">${mesesForecastModelo(r.pendentes,"pendente",false)}</div></div></details>`+
  `<details class="vcard section-card" id="detail-forecast"><summary><span class="vcard-name">📈 Pipeline Aberto — Forecast</span><span class="vcard-stats">${stats(r.resumo.PIPELINE_NEGOCIOS,r.resumo.PIPELINE_CLIENTES)} · ${moedaRelatorio(r.resumo.PIPELINE_VALOR)}</span><span class="vcard-chevron">▾</span></summary><div class="vcard-body">${renderBarModelo(r.vendedores_pipeline)}<div class="month-list">${mesesForecastModelo(r.pipeline,"pipeline",true)}</div></div></details>`+
  `</div><a class="back-to-overview" href="#visao-geral">↑ Voltar à Visão geral</a></div><footer><div class="footer-brand">${MODELO_EXECUTIVO_LOGO}<span>Atlas</span></div>Atlas · Forecast Comercial</footer>`+
  `<script>function abrirDetalhe(id){var e=document.getElementById(id);if(!e)return;e.open=true;var n=e.querySelectorAll('details');for(var i=0;i<n.length;i++)n[i].open=true;e.scrollIntoView({behavior:'smooth',block:'start'});}<\/script></body></html>`;
}
function abrirRelatorioVisualForecast(){const h=gerarHTMLForecastModelo(resultadoForecastSemanal,"semanal");if(h)abrirHtmlEmNovaAba(h);}
function baixarHTMLForecastModelo(){const h=gerarHTMLForecastModelo(resultadoForecastSemanal,"semanal");if(h)baixarArquivo(h,`forecast_modelo_atlas_${dataHoje()}.html`,"text/html;charset=utf-8;");}

async function extrairForecastSemanal(webhook) {
  document.getElementById("spinner").style.display = "inline-block";
  document.getElementById("btnExtrair").disabled = true;
  document.getElementById("btnParar").disabled = false;
  extracaoCancelada = false;
  esconderErro();
  resultadoForecastSemanal = {};

  try {
    const inicio = document.getElementById("dataInicio").value;
    const fim = document.getElementById("dataFim").value;
    if (!inicio || !fim) throw new Error("Informe a semana em De/Até.");

    atualizarStatus("Forecast: descobrindo pipeline, estágios e responsáveis...");
    const [meta] = await Promise.all([
      buscarMetadadosFunisEEstagios(webhook),
      buscarUsuariosJornada(webhook)
    ]);

    const palavraForecast = normalizarTextoChave(document.getElementById("palavraFunilForecast").value || "Comercial");
    let categorias = encontrarCategoriasPorPalavras(meta, [palavraForecast], true);
    if (!categorias.length && meta.categorias?.["0"]) categorias = ["0"];
    if (!categorias.length) throw new Error("Não encontrei o pipeline Comercial. Ajuste o nome no campo de configuração do Forecast.");

    const categoria = categorias[0];
    const nomeCategoria = nomeFunilSemCodigo(meta.categorias[categoria] || `Categoria ${categoria}`);

    const campos = [
      "ID", "TITLE", "CATEGORY_ID", "STAGE_ID", "STAGE_SEMANTIC_ID", "PROBABILITY",
      "OPPORTUNITY", "CURRENCY_ID", "ASSIGNED_BY_ID", "COMPANY_ID", "CONTACT_ID", "LEAD_ID",
      "DATE_CREATE", "DATE_MODIFY", "MOVED_TIME", "CLOSEDATE", "CLOSED",
      "SOURCE_ID", "LAST_ACTIVITY_TIME", "LAST_ACTIVITY_BY"
    ];

    const lista = await listarCompletoRelatorio(
      webhook,
      "crm.deal.list",
      campos,
      { "CATEGORY_ID": categoria },
      { ID: "ASC" },
      "Forecast: buscando negócios do Comercial..."
    );
    const deals = lista.dados;

    const idsEmpresa = [...new Set(deals.map((d) => d.COMPANY_ID).filter(idBitrixValido).map(idBitrixString))];
    const empresas = await buscarEntidadesPorIds(
      webhook,
      "crm.company.list",
      idsEmpresa,
      ["ID", "TITLE"]
    );

    const linhas = [];
    const vendedores = {};
    let fechado = 0;
    let perdido = 0;
    let commit = 0;
    let bestCase = 0;
    let pipeline = 0;
    let ponderadoAberto = 0;
    let pipelineAbertoSemana = 0;
    let semDataQtd = 0;
    let semDataValor = 0;
    let atrasadoQtd = 0;
    let atrasadoValor = 0;
    let abertosSemanaQtd = 0;

    for (const d of deals) {
      const stageMeta = meta.estagios?.[String(categoria)]?.[String(d.STAGE_ID)] || {};
      const stageLabel = stageMeta.label || d.STAGE_ID || "";
      const semantica = semanticaDeal(d, stageMeta);
      const probInformada = Number(d.PROBABILITY);
      const usaProbBitrix = Number.isFinite(probInformada) && probInformada > 0 && probInformada <= 100;
      const prob = usaProbBitrix ? probInformada : probabilidadeFallbackForecast(stageLabel, semantica);
      const bucket = classificarBucketForecast(prob, semantica);
      const valor = Number(d.OPPORTUNITY) || 0;
      const closeDate = parteDataISO(d.CLOSEDATE);
      const dentroSemana = dataDentroFaixa(d.CLOSEDATE, inicio, fim);
      const nomeEmpresa = idBitrixValido(d.COMPANY_ID)
        ? (empresas[idBitrixString(d.COMPANY_ID)]?.TITLE || "")
        : "";
      const vendedorId = idBitrixString(d.ASSIGNED_BY_ID);
      const vendedorNome = nomeUsuario(vendedorId) || (vendedorId ? `ID ${vendedorId}` : "Sem responsável");

      let situacaoSemana = "Fora da semana";
      let incluiForecast = "N";
      let ponderado = 0;

      if (semantica === "success" && dentroSemana) {
        situacaoSemana = "Ganho na semana";
        fechado += valor;
      } else if (semantica === "failure" && dentroSemana) {
        situacaoSemana = "Perdido na semana";
        perdido += valor;
      } else if (semantica === "process" && !ehEstagioPiloto(d.STAGE_ID, stageLabel)) {
        if (!closeDate) {
          situacaoSemana = "Sem CLOSEDATE";
          semDataQtd++;
          semDataValor += valor;
        } else if (closeDate < inicio) {
          situacaoSemana = "CLOSEDATE vencida";
          atrasadoQtd++;
          atrasadoValor += valor;
        } else if (dentroSemana) {
          situacaoSemana = "Aberto previsto na semana";
          incluiForecast = "S";
          abertosSemanaQtd++;
          pipelineAbertoSemana += valor;
          ponderado = valor * prob / 100;
          ponderadoAberto += ponderado;
          if (bucket === "Commit") commit += valor;
          else if (bucket === "Best Case") bestCase += valor;
          else pipeline += valor;
        }
      }

      const linha = {
        DEAL_ID: d.ID,
        CLIENTE: nomeEmpresa || d.TITLE || "",
        TITULO_NEGOCIO: d.TITLE || "",
        PIPELINE: nomeCategoria,
        ESTAGIO: stageLabel,
        SEMANTICA: semantica,
        RESPONSAVEL_ID: vendedorId,
        RESPONSAVEL: vendedorNome,
        CLOSEDATE: closeDate,
        OPPORTUNITY: valor,
        PROBABILIDADE_PCT: prob,
        FONTE_PROBABILIDADE: usaProbBitrix ? "PROBABILITY Bitrix" : "Fallback por estágio",
        BUCKET_FORECAST: bucket,
        SITUACAO_SEMANA: situacaoSemana,
        INCLUI_FORECAST_SEMANA: incluiForecast,
        FORECAST_PONDERADO: ponderado,
        LAST_ACTIVITY_TIME: d.LAST_ACTIVITY_TIME || "",
        MOVED_TIME: d.MOVED_TIME || ""
      };
      linhas.push(linha);

      if (!vendedores[vendedorId || "0"]) {
        vendedores[vendedorId || "0"] = {
          RESPONSAVEL_ID: vendedorId,
          RESPONSAVEL: vendedorNome,
          NEGOCIOS_PREVISTOS: 0,
          PIPELINE_ABERTO_SEMANA: 0,
          COMMIT: 0,
          BEST_CASE: 0,
          PIPELINE: 0,
          FORECAST_PONDERADO_ABERTO: 0,
          FECHADO_SEMANA: 0,
          FORECAST_TOTAL: 0
        };
      }
      const v = vendedores[vendedorId || "0"];
      if (situacaoSemana === "Aberto previsto na semana") {
        v.NEGOCIOS_PREVISTOS++;
        v.PIPELINE_ABERTO_SEMANA += valor;
        v.FORECAST_PONDERADO_ABERTO += ponderado;
        if (bucket === "Commit") v.COMMIT += valor;
        else if (bucket === "Best Case") v.BEST_CASE += valor;
        else v.PIPELINE += valor;
      }
      if (situacaoSemana === "Ganho na semana") v.FECHADO_SEMANA += valor;
    }

    const forecastTotal = fechado + ponderadoAberto;

    // v16 — meta mensal sempre olha o mês-calendário ATUAL (hoje), não o mês do
    // período selecionado no passo 3: o card de meta mensal deve refletir "como
    // estamos indo este mês", mesmo que o usuário esteja olhando o forecast de
    // outra semana. "Fechado no mês" soma até hoje (nunca no futuro).
    const hojeISO = formatarDataISO(new Date());
    const campoMetaMensal = document.getElementById("metaForecastMensal");
    let metaMensal = Number(campoMetaMensal?.value) || 0;
    if (!metaMensal) {
      metaMensal = metaMensalPadrao(hojeISO);
      if (campoMetaMensal && metaMensal) campoMetaMensal.value = metaMensal;
    }
    const [anoMes, mesMes] = hojeISO.split("-").map(Number);
    const mesInicio = `${anoMes}-${String(mesMes).padStart(2, "0")}-01`;
    const ultimoDiaMesCalendario = formatarDataISO(new Date(anoMes, mesMes, 0));
    const mesFim = hojeISO < ultimoDiaMesCalendario ? hojeISO : ultimoDiaMesCalendario;

    // v12 — meta semanal explícita = meta mensal ÷ nº de semanas do mês (7 em 7 dias,
    // arredondado para cima). Só é usada quando o campo "Meta semanal" está vazio —
    // se o usuário informar um valor manual, esse valor manda.
    const diasNoMes = new Date(anoMes, mesMes, 0).getDate();
    const semanasNoMes = Math.ceil(diasNoMes / 7);
    const metaSemanalDerivada = metaMensal > 0 ? Math.round((metaMensal / semanasNoMes) * 100) / 100 : 0;
    const campoMetaSemanal = document.getElementById("metaForecastSemanal");
    let metaSemanal = Number(campoMetaSemanal?.value) || 0;
    let metaSemanalOrigem = "manual";
    if (!metaSemanal && metaSemanalDerivada) {
      metaSemanal = metaSemanalDerivada;
      metaSemanalOrigem = "derivada";
      if (campoMetaSemanal) campoMetaSemanal.value = metaSemanal;
    }
    const gap = metaSemanal > 0 ? Math.max(0, metaSemanal - forecastTotal) : 0;

    // v13 — além do fechado no mês, soma o pipeline aberto ponderado do mês
    // inteiro (mesmo critério do semanal: sem estágios "Piloto") para dar uma
    // projeção mensal de verdade, não só o que já foi entregue.
    let fechadoMes = 0;
    let pipelinePonderadoMes = 0;
    for (const d of deals) {
      const stageMeta = meta.estagios?.[String(categoria)]?.[String(d.STAGE_ID)] || {};
      const stageLabelMes = stageMeta.label || d.STAGE_ID || "";
      const semanticaMes = semanticaDeal(d, stageMeta);
      if (semanticaMes === "success" && dataDentroFaixa(d.CLOSEDATE, mesInicio, mesFim)) {
        fechadoMes += Number(d.OPPORTUNITY) || 0;
      } else if (semanticaMes === "process" && !ehEstagioPiloto(d.STAGE_ID, stageLabelMes) && dataDentroFaixa(d.CLOSEDATE, mesInicio, mesFim)) {
        const probInformadaMes = Number(d.PROBABILITY);
        const probMes = Number.isFinite(probInformadaMes) && probInformadaMes > 0 && probInformadaMes <= 100
          ? probInformadaMes
          : probabilidadeFallbackForecast(stageLabelMes, semanticaMes);
        pipelinePonderadoMes += (Number(d.OPPORTUNITY) || 0) * probMes / 100;
      }
    }
    const forecastMesTotal = fechadoMes + pipelinePonderadoMes;
    const gapMensal = metaMensal > 0 ? Math.max(0, metaMensal - fechadoMes) : 0;

    atualizarStatus("Forecast: montando modelo executivo Atlas...");
    const modeloVisualForecast = await construirDadosModeloForecast(webhook, meta, inicio, fim, deals);

    const vendedoresLista = Object.values(vendedores)
      .map((v) => ({ ...v, FORECAST_TOTAL: v.FECHADO_SEMANA + v.FORECAST_PONDERADO_ABERTO }))
      .filter((v) => v.NEGOCIOS_PREVISTOS || v.FECHADO_SEMANA)
      .sort((a, b) => b.FORECAST_TOTAL - a.FORECAST_TOTAL);

    resultadoForecastSemanal = {
      meta: {
        inicio, fim, pipeline_id: categoria, pipeline: nomeCategoria,
        meta_semanal: metaSemanal, meta_mensal: metaMensal, mes_inicio: mesInicio, mes_fim: mesFim,
        semanas_no_mes: semanasNoMes, meta_semanal_derivada: metaSemanalDerivada, meta_semanal_origem: metaSemanalOrigem,
        total_bitrix_pipeline: lista.total,
        registros_extraidos: deals.length,
        duplicados_api_ignorados: lista.duplicados
      },
      resumo: {
        FECHADO_SEMANA: fechado,
        PERDIDO_SEMANA: perdido,
        COMMIT: commit,
        BEST_CASE: bestCase,
        PIPELINE: pipeline,
        PIPELINE_ABERTO_SEMANA: pipelineAbertoSemana,
        FORECAST_PONDERADO_ABERTO: ponderadoAberto,
        FORECAST_TOTAL: forecastTotal,
        META_SEMANAL: metaSemanal,
        GAP_META: gap,
        ATINGIMENTO_SEMANAL_PCT: metaSemanal > 0 ? Math.round((fechado / metaSemanal) * 1000) / 10 : null,
        FECHADO_MES: fechadoMes,
        PIPELINE_PONDERADO_MES: pipelinePonderadoMes,
        FORECAST_MES_TOTAL: forecastMesTotal,
        META_MENSAL: metaMensal,
        GAP_MENSAL: gapMensal,
        ATINGIMENTO_MENSAL_PCT: metaMensal > 0 ? Math.round((fechadoMes / metaMensal) * 1000) / 10 : null,
        ABERTOS_PREVISTOS_SEMANA: abertosSemanaQtd,
        SEM_CLOSEDATE_QTD: semDataQtd,
        SEM_CLOSEDATE_VALOR: semDataValor,
        CLOSEDATE_VENCIDA_QTD: atrasadoQtd,
        CLOSEDATE_VENCIDA_VALOR: atrasadoValor
      },
      vendedores: vendedoresLista,
      negocios: linhas.filter((r) => r.SITUACAO_SEMANA !== "Fora da semana"),
      higiene: linhas.filter((r) => r.SITUACAO_SEMANA === "Sem CLOSEDATE" || r.SITUACAO_SEMANA === "CLOSEDATE vencida"),
      modelo_visual: modeloVisualForecast
    };

    renderizarForecastSemanal();
    dadosExtraidos = resultadoForecastSemanal.negocios;
    camposExtraidos = camposDeDados(dadosExtraidos);
    atualizarStatus(`Forecast concluído: ${abertosSemanaQtd} negócio(s) aberto(s) previstos para a semana; forecast total ${moedaRelatorio(forecastTotal)}.`);
  } catch (e) {
    mostrarErro("Não foi possível montar o Forecast semanal.\n\nDetalhe técnico: " + e.message);
  } finally {
    document.getElementById("spinner").style.display = "none";
    document.getElementById("btnExtrair").disabled = false;
    document.getElementById("btnParar").disabled = true;
  }
}

function renderizarForecastSemanal() {
  const r = resultadoForecastSemanal;
  if (!r?.resumo) return;
  document.getElementById("bloco-forecast-semanal").classList.remove("oculto");
  document.getElementById("forecastPeriodoTexto").innerHTML =
    `<strong>${escapeHtmlRelatorio(r.meta.pipeline)}</strong> • ${escapeHtmlRelatorio(formatarDataBR(r.meta.inicio))} até ${escapeHtmlRelatorio(formatarDataBR(r.meta.fim))}.` +
    (r.meta.meta_mensal ? ` Meta mensal (${escapeHtmlRelatorio(mesAnoBR(r.meta.mes_inicio))}): <strong>${moedaRelatorio(r.meta.meta_mensal)}</strong>.` : " Meta mensal não informada.");

  const kpis = [
    ["Fechado na semana", moedaRelatorio(r.resumo.FECHADO_SEMANA)],
    ["Fechado no mês", moedaRelatorio(r.resumo.FECHADO_MES)],
    ["Forecast total (semana)", moedaRelatorio(r.resumo.FORECAST_TOTAL)],
    ["Forecast total (mês)", moedaRelatorio(r.resumo.FORECAST_MES_TOTAL)],
    ["Commit", moedaRelatorio(r.resumo.COMMIT)],
    ["Best Case", moedaRelatorio(r.resumo.BEST_CASE)],
    ["Pipeline", moedaRelatorio(r.resumo.PIPELINE)],
    // v17 — meta mensal ao lado do Pipeline, só o número da meta.
    ["Meta mensal", r.meta.meta_mensal ? moedaRelatorio(r.meta.meta_mensal) : "não informada"],
    ["Abertos previstos", r.resumo.ABERTOS_PREVISTOS_SEMANA],
    ["Sem CLOSEDATE", r.resumo.SEM_CLOSEDATE_QTD]
  ];
  document.getElementById("forecastKpis").innerHTML = kpis.map(([rotulo, valor]) =>
    `<div class="relatorio-especial-kpi"><span class="valor">${escapeHtmlRelatorio(valor)}</span><span class="rotulo">${escapeHtmlRelatorio(rotulo)}</span></div>`
  ).join("");

  const metaBarrasEl = document.getElementById("forecastMetasBarras");
  if (metaBarrasEl) metaBarrasEl.innerHTML = "";

  document.getElementById("forecastVendedoresTabela").innerHTML = tabelaRelatorio([
    { label: "Responsável", valor: "RESPONSAVEL" },
    { label: "Negócios", valor: "NEGOCIOS_PREVISTOS" },
    { label: "Fechado", valor: (x) => moedaRelatorio(x.FECHADO_SEMANA), html: true },
    { label: "Commit", valor: (x) => moedaRelatorio(x.COMMIT), html: true },
    { label: "Best Case", valor: (x) => moedaRelatorio(x.BEST_CASE), html: true },
    { label: "Pipeline", valor: (x) => moedaRelatorio(x.PIPELINE), html: true },
    { label: "Ponderado", valor: (x) => moedaRelatorio(x.FORECAST_PONDERADO_ABERTO), html: true },
    { label: "Forecast total", valor: (x) => `<strong>${moedaRelatorio(x.FORECAST_TOTAL)}</strong>`, html: true }
  ], r.vendedores);

  document.getElementById("forecastNegociosTabela").innerHTML = tabelaRelatorio([
    { label: "Cliente", valor: "CLIENTE" },
    { label: "Negócio", valor: "DEAL_ID" },
    { label: "Estágio", valor: "ESTAGIO" },
    { label: "Responsável", valor: "RESPONSAVEL" },
    { label: "CLOSEDATE", valor: (x) => formatarDataBR(x.CLOSEDATE) },
    { label: "Valor", valor: (x) => moedaRelatorio(x.OPPORTUNITY), html: true },
    { label: "Prob.", valor: (x) => `${x.PROBABILIDADE_PCT}%` },
    { label: "Bucket", valor: (x) => `<span class="badge-relatorio">${escapeHtmlRelatorio(x.BUCKET_FORECAST)}</span>`, html: true },
    { label: "Situação", valor: "SITUACAO_SEMANA" },
    { label: "Ponderado", valor: (x) => moedaRelatorio(x.FORECAST_PONDERADO), html: true }
  ], r.negocios);

  document.getElementById("forecastHigieneTabela").innerHTML = tabelaRelatorio([
    { label: "Cliente", valor: "CLIENTE" },
    { label: "Negócio", valor: "DEAL_ID" },
    { label: "Estágio", valor: "ESTAGIO" },
    { label: "Responsável", valor: "RESPONSAVEL" },
    { label: "CLOSEDATE", valor: (x) => formatarDataBR(x.CLOSEDATE) },
    { label: "Valor", valor: (x) => moedaRelatorio(x.OPPORTUNITY), html: true },
    { label: "Problema", valor: (x) => `<span class="badge-relatorio alerta">${escapeHtmlRelatorio(x.SITUACAO_SEMANA)}</span>`, html: true }
  ], r.higiene);
}

// ---------------------------- Diário SDR -----------------------------------

const TIPOS_ATIVIDADE_BITRIX = {
  "1": "Reunião",
  "2": "Ligação",
  "3": "Tarefa",
  "4": "E-mail",
  "5": "Ação",
  "6": "Ação do usuário"
};

