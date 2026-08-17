async function executarLoteExtracao() {
  const ctx = extracaoContexto;
  esconderErro();
  document.getElementById("spinner").style.display = "inline-block";
  document.getElementById("btnExtrair").disabled = true;
  document.getElementById("btnParar").disabled = false;
  document.getElementById("btnContinuar").classList.add("oculto");
  extracaoCancelada = false;

  const metaDoLote = ctx.acumulado.length + TAMANHO_LOTE_SEGURANCA;

  try {
    while (true) {
      if (extracaoCancelada) {
        atualizarStatus(`Parado pelo usuário. ${ctx.acumulado.length} registros extraídos até aqui.`);
        break;
      }
      const url = montarUrl(ctx.webhook, ctx.ent.method, ctx.campos, ctx.filtro, ctx.start);
      atualizarStatus(`Buscando... ${ctx.acumulado.length}${ctx.total !== null ? " / " + ctx.total : ""} registros`);
      const body = await bitrixFetchComRetentativa(url);
      const chunk = Array.isArray(body.result) ? body.result : Object.values(body.result || {});
      const merge = mesclarSemDuplicarPorId(ctx.acumulado, chunk);
      ctx.acumulado = merge.dados;
      ctx.duplicadosAPI = (ctx.duplicadosAPI || 0) + merge.duplicados;
      ctx.total = typeof body.total === "number" ? body.total : ctx.total;
      atualizarStatus(`Buscando... ${ctx.acumulado.length}${ctx.total !== null ? " / " + ctx.total : ""} registros`);

      const acabou = !body.next || chunk.length === 0;
      const bateuTeto = ctx.acumulado.length >= metaDoLote;
      if (acabou || bateuTeto) {
        ctx.terminou = acabou;
        if (bateuTeto && !acabou) {
          document.getElementById("btnContinuar").classList.remove("oculto");
          atualizarStatus(`Parado em ${ctx.acumulado.length} registros (lote de segurança de ${TAMANHO_LOTE_SEGURANCA} por vez${ctx.total !== null ? ", de " + ctx.total + " no total" : ""}). Clique em "Continuar extração" para buscar o restante.`);
        }
        break;
      }
      ctx.start = body.next;
      await aguardar(ATRASO_ENTRE_PAGINAS_MS);
    }

    dadosExtraidos = ctx.acumulado;
    camposExtraidos = ctx.campos;
    if (ctx.chave === "negocios") calcularDiasParadoNoEstagio();
    mostrarResultado();
    gerarCodigoPython(ctx.webhook, ctx.ent.method, ctx.campos, ctx.filtro);
    if (!extracaoCancelada && ctx.terminou) {
      atualizarStatus(`Concluído: ${ctx.acumulado.length} registros únicos${ctx.duplicadosAPI ? ` (${ctx.duplicadosAPI} duplicado(s) de paginação ignorado(s))` : ""}.`);
    }
  } catch (e) {
    mostrarErro(
      "A extração parou por causa de um erro" + (e.definitivo ? "" : " (mesmo após tentar de novo várias vezes)") + ".\n\n" +
      "Detalhe técnico: " + e.message + "\n\n" +
      (e.definitivo
        ? "Esse erro veio do próprio Bitrix (filtro, permissão do webhook ou campo inválido) — confira os filtros e o campo selecionado acima."
        : "Se o erro persistir, o motivo mais provável é bloqueio de CORS do Bitrix para chamadas feitas " +
          "de um arquivo HTML local (isso não é um erro no seu webhook). " +
          "Solução: copie o código Python equivalente e rode localmente — " +
          "ele usa a mesma variável de ambiente BITRIX24_WEBHOOK_URL dos outros " +
          "scripts deste projeto.") +
      (ctx.acumulado.length ? `\n\n${ctx.acumulado.length} registros já haviam sido extraídos antes do erro — clique em "Continuar extração" para tentar retomar de onde parou.` : "")
    );
    if (ctx.acumulado.length) {
      dadosExtraidos = ctx.acumulado;
      camposExtraidos = ctx.campos;
      if (ctx.chave === "negocios") calcularDiasParadoNoEstagio();
      mostrarResultado();
      document.getElementById("btnContinuar").classList.remove("oculto");
    }
    gerarCodigoPython(ctx.webhook, ctx.ent.method, ctx.campos, ctx.filtro);
  } finally {
    document.getElementById("spinner").style.display = "none";
    document.getElementById("btnExtrair").disabled = false;
    document.getElementById("btnParar").disabled = true;
  }
}

