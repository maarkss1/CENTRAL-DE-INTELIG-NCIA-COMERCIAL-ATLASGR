// Portal multi-página: nem toda página tem o motor genérico de extração (ex:
// index.html, cockpit.html não têm #entidade/#relatorio; forecast.html/sdr.html
// têm os selects, mas escondidos, e nunca a busca de produtos). iniciar() é
// chamado em todas as páginas (ver js/app.js) — cada bloco abaixo só roda se os
// elementos de que depende existem nesta página, pra não quebrar em nenhuma.
function iniciar() {
  const selEntidade = document.getElementById("entidade");
  const selRelatorio = document.getElementById("relatorio");
  if (selEntidade && selRelatorio) {
    ["negocios","leads","empresas","contatos","atividades","usuarios","tudo"].forEach((chave) => {
      const opt = document.createElement("option");
      opt.value = chave;
      opt.textContent = ENTIDADES[chave].label;
      selEntidade.appendChild(opt);
    });

    const grupos = {};
    Object.entries(RELATORIOS).forEach(([chave, rel]) => {
      if (!grupos[rel.grupo]) {
        grupos[rel.grupo] = document.createElement("optgroup");
        grupos[rel.grupo].label = rel.grupo;
        selRelatorio.appendChild(grupos[rel.grupo]);
      }
      const opt = document.createElement("option");
      opt.value = chave;
      opt.textContent = rel.label;
      grupos[rel.grupo].appendChild(opt);
    });

    aoTrocarEntidade(false);
  }

  if (document.getElementById("campos-produtos-contexto")) construirCamposProdutosUI();
  atualizarIconeTema();
}

// Alterna claro/escuro. A escolha fica salva em localStorage (preferência de UI,
// não é credencial. O webhook só persiste quando o usuário solicita explicitamente).
function alternarTema() {
  const atual = document.documentElement.getAttribute("data-tema");
  const novo = atual === "escuro" ? "claro" : "escuro";
  document.documentElement.setAttribute("data-tema", novo);
  try {
    localStorage.setItem("atlas-extrator-tema", novo);
  } catch (e) {
    // localStorage indisponível (modo privado, etc.) — tema só não persiste entre sessões.
  }
  atualizarIconeTema();
}

function atualizarIconeTema() {
  const btn = document.getElementById("btnTema");
  if (!btn) return;
  const escuro = document.documentElement.getAttribute("data-tema") === "escuro";
  btn.textContent = escuro ? "☀️" : "🌙";
  btn.title = escuro ? "Mudar para tema claro" : "Mudar para tema escuro";
}

function construirCamposProdutosUI() {
  const montarGrupo = (containerId, lista) => {
    const cont = document.getElementById(containerId);
    cont.innerHTML = "";
    lista.forEach((c) => {
      const div = document.createElement("div");
      div.className = "campo-item";
      const id = "campoprod_" + c.code;
      div.innerHTML = `<input type="checkbox" id="${id}" value="${c.code}" ${c.padrao ? "checked" : ""}><label for="${id}" style="margin:0; font-size:13px; color:var(--texto);">${c.label} <span style="color:var(--texto-suave); font-size:11px;">(${c.code})</span></label>`;
      cont.appendChild(div);
    });
  };
  montarGrupo("campos-produtos-contexto", CAMPOS_CONTEXTO_PRODUTO);
  montarGrupo("campos-produtos-bitrix", CAMPOS_PRODUTO_BITRIX);
}

function selecionarCamposProdutos(marcar) {
  document
    .querySelectorAll("#campos-produtos-contexto input[type=checkbox], #campos-produtos-bitrix input[type=checkbox]")
    .forEach((i) => { i.checked = marcar; });
}

function camposProdutosSelecionados() {
  const marcados = Array.from(
    document.querySelectorAll("#campos-produtos-contexto input[type=checkbox]:checked, #campos-produtos-bitrix input[type=checkbox]:checked")
  ).map((i) => i.value);
  const extras = document.getElementById("camposProdutosExtra").value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...marcados, ...extras])];
}

function esconderNotasRelatorios() {
  ["nota-jornada","nota-forecast","nota-diario-sdr","nota-analise-sdr","nota-relatorio-catalogo"]
    .forEach((id) => document.getElementById(id)?.classList.add("oculto"));
}

function aoTrocarEntidade(limparRelatorio = false) {
  if (limparRelatorio) document.getElementById("relatorio").value = "";

  const chave = document.getElementById("entidade").value;
  const ent = ENTIDADES[chave];
  esconderNotasRelatorios();
  document.getElementById("nota-tudo").classList.toggle("oculto", chave !== "tudo");
  document.getElementById("card-campos").classList.toggle("oculto", !!ent.especial);
  document.getElementById("linha-campo-data").classList.toggle("oculto", !!ent.especial);

  if (ent.especial) {
    ["bloco-categoria","bloco-estagio","bloco-vendedor","bloco-origem","bloco-campo-personalizado"]
      .forEach((id)=>document.getElementById(id).classList.add("oculto"));
    document.getElementById("bloco-periodo").classList.remove("oculto");
    return;
  }

  document.getElementById("bloco-vendedor").classList.toggle("oculto", !["negocios","atividades","leads"].includes(chave));
  document.getElementById("bloco-origem").classList.toggle("oculto", !["negocios","leads"].includes(chave));
  document.getElementById("bloco-campo-personalizado").classList.toggle("oculto", chave !== "negocios");

  const labelVendedor = document.querySelector('label[for="vendedor"]');
  if (labelVendedor) labelVendedor.textContent = chave === "atividades" ? "Responsável pela atividade" : "Vendedor / Responsável";

  document.getElementById("bloco-categoria").classList.toggle("oculto", !ent.hasCategoria);
  if (ent.hasCategoria) {
    const selCat = document.getElementById("categoria");
    selCat.innerHTML = "";
    ent.categorias.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.code;
      opt.textContent = c.label;
      selCat.appendChild(opt);
    });
    aoTrocarCategoria();
  } else {
    montarEstagios(ent.estagios || null, ent.campoEstagio || "STATUS_ID");
  }

  document.getElementById("bloco-periodo").classList.toggle("oculto", !!ent.semFiltroData);
  const selData = document.getElementById("campoData");
  selData.innerHTML = "";
  (ent.camposData || []).forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.code;
    opt.textContent = c.label;
    selData.appendChild(opt);
  });
  if (!ent.camposData?.length) document.getElementById("linha-campo-data").classList.add("oculto");
  renderizarListaCampos(ent.campos || []);
  if (typeof atualizarResumoConfiguracaoV7 === "function") atualizarResumoConfiguracaoV7();
}

function aoTrocarRelatorio() {
  const chave = document.getElementById("relatorio").value;
  if (!chave) {
    aoTrocarEntidade(false);
    return;
  }

  const rel = RELATORIOS[chave];
  esconderNotasRelatorios();
  document.getElementById("nota-tudo").classList.add("oculto");
  document.getElementById("card-campos").classList.add("oculto");
  document.getElementById("linha-campo-data").classList.add("oculto");
  ["bloco-categoria","bloco-estagio","bloco-vendedor","bloco-origem","bloco-campo-personalizado"]
    .forEach((id)=>document.getElementById(id).classList.add("oculto"));
  document.getElementById("bloco-periodo").classList.remove("oculto");

  if (rel.handler === "jornada") document.getElementById("nota-jornada").classList.remove("oculto");
  else if (rel.handler === "forecast_semanal") document.getElementById("nota-forecast").classList.remove("oculto");
  else if (rel.handler === "diario_sdr") document.getElementById("nota-diario-sdr").classList.remove("oculto");
  else if (rel.handler === "analise_sdr") document.getElementById("nota-analise-sdr").classList.remove("oculto");
  else {
    document.getElementById("nota-relatorio-catalogo").classList.remove("oculto");
    document.getElementById("relatorioCatalogoTitulo").textContent = rel.label;
    document.getElementById("relatorioCatalogoDescricao").textContent = rel.descricao;
    document.getElementById("configMetaComercial").classList.toggle("oculto", !rel.meta);
    document.getElementById("configSlaAging").classList.toggle("oculto", !rel.slaAging);
    document.getElementById("configSlaPrimeiroContato").classList.toggle("oculto", !rel.slaPrimeiroContato);
    document.getElementById("configDiasEstagnacaoSDR").classList.toggle("oculto", !rel.diasEstagnacao);
  }

  aplicarPeriodoRelatorioEspecial(chave);
  if (typeof atualizarResumoConfiguracaoV7 === "function") atualizarResumoConfiguracaoV7();
}


// útil quando a lista completa (passo 4, botão "Carregar todos os campos")
// traz dezenas de campos UF_CRM_* customizados.
function aplicarFiltroCampos() {
  const campoFiltro = document.getElementById("filtroCampos");
  if (!campoFiltro) return;
  const filtro = campoFiltro.value.trim().toLowerCase();
  document.querySelectorAll("#campos-lista .campo-item").forEach((div) => {
    const texto = div.textContent.toLowerCase();
    div.style.display = !filtro || texto.includes(filtro) ? "" : "none";
  });
}

