function baixarCsvDatasetEspecial(dados, nome) {
  if (!dados?.length) return;
  const campos = camposDeDados(dados);
  baixarArquivo("﻿" + linhasCSVDe(campos, dados), nome, "text/csv;charset=utf-8;");
}

function baixarCSVForecastNegocios() {
  baixarCsvDatasetEspecial(resultadoForecastSemanal?.negocios, `bitrix_forecast_semanal_negocios_${dataHoje()}.csv`);
}
function baixarCSVForecastVendedores() {
  baixarCsvDatasetEspecial(resultadoForecastSemanal?.vendedores, `bitrix_forecast_semanal_vendedores_${dataHoje()}.csv`);
}
function baixarJSONForecast() {
  if (!resultadoForecastSemanal?.resumo) return;
  baixarArquivo(JSON.stringify(resultadoForecastSemanal, null, 2), `bitrix_forecast_semanal_${dataHoje()}.json`, "application/json;charset=utf-8;");
}


function baixarCSVAnaliseSdrDiario() {
  baixarCsvDatasetEspecial(resultadoAnaliseSDR?.diario, `bitrix_analise_sdr_atividades_diarias_${dataHoje()}.csv`);
}
function baixarCSVAnaliseSdrClientes() {
  baixarCsvDatasetEspecial(resultadoAnaliseSDR?.clientes_atividades, `bitrix_analise_sdr_clientes_${dataHoje()}.csv`);
}
function baixarCSVAnaliseSdrConversoes() {
  baixarCsvDatasetEspecial(resultadoAnaliseSDR?.conversoes, `bitrix_analise_sdr_conversoes_${dataHoje()}.csv`);
}
function baixarCSVAnaliseSdrJornada() {
  baixarCsvDatasetEspecial(resultadoAnaliseSDR?.jornada_leads, `bitrix_analise_sdr_jornada_leads_${dataHoje()}.csv`);
}
function baixarCSVAnaliseSdrBacklog() {
  baixarCsvDatasetEspecial(resultadoAnaliseSDR?.backlog, `bitrix_analise_sdr_backlog_${dataHoje()}.csv`);
}
function baixarJSONAnaliseSdr() {
  if (!resultadoAnaliseSDR?.resumo) return;
  baixarArquivo(JSON.stringify(resultadoAnaliseSDR, null, 2), `bitrix_analise_sdr_semanal_mensal_${dataHoje()}.json`, "application/json;charset=utf-8;");
}

function baixarCSVAtividadesDiarioSDR() {
  baixarCsvDatasetEspecial(resultadoDiarioSDR?.atividades_sdr, `bitrix_diario_sdr_atividades_${dataHoje()}.csv`);
}
function baixarCSVLeadsAtendidosDiarioSDR() {
  baixarCsvDatasetEspecial(resultadoDiarioSDR?.leads_atendidos, `bitrix_diario_sdr_leads_atendidos_${dataHoje()}.csv`);
}
function baixarCSVPotenciaisLeadsSDR() {
  baixarCsvDatasetEspecial(resultadoDiarioSDR?.potenciais_leads, `bitrix_diario_sdr_potenciais_leads_${dataHoje()}.csv`);
}
function baixarCSVPotenciaisNegociosSDR() {
  baixarCsvDatasetEspecial(resultadoDiarioSDR?.potenciais_negocios, `bitrix_diario_sdr_potenciais_negocios_${dataHoje()}.csv`);
}
function baixarJSONDiarioSDR() {
  if (!resultadoDiarioSDR?.resumo) return;
  baixarArquivo(JSON.stringify(resultadoDiarioSDR, null, 2), `bitrix_diario_sdr_${dataHoje()}.json`, "application/json;charset=utf-8;");
}