async function extrair() {
  const webhook = document.getElementById("webhook").value.trim();
  const erroWebhook = validarWebhook(webhook);
  if (erroWebhook) {
    mostrarErro(erroWebhook);
    return;
  }
  const erroPeriodo = validarPeriodo();
  if (erroPeriodo) {
    mostrarErro(erroPeriodo);
    return;
  }

  const chaveEnt = document.getElementById("entidade").value;
  const ent = ENTIDADES[chaveEnt];

  document.getElementById("bloco-resultado").classList.add("oculto");
  document.getElementById("bloco-resultado-completo").classList.add("oculto");
  document.getElementById("bloco-auditoria-jornada").classList.add("oculto");
  document.getElementById("bloco-forecast-semanal").classList.add("oculto");
  document.getElementById("bloco-diario-sdr").classList.add("oculto");
  document.getElementById("bloco-analise-sdr").classList.add("oculto");
  document.getElementById("bloco-relatorio-catalogo").classList.add("oculto");
  document.getElementById("bloco-produtos").classList.add("oculto");
  document.getElementById("bloco-python").classList.add("oculto");
  document.getElementById("btnContinuar").classList.add("oculto");
  dadosProdutos = [];
  resultadoForecastSemanal = {};
  resultadoDiarioSDR = {};
  resultadoAnaliseSDR = {};
  resultadoRelatorioCatalogo = {};

  const chaveRelatorio = document.getElementById("relatorio").value;
  if (chaveRelatorio) {
    resultadoCompleto = {};
    dadosExtraidos = [];
    const rel = RELATORIOS[chaveRelatorio];
    if (rel.handler === "jornada") await extrairJornada(webhook);
    else if (rel.handler === "forecast_semanal") await extrairForecastSemanal(webhook);
    else if (rel.handler === "diario_sdr") await extrairDiarioSDR(webhook);
    else if (rel.handler === "analise_sdr") await extrairAnaliseSDR(webhook);
    else await extrairRelatorioCatalogo(webhook, chaveRelatorio);
    return;
  }

  if (ent.especial) {
    resultadoCompleto = {};
    dadosExtraidos = [];
    if (ent.jornada) {
      await extrairJornada(webhook);
    } else if (ent.forecastSemanal) {
      await extrairForecastSemanal(webhook);
    } else if (ent.diarioSdr) {
      await extrairDiarioSDR(webhook);
    } else if (ent.analiseSdr) {
      await extrairAnaliseSDR(webhook);
    } else {
      await extrairTudo(webhook);
    }
    return;
  }

  const campos = camposSelecionados();
  if (campos.length === 0) {
    mostrarErro("Selecione pelo menos um campo para extrair.");
    return;
  }
  const filtro = montarFiltro();
  resultadoCompleto = {};

  extracaoContexto = { webhook, ent, chave: chaveEnt, campos, filtro, start: 0, total: null, acumulado: [], terminou: false, duplicadosAPI: 0 };
  await executarLoteExtracao();
}

// ---------------------------------------------------------------------------
// Extração completa (modo "tudo"): percorre todas as sub-entidades do Bitrix,
// descobrindo os campos dinamicamente via "*.fields" sempre que o método existe.
// ---------------------------------------------------------------------------

async function buscarCamposDinamicos(webhook, fieldsMethod) {
  const url = `${webhook.replace(/\/$/, "")}/${fieldsMethod}.json`;
  const body = await bitrixFetchComRetentativa(url);
  return Object.keys(body.result || {});
}

