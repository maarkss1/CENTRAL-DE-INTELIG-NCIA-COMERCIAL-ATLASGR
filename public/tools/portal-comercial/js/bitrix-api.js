function alternarVisibilidadeWebhook() {
  const campo = document.getElementById("webhook");
  campo.type = campo.type === "password" ? "text" : "password";
}


const WEBHOOK_FIXO_PADRAO = "https://atlasgr.bitrix24.com.br/rest/450/gr94fas79p1nizci/";
const CHAVE_WEBHOOK_LOCAL = "atlas-extrator-bitrix-webhook";

// v27 — multi-empresa: cada marca (ver MARCAS em config.js) tem sua própria
// chave de localStorage (sufixoStorage) e seu próprio webhook padrão
// (webhookPadrao) — senão, salvar um webhook na Total Trac sobrescreveria o
// da AtlasGR, já que hoje é uma única chave global. Sem sufixo pra AtlasGR
// (sufixoStorage:"" no registro dela), então continua lendo o que já estava
// salvo antes desta mudança.
function chaveWebhookAtual() {
  return CHAVE_WEBHOOK_LOCAL + (typeof marcaAtiva === "function" ? marcaAtiva().sufixoStorage : "");
}
function webhookPadraoAtual() {
  return typeof marcaAtiva === "function" ? marcaAtiva().webhookPadrao : WEBHOOK_FIXO_PADRAO;
}

// ---------------------------------------------------------------------------
// Ofuscação leve do webhook salvo no localStorage.
//
// IMPORTANTE — isto NÃO é segurança real: é uma cifra XOR reversível com chave
// fixa embutida no próprio código-fonte público. Qualquer pessoa que leia este
// arquivo (ou o próprio DevTools, já que a função de desofuscar está aqui do
// lado) consegue recuperar o webhook original em segundos. O único ganho real
// é evitar exposição *trivial* do texto puro da credencial ao abrir
// Application > Local Storage no DevTools, em backups automáticos do perfil do
// navegador, ou a extensões maliciosas que fazem apenas um grep simples por
// padrões como "/rest/" no localStorage. Contra alguém com acesso de fato ao
// navegador (DevTools, extensão capaz de rodar JS, backup do perfil lido por
// outra ferramenta), a proteção é nula — não existe forma de esconder de
// verdade uma credencial usada por uma aplicação 100% client-side sem
// backend/servidor próprio para custodiá-la. Ver aviso equivalente na UI, no
// card "Conexão com o Bitrix", e em AUDITORIA_ESTADO_ATUAL.md.
const CHAVE_OFUSCACAO_WEBHOOK = "AtlasGR-Comercial-v13-nao-e-seguranca-real";

function ofuscarWebhook(texto) {
  const s = String(texto || "");
  let saida = "";
  for (let i = 0; i < s.length; i++) {
    const codigo = s.charCodeAt(i) ^ CHAVE_OFUSCACAO_WEBHOOK.charCodeAt(i % CHAVE_OFUSCACAO_WEBHOOK.length);
    saida += String.fromCharCode(codigo);
  }
  try {
    return "xor1:" + btoa(unescape(encodeURIComponent(saida)));
  } catch (e) {
    return "";
  }
}

function desofuscarWebhook(valorArmazenado) {
  const bruto = String(valorArmazenado || "");
  if (!bruto) return "";
  if (!bruto.startsWith("xor1:")) {
    // Compatibilidade retroativa: valor salvo em texto puro por uma versão
    // anterior desta ferramenta. Continua sendo lido normalmente.
    return bruto;
  }
  try {
    const decodificado = decodeURIComponent(escape(atob(bruto.slice(5))));
    let saida = "";
    for (let i = 0; i < decodificado.length; i++) {
      const codigo = decodificado.charCodeAt(i) ^ CHAVE_OFUSCACAO_WEBHOOK.charCodeAt(i % CHAVE_OFUSCACAO_WEBHOOK.length);
      saida += String.fromCharCode(codigo);
    }
    return saida;
  } catch (e) {
    return "";
  }
}

function obterWebhookSalvo() {
  try {
    const salvo = desofuscarWebhook(localStorage.getItem(chaveWebhookAtual()) || "").trim();
    return salvo || webhookPadraoAtual();
  } catch (e) {
    return webhookPadraoAtual();
  }
}