// Busca, diretamente no Bitrix do usuário, TODOS os campos existentes para a
// entidade selecionada (crm.deal.fields / crm.lead.fields / crm.company.fields /
// crm.contact.fields) — inclusive campos personalizados UF_CRM_* criados na
// conta, que a lista curada acima não tem como prever. Mesma lógica já usada em
// buscarCamposDinamicos() para a "Extração completa", mas aqui guardando também
// o rótulo (title/listLabel/formLabel) que o Bitrix devolve para cada campo.
async function carregarTodosCampos() {
  const webhook = document.getElementById("webhook").value.trim();
  const erro = validarWebhook(webhook);
  if (erro) {
    mostrarErro(erro);
    return;
  }
  const chave = document.getElementById("entidade").value;
  const ent = ENTIDADES[chave];
  if (!ent.fieldsMethod) {
    mostrarErro("O Bitrix não expõe uma lista dinâmica de campos para esta entidade — use os campos já listados no passo 4 (mais os campos extras, se souber o código).");
    return;
  }

  esconderErro();
  const btn = document.getElementById("btnCarregarCampos");
  btn.disabled = true;
  atualizarStatus(`Carregando todos os campos de "${ent.label}" disponíveis no seu Bitrix...`);
  try {
    const url = `${webhook.replace(/\/$/, "")}/${ent.fieldsMethod}.json`;
    const body = await bitrixFetchComRetentativa(url);
    const camposBitrix = body.result || {};

    const marcadosAntes = new Set(camposSelecionados());
    const padroesConhecidos = new Set(ent.campos.filter((c) => c.padrao).map((c) => c.code));
    const rotulosConhecidos = {};
    ent.campos.forEach((c) => { rotulosConhecidos[c.code] = c.label; });

    const lista = Object.keys(camposBitrix)
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .map((code) => {
        const meta = camposBitrix[code] || {};
        const rotuloBitrix = meta.title || meta.listLabel || meta.formLabel || meta.filterLabel;
        return {
          code,
          label: rotulosConhecidos[code] || rotuloBitrix || code,
          padrao: marcadosAntes.has(code) || padroesConhecidos.has(code),
        };
      });

    camposCompletosCache[chave] = lista;
    renderizarListaCampos(lista);
    document.getElementById("notaCamposCarregados").textContent =
      `${lista.length} campos carregados diretamente do seu Bitrix (incluindo campos personalizados UF_CRM_*).`;
    atualizarStatus(`${lista.length} campos carregados para "${ent.label}".`);
  } catch (e) {
    mostrarErro(
      "Não consegui carregar a lista completa de campos.\n\nDetalhe técnico: " + e.message + "\n\n" +
      "Se o erro for de permissão, o webhook precisa de acesso de leitura a " + ent.fieldsMethod +
      " (categoria \"CRM\" nas permissões do webhook de entrada no Bitrix)."
    );
  } finally {
    btn.disabled = false;
  }
}

function aoTrocarCategoria() {
  const chaveEnt = document.getElementById("entidade").value;
  const ent = ENTIDADES[chaveEnt];
  const cat = document.getElementById("categoria").value;
  const estagios = (ent.estagiosPorCategoria && ent.estagiosPorCategoria[cat]) || null;
  montarEstagios(estagios, "STAGE_ID");
}

function montarEstagios(lista, campoEstagio) {
  const bloco = document.getElementById("bloco-estagio");
  const sel = document.getElementById("estagio");
  sel.innerHTML = "";
  sel.dataset.campo = campoEstagio;
  if (!lista) {
    bloco.classList.add("oculto");
    return;
  }
  bloco.classList.remove("oculto");
  const optTodos = document.createElement("option");
  optTodos.value = "";
  optTodos.textContent = "Todos os estágios";
  sel.appendChild(optTodos);
  lista.forEach((e) => {
    if (e.code === "") return; // já cobrimos "todos" acima
    const opt = document.createElement("option");
    opt.value = e.code;
    opt.textContent = e.label;
    sel.appendChild(opt);
  });
}

function atualizarRelogioTopo(){
  const agora=new Date();
  const data=agora.toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo",weekday:"long",day:"2-digit",month:"long",year:"numeric"});
  const hora=agora.toLocaleTimeString("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit",second:"2-digit"});
  const d=document.getElementById("dataAtualTopo"),h=document.getElementById("horaAtualTopo");
  if(d)d.textContent=data.charAt(0).toUpperCase()+data.slice(1);
  if(h)h.textContent=`${hora} · São Paulo / Brasília (UTC−03)`;
}

function marcarConexaoPendente(){
  const p=document.getElementById("statusConexaoTopo");if(!p)return;
  p.classList.remove("ok","erro");document.getElementById("statusConexaoTexto").textContent="Conexão não testada";
}

async function testarConexaoBitrix(){
  const webhook=document.getElementById("webhook").value.trim(),err=validarWebhook(webhook),pill=document.getElementById("statusConexaoTopo"),txt=document.getElementById("statusConexaoTexto");
  if(err){pill?.classList.remove("ok");pill?.classList.add("erro");if(txt)txt.textContent="Webhook inválido";mostrarErro(err);return false;}
  try{
    if(txt)txt.textContent="Testando...";
    const url=montarUrl(webhook,"crm.deal.list",["ID"],{},0,{ID:"ASC"});
    await bitrixFetchComRetentativa(url);
    pill?.classList.remove("erro");pill?.classList.add("ok");if(txt)txt.textContent="Bitrix conectado";
    atualizarStatus("Conexão com o Bitrix validada com sucesso.");return true;
  }catch(e){pill?.classList.remove("ok");pill?.classList.add("erro");if(txt)txt.textContent="Falha na conexão";mostrarErro("Não foi possível validar a conexão.\n\n"+e.message);return false;}
}

function abrirAjuda(chave){
  const a=AJUDAS_UI[chave]||{titulo:"Ajuda",html:"<p>Sem descrição disponível.</p>"};
  document.getElementById("helpTitulo").textContent=a.titulo;document.getElementById("helpConteudo").innerHTML=a.html;document.getElementById("helpModal").classList.add("aberto");
}
function fecharAjuda(){document.getElementById("helpModal")?.classList.remove("aberto")}
function fecharAjudaPorFundo(e){if(e.target?.id==="helpModal")fecharAjuda()}

document.addEventListener("keydown",(e)=>{if(e.key==="Escape")fecharAjuda()});

function ativarAcordeoesExtrator(){
  document.querySelectorAll("main .card").forEach((card,idx)=>{
    const h=card.querySelector(":scope > h2");if(!h||h.querySelector(".card-toggle"))return;
    const btn=document.createElement("button");btn.type="button";btn.className="card-toggle";btn.setAttribute("aria-label","Abrir ou fechar seção");btn.innerHTML='<span class="chev">▾</span>';
    btn.addEventListener("click",(ev)=>{ev.stopPropagation();card.classList.toggle("card-collapsed");});h.appendChild(btn);
  });
}

// v11 — um card por item do catálogo RELATORIOS (todas as possibilidades de
// relatório cruzadas, não só os 4 atalhos originais), agrupados por "grupo" e
// com busca por palavra-chave em nome/descrição/grupo.
function cardRelatorioRapidoHTML(chave,rel){
  const {label,descricao,grupo}=rel;
  const m=label.match(/^(\S+)\s*(.*)$/),icone=m?m[1]:"📄",titulo=m?m[2]:label;
  const textoBusca=escapeHtmlRelatorio(`${label} ${descricao} ${grupo}`.toLowerCase());
  return `<button type="button" class="quick-report-card" data-busca="${textoBusca}" onclick="selecionarRelatorioRapido('${chave}')"><span class="report-icon">${icone}</span><strong>${escapeHtmlRelatorio(titulo)}</strong><span>${escapeHtmlRelatorio(descricao)}</span></button>`;
}

function renderizarAtalhosRelatorios(){
  const c=document.getElementById("atalhosRelatoriosGrupos");if(!c)return;
  const grupos={};
  Object.entries(RELATORIOS).forEach(([chave,rel])=>{(grupos[rel.grupo]||=[]).push({chave,...rel})});
  c.innerHTML=Object.entries(grupos).map(([grupo,itens])=>{
    const cards=itens.map(({chave,...rel})=>cardRelatorioRapidoHTML(chave,rel)).join("");
    return `<div class="quick-report-grupo"><h3>${escapeHtmlRelatorio(grupo)}</h3><div class="quick-report-grid">${cards}</div></div>`;
  }).join("");
}

// Mini-portal: renderiza só os cards de UM grupo do catálogo (sem cabeçalho de
// grupo repetido, sem busca) — usado por forecast.html ("Comercial & Receita")
// e sdr.html ("SDR & Leads") para mostrar apenas os relatórios do seu próprio
// grupo. Reaproveita exatamente o mesmo template de card de
// renderizarAtalhosRelatorios (cardRelatorioRapidoHTML) — não duplica a lógica.
function renderizarAtalhosRelatoriosGrupo(nomeGrupo, containerId){
  const c=document.getElementById(containerId);if(!c)return;
  const itens=Object.entries(RELATORIOS).filter(([,rel])=>rel.grupo===nomeGrupo);
  c.innerHTML=`<div class="quick-report-grid">${itens.map(([chave,rel])=>cardRelatorioRapidoHTML(chave,rel)).join("")}</div>`;
}
function filtrarAtalhosRelatorios(){
  const termo=(document.getElementById("buscaAtalhosRelatorios")?.value||"").trim().toLowerCase();
  let visiveis=0;
  document.querySelectorAll(".quick-report-grupo").forEach((grupoEl)=>{
    let visiveisNoGrupo=0;
    grupoEl.querySelectorAll(".quick-report-card").forEach((card)=>{
      const ok=!termo||(card.dataset.busca||"").includes(termo);
      card.style.display=ok?"":"none";
      if(ok)visiveisNoGrupo++;
    });
    grupoEl.style.display=visiveisNoGrupo?"":"none";
    visiveis+=visiveisNoGrupo;
  });
  document.getElementById("atalhosRelatoriosSemResultado")?.classList.toggle("oculto",visiveis>0);
}
// Mapa das (poucas) chaves de RELATORIOS que têm um bloco de resultado
// dedicado e "self-contido" (função de extração própria, fora do motor
// genérico do Catálogo) que também pode estar embutido em uma página mini-
// portal (forecast.html, sdr.html). Se o card dessa chave for clicado numa
// página que já tem esse bloco no DOM, a ação é rolar até ele em vez de
// navegar para extracao.html.
const RELATORIO_BLOCO_DEDICADO_LOCAL = {
  forecast_semanal: "bloco-forecast-semanal",
  diario_sdr: "bloco-diario-sdr",
  analise_sdr: "bloco-analise-sdr",
};

