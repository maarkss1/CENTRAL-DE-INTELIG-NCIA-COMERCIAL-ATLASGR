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

// v22 — "Abrir modelo visual" renderiza o relatório num modal (iframe com
// srcdoc, isolado do CSS/JS do site) que sobe por cima da página atual, em
// vez de abrir uma aba/arquivo separado. Fica escondido até o usuário
// clicar em "Abrir modelo visual" — nunca aparece sozinho. Toda página com
// um botão desses tem o container #relatorioVisualInlineCard; se por algum
// motivo não existir, cai de volta no comportamento antigo (nova aba).
// v25 — vira modal de verdade (overlay fixo, "uma página por cima da
// outra") com 3 ações no cabeçalho: Salvar (guarda o HTML deste navegador,
// numa lista revisitável), Baixar (arquivo .html) e Abrir em nova aba.
let relatorioVisualAtualHtml = "";
let relatorioVisualAtualNome = "";
function mostrarRelatorioVisualInline(html, nome) {
  const card = document.getElementById("relatorioVisualInlineCard");
  const frame = document.getElementById("relatorioVisualInlineFrame");
  if (!card || !frame) { abrirHtmlEmNovaAba(html); return; }
  relatorioVisualAtualHtml = html;
  relatorioVisualAtualNome = nome || "Relatório";
  const titulo = document.getElementById("relatorioModalTitulo");
  if (titulo) titulo.textContent = "📊 " + relatorioVisualAtualNome;
  frame.srcdoc = html;
  card.classList.remove("oculto");
}
function fecharRelatorioVisualInline() {
  document.getElementById("relatorioVisualInlineCard")?.classList.add("oculto");
  document.getElementById("relatorioSalvosPainel")?.classList.add("oculto");
  const frame = document.getElementById("relatorioVisualInlineFrame");
  if (frame) frame.srcdoc = "";
}
function baixarRelatorioVisualAtual() {
  if (!relatorioVisualAtualHtml) return;
  const nomeArquivo = normalizarTextoChave(relatorioVisualAtualNome || "relatorio").replace(/ /g, "_") || "relatorio";
  baixarArquivo(relatorioVisualAtualHtml, `${nomeArquivo}_${dataHoje()}.html`, "text/html;charset=utf-8;");
}
function abrirRelatorioVisualEmNovaAba() {
  if (relatorioVisualAtualHtml) abrirHtmlEmNovaAba(relatorioVisualAtualHtml);
}
// v26 — "Baixar PDF": aciona a impressão do próprio iframe do relatório (o
// relatório já tem regras @media print dedicadas — sem "pisca", sem cortar
// cards no meio). O navegador abre o diálogo de impressão nativo, onde
// "Salvar como PDF" é uma das impressoras disponíveis — sem depender de
// nenhuma biblioteca externa (o portal é 100% estático, sem etapa de build).
function baixarRelatorioVisualPDF() {
  const frame = document.getElementById("relatorioVisualInlineFrame");
  if (!frame || !relatorioVisualAtualHtml) return;
  try {
    frame.contentWindow.focus();
    frame.contentWindow.print();
  } catch (e) {
    mostrarErro('Não foi possível abrir a impressão automaticamente. Use "Baixar" e abra o arquivo .html para imprimir/salvar como PDF.');
  }
}