async function extrairEntidadeCompleta(webhook, sub) {
  const campos = sub.fieldsMethod ? await buscarCamposDinamicos(webhook, sub.fieldsMethod) : sub.camposFixos;

  const filtro = {};
  if (!sub.semFiltroData) {
    const inicio = document.getElementById("dataInicio").value;
    const fim = document.getElementById("dataFim").value;
    if (inicio) filtro[">=" + sub.campoData] = inicio + "T00:00:00-03:00";
    if (fim) filtro["<=" + sub.campoData] = fim + "T23:59:59-03:00";
  }

  let start = 0;
  let acumulado = [];
  let total = null;
  while (true) {
    if (extracaoCancelada) break;
    const url = montarUrl(webhook, sub.method, campos, filtro, start);
    atualizarStatus(`[${sub.label}] buscando... ${acumulado.length}${total !== null ? " / " + total : ""} registros`);
    const body = await bitrixFetchComRetentativa(url);
    const chunk = Array.isArray(body.result) ? body.result : Object.values(body.result || {});
    const merge = mesclarSemDuplicarPorId(acumulado, chunk);
    acumulado = merge.dados;
    total = typeof body.total === "number" ? body.total : total;

    const acabou = !body.next || chunk.length === 0;
    if (acabou) break;
    start = body.next;
    await aguardar(ATRASO_ENTRE_PAGINAS_MS);
  }
  return { label: sub.label, campos, dados: acumulado, total, completo: total === null || acumulado.length === total };
}

async function extrairTudo(webhook) {
  document.getElementById("spinner").style.display = "inline-block";
  document.getElementById("btnExtrair").disabled = true;
  document.getElementById("btnParar").disabled = false;
  extracaoCancelada = false;
  esconderErro();
  resultadoCompleto = {};

  try {
    for (const sub of SUBENTIDADES_TUDO) {
      if (extracaoCancelada) {
        atualizarStatus(`Parado pelo usuário após ${Object.keys(resultadoCompleto).length} de ${SUBENTIDADES_TUDO.length} entidades.`);
        break;
      }
      resultadoCompleto[sub.chave] = await extrairEntidadeCompleta(webhook, sub);
      atualizarStatus(`[${sub.label}] concluído: ${resultadoCompleto[sub.chave].dados.length} registros.`);
      await aguardar(ATRASO_ENTRE_PAGINAS_MS);
    }
    mostrarResultadoCompleto();
    if (!extracaoCancelada) {
      const totalGeral = Object.values(resultadoCompleto).reduce((acc, r) => acc + r.dados.length, 0);
      atualizarStatus(`Extração completa concluída: ${totalGeral} registros no total, em ${Object.keys(resultadoCompleto).length} entidades. Veja o resumo abaixo.`);
    }
  } catch (e) {
    mostrarErro(
      "A extração completa parou por causa de um erro" + (e.definitivo ? "" : " (mesmo após tentar de novo várias vezes)") + ".\n\n" +
      "Detalhe técnico: " + e.message + "\n\n" +
      (e.definitivo
        ? "Esse erro veio do próprio Bitrix — confira se o webhook tem permissão de leitura de CRM (negócios, leads, empresas, contatos, atividades) e de usuários."
        : "Se persistir, o motivo mais provável é bloqueio de CORS do Bitrix para chamadas feitas de um arquivo HTML local — use o código Python equivalente do passo 8 rodando localmente.") +
      (Object.keys(resultadoCompleto).length ? `\n\nAs entidades já concluídas antes do erro (${Object.keys(resultadoCompleto).map((k) => resultadoCompleto[k].label).join(", ")}) foram mantidas no resumo abaixo.` : "")
    );
    if (Object.keys(resultadoCompleto).length) mostrarResultadoCompleto();
  } finally {
    document.getElementById("spinner").style.display = "none";
    document.getElementById("btnExtrair").disabled = false;
    document.getElementById("btnParar").disabled = true;
  }
}