// Portal multi-página: só as páginas que têm o motor genérico de extração
// (hoje, só extracao.html) têm o wrapper #fluxo-extracao. Em qualquer outra
// página (index.html, forecast.html, sdr.html) clicar num card de relatório
// deve levar para extracao.html?relatorio=chave — a menos que a própria
// página já tenha o bloco dedicado daquele relatório (ver mapa acima), caso em
// que só rolamos até ele e pré-selecionamos o relatório/período localmente.
function selecionarRelatorioRapido(chave){
  if(!document.getElementById("fluxo-extracao")){
    const blocoId=RELATORIO_BLOCO_DEDICADO_LOCAL[chave];
    const bloco=blocoId?document.getElementById(blocoId):null;
    if(bloco){
      // sdr.html tem dois blocos dedicados mutuamente exclusivos (Diário SDR /
      // Análise SDR) na mesma página — ao selecionar um pelo card, esconde os
      // outros blocos dedicados presentes nesta página (forecast.html só tem
      // um, então este passo não muda nada nela).
      Object.entries(RELATORIO_BLOCO_DEDICADO_LOCAL).forEach(([k,id])=>{
        if(k===chave)return;
        document.getElementById(id)?.classList.add("oculto");
      });
      bloco.classList.remove("oculto");
      const s=document.getElementById("relatorio");
      if(s){s.value=chave;if(typeof aoTrocarRelatorio==="function")aoTrocarRelatorio();}
      if(typeof atualizarResumoConfiguracaoV7==="function")atualizarResumoConfiguracaoV7();
      bloco.scrollIntoView({behavior:"smooth",block:"start"});
      return;
    }
    window.location.href=`extracao.html?relatorio=${encodeURIComponent(chave)}`;
    return;
  }
  revelarFluxoExtracao();const s=document.getElementById("relatorio");s.value=chave;aoTrocarRelatorio();atualizarResumoConfiguracaoV7();document.getElementById("configuracao")?.scrollIntoView({behavior:"smooth",block:"start"});
}

// Passos 1-8 (Conexão, Escolha, Período, Campos, Executar, Sincronizar, Central
// de Inteligência, Analisar com IA) ficam escondidos até o usuário escolher um
// relatório na tela inicial (ou clicar em "Configurar extração manualmente"/
// "Ver Cockpit completo") -- a primeira tela deve mostrar só os cards. Na
// primeira vez que aparecem, cada passo começa recolhido (só o título) --
// evita despejar as 8 seções abertas de uma vez; o usuário abre só o que
// precisa (a "segunda tela" de cada card). Escolhas já feitas nos passos
// anteriores (relatório, período, campos) continuam aplicadas mesmo
// recolhidas -- collapse é só visual.
let fluxoExtracaoJaRevelado = false;
function revelarFluxoExtracao(){
  const wrap = document.getElementById("fluxo-extracao");
  if (!wrap) return;
  wrap.classList.remove("oculto");
  if (!fluxoExtracaoJaRevelado) {
    fluxoExtracaoJaRevelado = true;
    wrap.querySelectorAll(":scope > .card").forEach((card) => card.classList.add("card-collapsed"));
  }
}

function atualizarResumoConfiguracaoV7(){
  const relKey=document.getElementById("relatorio")?.value,entKey=document.getElementById("entidade")?.value;
  const titulo=document.getElementById("resumoSelecaoTitulo"),det=document.getElementById("resumoSelecaoDetalhe");
  let nome="Extração manual", detalhe=ENTIDADES[entKey]?.label||"";
  if(relKey){nome=RELATORIOS[relKey]?.label||relKey;detalhe=RELATORIOS[relKey]?.descricao||"";}
  if(titulo)titulo.textContent=nome;if(det)det.textContent=detalhe;
  const ini=document.getElementById("dataInicio")?.value,fim=document.getElementById("dataFim")?.value;
  const chips=[`Modo: ${relKey?"Relatório":"Dados"}`,relKey?nome:detalhe,ini||fim?`Período: ${formatarDataBR(ini)||"…"} → ${formatarDataBR(fim)||"…"}`:"Período: todas as datas"];
  const top=document.getElementById("resumoConfiguracaoTopo");if(top)top.innerHTML=chips.map((x)=>`<span class="config-chip">${escapeHtmlRelatorio(x)}</span>`).join("");
}

function categorizarCampoV7(code,label){
  const c=String(code||"").toUpperCase(),t=normalizarTextoChave(`${code} ${label}`);
  if(c.startsWith("UF_CRM_"))return"custom";
  if(/utm|source|origem|campanha|campaign|medium|term|content/.test(t))return"marketing";
  if(/date|time|data|created|modify|moved|close|begin|activity/.test(t))return"datas";
  if(/company|contact|lead|cliente|empresa|telefone|phone|email|nome|name/.test(t))return"cliente";
  if(/stage|status|assigned|respons|opportunity|valor|probability|pipeline|category|currency|closed/.test(t))return"comercial";
  return"geral";
}
function nomeCategoriaCampoV7(c){return({cliente:"Cliente",comercial:"Comercial",datas:"Datas",marketing:"Marketing",custom:"Personalizado",geral:"Geral"})[c]||"Geral"}

function renderizarListaCampos(lista){
  const cont=document.getElementById("campos-lista");if(!cont)return;cont.innerHTML="";
  lista.forEach((c,idx)=>{
    const div=document.createElement("div"),cat=categorizarCampoV7(c.code,c.label);div.className="campo-item";div.dataset.categoria=cat;div.dataset.padrao=c.padrao?"S":"N";
    const id=`campo_${String(c.code).replace(/[^a-zA-Z0-9_-]/g,"_")}_${idx}`;
    div.innerHTML=`<input type="checkbox" id="${id}" value="${escapeHtmlRelatorio(c.code)}" ${c.padrao?"checked":""}><label for="${id}" style="margin:0;min-width:0;"><span class="campo-label-wrap"><span class="campo-label-main">${escapeHtmlRelatorio(c.label||c.code)}</span><span class="campo-label-code">${escapeHtmlRelatorio(c.code)}</span><span class="campo-tag">${nomeCategoriaCampoV7(cat)}</span></span></label>`;
    div.querySelector("input").addEventListener("change",atualizarContadorCampos);cont.appendChild(div);
  });
  filtroCamposCategoriaAtual="todos";aplicarFiltroCampos();atualizarContadorCampos();
}
function atualizarContadorCampos(){const n=document.querySelectorAll("#campos-lista input[type=checkbox]:checked").length;const el=document.getElementById("camposSelecionadosContagem");if(el)el.textContent=`${n} campo${n===1?"":"s"} selecionado${n===1?"":"s"}`;}
function filtrarCamposCategoria(cat){filtroCamposCategoriaAtual=cat;aplicarFiltroCampos();}
function selecionarPresetCampos(tipo){
  document.querySelectorAll("#campos-lista .campo-item").forEach((div)=>{const cb=div.querySelector("input[type=checkbox]");if(tipo==="essenciais")cb.checked=div.dataset.padrao==="S";});atualizarContadorCampos();
}

// override visual filter to combine text + category
function aplicarFiltroCampos() {
  const campoFiltro=document.getElementById("filtroCampos");if(!campoFiltro)return;
  const filtro=campoFiltro.value.trim().toLowerCase();
  document.querySelectorAll("#campos-lista .campo-item").forEach((div)=>{
    const texto=div.textContent.toLowerCase(),catOk=filtroCamposCategoriaAtual==="todos"||div.dataset.categoria===filtroCamposCategoriaAtual,textOk=!filtro||texto.includes(filtro);
    div.style.display=catOk&&textOk?"":"none";
  });
}

// Select only visible cards in v7
function selecionarCampos(marcar){document.querySelectorAll("#campos-lista .campo-item").forEach((d)=>{if(d.style.display!=="none"){const i=d.querySelector("input[type=checkbox]");if(i)i.checked=marcar;}});atualizarContadorCampos();}

function prepararCamposSync(){
  const sel=document.getElementById("syncCampo");if(!sel)return;
  sel.innerHTML='<option value="">Carregue um registro para listar os campos editáveis</option>';
  syncRegistroAtual=null;syncCamposDisponiveis={};syncAlteracoes=[];renderizarPreviewSync();
  const st=document.getElementById("syncRegistroStatus"),nm=document.getElementById("syncRegistroNome");
  if(st)st.textContent="Nenhum registro carregado";if(nm)nm.textContent="Informe entidade e ID.";
  atualizarCampoSyncSelecionado();
}

function tipoInputSync(tipo){
  if(["integer","double","user","crm_company","crm_contact","crm_lead"].includes(tipo))return"number";
  if(tipo==="date")return"date";
  return"text";
}
function campoSyncEditavel(meta){
  if(!meta)return false;
  if(meta.isReadOnly||meta.isImmutable||meta.isMultiple)return false;
  return ["string","text","integer","double","crm_status","user","date","boolean","crm_currency","crm_company","crm_contact","crm_lead"].includes(String(meta.type||""));
}
function rotuloCampoSync(apiKey,meta){return meta?.title||meta?.upperName||apiKey;}

async function bitrixPostJsonComRetentativa(webhook,method,payload){
  const url=`${webhook.replace(/\/$/,"")}/${method}.json`;let ultimo=null;
  for(let tentativa=1;tentativa<=TENTATIVAS_MAX;tentativa++){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TIMEOUT_REQUISICAO_MS);
    try{
      const resp=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(payload),signal:controller.signal});clearTimeout(timer);
      const body=await resp.json().catch(()=>({}));
      if(resp.status===429||resp.status>=500||body.error==="QUERY_LIMIT_EXCEEDED")throw new Error(body.error_description||body.error||`HTTP ${resp.status}`);
      if(body.error||!resp.ok){const e=new Error(`${body.error||resp.status} — ${body.error_description||resp.statusText||"erro"}`);e.definitivo=resp.status>=400&&resp.status<500&&resp.status!==429;throw e;}
      return body;
    }catch(e){clearTimeout(timer);ultimo=e;if(e.definitivo)throw e;if(tentativa<TENTATIVAS_MAX)await aguardar(Math.min(2**(tentativa-1),8)*1000);}
  }
  throw ultimo||new Error("Falha na chamada ao Bitrix");
}

