async function mapaOrigensRelatorio(webhook){
  const a=await carregarListaPaginada(webhook,"crm.status.list",{"filter[ENTITY_ID]":"SOURCE","order[SORT]":"ASC"});
  const m={};a.forEach((x)=>m[String(x.STATUS_ID)]=x.NAME||x.STATUS_ID);return m;
}

async function baseDealsCatalogo(webhook,somenteComercial=false){
  const [meta]=await Promise.all([buscarMetadadosFunisEEstagios(webhook),buscarUsuariosJornada(webhook)]);
  let cats=[];
  if(somenteComercial){cats=encontrarCategoriasPorPalavras(meta,["comercial"],true);if(!cats.length&&meta.categorias?.["0"])cats=["0"];}
  const filtro={};if(somenteComercial&&cats.length===1)filtro.CATEGORY_ID=cats[0];else if(somenteComercial&&cats.length>1)filtro["@CATEGORY_ID"]=cats;
  const busca=await listarCompletoRelatorio(webhook,"crm.deal.list",[
    "ID","TITLE","CATEGORY_ID","STAGE_ID","STAGE_SEMANTIC_ID","PROBABILITY","OPPORTUNITY","CURRENCY_ID",
    "ASSIGNED_BY_ID","CREATED_BY_ID","MODIFY_BY_ID","MOVED_BY_ID","COMPANY_ID","CONTACT_ID","LEAD_ID",
    "SOURCE_ID","UTM_SOURCE","UTM_MEDIUM","UTM_CAMPAIGN","UTM_CONTENT","UTM_TERM","DATE_CREATE","DATE_MODIFY",
    "MOVED_TIME","CLOSEDATE","BEGINDATE","UF_CRM_1770928318695","CLOSED","LAST_ACTIVITY_TIME","LAST_ACTIVITY_BY"
  ],filtro,{ID:"ASC"},"Relatório: buscando negócios...");
  const ids=[...new Set(busca.dados.map((d)=>d.COMPANY_ID).filter(idBitrixValido).map(idBitrixString))];
  const empresas=await buscarEntidadesPorIds(webhook,"crm.company.list",ids,["ID","TITLE","PHONE","EMAIL","DATE_CREATE","ASSIGNED_BY_ID"]);
  return{meta,deals:busca.dados,empresas,busca};
}

function enriquecerDealCatalogo(d,b){
  const cat=String(d.CATEGORY_ID??""),sm=b.meta.estagios?.[cat]?.[String(d.STAGE_ID)]||{},sem=semanticaDeal(d,sm);
  const emp=idBitrixValido(d.COMPANY_ID)?b.empresas[idBitrixString(d.COMPANY_ID)]:null;
  return{...d,_FUNIL:nomeFunilSemCodigo(b.meta.categorias?.[cat]||`Categoria ${cat}`),_ESTAGIO:sm.label||d.STAGE_ID||"",
    _SEMANTICA:sem,_CLIENTE:emp?.TITLE||d.TITLE||"",_RESPONSAVEL:nomeUsuario(d.ASSIGNED_BY_ID)||(d.ASSIGNED_BY_ID?`ID ${d.ASSIGNED_BY_ID}`:"Sem responsável"),
    _VALOR:valorDeal(d),_FECHAMENTO:fecharDataDeal(d),_CICLO:cicloDealDias(d)};
}

async function baseLeadsCatalogo(webhook){
  const [st]=await Promise.all([carregarListaPaginada(webhook,"crm.status.list",{"filter[ENTITY_ID]":"STATUS","order[SORT]":"ASC"}),buscarUsuariosJornada(webhook)]);
  const sm={};st.forEach((x)=>sm[String(x.STATUS_ID)]=x);
  const busca=await listarCompletoRelatorio(webhook,"crm.lead.list",[
    "ID","TITLE","NAME","LAST_NAME","COMPANY_ID","COMPANY_TITLE","CONTACT_ID","STATUS_ID","STATUS_SEMANTIC_ID",
    "SOURCE_ID","UTM_SOURCE","UTM_MEDIUM","UTM_CAMPAIGN","UTM_CONTENT","UTM_TERM","OPPORTUNITY","ASSIGNED_BY_ID",
    "CREATED_BY_ID","DATE_CREATE","DATE_MODIFY","MOVED_TIME","DATE_CLOSED","LAST_ACTIVITY_TIME","LAST_ACTIVITY_BY","PHONE","EMAIL"
  ],{},{ID:"ASC"},"Relatório: buscando Leads...");
  return{leads:busca.dados,statusMap:sm,statusLeads:st,busca};
}
function semanticaLead(l){
  const s=String(l.STATUS_SEMANTIC_ID||"").toLowerCase();
  if(s==="s"||s==="success"||String(l.STATUS_ID)==="CONVERTED")return"success";
  if(s==="f"||s==="failure"||String(l.STATUS_ID)==="JUNK")return"failure";
  return"process";
}
async function atividadesCatalogo(webhook,completed,inicio="",fim=""){
  const f={};if(completed!==null)f.COMPLETED=completed?"Y":"N";
  if(inicio)f[">=END_TIME"]=`${inicio}T00:00:00-03:00`;if(fim)f["<=END_TIME"]=`${fim}T23:59:59-03:00`;
  await buscarUsuariosJornada(webhook);
  return listarCompletoRelatorio(webhook,"crm.activity.list",[
    "ID","OWNER_ID","OWNER_TYPE_ID","TYPE_ID","PROVIDER_ID","PROVIDER_TYPE_ID","SUBJECT","COMPLETED",
    "RESPONSIBLE_ID","AUTHOR_ID","CREATED","LAST_UPDATED","START_TIME","END_TIME","DEADLINE","DIRECTION","BINDINGS"
  ],f,{ID:"ASC"},"Relatório: buscando atividades...");
}