function mostrarResultadoCompleto() {
  const bloco = document.getElementById("bloco-resultado-completo");
  bloco.classList.remove("oculto");
  const cont = document.getElementById("entidades-lista");
  cont.innerHTML = "";

  Object.entries(resultadoCompleto).forEach(([chave, r]) => {
    const div = document.createElement("div");
    div.className = "entidade-card";
    div.innerHTML = `
      <h3>${r.label}</h3>
      <div class="contagem">${r.dados.length}</div>
      <div class="campos-info">registro(s) · ${r.campos.length} campos${r.total !== null ? " · " + r.total + " no total do Bitrix" : ""}${r.completo === false ? ' · <span style="color:var(--danger);">incompleto</span>' : ""}</div>
      <div class="botoes">
        <button type="button" class="secundario" onclick="baixarCSVEntidade('${chave}')">CSV</button>
        <button type="button" class="secundario" onclick="baixarJSONEntidade('${chave}')">JSON</button>
      </div>`;
    cont.appendChild(div);
  });
}

// ---------------------------------------------------------------------------
// Jornada do Cliente: busca negócios de TODOS os funis/pipelines de uma vez
// (sem filtrar CATEGORY_ID), com todos os campos existentes (via crm.deal.fields,
// mesma técnica de buscarCamposDinamicos() usada na Extração completa), agrupa
// por empresa (COMPANY_ID) e ordena cada grupo por DATE_CREATE — para enxergar,
// numa tabela só, o caminho de cada cliente entre os funis (ex: Comercial →
// Financeiro → Implantação → Pós-Vendas → Sucesso do Cliente).
// ---------------------------------------------------------------------------



async function continuarExtracao() {
  if (!extracaoContexto) return;
  await executarLoteExtracao();
}

function pararExtracao() {
  extracaoCancelada = true;
}

function atualizarStatus(msg) {
  document.getElementById("statusTexto").textContent = msg;
}

function mostrarErro(msg) {
  const area = document.getElementById("areaErro");
  area.textContent = msg;
  area.classList.remove("oculto");
}

function esconderErro() {
  document.getElementById("areaErro").classList.add("oculto");
}

// ---------------------------------------------------------------------------
// "Dias parado no estágio": campo calculado (não vem do Bitrix) — diferença em
// dias entre agora e MOVED_TIME (data da última mudança de estágio do negócio).
// Só roda se MOVED_TIME estiver entre os campos extraídos; some/reaparece
// conforme o usuário marca/desmarca esse campo no passo 4.
// ---------------------------------------------------------------------------

function calcularDiasParadoNoEstagio() {
  const CAMPO = "DIAS_PARADO_NO_ESTAGIO";
  if (!camposExtraidos.includes("MOVED_TIME")) {
    camposExtraidos = camposExtraidos.filter((c) => c !== CAMPO);
    return;
  }
  const agora = Date.now();
  dadosExtraidos.forEach((registro) => {
    if (!registro.MOVED_TIME) {
      registro[CAMPO] = "";
      return;
    }
    const dias = Math.floor((agora - new Date(registro.MOVED_TIME).getTime()) / 86400000);
    registro[CAMPO] = dias >= 0 ? dias : 0;
  });
  if (!camposExtraidos.includes(CAMPO)) {
    camposExtraidos = [...camposExtraidos, CAMPO];
  }
}

// ---------------------------------------------------------------------------
// Resultado / download
// ---------------------------------------------------------------------------