async function carregarRegistroSync(){
  const webhook=document.getElementById("webhook").value.trim(),err=validarWebhook(webhook);if(err){mostrarErro(err);return}
  const tipo=document.getElementById("syncEntidade").value,id=Number(document.getElementById("syncId").value),cfg=CAMPOS_SYNC[tipo];if(!id){mostrarErro("Informe o ID do registro que deseja carregar.");return}
  try{
    document.getElementById("syncRegistroStatus").textContent="Carregando...";
    const [itemBody,fieldsBody]=await Promise.all([
      bitrixPostJsonComRetentativa(webhook,"crm.item.get",{entityTypeId:cfg.entityTypeId,id,useOriginalUfNames:"N"}),
      bitrixPostJsonComRetentativa(webhook,"crm.item.fields",{entityTypeId:cfg.entityTypeId,useOriginalUfNames:"N"})
    ]);
    syncRegistroAtual=itemBody.result?.item||null;if(!syncRegistroAtual)throw new Error("Registro não retornado pelo crm.item.get.");
    const todos=fieldsBody.result?.fields||fieldsBody.result||{};syncCamposDisponiveis={};
    Object.entries(todos).forEach(([apiKey,meta])=>{if(campoSyncEditavel(meta))syncCamposDisponiveis[apiKey]=meta;});
    const sel=document.getElementById("syncCampo");
    sel.innerHTML=Object.entries(syncCamposDisponiveis).sort((a,b)=>rotuloCampoSync(a[0],a[1]).localeCompare(rotuloCampoSync(b[0],b[1]),"pt-BR")).map(([key,meta])=>`<option value="${escapeHtmlRelatorio(key)}">${escapeHtmlRelatorio(rotuloCampoSync(key,meta))} · ${escapeHtmlRelatorio(meta.upperName||key)}</option>`).join("");
    syncAlteracoes=[];renderizarPreviewSync();
    const nome=syncRegistroAtual.title||[syncRegistroAtual.name,syncRegistroAtual.lastName].filter(Boolean).join(" ")||`${cfg.label} #${id}`;
    document.getElementById("syncRegistroStatus").textContent=`${cfg.label} #${id} carregado`;
    document.getElementById("syncRegistroNome").textContent=`${nome} · ${Object.keys(syncCamposDisponiveis).length} campo(s) editável(is)`;
    atualizarCampoSyncSelecionado();
    document.getElementById("syncLog").textContent=`Registro e metadados carregados em ${new Date().toLocaleString("pt-BR")}. Nenhuma alteração enviada.`;
  }catch(e){document.getElementById("syncRegistroStatus").textContent="Falha ao carregar";document.getElementById("syncRegistroNome").textContent=e.message;mostrarErro("Não foi possível carregar o registro para sincronização.\n\n"+e.message);}
}

function atualizarCampoSyncSelecionado(){
  const key=document.getElementById("syncCampo")?.value,meta=syncCamposDisponiveis[key],inp=document.getElementById("syncNovoValor");if(!inp)return;
  inp.type=tipoInputSync(meta?.type);inp.value="";
  const atual=key&&syncRegistroAtual?syncRegistroAtual[key]:"";
  inp.placeholder=key?(meta?.type==="boolean"?`Atual: ${atual??""} · use Y ou N`:`Atual: ${String(atual??"(vazio)").slice(0,90)}`):"Carregue o registro primeiro";
}
function converterValorSync(valor,meta){
  const tipo=String(meta?.type||"");
  if(["integer","user","crm_company","crm_contact","crm_lead"].includes(tipo))return valor===""?null:Number.parseInt(valor,10);
  if(tipo==="double")return valor===""?null:Number(valor);
  if(tipo==="boolean"){const n=String(valor).trim().toUpperCase();return ["Y","SIM","1","TRUE"].includes(n)?"Y":"N";}
  return valor;
}
function adicionarAlteracaoSync(){
  if(!syncRegistroAtual){mostrarErro("Carregue um registro antes de preparar alterações.");return}
  const campo=document.getElementById("syncCampo").value,meta=syncCamposDisponiveis[campo];if(!campo||!meta){mostrarErro("Selecione um campo editável.");return}
  const bruto=document.getElementById("syncNovoValor").value,valor=converterValorSync(bruto,meta),item={campo,label:rotuloCampoSync(campo,meta),codigo:meta.upperName||campo,atual:syncRegistroAtual[campo]??"",novo:valor};
  const idx=syncAlteracoes.findIndex((x)=>x.campo===campo);if(idx>=0)syncAlteracoes[idx]=item;else syncAlteracoes.push(item);renderizarPreviewSync();atualizarBotaoSync();
}
function removerAlteracaoSync(campo){syncAlteracoes=syncAlteracoes.filter((x)=>x.campo!==campo);renderizarPreviewSync();atualizarBotaoSync();}
function limparAlteracoesSync(){syncAlteracoes=[];renderizarPreviewSync();atualizarBotaoSync();}
function renderizarPreviewSync(){
  const el=document.getElementById("syncPreview");if(!el)return;
  if(!syncAlteracoes.length){el.innerHTML='<div class="rodape-nota" style="padding:12px;">Nenhuma alteração preparada.</div>';return}
  el.innerHTML=`<table><thead><tr><th>Campo</th><th>Atual</th><th>Novo</th><th></th></tr></thead><tbody>${syncAlteracoes.map((x)=>`<tr><td><strong>${escapeHtmlRelatorio(x.label)}</strong><br><small>${escapeHtmlRelatorio(x.codigo)}</small></td><td>${escapeHtmlRelatorio(x.atual)}</td><td>${escapeHtmlRelatorio(x.novo)}</td><td><button type="button" class="secundario" onclick="removerAlteracaoSync('${x.campo}')">Remover</button></td></tr>`).join("")}</tbody></table>`;
}
function atualizarBotaoSync(){const ok=document.getElementById("syncHabilitarEscrita")?.checked&&document.getElementById("syncConfirmacao")?.value.trim().toUpperCase()==="SINCRONIZAR"&&syncAlteracoes.length>0&&syncRegistroAtual;document.getElementById("btnExecutarSync").disabled=!ok;}

async function executarSyncBitrix(){
  atualizarBotaoSync();if(document.getElementById("btnExecutarSync").disabled)return;
  const webhook=document.getElementById("webhook").value.trim(),err=validarWebhook(webhook);if(err){mostrarErro(err);return}
  const tipo=document.getElementById("syncEntidade").value,id=Number(document.getElementById("syncId").value),cfg=CAMPOS_SYNC[tipo],fields={};syncAlteracoes.forEach((x)=>fields[x.campo]=x.novo);
  try{
    document.getElementById("btnExecutarSync").disabled=true;document.getElementById("syncLog").textContent="Enviando alterações ao Bitrix via crm.item.update...";
    const body=await bitrixPostJsonComRetentativa(webhook,"crm.item.update",{entityTypeId:cfg.entityTypeId,id,fields});
    document.getElementById("syncLog").textContent=`Sincronização concluída em ${new Date().toLocaleString("pt-BR")}\nMétodo: crm.item.update\nentityTypeId: ${cfg.entityTypeId}\nID: ${id}\nCampos: ${Object.keys(fields).join(", ")}\nResultado: ${JSON.stringify(body.result)}`;
    document.getElementById("syncHabilitarEscrita").checked=false;document.getElementById("syncConfirmacao").value="";await carregarRegistroSync();atualizarStatus(`${cfg.label} #${id} atualizado no Bitrix.`);
  }catch(e){document.getElementById("syncLog").textContent=`Falha na sincronização: ${e.message}`;mostrarErro("O Bitrix não confirmou a atualização.\n\n"+e.message);}finally{atualizarBotaoSync();}
}

function iniciarExperienciaV7(){
  atualizarRelogioTopo();
  setInterval(atualizarRelogioTopo,1000);
  renderizarAtalhosRelatorios();
  ativarAcordeoesExtrator();
  prepararCamposSync();
  carregarWebhookSalvo();
  atualizarStatusWebhookSalvo();
  atualizarResumoConfiguracaoV7();
  ["entidade","relatorio","periodoPreset","dataInicio","dataFim"].forEach((id)=>document.getElementById(id)?.addEventListener("change",()=>setTimeout(atualizarResumoConfiguracaoV7,0)));
  const fc=document.getElementById("filtroCampos");fc?.addEventListener("input",atualizarContadorCampos);
}


// =============================================================================
// v10 — Central de Inteligência: Radar de prioridades, Funil visual (fluxo),
// Construtor de relatório sob medida e IA ao vivo.
// Tudo aqui roda em cima de dados já extraídos nesta página — nenhuma função
// abaixo faz uma nova chamada ao Bitrix.
// =============================================================================

let v10RadarItensAtual = [];
let v10FontesPivotDisponiveis = {};
let v10PivotResultadoAtual = [];
let v10ChatHistorico = [];
let v10ChatEnviando = false;
const CHAVE_IA_LOCAL = "atlas-extrator-chave-ia";

function abrirAbaV10(nome) {
  ["radar", "funil", "construtor", "ia"].forEach((n) => {
    document.getElementById(`v10tab-${n}`)?.classList.toggle("oculto", n !== nome);
    document.getElementById(`v10tab-btn-${n}`)?.classList.toggle("ativa", n === nome);
  });
  if (nome === "radar") renderizarRadarPrioridades();
  else if (nome === "funil") renderizarFunilVisualSankey();
  else if (nome === "construtor") popularFontesPivotV10();
  else if (nome === "ia") renderizarChatIAV10();
}

// v11 — botão de IA em cada card de relatório já gerado: leva direto para a
// aba "IA ao vivo" da Central de Inteligência com uma pergunta pronta sobre
// possibilidades de gestão daquele relatório (o contexto enviado ao chat já é
// o relatório mais recente gerado na página).
function abrirIAParaRelatorio(tituloRelatorio) {
  document.getElementById("central-inteligencia-v10")?.scrollIntoView({ behavior: "smooth", block: "start" });
  abrirAbaV10("ia");
  const campo = document.getElementById("v10ChatInput");
  if (campo) {
    campo.value = `Com base no relatório "${tituloRelatorio || "gerado"}", quais são as possibilidades de gestão dessas informações? Aponte ações prioritárias, riscos e oportunidades, na ordem em que deveriam ser tratados.`;
    campo.focus();
  }
}

// ------------------------------- Radar de prioridades -----------------------