function atualizarStatusWebhookSalvo() {
  const status = document.getElementById("statusWebhookSalvo");
  const texto = document.getElementById("statusWebhookSalvoTexto");
  if (!status || !texto) return;

  const salvo = obterWebhookSalvo();
  const atual = String(document.getElementById("webhook")?.value || "").trim();

  status.classList.toggle("salvo", !!salvo);

  if (!salvo) {
    texto.textContent = "Webhook não configurado";
  } else if (atual && atual !== salvo) {
    texto.textContent = "Existe outro webhook informado";
  } else if (salvo === webhookPadraoAtual()) {
    texto.textContent = "Webhook fixo ativo";
  } else {
    texto.textContent = "Webhook salvo neste navegador";
  }

  const inputWebhook = document.getElementById("webhook");
  if (inputWebhook) {
    if (atual === "") {
      inputWebhook.style.borderColor = "";
      inputWebhook.style.backgroundColor = "";
    } else {
      const erroValidacao = validarWebhook(atual);
      if (erroValidacao) {
        inputWebhook.style.borderColor = "var(--perda)";
        inputWebhook.style.backgroundColor = "var(--fundo)";
      } else {
        inputWebhook.style.borderColor = "var(--sucesso)";
        inputWebhook.style.backgroundColor = "rgba(40, 167, 69, 0.05)";
      }
    }
  }
}

function carregarWebhookSalvo() {
  const campo = document.getElementById("webhook");
  if (!campo) return false;

  const salvo = obterWebhookSalvo();
  campo.value = salvo || webhookPadraoAtual();
  campo.type = "password";
  marcarConexaoPendente();
  atualizarStatusWebhookSalvo();
  return true;
}

function salvarWebhookNoNavegador() {
  const campo = document.getElementById("webhook");
  const webhook = String(campo?.value || "").trim();
  const erro = validarWebhook(webhook);

  if (erro) {
    mostrarErro(erro);
    return;
  }

  const confirmar = window.confirm(
    "Salvar o webhook personalizado neste navegador?\n\n" +
    "A URL ficará armazenada (ofuscada, não criptografada de verdade) no localStorage deste navegador."
  );
  if (!confirmar) return;

  try {
    localStorage.setItem(chaveWebhookAtual(), ofuscarWebhook(webhook));
    atualizarStatusWebhookSalvo();
    atualizarStatus("Webhook salvo neste navegador. Ele será carregado automaticamente na próxima abertura.");
  } catch (e) {
    mostrarErro("Não foi possível salvar o webhook. O modo privado ou uma política do navegador pode estar bloqueando o armazenamento local.");
  }
}

function esquecerWebhookSalvo() {
  const salvoLocal = (() => {
    try {
      return desofuscarWebhook(localStorage.getItem(chaveWebhookAtual()) || "").trim();
    } catch (e) {
      return "";
    }
  })();

  try {
    localStorage.removeItem(chaveWebhookAtual());
  } catch (e) {}

  const campo = document.getElementById("webhook");
  if (campo) {
    campo.value = webhookPadraoAtual();
    campo.type = "password";
  }

  marcarConexaoPendente();
  atualizarStatusWebhookSalvo();
  const temPadraoFixo = !!webhookPadraoAtual();
  if (salvoLocal) {
    atualizarStatus(temPadraoFixo ? "Webhook personalizado removido. Restaurado webhook fixo padrão." : "Webhook personalizado removido. Cole outro webhook para conectar.");
  } else {
    atualizarStatus(temPadraoFixo ? "Webhook fixo padrão restaurado." : "Nenhum webhook salvo. Cole um webhook para conectar.");
  }
}

// ---------------------------------------------------------------------------
// Intervalos rápidos de período (Todas / Diário / Semanal / Mensal / Trimestral / Semestral)
// ---------------------------------------------------------------------------

function formatarDataISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function calcularIntervaloPreset(preset) {
  const hoje = new Date();
  const fim = new Date(hoje);
  let inicio = null;

  switch (preset) {
    case "todas":
      return { inicio: "", fim: "" };
    case "diario":
      inicio = new Date(hoje);
      break;
    case "semana_atual": {
      const dia = hoje.getDay(); // 0=domingo
      const deslocamentoSegunda = dia === 0 ? -6 : 1 - dia;
      inicio = new Date(hoje);
      inicio.setDate(hoje.getDate() + deslocamentoSegunda);
      const domingo = new Date(inicio);
      domingo.setDate(inicio.getDate() + 6);
      return { inicio: formatarDataISO(inicio), fim: formatarDataISO(domingo) };
    }
    case "semanal":
      inicio = new Date(hoje);
      inicio.setDate(inicio.getDate() - 6);
      break;
    case "mensal":
      inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      break;
    case "trimestral": {
      const trimestreAtual = Math.floor(hoje.getMonth() / 3); // 0,1,2,3
      inicio = new Date(hoje.getFullYear(), trimestreAtual * 3, 1);
      break;
    }
    case "semestral": {
      const semestreAtual = hoje.getMonth() < 6 ? 0 : 1;
      inicio = new Date(hoje.getFullYear(), semestreAtual * 6, 1);
      break;
    }
    default:
      return null; // "personalizado" — não mexe nas datas
  }

  return { inicio: formatarDataISO(inicio), fim: formatarDataISO(fim) };
}


function aplicarPeriodoRelatorioEspecial(chave) {
  const rel = RELATORIOS[chave];
  const periodo = rel?.periodo || "mensal";

  if (periodo === "todas") {
    document.getElementById("periodoPreset").value = "todas";
    document.getElementById("dataInicio").value = "";
    document.getElementById("dataFim").value = "";
    return;
  }

  const intervalo = calcularIntervaloPreset(periodo);
  document.getElementById("periodoPreset").value = periodo;
  document.getElementById("dataInicio").value = intervalo.inicio || "";
  document.getElementById("dataFim").value = intervalo.fim || intervalo.inicio || "";
}


function aoTrocarPresetPeriodo() {
  const preset = document.getElementById("periodoPreset").value;
  const intervalo = calcularIntervaloPreset(preset);
  if (intervalo === null) return; // personalizado: mantém o que já estava digitado
  document.getElementById("dataInicio").value = intervalo.inicio;
  document.getElementById("dataFim").value = intervalo.fim;
}

function voltarParaPersonalizado() {
  document.getElementById("periodoPreset").value = "personalizado";
}

// Preenche De/Até com o primeiro e o último dia do mês escolhido no seletor
// <input type="month"> — funciona para qualquer mês/ano, não só o atual.
function aoEscolherMesEspecifico() {
  const valor = document.getElementById("mesEspecifico").value; // "AAAA-MM"
  if (!valor) return;
  const [ano, mes] = valor.split("-").map(Number);
  const inicio = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 0); // dia 0 do mês seguinte = último dia deste mês
  document.getElementById("dataInicio").value = formatarDataISO(inicio);
  document.getElementById("dataFim").value = formatarDataISO(fim);
  document.getElementById("periodoPreset").value = "personalizado";
}

// Preenche De/Até com o mesmo dia escolhido no seletor <input type="date"> — um
// atalho pra "só esse dia" sem digitar a mesma data duas vezes.
function aoEscolherDiaEspecifico() {
  const valor = document.getElementById("diaEspecifico").value; // "AAAA-MM-DD"
  if (!valor) return;
  document.getElementById("dataInicio").value = valor;
  document.getElementById("dataFim").value = valor;
  document.getElementById("periodoPreset").value = "personalizado";
}

// ---------------------------------------------------------------------------
// Extração
// ---------------------------------------------------------------------------

function selecionarCampos(marcar) {
  document.querySelectorAll("#campos-lista input[type=checkbox]").forEach((i) => {
    i.checked = marcar;
  });
}

function camposSelecionados() {
  const marcados = Array.from(document.querySelectorAll("#campos-lista input[type=checkbox]:checked")).map((i) => i.value);
  const extras = document.getElementById("camposExtra").value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...marcados, ...extras])];
}