function mostrarResultado() {
  const bloco = document.getElementById("bloco-resultado");
  bloco.classList.remove("oculto");
  document.getElementById("totalRegistros").textContent = `${dadosExtraidos.length} registros`;

  const chaveEnt = document.getElementById("entidade").value;
  const btnProdutos = document.getElementById("btnProdutos");
  const podeProdutos = chaveEnt === "negocios" && dadosExtraidos.length > 0 && camposExtraidos.includes("ID");
  btnProdutos.classList.toggle("oculto", !podeProdutos);
  document.getElementById("bloco-campos-produtos").classList.toggle("oculto", !podeProdutos);
  document.getElementById("bloco-produtos").classList.add("oculto");
  dadosProdutos = [];

  if (camposExtraidos.includes("OPPORTUNITY")) {
    const soma = dadosExtraidos.reduce((acc, r) => acc + (parseFloat(r.OPPORTUNITY) || 0), 0);
    document.getElementById("totalValor").textContent =
      "Soma de OPPORTUNITY: R$ " + soma.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else {
    document.getElementById("totalValor").textContent = "";
  }

  const wrapper = document.getElementById("tabela-wrapper");
  wrapper.innerHTML = "";
  if (dadosExtraidos.length === 0) {
    wrapper.innerHTML = "<p class='rodape-nota'>Nenhum registro encontrado com esses filtros.</p>";
    return;
  }
  const tabela = document.createElement("table");
  const thead = document.createElement("thead");
  const trHead = document.createElement("tr");
  camposExtraidos.forEach((c) => {
    const th = document.createElement("th");
    th.textContent = c;
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);
  tabela.appendChild(thead);

  const tbody = document.createElement("tbody");
  dadosExtraidos.slice(0, 50).forEach((registro) => {
    const tr = document.createElement("tr");
    camposExtraidos.forEach((c) => {
      const td = document.createElement("td");
      td.textContent = registro[c] ?? "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  tabela.appendChild(tbody);
  wrapper.appendChild(tabela);
}

// ---------------------------------------------------------------------------
// Produtos por negócio: para cada negócio já extraído (passo 6), busca as
// linhas de produto (crm.deal.productrows.get) e o nome da empresa
// (crm.company.get, com cache) — gera uma linha por produto vendido.
// ---------------------------------------------------------------------------

async function buscarProdutosDosNegocios() {
  const chaveEnt = document.getElementById("entidade").value;
  if (chaveEnt !== "negocios" || !dadosExtraidos.length) return;

  const webhook = document.getElementById("webhook").value.trim();
  const erroWebhook = validarWebhook(webhook);
  if (erroWebhook) {
    mostrarErro(erroWebhook);
    return;
  }
  const campos = camposProdutosSelecionados();
  if (campos.length === 0) {
    mostrarErro("Selecione pelo menos um campo de produto (seção acima) antes de buscar.");
    return;
  }
  camposProdutosAtual = campos;

  esconderErro();
  document.getElementById("spinner").style.display = "inline-block";
  document.getElementById("btnProdutos").disabled = true;
  document.getElementById("btnParar").disabled = false;
  extracaoCancelada = false;

  const cacheEmpresas = {};
  const linhas = [];

  try {
    for (let i = 0; i < dadosExtraidos.length; i++) {
      if (extracaoCancelada) {
        atualizarStatus(`Parado pelo usuário após ${i} de ${dadosExtraidos.length} negócio(s).`);
        break;
      }
      const negocio = dadosExtraidos[i];
      atualizarStatus(`Buscando produtos... negócio ${i + 1}/${dadosExtraidos.length} (ID ${negocio.ID})`);

      let nomeCliente = negocio.TITLE || "";
      if (negocio.COMPANY_ID) {
        if (!(negocio.COMPANY_ID in cacheEmpresas)) {
          const urlEmpresa = `${webhook.replace(/\/$/, "")}/crm.company.get.json?id=${encodeURIComponent(negocio.COMPANY_ID)}`;
          const bodyEmpresa = await bitrixFetchComRetentativa(urlEmpresa);
          cacheEmpresas[negocio.COMPANY_ID] = (bodyEmpresa.result || {}).TITLE || null;
          await aguardar(ATRASO_ENTRE_PAGINAS_MS);
        }
        nomeCliente = cacheEmpresas[negocio.COMPANY_ID] || nomeCliente;
      }

      const urlProdutos = `${webhook.replace(/\/$/, "")}/crm.deal.productrows.get.json?id=${encodeURIComponent(negocio.ID)}`;
      const bodyProdutos = await bitrixFetchComRetentativa(urlProdutos);
      const produtos = bodyProdutos.result || [];
      await aguardar(ATRASO_ENTRE_PAGINAS_MS);

      if (produtos.length === 0) {
        linhas.push(construirLinhaProduto(nomeCliente, negocio, null, campos));
      } else {
        produtos.forEach((p) => {
          linhas.push(construirLinhaProduto(nomeCliente, negocio, p, campos));
        });
      }
    }

    dadosProdutos = linhas;
    mostrarResultadoProdutos();
    gerarCodigoPythonProdutos(dadosExtraidos, campos);
    if (!extracaoCancelada) {
      atualizarStatus(`Concluído: produtos de ${dadosExtraidos.length} negócio(s) extraídos (${linhas.length} linha(s)).`);
    }
  } catch (e) {
    mostrarErro(
      "A busca de produtos parou por causa de um erro" + (e.definitivo ? "" : " (mesmo após tentar de novo várias vezes)") + ".\n\n" +
      "Detalhe técnico: " + e.message + "\n\n" +
      (e.definitivo
        ? "Esse erro veio do próprio Bitrix — confira se o webhook tem permissão de leitura para crm.deal.productrows.get e crm.company.get."
        : "Se persistir, o motivo mais provável é bloqueio de CORS do Bitrix para chamadas feitas de um arquivo HTML local — use o código Python gerado logo abaixo (passo 8), que já roda essa mesma busca localmente.") +
      (linhas.length ? `\n\n${linhas.length} linha(s) de produto já haviam sido extraídas antes do erro — foram mantidas no resultado abaixo.` : "")
    );
    if (linhas.length) {
      dadosProdutos = linhas;
      mostrarResultadoProdutos();
    }
    gerarCodigoPythonProdutos(dadosExtraidos, campos);
  } finally {
    document.getElementById("spinner").style.display = "none";
    document.getElementById("btnProdutos").disabled = false;
    document.getElementById("btnParar").disabled = true;
  }
}

// Monta uma linha de resultado só com os campos marcados no passo "Campos de
// produto a extrair" — mistura contexto do negócio/empresa (já em memória) com
// os campos crus devolvidos por crm.deal.productrows.get. `p` é null quando o
// negócio não tem nenhuma linha de produto no CRM.
function construirLinhaProduto(nomeCliente, negocio, p, camposAlvo) {
  const registro = {};
  camposAlvo.forEach((code) => {
    if (code === "cliente") registro.cliente = nomeCliente;
    else if (code === "negocio_id") registro.negocio_id = negocio.ID;
    else if (code === "negocio_titulo") registro.negocio_titulo = negocio.TITLE || "";
    else if (code === "valor_total_negocio") registro.valor_total_negocio = negocio.OPPORTUNITY || "";
    else registro[code] = p ? (p[code] ?? "") : "";
  });
  if (!p && camposAlvo.includes("PRODUCT_NAME")) {
    registro.PRODUCT_NAME = "(sem linhas de produto no CRM)";
  }
  return registro;
}

// Gera, dentro da própria página (bloco "Equivalente em Python", passo 8), o
// script que busca crm.deal.productrows.get + crm.company.get para os negócios
// já extraídos — mesmo padrão de gerarCodigoPython(): lê o webhook de
// BITRIX24_WEBHOOK_URL, nunca embute o valor da chave no código gerado.
function gerarCodigoPythonProdutos(negocios, campos) {
  const bloco = document.getElementById("bloco-python");
  bloco.classList.remove("oculto");

  const dealsPy = negocios
    .map((n) => {
      const companyPy = n.COMPANY_ID ? `"${n.COMPANY_ID}"` : "None";
      return `    {"ID": "${n.ID}", "TITLE": ${JSON.stringify(n.TITLE || "")}, "COMPANY_ID": ${companyPy}, "OPPORTUNITY": "${n.OPPORTUNITY || ""}"},`;
    })
    .join("\n");
  const camposPy = campos.map((c) => `"${c}"`).join(", ");

  const codigo = `import os, json, csv, time, urllib.request, urllib.parse, urllib.error

WEBHOOK_URL = os.environ.get("BITRIX24_WEBHOOK_URL", "").rstrip("/")
if not WEBHOOK_URL:
    raise SystemExit("Defina BITRIX24_WEBHOOK_URL antes de rodar (nunca cole o webhook aqui no código).")
if "/rest/" not in WEBHOOK_URL:
    raise SystemExit("BITRIX24_WEBHOOK_URL não parece um webhook de entrada do Bitrix24 (deveria conter \\"/rest/\\").")

# Negócios extraídos na página (passo 6) no momento em que este código foi gerado.
DEALS = [
${dealsPy}
]

# Campos marcados em "Campos de produto a extrair" no momento em que este código foi gerado.
CAMPOS = [${camposPy}]

TENTATIVAS_MAX = 5
TIMEOUT_SEGUNDOS = 30
ATRASO_ENTRE_CHAMADAS = 0.35  # ~3 chamadas/seg, dentro do limite padrão do Bitrix

def bitrix_call(method, params):
    url = f"{WEBHOOK_URL}/{method}.json"
    data = urllib.parse.urlencode(params, doseq=True).encode("utf-8")
    ultimo_erro = None
    for tentativa in range(1, TENTATIVAS_MAX + 1):
        try:
            req = urllib.request.Request(url, data=data, method="POST")
            with urllib.request.urlopen(req, timeout=TIMEOUT_SEGUNDOS) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            if body.get("error") == "QUERY_LIMIT_EXCEEDED":
                raise RuntimeError("QUERY_LIMIT_EXCEEDED (limite de chamadas do Bitrix)")
            if "error" in body:
                raise SystemExit(f"Bitrix retornou erro definitivo: {body}")
            return body
        except SystemExit:
            raise
        except (urllib.error.URLError, TimeoutError, RuntimeError, json.JSONDecodeError) as e:
            ultimo_erro = e
            if tentativa < TENTATIVAS_MAX:
                espera = min(2 ** (tentativa - 1), 8)
                print(f"  falha temporária (tentativa {tentativa}/{TENTATIVAS_MAX}): {e} — tentando de novo em {espera}s")
                time.sleep(espera)
    raise RuntimeError(f"Falhou após {TENTATIVAS_MAX} tentativas: {ultimo_erro}")

def buscar_nome_empresa(cache, company_id):
    if not company_id:
        return None
    if company_id in cache:
        return cache[company_id]
    body = bitrix_call("crm.company.get", {"id": company_id})
    nome = (body.get("result") or {}).get("TITLE")
    cache[company_id] = nome
    time.sleep(ATRASO_ENTRE_CHAMADAS)
    return nome

def montar_linha(nome_cliente, deal, produto):
    # Mesma lógica de construirLinhaProduto() no HTML: mistura contexto do
    # negócio/empresa com os campos crus da linha de produto (ou None se o
    # negócio não tiver nenhuma linha cadastrada).
    linha = {}
    for campo in CAMPOS:
        if campo == "cliente":
            linha["cliente"] = nome_cliente
        elif campo == "negocio_id":
            linha["negocio_id"] = deal["ID"]
        elif campo == "negocio_titulo":
            linha["negocio_titulo"] = deal["TITLE"]
        elif campo == "valor_total_negocio":
            linha["valor_total_negocio"] = deal["OPPORTUNITY"]
        else:
            linha[campo] = (produto or {}).get(campo, "")
    if produto is None and "PRODUCT_NAME" in CAMPOS:
        linha["PRODUCT_NAME"] = "(sem linhas de produto no CRM)"
    return linha

def main():
    empresas_cache = {}
    linhas = []

    for deal in DEALS:
        nome_cliente = buscar_nome_empresa(empresas_cache, deal["COMPANY_ID"]) or deal["TITLE"]

        body = bitrix_call("crm.deal.productrows.get", {"id": deal["ID"]})
        produtos = body.get("result", [])
        time.sleep(ATRASO_ENTRE_CHAMADAS)

        if not produtos:
            linhas.append(montar_linha(nome_cliente, deal, None))
        else:
            for p in produtos:
                linhas.append(montar_linha(nome_cliente, deal, p))

        print(f"OK: negócio {deal['ID']} ({nome_cliente}) — {len(produtos)} linha(s) de produto")

    with open("produtos_negocios.json", "w", encoding="utf-8") as f:
        json.dump(linhas, f, ensure_ascii=False, indent=2)
    if linhas:
        with open("produtos_negocios.csv", "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=CAMPOS)
            w.writeheader()
            w.writerows(linhas)
    print(f"Pronto: {len(linhas)} linha(s) em produtos_negocios.json / .csv")

if __name__ == "__main__":
    main()
`;
  document.getElementById("codigoPython").textContent = codigo;
}

let dadosProdutosFiltrados = [];

function mostrarResultadoProdutos() {
  document.getElementById("filtroProduto").value = "";
  aplicarFiltroProdutos();
}

// Filtro por texto (produto ou qualquer outro campo da linha) aplicado no
// resultado já extraído — o Bitrix não permite filtrar a lista de negócios
// por produto na consulta, então isso é feito no navegador depois da busca.
function aplicarFiltroProdutos() {
  const termo = document.getElementById("filtroProduto").value.trim().toLowerCase();
  dadosProdutosFiltrados = !termo
    ? dadosProdutos
    : dadosProdutos.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(termo)));
  renderizarTabelaProdutos();
}

function renderizarTabelaProdutos() {
  const bloco = document.getElementById("bloco-produtos");
  bloco.classList.remove("oculto");
  document.getElementById("totalLinhasProdutos").textContent =
    dadosProdutosFiltrados.length === dadosProdutos.length
      ? `${dadosProdutos.length} linha(s) de produto`
      : `${dadosProdutosFiltrados.length} de ${dadosProdutos.length} linha(s) de produto`;

  const wrapper = document.getElementById("tabela-produtos-wrapper");
  wrapper.innerHTML = "";
  if (dadosProdutosFiltrados.length === 0) {
    wrapper.innerHTML = "<p class='rodape-nota'>Nenhuma linha de produto encontrada.</p>";
    return;
  }
  const tabela = document.createElement("table");
  const thead = document.createElement("thead");
  const trHead = document.createElement("tr");
  camposProdutosAtual.forEach((c) => {
    const th = document.createElement("th");
    th.textContent = c;
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);
  tabela.appendChild(thead);

  const tbody = document.createElement("tbody");
  dadosProdutosFiltrados.slice(0, 200).forEach((registro) => {
    const tr = document.createElement("tr");
    camposProdutosAtual.forEach((c) => {
      const td = document.createElement("td");
      td.textContent = registro[c] ?? "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  tabela.appendChild(tbody);
  wrapper.appendChild(tabela);
}

function baixarCSVProdutos() {
  if (dadosProdutosFiltrados.length === 0) return;
  const linhas = [camposProdutosAtual.join(";")];
  dadosProdutosFiltrados.forEach((registro) => {
    const linha = camposProdutosAtual.map((c) => {
      let v = registro[c];
      if (v === null || v === undefined) v = "";
      v = String(v).replace(/"/g, '""');
      if (v.includes(";") || v.includes("\n") || v.includes('"')) v = `"${v}"`;
      return v;
    });
    linhas.push(linha.join(";"));
  });
  baixarArquivo("﻿" + linhas.join("\r\n"), `bitrix_produtos_negocios_${dataHoje()}.csv`, "text/csv;charset=utf-8;");
}

function baixarJSONProdutos() {
  if (dadosProdutosFiltrados.length === 0) return;
  baixarArquivo(JSON.stringify(dadosProdutosFiltrados, null, 2), `bitrix_produtos_negocios_${dataHoje()}.json`, "application/json;charset=utf-8;");
}