function v10RegistrosBaseRadar() {
  if (dadosJornadaNormalizada && dadosJornadaNormalizada.length) {
    return { registros: dadosJornadaNormalizada, origem: "jornada" };
  }
  if (dadosExtraidos && dadosExtraidos.length && camposExtraidos.includes("STAGE_ID")) {
    return { registros: dadosExtraidos, origem: "extracao" };
  }
  return { registros: [], origem: "nenhuma" };
}

function renderizarRadarPrioridades() {
  const alvo = document.getElementById("v10RadarConteudo");
  const btnCsv = document.getElementById("v10BtnBaixarRadar");
  if (!alvo || !btnCsv) return;
  const { registros, origem } = v10RegistrosBaseRadar();

  if (origem === "nenhuma") {
    alvo.innerHTML = `<div class="v10-vazio"><strong>Nada para analisar ainda.</strong>Rode o relatório de <strong>Jornada do Cliente</strong> (recomendado — tem mais sinais) ou qualquer extração de Negócios/Leads com os campos MOVED_TIME, STAGE_ID e ASSIGNED_BY_ID marcados, lá em cima.</div>`;
    btnCsv.disabled = true;
    v10RadarItensAtual = [];
    return;
  }

  const slaDias = Math.max(1, Number(document.getElementById("v10RadarSlaDias").value) || 7);
  const agora = Date.now();

  const abertos = registros.filter((r) => {
    const sem = String(r.STAGE_SEMANTIC_ID || "").toUpperCase();
    return sem !== "S" && sem !== "F";
  });

  const parados = abertos
    .filter((r) => r.MOVED_TIME)
    .map((r) => ({ ...r, __DIAS_PARADO: Math.floor((agora - new Date(r.MOVED_TIME).getTime()) / 86400000) }))
    .filter((r) => Number.isFinite(r.__DIAS_PARADO) && r.__DIAS_PARADO >= slaDias)
    .sort((a, b) => b.__DIAS_PARADO - a.__DIAS_PARADO);

  const semResponsavel = abertos.filter((r) => !idBitrixValido(r.ASSIGNED_BY_ID));
  const valorParado = parados.reduce((s, r) => s + (Number(r.OPPORTUNITY) || 0), 0);
  const duplicidades = (dadosDuplicidadesJornada || []).length;
  const handoffs = (dadosHandoffsCliente || []).length;

  const kpis = [
    { valor: parados.length, rotulo: `Negócio(s) aberto(s) parado(s) há ${slaDias}+ dias` },
    { valor: moedaRelatorio(valorParado), rotulo: "Valor em negócios parados" },
    { valor: duplicidades, rotulo: "Possíveis duplicidades (Jornada)" },
    { valor: handoffs, rotulo: "Handoffs de responsável (Jornada)" },
    { valor: semResponsavel.length, rotulo: "Negócio(s) aberto(s) sem responsável" }
  ];

  let html = `<div class="auditoria-grid">` + kpis.map((k) =>
    `<div class="auditoria-kpi"><span class="valor">${escapeHtmlRelatorio(k.valor)}</span><span class="rotulo">${escapeHtmlRelatorio(k.rotulo)}</span></div>`
  ).join("") + `</div>`;

  const itens = [];
  parados.slice(0, 12).forEach((r) => {
    const sev = r.__DIAS_PARADO >= slaDias * 3 ? "critico" : r.__DIAS_PARADO >= slaDias * 2 ? "atencao" : "info";
    itens.push({
      sev, tag: "Parado",
      titulo: `${r.CLIENTE_NOME || r.TITLE || "Sem nome"} — ${r.__DIAS_PARADO} dia(s) sem mover`,
      sub: [r.FUNIL, r.ESTAGIO_LABEL || r.STAGE_ID, r.RESPONSAVEL_ATUAL_NOME, r.OPPORTUNITY ? moedaRelatorio(r.OPPORTUNITY) : ""].filter(Boolean).join(" · ")
    });
  });
  semResponsavel.slice(0, 8).forEach((r) => {
    itens.push({
      sev: "atencao", tag: "Sem dono",
      titulo: `${r.CLIENTE_NOME || r.TITLE || "Sem nome"} sem responsável atribuído`,
      sub: [r.FUNIL, r.ESTAGIO_LABEL || r.STAGE_ID].filter(Boolean).join(" · ")
    });
  });

  if (itens.length) {
    html += `<ul class="v10-lista-prioridade">` + itens.map((it) =>
      `<li class="v10-item-prioridade"><span class="v10-severidade ${it.sev}"></span><div class="v10-item-corpo"><div class="v10-item-titulo">${escapeHtmlRelatorio(it.titulo)}</div><div class="v10-item-sub">${escapeHtmlRelatorio(it.sub)}</div></div><span class="v10-item-tag">${escapeHtmlRelatorio(it.tag)}</span></li>`
    ).join("") + `</ul>`;
    if (parados.length > 12 || semResponsavel.length > 8) {
      html += `<p class="rodape-nota">Mostrando os itens mais críticos. Baixe o CSV para a lista completa de negócios parados.</p>`;
    }
  } else {
    html += `<div class="v10-radar-tudo-ok"><span class="emoji">✅</span>Nenhum negócio aberto parado ou sem responsável no limite configurado.</div>`;
  }

  alvo.innerHTML = html;
  v10RadarItensAtual = parados.map((r) => ({
    ID: r.ID || "", Cliente: r.CLIENTE_NOME || r.TITLE || "", Funil: r.FUNIL || "",
    Estagio: r.ESTAGIO_LABEL || r.STAGE_ID || "", Responsavel: r.RESPONSAVEL_ATUAL_NOME || "",
    Dias_parado: r.__DIAS_PARADO, Valor: Number(r.OPPORTUNITY) || 0
  }));
  btnCsv.disabled = v10RadarItensAtual.length === 0;
}

function baixarCSVRadarV10() {
  if (!v10RadarItensAtual.length) return;
  const campos = ["ID", "Cliente", "Funil", "Estagio", "Responsavel", "Dias_parado", "Valor"];
  baixarArquivo("\uFEFF" + linhasCSVDe(campos, v10RadarItensAtual), `radar_prioridades_atlasgr_${dataHoje()}.csv`, "text/csv;charset=utf-8;");
}

// ------------------------------- Funil visual (fluxo entre estágios) --------