function montarFiltro() {
  const chaveEnt = document.getElementById("entidade").value;
  const ent = ENTIDADES[chaveEnt];
  const filtro = {};

  if (ent.hasCategoria) {
    const cat = document.getElementById("categoria").value;
    if (cat !== "") filtro["CATEGORY_ID"] = cat;
  }

  const selEstagio = document.getElementById("estagio");
  if (!document.getElementById("bloco-estagio").classList.contains("oculto") && selEstagio.value) {
    filtro[selEstagio.dataset.campo] = selEstagio.value;
  }

  if (!document.getElementById("bloco-vendedor").classList.contains("oculto")) {
    const vendedor = document.getElementById("vendedor").value;
    const campoVendedor = chaveEnt === "atividades" ? "RESPONSIBLE_ID" : "ASSIGNED_BY_ID";
    if (vendedor) filtro[campoVendedor] = vendedor;
  }

  if (!document.getElementById("bloco-origem").classList.contains("oculto")) {
    const origem = document.getElementById("origem").value;
    if (origem) filtro["SOURCE_ID"] = origem;
  }

  if (!document.getElementById("bloco-campo-personalizado").classList.contains("oculto")) {
    const codigo = document.getElementById("campoPersonalizadoCodigo").value.trim();
    const valor = document.getElementById("campoPersonalizadoValor").value.trim();
    if (codigo && valor) filtro[codigo] = valor;
  }

  if (!ent.semFiltroData) {
    const campoData = document.getElementById("campoData").value;
    const inicio = document.getElementById("dataInicio").value;
    const fim = document.getElementById("dataFim").value;
    if (campoData && inicio) filtro[">=" + campoData] = inicio + "T00:00:00-03:00";
    if (campoData && fim) filtro["<=" + campoData] = fim + "T23:59:59-03:00";
  }

  return filtro;
}

function appendParametro(params, chave, valor) {
  if (valor === null || valor === undefined || valor === "") return;
  if (Array.isArray(valor)) {
    valor.forEach((v) => params.append(`${chave}[]`, v));
  } else {
    params.append(chave, valor);
  }
}

function metodoAceitaOrderId(method) {
  return method !== "user.get" && /\.list$/i.test(method);
}

function montarUrl(webhook, method, campos, filtro, start, order = null, extras = null) {
  const params = new URLSearchParams();
  (campos || []).forEach((c) => params.append("select[]", c));
  Object.entries(filtro || {}).forEach(([chave, valor]) => {
    appendParametro(params, `filter[${chave}]`, valor);
  });

  // Ordenação determinística evita páginas inconsistentes quando o CRM muda durante a extração.
  const ordem = order || (metodoAceitaOrderId(method) ? { ID: "ASC" } : {});
  Object.entries(ordem).forEach(([campo, direcao]) => params.append(`order[${campo}]`, direcao));

  Object.entries(extras || {}).forEach(([chave, valor]) => appendParametro(params, chave, valor));
  params.append("start", start || 0);
  return `${webhook.replace(/\/$/, "")}/${method}.json?${params.toString()}`;
}

function mesclarSemDuplicarPorId(acumulado, chunk, campoId = "ID") {
  if (!Array.isArray(chunk) || chunk.length === 0) return { dados: acumulado, duplicados: 0 };
  const vistos = new Set(acumulado.map((r) => String(r?.[campoId] ?? "")).filter(Boolean));
  let duplicados = 0;
  const novos = [];
  chunk.forEach((r) => {
    const id = String(r?.[campoId] ?? "");
    if (id && vistos.has(id)) {
      duplicados++;
      return;
    }
    if (id) vistos.add(id);
    novos.push(r);
  });
  return { dados: acumulado.concat(novos), duplicados };
}

// ---------------------------------------------------------------------------
// Listas dinâmicas para os filtros de Vendedor e Origem (passo 2): buscadas do
// seu Bitrix (nunca fixas no código), porque quem responde por qual ID e quais
// origens existem é específico da conta de cada empresa.
// ---------------------------------------------------------------------------

async function carregarListaPaginada(webhook, method, params = {}) {
  let resultados = [];
  let start = 0;
  let duplicados = 0;
  while (true) {
    const url = new URL(`${webhook.replace(/\/$/, "")}/${method}.json`);
    Object.entries(params).forEach(([k, v]) => appendParametro(url.searchParams, k, v));
    if (metodoAceitaOrderId(method) && !Object.keys(params).some((k) => k.startsWith("order["))) {
      url.searchParams.append("order[ID]", "ASC");
    }
    url.searchParams.append("start", start);
    const body = await bitrixFetchComRetentativa(url.toString());
    const chunk = Array.isArray(body.result) ? body.result : Object.values(body.result || {});
    const merge = mesclarSemDuplicarPorId(resultados, chunk);
    resultados = merge.dados;
    duplicados += merge.duplicados;
    if (!body.next || chunk.length === 0) break;
    start = body.next;
    await aguardar(ATRASO_ENTRE_PAGINAS_MS);
  }
  resultados._duplicadosIgnorados = duplicados;
  return resultados;
}