function linhasCSVDe(campos, dados) {
  const linhas = [campos.join(";")];
  dados.forEach((registro) => {
    const linha = campos.map((c) => {
      let v = registro[c];
      if (v === null || v === undefined) v = "";
      if (typeof v === "object") v = JSON.stringify(v);
      v = String(v).replace(/"/g, '""');
      if (v.includes(";") || v.includes("\n") || v.includes('"')) v = `"${v}"`;
      return v;
    });
    linhas.push(linha.join(";"));
  });
  return linhas.join("\r\n");
}

function baixarCSVEntidade(chave) {
  const r = resultadoCompleto[chave];
  if (!r || r.dados.length === 0) return;
  baixarArquivo("﻿" + linhasCSVDe(r.campos, r.dados), `bitrix_tudo_${chave}_${dataHoje()}.csv`, "text/csv;charset=utf-8;");
}

function baixarJSONEntidade(chave) {
  const r = resultadoCompleto[chave];
  if (!r || r.dados.length === 0) return;
  baixarArquivo(JSON.stringify(r.dados, null, 2), `bitrix_tudo_${chave}_${dataHoje()}.json`, "application/json;charset=utf-8;");
}

function baixarJSONCompleto() {
  if (!Object.keys(resultadoCompleto).length) return;
  const combinado = {};
  Object.entries(resultadoCompleto).forEach(([chave, r]) => {
    combinado[chave] = { campos: r.campos, total_no_bitrix: r.total, registros_extraidos: r.dados.length, dados: r.dados };
  });
  baixarArquivo(JSON.stringify(combinado, null, 2), `bitrix_extracao_completa_${dataHoje()}.json`, "application/json;charset=utf-8;");
}

// ---------------------------------------------------------------------------
// Analisar com IA: monta um prompt (pergunta do usuário + dados extraídos)
// pronto para colar em qualquer IA — nenhum dado é enviado automaticamente.
// ---------------------------------------------------------------------------

const LIMITE_CARACTERES_PROMPT = 400000; // margem de segurança para colar direto num chat

function coletarDadosParaPrompt() {
  if (resultadoRelatorioCatalogo && resultadoRelatorioCatalogo.titulo) {
    return { modo: `Relatório: ${resultadoRelatorioCatalogo.titulo}`, conteudo: resultadoRelatorioCatalogo };
  }
  if (resultadoAnaliseSDR && resultadoAnaliseSDR.resumo) {
    return { modo: "Análise SDR semanal e mensal (atividades, jornada e conversões)", conteudo: resultadoAnaliseSDR };
  }
  if (resultadoForecastSemanal && resultadoForecastSemanal.resumo) {
    return { modo: "Forecast semanal do Comercial", conteudo: resultadoForecastSemanal };
  }
  if (resultadoDiarioSDR && resultadoDiarioSDR.resumo) {
    return { modo: "Relatório diário SDR (atividades, leads atendidos e potenciais)", conteudo: resultadoDiarioSDR };
  }
  if (resultadoCompleto && Object.keys(resultadoCompleto).length) {
    const obj = {};
    Object.entries(resultadoCompleto).forEach(([chave, r]) => {
      obj[chave] = { campos: r.campos, total_no_bitrix: r.total, registros_extraidos: r.dados.length, dados: r.dados };
    });
    return { modo: "extração completa (negócios, leads, empresas, contatos, atividades e usuários)", conteudo: obj };
  }
  if (dadosExtraidos && dadosExtraidos.length) {
    const selEntidade = document.getElementById("entidade");
    const rotulo = selEntidade.options[selEntidade.selectedIndex] ? selEntidade.options[selEntidade.selectedIndex].textContent : "";
    return { modo: `extração de "${rotulo}"`, conteudo: dadosExtraidos };
  }
  return null;
}

function gerarPromptIA() {
  const pergunta = document.getElementById("perguntaIA").value.trim();
  if (!pergunta) {
    mostrarErro("Escreva o que você quer que a IA analise antes de gerar o prompt.");
    return;
  }
  const pacote = coletarDadosParaPrompt();
  if (!pacote) {
    mostrarErro("Extraia algum dado primeiro (passo 5) antes de gerar o prompt de análise.");
    return;
  }

  let dadosTexto = JSON.stringify(pacote.conteudo, null, 2);
  let aviso = "";
  if (dadosTexto.length > LIMITE_CARACTERES_PROMPT) {
    dadosTexto = dadosTexto.slice(0, LIMITE_CARACTERES_PROMPT);
    aviso = `⚠️ Os dados extraídos são grandes demais para caber inteiros neste prompt — foram cortados em ${LIMITE_CARACTERES_PROMPT.toLocaleString("pt-BR")} caracteres. Para uma análise sobre a base completa, baixe o(s) arquivo(s) JSON/CSV no passo 6 e anexe-os na conversa com a IA em vez de colar só este texto.`;
  }

  const prompt = `Você está analisando dados extraídos do CRM Bitrix24 da AtlasGR (${pacote.modo}).

O que eu quero que você faça com esses dados:
${pergunta}

Dados extraídos (JSON):
\`\`\`json
${dadosTexto}
\`\`\``;

  document.getElementById("promptIA").textContent = prompt;
  document.getElementById("avisoTamanhoPrompt").textContent = aviso;
  document.getElementById("bloco-prompt-ia").classList.remove("oculto");
  esconderErro();
}

function copiarPromptIA() {
  const texto = document.getElementById("promptIA").textContent;
  navigator.clipboard.writeText(texto).then(() => {
    atualizarStatus("Prompt copiado para a área de transferência — cole na conversa com sua IA.");
  });
}

function baixarPromptIA() {
  const texto = document.getElementById("promptIA").textContent;
  baixarArquivo(texto, `prompt_analise_bitrix_${dataHoje()}.txt`, "text/plain;charset=utf-8;");
}


function gerarCodigoPython(webhook, method, campos, filtro) {
  const bloco = document.getElementById("bloco-python");
  bloco.classList.remove("oculto");
  const camposPy = campos.map((c) => `"${c}"`).join(", ");
  const filtroLinhas = Object.entries(filtro)
    .map(([chave, valor]) => `    "filter[${chave}]": "${valor}",`)
    .join("\n");

  const codigo = `import os, json, csv, time, urllib.request, urllib.parse, urllib.error

WEBHOOK_URL = os.environ.get("BITRIX_WEBHOOK_URL", "").rstrip("/")
if not WEBHOOK_URL:
    raise SystemExit("Defina BITRIX_WEBHOOK_URL antes de rodar (nunca cole o webhook aqui no código).")
if "/rest/" not in WEBHOOK_URL:
    raise SystemExit("BITRIX_WEBHOOK_URL não parece um webhook de entrada do Bitrix24 (deveria conter \\"/rest/\\").")

METHOD = "${method}"
SELECT = [${camposPy}]
FILTRO_BASE = {
${filtroLinhas || "    # sem filtros"}
}

TENTATIVAS_MAX = 5
TIMEOUT_SEGUNDOS = 30
ATRASO_ENTRE_PAGINAS = 0.35  # ~3 chamadas/seg, dentro do limite padrão do Bitrix

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
                # erro definitivo (filtro/permissão/campo inválido) — não adianta retentar
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

def fetch_all():
    resultados, start = [], 0
    while True:
        params = dict(FILTRO_BASE)
        params["select[]"] = SELECT
        params["start"] = start
        body = bitrix_call(METHOD, params)
        chunk = body.get("result", [])
        resultados.extend(chunk)
        print(f"  {len(resultados)}/{body.get('total', len(resultados))}")
        if "next" not in body or not chunk:
            break
        start = body["next"]
        time.sleep(ATRASO_ENTRE_PAGINAS)
    return resultados

if __name__ == "__main__":
    try:
        dados = fetch_all()
    except Exception as e:
        raise SystemExit(f"Extração interrompida: {e}")
    with open("extracao.json", "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
    if dados:
        with open("extracao.csv", "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=SELECT)
            w.writeheader()
            w.writerows(dados)
    print(f"Pronto: {len(dados)} registros salvos em extracao.json / extracao.csv")
`;
  document.getElementById("codigoPython").textContent = codigo;
}

function copiarPython() {
  const texto = document.getElementById("codigoPython").textContent;
  navigator.clipboard.writeText(texto).then(() => {
    atualizarStatus("Código Python copiado para a área de transferência.");
  });
}


// ===========================================================================
// v7 — Experiência, ajuda contextual, seleção de campos e sincronização segura
// ===========================================================================

const AJUDAS_UI = {
  visaoGeral: { titulo:"Como usar a Central Bitrix", html:`<p>A página foi organizada em um fluxo simples: <strong>Escolher → Configurar → Executar → Analisar</strong>.</p><ul><li>Use os cards rápidos para Jornada, Forecast e SDR.</li><li>Use <strong>Tipo de dado</strong> quando quiser uma extração bruta.</li><li>Use <strong>Relatórios</strong> quando quiser uma análise pronta.</li><li>A área de sincronização é independente e nunca grava nada sem confirmação.</li></ul><div class="help-example">1. Cole o webhook\n2. Escolha um relatório\n3. Confira período\n4. Extrair dados\n5. Baixar / abrir modelo visual</div>` },
  webhook: { titulo:"Webhook e segurança", html:`<p>O webhook é a credencial usada pelo navegador para falar diretamente com seu Bitrix24.</p><ul><li>Ele <strong>nunca vem embutido</strong> no arquivo HTML.</li><li>Por padrão, fica somente na aba atual.</li><li>Ao clicar em <strong>Salvar webhook</strong>, a URL completa é armazenada no <code>localStorage</code> deste navegador (com uma ofuscação leve — XOR + base64 com chave fixa no código — que evita exposição trivial ao inspecionar o Local Storage, mas <strong>não é criptografia real</strong>) e carregada automaticamente na próxima abertura.</li><li>Qualquer pessoa com acesso de fato a este navegador (DevTools, extensões, backup do perfil) consegue recuperar o webhook salvo — não existe forma de eliminar esse risco sem um servidor próprio para custodiar a credencial.</li><li>Use esse recurso somente em computador pessoal ou confiável.</li><li>Em máquina compartilhada, não salve — digite a cada sessão e use <strong>Esquecer webhook</strong> ao terminar.</li><li>As permissões do webhook determinam o que pode ser lido ou alterado.</li></ul><div class="help-example">Salvar webhook = persistir (ofuscado) somente neste navegador. O valor não é escrito dentro do arquivo HTML nem enviado a nenhum servidor além do próprio Bitrix.</div>` },
  tipoDado: { titulo:"Tipo de dado", html:`<p>Use esta opção para extrair registros brutos: Negócios, Leads, Empresas, Contatos, Atividades ou Usuários.</p><p>É a escolha certa quando você quer montar seu próprio filtro, escolher campos e baixar CSV/JSON sem uma interpretação pronta.</p>` },
  relatorios: { titulo:"Relatórios", html:`<p>Os relatórios combinam campos, filtros e regras de negócio já mapeadas no extrator.</p><ul><li><strong>Jornada:</strong> cliente único, histórico e movimentações.</li><li><strong>Forecast:</strong> fechado, pendentes, pipeline e previsão.</li><li><strong>João Reis:</strong> atividade diária, clientes diferentes, jornada e conversão.</li><li><strong>Qualidade:</strong> campos faltantes, aging, SLA e duplicidade.</li></ul>` },
  periodo: { titulo:"Período e datas", html:`<p>Você pode usar um intervalo rápido, um mês, um dia específico ou preencher De/Até.</p><p>As datas enviadas ao Bitrix usam o fuso <strong>-03:00</strong>. A interface mostra datas no padrão brasileiro <strong>DD/MM/AAAA</strong>.</p><div class="help-example">Diário → hoje\nSemana atual → segunda a domingo\nMensal → primeiro dia do mês até hoje\nTodas → sem filtro</div>` },
  campos: { titulo:"Escolha de campos", html:`<p>Os campos agora são apresentados como cartões e agrupados por finalidade.</p><ul><li><strong>Essenciais:</strong> seleção recomendada.</li><li><strong>Cliente:</strong> empresa, contato e identificação.</li><li><strong>Comercial:</strong> estágio, responsável, valor e probabilidade.</li><li><strong>Datas:</strong> criação, movimentação, fechamento e atividades.</li><li><strong>Marketing:</strong> origem e UTMs.</li><li><strong>Personalizados:</strong> UF_CRM_*.</li></ul><p>O botão <strong>Sincronizar campos do Bitrix</strong> busca a estrutura atual da sua conta.</p>` },
  extrair: { titulo:"Executar consulta", html:`<p>O extrator pagina os resultados, remove duplicação física por ID e respeita intervalos entre chamadas.</p><p>Durante uma extração longa você pode parar. Quando existir continuação segura, o botão de continuar aparece.</p>` },
  sincronizacao: { titulo:"Sincronizar de volta com o Bitrix", html:`<p>Esta área foi criada para alterações controladas em registros individuais.</p><ul><li>Carregue o registro pelo ID.</li><li>Adicione uma ou mais alterações à prévia.</li><li>Confira valor atual e novo valor.</li><li>Habilite escrita e digite <strong>SINCRONIZAR</strong>.</li></ul><p>O extrator usa os métodos de atualização de CRM do Bitrix. Nenhuma extração ou relatório dispara escrita automaticamente.</p>` },
  centralV10: { titulo:"Central de Inteligência (v10)", html:`<p>Uma camada nova em cima de qualquer extração já feita na página, com quatro abas:</p><ul><li><strong>Radar de prioridades:</strong> junta aging, duplicidades e handoffs já calculados pela Jornada num só painel "o que olhar primeiro".</li><li><strong>Funil visual:</strong> desenha como os negócios realmente se movem de estágio em estágio, usando o histórico da Jornada — não apenas a foto do estágio atual.</li><li><strong>Construtor de relatório:</strong> monte seu próprio cruzamento (linhas × métrica) em cima dos dados já extraídos, sem esperar um relatório pronto.</li><li><strong>IA ao vivo:</strong> converse com uma IA sobre os dados já extraídos, direto na página — precisa de uma chave sua da API Anthropic e envia dados ao sair do navegador (diferente do gerador de prompt do passo 7, que não envia nada).</li></ul><p>Nada aqui refaz chamadas ao Bitrix: tudo é calculado sobre o que já está na tela.</p>` }
};

const CAMPOS_SYNC = {
  deal: { label:"Negócio", entityTypeId:2 },
  lead: { label:"Lead", entityTypeId:1 },
  company: { label:"Empresa", entityTypeId:4 },
  contact: { label:"Contato", entityTypeId:3 }
};

let syncRegistroAtual = null;
let syncCamposDisponiveis = {};
let syncAlteracoes = [];
let filtroCamposCategoriaAtual = "todos";