function v10ParseHistorico(registro) {
  if (!registro || !registro.HISTORICO_ESTAGIOS_JSON) return [];
  try {
    const arr = JSON.parse(registro.HISTORICO_ESTAGIOS_JSON);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function popularSeletorFunilV10() {
  const sel = document.getElementById("v10FunilSelect");
  if (!sel) return;
  const valorAnterior = sel.value;
  const idsVistos = new Map();

  (dadosJornadaNormalizada || []).forEach((r) => {
    const catId = String(r.CATEGORY_ID ?? "");
    if (catId === "" || idsVistos.has(catId)) return;
    const label = (metadadosFunisJornada?.categorias?.[catId]) || r.FUNIL || `Categoria ${catId}`;
    idsVistos.set(catId, label);
  });

  if (!idsVistos.size) { sel.innerHTML = ""; return; }
  sel.innerHTML = [...idsVistos.entries()]
    .map(([id, label]) => `<option value="${escapeHtmlRelatorio(id)}">${escapeHtmlRelatorio(nomeFunilSemCodigo(label))}</option>`)
    .join("");
  if ([...idsVistos.keys()].includes(valorAnterior)) sel.value = valorAnterior;
}

function v10ConstruirFluxoSankey(catId) {
  const registros = dadosJornadaNormalizada || [];
  const estagiosMeta = metadadosFunisJornada?.estagios?.[catId] || {};
  let ordemEstagios = Object.entries(estagiosMeta).map(([id, info]) => ({ id, label: info.label }));

  const transicoes = {};
  const populacao = {};
  const ordemVista = [];

  registros.forEach((r) => {
    if (String(r.CATEGORY_ID ?? "") !== String(catId)) return;
    const hist = v10ParseHistorico(r).filter((h) => String(h.CATEGORY_ID) === String(catId));

    if (hist.length) {
      const vistosNesteDeal = new Set();
      hist.forEach((h) => {
        const lbl = h.STAGE_LABEL || h.STAGE_ID || "—";
        vistosNesteDeal.add(lbl);
        if (!ordemVista.includes(lbl)) ordemVista.push(lbl);
      });
      vistosNesteDeal.forEach((lbl) => { populacao[lbl] = (populacao[lbl] || 0) + 1; });
      for (let i = 0; i < hist.length - 1; i++) {
        const a = hist[i].STAGE_LABEL || hist[i].STAGE_ID || "—";
        const b = hist[i + 1].STAGE_LABEL || hist[i + 1].STAGE_ID || "—";
        if (a === b) continue;
        const chave = a + "\u2192" + b;
        transicoes[chave] = (transicoes[chave] || 0) + 1;
      }
    } else {
      const lbl = r.ESTAGIO_LABEL || r.STAGE_ID || "—";
      populacao[lbl] = (populacao[lbl] || 0) + 1;
      if (!ordemVista.includes(lbl)) ordemVista.push(lbl);
    }
  });

  if (!ordemEstagios.length) ordemEstagios = ordemVista.map((lbl) => ({ id: lbl, label: lbl }));
  ordemEstagios = ordemEstagios.filter((e) => populacao[e.label] > 0);
  Object.keys(populacao).forEach((lbl) => {
    if (!ordemEstagios.some((e) => e.label === lbl)) ordemEstagios.push({ id: lbl, label: lbl });
  });

  return { ordemEstagios, transicoes, populacao };
}

function v10QuebrarRotulo(texto, max) {
  const t = String(texto || "");
  return escapeHtmlRelatorio(t.length > max ? t.slice(0, max - 1) + "…" : t);
}

function renderizarFunilVisualSankey() {
  popularSeletorFunilV10();
  const alvo = document.getElementById("v10FunilConteudo");
  const sel = document.getElementById("v10FunilSelect");
  if (!alvo || !sel) return;

  if (!dadosJornadaNormalizada || !dadosJornadaNormalizada.length || !sel.value) {
    alvo.innerHTML = `<div class="v10-vazio"><strong>Sem dados de Jornada ainda.</strong>O funil visual usa o histórico de estágios calculado pelo relatório <strong>Jornada do Cliente</strong>. Rode esse relatório lá em cima e volte aqui.</div>`;
    return;
  }

  const catId = sel.value;
  const { ordemEstagios, transicoes, populacao } = v10ConstruirFluxoSankey(catId);

  if (!ordemEstagios.length) {
    alvo.innerHTML = `<div class="v10-vazio"><strong>Nenhum negócio encontrado neste funil.</strong></div>`;
    return;
  }

  const MAX_COLUNAS = 9;
  let colunas = ordemEstagios;
  if (colunas.length > MAX_COLUNAS) {
    const idxOriginal = new Map(ordemEstagios.map((e, i) => [e.label, i]));
    colunas = [...colunas].sort((a, b) => populacao[b.label] - populacao[a.label]).slice(0, MAX_COLUNAS);
    colunas.sort((a, b) => idxOriginal.get(a.label) - idxOriginal.get(b.label));
  }
  const colIndex = new Map(colunas.map((c, i) => [c.label, i]));

  const larguraCol = 168, larguraNode = 26, alturaMaxNode = 230, margemTopo = 34;
  const largura = Math.max(560, colunas.length * larguraCol + 60);
  const altura = alturaMaxNode + margemTopo * 2 + 30;

  const popMax = Math.max(1, ...colunas.map((c) => populacao[c.label] || 0));
  const escalaAltura = (v) => Math.max(6, (v / popMax) * alturaMaxNode);

  const nodes = colunas.map((c, i) => {
    const h = escalaAltura(populacao[c.label] || 0);
    return { label: c.label, x: 30 + i * larguraCol, y: margemTopo + (alturaMaxNode - h) / 2, h, pop: populacao[c.label] || 0 };
  });
  const nodeByLabel = new Map(nodes.map((n) => [n.label, n]));

  let fluxos = Object.entries(transicoes)
    .map(([chave, valor]) => { const [a, b] = chave.split("\u2192"); return { a, b, valor }; })
    .filter((f) => nodeByLabel.has(f.a) && nodeByLabel.has(f.b) && f.a !== f.b);
  fluxos.sort((x, y) => y.valor - x.valor);

  const TOP_FLUXOS = 24;
  let cortados = 0;
  if (fluxos.length > TOP_FLUXOS) { cortados = fluxos.length - TOP_FLUXOS; fluxos = fluxos.slice(0, TOP_FLUXOS); }

  const fluxoMax = Math.max(1, ...fluxos.map((f) => f.valor));
  const espessuraMin = 2, espessuraMax = 26;
  const espessura = (v) => espessuraMin + (v / fluxoMax) * (espessuraMax - espessuraMin);

  const offsetSaida = new Map();
  const offsetEntrada = new Map();
  const CORES = ["#ff5618", "#ff8008", "#ffc500", "#7a716c", "#0f9d64", "#2d7dd2", "#a35bd1", "#d64545"];
  const corPara = (label) => CORES[Math.abs(String(label).split("").reduce((s, c) => s + c.charCodeAt(0), 0)) % CORES.length];

  let svgRibbons = "";
  fluxos.forEach((f) => {
    const nA = nodeByLabel.get(f.a), nB = nodeByLabel.get(f.b);
    const esp = espessura(f.valor);
    const oa = offsetSaida.get(f.a) || 0;
    const ob = offsetEntrada.get(f.b) || 0;
    offsetSaida.set(f.a, oa + esp);
    offsetEntrada.set(f.b, ob + esp);

    const x1 = nA.x + larguraNode, y1 = nA.y + oa;
    const x2 = nB.x, y2 = nB.y + ob;
    const midx = (x1 + x2) / 2;
    const cor = corPara(f.a);
    const invertido = x2 < x1;
    svgRibbons += `<path d="M ${x1} ${y1} C ${midx} ${y1} ${midx} ${y2} ${x2} ${y2} L ${x2} ${y2 + esp} C ${midx} ${y2 + esp} ${midx} ${y1 + esp} ${x1} ${y1 + esp} Z" fill="${cor}" fill-opacity="${invertido ? 0.16 : 0.32}" stroke="${cor}" stroke-opacity="${invertido ? 0.28 : 0.5}" stroke-width="0.5"><title>${escapeHtmlRelatorio(f.a)} \u2192 ${escapeHtmlRelatorio(f.b)}: ${f.valor} negócio(s)</title></path>`;
  });

  let svgNodes = "";
  nodes.forEach((n) => {
    svgNodes += `<g><rect x="${n.x}" y="${n.y}" width="${larguraNode}" height="${n.h}" rx="5" style="fill:var(--brand);fill-opacity:.92;"><title>${escapeHtmlRelatorio(n.label)}: ${n.pop} negócio(s)</title></rect>`;
    svgNodes += `<text x="${n.x + larguraNode / 2}" y="${n.y - 10}" text-anchor="middle" font-size="11" font-weight="700" style="fill:var(--ink);">${n.pop}</text>`;
    svgNodes += `<text x="${n.x + larguraNode / 2}" y="${n.y + n.h + 16}" text-anchor="middle" font-size="9.5" style="fill:var(--ink-2);">${v10QuebrarRotulo(n.label, 15)}</text>`;
    svgNodes += `</g>`;
  });

  const svg = `<svg viewBox="0 0 ${largura} ${altura}" width="100%" style="min-width:${largura}px;height:${altura}px;font-family:var(--font-sans);">${svgRibbons}${svgNodes}</svg>`;

  let html = `<div class="v10-sankey-wrap">${svg}</div>`;
  html += `<div class="v10-sankey-legenda"><span><i style="background:var(--brand);"></i>Bloco = negócios que passaram pelo estágio</span><span><i style="background:color-mix(in srgb, var(--brand) 45%, transparent);"></i>Faixa = quantos negócios fizeram aquela transição (passe o mouse para ver o número)</span></div>`;
  if (cortados > 0) html += `<p class="rodape-nota">Mostrando as ${TOP_FLUXOS} transições mais frequentes (${cortados} fluxo(s) menor(es) omitido(s) para manter o desenho legível).</p>`;
  const semHistorico = registrosSemHistoricoV10(catId);
  if (semHistorico > 0) html += `<p class="rodape-nota">${semHistorico} negócio(s) deste funil não tinham histórico de estágio retornado pelo Bitrix — entram na contagem do estágio atual, mas não geram faixas de transição.</p>`;

  alvo.innerHTML = html;
}

function registrosSemHistoricoV10(catId) {
  return (dadosJornadaNormalizada || []).filter((r) => String(r.CATEGORY_ID ?? "") === String(catId) && !v10ParseHistorico(r).length).length;
}

// ------------------------------- Construtor de relatório sob medida ---------

function popularFontesPivotV10() {
  const sel = document.getElementById("v10PivotFonte");
  if (!sel) return;
  v10FontesPivotDisponiveis = {};

  if (dadosExtraidos && dadosExtraidos.length) {
    v10FontesPivotDisponiveis["extracao_atual"] = {
      registros: dadosExtraidos, campos: camposExtraidos.length ? camposExtraidos : camposDeDados(dadosExtraidos),
      label: `Dados já extraídos nesta página (${dadosExtraidos.length} registro(s))`
    };
  }
  if (resultadoCompleto && Object.keys(resultadoCompleto).length) {
    Object.entries(resultadoCompleto).forEach(([chave, r]) => {
      if (r?.dados?.length) {
        const rotuloEntidade = SUBENTIDADES_TUDO.find((s) => s.chave === chave)?.label || chave;
        v10FontesPivotDisponiveis["tudo_" + chave] = {
          registros: r.dados, campos: r.campos && r.campos.length ? r.campos : camposDeDados(r.dados),
          label: `Extração completa → ${rotuloEntidade} (${r.dados.length})`
        };
      }
    });
  }
  if (dadosProdutos && dadosProdutos.length) {
    v10FontesPivotDisponiveis["produtos"] = {
      registros: dadosProdutos, campos: (camposProdutosAtual && camposProdutosAtual.length) ? camposProdutosAtual : camposDeDados(dadosProdutos),
      label: `Produtos por negócio (${dadosProdutos.length} linha(s))`
    };
  }

  const chaves = Object.keys(v10FontesPivotDisponiveis);
  const resultado = document.getElementById("v10PivotResultado");
  const btnCsv = document.getElementById("v10BtnBaixarPivot");
  if (!chaves.length) {
    sel.innerHTML = "";
    if (resultado) resultado.innerHTML = `<div class="v10-vazio"><strong>Nada extraído ainda.</strong>Rode qualquer extração ou relatório lá em cima — este construtor funciona sobre esses dados.</div>`;
    ["v10PivotLinha", "v10PivotLinha2", "v10PivotCampoMetrica"].forEach((id) => { const e = document.getElementById(id); if (e) e.innerHTML = ""; });
    if (btnCsv) btnCsv.disabled = true;
    return;
  }
  const valorAnterior = sel.value;
  sel.innerHTML = chaves.map((k) => `<option value="${k}">${escapeHtmlRelatorio(v10FontesPivotDisponiveis[k].label)}</option>`).join("");
  if (chaves.includes(valorAnterior)) sel.value = valorAnterior;
  aoTrocarFontePivotV10();
}

function v10CamposProvavelmenteNumericos(registros, campos) {
  const amostra = registros.slice(0, 60);
  return campos.filter((c) => {
    let total = 0, numericos = 0;
    amostra.forEach((r) => {
      const v = r[c];
      if (v === null || v === undefined || v === "") return;
      total++;
      if (Number.isFinite(Number(String(v).replace(",", ".")))) numericos++;
    });
    return total > 0 && numericos / total >= 0.7;
  });
}

function aoTrocarFontePivotV10() {
  const fonte = v10FontesPivotDisponiveis[document.getElementById("v10PivotFonte")?.value];
  const selLinha1 = document.getElementById("v10PivotLinha");
  const selLinha2 = document.getElementById("v10PivotLinha2");
  const selMetrica = document.getElementById("v10PivotCampoMetrica");
  if (!selLinha1 || !selLinha2 || !selMetrica) return;
  if (!fonte) { selLinha1.innerHTML = ""; selLinha2.innerHTML = ""; selMetrica.innerHTML = ""; return; }

  const campos = [...fonte.campos].sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
  const opcoesLinha = campos.map((c) => `<option value="${escapeHtmlRelatorio(c)}">${escapeHtmlRelatorio(c)}</option>`).join("");
  selLinha1.innerHTML = opcoesLinha;
  selLinha2.innerHTML = `<option value="">— nenhum —</option>` + opcoesLinha;

  const numericos = v10CamposProvavelmenteNumericos(fonte.registros, campos);
  selMetrica.innerHTML = (numericos.length ? numericos : campos).map((c) => `<option value="${escapeHtmlRelatorio(c)}">${escapeHtmlRelatorio(c)}</option>`).join("");

  const resultado = document.getElementById("v10PivotResultado");
  if (resultado) resultado.innerHTML = "";
  const btnCsv = document.getElementById("v10BtnBaixarPivot");
  if (btnCsv) btnCsv.disabled = true;
}

function aoTrocarMetricaPivotV10() {
  const m = document.getElementById("v10PivotMetrica")?.value;
  document.getElementById("v10PivotCampoMetricaWrap")?.classList.toggle("oculto", m === "contagem");
}

function valorLegivelPivot(v) {
  if (v === null || v === undefined || v === "") return "(vazio)";
  return String(v);
}

function gerarRelatorioConstrutorV10() {
  const fonteKey = document.getElementById("v10PivotFonte")?.value;
  const fonte = v10FontesPivotDisponiveis[fonteKey];
  const wrap = document.getElementById("v10PivotResultado");
  const btnCsv = document.getElementById("v10BtnBaixarPivot");
  if (!wrap || !btnCsv) return;

  if (!fonte || !fonte.registros.length) {
    wrap.innerHTML = `<div class="v10-vazio"><strong>Nenhum dado disponível.</strong>Extraia algo primeiro lá em cima.</div>`;
    btnCsv.disabled = true;
    return;
  }
  const campoLinha1 = document.getElementById("v10PivotLinha").value;
  const campoLinha2 = document.getElementById("v10PivotLinha2").value;
  const metrica = document.getElementById("v10PivotMetrica").value;
  const campoMetrica = document.getElementById("v10PivotCampoMetrica").value;

  if (!campoLinha1) {
    wrap.innerHTML = `<div class="v10-vazio">Escolha ao menos um campo para agrupar.</div>`;
    btnCsv.disabled = true;
    return;
  }
  if ((metrica === "soma" || metrica === "media") && !campoMetrica) {
    mostrarErro("Escolha o campo numérico da métrica antes de gerar o cruzamento.");
    return;
  }
  esconderErro();

  const grupos = {};
  fonte.registros.forEach((r) => {
    const chave1 = valorLegivelPivot(r[campoLinha1]);
    const chave2 = campoLinha2 ? valorLegivelPivot(r[campoLinha2]) : null;
    const chave = chave2 !== null ? `${chave1}\u241F${chave2}` : chave1;
    if (!grupos[chave]) grupos[chave] = { chave1, chave2, contagem: 0, soma: 0, valores: [] };
    grupos[chave].contagem++;
    if (metrica !== "contagem") {
      const n = Number(String(r[campoMetrica]).replace(",", "."));
      if (Number.isFinite(n)) { grupos[chave].soma += n; grupos[chave].valores.push(n); }
    }
  });

  let linhas = Object.values(grupos).map((g) => ({
    grupo1: g.chave1, grupo2: g.chave2,
    metrica: metrica === "contagem" ? g.contagem : metrica === "soma" ? g.soma : (g.valores.length ? g.soma / g.valores.length : 0)
  }));
  linhas.sort((a, b) => b.metrica - a.metrica);

  const maxMetrica = Math.max(1, ...linhas.map((l) => l.metrica));
  const rotuloMetrica = metrica === "contagem" ? "Registros" : metrica === "soma" ? `Soma de ${campoMetrica}` : `Média de ${campoMetrica}`;
  const ehMoeda = /OPPORTUNITY|VALOR|PRICE|PRECO/i.test(campoMetrica || "");

  let html = `<table><thead><tr><th>${escapeHtmlRelatorio(campoLinha1)}</th>${campoLinha2 ? `<th>${escapeHtmlRelatorio(campoLinha2)}</th>` : ""}<th>${escapeHtmlRelatorio(rotuloMetrica)}</th></tr></thead><tbody>`;
  linhas.slice(0, 500).forEach((l) => {
    const pct = Math.max(2, (l.metrica / maxMetrica) * 100);
    const valorFmt = metrica !== "contagem" && ehMoeda ? moedaRelatorio(l.metrica) : (Math.round(l.metrica * 100) / 100).toLocaleString("pt-BR");
    html += `<tr><td>${escapeHtmlRelatorio(l.grupo1)}</td>${campoLinha2 ? `<td>${escapeHtmlRelatorio(l.grupo2)}</td>` : ""}<td><div class="v10-bar-cel"><span class="v10-bar-valor">${valorFmt}</span><span class="v10-bar-trilho"><span class="v10-bar-preenchido" style="width:${pct}%"></span></span></div></td></tr>`;
  });
  html += `</tbody></table>`;
  if (linhas.length > 500) html += `<p class="rodape-nota">Mostrando 500 de ${linhas.length} grupos. O CSV contém tudo.</p>`;

  wrap.innerHTML = html;
  v10PivotResultadoAtual = linhas.map((l) => {
    const obj = {};
    obj[campoLinha1] = l.grupo1;
    if (campoLinha2) obj[campoLinha2] = l.grupo2;
    obj[rotuloMetrica] = Math.round(l.metrica * 100) / 100;
    return obj;
  });
  btnCsv.disabled = v10PivotResultadoAtual.length === 0;
}

function baixarCSVConstrutorV10() {
  if (!v10PivotResultadoAtual.length) return;
  const campos = Object.keys(v10PivotResultadoAtual[0]);
  baixarArquivo("\uFEFF" + linhasCSVDe(campos, v10PivotResultadoAtual), `construtor_relatorio_atlasgr_${dataHoje()}.csv`, "text/csv;charset=utf-8;");
}

// ------------------------------- IA ao vivo (chat) ---------------------------

function obterChaveIASalvaV10() {
  try { return String(localStorage.getItem(CHAVE_IA_LOCAL) || "").trim(); } catch (e) { return ""; }
}

function atualizarStatusChaveIASalvaV10() {
  const status = document.getElementById("v10StatusChaveIA");
  const texto = document.getElementById("v10StatusChaveIATexto");
  if (!status || !texto) return;
  const salva = obterChaveIASalvaV10();
  status.classList.toggle("salvo", !!salva);
  texto.textContent = salva ? "Chave salva neste navegador" : "Chave não salva";
}

function carregarChaveIASalvaV10() {
  const campo = document.getElementById("v10ChaveIA");
  const salva = obterChaveIASalvaV10();
  if (campo && salva) { campo.value = salva; }
  atualizarStatusChaveIASalvaV10();
}

function salvarChaveIANoNavegadorV10() {
  const campo = document.getElementById("v10ChaveIA");
  const chave = String(campo?.value || "").trim();
  if (!chave || !chave.startsWith("sk-ant-")) {
    mostrarErro("Isso não parece uma chave da API Anthropic válida (começa com \"sk-ant-\").");
    return;
  }
  const confirmar = window.confirm(
    "Salvar esta chave da API Anthropic neste navegador?\n\n" +
    "Ela ficará no localStorage deste navegador, do mesmo jeito que o webhook do Bitrix. " +
    "Qualquer pessoa com acesso a este navegador poderá usá-la. Faça isso apenas em um computador pessoal ou confiável."
  );
  if (!confirmar) return;
  try {
    localStorage.setItem(CHAVE_IA_LOCAL, chave);
    atualizarStatusChaveIASalvaV10();
    atualizarStatus("Chave de IA salva somente neste navegador.");
  } catch (e) {
    mostrarErro("Não foi possível salvar a chave. O modo privado do navegador pode estar bloqueando o armazenamento local.");
  }
}

function esquecerChaveIASalvaV10() {
  const salva = obterChaveIASalvaV10();
  if (!salva) { atualizarStatusChaveIASalvaV10(); return; }
  const confirmar = window.confirm("Esquecer a chave de IA salva neste navegador? O campo atual também será limpo.");
  if (!confirmar) return;
  try { localStorage.removeItem(CHAVE_IA_LOCAL); } catch (e) {}
  const campo = document.getElementById("v10ChaveIA");
  if (campo) campo.value = "";
  atualizarStatusChaveIASalvaV10();
}

function aoTeclarChatV10(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    enviarMensagemChatIAV10();
  }
}

function renderizarChatIAV10() {
  const janela = document.getElementById("v10ChatJanela");
  if (!janela) return;
  if (!v10ChatHistorico.length) {
    janela.innerHTML = `<div class="v10-msg v10-msg-sistema">Faça uma pergunta sobre o relatório/extração mais recente feito nesta página. Cada pergunta reenvia os dados extraídos junto — o mesmo pacote do prompt do passo 7, mas direto pela API.</div>`;
    return;
  }
  janela.innerHTML = v10ChatHistorico.map((m) => {
    if (m.role === "user") return `<div class="v10-msg v10-msg-usuario">${escapeHtmlRelatorio(m.content)}</div>`;
    if (m.role === "erro") return `<div class="v10-msg v10-msg-erro">${escapeHtmlRelatorio(m.content)}</div>`;
    return `<div class="v10-msg v10-msg-ia">${escapeHtmlRelatorio(m.content)}</div>`;
  }).join("") + (v10ChatEnviando ? `<div class="v10-msg v10-msg-ia v10-chat-digitando"><span></span><span></span><span></span></div>` : "");
  janela.scrollTop = janela.scrollHeight;
}

async function enviarMensagemChatIAV10() {
  if (v10ChatEnviando) return;
  const input = document.getElementById("v10ChatInput");
  const pergunta = input.value.trim();
  if (!pergunta) return;

  const chave = String(document.getElementById("v10ChaveIA")?.value || obterChaveIASalvaV10() || "").trim();
  if (!chave) { mostrarErro("Informe sua chave da API Anthropic nesta aba antes de perguntar."); return; }

  const pacote = coletarDadosParaPrompt();
  if (!pacote) { mostrarErro("Extraia algum dado primeiro (passo 5) antes de conversar com a IA."); return; }
  esconderErro();

  let dadosTexto = JSON.stringify(pacote.conteudo, null, 2);
  let avisoCorte = "";
  if (dadosTexto.length > LIMITE_CARACTERES_PROMPT) {
    dadosTexto = dadosTexto.slice(0, LIMITE_CARACTERES_PROMPT);
    avisoCorte = "\n\n(Aviso: os dados extraídos foram cortados por tamanho — a base completa é maior do que isso.)";
  }
  const modeloEscolhido = document.querySelector('input[name="v10modelo"]:checked')?.value || "claude-sonnet-5";

  const systemPrompt = `Você é um analista de dados comerciais ajudando a equipe da AtlasGR a interpretar dados extraídos do CRM Bitrix24 (${pacote.modo}). Responda em português do Brasil, de forma direta e objetiva, sempre baseado nos dados abaixo — não invente números que não estejam neles. Quando fizer contas, mostre o raciocínio de forma resumida.${avisoCorte}\n\nDados extraídos (JSON):\n\`\`\`json\n${dadosTexto}\n\`\`\``;

  v10ChatHistorico.push({ role: "user", content: pergunta });
  input.value = "";
  v10ChatEnviando = true;
  renderizarChatIAV10();
  const btn = document.getElementById("v10BtnEnviarChat");
  if (btn) btn.disabled = true;

  try {
    const resposta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": chave,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: modeloEscolhido,
        max_tokens: 1536,
        system: systemPrompt,
        messages: v10ChatHistorico
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role, content: m.content }))
      })
    });

    const corpo = await resposta.json();
    if (!resposta.ok) {
      const msg = corpo?.error?.message || `A API respondeu com status ${resposta.status}.`;
      throw new Error(msg);
    }
    const texto = (corpo.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim() || "(resposta vazia)";
    v10ChatHistorico.push({ role: "assistant", content: texto });
  } catch (e) {
    v10ChatHistorico.push({ role: "erro", content: `Não foi possível obter resposta da IA: ${e.message}` });
  } finally {
    v10ChatEnviando = false;
    if (btn) btn.disabled = false;
    renderizarChatIAV10();
  }
}