async function carregarVendedores() {
  const webhook = document.getElementById("webhook").value.trim();
  const erro = validarWebhook(webhook);
  if (erro) {
    mostrarErro(erro);
    return;
  }
  esconderErro();
  document.getElementById("btnCarregarVendedores").disabled = true;
  atualizarStatus("Carregando lista de vendedores...");
  try {
    const usuarios = await carregarListaPaginada(webhook, "user.get", {});
    const sel = document.getElementById("vendedor");
    const selecaoAnterior = sel.value;
    sel.innerHTML = '<option value="">Todos os vendedores</option>';
    usuarios
      .slice()
      .sort((a, b) => `${a.NAME || ""} ${a.LAST_NAME || ""}`.localeCompare(`${b.NAME || ""} ${b.LAST_NAME || ""}`))
      .forEach((u) => {
        const opt = document.createElement("option");
        opt.value = u.ID;
        opt.textContent = `${u.NAME || ""} ${u.LAST_NAME || ""}`.trim() + ` (ID ${u.ID})`;
        sel.appendChild(opt);
      });
    if ([...sel.options].some((o) => o.value === selecaoAnterior)) sel.value = selecaoAnterior;
    atualizarStatus(`${usuarios.length} vendedor(es) carregado(s).`);
  } catch (e) {
    mostrarErro("Não consegui carregar a lista de vendedores.\n\nDetalhe técnico: " + e.message);
  } finally {
    document.getElementById("btnCarregarVendedores").disabled = false;
  }
}