// v25 — "Salvar": guarda o HTML gerado numa lista local (até 15, mais
// recente primeiro), pra poder reabrir depois sem precisar reextrair do
// Bitrix. É por navegador (localStorage) — mesma limitação já documentada
// no histórico do Forecast (js/jornada.js).
const CHAVE_RELATORIOS_SALVOS_LOCAL = "atlas-extrator-relatorios-salvos";
function carregarRelatoriosSalvos() {
  try { return JSON.parse(localStorage.getItem(CHAVE_RELATORIOS_SALVOS_LOCAL) || "[]"); }
  catch (e) { return []; }
}
function salvarRelatorioVisualAtual() {
  if (!relatorioVisualAtualHtml) return;
  try {
    const lista = carregarRelatoriosSalvos();
    lista.unshift({ id: String(Date.now()), nome: relatorioVisualAtualNome, quando: new Date().toLocaleString("pt-BR"), html: relatorioVisualAtualHtml });
    localStorage.setItem(CHAVE_RELATORIOS_SALVOS_LOCAL, JSON.stringify(lista.slice(0, 15)));
  } catch (e) {
    mostrarErro("Não foi possível salvar — armazenamento local cheio ou indisponível neste navegador.");
    return;
  }
  renderizarRelatoriosSalvos();
  document.getElementById("relatorioSalvosPainel")?.classList.remove("oculto");
}
function excluirRelatorioSalvo(id) {
  const lista = carregarRelatoriosSalvos().filter((x) => x.id !== id);
  try { localStorage.setItem(CHAVE_RELATORIOS_SALVOS_LOCAL, JSON.stringify(lista)); } catch (e) {}
  renderizarRelatoriosSalvos();
}
function abrirRelatorioSalvo(id) {
  const item = carregarRelatoriosSalvos().find((x) => x.id === id);
  if (item) mostrarRelatorioVisualInline(item.html, item.nome);
}
function alternarPainelRelatoriosSalvos() {
  const painel = document.getElementById("relatorioSalvosPainel");
  if (!painel) return;
  painel.classList.toggle("oculto");
  if (!painel.classList.contains("oculto")) renderizarRelatoriosSalvos();
}
function renderizarRelatoriosSalvos() {
  const el = document.getElementById("relatorioSalvosLista");
  if (!el) return;
  const lista = carregarRelatoriosSalvos();
  if (!lista.length) { el.innerHTML = '<p class="small-note">Nenhum relatório salvo neste navegador ainda.</p>'; return; }
  el.innerHTML = lista.map((x) =>
    `<div class="relatorio-salvo-item"><button type="button" class="relatorio-salvo-abrir" onclick="abrirRelatorioSalvo('${x.id}')"><strong>${escapeHtmlRelatorio(x.nome)}</strong><span>${escapeHtmlRelatorio(x.quando)}</span></button><button type="button" class="relatorio-salvo-excluir" onclick="excluirRelatorioSalvo('${x.id}')" title="Excluir">✕</button></div>`
  ).join("");
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
    const criacao=parteDataISO(d.DATE_CREATE);
    return {
      DEAL_ID:d.ID,CLIENTE_KEY:chaveClienteDealModelo(d),
      CLIENTE:idBitrixValido(d.COMPANY_ID)?(empresas[idBitrixString(d.COMPANY_ID)]?.TITLE||d.TITLE||""):(d.TITLE||""),
      ESTAGIO:sm.label||d.STAGE_ID||"",SEMANTICA:semanticaDeal(d,sm),
      RESPONSAVEL:nomeUsuario(d.ASSIGNED_BY_ID)||(d.ASSIGNED_BY_ID?`ID ${d.ASSIGNED_BY_ID}`:"Sem responsável"),
      ORIGEM:origemLabelModelo(d.SOURCE_ID,origens),VALOR:Number(d.OPPORTUNITY)||0,
      DATA_MOVIMENTO:data,DATA_MOVIMENTO_BR:formatarDataBR(data),MES_CHAVE:chaveMesISO(data),MES_LABEL:mesAnoBR(data),
      DIAS_NO_ESTAGIO:diferencaDiasAteReferencia(data,ref),
      // v24 — data de entrada do negócio (DATE_CREATE do próprio negócio — o
      // Bitrix não guarda a data de criação do Lead de origem separadamente
      // sem uma busca por negócio, então usamos a criação do negócio como o
      // "entrou como negócio") e o ciclo (criação → estágio atual/fechamento).
      DATA_CRIACAO:criacao,DATA_CRIACAO_BR:formatarDataBR(criacao),
      CICLO_DIAS:(criacao&&data)?diferencaDiasAteReferencia(criacao,data):""
    };
  };
  const comercial=(dealsComercial||[]).map(mapRow), financeiro=fin.map(mapRow);
  const ehFechado=(x)=>{
    const n=normalizarTextoChave(x.ESTAGIO);
    return n.includes("contrato assinado")||(x.SEMANTICA==="success"&&n.includes("assin"));
  };
  const fechados=financeiro.filter((x)=>ehFechado(x)&&dataDentroFaixa(x.DATA_MOVIMENTO,inicio,fim));
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
  const media=(rows,campo)=>{const v=rows.map((x)=>Number(x[campo])).filter((n)=>Number.isFinite(n));return v.length?Math.round((v.reduce((a,b)=>a+b,0)/v.length)*10)/10:0;};
  const porOrigem=(rows)=>{
    const m={};rows.forEach((x)=>{m[x.ORIGEM]=(m[x.ORIGEM]||0)+x.VALOR;});
    return Object.entries(m).sort((a,b)=>b[1]-a[1]);
  };
  const porEstagio=(rows)=>{
    const m={};rows.forEach((x)=>{if(!m[x.ESTAGIO])m[x.ESTAGIO]={ESTAGIO:x.ESTAGIO,VALOR:0,NEGOCIOS:0};m[x.ESTAGIO].VALOR+=x.VALOR;m[x.ESTAGIO].NEGOCIOS++;});
    return Object.values(m).sort((a,b)=>b.VALOR-a.VALOR);
  };
  const maiorFechado=fechados.reduce((max,x)=>(!max||x.VALOR>max.VALOR)?x:max,null);
  const topOrigem=porOrigem(fechados)[0];
  // v24 — comparativo ano a ano: reaproveita o array `financeiro` (que já
  // veio SEM filtro de data do Bitrix — tem o histórico inteiro da categoria)
  // filtrando pela mesma janela de datas só que um ano antes, sem nenhuma
  // chamada nova à API.
  const anoAtras=(iso)=>{if(!iso)return "";const [y,m,d]=iso.split("-").map(Number);return `${y-1}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;};
  const inicioAnoPassado=anoAtras(inicio), fimAnoPassado=anoAtras(fim);
  const fechadosAnoPassado=financeiro.filter((x)=>ehFechado(x)&&dataDentroFaixa(x.DATA_MOVIMENTO,inicioAnoPassado,fimAnoPassado));
  const valorAnoPassado=somarModelo(fechadosAnoPassado), valorAtual=somarModelo(fechados);
  const comparativoAno={
    anoAtualLabel:inicio?inicio.slice(0,4):"",anoPassadoLabel:inicioAnoPassado?inicioAnoPassado.slice(0,4):"",
    valorAtual,valorAnoPassado,negociosAtual:fechados.length,negociosAnoPassado:fechadosAnoPassado.length,
    deltaPct:valorAnoPassado>0?Math.round(((valorAtual-valorAnoPassado)/valorAnoPassado)*1000)/10:null
  };
  return {
    periodo_inicio:inicio,periodo_fim:fim,referencia:ref,fechados,pendentes,pipeline,
    dominio:extrairDominioWebhook(webhook),
    vendedores_fechados:porVend(fechados),vendedores_pipeline:porVend(pipeline),
    pipeline_por_estagio:porEstagio(pipeline),
    comparativo_ano:comparativoAno,
    resumo:{
      FECHADOS_VALOR:somarModelo(fechados),FECHADOS_NEGOCIOS:fechados.length,FECHADOS_CLIENTES:contarClientesUnicosModelo(fechados),
      PENDENTES_VALOR:somarModelo(pendentes),PENDENTES_NEGOCIOS:pendentes.length,PENDENTES_CLIENTES:contarClientesUnicosModelo(pendentes),
      PIPELINE_VALOR:somarModelo(pipeline),PIPELINE_NEGOCIOS:pipeline.length,PIPELINE_CLIENTES:contarClientesUnicosModelo(pipeline),
      TICKET_MEDIO_FECHADOS:fechados.length?somarModelo(fechados)/fechados.length:0,
      MAIOR_FECHADO_VALOR:maiorFechado?maiorFechado.VALOR:0,MAIOR_FECHADO_CLIENTE:maiorFechado?maiorFechado.CLIENTE:"",
      CICLO_MEDIO_FECHADOS_DIAS:media(fechados,"CICLO_DIAS"),
      DIAS_MEDIO_PENDENTES:media(pendentes,"DIAS_NO_ESTAGIO"),DIAS_MEDIO_PIPELINE:media(pipeline,"DIAS_NO_ESTAGIO"),
      TOP_ORIGEM_LABEL:topOrigem?topOrigem[0]:"",TOP_ORIGEM_VALOR:topOrigem?topOrigem[1]:0
    }
  };
}

function renderBarModelo(rows,titulo="Visão geral por vendedor(a)",rotuloCampo="RESPONSAVEL") {
  if(!rows?.length)return `<p class="small-note">Sem dados no período.</p>`;
  const max=Math.max(1,...rows.map((x)=>x.VALOR||0)),cores=["#2a78d6","#eb6834","#1baf7a","#eda100","#e87ba4","#7254c7"];
  return `<div class="mini-chart"><div class="mini-chart-title">${escapeHtmlRelatorio(titulo)}</div>`+rows.map((x,i)=>`<div class="barrow"><div class="barlabel">${escapeHtmlRelatorio(x[rotuloCampo])}</div><div class="bartrack"><div class="barfill valor-pisca" style="width:${Math.max(2,(x.VALOR/max)*100).toFixed(1)}%;background:${cores[i%cores.length]}"></div></div><div class="barvalue valor-pisca">${moedaRelatorio(x.VALOR)}</div></div>`).join("")+`</div>`;
}
// v24 — donut de composição (SVG puro, stroke-dasharray por fatia) usado no
// gráfico "Fechados × Pendentes × Pipeline" da Visão Geral.
function donutComposicaoModelo(fatias) {
  const total=fatias.reduce((a,f)=>a+(f.valor||0),0);
  if(total<=0)return `<p class="small-note">Sem valores para compor o gráfico.</p>`;
  const r=42,c=2*Math.PI*r;let acumulado=0;
  const arcos=fatias.map((f)=>{
    const frac=f.valor/total,dash=frac*c;
    const arco=`<circle cx="60" cy="60" r="${r}" class="donut-fatia valor-pisca" style="stroke:${f.cor};stroke-dasharray:${dash.toFixed(1)} ${(c-dash).toFixed(1)};stroke-dashoffset:${(-acumulado).toFixed(1)}"><title>${escapeHtmlRelatorio(f.rotulo)}: ${moedaRelatorio(f.valor)} (${Math.round(frac*1000)/10}%)</title></circle>`;
    acumulado+=dash;return arco;
  }).join("");
  const legenda=fatias.map((f)=>`<span><i class="trend-dot" style="background:${f.cor}"></i>${escapeHtmlRelatorio(f.rotulo)} · ${moedaRelatorio(f.valor)} (${Math.round((f.valor/total)*1000)/10}%)</span>`).join("");
  return `<div class="donut-box"><svg viewBox="0 0 120 120" class="donut-svg" role="img" aria-label="Composição do forecast">${arcos}<text x="60" y="65" text-anchor="middle" class="donut-total">${moedaRelatorio(total).replace(",00","")}</text></svg><div class="donut-legend">${legenda}</div></div>`;
}
function cardForecastModelo(x,tipo,dominio) {
  const badge=tipo==="fechado"?"s-won":tipo==="pendente"?"s-pend":"s-2";
  let txt=`Nesta etapa desde ${x.DATA_MOVIMENTO_BR||"—"}`;
  if(tipo==="fechado")txt=`Assinado em ${x.DATA_MOVIMENTO_BR||"—"}`;
  if(tipo==="pendente")txt=`Aguardando assinatura ${x.DIAS_NO_ESTAGIO===0?"hoje":`há ${x.DIAS_NO_ESTAGIO} dia(s)`} (desde ${x.DATA_MOVIMENTO_BR||"—"})`;
  // v20 — link direto pro negócio no Bitrix (drill-down): usa só o domínio do
  // webhook (sem token) + ID do negócio, nunca a credencial.
  const linkBitrix=dominio&&x.DEAL_ID?`<a class="ccard-abrir" href="https://${dominio}/crm/deal/details/${encodeURIComponent(x.DEAL_ID)}/" target="_blank" rel="noopener noreferrer">Abrir no Bitrix ↗</a>`:"";
  // v24 — mais dados de linha do tempo do negócio: quando entrou (criação),
  // etapa/fechamento atual (já existia) e o ciclo entre as duas datas.
  const entrada=x.DATA_CRIACAO_BR?`<span>📥 Entrou em ${escapeHtmlRelatorio(x.DATA_CRIACAO_BR)}</span>`:"";
  const ciclo=x.CICLO_DIAS!==""&&x.CICLO_DIAS!=null?`<span>⏱ Ciclo: ${x.CICLO_DIAS} dia(s)</span>`:"";
  return `<div class="ccard" data-vendedor="${escapeHtmlRelatorio(x.RESPONSAVEL)}"><div class="ccard-top"><span class="stage-badge ${badge}">${escapeHtmlRelatorio(x.ESTAGIO)}</span><span class="ccard-value valor-pisca">${moedaRelatorio(x.VALOR)}</span></div><div class="ccard-name">${escapeHtmlRelatorio(x.CLIENTE)}</div><div class="ccard-meta"><span>👤 ${escapeHtmlRelatorio(x.RESPONSAVEL)}</span><span>🎯 ${escapeHtmlRelatorio(x.ORIGEM)}</span>${entrada}${ciclo}</div><div class="ccard-date">${txt}</div>${linkBitrix}</div>`;
}
function mesesForecastModelo(rows,tipo,porEtapa=false,dominio) {
  const grupos=agruparPorModelo(rows,(x)=>x.MES_CHAVE||"sem-data"),keys=Object.keys(grupos).sort().reverse();
  return keys.map((k)=>{
    const a=grupos[k],label=a[0]?.MES_LABEL||"Sem data",stats=`${a.length} negócio(s) · ${contarClientesUnicosModelo(a)} cliente(s) · ${moedaRelatorio(somarModelo(a))}`;
    let body="";
    if(porEtapa){
      const st=agruparPorModelo(a,(x)=>x.ESTAGIO||"Sem etapa");
      body=`<div class="stage-list">`+Object.entries(st).map(([nome,r])=>`<details class="vcard stage-card"><summary><span class="stage-badge s-2">${escapeHtmlRelatorio(nome)}</span><span class="vcard-stats">${r.length} negócio(s) · ${contarClientesUnicosModelo(r)} cliente(s) · ${moedaRelatorio(somarModelo(r))}</span><span class="vcard-chevron">▾</span></summary><div class="vcard-body"><div class="cgrid">${r.map((x)=>cardForecastModelo(x,tipo,dominio)).join("")}</div></div></details>`).join("")+`</div>`;
    } else body=`<div class="cgrid">${a.map((x)=>cardForecastModelo(x,tipo,dominio)).join("")}</div>`;
    return `<details class="vcard month-card"><summary><span class="vcard-name">🗓️ ${escapeHtmlRelatorio(label)}</span><span class="vcard-stats">${stats}</span><span class="vcard-chevron">▾</span></summary><div class="vcard-body">${body}</div></details>`;
  }).join("")||`<p class="small-note">Nenhum registro encontrado.</p>`;
}
function gerarHTMLForecastModelo(resultado,tipo="semanal") {
  const r=resultado?.modelo_visual;if(!r)return "";
  const marca=marcaAtiva();
  const periodo=tipo==="mensal"?mesAnoBR(r.periodo_fim):`${formatarDataBR(r.periodo_inicio)} a ${formatarDataBR(r.periodo_fim)}`;
  const metaMensal=tipo==="semanal"?(Number(resultado?.meta?.meta_mensal)||0):(Number(resultado?.meta_visual)||0);
  // v21 — "Entregue" no card de Meta Mensal usa a MESMA base da seção "✅
  // Fechados" (r.resumo.FECHADOS_VALOR: negócios no Financeiro na etapa
  // "Contrato assinado"), em vez de resumo.FECHADO(_MES) — um cálculo mais
  // simples (só o funil Comercial marcado como ganho) que produzia um valor
  // bem menor e divergente do que a própria seção "Fechados" já mostrava,
  // confundindo quem olhava os dois números lado a lado. O pipeline
  // ponderado (independente dessa base) continua somado por cima para
  // formar a projeção final.
  const realizadoMesBase=tipo==="semanal"?(Number(resultado?.resumo?.FECHADO_MES)||0):(Number(resultado?.resumo?.FECHADO)||0);
  const projecaoMesBase=tipo==="semanal"?(Number(resultado?.resumo?.FORECAST_MES_TOTAL)||0):(Number(resultado?.resumo?.FORECAST_TOTAL)||0);
  const pipelinePonderadoMesDelta=Math.max(0,projecaoMesBase-realizadoMesBase);
  const realizadoMes=Number(r.resumo.FECHADOS_VALOR)||0;
  const projecaoMes=realizadoMes+pipelinePonderadoMesDelta;
  const stats=(n,c)=>`${n} negócio(s) · ${c} cliente(s)`;
  // v18 — meta mensal em cards separados na Visão geral (Meta / Entregue / Gap),
  // recalculados a cada extração/dia a partir do fechado e do pipeline aberto
  // ponderado do mês.
  // v25 — removido o banner de alerta "Projeção do mês está abaixo/no caminho
  // da meta" (pedido explícito): a mesma informação já aparece nos cards
  // Meta/Entregue/Gap logo abaixo, sem duplicar o aviso.
  const metaBatida=metaMensal>0&&realizadoMes>=metaMensal;
  const metaNoCaminho=metaBatida||(metaMensal>0&&projecaoMes>=metaMensal);
  const gapMeta=Math.max(0,metaMensal-realizadoMes);
  const cardsMeta=!metaMensal
    ?`<div class="kpi kpi-clickable"><div class="label">Meta Mensal</div><div class="value valor-pisca">A definir</div><div class="small">Meta não informada</div></div>`
    :`<div class="kpi kpi-clickable"><div class="label">Meta Mensal → <span class="info-tip" data-tip="Meta comercial do mês, editável antes da extração.">i</span></div><div class="value valor-pisca">${moedaRelatorio(metaMensal)}</div><div class="small">Projeção: ${moedaRelatorio(projecaoMes)}</div></div>`+
      `<div class="kpi ${metaNoCaminho?"good":"warn"} kpi-clickable"><div class="label">Entregue → <span class="info-tip" data-tip="Fechado no mês (contrato assinado).">i</span></div><div class="value valor-pisca">${moedaRelatorio(realizadoMes)}</div><div class="small">${metaNoCaminho?"No caminho da meta":"Abaixo da meta"}</div></div>`+
      `<div class="kpi ${metaBatida?"good":"warn"} kpi-clickable"><div class="label">Gap para a meta</div><div class="value valor-pisca">${metaBatida?"Meta batida":moedaRelatorio(gapMeta)}</div><div class="small">${metaBatida?"":"Falta para bater a meta"}</div></div>`;
  const semCloseDate=Number(resultado?.resumo?.SEM_CLOSEDATE_QTD)||0;
  const closeDateVencida=Number(resultado?.resumo?.CLOSEDATE_VENCIDA_QTD)||0;
  const alertaHigiene=(semCloseDate+closeDateVencida)<=0?"":`<div class="alert-banner warn"><span class="icon">🧹</span><span>${semCloseDate?`${semCloseDate} negócio(s) sem CLOSEDATE`:""}${semCloseDate&&closeDateVencida?" e ":""}${closeDateVencida?`${closeDateVencida} com CLOSEDATE vencida`:""} — vale revisar antes de fechar o mês.</span></div>`;
  const badgePendentes=r.resumo.PENDENTES_NEGOCIOS>0?`<span class="badge-ping" title="${r.resumo.PENDENTES_NEGOCIOS} negócio(s) aguardando assinatura">${r.resumo.PENDENTES_NEGOCIOS}</span>`:"";
  const popupMetodologia=`<div class="popup-overlay" id="popupInfo" onclick="if(event.target===this)fecharPopupInfo()"><div class="popup-box"><button type="button" class="popup-close" onclick="fecharPopupInfo()" aria-label="Fechar">✕</button><h3>Como este relatório é calculado</h3><p><b>Negócios ≠ clientes:</b> os cartões mostram as duas contagens separadamente — 31 negócios podem ser de 20 clientes diferentes.</p><p><b>Pendentes Assinatura / Pipeline Aberto:</b> só entram negócios parados na etapa atual há no máximo 60 dias, sem estágios "Piloto".</p><p><b>Projeção final do mês:</b> fechado no mês + pipeline aberto ponderado pela probabilidade de cada estágio — é recalculada a cada extração, evoluindo dia a dia.</p><p><b>Gap:</b> quanto falta do fechado até a meta mensal informada.</p></div></div>`;
  // v20 — tendência local (histórico neste navegador), drill-down direto pro
  // negócio no Bitrix e filtro por vendedor(a) nas listas de detalhe.
  const trendBox=sparklineHistoricoForecast(carregarHistoricoForecastLocal());
  const vendedoresUnicos=[...new Set([...r.fechados,...r.pendentes,...r.pipeline].map((x)=>x.RESPONSAVEL).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const filtroVendedorHtml=vendedoresUnicos.length?`<div class="filtro-vendedor-row"><label for="filtroVendedorRel">Filtrar por vendedor(a):</label><select id="filtroVendedorRel" onchange="filtrarRelatorioPorVendedor(this.value)"><option value="">Todos</option>${vendedoresUnicos.map((v)=>`<option value="${escapeHtmlRelatorio(v)}">${escapeHtmlRelatorio(v)}</option>`).join("")}</select><span id="filtroVendedorAviso" class="filtro-vendedor-aviso"></span></div>`:"";
  // v24 — seção "Análise": composição do forecast (donut), comparativo ano a
  // ano (reaproveita r.comparativo_ano, calculado sem chamada extra à API),
  // pipeline por estágio e um painel de estatísticas adicionais — tudo a
  // partir de dados que já vêm com o relatório, para deixar a análise mais
  // robusta sem custo extra de extração.
  const composicaoHtml=donutComposicaoModelo([
    {rotulo:"Fechados",valor:r.resumo.FECHADOS_VALOR,cor:"#1baf7a"},
    {rotulo:"Pendentes Assinatura",valor:r.resumo.PENDENTES_VALOR,cor:"#eda100"},
    {rotulo:"Pipeline Aberto",valor:r.resumo.PIPELINE_VALOR,cor:"#2a78d6"}
  ].filter((f)=>f.valor>0));
  const comp=r.comparativo_ano||{};
  const compMax=Math.max(1,comp.valorAtual||0,comp.valorAnoPassado||0);
  const compDeltaTxt=comp.deltaPct==null?"sem negócios fechados no mesmo período do ano passado para comparar":`${comp.deltaPct>=0?"+":""}${comp.deltaPct}% em relação a ${escapeHtmlRelatorio(comp.anoPassadoLabel||"ano passado")}`;
  const comparativoAnoHtml=(comp.valorAtual||comp.valorAnoPassado)?`<div class="mini-chart" style="margin:0;">`+
    `<div class="barrow"><div class="barlabel">${escapeHtmlRelatorio(comp.anoAtualLabel||"Este ano")}</div><div class="bartrack"><div class="barfill valor-pisca" style="width:${Math.max(2,(comp.valorAtual/compMax)*100).toFixed(1)}%;background:${marca.corPrimaria}"></div></div><div class="barvalue valor-pisca">${moedaRelatorio(comp.valorAtual)}</div></div>`+
    `<div class="barrow"><div class="barlabel">${escapeHtmlRelatorio(comp.anoPassadoLabel||"Ano passado")}</div><div class="bartrack"><div class="barfill valor-pisca" style="width:${Math.max(2,(comp.valorAnoPassado/compMax)*100).toFixed(1)}%;background:#8A8078"></div></div><div class="barvalue valor-pisca">${moedaRelatorio(comp.valorAnoPassado)}</div></div>`+
    `<div class="small-note" style="margin:8px 0 0;">${comp.negociosAtual||0} negócio(s) este ano · ${comp.negociosAnoPassado||0} no mesmo período do ano passado · <strong>${compDeltaTxt}</strong></div></div>`
    :`<p class="small-note">Sem negócios fechados no mesmo período do ano passado para comparar.</p>`;
  const pipelineEstagioHtml=renderBarModelo(r.pipeline_por_estagio||[],"Valor do pipeline aberto, por estágio","ESTAGIO");
  const statsAdicionaisHtml=`<div class="stats-grid">`+
    `<div class="stat-item"><span class="stat-label">Ticket médio (fechados)</span><span class="stat-valor valor-pisca">${moedaRelatorio(r.resumo.TICKET_MEDIO_FECHADOS)}</span></div>`+
    `<div class="stat-item"><span class="stat-label">Maior negócio fechado</span><span class="stat-valor valor-pisca">${moedaRelatorio(r.resumo.MAIOR_FECHADO_VALOR)}</span><span class="stat-sub">${escapeHtmlRelatorio(r.resumo.MAIOR_FECHADO_CLIENTE||"—")}</span></div>`+
    `<div class="stat-item"><span class="stat-label">Ciclo médio até fechar</span><span class="stat-valor valor-pisca">${r.resumo.CICLO_MEDIO_FECHADOS_DIAS||0} dia(s)</span></div>`+
    `<div class="stat-item"><span class="stat-label">Dias médios parado · Pendentes</span><span class="stat-valor valor-pisca">${r.resumo.DIAS_MEDIO_PENDENTES||0} dia(s)</span></div>`+
    `<div class="stat-item"><span class="stat-label">Dias médios parado · Pipeline</span><span class="stat-valor valor-pisca">${r.resumo.DIAS_MEDIO_PIPELINE||0} dia(s)</span></div>`+
    `<div class="stat-item"><span class="stat-label">Melhor origem (fechados)</span><span class="stat-valor valor-pisca">${moedaRelatorio(r.resumo.TOP_ORIGEM_VALOR)}</span><span class="stat-sub">${escapeHtmlRelatorio(r.resumo.TOP_ORIGEM_LABEL||"—")}</span></div>`+
    `</div>`;
  const secaoAnaliseHtml=`<h2 class="section">📊 Análise</h2><p class="section-sub">Composição do forecast, comparativo com o ano anterior, pipeline por estágio e estatísticas adicionais.</p>`+
    `<div class="analise-grid">`+
    `<div class="vcard analise-card"><div class="analise-card-titulo">🥧 Composição do forecast</div>${composicaoHtml}</div>`+
    `<div class="vcard analise-card"><div class="analise-card-titulo">📅 Comparativo ano a ano</div>${comparativoAnoHtml}</div>`+
    `<div class="vcard analise-card"><div class="analise-card-titulo">🧭 Pipeline por estágio</div>${pipelineEstagioHtml}</div>`+
    `<div class="vcard analise-card analise-card-wide"><div class="analise-card-titulo">🔎 Estatísticas adicionais</div>${statsAdicionaisHtml}</div>`+
    `</div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Forecast Comercial — ${escapeHtmlRelatorio(periodo)} · ${escapeHtmlRelatorio(marca.nome)}</title><style>${modeloExecutivoCssParaMarca(marca)}</style></head><body>`+
  `<div class="letterhead"><div class="letterhead-inner"><div class="letterhead-brand">${marca.logoSvg}<div class="letterhead-divider"></div><div class="letterhead-tagline">${escapeHtmlRelatorio(marca.tagline)}</div></div><div class="letterhead-ref"><strong>Relatório Comercial</strong><br>Extraído do Bitrix24 em ${formatarDataBR(formatarDataISO(new Date()))}</div></div></div>`+
  `<header class="hero"><div class="hero-inner"><p class="eyebrow">Relatório Comercial · Bitrix24</p><h1>Forecast Comercial — ${escapeHtmlRelatorio(periodo)}</h1><p class="subtitle">Fechados, pendentes de assinatura e pipeline aberto, preenchidos automaticamente pelo extrator.</p></div></header>`+
  `<div class="wrap"><div class="overview-panel" id="visao-geral"><h2 class="section" style="margin-top:0;">Visão geral<button type="button" class="btn-info-flutuante" onclick="abrirPopupInfo()" title="Como esses números são calculados">i</button></h2>`+
  alertaHigiene+
  `<div class="kpis">`+
  `<div class="kpi good kpi-clickable" onclick="abrirDetalhe('detail-fechados')"><div class="label">Fechados → <span class="info-tip" data-tip="Negócios com contrato assinado dentro do período selecionado.">i</span></div><div class="value valor-pisca">${moedaRelatorio(r.resumo.FECHADOS_VALOR)}</div><div class="small">${stats(r.resumo.FECHADOS_NEGOCIOS,r.resumo.FECHADOS_CLIENTES)}</div></div>`+
  `<div class="kpi warn kpi-clickable" onclick="abrirDetalhe('detail-pendentes')">${badgePendentes}<div class="label">Pendentes Assinatura → <span class="info-tip" data-tip="Negócios aguardando assinatura, parados há no máximo 60 dias.">i</span></div><div class="value valor-pisca">${moedaRelatorio(r.resumo.PENDENTES_VALOR)}</div><div class="small">${stats(r.resumo.PENDENTES_NEGOCIOS,r.resumo.PENDENTES_CLIENTES)}</div></div>`+
  `<div class="kpi kpi-clickable" onclick="abrirDetalhe('detail-forecast')"><div class="label">Pipeline Aberto → <span class="info-tip" data-tip="Negócios em aberto no funil Comercial, sem estágios Piloto, parados há no máximo 60 dias.">i</span></div><div class="value valor-pisca">${moedaRelatorio(r.resumo.PIPELINE_VALOR)}</div><div class="small">${stats(r.resumo.PIPELINE_NEGOCIOS,r.resumo.PIPELINE_CLIENTES)}</div></div>`+
  `${cardsMeta}</div>`+
  trendBox+
  `</div>`+
  `<div class="note"><b>Negócios ≠ clientes</b>O relatório mostra as duas contagens separadamente. Assim, se existirem 31 negócios de 20 clientes, você verá 31 negócios e 20 clientes.</div>`+
  secaoAnaliseHtml+
  `<h2 class="section">Fechados, Pendentes e Pipeline Aberto</h2><p class="section-sub">Mesma lógica visual do modelo fornecido, agora abastecida diretamente pelo Bitrix. Pendentes Assinatura e Pipeline Aberto mostram só negócios parados na etapa atual há até 60 dias, sem estágios "Piloto".</p>`+
  filtroVendedorHtml+
  `<div class="top3grid">`+
  `<details class="vcard section-card" id="detail-fechados"><summary><span class="vcard-name">✅ Fechados</span><span class="vcard-stats">${stats(r.resumo.FECHADOS_NEGOCIOS,r.resumo.FECHADOS_CLIENTES)} · ${moedaRelatorio(r.resumo.FECHADOS_VALOR)}</span><span class="vcard-chevron">▾</span></summary><div class="vcard-body">${renderBarModelo(r.vendedores_fechados)}<div class="cgrid">${r.fechados.map((x)=>cardForecastModelo(x,"fechado",r.dominio)).join("")}</div></div></details>`+
  `<details class="vcard section-card" id="detail-pendentes"><summary><span class="vcard-name">⏳ Pendentes Assinatura</span><span class="vcard-stats">${stats(r.resumo.PENDENTES_NEGOCIOS,r.resumo.PENDENTES_CLIENTES)} · ${moedaRelatorio(r.resumo.PENDENTES_VALOR)}</span><span class="vcard-chevron">▾</span></summary><div class="vcard-body"><div class="month-list">${mesesForecastModelo(r.pendentes,"pendente",false,r.dominio)}</div></div></details>`+
  `<details class="vcard section-card" id="detail-forecast"><summary><span class="vcard-name">📈 Pipeline Aberto — Forecast</span><span class="vcard-stats">${stats(r.resumo.PIPELINE_NEGOCIOS,r.resumo.PIPELINE_CLIENTES)} · ${moedaRelatorio(r.resumo.PIPELINE_VALOR)}</span><span class="vcard-chevron">▾</span></summary><div class="vcard-body">${renderBarModelo(r.vendedores_pipeline)}<div class="month-list">${mesesForecastModelo(r.pipeline,"pipeline",true,r.dominio)}</div></div></details>`+
  `</div><a class="back-to-overview" href="#visao-geral">↑ Voltar à Visão geral</a></div><footer><div class="footer-brand">${marca.logoSvg}<span>${escapeHtmlRelatorio(marca.nome)}</span></div>${escapeHtmlRelatorio(marca.nome)} · Forecast Comercial</footer>`+
  popupMetodologia+
  `<script>function abrirDetalhe(id){var e=document.getElementById(id);if(!e)return;e.open=true;var n=e.querySelectorAll('details');for(var i=0;i<n.length;i++)n[i].open=true;e.scrollIntoView({behavior:'smooth',block:'start'});}function abrirPopupInfo(){var e=document.getElementById('popupInfo');if(e)e.classList.add('aberto');}function fecharPopupInfo(){var e=document.getElementById('popupInfo');if(e)e.classList.remove('aberto');}document.addEventListener('keydown',function(ev){if(ev.key==='Escape')fecharPopupInfo();});function filtrarRelatorioPorVendedor(nome){var cards=document.querySelectorAll('.ccard[data-vendedor]');cards.forEach(function(c){c.style.display=(!nome||c.dataset.vendedor===nome)?'':'none';});var grupos=document.querySelectorAll('.month-card, .stage-card');grupos.forEach(function(g){var visiveis=Array.prototype.slice.call(g.querySelectorAll('.ccard')).some(function(c){return c.style.display!=='none';});g.style.display=visiveis?'':'none';});var aviso=document.getElementById('filtroVendedorAviso');if(aviso)aviso.textContent=nome?('Mostrando apenas negócios de: '+nome):'';}<\/script></body></html>`;
}
function abrirRelatorioVisualForecast(){const h=gerarHTMLForecastModelo(resultadoForecastSemanal,"semanal");if(h)mostrarRelatorioVisualInline(h,"Forecast Semanal — Comercial");}
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

    atualizarStatus(`Forecast: montando modelo executivo ${marcaAtiva().nome}...`);
    const modeloVisualForecast = await construirDadosModeloForecast(webhook, meta, inicio, fim, deals);

    // v21 — grava a "foto" de hoje no histórico local (ver js/jornada.js) já com
    // o "fechado" recalculado a partir de modeloVisualForecast.resumo.FECHADOS_VALOR
    // (mesma base da seção "✅ Fechados" do relatório visual: negócios no
    // Financeiro em "Contrato assinado"), em vez de fechadoMes (só o funil
    // Comercial marcado como ganho) — pra a tendência não repetir a mesma
    // divergência corrigida em gerarHTMLForecastModelo().
    if (metaMensal > 0) {
      const fechadoConsistente = Number(modeloVisualForecast?.resumo?.FECHADOS_VALOR) || 0;
      const pipelinePonderadoDelta = Math.max(0, forecastMesTotal - fechadoMes);
      salvarHistoricoForecastLocal({ data: hojeISO, metaMensal, fechadoMes: fechadoConsistente, projecaoMes: fechadoConsistente + pipelinePonderadoDelta });
    }

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
    ["Fechado na semana", moedaRelatorio(r.resumo.FECHADO_SEMANA), "forecastNegociosTabela"],
    ["Fechado no mês", moedaRelatorio(r.resumo.FECHADO_MES), "forecastNegociosTabela"],
    ["Forecast total (semana)", moedaRelatorio(r.resumo.FORECAST_TOTAL), "forecastNegociosTabela"],
    ["Forecast total (mês)", moedaRelatorio(r.resumo.FORECAST_MES_TOTAL), "forecastNegociosTabela"],
    ["Commit", moedaRelatorio(r.resumo.COMMIT), "forecastNegociosTabela"],
    ["Best Case", moedaRelatorio(r.resumo.BEST_CASE), "forecastNegociosTabela"],
    ["Pipeline", moedaRelatorio(r.resumo.PIPELINE), "forecastNegociosTabela"],
    // v17 — meta mensal ao lado do Pipeline, só o número da meta.
    ["Meta mensal", r.meta.meta_mensal ? moedaRelatorio(r.meta.meta_mensal) : "não informada"],
    ["Abertos previstos", r.resumo.ABERTOS_PREVISTOS_SEMANA, "forecastNegociosTabela"],
    ["Sem CLOSEDATE", r.resumo.SEM_CLOSEDATE_QTD, "forecastHigieneTabela"]
  ];
  document.getElementById("forecastKpis").innerHTML = kpis.map(([rotulo, valor, alvo]) => kpiCardHtml(rotulo, valor, alvo)).join("");

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