function iniciarCentralInteligenciaV10() {
  carregarChaveIASalvaV10();
  renderizarRadarPrioridades();
}

// =============================================================================
// v12 — Ferramentas flutuantes: Imprimir, Baixar, Sincronizar, Ditar e
// Comando de Voz. Ditado e Comando de Voz usam a Web Speech API do navegador
// (SpeechRecognition) — só funcionam em navegadores que a suportam (Chrome/Edge;
// Firefox e Safari não têm suporte completo) e não enviam áudio a nenhum
// servidor da Atlas: o reconhecimento roda inteiramente no navegador do usuário.
// =============================================================================

function alternarPainelFerramentas() {
  document.getElementById("ferramentasPainel")?.classList.toggle("oculto");
}

function ferramentaImprimir() {
  window.print();
}

function ferramentaBaixar() {
  if (dadosExtraidos && dadosExtraidos.length) {
    baixarCSV();
  } else {
    alert("Nada para baixar ainda — rode uma extração ou um relatório primeiro.");
  }
}

function ferramentaSincronizar() {
  document.getElementById("card-sincronizacao")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// -------------------------- Ditado (voz → campo de texto) ------------------

let ultimoCampoTextoFocado = null;
document.addEventListener("focusin", (e) => {
  const alvo = e.target;
  if (alvo && (alvo.tagName === "TEXTAREA" || (alvo.tagName === "INPUT" && ["text", "search", "number", "password"].includes(alvo.type)))) {
    ultimoCampoTextoFocado = alvo;
  }
});

function reconhecimentoDeVozDisponivel() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
function criarReconhecimentoDeVoz(continuo) {
  const Motor = window.SpeechRecognition || window.webkitSpeechRecognition;
  const r = new Motor();
  r.lang = "pt-BR";
  r.continuous = continuo;
  r.interimResults = false;
  return r;
}

let reconhecimentoDitado = null;
function alternarDitado() {
  const btn = document.getElementById("btnFerramentaDitar");
  if (!reconhecimentoDeVozDisponivel()) {
    document.getElementById("ferramentasVozStatus").textContent = "Ditado por voz não é suportado neste navegador (funciona no Chrome/Edge).";
    return;
  }
  if (reconhecimentoDitado) {
    reconhecimentoDitado.stop();
    return;
  }
  const campo = ultimoCampoTextoFocado || document.getElementById("v10ChatInput");
  if (!campo) {
    document.getElementById("ferramentasVozStatus").textContent = "Clique em um campo de texto antes de ditar.";
    return;
  }
  reconhecimentoDitado = criarReconhecimentoDeVoz(false);
  btn?.classList.add("ativo");
  document.getElementById("ferramentasVozStatus").textContent = `Ouvindo... fale para ditar em "${campo.id || campo.name || "campo de texto"}".`;
  reconhecimentoDitado.onresult = (ev) => {
    const texto = ev.results[0][0].transcript;
    const inicio = campo.selectionStart ?? campo.value.length;
    const fim = campo.selectionEnd ?? campo.value.length;
    campo.value = campo.value.slice(0, inicio) + texto + campo.value.slice(fim);
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    campo.focus();
  };
  reconhecimentoDitado.onerror = (ev) => {
    document.getElementById("ferramentasVozStatus").textContent = `Erro no ditado: ${ev.error}.`;
  };
  reconhecimentoDitado.onend = () => {
    btn?.classList.remove("ativo");
    reconhecimentoDitado = null;
    document.getElementById("ferramentasVozStatus").textContent = "";
  };
  reconhecimentoDitado.start();
}

// -------------------------- Comando de voz (navegação/ações) ---------------

const COMANDOS_DE_VOZ = [
  { padroes: ["extrair dados", "extrair", "executar consulta", "rodar relatório", "rodar relatorio"], acao: () => extrair(), fala: "Extraindo dados." },
  { padroes: ["sincronizar", "ir para sincronizar", "sincronização"], acao: () => ferramentaSincronizar(), fala: "Abrindo sincronização." },
  { padroes: ["imprimir"], acao: () => ferramentaImprimir(), fala: "Imprimindo." },
  { padroes: ["baixar", "baixar csv", "baixar arquivo"], acao: () => ferramentaBaixar(), fala: "Baixando." },
  { padroes: ["topo", "início", "inicio", "voltar ao topo"], acao: () => document.getElementById("inicio")?.scrollIntoView({ behavior: "smooth" }), fala: "Voltando ao topo." },
  { padroes: ["jornada", "jornada do cliente"], acao: () => selecionarRelatorioRapido("jornada"), fala: "Abrindo Jornada do Cliente." },
  { padroes: ["forecast semanal"], acao: () => selecionarRelatorioRapido("forecast_semanal"), fala: "Abrindo Forecast semanal." },
  { padroes: ["forecast mensal"], acao: () => selecionarRelatorioRapido("forecast_mensal"), fala: "Abrindo Forecast mensal." },
  { padroes: ["central de inteligência", "central de inteligencia"], acao: () => document.getElementById("central-inteligencia-v10")?.scrollIntoView({ behavior: "smooth" }), fala: "Abrindo Central de Inteligência." },
  { padroes: ["parar", "parar comando", "cancelar"], acao: () => alternarComandoDeVoz(), fala: "Parando comando de voz." }
];

let reconhecimentoComandoVoz = null;
function interpretarComandoDeVoz(transcript) {
  const t = normalizarTextoChave(transcript);
  const status = document.getElementById("ferramentasVozStatus");
  const comando = COMANDOS_DE_VOZ.find((c) => c.padroes.some((p) => t.includes(normalizarTextoChave(p))));
  if (comando) {
    if (status) status.textContent = `Comando: "${transcript}" → ${comando.fala}`;
    comando.acao();
  } else if (status) {
    status.textContent = `Não reconheci o comando: "${transcript}".`;
  }
}
function alternarComandoDeVoz() {
  const btn = document.getElementById("btnFerramentaComandoVoz");
  if (!reconhecimentoDeVozDisponivel()) {
    document.getElementById("ferramentasVozStatus").textContent = "Comando de voz não é suportado neste navegador (funciona no Chrome/Edge).";
    return;
  }
  if (reconhecimentoComandoVoz) {
    reconhecimentoComandoVoz.stop();
    reconhecimentoComandoVoz = null;
    btn?.classList.remove("ativo");
    document.getElementById("ferramentasVozStatus").textContent = "";
    return;
  }
  reconhecimentoComandoVoz = criarReconhecimentoDeVoz(true);
  btn?.classList.add("ativo");
  document.getElementById("ferramentasVozStatus").textContent = "Comando de voz ativo — diga \"extrair\", \"sincronizar\", \"imprimir\", \"jornada\", \"forecast semanal\"...";
  reconhecimentoComandoVoz.onresult = (ev) => {
    const ultimo = ev.results[ev.results.length - 1];
    if (ultimo.isFinal) interpretarComandoDeVoz(ultimo[0].transcript);
  };
  reconhecimentoComandoVoz.onerror = (ev) => {
    document.getElementById("ferramentasVozStatus").textContent = `Erro no comando de voz: ${ev.error}.`;
  };
  reconhecimentoComandoVoz.onend = () => {
    btn?.classList.remove("ativo");
    reconhecimentoComandoVoz = null;
  };
  reconhecimentoComandoVoz.start();
}

function iniciarFerramentasFlutuantes() {
  if (!reconhecimentoDeVozDisponivel()) {
    document.getElementById("btnFerramentaDitar")?.setAttribute("disabled", "disabled");
    document.getElementById("btnFerramentaComandoVoz")?.setAttribute("disabled", "disabled");
    const status = document.getElementById("ferramentasVozStatus");
    if (status) status.textContent = "Ditado e Comando de Voz precisam do Chrome ou Edge.";
  }
}