function criarResultadoCatalogo(chave,titulo,subtitulo,kpis,tabelas,nota=""){
  resultadoRelatorioCatalogo={chave,titulo,subtitulo,kpis,tabelas,nota};
  const t=tabelas?.find((x)=>x.dados?.length);dadosExtraidos=t?.dados||[];camposExtraidos=camposDeDados(dadosExtraidos);
  renderizarRelatorioCatalogo();
}
function renderizarRelatorioCatalogo(){
  const r=resultadoRelatorioCatalogo;if(!r?.titulo)return;
  document.getElementById("bloco-relatorio-catalogo").classList.remove("oculto");
  document.getElementById("relatorioResultadoTitulo").textContent=r.titulo;
  document.getElementById("relatorioResultadoSubtitulo").innerHTML=r.subtitulo||"";
  document.getElementById("relatorioResultadoKpis").innerHTML=(r.kpis||[]).map((x)=>`<div class="relatorio-especial-kpi"><span class="valor">${escapeHtmlRelatorio(x.valor)}</span><span class="rotulo">${escapeHtmlRelatorio(x.rotulo)}</span></div>`).join("");
  const metaBarrasEl=document.getElementById("relatorioResultadoMetaBarras");if(metaBarrasEl)metaBarrasEl.innerHTML=r.barra_meta||"";
  document.getElementById("relatorioResultadoTabelas").innerHTML=(r.tabelas||[]).map((t)=>`<div class="relatorio-subtitulo">${escapeHtmlRelatorio(t.titulo)}</div><div class="relatorio-scroll">${tabelaRelatorio(t.colunas,t.dados||[],t.limite||300)}</div>`).join("");
  document.getElementById("relatorioResultadoNota").textContent=r.nota||"";
  const temVisual=!!(r.titulo&&(r.kpis?.length||r.tabelas?.length));
  document.getElementById("btnAbrirVisualCatalogo")?.classList.toggle("oculto",!temVisual);
  document.getElementById("btnBaixarVisualCatalogo")?.classList.toggle("oculto",!temVisual);
}
// v11 — modelo visual genérico: mesmo letterhead/hero/kpis do modelo do Forecast,
// aplicado a QUALQUER relatório do catálogo (chave/titulo/subtitulo/kpis/tabelas),
// não só ao Forecast mensal. Cada tabela vira uma seção retrátil com model-table.
function gerarHTMLRelatorioVisualGenerico(r){
  if(!r?.titulo)return "";
  const kpisHtml=(r.kpis||[]).map((x)=>`<div class="kpi"><div class="label">${escapeHtmlRelatorio(x.rotulo)}</div><div class="value">${escapeHtmlRelatorio(x.valor)}</div></div>`).join("");
  const tabelasHtml=(r.tabelas||[]).map((t,i)=>{
    const tabela=tabelaModelo((t.colunas||[]).map((c)=>({label:c.label,valor:typeof c.valor==="function"?c.valor:(row)=>row[c.valor],html:!!c.html})),(t.dados||[]).slice(0,t.limite||300));
    return `<details class="vcard section-card"${i===0?" open":""}><summary><span class="vcard-name">${escapeHtmlRelatorio(t.titulo||`Tabela ${i+1}`)}</span><span class="vcard-stats">${(t.dados||[]).length} registro(s)</span><span class="vcard-chevron">▾</span></summary><div class="vcard-body">${tabela}</div></details>`;
  }).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtmlRelatorio(r.titulo)} · Atlas</title><style>${MODELO_EXECUTIVO_CSS}</style></head><body>`+
  `<div class="letterhead"><div class="letterhead-inner"><div class="letterhead-brand">${MODELO_EXECUTIVO_LOGO}<div class="letterhead-divider"></div><div class="letterhead-tagline">Gerenciamento de Risco em Processos Logísticos</div></div><div class="letterhead-ref"><strong>Relatório Comercial</strong><br>Extraído do Bitrix24 em ${formatarDataBR(formatarDataISO(new Date()))}</div></div></div>`+
  `<header class="hero"><div class="hero-inner"><p class="eyebrow">Relatório Comercial · Bitrix24</p><h1>${escapeHtmlRelatorio(r.titulo)}</h1><p class="subtitle">${(r.subtitulo||"").replace(/<[^>]+>/g,"")||"Extraído automaticamente pelo extrator Atlas."}</p></div></header>`+
  `<div class="wrap"><div class="overview-panel" id="visao-geral"><h2 class="section" style="margin-top:0;">Visão geral</h2><div class="kpis">${kpisHtml||'<p class="small-note">Sem indicadores.</p>'}</div></div>`+
  `<h2 class="section">Detalhamento</h2><div class="top3grid">${tabelasHtml||'<p class="small-note">Sem tabelas neste relatório.</p>'}</div>`+
  (r.nota?`<div class="note">${escapeHtmlRelatorio(r.nota)}</div>`:"")+
  `<a class="back-to-overview" href="#visao-geral">↑ Voltar à Visão geral</a></div><footer><div class="footer-brand">${MODELO_EXECUTIVO_LOGO}<span>Atlas</span></div>Atlas · ${escapeHtmlRelatorio(r.titulo)}</footer></body></html>`;
}
function abrirRelatorioVisualCatalogo(){
  const r=resultadoRelatorioCatalogo;if(!r?.titulo)return;
  const h=(r.chave==="forecast_mensal"&&r.modelo_visual)?gerarHTMLForecastModelo(r,"mensal"):gerarHTMLRelatorioVisualGenerico(r);
  if(h)abrirHtmlEmNovaAba(h);
}
function baixarHTMLRelatorioVisualCatalogo(){
  const r=resultadoRelatorioCatalogo;if(!r?.titulo)return;
  const h=(r.chave==="forecast_mensal"&&r.modelo_visual)?gerarHTMLForecastModelo(r,"mensal"):gerarHTMLRelatorioVisualGenerico(r);
  if(h)baixarArquivo(h,`bitrix_${r.chave}_modelo_atlas_${dataHoje()}.html`,"text/html;charset=utf-8;");
}
function baixarCSVRelatorioCatalogo(){
  const t=resultadoRelatorioCatalogo?.tabelas?.find((x)=>x.dados?.length);if(t)baixarCsvDatasetEspecial(t.dados,`bitrix_${resultadoRelatorioCatalogo.chave}_${dataHoje()}.csv`);
}
function baixarJSONRelatorioCatalogo(){
  if(resultadoRelatorioCatalogo?.titulo)baixarArquivo(JSON.stringify(resultadoRelatorioCatalogo,null,2),`bitrix_${resultadoRelatorioCatalogo.chave}_${dataHoje()}.json`,"application/json;charset=utf-8;");
}

async function extrairRelatorioCatalogo(webhook,chave){
  document.getElementById("spinner").style.display="inline-block";document.getElementById("btnExtrair").disabled=true;document.getElementById("btnParar").disabled=false;
  extracaoCancelada=false;esconderErro();resultadoRelatorioCatalogo={};
  try{
    const p=periodoCatalogo();

    if(chave==="forecast_mensal"){
      const b=await baseDealsCatalogo(webhook,true),ds=b.deals.map((d)=>enriquecerDealCatalogo(d,b));
      const campoMetaCatalogo=document.getElementById("metaRelatorioComercial");
      let meta=Number(campoMetaCatalogo?.value)||0;
      if(!meta){meta=metaMensalPadrao(p.fim||p.referencia);if(campoMetaCatalogo&&meta)campoMetaCatalogo.value=meta;}
      // v12 — deixa explícita a divisão da meta mensal pelas semanas do mês, igual ao Forecast semanal.
      const refMesCatalogo=p.fim||p.referencia;
      const [anoMesCatalogo,mesMesCatalogo]=refMesCatalogo.split("-").map(Number);
      const semanasNoMesCatalogo=Math.ceil(new Date(anoMesCatalogo,mesMesCatalogo,0).getDate()/7);
      const metaSemanalImplicita=meta>0?Math.round((meta/semanasNoMesCatalogo)*100)/100:0;
      let fechado=0,commit=0,best=0,pipe=0,pond=0,semData=0,vencidas=0;const rows=[];
      ds.forEach((d)=>{const pr=Number(d.PROBABILITY),usa=Number.isFinite(pr)&&pr>0&&pr<=100,prob=usa?pr:probabilidadeFallbackForecast(d._ESTAGIO,d._SEMANTICA),bucket=classificarBucketForecast(prob,d._SEMANTICA);let sit="Fora",fp=0;
        if(d._SEMANTICA==="success"&&dentroPeriodoCatalogo(d._FECHAMENTO,p)){fechado+=d._VALOR;sit="Ganho no mês"}
        else if(d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO)){const cd=parteDataISO(d.CLOSEDATE);if(!cd){semData++;sit="Sem CLOSEDATE"}else if(p.inicio&&cd<p.inicio){vencidas++;sit="CLOSEDATE vencida"}else if(dentroPeriodoCatalogo(cd,p)){sit="Previsto no mês";fp=d._VALOR*prob/100;pond+=fp;if(bucket==="Commit")commit+=d._VALOR;else if(bucket==="Best Case")best+=d._VALOR;else pipe+=d._VALOR}}
        if(sit!=="Fora")rows.push({DEAL_ID:d.ID,CLIENTE:d._CLIENTE,ESTAGIO:d._ESTAGIO,RESPONSAVEL:d._RESPONSAVEL,CLOSEDATE:parteDataISO(d.CLOSEDATE),VALOR:d._VALOR,PROBABILIDADE:prob,FONTE_PROBABILIDADE:usa?"Bitrix":"Fallback",BUCKET:bucket,SITUACAO:sit,FORECAST_PONDERADO:fp});
      });
      const forecast=fechado+pond;
      const modeloVisualMensal=await construirDadosModeloForecast(webhook,b.meta,p.inicio,p.fim,b.deals);
      criarResultadoCatalogo(chave,"Forecast mensal • Comercial",`<strong>${escapeHtmlRelatorio(formatarDataBR(p.inicio))} a ${escapeHtmlRelatorio(formatarDataBR(p.fim))}</strong>`,
        [kpi("Fechado",moedaRelatorio(fechado)),kpi("Forecast total",moedaRelatorio(forecast)),kpi("Commit",moedaRelatorio(commit)),kpi("Best Case",moedaRelatorio(best)),kpi("Pipeline",moedaRelatorio(pipe)),kpi("Sem CLOSEDATE",semData),kpi("CLOSEDATE vencida",vencidas),kpi(meta?"Gap para meta":"Meta",meta?moedaRelatorio(Math.max(0,meta-forecast)):"não informada"),kpi(`Meta semanal (÷${semanasNoMesCatalogo} semanas)`,metaSemanalImplicita?moedaRelatorio(metaSemanalImplicita):"—")],
        [{titulo:"Negócios do forecast",dados:rows,colunas:[{label:"Deal",valor:"DEAL_ID"},{label:"Cliente",valor:"CLIENTE"},{label:"Estágio",valor:"ESTAGIO"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"CLOSEDATE",valor:"CLOSEDATE"},{label:"Valor",valor:(x)=>moedaRelatorio(x.VALOR),html:true},{label:"Prob.",valor:(x)=>`${x.PROBABILIDADE}%`},{label:"Bucket",valor:"BUCKET"},{label:"Situação",valor:"SITUACAO"},{label:"Ponderado",valor:(x)=>moedaRelatorio(x.FORECAST_PONDERADO),html:true}]}],
        "PROBABILITY do Bitrix tem prioridade; quando zerada, usa fallback por estágio.");
      resultadoRelatorioCatalogo.modelo_visual=modeloVisualMensal;
      resultadoRelatorioCatalogo.meta_visual=meta;
      resultadoRelatorioCatalogo.meta_semanal_implicita=metaSemanalImplicita;
      resultadoRelatorioCatalogo.resumo={FECHADO:fechado,FORECAST_TOTAL:forecast};
      resultadoRelatorioCatalogo.barra_meta=barraAtingimentoMeta(`Atingimento da meta mensal (${mesAnoBR(p.fim||p.referencia)})`,forecast,meta);
      renderizarRelatorioCatalogo();
    }

    else if(chave==="pipeline_coverage"){
      const b=await baseDealsCatalogo(webhook,true),ref=new Date(`${p.referencia}T12:00:00`);
      const campoMetaCoverage=document.getElementById("metaRelatorioComercial");
      let meta=Number(campoMetaCoverage?.value)||0;
      if(!meta){meta=metaMensalPadrao(p.fim||p.referencia);if(campoMetaCoverage&&meta)campoMetaCoverage.value=meta;}
      const ab=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO));let total=0,pond=0,d30=0,d60=0,d90=0,sem=0;const g={};
      ab.forEach((d)=>{total+=d._VALOR;const pr=Number(d.PROBABILITY),prob=(Number.isFinite(pr)&&pr>0&&pr<=100)?pr:probabilidadeFallbackForecast(d._ESTAGIO,d._SEMANTICA);pond+=d._VALOR*prob/100;const cd=parteDataISO(d.CLOSEDATE);if(!cd)sem++;else{const dias=Math.floor((new Date(`${cd}T12:00:00`)-ref)/86400000);if(dias<=30)d30+=d._VALOR;else if(dias<=60)d60+=d._VALOR;else if(dias<=90)d90+=d._VALOR}
        const k=`${d._RESPONSAVEL}|||${d._ESTAGIO}`;(g[k]||=( {RESPONSAVEL:d._RESPONSAVEL,ESTAGIO:d._ESTAGIO,NEGOCIOS:0,PIPELINE:0,PONDERADO:0}));g[k].NEGOCIOS++;g[k].PIPELINE+=d._VALOR;g[k].PONDERADO+=d._VALOR*prob/100;});
      criarResultadoCatalogo(chave,"Pipeline & Coverage • 30/60/90 dias",`Referência: <strong>${escapeHtmlRelatorio(p.referencia)}</strong>`,
        [kpi("Pipeline aberto",moedaRelatorio(total)),kpi("Ponderado",moedaRelatorio(pond)),kpi("0–30 dias",moedaRelatorio(d30)),kpi("31–60 dias",moedaRelatorio(d60)),kpi("61–90 dias",moedaRelatorio(d90)),kpi("Sem CLOSEDATE",sem),kpi("Coverage 90d",meta?`${((d30+d60+d90)/meta).toFixed(2)}x`:"meta não informada"),kpi("Oportunidades",ab.length)],
        [{titulo:"Pipeline por responsável e estágio",dados:Object.values(g).sort((a,b)=>b.PIPELINE-a.PIPELINE),colunas:[{label:"Responsável",valor:"RESPONSAVEL"},{label:"Estágio",valor:"ESTAGIO"},{label:"Negócios",valor:"NEGOCIOS"},{label:"Pipeline",valor:(x)=>moedaRelatorio(x.PIPELINE),html:true},{label:"Ponderado",valor:(x)=>moedaRelatorio(x.PONDERADO),html:true}]}],
        "Coverage 90d = pipeline com fechamento em até 90 dias ÷ meta informada.");
    }

    else if(chave==="conversao_comercial"){
      const b=await baseDealsCatalogo(webhook,true),co=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>dentroPeriodoCatalogo(d.DATE_CREATE,p)),won=co.filter((d)=>d._SEMANTICA==="success"),lost=co.filter((d)=>d._SEMANTICA==="failure"),closed=won.length+lost.length;
      const hist=await buscarHistoricoEntidadeSDR(webhook,2,co.map((d)=>d.ID)),vis={};hist.forEach((h)=>{const d=co.find((x)=>String(x.ID)===String(h.OWNER_ID));if(!d)return;const cat=String(h.CATEGORY_ID??d.CATEGORY_ID),sid=String(h.STAGE_ID||""),lab=b.meta.estagios?.[cat]?.[sid]?.label||sid;(vis[lab]||=new Set()).add(String(h.OWNER_ID));});
      const wids=new Set(won.map((d)=>String(d.ID))),rows=Object.entries(vis).map(([stage,set])=>({ESTAGIO:stage,VISITARAM:set.size,GANHOS:[...set].filter((id)=>wids.has(id)).length})).map((x)=>({...x,CONVERSAO_PCT:taxaPct(x.GANHOS,x.VISITARAM)})).sort((a,b)=>b.VISITARAM-a.VISITARAM);
      criarResultadoCatalogo(chave,"Conversão Comercial • funil e Win Rate",`Coorte criada entre <strong>${escapeHtmlRelatorio(p.inicio||"início")}</strong> e <strong>${escapeHtmlRelatorio(p.fim||"hoje")}</strong>.`,
        [kpi("Oportunidades",co.length),kpi("Ganhos",won.length),kpi("Perdas",lost.length),kpi("Em aberto",co.filter((d)=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO)).length),kpi("Win Rate",`${taxaPct(won.length,closed)}%`),kpi("Taxa fechamento",`${taxaPct(closed,co.length)}%`),kpi("Receita ganha",moedaRelatorio(won.reduce((a,d)=>a+d._VALOR,0))),kpi("Ticket médio",moedaRelatorio(won.length?won.reduce((a,d)=>a+d._VALOR,0)/won.length:0))],
        [{titulo:"Conversão histórica por estágio",dados:rows,colunas:[{label:"Estágio",valor:"ESTAGIO"},{label:"Deals que passaram",valor:"VISITARAM"},{label:"Ganhos",valor:"GANHOS"},{label:"Conversão para ganho",valor:(x)=>`${x.CONVERSAO_PCT}%`}]}],
        "Conversão por estágio considera negócios da coorte que historicamente passaram pela etapa.");
    }

    else if(chave==="aging_sla"){
      const b=await baseDealsCatalogo(webhook,true),sla=Math.max(1,Number(document.getElementById("slaAgingRelatorio").value)||30),ref=new Date(`${p.referencia}T12:00:00`);
      const rows=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO)).map((d)=>{const mt=parteDataISO(d.MOVED_TIME),dias=mt?Math.max(0,Math.floor((ref-new Date(`${mt}T12:00:00`))/86400000)):"";return{DEAL_ID:d.ID,CLIENTE:d._CLIENTE,ESTAGIO:d._ESTAGIO,RESPONSAVEL:d._RESPONSAVEL,VALOR:d._VALOR,DIAS_NO_ESTAGIO:dias,FORA_SLA:dias!==""&&dias>sla?"S":"N"}}).sort((a,b)=>Number(b.DIAS_NO_ESTAGIO||-1)-Number(a.DIAS_NO_ESTAGIO||-1));
      const crit=rows.filter((x)=>x.FORA_SLA==="S");
      criarResultadoCatalogo(chave,"Aging & SLA Comercial",`SLA: <strong>${sla} dias</strong>.`,
        [kpi("Abertas",rows.length),kpi("Fora SLA",crit.length),kpi("% fora SLA",`${taxaPct(crit.length,rows.length)}%`),kpi("Pipeline fora SLA",moedaRelatorio(crit.reduce((a,x)=>a+x.VALOR,0))),kpi(">30d",rows.filter((x)=>Number(x.DIAS_NO_ESTAGIO)>30).length),kpi(">60d",rows.filter((x)=>Number(x.DIAS_NO_ESTAGIO)>60).length),kpi(">90d",rows.filter((x)=>Number(x.DIAS_NO_ESTAGIO)>90).length),kpi("Sem MOVED_TIME",rows.filter((x)=>x.DIAS_NO_ESTAGIO==="").length)],
        [{titulo:"Aging por oportunidade",dados:rows,colunas:[{label:"Deal",valor:"DEAL_ID"},{label:"Cliente",valor:"CLIENTE"},{label:"Estágio",valor:"ESTAGIO"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Dias",valor:"DIAS_NO_ESTAGIO"},{label:"Fora SLA",valor:"FORA_SLA"},{label:"Valor",valor:(x)=>moedaRelatorio(x.VALOR),html:true}]}],
        "Aging usa MOVED_TIME do estágio atual.");
    }

    else if(chave==="performance_vendedores"){
      const b=await baseDealsCatalogo(webhook,true),ds=b.deals.map((d)=>enriquecerDealCatalogo(d,b)),m={};
      const get=(d)=>{const k=String(d.ASSIGNED_BY_ID||"0");return m[k]||(m[k]={RESPONSAVEL:d._RESPONSAVEL,CRIADAS:0,PIPELINE:0,GANHOS:0,RECEITA:0,PERDAS:0,PERDIDO:0,CICLO_SOMA:0,CICLO_N:0})};
      ds.forEach((d)=>{const r=get(d);if(dentroPeriodoCatalogo(d.DATE_CREATE,p))r.CRIADAS++;if(d._SEMANTICA==="process"&&!ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO))r.PIPELINE+=d._VALOR;if(dentroPeriodoCatalogo(d._FECHAMENTO,p)){if(d._SEMANTICA==="success"){r.GANHOS++;r.RECEITA+=d._VALOR}else if(d._SEMANTICA==="failure"){r.PERDAS++;r.PERDIDO+=d._VALOR}if(d._CICLO!==""){r.CICLO_SOMA+=Number(d._CICLO);r.CICLO_N++}}});
      const rows=Object.values(m).map((r)=>({...r,WIN_RATE:taxaPct(r.GANHOS,r.GANHOS+r.PERDAS),TICKET:r.GANHOS?r.RECEITA/r.GANHOS:0,CICLO:r.CICLO_N?Math.round(r.CICLO_SOMA/r.CICLO_N*10)/10:0})).sort((a,b)=>b.RECEITA-a.RECEITA);
      criarResultadoCatalogo(chave,"Performance por vendedor",`Período: <strong>${escapeHtmlRelatorio(p.inicio||"todas")}</strong> a <strong>${escapeHtmlRelatorio(p.fim||"hoje")}</strong>.`,
        [kpi("Vendedores",rows.length),kpi("Receita",moedaRelatorio(rows.reduce((a,r)=>a+r.RECEITA,0))),kpi("Ganhos",rows.reduce((a,r)=>a+r.GANHOS,0)),kpi("Perdas",rows.reduce((a,r)=>a+r.PERDAS,0)),kpi("Pipeline aberto",moedaRelatorio(rows.reduce((a,r)=>a+r.PIPELINE,0))),kpi("Criadas",rows.reduce((a,r)=>a+r.CRIADAS,0)),kpi("Win Rate geral",`${taxaPct(rows.reduce((a,r)=>a+r.GANHOS,0),rows.reduce((a,r)=>a+r.GANHOS+r.PERDAS,0))}%`),kpi("Atribuição","responsável atual")],
        [{titulo:"Performance por responsável",dados:rows,colunas:[{label:"Responsável",valor:"RESPONSAVEL"},{label:"Criadas",valor:"CRIADAS"},{label:"Ganhos",valor:"GANHOS"},{label:"Perdas",valor:"PERDAS"},{label:"Win Rate",valor:(x)=>`${x.WIN_RATE}%`},{label:"Receita",valor:(x)=>moedaRelatorio(x.RECEITA),html:true},{label:"Ticket",valor:(x)=>moedaRelatorio(x.TICKET),html:true},{label:"Ciclo médio",valor:(x)=>`${x.CICLO}d`},{label:"Pipeline",valor:(x)=>moedaRelatorio(x.PIPELINE),html:true}]}],
        "ASSIGNED_BY_ID representa o responsável atual, não todo o histórico de ownership.");
    }

    else if(chave==="ganhos_perdas_ciclo"){
      const b=await baseDealsCatalogo(webhook,true),fs=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>d._SEMANTICA!=="process"&&dentroPeriodoCatalogo(d._FECHAMENTO,p)),won=fs.filter((d)=>d._SEMANTICA==="success"),lost=fs.filter((d)=>d._SEMANTICA==="failure");
      const rows=fs.map((d)=>({DEAL_ID:d.ID,CLIENTE:d._CLIENTE,RESULTADO:d._SEMANTICA==="success"?"Ganho":"Perdido",RESPONSAVEL:d._RESPONSAVEL,FECHAMENTO:d._FECHAMENTO,VALOR:d._VALOR,CICLO_DIAS:d._CICLO}));const cs=rows.map((x)=>Number(x.CICLO_DIAS)).filter(Number.isFinite);
      criarResultadoCatalogo(chave,"Ganhos, perdas e ciclo de vendas","Fechamentos no período selecionado.",
        [kpi("Fechados",rows.length),kpi("Ganhos",won.length),kpi("Perdas",lost.length),kpi("Win Rate",`${taxaPct(won.length,rows.length)}%`),kpi("Receita ganha",moedaRelatorio(won.reduce((a,d)=>a+d._VALOR,0))),kpi("Valor perdido",moedaRelatorio(lost.reduce((a,d)=>a+d._VALOR,0))),kpi("Ticket ganho",moedaRelatorio(won.length?won.reduce((a,d)=>a+d._VALOR,0)/won.length:0)),kpi("Ciclo médio",cs.length?`${Math.round(cs.reduce((a,b)=>a+b,0)/cs.length*10)/10}d`:"—")],
        [{titulo:"Negócios fechados",dados:rows,colunas:[{label:"Deal",valor:"DEAL_ID"},{label:"Cliente",valor:"CLIENTE"},{label:"Resultado",valor:"RESULTADO"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Fechamento",valor:"FECHAMENTO"},{label:"Valor",valor:(x)=>moedaRelatorio(x.VALOR),html:true},{label:"Ciclo",valor:(x)=>x.CICLO_DIAS===""?"":`${x.CICLO_DIAS}d`}]}]);
    }

    else if(chave==="origens_canais"){
      const [lb,db,om]=await Promise.all([baseLeadsCatalogo(webhook),baseDealsCatalogo(webhook,true),mapaOrigensRelatorio(webhook)]),ls=lb.leads.filter((l)=>dentroPeriodoCatalogo(l.DATE_CREATE,p)),by={};
      db.deals.forEach((d)=>{if(idBitrixValido(d.LEAD_ID))(by[String(d.LEAD_ID)]||=[]).push(enriquecerDealCatalogo(d,db))});
      const m={};ls.forEach((l)=>{const src=String(l.UTM_SOURCE||"").trim()?`UTM: ${l.UTM_SOURCE}`:(om[String(l.SOURCE_ID)]||l.SOURCE_ID||"Sem origem");if(!m[src])m[src]={ORIGEM:src,LEADS:0,LEADS_COM_OPP:0,OPORTUNIDADES:0,GANHOS:0,RECEITA:0};const r=m[src];r.LEADS++;const ds=by[String(l.ID)]||[];if(ds.length)r.LEADS_COM_OPP++;r.OPORTUNIDADES+=ds.length;const w=ds.filter((d)=>d._SEMANTICA==="success");r.GANHOS+=w.length;r.RECEITA+=w.reduce((a,d)=>a+d._VALOR,0)});
      const rows=Object.values(m).map((r)=>({...r,LEAD_OPP:taxaPct(r.LEADS_COM_OPP,r.LEADS),OPP_GANHO:taxaPct(r.GANHOS,r.OPORTUNIDADES)})).sort((a,b)=>b.LEADS-a.LEADS);
      criarResultadoCatalogo(chave,"Origens, canais e conversão","UTM_SOURCE tem prioridade; fallback para SOURCE_ID.",
        [kpi("Leads",ls.length),kpi("Origens",rows.length),kpi("Leads com Opp",rows.reduce((a,r)=>a+r.LEADS_COM_OPP,0)),kpi("Oportunidades",rows.reduce((a,r)=>a+r.OPORTUNIDADES,0)),kpi("Ganhos",rows.reduce((a,r)=>a+r.GANHOS,0)),kpi("Receita",moedaRelatorio(rows.reduce((a,r)=>a+r.RECEITA,0))),kpi("Lead → Opp",`${taxaPct(rows.reduce((a,r)=>a+r.LEADS_COM_OPP,0),ls.length)}%`),kpi("Sem origem",rows.find((r)=>r.ORIGEM==="Sem origem")?.LEADS||0)],
        [{titulo:"Conversão por origem",dados:rows,colunas:[{label:"Origem",valor:"ORIGEM"},{label:"Leads",valor:"LEADS"},{label:"Leads c/ Opp",valor:"LEADS_COM_OPP"},{label:"Lead → Opp",valor:(x)=>`${x.LEAD_OPP}%`},{label:"Oportunidades",valor:"OPORTUNIDADES"},{label:"Ganhos",valor:"GANHOS"},{label:"Opp → Ganho",valor:(x)=>`${x.OPP_GANHO}%`},{label:"Receita",valor:(x)=>moedaRelatorio(x.RECEITA),html:true}]}]);
    }

    else if(chave==="produtos_receita"){
      const b=await baseDealsCatalogo(webhook,true),won=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>d._SEMANTICA==="success"&&dentroPeriodoCatalogo(d._FECHAMENTO,p)),m={};let linhas=0,com=0;
      for(let i=0;i<won.length;i++){if(extracaoCancelada)break;const d=won[i];atualizarStatus(`Produtos: negócio ${i+1}/${won.length}`);const body=await bitrixFetchComRetentativa(`${webhook.replace(/\/$/,"")}/crm.deal.productrows.get.json?id=${encodeURIComponent(d.ID)}`),it=body.result||[];if(it.length)com++;it.forEach((x)=>{linhas++;const n=x.PRODUCT_NAME||`Produto ${x.PRODUCT_ID||""}`;if(!m[n])m[n]={PRODUTO:n,NEGOCIOS:new Set(),QUANTIDADE:0,RECEITA:0};m[n].NEGOCIOS.add(String(d.ID));m[n].QUANTIDADE+=Number(x.QUANTITY)||0;const pa=Number(x.PRICE_ACCOUNT);m[n].RECEITA+=(Number.isFinite(pa)&&pa!==0)?pa:(Number(x.PRICE)||0)*(Number(x.QUANTITY)||0)});await aguardar(100)}
      const rows=Object.values(m).map((r)=>({PRODUTO:r.PRODUTO,NEGOCIOS:r.NEGOCIOS.size,QUANTIDADE:Math.round(r.QUANTIDADE*100)/100,RECEITA:r.RECEITA})).sort((a,b)=>b.RECEITA-a.RECEITA);
      criarResultadoCatalogo(chave,"Produtos e receita","Produtos dos negócios ganhos no período.",
        [kpi("Deals ganhos",won.length),kpi("Deals com produto",com),kpi("Linhas produto",linhas),kpi("Produtos",rows.length),kpi("Receita linhas",moedaRelatorio(rows.reduce((a,r)=>a+r.RECEITA,0))),kpi("Receita deals",moedaRelatorio(won.reduce((a,d)=>a+d._VALOR,0))),kpi("Deals sem produto",won.length-com),kpi("Cobertura",`${taxaPct(com,won.length)}%`)],
        [{titulo:"Produtos vendidos",dados:rows,colunas:[{label:"Produto",valor:"PRODUTO"},{label:"Negócios",valor:"NEGOCIOS"},{label:"Quantidade",valor:"QUANTIDADE"},{label:"Receita linhas",valor:(x)=>moedaRelatorio(x.RECEITA),html:true}]}],
        "PRICE_ACCOUNT é usado quando disponível; fallback PRICE × QUANTITY.");
    }

    else if(chave==="clientes_receita"){
      const b=await baseDealsCatalogo(webhook,true),won=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>d._SEMANTICA==="success"&&dentroPeriodoCatalogo(d._FECHAMENTO,p)),m={};
      won.forEach((d)=>{const k=idBitrixValido(d.COMPANY_ID)?`C:${idBitrixString(d.COMPANY_ID)}`:`N:${normalizarTextoChave(d._CLIENTE)}`;if(!m[k])m[k]={CLIENTE:d._CLIENTE,NEGOCIOS:0,RECEITA:0,PRIMEIRO:d._FECHAMENTO,ULTIMO:d._FECHAMENTO};const r=m[k];r.NEGOCIOS++;r.RECEITA+=d._VALOR;if(d._FECHAMENTO<r.PRIMEIRO)r.PRIMEIRO=d._FECHAMENTO;if(d._FECHAMENTO>r.ULTIMO)r.ULTIMO=d._FECHAMENTO});
      const rows=Object.values(m).map((r)=>({...r,TICKET:r.NEGOCIOS?r.RECEITA/r.NEGOCIOS:0})).sort((a,b)=>b.RECEITA-a.RECEITA),total=rows.reduce((a,r)=>a+r.RECEITA,0),top10=rows.slice(0,10).reduce((a,r)=>a+r.RECEITA,0);
      criarResultadoCatalogo(chave,"Clientes, receita e concentração","Receita pelos negócios ganhos no período.",
        [kpi("Clientes",rows.length),kpi("Negócios ganhos",won.length),kpi("Receita",moedaRelatorio(total)),kpi("Ticket médio",moedaRelatorio(won.length?total/won.length:0)),kpi("Clientes recorrentes",rows.filter((r)=>r.NEGOCIOS>1).length),kpi("Receita Top 10",moedaRelatorio(top10)),kpi("Top 10",`${taxaPct(top10,total)}%`),kpi("Maior cliente",rows[0]?.CLIENTE||"—")],
        [{titulo:"Receita por cliente",dados:rows,colunas:[{label:"Cliente",valor:"CLIENTE"},{label:"Negócios",valor:"NEGOCIOS"},{label:"Receita",valor:(x)=>moedaRelatorio(x.RECEITA),html:true},{label:"Ticket",valor:(x)=>moedaRelatorio(x.TICKET),html:true},{label:"Primeiro",valor:"PRIMEIRO"},{label:"Último",valor:"ULTIMO"}]}]);
    }

    else if(chave==="funil_leads"){
      const [lb,db]=await Promise.all([baseLeadsCatalogo(webhook),baseDealsCatalogo(webhook,false)]),ls=lb.leads.filter((l)=>dentroPeriodoCatalogo(l.DATE_CREATE,p)),by={};db.deals.forEach((d)=>{if(idBitrixValido(d.LEAD_ID))(by[String(d.LEAD_ID)]||=[]).push(d)});
      const m={};let conv=0,junk=0,opp=0,wins=0;ls.forEach((l)=>{const lab=labelStatusLead(lb.statusMap,l.STATUS_ID);if(!m[lab])m[lab]={STATUS:lab,LEADS:0,COM_OPP:0,GANHOS:0};m[lab].LEADS++;const ds=by[String(l.ID)]||[];if(ds.length){opp++;m[lab].COM_OPP++}const w=ds.filter((d)=>["s","success"].includes(String(d.STAGE_SEMANTIC_ID||"").toLowerCase()));if(w.length){wins++;m[lab].GANHOS+=w.length}const s=semanticaLead(l);if(s==="success")conv++;if(s==="failure")junk++});
      const rows=Object.values(m).sort((a,b)=>b.LEADS-a.LEADS);
      criarResultadoCatalogo(chave,"Funil de Leads & conversão SDR","Coorte de Leads criada no período.",
        [kpi("Leads",ls.length),kpi("Convertidos",conv),kpi("Desqualificados",junk),kpi("Leads com Opp",opp),kpi("Lead → Opp",`${taxaPct(opp,ls.length)}%`),kpi("Leads com ganho",wins),kpi("Lead → Ganho",`${taxaPct(wins,ls.length)}%`),kpi("Em processamento",ls.filter((l)=>semanticaLead(l)==="process").length)],
        [{titulo:"Status atual dos Leads",dados:rows,colunas:[{label:"Status",valor:"STATUS"},{label:"Leads",valor:"LEADS"},{label:"Com oportunidade",valor:"COM_OPP"},{label:"Ganhos",valor:"GANHOS"}]}]);
    }

    else if(chave==="produtividade_atividades"){
      const a=await atividadesCatalogo(webhook,true,p.inicio,p.fim),m={};a.dados.forEach((x)=>{const id=idBitrixString(x.RESPONSIBLE_ID),nome=nomeUsuario(id)||(id?`ID ${id}`:"Sem responsável");if(!m[id||"0"])m[id||"0"]={RESPONSAVEL:nome,ATIVIDADES:0,LIGACOES:0,REUNIOES:0,TAREFAS:0,EMAILS:0,WHATSAPP:0,LEADS:new Set(),NEGOCIOS:new Set(),DIAS:new Set()};const r=m[id||"0"];r.ATIVIDADES++;const c=canalAtividadeSDR(x);if(c==="Ligação")r.LIGACOES++;else if(c==="Reunião")r.REUNIOES++;else if(c==="Tarefa")r.TAREFAS++;else if(c==="E-mail")r.EMAILS++;else if(c==="WhatsApp")r.WHATSAPP++;bindingsDaAtividade(x).forEach((b)=>{if(b.OWNER_TYPE_ID==="1")r.LEADS.add(b.OWNER_ID);if(b.OWNER_TYPE_ID==="2")r.NEGOCIOS.add(b.OWNER_ID)});const d=parteDataISO(x.END_TIME);if(d)r.DIAS.add(d)});
      const rows=Object.values(m).map((r)=>({RESPONSAVEL:r.RESPONSAVEL,ATIVIDADES:r.ATIVIDADES,LIGACOES:r.LIGACOES,REUNIOES:r.REUNIOES,TAREFAS:r.TAREFAS,EMAILS:r.EMAILS,WHATSAPP:r.WHATSAPP,LEADS_UNICOS:r.LEADS.size,NEGOCIOS_UNICOS:r.NEGOCIOS.size,MEDIA_DIA:r.DIAS.size?Math.round(r.ATIVIDADES/r.DIAS.size*100)/100:0})).sort((a,b)=>b.ATIVIDADES-a.ATIVIDADES);
      criarResultadoCatalogo(chave,"Produtividade de atividades por responsável","Atividades concluídas no período.",
        [kpi("Atividades",a.dados.length),kpi("Responsáveis",rows.length),kpi("Ligações",rows.reduce((s,r)=>s+r.LIGACOES,0)),kpi("Reuniões",rows.reduce((s,r)=>s+r.REUNIOES,0)),kpi("WhatsApp",rows.reduce((s,r)=>s+r.WHATSAPP,0)),kpi("E-mails",rows.reduce((s,r)=>s+r.EMAILS,0)),kpi("Leads únicos",new Set(a.dados.flatMap((x)=>bindingsDaAtividade(x).filter((b)=>b.OWNER_TYPE_ID==="1").map((b)=>b.OWNER_ID))).size),kpi("Negócios únicos",new Set(a.dados.flatMap((x)=>bindingsDaAtividade(x).filter((b)=>b.OWNER_TYPE_ID==="2").map((b)=>b.OWNER_ID))).size)],
        [{titulo:"Produtividade por responsável",dados:rows,colunas:[{label:"Responsável",valor:"RESPONSAVEL"},{label:"Atividades",valor:"ATIVIDADES"},{label:"Média/dia",valor:"MEDIA_DIA"},{label:"Ligações",valor:"LIGACOES"},{label:"Reuniões",valor:"REUNIOES"},{label:"WhatsApp",valor:"WHATSAPP"},{label:"E-mails",valor:"EMAILS"},{label:"Leads",valor:"LEADS_UNICOS"},{label:"Negócios",valor:"NEGOCIOS_UNICOS"}]}]);
    }

    else if(chave==="sla_primeiro_contato"){
      const lb=await baseLeadsCatalogo(webhook),ls=lb.leads.filter((l)=>dentroPeriodoCatalogo(l.DATE_CREATE,p)),a=await atividadesCatalogo(webhook,true,p.inicio,p.fim),by={};a.dados.forEach((x)=>bindingsDaAtividade(x).forEach((b)=>{if(b.OWNER_TYPE_ID==="1")(by[b.OWNER_ID]||=[]).push(x)}));const sla=Math.max(1,Number(document.getElementById("slaPrimeiroContatoHoras").value)||4);
      const rows=ls.map((l)=>{const created=new Date(l.DATE_CREATE),arr=(by[String(l.ID)]||[]).filter((x)=>new Date(x.END_TIME)>=created).sort((a,b)=>new Date(a.END_TIME)-new Date(b.END_TIME)),f=arr[0];let h="";if(f)h=Math.round(((new Date(f.END_TIME)-created)/3600000)*100)/100;return{LEAD_ID:l.ID,CLIENTE:l.COMPANY_TITLE||`${l.NAME||""} ${l.LAST_NAME||""}`.trim()||l.TITLE||"",STATUS:labelStatusLead(lb.statusMap,l.STATUS_ID),RESPONSAVEL:nomeUsuario(l.ASSIGNED_BY_ID),CRIADO:l.DATE_CREATE||"",PRIMEIRO_CONTATO:f?.END_TIME||"",HORAS:h,SLA:h!==""&&h<=sla?"S":(h===""?"SEM ATIVIDADE":"N")}});const ct=rows.filter((x)=>x.HORAS!==""),ok=rows.filter((x)=>x.SLA==="S"),hs=ct.map((x)=>Number(x.HORAS)).sort((a,b)=>a-b),med=hs.length?hs[Math.floor((hs.length-1)/2)]:0;
      criarResultadoCatalogo(chave,"SLA de primeiro contato",`SLA configurado: <strong>${sla} hora(s)</strong>.`,
        [kpi("Leads",rows.length),kpi("Com contato",ct.length),kpi("Sem atividade",rows.length-ct.length),kpi("Dentro SLA",ok.length),kpi("% dentro SLA",`${taxaPct(ok.length,rows.length)}%`),kpi("Mediana",`${med}h`),kpi("≤1h",rows.filter((x)=>x.HORAS!==""&&x.HORAS<=1).length),kpi("≤24h",rows.filter((x)=>x.HORAS!==""&&x.HORAS<=24).length)],
        [{titulo:"SLA por Lead",dados:rows,colunas:[{label:"Lead",valor:"LEAD_ID"},{label:"Cliente",valor:"CLIENTE"},{label:"Status",valor:"STATUS"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Criado",valor:"CRIADO"},{label:"Primeiro contato",valor:"PRIMEIRO_CONTATO"},{label:"Horas",valor:"HORAS"},{label:"SLA",valor:"SLA"}]}],
        "Primeiro contato = primeira atividade concluída vinculada ao Lead dentro da janela analisada.");
    }

    else if(chave==="handoffs"){
      const b=await baseDealsCatalogo(webhook,false),ds=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>classificarFunilJornada(d.CATEGORY_ID)!=="INTERNO"),lids=[...new Set(ds.map((d)=>d.LEAD_ID).filter(idBitrixValido).map(idBitrixString))],lm=await buscarEntidadesPorIds(webhook,"crm.lead.list",lids,["ID","ASSIGNED_BY_ID","TITLE"]),g={},rows=[];
      ds.forEach((d)=>{let k=idBitrixValido(d.COMPANY_ID)?`C:${idBitrixString(d.COMPANY_ID)}`:idBitrixValido(d.CONTACT_ID)?`T:${idBitrixString(d.CONTACT_ID)}`:idBitrixValido(d.LEAD_ID)?`L:${idBitrixString(d.LEAD_ID)}`:`D:${d.ID}`;(g[k]||=[]).push(d)});
      Object.values(g).forEach((a)=>{a.sort((x,y)=>String(x.DATE_CREATE).localeCompare(String(y.DATE_CREATE)));let prev=null;a.forEach((d)=>{if(prev&&idBitrixValido(prev.ASSIGNED_BY_ID)&&idBitrixValido(d.ASSIGNED_BY_ID)&&idBitrixString(prev.ASSIGNED_BY_ID)!==idBitrixString(d.ASSIGNED_BY_ID))rows.push({CLIENTE:d._CLIENTE,DEAL_ID:d.ID,DE:nomeUsuario(prev.ASSIGNED_BY_ID),PARA:d._RESPONSAVEL,FUNIL_DE:prev._FUNIL,FUNIL_PARA:d._FUNIL,TIPO:prev._FUNIL===d._FUNIL?"TROCA_MESMO_FUNIL":"HANDOFF_ENTRE_FUNIS"});const l=idBitrixValido(d.LEAD_ID)?lm[idBitrixString(d.LEAD_ID)]:null;if(l&&idBitrixValido(l.ASSIGNED_BY_ID)&&idBitrixValido(d.ASSIGNED_BY_ID)&&idBitrixString(l.ASSIGNED_BY_ID)!==idBitrixString(d.ASSIGNED_BY_ID))rows.push({CLIENTE:d._CLIENTE,DEAL_ID:d.ID,DE:nomeUsuario(l.ASSIGNED_BY_ID),PARA:d._RESPONSAVEL,FUNIL_DE:"Lead",FUNIL_PARA:d._FUNIL,TIPO:"LEAD_PARA_NEGOCIO"});prev=d})});
      criarResultadoCatalogo(chave,"Handoffs e trocas de responsável","Diferenças observáveis entre os registros extraídos.",
        [kpi("Eventos",rows.length),kpi("Mesmo funil",rows.filter((x)=>x.TIPO==="TROCA_MESMO_FUNIL").length),kpi("Entre funis",rows.filter((x)=>x.TIPO==="HANDOFF_ENTRE_FUNIS").length),kpi("Lead → Negócio",rows.filter((x)=>x.TIPO==="LEAD_PARA_NEGOCIO").length),kpi("Clientes",new Set(rows.map((x)=>x.CLIENTE)).size),kpi("Origens",new Set(rows.map((x)=>x.DE).filter(Boolean)).size),kpi("Destinos",new Set(rows.map((x)=>x.PARA).filter(Boolean)).size),kpi("Owner histórico","limitado")],
        [{titulo:"Handoffs e trocas",dados:rows,colunas:[{label:"Cliente",valor:"CLIENTE"},{label:"Deal",valor:"DEAL_ID"},{label:"De",valor:"DE"},{label:"Para",valor:"PARA"},{label:"Funil origem",valor:"FUNIL_DE"},{label:"Funil destino",valor:"FUNIL_PARA"},{label:"Tipo",valor:"TIPO"}]}],
        "Não reconstrói todas as alterações históricas de ASSIGNED_BY_ID dentro do mesmo card.");
    }

    else if(chave==="reentradas"){
      const b=await baseDealsCatalogo(webhook,false),ids=b.deals.map((d)=>d.ID),hist=await buscarHistoricoEntidadeSDR(webhook,2,ids),by={};hist.forEach((h)=>(by[String(h.OWNER_ID)]||=[]).push(h));const rows=[];let re=0,mud=0;const dealsRe=new Set();
      Object.entries(by).forEach(([id,a])=>{a.sort((x,y)=>String(x.CREATED_TIME).localeCompare(String(y.CREATED_TIME)));const seen=new Set();let ps="",pc="";a.forEach((h)=>{const c=String(h.CATEGORY_ID??""),s=String(h.STAGE_ID||""),key=`${c}|${s}`,f=nomeFunilSemCodigo(b.meta.categorias?.[c]||`Categoria ${c}`),lab=b.meta.estagios?.[c]?.[s]?.label||s;if(seen.has(key)&&key!==ps){re++;dealsRe.add(id);rows.push({DEAL_ID:id,TIPO:"REENTRADA_ESTAGIO",FUNIL:f,ETAPA:lab,DATA:h.CREATED_TIME||""})}if(pc&&c!==pc){mud++;rows.push({DEAL_ID:id,TIPO:"MUDANCA_PIPELINE",FUNIL:`${nomeFunilSemCodigo(b.meta.categorias?.[pc]||pc)} → ${f}`,ETAPA:lab,DATA:h.CREATED_TIME||""})}seen.add(key);ps=key;pc=c})});
      criarResultadoCatalogo(chave,"Reentradas, retrabalho e mudanças de pipeline","Histórico de estágios dos negócios.",
        [kpi("Eventos históricos",hist.length),kpi("Reentradas",re),kpi("Deals c/ reentrada",dealsRe.size),kpi("Mudanças pipeline",mud),kpi("Deals analisados",ids.length),kpi("Fonte","stagehistory"),kpi("Reabertura legítima","possível"),kpi("Diagnóstico","investigar")],
        [{titulo:"Eventos históricos relevantes",dados:rows,colunas:[{label:"Deal",valor:"DEAL_ID"},{label:"Tipo",valor:"TIPO"},{label:"Funil / rota",valor:"FUNIL"},{label:"Etapa",valor:"ETAPA"},{label:"Data",valor:"DATA"}]}],
        "Reentrada é sinal para auditoria, não prova automática de retrabalho.");
    }

    else if(chave==="duplicidades"){
      await buscarUsuariosJornada(webhook);const cb=await listarCompletoRelatorio(webhook,"crm.company.list",["ID","TITLE","PHONE","EMAIL","DATE_CREATE","ASSIGNED_BY_ID"],{},{ID:"ASC"},"Duplicidade: empresas..."),cm={};cb.dados.forEach((x)=>cm[String(x.ID)]=x);const sig=construirSinaisDuplicidadeEmpresas(cm),dup=Object.entries(sig).filter(([id,s])=>s.duplicado).map(([id,s])=>({COMPANY_ID:id,EMPRESA:cm[id]?.TITLE||"",MOTIVOS:s.motivos.join(" | "),RELACIONADOS:s.ids.join(" | ")}));
      const b=await baseDealsCatalogo(webhook,false),m={};b.deals.forEach((d)=>{if(classificarFunilJornada(d.CATEGORY_ID)==="INTERNO")return;const n=idBitrixValido(d.COMPANY_ID)?`C:${idBitrixString(d.COMPANY_ID)}`:`N:${normalizarTextoChave(d.TITLE||"")}`,k=`${n}|||${d.CATEGORY_ID}`;(m[k]||=[]).push(d)});const rep=Object.values(m).filter((a)=>a.length>1).map((a)=>({CLIENTE:enriquecerDealCatalogo(a[0],b)._CLIENTE,FUNIL:enriquecerDealCatalogo(a[0],b)._FUNIL,NEGOCIOS:a.length,IDS:a.map((d)=>d.ID).join(" | ")})).sort((a,b)=>b.NEGOCIOS-a.NEGOCIOS);
      criarResultadoCatalogo(chave,"Duplicidades e identidade do cliente","Sinais cadastrais e repetição no pipeline.",
        [kpi("Empresas",cb.dados.length),kpi("Cadastros sinalizados",dup.length),kpi("Grupos repetidos",rep.length),kpi("Cards nesses grupos",rep.reduce((a,r)=>a+r.NEGOCIOS,0)),kpi("COMPANY_ID 0","ignorado"),kpi("Fusão automática","não"),kpi("IDs","preservados"),kpi("Critério","nome/e-mail/telefone")],
        [{titulo:"Cliente repetido no mesmo pipeline",dados:rep,colunas:[{label:"Cliente",valor:"CLIENTE"},{label:"Funil",valor:"FUNIL"},{label:"Negócios",valor:"NEGOCIOS"},{label:"IDs",valor:"IDS"}]},{titulo:"Possíveis cadastros duplicados",dados:dup,colunas:[{label:"Company ID",valor:"COMPANY_ID"},{label:"Empresa",valor:"EMPRESA"},{label:"Motivos",valor:"MOTIVOS"},{label:"Relacionados",valor:"RELACIONADOS"}]}],
        "Sinal de duplicidade não implica mesclagem automática.");
    }

    else if(chave==="implantacao_posvenda"){
      const b=await baseDealsCatalogo(webhook,false),cats=encontrarCategoriasPorPalavras(b.meta,["financeiro","implantacao","implantação","sucesso do cliente","pos vendas","pós vendas","perfil securitario","perfil securitário"],false),ref=new Date(`${p.referencia}T12:00:00`);
      const rows=b.deals.map((d)=>enriquecerDealCatalogo(d,b)).filter((d)=>cats.includes(String(d.CATEGORY_ID))).map((d)=>{const mt=parteDataISO(d.MOVED_TIME),dias=mt?Math.max(0,Math.floor((ref-new Date(`${mt}T12:00:00`))/86400000)):"";return{DEAL_ID:d.ID,CLIENTE:d._CLIENTE,PIPELINE:d._FUNIL,ETAPA:d._ESTAGIO,STATUS:d._SEMANTICA,RESPONSAVEL:d._RESPONSAVEL,DIAS_NO_ESTAGIO:dias,VALOR:d._VALOR,PILOTO:ehEstagioPiloto(d.STAGE_ID,d._ESTAGIO)}});
      // Piloto continua contado em Negócios/Concluídos/Pipelines (é uma etapa real de onboarding),
      // mas sai de Abertos/Pipeline aberto/Backlog operacional — mesma regra usada no resto do pedido.
      const g={};rows.forEach((x)=>{if(!g[x.PIPELINE])g[x.PIPELINE]={PIPELINE:x.PIPELINE,NEGOCIOS:0,ABERTOS:0,CONCLUIDOS:0,FORA_30D:0};const r=g[x.PIPELINE];r.NEGOCIOS++;if(x.STATUS==="process"){if(!x.PILOTO)r.ABERTOS++;}else r.CONCLUIDOS++;if(Number(x.DIAS_NO_ESTAGIO)>30)r.FORA_30D++});
      criarResultadoCatalogo(chave,"Implantação, Onboarding e Pós-Venda","Pipelines posteriores ao Comercial.",
        [kpi("Negócios",rows.length),kpi("Abertos",rows.filter((x)=>x.STATUS==="process"&&!x.PILOTO).length),kpi("Concluídos",rows.filter((x)=>x.STATUS!=="process").length),kpi(">30d",rows.filter((x)=>Number(x.DIAS_NO_ESTAGIO)>30).length),kpi("Pipelines",Object.keys(g).length),kpi("Clientes",new Set(rows.map((x)=>x.CLIENTE)).size),kpi("Pipeline aberto",moedaRelatorio(rows.filter((x)=>x.STATUS==="process"&&!x.PILOTO).reduce((a,x)=>a+x.VALOR,0))),kpi("Responsáveis",new Set(rows.map((x)=>x.RESPONSAVEL)).size)],
        [{titulo:"Resumo por pipeline",dados:Object.values(g),colunas:[{label:"Pipeline",valor:"PIPELINE"},{label:"Negócios",valor:"NEGOCIOS"},{label:"Abertos",valor:"ABERTOS"},{label:"Concluídos",valor:"CONCLUIDOS"},{label:">30d",valor:"FORA_30D"}]},{titulo:"Backlog operacional",dados:rows.filter((x)=>x.STATUS==="process"&&!x.PILOTO),colunas:[{label:"Deal",valor:"DEAL_ID"},{label:"Cliente",valor:"CLIENTE"},{label:"Pipeline",valor:"PIPELINE"},{label:"Etapa",valor:"ETAPA"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Dias",valor:"DIAS_NO_ESTAGIO"}]}]);
    }

    else if(chave==="atividades_pendentes"){
      const a=await atividadesCatalogo(webhook,false,"",""),ref=p.referencia,m={};const rows=a.dados.map((x)=>{const id=idBitrixString(x.RESPONSIBLE_ID),resp=nomeUsuario(id)||(id?`ID ${id}`:"Sem responsável"),prazo=parteDataISO(x.DEADLINE);let sit="Sem prazo";if(prazo)sit=prazo<ref?"Atrasada":prazo===ref?"Vence hoje":"Futura";return{ATIVIDADE_ID:x.ID,RESPONSAVEL:resp,CANAL:canalAtividadeSDR(x),ASSUNTO:x.SUBJECT||"",DEADLINE:x.DEADLINE||"",SITUACAO:sit,VINCULOS:bindingsDaAtividade(x).map((b)=>`${nomeTipoEntidadeCRM(b.OWNER_TYPE_ID)}:${b.OWNER_ID}`).join(" | ")}});rows.forEach((x)=>{if(!m[x.RESPONSAVEL])m[x.RESPONSAVEL]={RESPONSAVEL:x.RESPONSAVEL,PENDENTES:0,ATRASADAS:0,HOJE:0,SEM_PRAZO:0};const r=m[x.RESPONSAVEL];r.PENDENTES++;if(x.SITUACAO==="Atrasada")r.ATRASADAS++;if(x.SITUACAO==="Vence hoje")r.HOJE++;if(x.SITUACAO==="Sem prazo")r.SEM_PRAZO++});
      criarResultadoCatalogo(chave,"Atividades pendentes e atrasadas",`Referência: <strong>${escapeHtmlRelatorio(ref)}</strong>.`,
        [kpi("Pendentes",rows.length),kpi("Atrasadas",rows.filter((x)=>x.SITUACAO==="Atrasada").length),kpi("Vencem hoje",rows.filter((x)=>x.SITUACAO==="Vence hoje").length),kpi("Sem prazo",rows.filter((x)=>x.SITUACAO==="Sem prazo").length),kpi("Responsáveis",Object.keys(m).length),kpi("Ligações",rows.filter((x)=>x.CANAL==="Ligação").length),kpi("Reuniões",rows.filter((x)=>x.CANAL==="Reunião").length),kpi("Tarefas",rows.filter((x)=>x.CANAL==="Tarefa").length)],
        [{titulo:"Resumo por responsável",dados:Object.values(m).sort((a,b)=>b.ATRASADAS-a.ATRASADAS),colunas:[{label:"Responsável",valor:"RESPONSAVEL"},{label:"Pendentes",valor:"PENDENTES"},{label:"Atrasadas",valor:"ATRASADAS"},{label:"Hoje",valor:"HOJE"},{label:"Sem prazo",valor:"SEM_PRAZO"}]},{titulo:"Atividades abertas",dados:rows,colunas:[{label:"ID",valor:"ATIVIDADE_ID"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Canal",valor:"CANAL"},{label:"Assunto",valor:"ASSUNTO"},{label:"Deadline",valor:"DEADLINE"},{label:"Situação",valor:"SITUACAO"},{label:"Vínculos",valor:"VINCULOS"}]}]);
    }

    else if(chave==="qualidade_crm"){
      const [db,lb]=await Promise.all([baseDealsCatalogo(webhook,false),baseLeadsCatalogo(webhook)]),ds=db.deals,ls=lb.leads;
      const open=ds.filter((d)=>semanticaDeal(d,db.meta.estagios?.[String(d.CATEGORY_ID)]?.[String(d.STAGE_ID)]||{})==="process"&&!ehEstagioPiloto(d.STAGE_ID,db.meta.estagios?.[String(d.CATEGORY_ID)]?.[String(d.STAGE_ID)]?.label));
      const checks=[
        {ENTIDADE:"Negócios",CAMPO:"Vínculo cliente",TOTAL:ds.length,FALTANTES:ds.filter((d)=>!idBitrixValido(d.COMPANY_ID)&&!idBitrixValido(d.CONTACT_ID)&&!idBitrixValido(d.LEAD_ID)).length},
        {ENTIDADE:"Negócios",CAMPO:"SOURCE_ID",TOTAL:ds.length,FALTANTES:ds.filter((d)=>!String(d.SOURCE_ID||"").trim()).length},
        {ENTIDADE:"Negócios",CAMPO:"ASSIGNED_BY_ID",TOTAL:ds.length,FALTANTES:ds.filter((d)=>!idBitrixValido(d.ASSIGNED_BY_ID)).length},
        {ENTIDADE:"Negócios",CAMPO:"OPPORTUNITY > 0",TOTAL:ds.length,FALTANTES:ds.filter((d)=>!(Number(d.OPPORTUNITY)>0)).length},
        {ENTIDADE:"Negócios abertos",CAMPO:"CLOSEDATE",TOTAL:open.length,FALTANTES:open.filter((d)=>!parteDataISO(d.CLOSEDATE)).length},
        {ENTIDADE:"Leads",CAMPO:"SOURCE_ID",TOTAL:ls.length,FALTANTES:ls.filter((l)=>!String(l.SOURCE_ID||"").trim()).length},
        {ENTIDADE:"Leads",CAMPO:"ASSIGNED_BY_ID",TOTAL:ls.length,FALTANTES:ls.filter((l)=>!idBitrixValido(l.ASSIGNED_BY_ID)).length},
        {ENTIDADE:"Leads",CAMPO:"Empresa / nome",TOTAL:ls.length,FALTANTES:ls.filter((l)=>!String(l.COMPANY_TITLE||l.NAME||l.TITLE||"").trim()).length},
        {ENTIDADE:"Leads",CAMPO:"Telefone ou e-mail",TOTAL:ls.length,FALTANTES:ls.filter((l)=>!(valoresMulticampo(l.PHONE).length||valoresMulticampo(l.EMAIL).length)).length}
      ].map((x)=>({...x,COMPLETUDE_PCT:x.TOTAL?Math.round((1-x.FALTANTES/x.TOTAL)*10000)/100:100}));
      criarResultadoCatalogo(chave,"Qualidade do CRM & campos faltantes","Completude dos campos operacionais já mapeados.",
        [kpi("Negócios",ds.length),kpi("Leads",ls.length),kpi("Checks",checks.length),kpi("Ocorrências faltantes",checks.reduce((a,x)=>a+x.FALTANTES,0)),kpi("Deals sem cliente",checks[0].FALTANTES),kpi("Deals sem origem",checks[1].FALTANTES),kpi("Leads sem origem",checks[5].FALTANTES),kpi("Leads sem contato",checks[8].FALTANTES)],
        [{titulo:"Completude por regra",dados:checks,colunas:[{label:"Entidade",valor:"ENTIDADE"},{label:"Campo/regra",valor:"CAMPO"},{label:"Total",valor:"TOTAL"},{label:"Faltantes",valor:"FALTANTES"},{label:"Completude",valor:(x)=>`${x.COMPLETUDE_PCT}%`}]}],
        "Completude mede disponibilidade para operação e análise; não afirma que todo campo seja obrigatório.");
    }

    else if(chave==="auditoria_sdr"){
      const lb=await baseLeadsCatalogo(webhook),ls=lb.leads.filter((l)=>dentroPeriodoCatalogo(l.DATE_CREATE,p));
      const a=await atividadesCatalogo(webhook,null,p.inicio,p.fim),by={};
      a.dados.forEach((x)=>bindingsDaAtividade(x).forEach((b)=>{if(b.OWNER_TYPE_ID==="1")(by[b.OWNER_ID]||=[]).push(x)}));
      const semAtividade=ls.filter((l)=>!(by[String(l.ID)]||[]).length);
      const concluidasSemAssunto=a.dados.filter((x)=>x.COMPLETED==="Y"&&!String(x.SUBJECT||"").trim());
      const abertos=ls.filter((l)=>semanticaLead(l)==="process");
      const semContatoRecente=abertos.filter((l)=>{
        const ultimas=(by[String(l.ID)]||[]).map((x)=>new Date(x.END_TIME)).filter((d)=>!isNaN(d)).sort((x,y)=>y-x);
        const ref=ultimas[0]||(l.LAST_ACTIVITY_TIME?new Date(l.LAST_ACTIVITY_TIME):new Date(l.DATE_CREATE));
        return !isNaN(ref)&&(new Date()-ref)/86400000>7;
      });
      const checks=[
        {ENTIDADE:"Leads",CAMPO:"Ao menos 1 atividade vinculada",TOTAL:ls.length,FALTANTES:semAtividade.length},
        {ENTIDADE:"Atividades concluídas",CAMPO:"Assunto/resultado preenchido",TOTAL:a.dados.filter((x)=>x.COMPLETED==="Y").length,FALTANTES:concluidasSemAssunto.length},
        {ENTIDADE:"Leads em aberto",CAMPO:"Contato nos últimos 7 dias",TOTAL:abertos.length,FALTANTES:semContatoRecente.length},
        {ENTIDADE:"Leads",CAMPO:"Telefone ou e-mail",TOTAL:ls.length,FALTANTES:ls.filter((l)=>!(valoresMulticampo(l.PHONE).length||valoresMulticampo(l.EMAIL).length)).length},
        {ENTIDADE:"Leads",CAMPO:"Origem (SOURCE_ID)",TOTAL:ls.length,FALTANTES:ls.filter((l)=>!String(l.SOURCE_ID||"").trim()).length},
        {ENTIDADE:"Leads",CAMPO:"Responsável atribuído",TOTAL:ls.length,FALTANTES:ls.filter((l)=>!idBitrixValido(l.ASSIGNED_BY_ID)).length}
      ].map((x)=>({...x,COMPLETUDE_PCT:x.TOTAL?Math.round((1-x.FALTANTES/x.TOTAL)*10000)/100:100}));
      const linhaLead=(l)=>({LEAD_ID:l.ID,CLIENTE:l.COMPANY_TITLE||`${l.NAME||""} ${l.LAST_NAME||""}`.trim()||l.TITLE||"",STATUS:labelStatusLead(lb.statusMap,l.STATUS_ID),RESPONSAVEL:nomeUsuario(l.ASSIGNED_BY_ID),CRIADO:l.DATE_CREATE||""});
      criarResultadoCatalogo(chave,"Auditoria SDR • validar dados e plano",`Leads criados entre <strong>${escapeHtmlRelatorio(p.inicio||"início")}</strong> e <strong>${escapeHtmlRelatorio(p.fim||"hoje")}</strong>.`,
        [kpi("Leads no período",ls.length),kpi("Sem nenhuma atividade",semAtividade.length),kpi("Atividades sem resultado",concluidasSemAssunto.length),kpi("Abertos sem contato 7d+",semContatoRecente.length),kpi("Checks",checks.length),kpi("Ocorrências faltantes",checks.reduce((a,x)=>a+x.FALTANTES,0))],
        [{titulo:"Completude e aderência ao plano de contato",dados:checks,colunas:[{label:"Entidade",valor:"ENTIDADE"},{label:"Campo/regra",valor:"CAMPO"},{label:"Total",valor:"TOTAL"},{label:"Faltantes",valor:"FALTANTES"},{label:"Completude",valor:(x)=>`${x.COMPLETUDE_PCT}%`}]},
         {titulo:"Leads sem nenhuma atividade",dados:semAtividade.map(linhaLead),colunas:[{label:"Lead",valor:"LEAD_ID"},{label:"Cliente",valor:"CLIENTE"},{label:"Status",valor:"STATUS"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Criado",valor:"CRIADO"}]},
         {titulo:"Leads em aberto sem contato recente (7d+)",dados:semContatoRecente.map(linhaLead),colunas:[{label:"Lead",valor:"LEAD_ID"},{label:"Cliente",valor:"CLIENTE"},{label:"Status",valor:"STATUS"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Criado",valor:"CRIADO"}]}],
        "Auditoria usa apenas atividades e campos já mapeados pelo extrator; valida existência e completude, não a qualidade do conteúdo registrado em cada atividade.");
    }

    else if(chave==="decisao_final_sdr"){
      const lb=await baseLeadsCatalogo(webhook),diasLimite=Math.max(1,Number(document.getElementById("diasEstagnacaoSDR").value)||15);
      const a=await atividadesCatalogo(webhook,null,"",""),by={};
      a.dados.forEach((x)=>bindingsDaAtividade(x).forEach((b)=>{if(b.OWNER_TYPE_ID==="1")(by[b.OWNER_ID]||=[]).push(x)}));
      const agora=new Date();
      const candidatos=lb.leads.filter((l)=>semanticaLead(l)==="process").map((l)=>{
        const atividadesLead=by[String(l.ID)]||[],tentativas=atividadesLead.length;
        const refParado=parteDataISO(l.MOVED_TIME)||parteDataISO(l.DATE_CREATE);
        const diasParado=refParado?Math.max(0,Math.floor((agora-new Date(`${refParado}T12:00:00`))/86400000)):"";
        let acao="Manter em nutrição";
        if(diasParado===""||diasParado<diasLimite)acao=null;
        else if(tentativas===0)acao="Recontatar";
        else if(diasParado>diasLimite*3)acao="Desqualificar";
        else if(tentativas>=3||Number(l.OPPORTUNITY)>0)acao="Escalar para Comercial";
        return{LEAD_ID:l.ID,CLIENTE:l.COMPANY_TITLE||`${l.NAME||""} ${l.LAST_NAME||""}`.trim()||l.TITLE||"",STATUS:labelStatusLead(lb.statusMap,l.STATUS_ID),RESPONSAVEL:nomeUsuario(l.ASSIGNED_BY_ID),DIAS_PARADO:diasParado,TENTATIVAS:tentativas,ACAO_RECOMENDADA:acao};
      }).filter((x)=>x.ACAO_RECOMENDADA).sort((x,y)=>Number(y.DIAS_PARADO)-Number(x.DIAS_PARADO));
      const porAcao={};candidatos.forEach((x)=>{porAcao[x.ACAO_RECOMENDADA]=(porAcao[x.ACAO_RECOMENDADA]||0)+1});
      criarResultadoCatalogo(chave,"Decisão Final SDR • saneamento seguro",`Leads em aberto estagnados há <strong>${diasLimite}+ dias</strong> sem mudança de etapa.`,
        [kpi("Leads estagnados",candidatos.length),kpi("Recontatar",porAcao["Recontatar"]||0),kpi("Desqualificar",porAcao["Desqualificar"]||0),kpi("Escalar para Comercial",porAcao["Escalar para Comercial"]||0),kpi("Manter em nutrição",porAcao["Manter em nutrição"]||0),kpi("Limiar de estagnação",`${diasLimite} dias`)],
        [{titulo:"Leads estagnados e ação recomendada",dados:candidatos,colunas:[{label:"Lead",valor:"LEAD_ID"},{label:"Cliente",valor:"CLIENTE"},{label:"Status",valor:"STATUS"},{label:"Responsável",valor:"RESPONSAVEL"},{label:"Dias parado",valor:"DIAS_PARADO"},{label:"Tentativas de contato",valor:"TENTATIVAS"},{label:"Ação recomendada",valor:"ACAO_RECOMENDADA"}]}],
        "Apoio a decisão apenas — nenhuma alteração é enviada ao Bitrix automaticamente. Para aplicar uma ação, use a seção de Sincronização com o registro e o novo status.");
    }

    else throw new Error(`Relatório "${chave}" ainda não possui implementação.`);

    atualizarStatus(`Relatório concluído: ${RELATORIOS[chave]?.label||chave}.`);
  }catch(e){mostrarErro("Não foi possível montar o relatório selecionado.\\n\\nDetalhe técnico: "+e.message);}
  finally{document.getElementById("spinner").style.display="none";document.getElementById("btnExtrair").disabled=false;document.getElementById("btnParar").disabled=true;}
}


const MODELO_EXECUTIVO_CSS = String.raw`
  :root {
    /* ---- brand tokens, same palette/names as o Case Prático SDR/BDR ---- */
    --orange:   #FF5618;
    --orange-2: #FF8008;
    --orange-3: #FF6B10;
    --gold:     #FFC500;
    --dark:     #333333;
    --white:    #FFFFFF;
    --cream:    #FBF3EC;
    --line:     #EAE1D8;
    --muted:    #8A8078;
    --maxw:     1240px;

    /* aliases used throughout this file's selectors */
    --atlas-primary:   var(--orange);
    --atlas-yellow:    var(--gold);
    --atlas-orange-2:  var(--orange-3);
    --atlas-orange-3:  var(--orange-2);
    --atlas-dark:      var(--dark);
    --atlas-white:     var(--white);

    --surface-1:      var(--white);
    --page-plane:      #FAF9F7;
    --text-primary:   var(--dark);
    --text-secondary: #5C564F;
    --text-muted:     var(--muted);
    --grid:           var(--line);
    --border:         rgba(51,51,51,0.10);
    --shadow-card:    0 18px 40px -22px rgba(51,51,51,.28);
    --shadow-soft:    0 6px 16px -12px rgba(51,51,51,.24);

    --good: #0ca30c; --warning: #fab219; --serious: #ec835a; --critical: #d03b3b;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    font-family: 'Montserrat', 'Segoe UI', Arial, sans-serif;
    font-size: 14px; color: var(--text-primary);
    background: linear-gradient(180deg, #FAF9F7 0%, #F4F1EC 100%) fixed; margin: 0; padding: 0 0 48px;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--atlas-primary); }

  /* ---------- letterhead masthead ---------- */
  .letterhead { background: var(--white); border-bottom: 3px solid var(--orange); }
  .letterhead-inner {
    max-width: var(--maxw); margin: 0 auto; padding: 20px 24px;
    display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;
  }
  .letterhead-brand { display: flex; align-items: center; gap: 16px; }
  .letterhead-brand svg { height: 32px; width: auto; display: block; }
  .letterhead-divider { width: 1.5px; align-self: stretch; background: var(--line); }
  .letterhead-tagline { font-size: 11.5px; font-weight: 700; letter-spacing: .05em; color: var(--muted); text-transform: uppercase; max-width: 200px; line-height: 1.5; }
  .letterhead-ref { font-size: 12px; font-weight: 600; color: var(--muted); text-align: right; line-height: 1.6; }
  .letterhead-ref strong { color: var(--dark); font-weight: 800; }

  /* ---------- hero ---------- */
  .hero {
    position: relative; overflow: hidden;
    background: linear-gradient(115deg, var(--orange) 0%, var(--orange-3) 55%, var(--orange-2) 100%);
    color: var(--white); padding: 40px 24px 76px;
    clip-path: polygon(0 0, 100% 0, 100% 90%, 0 100%);
  }
  .hero::after {
    content: ""; position: absolute; right: -8%; top: -30%; width: 480px; height: 480px;
    background: radial-gradient(circle, rgba(255,255,255,.14) 0%, rgba(255,255,255,0) 70%);
  }
  .hero-inner { max-width: var(--maxw); margin: 0 auto; position: relative; z-index: 1; }
  .eyebrow { text-transform: uppercase; letter-spacing: .14em; font-size: 12px; font-weight: 700; color: rgba(255,255,255,.85); margin: 0 0 12px; }
  .hero h1 { font-size: 34px; font-weight: 800; line-height: 1.12; margin: 0 0 10px; letter-spacing: -.01em; }
  .hero .subtitle { font-size: 14.5px; font-weight: 400; color: rgba(255,255,255,.92); max-width: 560px; margin: 0; }

  .topbar { display: none; }

  .wrap { max-width: var(--maxw); margin: -40px auto 0; padding: 0 24px 0; position: relative; z-index: 2; }

  h2.section {
    font-size: 15px; font-weight: 800; color: var(--atlas-dark);
    margin: 40px 0 4px; padding-left: 14px; position: relative;
    text-transform: uppercase; letter-spacing: 0.02em;
    display: flex; align-items: baseline; gap: 10px;
  }
  h2.section::before {
    content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; border-radius: 3px;
    background: linear-gradient(180deg, var(--orange), var(--gold));
  }
  h2.section .count { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: none; letter-spacing: 0; }
  p.section-sub { margin: 4px 0 16px 19px; font-size: 12.5px; color: var(--text-secondary); }

  .card {
    background: var(--surface-1); border-radius: 14px;
    box-shadow: var(--shadow-card); overflow: hidden;
  }
  .card-pad { padding: 20px 22px; }
  .card-head {
    padding: 12px 20px; font-weight: 700; font-size: 13px; color: var(--atlas-dark);
    background: var(--cream); border-bottom: 1px solid var(--line);
  }

  .explainer {
    background: var(--white); border-left: 4px solid var(--atlas-primary);
    border-radius: 14px; padding: 22px 26px; margin-bottom: 8px; line-height: 1.65; font-size: 14px;
    box-shadow: var(--shadow-card);
  }
  .explainer h2 { margin: 0 0 10px; font-size: 17px; color: var(--atlas-dark); border: none; padding: 0; }
  .explainer dl { display: grid; grid-template-columns: 210px 1fr; gap: 7px 16px; margin: 10px 0 0; }
  .explainer dt { font-weight: 700; color: var(--atlas-primary); }
  .explainer dd { margin: 0; color: var(--text-secondary); }

  .note {
    background: var(--cream); border-left: 4px solid var(--gold);
    border-radius: 0 14px 14px 0; padding: 16px 22px; font-size: 13px; margin: 18px 0 24px; line-height: 1.6;
  }
  .note b { display: block; margin-bottom: 6px; color: var(--atlas-dark); }
  .meta-missing { color: var(--critical); font-weight: 700; }

  .overview-panel {
    background: var(--white); border-radius: 16px; padding: 26px 28px 22px;
    box-shadow: var(--shadow-card); margin-bottom: 32px;
  }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 14px 0 0; }
  .kpi { background: var(--white); border: 1px solid var(--line); border-radius: 12px; padding: 18px; text-align: center; }
  .kpi .label { font-size: 10.5px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; font-weight: 700; }
  .kpi .value { font-size: 22px; font-weight: 800; margin-top: 6px; color: var(--text-primary); }
  .kpi .small { font-size: 11px; color: var(--text-secondary); margin-top: 4px; }
  .kpi.good { border-top: 3px solid var(--good); }
  .kpi.good .value { color: var(--good); }
  .kpi.warn { border-top: 3px solid var(--warning); }
  .kpi.warn .value { color: #bf8a00; }
  .kpi.accent {
    background: linear-gradient(135deg, var(--orange) 0%, var(--orange-3) 55%, var(--orange-2) 100%);
    border: none; box-shadow: var(--shadow-soft);
  }
  .kpi.accent .label { color: rgba(255,255,255,.85); }
  .kpi.accent .value { color: var(--white); }
  .kpi.accent .small { color: rgba(255,255,255,.85); }

  .kpi-clickable { cursor: pointer; transition: box-shadow .15s ease, transform .15s ease; }
  .kpi-clickable:hover { box-shadow: var(--shadow-card); transform: translateY(-2px); }
  .kpi-clickable:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(255,86,24,.35); }
  .kpi-arrow { display: inline-block; color: var(--atlas-primary); font-weight: 900; transition: transform .15s ease; }
  .kpi-clickable:hover .kpi-arrow, .kpi-clickable:focus-visible .kpi-arrow { transform: translateX(3px); }

  @keyframes detailPulse {
    0%   { box-shadow: 0 0 0 0 rgba(255,86,24,.55); }
    70%  { box-shadow: 0 0 0 14px rgba(255,86,24,0); }
    100% { box-shadow: 0 0 0 0 rgba(255,86,24,0); }
  }
  .detail-highlight { animation: detailPulse 1.4s ease; border-radius: 14px; }
  .back-to-overview { display: block; text-align: center; font-size: 12.5px; font-weight: 700; color: var(--atlas-primary); text-decoration: none; margin: 6px 0 32px; }
  .back-to-overview:hover { text-decoration: underline; }

  .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 28px; }
  .barrow { display: grid; grid-template-columns: 190px 1fr 110px; align-items: center; gap: 10px; margin-bottom: 9px; }
  .barlabel { font-size: 12px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bartrack { background: var(--grid); border-radius: 12px; height: 16px; position: relative; overflow: hidden; }
  .barfill { height: 100%; border-radius: 8px; min-width: 6px; }
  .barvalue { font-size: 11.5px; color: var(--text-primary); font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }

  .full { grid-column: 1 / -1; }

  /* ---------- company cards ---------- */
  .cgrid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px;
    margin-bottom: 14px;
  }
  .ccard {
    background: var(--surface-1); border: 1px solid var(--line); border-radius: 12px;
    padding: 16px 18px; box-shadow: var(--shadow-soft);
    display: flex; flex-direction: column; gap: 8px;
    transition: box-shadow .15s, transform .15s;
  }
  .ccard:hover { box-shadow: var(--shadow-card); transform: translateY(-1px); }
  .ccard-top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 6px 8px; }
  .ccard-value { font-weight: 800; font-size: 15px; color: var(--atlas-dark); white-space: nowrap; margin-left: auto; }
  .ccard-name { font-weight: 700; font-size: 15px; color: var(--text-primary); line-height: 1.35;
                 overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .ccard-meta { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--text-secondary); }
  .ccard-meta .dim { color: var(--text-muted); font-style: italic; }
  .ccard-date { font-size: 11.5px; color: var(--text-muted); border-top: 1px dashed var(--grid); padding-top: 8px; margin-top: 4px; }

  .stage-badge {
    font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em;
    padding: 4px 10px; border-radius: 20px; white-space: nowrap; color: #fff;
  }
  .stage-badge.s-1 { background: #86b6ef; color: #0b3a6b; }
  .stage-badge.s-2 { background: #3987e5; }
  .stage-badge.s-3 { background: #1c5cab; }
  .stage-badge.s-4 { background: #4a3aa7; }
  .stage-badge.s-pend { background: var(--warning); color: #5c3d00; }
  .stage-badge.s-won { background: var(--good); }

  /* ---------- vendor accordion ---------- */
  .vgrid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    align-items: start; gap: 10px; margin-bottom: 12px;
  }
  .vcard[open] { grid-column: 1 / -1; }
  .vcard {
    background: var(--surface-1); border-radius: 14px;
    box-shadow: var(--shadow-soft); overflow: hidden;
  }
  .vcard > summary {
    list-style: none; cursor: pointer; padding: 14px 18px;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    font-weight: 700; color: var(--atlas-dark);
    border-left: 5px solid var(--atlas-primary);
  }
  .vcard > summary::-webkit-details-marker { display: none; }
  .vcard > summary:hover { background: var(--cream); }
  .vcard-name { font-size: 13.5px; }
  .vcard-stats { font-size: 11.5px; color: var(--text-secondary); font-weight: 600; margin-left: auto; margin-right: 14px; }
  .vcard-chevron { font-size: 13px; color: var(--atlas-primary); transition: transform .15s; }
  .vcard[open] > summary .vcard-chevron { transform: rotate(180deg); }
  .vcard-body { padding: 16px 18px 18px; border-top: 1px solid var(--line); background: var(--page-plane); }

  .mini-chart {
    background: var(--surface-1); border: 1px solid var(--line); border-radius: 10px;
    padding: 12px 14px 8px; margin-bottom: 14px;
  }
  .mini-chart-title { font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; color: var(--text-muted); margin-bottom: 8px; }
  .mbarrow { display: grid; grid-template-columns: 150px 1fr 90px; align-items: center; gap: 8px; margin-bottom: 6px; }
  .mbarlabel { font-size: 11px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mbartrack { background: var(--grid); border-radius: 10px; height: 11px; overflow: hidden; }
  .mbarfill { height: 100%; border-radius: 6px; min-width: 4px; }
  .mbarvalue { font-size: 10.5px; font-weight: 700; text-align: right; color: var(--text-primary); font-variant-numeric: tabular-nums; }
  .mbar-more { font-size: 10.5px; color: var(--text-muted); font-style: italic; margin-top: 2px; }

  /* ---------- 3 top-level cards side by side ---------- */
  .top3grid {
    display: grid; grid-template-columns: repeat(3, 1fr);
    align-items: start; gap: 14px; margin-bottom: 28px;
  }
  .top3grid .vcard[open] { grid-column: 1 / -1; }
  .top3grid > .vcard { box-shadow: var(--shadow-card); }
  .top3grid > .vcard > summary { padding: 18px; }
  .top3grid > .vcard .vcard-name { font-size: 14.5px; font-weight: 800; }
  @media (max-width: 900px) {
    .top3grid { grid-template-columns: 1fr; }
  }

  /* ---------- month sub-cards (nested inside a top card) ---------- */
  .month-list { display: flex; flex-direction: column; gap: 10px; }
  .month-card > summary { border-left-color: var(--atlas-orange-2); padding: 11px 16px; }
  .month-card .vcard-name { font-size: 12.5px; }
  .month-card .vcard-body { padding: 14px 16px 16px; }

  /* ---------- stage sub-cards (nested inside a month card) ---------- */
  .stage-list { display: flex; flex-direction: column; gap: 8px; }
  .stage-card > summary { border-left-color: var(--atlas-yellow); padding: 9px 14px; gap: 8px; }
  .stage-card .vcard-body { padding: 12px 14px 14px; }

  /* ---------- wide verification cards ---------- */
  .wgrid { display: flex; flex-direction: column; gap: 12px; margin-bottom: 14px; }
  .wcard {
    background: var(--surface-1); border-left: 6px solid var(--text-muted);
    border-radius: 0 12px 12px 0; padding: 16px 20px; box-shadow: var(--shadow-soft);
  }
  .wcard.w-ok { border-left-color: var(--good); }
  .wcard.w-warn { border-left-color: var(--warning); }
  .wcard.w-alert { border-left-color: var(--critical); }
  .wcard-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 6px; }
  .wcard-name { font-weight: 700; font-size: 14.5px; }
  .wcard-status { font-size: 11px; font-weight: 800; text-transform: uppercase; padding: 4px 12px; border-radius: 20px; color: #fff; white-space: nowrap; }
  .wcard-status-ok { background: var(--good); }
  .wcard-status-warn { background: var(--warning); color: #5c3d00; }
  .wcard-status-alert { background: var(--critical); }
  .wcard-body { font-size: 13px; color: var(--text-secondary); line-height: 1.55; }
  .wcard-foot { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); margin-top: 10px; font-weight: 600; }

  .small-note { font-size: 11.5px; color: var(--text-muted); margin: 4px 0 20px; padding: 0 4px; line-height: 1.5; }
  .lead-note {
    background: var(--cream); border-left: 4px solid var(--gold); border-radius: 0 10px 10px 0;
    padding: 12px 16px; font-size: 12.5px; color: var(--text-secondary); line-height: 1.6; margin: 0 0 16px;
  }

  footer {
    text-align: center; font-size: 12px; color: var(--text-muted); font-weight: 600; letter-spacing: .02em;
    margin-top: 48px; padding: 32px 24px 26px; border-top: 1px solid var(--line);
  }
  .footer-brand { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 8px; }
  .footer-brand svg { height: 15px; width: auto; }
  .footer-brand span { font-weight: 800; color: var(--dark); letter-spacing: .04em; }

  @media (max-width: 860px) {
    .letterhead-inner { padding: 16px 18px; }
    .letterhead-ref { display: none; }
    .hero { padding: 32px 18px 64px; }
    .hero h1 { font-size: 27px; }
    .wrap { padding: 0 18px 0; }
    .kpis { grid-template-columns: repeat(2, 1fr); }
    .charts-grid { grid-template-columns: 1fr; }
    .explainer dl { grid-template-columns: 1fr; }
    .cgrid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
  }
  @media print {
    .hero { clip-path: none; }
    body { background: var(--white); }
  }

.model-table-wrap{overflow:auto;background:#fff;border-radius:14px;box-shadow:var(--shadow-soft);margin-bottom:22px}
.model-table{width:100%;border-collapse:collapse;font-size:12px}
.model-table th,.model-table td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.model-table th{background:var(--cream);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.activity-insight{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:14px 0 22px}
.activity-insight .mini-kpi{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;text-align:center}
.activity-insight .mini-kpi b{display:block;font-size:22px;color:var(--orange);margin-bottom:4px}
.activity-insight .mini-kpi span{font-size:10.5px;color:var(--muted);text-transform:uppercase;font-weight:700}
@media(max-width:860px){.activity-insight{grid-template-columns:repeat(2,1fr)}}
.meta-progress-wrap{display:flex;flex-direction:column;gap:12px;margin:16px 0 0}
.meta-progress-row{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:#fff}
.meta-progress-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;font-size:12.5px;font-weight:700;color:var(--text-primary);flex-wrap:wrap}
.meta-progress-valores{font-weight:600;color:var(--text-secondary);font-size:12px}
.meta-progress-track{margin-top:8px;height:10px;border-radius:999px;background:var(--cream);overflow:hidden}
.meta-progress-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--orange),#ffb703)}
.meta-progress-fill.bateu{background:linear-gradient(90deg,var(--good),#37c98a)}
.meta-progress-status{margin-top:6px;font-size:11.5px;font-weight:700}
.meta-progress-status.ok{color:var(--good)}
.meta-progress-status.pendente{color:var(--text-secondary)}
.meta-seta{font-size:13px;margin-right:3px;font-weight:900}
.meta-seta-up{color:var(--good)}
.meta-seta-down{color:#d03b3b}
.meta-cards-destaque{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin:18px 0 0}
.meta-card-destaque{border-radius:16px;padding:20px 22px;background:#fff;border:2px solid var(--line);box-shadow:var(--shadow-card)}
.meta-card-destaque.no-caminho{border-color:var(--good);background:rgba(12,163,12,.05)}
.meta-card-destaque.abaixo{border-color:#d03b3b;background:rgba(208,59,59,.05)}
.meta-card-label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;font-weight:800;color:var(--muted)}
.meta-card-valor{font-size:28px;font-weight:800;color:var(--text-primary);margin:4px 0 12px;letter-spacing:-.02em}
.meta-card-linha{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--text-secondary);padding:6px 0;border-top:1px dashed var(--line)}
.meta-card-linha strong{color:var(--text-primary);font-weight:700}
.meta-card-pct{margin-top:8px;font-size:11.5px;font-weight:700;color:var(--muted)}
@media(max-width:640px){.meta-cards-destaque{grid-template-columns:1fr}}
`;
const MODELO_EXECUTIVO_LOGO = String.raw`<svg viewBox="0 0 800 174.78" xmlns="http://www.w3.org/2000/svg" fill="#FF5618"><path d="M403.66,171.69l-10-28.49h-57l-9.78,28.49H294.09L350.17,21.5h29.14L437.2,171.69ZM365,61.19l-18.66,53.73H383.9Z"/>
        <path d="M494.61,145.14h13.58v26.55H487q-18.16,0-28.69-10.53t-10.53-28.89v-47h-21.4V78.88L472.8,32.47h4.35V61.31h31v24H477.65v43q0,8.08,4.39,12.47t12.57,4.39"/>
        <rect x="529.49" y="21.5" width="29.84" height="150.2"/>
        <path d="M670.83,61.12h22.36V171.49H669.73l-2.59-9.88q-15.07,13.17-35.73,13.17a58.64,58.64,0,0,1-29.64-7.58,54.09,54.09,0,0,1-20.76-21,60.29,60.29,0,0,1-7.48-29.89A59.58,59.58,0,0,1,581,86.61a53.89,53.89,0,0,1,20.76-20.85,58.92,58.92,0,0,1,29.64-7.54q21.06,0,36.23,13.47ZM612.3,137.91q8.54,8.63,21.51,8.63t21.5-8.58q8.54-8.58,8.54-21.66t-8.54-21.65q-8.52-8.58-21.5-8.59T612.3,94.7q-8.53,8.63-8.53,21.6t8.53,21.61"/>
        <path d="M753.69,174.78q-20.75,0-33.48-10.82t-12.82-28.6h29q.11,7.09,5.14,10.88T754.89,150A20.3,20.3,0,0,0,766,147.14a9.17,9.17,0,0,0,4.54-8.18,7.43,7.43,0,0,0-1.55-4.69,11.43,11.43,0,0,0-4.84-3.35,43.86,43.86,0,0,0-6.48-2.09q-3.2-.75-8.39-1.65-4.68-.8-7.88-1.45t-7.73-1.94a44.3,44.3,0,0,1-7.64-2.85,43.08,43.08,0,0,1-6.54-4.14,23,23,0,0,1-5.49-5.74,29.62,29.62,0,0,1-3.39-7.63,34.21,34.21,0,0,1-1.35-9.88,31.18,31.18,0,0,1,12.28-25.5q12.27-9.82,32.13-9.83t32,10.13q12.07,10.13,12.17,26.7H769.56q-.09-6.49-4.44-9.78T752.9,82q-6.9,0-10.83,2.9a9.07,9.07,0,0,0-3.94,7.68,7.92,7.92,0,0,0,.64,3.25,5.9,5.9,0,0,0,2.3,2.49q1.65,1,3.09,1.8a22.06,22.06,0,0,0,4.39,1.49c2,.5,3.56.87,4.79,1.1l5.64,1q16.07,2.89,23.16,6,17.86,8,17.86,27.94,0,16.86-12.67,27t-33.64,10.12"/>
        <polygon points="153.4 87.56 167.65 62.87 167.68 62.85 178.13 44.72 178.11 44.68 178.15 44.68 203.95 0 182.97 0 152.31 0 110.4 0 99.17 0 73.37 44.68 73.35 44.72 62.87 62.87 48.62 87.56 48.41 87.94 0 171.76 83.81 171.76 104.78 171.76 125.74 135.49 125.76 135.44 153.19 87.94 153.4 87.56"/>
        <polygon points="203.07 87.94 175.75 87.94 153.9 125.79 153.9 125.83 137.02 155.01 146.7 171.76 209.57 171.76 251.48 171.76 203.07 87.94"/></svg>`;