async function carregarOrigens() {
  const webhook = document.getElementById("webhook").value.trim();
  const erro = validarWebhook(webhook);
  if (erro) {
    mostrarErro(erro);
    return;
  }
  esconderErro();
  document.getElementById("btnCarregarOrigens").disabled = true;
  atualizarStatus("Carregando lista de origens...");
  try {
    // crm.status.list com ENTITY_ID=SOURCE devolve as origens configuradas nesta
    // conta (padrão do Bitrix + qualquer origem customizada criada, ex: WhatsApp,
    // LinkedIn, Site, Orgânico) — os códigos variam de conta para conta.
    const origens = await carregarListaPaginada(webhook, "crm.status.list", { "filter[ENTITY_ID]": "SOURCE" });
    const sel = document.getElementById("origem");
    const selecaoAnterior = sel.value;
    sel.innerHTML = '<option value="">Todas as origens</option>';
    origens
      .slice()
      .sort((a, b) => (a.NAME || "").localeCompare(b.NAME || ""))
      .forEach((o) => {
        const opt = document.createElement("option");
        opt.value = o.STATUS_ID;
        opt.textContent = `${o.NAME || o.STATUS_ID} (${o.STATUS_ID})`;
        sel.appendChild(opt);
      });
    if ([...sel.options].some((o) => o.value === selecaoAnterior)) sel.value = selecaoAnterior;
    atualizarStatus(`${origens.length} origem(ns) carregada(s).`);
  } catch (e) {
    mostrarErro(
      "Não consegui carregar a lista de origens.\n\n" +
      "Detalhe técnico: " + e.message + "\n\n" +
      "Se o erro for de permissão, o webhook precisa de acesso de leitura a crm.status.list " +
      "(categoria \"CRM\" nas permissões do webhook de entrada no Bitrix)."
    );
  } finally {
    document.getElementById("btnCarregarOrigens").disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Extração robusta: timeout por requisição, retentativa com backoff,
// respeito ao limite de chamadas do Bitrix, e retomada após o teto de segurança.
// ---------------------------------------------------------------------------

const TAMANHO_LOTE_SEGURANCA = 20000; // por chamada de "Extrair"/"Continuar"
const ATRASO_ENTRE_PAGINAS_MS = 350; // ~3 chamadas/seg, dentro do limite padrão do Bitrix
const TENTATIVAS_MAX = 5;
const TIMEOUT_REQUISICAO_MS = 30000;

let extracaoContexto = null; // guarda estado para permitir "Continuar extração"

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validarWebhook(webhook) {
  if (!webhook) return "Cole a URL do webhook no passo 1 antes de extrair.";
  if (!/^https?:\/\//i.test(webhook)) return "O webhook precisa começar com http:// ou https://.";
  if (!/\/rest\//i.test(webhook)) {
    return "Essa URL não parece um webhook de entrada do Bitrix24 (normalmente contém \"/rest/\"). Confira se copiou a URL certa.";
  }
  return null;
}

// Extrai só o domínio do webhook (ex: "empresa.bitrix24.com.br") para montar
// links diretos de "abrir no Bitrix" nos relatórios — nunca inclui o token.
function extrairDominioWebhook(webhook) {
  try { return new URL(webhook).host; } catch (e) { return ""; }
}

function validarPeriodo() {
  const inicio = document.getElementById("dataInicio").value;
  const fim = document.getElementById("dataFim").value;
  if (inicio && fim && inicio > fim) {
    return "A data \"De\" não pode ser depois da data \"Até\".";
  }
  return null;
}

function gerarHashSimples(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

window.FORCAR_ATUALIZACAO_BITRIX = false;
window.limparCacheBitrix = function() {
  try {
    Object.keys(localStorage).filter(k => k.startsWith("atlas_cache_")).forEach(k => localStorage.removeItem(k));
    console.log("Cache local do Bitrix limpo com sucesso.");
  } catch(e){}
};

// fetch com timeout (AbortController) + retentativa com backoff exponencial.
// Trata especificamente erro de limite de chamadas do Bitrix (QUERY_LIMIT_EXCEEDED).
async function bitrixFetchComRetentativa(url) {
  let fetchUrl = url;
  let fetchOptions = {};
  const parts = url.split("?");
  if (parts.length > 1 && parts[1].length > 0) {
    fetchUrl = parts[0];
    fetchOptions = {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: parts[1]
    };
  }

  const chaveCache = "atlas_cache_" + gerarHashSimples(fetchUrl + "|" + (fetchOptions.body || ""));
  if (!window.FORCAR_ATUALIZACAO_BITRIX) {
    try {
      const emCache = localStorage.getItem(chaveCache);
      if (emCache) {
        const parseado = JSON.parse(emCache);
        if (Date.now() - parseado.ts < 5 * 60 * 1000) { // 5 minutos de TTL
          return parseado.data;
        } else {
          localStorage.removeItem(chaveCache);
        }
      }
    } catch (e) {}
  }

  let ultimoErro = null;
  for (let tentativa = 1; tentativa <= TENTATIVAS_MAX; tentativa++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_REQUISICAO_MS);
    try {
      const resp = await fetch(fetchUrl, { ...fetchOptions, signal: controller.signal });
      clearTimeout(timer);
      
      let body;
      try { body = await resp.json(); } catch (e) {}

      if (resp.status === 429 || resp.status >= 500) {
        throw new Error(`HTTP ${resp.status} — ${resp.statusText} (temporário, será tentado de novo)`);
      }
      
      if (body && body.error === "QUERY_LIMIT_EXCEEDED") {
        throw new Error("QUERY_LIMIT_EXCEEDED (limite de chamadas do Bitrix, aguardando para tentar de novo)");
      }
      
      if (body && (body.error || body.error_description)) {
        // erro definitivo do Bitrix (filtro inválido, permissão, not found, etc.) — não adianta retentar
        const erroFinal = new Error(`Bitrix retornou erro: ${body.error || ""} — ${body.error_description || ""}`);
        erroFinal.definitivo = true;
        throw erroFinal;
      }
      
      if (!resp.ok) {
        const erroFinal = new Error(`HTTP ${resp.status} — ${resp.statusText}`);
        erroFinal.definitivo = (resp.status >= 400 && resp.status < 500 && resp.status !== 429);
        throw erroFinal;
      }
      
      try {
        localStorage.setItem(chaveCache, JSON.stringify({ ts: Date.now(), data: body }));
      } catch(e) {
        try {
           window.limparCacheBitrix();
           localStorage.setItem(chaveCache, JSON.stringify({ ts: Date.now(), data: body }));
        } catch(e2) {}
      }
      
      return body;
    } catch (e) {
      clearTimeout(timer);
      ultimoErro = e;
      if (e.definitivo) throw e;
      if (e.name === "AbortError") {
        ultimoErro = new Error(`Tempo esgotado (${TIMEOUT_REQUISICAO_MS / 1000}s) aguardando resposta do Bitrix.`);
      }
      if (tentativa < TENTATIVAS_MAX) {
        const espera = Math.min(1000 * 2 ** (tentativa - 1), 8000);
        atualizarStatus(`Falha temporária (tentativa ${tentativa}/${TENTATIVAS_MAX}): ${ultimoErro.message}. Tentando de novo em ${Math.round(espera / 1000)}s...`);
        await aguardar(espera);
      }
    }
  }
  throw ultimoErro;
}

