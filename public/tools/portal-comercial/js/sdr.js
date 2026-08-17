function canalAtividadeSDR(a) {
  const prov = normalizarTextoChave(`${a.PROVIDER_TYPE_ID || ""} ${a.PROVIDER_ID || ""} ${a.SUBJECT || ""}`);
  if (prov.includes("whatsapp")) return "WhatsApp";
  if (prov.includes("email") || String(a.TYPE_ID) === "4") return "E-mail";
  if (prov.includes("call") || String(a.TYPE_ID) === "2") return "Ligação";
  if (String(a.TYPE_ID) === "1") return "Reunião";
  if (String(a.TYPE_ID) === "3") return "Tarefa";
  return TIPOS_ATIVIDADE_BITRIX[String(a.TYPE_ID)] || a.PROVIDER_TYPE_ID || "Outro";
}

function bindingsDaAtividade(a) {
  const out = [];
  const vistos = new Set();
  const add = (tipo, id) => {
    const t = String(tipo || "");
    const i = String(id || "");
    if (!t || !i || i === "0") return;
    const k = `${t}:${i}`;
    if (vistos.has(k)) return;
    vistos.add(k);
    out.push({ OWNER_TYPE_ID: t, OWNER_ID: i });
  };
  add(a.OWNER_TYPE_ID, a.OWNER_ID);
  const b = Array.isArray(a.BINDINGS) ? a.BINDINGS : [];
  b.forEach((x) => add(x.OWNER_TYPE_ID ?? x.ownerTypeId, x.OWNER_ID ?? x.ownerId));
  return out;
}

function nomeTipoEntidadeCRM(tipo) {
  const mapa = { "1": "Lead", "2": "Negócio", "3": "Contato", "4": "Empresa" };
  return mapa[String(tipo)] || `Tipo ${tipo}`;
}

function labelStatusLead(statusMap, id) {
  return statusMap[String(id)]?.NAME || statusMap[String(id)]?.label || String(id || "");
}

function nomeCompletoUsuarioObjeto(u) {
  if (!u) return "";
  return [u.NAME, u.LAST_NAME].filter(Boolean).join(" ").trim() || u.NAME || u.LAST_NAME || "";
}

function encontrarUsuariosPorNomeConfigurado(nomeConfigurado) {
  const alvo = normalizarTextoChave(nomeConfigurado);
  if (!alvo) return [];

  const candidatos = Object.entries(mapaUsuariosJornada || {}).map(([id, u]) => {
    const nome = nomeCompletoUsuarioObjeto(u) || nomeUsuario(id);
    return { id: String(id), nome, norm: normalizarTextoChave(nome) };
  });

  const exatos = candidatos.filter((x) => x.norm === alvo);
  if (exatos.length) return exatos;

  return candidatos.filter((x) => x.norm.includes(alvo) || alvo.includes(x.norm));
}


// ----------------------- Análise SDR semanal e mensal ----------------------

function isoAdicionarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return formatarDataISO(d);
}

function inicioSemanaSegundaISO(dataIso) {
  const d = new Date(`${dataIso}T12:00:00`);
  const dia = d.getDay();
  const delta = dia === 0 ? -6 : 1 - dia;
  d.setDate(d.getDate() + delta);
  return formatarDataISO(d);
}

function inicioMesISO(dataIso) {
  return `${String(dataIso || "").slice(0, 7)}-01`;
}

function diasEntreISO(inicio, fim) {
  const out = [];
  if (!inicio || !fim || inicio > fim) return out;
  let d = inicio;
  while (d <= fim) {
    out.push(d);
    d = isoAdicionarDias(d, 1);
  }
  return out;
}

function diaSemanaCurtoPt(dataIso) {
  try {
    return new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
      .format(new Date(`${dataIso}T12:00:00`))
      .replace(".", "");
  } catch {
    return "";
  }
}

function ehDiaUtilISO(dataIso) {
  const d = new Date(`${dataIso}T12:00:00`).getDay();
  return d >= 1 && d <= 5;
}

function taxaPct(numerador, denominador) {
  if (!denominador) return 0;
  return Math.round((Number(numerador || 0) / Number(denominador || 0)) * 10000) / 100;
}

async function buscarHistoricoEntidadeSDR(webhook, entityTypeId, idsEntidade) {
  const todos = [];
  const vistos = new Set();
  const ids = [...new Set((idsEntidade || []).map(String).filter((x) => x && x !== "0"))];
  if (!ids.length) return todos;

  for (const lote of dividirEmLotes(ids, 100)) {
    let start = 0;
    while (true) {
      const params = new URLSearchParams();
      params.append("entityTypeId", String(entityTypeId));

      const campos = Number(entityTypeId) === 1
        ? ["ID", "TYPE_ID", "OWNER_ID", "STATUS_ID", "STATUS_SEMANTIC_ID", "CREATED_TIME"]
        : ["ID", "TYPE_ID", "OWNER_ID", "STAGE_ID", "CATEGORY_ID", "STAGE_SEMANTIC_ID", "CREATED_TIME"];

      campos.forEach((c) => params.append("select[]", c));
      lote.forEach((id) => params.append("filter[@OWNER_ID][]", id));
      params.append("order[ID]", "ASC");
      params.append("start", String(start));

      const body = await bitrixFetchComRetentativa(
        `${webhook.replace(/\/$/, "")}/crm.stagehistory.list.json?${params.toString()}`
      );
      const chunk = body?.result?.items || (Array.isArray(body?.result) ? body.result : []);

      chunk.forEach((r) => {
        const k = String(r.ID || `${entityTypeId}_${r.OWNER_ID}_${r.CREATED_TIME}_${r.STATUS_ID || r.STAGE_ID}`);
        if (!vistos.has(k)) {
          vistos.add(k);
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

async function buscarDealsPorLeadIdsAnaliseSDR(webhook, leadIds) {
  const todos = [];
  const vistos = new Set();
  const ids = [...new Set((leadIds || []).map(String).filter((x) => x && x !== "0"))];
  if (!ids.length) return todos;

  const campos = [
    "ID", "TITLE", "LEAD_ID", "COMPANY_ID", "CONTACT_ID", "CATEGORY_ID", "STAGE_ID",
    "STAGE_SEMANTIC_ID", "ASSIGNED_BY_ID", "OPPORTUNITY", "DATE_CREATE", "DATE_MODIFY",
    "MOVED_TIME", "CLOSEDATE", "CLOSED", "LAST_ACTIVITY_TIME", "SOURCE_ID"
  ];

  for (const lote of dividirEmLotes(ids, 75)) {
    const resp = await listarCompletoRelatorio(
      webhook,
      "crm.deal.list",
      campos,
      { "@LEAD_ID": lote },
      { ID: "ASC" },
      "Análise SDR: buscando oportunidades originadas dos Leads..."
    );
    resp.dados.forEach((d) => {
      const id = String(d.ID || "");
      if (id && !vistos.has(id)) {
        vistos.add(id);
        todos.push(d);
      }
    });
    await aguardar(ATRASO_ENTRE_PAGINAS_MS);
  }

  return todos;
}

function comprimirSequenciaSDR(lista) {
  const out = [];
  (lista || []).forEach((x) => {
    const v = String(x || "").trim();
    if (v && (!out.length || out[out.length - 1] !== v)) out.push(v);
  });
  return out;
}

function setIdsVinculadosAtividades(atividades, ownerTypeId) {
  const set = new Set();
  (atividades || []).forEach((a) => {
    bindingsDaAtividade(a).forEach((b) => {
      if (String(b.OWNER_TYPE_ID) === String(ownerTypeId)) set.add(String(b.OWNER_ID));
    });
  });
  return set;
}

function atividadesNoIntervaloSDR(atividades, inicio, fim) {
  return (atividades || []).filter((a) => dataDentroFaixa(a.END_TIME, inicio, fim));
}

function resumoAtividadesPeriodoSDR(atividades, inicio, fim, dealsRelacionados = []) {
  const arr = atividadesNoIntervaloSDR(atividades, inicio, fim);
  const leadIds = setIdsVinculadosAtividades(arr, "1");
  const dealIds = setIdsVinculadosAtividades(arr, "2");

  const reunioes = arr.filter((a) => String(a.TYPE_ID) === "1");
  const ligacoes = arr.filter((a) => String(a.TYPE_ID) === "2");
  const tarefas = arr.filter((a) => String(a.TYPE_ID) === "3");
  const emails = arr.filter((a) => String(a.TYPE_ID) === "4");
  const whatsapp = arr.filter((a) => canalAtividadeSDR(a) === "WhatsApp");

  const leadsComReuniao = setIdsVinculadosAtividades(reunioes, "1");

  const oportunidadesPeriodo = (dealsRelacionados || []).filter((d) => {
    return leadIds.has(String(d.LEAD_ID || "")) && dataDentroFaixa(d.DATE_CREATE, inicio, fim);
  });

  const leadsComOportunidade = new Set(oportunidadesPeriodo.map((d) => String(d.LEAD_ID || "")).filter(Boolean));
  const ganhos = oportunidadesPeriodo.filter((d) => {
    const s = String(d.STAGE_SEMANTIC_ID || "").toLowerCase();
    return s === "s" || s === "success";
  });
  const perdas = oportunidadesPeriodo.filter((d) => {
    const s = String(d.STAGE_SEMANTIC_ID || "").toLowerCase();
    return s === "f" || s === "failure";
  });
  const leadsComGanho = new Set(ganhos.map((d) => String(d.LEAD_ID || "")).filter(Boolean));
  const leadsReuniaoComOpp = new Set(
    oportunidadesPeriodo
      .map((d) => String(d.LEAD_ID || ""))
      .filter((id) => leadsComReuniao.has(id))
  );

  const dias = diasEntreISO(inicio, fim);
  const diasUteis = dias.filter(ehDiaUtilISO).length;
  const diasAtivos = new Set(arr.map((a) => parteDataISO(a.END_TIME)).filter(Boolean)).size;

  return {
    inicio, fim,
    ATIVIDADES: arr.length,
    LIGACOES: ligacoes.length,
    REUNIOES: reunioes.length,
    TAREFAS: tarefas.length,
    EMAILS: emails.length,
    WHATSAPP: whatsapp.length,
    LEADS_TRABALHADOS: leadIds.size,
    NEGOCIOS_TRABALHADOS: dealIds.size,
    LEADS_COM_REUNIAO: leadsComReuniao.size,
    OPORTUNIDADES_CRIADAS: oportunidadesPeriodo.length,
    LEADS_COM_OPORTUNIDADE: leadsComOportunidade.size,
    GANHOS: ganhos.length,
    PERDAS: perdas.length,
    LEADS_COM_GANHO: leadsComGanho.size,
    LEADS_REUNIAO_COM_OPP: leadsReuniaoComOpp.size,
    DIAS_UTEIS: diasUteis,
    DIAS_ATIVOS: diasAtivos,
    MEDIA_ATIVIDADES_DIA_UTIL: diasUteis ? Math.round((arr.length / diasUteis) * 100) / 100 : 0,
    TAXA_LEAD_REUNIAO: taxaPct(leadsComReuniao.size, leadIds.size),
    TAXA_LEAD_OPORTUNIDADE: taxaPct(leadsComOportunidade.size, leadIds.size),
    TAXA_REUNIAO_OPORTUNIDADE: taxaPct(leadsReuniaoComOpp.size, leadsComReuniao.size),
    WIN_RATE_OPORTUNIDADES: taxaPct(ganhos.length, oportunidadesPeriodo.length),
    TAXA_LEAD_GANHO: taxaPct(leadsComGanho.size, leadIds.size),
    _leadIds: leadIds,
    _dealIds: dealIds,
    _leadsComReuniao: leadsComReuniao,
    _oportunidades: oportunidadesPeriodo
  };
}

async function extrairAnaliseSDR(webhook) {
  document.getElementById("spinner").style.display = "inline-block";
  document.getElementById("btnExtrair").disabled = true;
  document.getElementById("btnParar").disabled = false;
  extracaoCancelada = false;
  esconderErro();
  resultadoAnaliseSDR = {};

  try {
    atualizarStatus("Análise SDR: localizando João Reis e carregando estrutura do CRM...");

    const [meta, statusLeads] = await Promise.all([
      buscarMetadadosFunisEEstagios(webhook),
      carregarListaPaginada(webhook, "crm.status.list", {
        "filter[ENTITY_ID]": "STATUS",
        "order[SORT]": "ASC"
      }),
      buscarUsuariosJornada(webhook)
    ]);

    const nomeSdr = String(document.getElementById("nomeSdrAnalise")?.value || "João Reis").trim();
    const usuarios = encontrarUsuariosPorNomeConfigurado(nomeSdr);
    if (!usuarios.length) {
      throw new Error(`Não encontrei o usuário "${nomeSdr}" na lista de usuários do Bitrix.`);
    }
    const usuarioSdr = usuarios[0];
    const sdrId = String(usuarioSdr.id);
    const sdrNome = usuarioSdr.nome || nomeSdr;

    const hoje = formatarDataISO(new Date());
    let referenciaSolicitada = document.getElementById("dataFim").value || hoje;
    let referencia = referenciaSolicitada > hoje ? hoje : referenciaSolicitada;
    if (!referencia) referencia = hoje;

    const mesInicio = inicioMesISO(referencia);
    const semanaInicio = inicioSemanaSegundaISO(referencia);
    const semanaFim = referencia;
    const mesFim = referencia;

    document.getElementById("dataInicio").value = mesInicio;
    document.getElementById("dataFim").value = referencia;

    const mapaStatusLead = {};
    statusLeads.forEach((s) => { mapaStatusLead[String(s.STATUS_ID)] = s; });

    const inicioDt = `${mesInicio}T00:00:00-03:00`;
    const fimDt = `${mesFim}T23:59:59-03:00`;

    atualizarStatus(`Análise SDR: buscando atividades concluídas por ${sdrNome} no mês...`);
    const atividadesBusca = await listarCompletoRelatorio(
      webhook,
      "crm.activity.list",
      [
        "ID", "OWNER_ID", "OWNER_TYPE_ID", "TYPE_ID", "PROVIDER_ID", "PROVIDER_TYPE_ID",
        "SUBJECT", "COMPLETED", "RESPONSIBLE_ID", "AUTHOR_ID", "CREATED", "LAST_UPDATED",
        "START_TIME", "END_TIME", "DEADLINE", "DIRECTION", "BINDINGS"
      ],
      {
        "COMPLETED": "Y",
        "RESPONSIBLE_ID": sdrId,
        ">=END_TIME": inicioDt,
        "<=END_TIME": fimDt
      },
      { ID: "ASC" },
      "Análise SDR: atividades..."
    );
    const atividadesMes = atividadesBusca.dados;

    const leadIdsTocadosMes = setIdsVinculadosAtividades(atividadesMes, "1");
    const dealIdsTocadosMes = setIdsVinculadosAtividades(atividadesMes, "2");

    const dealsTocadosMap = await buscarEntidadesPorIds(
      webhook, "crm.deal.list", [...dealIdsTocadosMes],
      ["ID","TITLE","COMPANY_ID","CONTACT_ID","LEAD_ID","CATEGORY_ID","STAGE_ID","STAGE_SEMANTIC_ID","ASSIGNED_BY_ID","SOURCE_ID","DATE_CREATE","MOVED_TIME","OPPORTUNITY"]
    );

    atualizarStatus(`Análise SDR: buscando Leads atualmente atribuídos a ${sdrNome}...`);
    const leadsAtribuidosBusca = await listarCompletoRelatorio(
      webhook,
      "crm.lead.list",
      [
        "ID", "TITLE", "NAME", "LAST_NAME", "COMPANY_ID", "COMPANY_TITLE", "STATUS_ID",
        "STATUS_SEMANTIC_ID", "SOURCE_ID", "ASSIGNED_BY_ID", "CREATED_BY_ID", "DATE_CREATE",
        "DATE_MODIFY", "MOVED_TIME", "DATE_CLOSED", "LAST_ACTIVITY_TIME", "LAST_ACTIVITY_BY",
        "OPPORTUNITY"
      ],
      { "ASSIGNED_BY_ID": sdrId },
      { ID: "ASC" },
      "Análise SDR: Leads atribuídos..."
    );
    const leadsAtribuidos = leadsAtribuidosBusca.dados;
    const leadsAtribuidosMap = {};
    leadsAtribuidos.forEach((l) => { leadsAtribuidosMap[String(l.ID)] = l; });

    const leadsTocadosMap = await buscarEntidadesPorIds(
      webhook,
      "crm.lead.list",
      [...leadIdsTocadosMes],
      [
        "ID", "TITLE", "NAME", "LAST_NAME", "COMPANY_ID", "COMPANY_TITLE", "STATUS_ID",
        "STATUS_SEMANTIC_ID", "SOURCE_ID", "ASSIGNED_BY_ID", "CREATED_BY_ID", "DATE_CREATE",
        "DATE_MODIFY", "MOVED_TIME", "DATE_CLOSED", "LAST_ACTIVITY_TIME", "LAST_ACTIVITY_BY",
        "OPPORTUNITY"
      ]
    );

    const leadsMesAtribuidos = leadsAtribuidos.filter((l) => dataDentroFaixa(l.DATE_CREATE, mesInicio, mesFim));
    const idsJornada = new Set([
      ...leadIdsTocadosMes,
      ...leadsMesAtribuidos.map((l) => String(l.ID))
    ]);

    const leadsJornadaMap = { ...leadsAtribuidosMap, ...leadsTocadosMap };
    const idsJornadaLista = [...idsJornada];

    atualizarStatus("Análise SDR: buscando negócios originados dos Leads do João...");
    const dealsRelacionados = await buscarDealsPorLeadIdsAnaliseSDR(webhook, idsJornadaLista);

    const dealIdsRelacionados = dealsRelacionados.map((d) => String(d.ID)).filter(Boolean);

    const todosDealsMap = { ...dealsTocadosMap };
    dealsRelacionados.forEach((d) => { todosDealsMap[String(d.ID)] = d; });

    const companyIdsDiretos = setIdsVinculadosAtividades(atividadesMes, "4");
    const contactIdsDiretos = setIdsVinculadosAtividades(atividadesMes, "3");
    const contatosSdrMap = await buscarEntidadesPorIds(
      webhook, "crm.contact.list", [...contactIdsDiretos], ["ID","NAME","LAST_NAME","COMPANY_ID"]
    );
    const idsEmpresasSdr = [...new Set([
      ...Object.values(leadsJornadaMap).map((l)=>l.COMPANY_ID),
      ...Object.values(todosDealsMap).map((d)=>d.COMPANY_ID),
      ...companyIdsDiretos,
      ...Object.values(contatosSdrMap).map((c)=>c.COMPANY_ID)
    ].filter(idBitrixValido).map(idBitrixString))];
    const empresasSdrMap = await buscarEntidadesPorIds(webhook,"crm.company.list",idsEmpresasSdr,["ID","TITLE"]);

    const infoClienteLead = (lead) => {
      if (!lead) return null;
      if (idBitrixValido(lead.COMPANY_ID)) {
        const id=idBitrixString(lead.COMPANY_ID);
        return {key:`COMPANY:${id}`,nome:empresasSdrMap[id]?.TITLE||lead.COMPANY_TITLE||lead.TITLE||`Empresa ${id}`};
      }
      const nome=lead.COMPANY_TITLE||`${lead.NAME||""} ${lead.LAST_NAME||""}`.trim()||lead.TITLE||"";
      const norm=normalizarTextoChave(nome);
      return {key:norm?`NOME:${norm}`:`LEAD:${lead.ID}`,nome:nome||`Lead ${lead.ID}`};
    };
    const infoClienteDeal = (deal) => {
      if (!deal) return null;
      if (idBitrixValido(deal.COMPANY_ID)) {
        const id=idBitrixString(deal.COMPANY_ID);
        return {key:`COMPANY:${id}`,nome:empresasSdrMap[id]?.TITLE||deal.TITLE||`Empresa ${id}`};
      }
      if (idBitrixValido(deal.LEAD_ID)) {
        const info=infoClienteLead(leadsJornadaMap[idBitrixString(deal.LEAD_ID)]);
        if (info) return info;
      }
      const nome=deal.TITLE||"",norm=normalizarTextoChave(nome);
      return {key:norm?`NOME:${norm}`:`DEAL:${deal.ID}`,nome:nome||`Negócio ${deal.ID}`};
    };
    const infoClienteContato = (contato) => {
      if (!contato) return null;
      if (idBitrixValido(contato.COMPANY_ID)) {
        const id=idBitrixString(contato.COMPANY_ID);
        return {key:`COMPANY:${id}`,nome:empresasSdrMap[id]?.TITLE||`Empresa ${id}`};
      }
      const nome=`${contato.NAME||""} ${contato.LAST_NAME||""}`.trim(),norm=normalizarTextoChave(nome);
      return {key:norm?`CONTATO_NOME:${norm}`:`CONTACT:${contato.ID}`,nome:nome||`Contato ${contato.ID}`};
    };
    const infoClienteEmpresa = (id) => {
      const sid=idBitrixString(id); if(!sid)return null;
      return {key:`COMPANY:${sid}`,nome:empresasSdrMap[sid]?.TITLE||`Empresa ${sid}`};
    };

    const clientesPorAtividade = {};
    const aggClientes = {};
    atividadesMes.forEach((a) => {
      const infos = new Map();
      bindingsDaAtividade(a).forEach((b)=>{
        let info=null;
        if(String(b.OWNER_TYPE_ID)==="1") info=infoClienteLead(leadsJornadaMap[String(b.OWNER_ID)]||leadsTocadosMap[String(b.OWNER_ID)]);
        if(String(b.OWNER_TYPE_ID)==="2") info=infoClienteDeal(todosDealsMap[String(b.OWNER_ID)]);
        if(String(b.OWNER_TYPE_ID)==="3") info=infoClienteContato(contatosSdrMap[String(b.OWNER_ID)]);
        if(String(b.OWNER_TYPE_ID)==="4") info=infoClienteEmpresa(b.OWNER_ID);
        if(info?.key) infos.set(info.key,info);
      });
      clientesPorAtividade[String(a.ID)] = [...infos.values()];
      [...infos.values()].forEach((info)=>{
        if(!aggClientes[info.key]) aggClientes[info.key]={CLIENTE_KEY:info.key,CLIENTE:info.nome,ATIVIDADES_MES:0,ATIVIDADES_SEMANA:0,DIAS:new Set(),LIGACOES:0,REUNIOES:0,TAREFAS:0,EMAILS:0,WHATSAPP:0,PRIMEIRA:"",ULTIMA:""};
        const r=aggClientes[info.key];r.ATIVIDADES_MES++;
        if(dataDentroFaixa(a.END_TIME,semanaInicio,semanaFim))r.ATIVIDADES_SEMANA++;
        const c=canalAtividadeSDR(a);if(c==="Ligação")r.LIGACOES++;else if(c==="Reunião")r.REUNIOES++;else if(c==="Tarefa")r.TAREFAS++;else if(c==="E-mail")r.EMAILS++;else if(c==="WhatsApp")r.WHATSAPP++;
        const dia=parteDataISO(a.END_TIME);if(dia)r.DIAS.add(dia);
        const fimAt=String(a.END_TIME||"");if(fimAt&&(!r.PRIMEIRA||fimAt<r.PRIMEIRA))r.PRIMEIRA=fimAt;if(fimAt&&(!r.ULTIMA||fimAt>r.ULTIMA))r.ULTIMA=fimAt;
      });
    });
    const clientesAtividades=Object.values(aggClientes).map((r)=>({
      CLIENTE_KEY:r.CLIENTE_KEY,CLIENTE:r.CLIENTE,ATIVIDADES_SEMANA:r.ATIVIDADES_SEMANA,ATIVIDADES_MES:r.ATIVIDADES_MES,DIAS_ATIVOS:r.DIAS.size,
      LIGACOES:r.LIGACOES,REUNIOES:r.REUNIOES,TAREFAS:r.TAREFAS,EMAILS:r.EMAILS,WHATSAPP:r.WHATSAPP,
      PRIMEIRA_ATIVIDADE:r.PRIMEIRA,PRIMEIRA_ATIVIDADE_BR:formatarDataHoraBR(r.PRIMEIRA),
      ULTIMA_ATIVIDADE:r.ULTIMA,ULTIMA_ATIVIDADE_BR:formatarDataHoraBR(r.ULTIMA)
    })).sort((a,b)=>b.ATIVIDADES_MES-a.ATIVIDADES_MES||a.CLIENTE.localeCompare(b.CLIENTE,"pt-BR"));

    const resumoClientesPeriodo=(inicioP,fimP)=>{
      const acts=atividadesMes.filter((a)=>dataDentroFaixa(a.END_TIME,inicioP,fimP)),keys=new Set();let semCliente=0;
      acts.forEach((a)=>{const infos=clientesPorAtividade[String(a.ID)]||[];if(!infos.length)semCliente++;infos.forEach((i)=>keys.add(i.key));});
      const isMes=inicioP===mesInicio;
      const rows=clientesAtividades.map((r)=>({...r,N:isMes?r.ATIVIDADES_MES:r.ATIVIDADES_SEMANA})).filter((r)=>r.N>0).sort((a,b)=>b.N-a.N);
      return {
        CLIENTES_UNICOS:keys.size,ATIVIDADES_SEM_CLIENTE:semCliente,
        MEDIA_ATIVIDADES_POR_CLIENTE:keys.size?Math.round((acts.length-semCliente)/keys.size*100)/100:0,
        CLIENTES_COM_MULTIPLAS_ATIVIDADES:rows.filter((r)=>r.N>1).length,
        MAIOR_CONCENTRACAO_ATIVIDADES:rows[0]?.N||0,CLIENTE_MAIS_TRABALHADO:rows[0]?.CLIENTE||""
      };
    };

    atualizarStatus("Análise SDR: reconstruindo histórico das etapas dos Leads...");
    const historicoLeads = await buscarHistoricoEntidadeSDR(webhook, 1, idsJornadaLista);

    atualizarStatus("Análise SDR: reconstruindo histórico das oportunidades relacionadas...");
    const historicoDeals = await buscarHistoricoEntidadeSDR(webhook, 2, dealIdsRelacionados);

    const histLeadPorId = {};
    historicoLeads.forEach((h) => (histLeadPorId[String(h.OWNER_ID)] ||= []).push(h));
    Object.values(histLeadPorId).forEach((arr) => arr.sort((a, b) => String(a.CREATED_TIME).localeCompare(String(b.CREATED_TIME))));

    const histDealPorId = {};
    historicoDeals.forEach((h) => (histDealPorId[String(h.OWNER_ID)] ||= []).push(h));
    Object.values(histDealPorId).forEach((arr) => arr.sort((a, b) => String(a.CREATED_TIME).localeCompare(String(b.CREATED_TIME))));

    const dealsPorLead = {};
    dealsRelacionados.forEach((d) => (dealsPorLead[String(d.LEAD_ID)] ||= []).push(d));
    Object.values(dealsPorLead).forEach((arr) => arr.sort((a, b) => String(a.DATE_CREATE).localeCompare(String(b.DATE_CREATE))));

    const atividadesPorLead = {};
    atividadesMes.forEach((a) => {
      bindingsDaAtividade(a).forEach((b) => {
        if (String(b.OWNER_TYPE_ID) === "1") (atividadesPorLead[String(b.OWNER_ID)] ||= []).push(a);
      });
    });

    const resumoSemana = resumoAtividadesPeriodoSDR(
      atividadesMes, semanaInicio, semanaFim, dealsRelacionados
    );
    const resumoMes = resumoAtividadesPeriodoSDR(
      atividadesMes, mesInicio, mesFim, dealsRelacionados
    );
    Object.assign(resumoSemana,resumoClientesPeriodo(semanaInicio,semanaFim));
    Object.assign(resumoMes,resumoClientesPeriodo(mesInicio,mesFim));

    // Diário do mês
    const diario = diasEntreISO(mesInicio, mesFim).map((dia) => {
      const acts = atividadesMes.filter((a) => parteDataISO(a.END_TIME) === dia);
      const leads = setIdsVinculadosAtividades(acts, "1");
      const deals = setIdsVinculadosAtividades(acts, "2");
      const clientes=new Set();let semCliente=0;
      acts.forEach((a)=>{const infos=clientesPorAtividade[String(a.ID)]||[];if(!infos.length)semCliente++;infos.forEach((i)=>clientes.add(i.key));});
      return {
        DATA: dia,
        DATA_BR: formatarDataBR(dia),
        DIA_SEMANA: diaSemanaCurtoPt(dia),
        DIA_UTIL: ehDiaUtilISO(dia) ? "S" : "N",
        ATIVIDADES: acts.length,
        LIGACOES: acts.filter((a) => String(a.TYPE_ID) === "2").length,
        REUNIOES: acts.filter((a) => String(a.TYPE_ID) === "1").length,
        TAREFAS: acts.filter((a) => String(a.TYPE_ID) === "3").length,
        EMAILS: acts.filter((a) => String(a.TYPE_ID) === "4").length,
        WHATSAPP: acts.filter((a) => canalAtividadeSDR(a) === "WhatsApp").length,
        LEADS_UNICOS: leads.size,
        NEGOCIOS_UNICOS: deals.size,
        CLIENTES_UNICOS: clientes.size,
        ATIVIDADES_SEM_CLIENTE: semCliente,
        MEDIA_ATIVIDADES_POR_CLIENTE: clientes.size ? Math.round((acts.length-semCliente)/clientes.size*100)/100 : 0
      };
    });

    const canais = ["Ligação", "Reunião", "Tarefa", "E-mail", "WhatsApp", "Outros"];
    const mix = canais.map((canal) => {
      const count = (arr) => arr.filter((a) => {
        const c = canalAtividadeSDR(a);
        if (canal === "Outros") return !["Ligação", "Reunião", "Tarefa", "E-mail", "WhatsApp"].includes(c);
        return c === canal;
      }).length;

      const actsSemana = atividadesNoIntervaloSDR(atividadesMes, semanaInicio, semanaFim);
      return {
        CANAL: canal,
        SEMANA: count(actsSemana),
        MES: count(atividadesMes)
      };
    });

    const conversoes = [
      {
        METRICA: "Lead trabalhado → Reunião realizada",
        NUMERADOR_SEMANA: resumoSemana.LEADS_COM_REUNIAO,
        DENOMINADOR_SEMANA: resumoSemana.LEADS_TRABALHADOS,
        TAXA_SEMANA: resumoSemana.TAXA_LEAD_REUNIAO,
        NUMERADOR_MES: resumoMes.LEADS_COM_REUNIAO,
        DENOMINADOR_MES: resumoMes.LEADS_TRABALHADOS,
        TAXA_MES: resumoMes.TAXA_LEAD_REUNIAO
      },
      {
        METRICA: "Lead trabalhado → Oportunidade criada",
        NUMERADOR_SEMANA: resumoSemana.LEADS_COM_OPORTUNIDADE,
        DENOMINADOR_SEMANA: resumoSemana.LEADS_TRABALHADOS,
        TAXA_SEMANA: resumoSemana.TAXA_LEAD_OPORTUNIDADE,
        NUMERADOR_MES: resumoMes.LEADS_COM_OPORTUNIDADE,
        DENOMINADOR_MES: resumoMes.LEADS_TRABALHADOS,
        TAXA_MES: resumoMes.TAXA_LEAD_OPORTUNIDADE
      },
      {
        METRICA: "Lead com reunião → Oportunidade criada",
        NUMERADOR_SEMANA: resumoSemana.LEADS_REUNIAO_COM_OPP,
        DENOMINADOR_SEMANA: resumoSemana.LEADS_COM_REUNIAO,
        TAXA_SEMANA: resumoSemana.TAXA_REUNIAO_OPORTUNIDADE,
        NUMERADOR_MES: resumoMes.LEADS_REUNIAO_COM_OPP,
        DENOMINADOR_MES: resumoMes.LEADS_COM_REUNIAO,
        TAXA_MES: resumoMes.TAXA_REUNIAO_OPORTUNIDADE
      },
      {
        METRICA: "Win rate das oportunidades criadas",
        NUMERADOR_SEMANA: resumoSemana.GANHOS,
        DENOMINADOR_SEMANA: resumoSemana.OPORTUNIDADES_CRIADAS,
        TAXA_SEMANA: resumoSemana.WIN_RATE_OPORTUNIDADES,
        NUMERADOR_MES: resumoMes.GANHOS,
        DENOMINADOR_MES: resumoMes.OPORTUNIDADES_CRIADAS,
        TAXA_MES: resumoMes.WIN_RATE_OPORTUNIDADES
      },
      {
        METRICA: "Lead trabalhado → Negócio ganho",
        NUMERADOR_SEMANA: resumoSemana.LEADS_COM_GANHO,
        DENOMINADOR_SEMANA: resumoSemana.LEADS_TRABALHADOS,
        TAXA_SEMANA: resumoSemana.TAXA_LEAD_GANHO,
        NUMERADOR_MES: resumoMes.LEADS_COM_GANHO,
        DENOMINADOR_MES: resumoMes.LEADS_TRABALHADOS,
        TAXA_MES: resumoMes.TAXA_LEAD_GANHO
      }
    ];

    // Jornada de cada Lead
    const rotasCounter = {};
    const transicoesCounter = {};
    const linhasJornada = [];

    const addCount = (obj, key) => { obj[key] = (obj[key] || 0) + 1; };

    for (const leadId of idsJornadaLista) {
      const lead = leadsJornadaMap[String(leadId)];
      if (!lead) continue;

      const histLead = histLeadPorId[String(leadId)] || [];
      let leadSeq = histLead.map((h) => {
        const statusId = String(h.STATUS_ID || "");
        const label = labelStatusLead(mapaStatusLead, statusId);
        return `Lead • ${label}`;
      });
      if (!leadSeq.length) {
        leadSeq = [`Lead • ${labelStatusLead(mapaStatusLead, lead.STATUS_ID)}`];
      }
      leadSeq = comprimirSequenciaSDR(leadSeq);

      const route = [...leadSeq];
      const dealsLead = dealsPorLead[String(leadId)] || [];

      for (const d of dealsLead) {
        const cat = String(d.CATEGORY_ID || "");
        const funil = nomeFunilSemCodigo(meta.categorias?.[cat] || `Categoria ${cat}`);
        const histDeal = histDealPorId[String(d.ID)] || [];
        let dealSeq = histDeal.map((h) => {
          const hcat = String(h.CATEGORY_ID ?? cat);
          const hfunil = nomeFunilSemCodigo(meta.categorias?.[hcat] || `Categoria ${hcat}`);
          const stage = meta.estagios?.[hcat]?.[String(h.STAGE_ID)]?.label || h.STAGE_ID || "";
          return `${hfunil} • ${stage}`;
        });
        if (!dealSeq.length) {
          const stage = meta.estagios?.[cat]?.[String(d.STAGE_ID)]?.label || d.STAGE_ID || "";
          dealSeq = [`${funil} • ${stage}`];
        }
        route.push(...comprimirSequenciaSDR(dealSeq));
      }

      const routeCompressed = comprimirSequenciaSDR(route);
      const routeText = routeCompressed.join(" → ");
      addCount(rotasCounter, routeText);

      for (let i = 1; i < routeCompressed.length; i++) {
        addCount(transicoesCounter, `${routeCompressed[i - 1]}|||${routeCompressed[i]}`);
      }

      const acts = atividadesPorLead[String(leadId)] || [];
      const actsSemana = atividadesNoIntervaloSDR(acts, semanaInicio, semanaFim);
      const meetingsMes = acts.filter((a) => String(a.TYPE_ID) === "1").length;
      const meetingsSemana = actsSemana.filter((a) => String(a.TYPE_ID) === "1").length;

      const ganhosLead = dealsLead.filter((d) => ["s", "success"].includes(String(d.STAGE_SEMANTIC_ID || "").toLowerCase())).length;
      const perdasLead = dealsLead.filter((d) => ["f", "failure"].includes(String(d.STAGE_SEMANTIC_ID || "").toLowerCase())).length;

      linhasJornada.push({
        LEAD_ID: leadId,
        CLIENTE: lead.COMPANY_TITLE || `${lead.NAME || ""} ${lead.LAST_NAME || ""}`.trim() || lead.TITLE || "",
        TITULO_LEAD: lead.TITLE || "",
        STATUS_ATUAL: labelStatusLead(mapaStatusLead, lead.STATUS_ID),
        RESPONSAVEL_ATUAL: nomeUsuario(lead.ASSIGNED_BY_ID),
        ATIVIDADES_SEMANA: actsSemana.length,
        ATIVIDADES_MES: acts.length,
        REUNIOES_SEMANA: meetingsSemana,
        REUNIOES_MES: meetingsMes,
        OPORTUNIDADES: dealsLead.length,
        GANHOS: ganhosLead,
        PERDAS: perdasLead,
        JORNADA: routeText
      });
    }

    const rotas = Object.entries(rotasCounter)
      .map(([ROTA, LEADS]) => ({ ROTA, LEADS }))
      .sort((a, b) => b.LEADS - a.LEADS)
      .slice(0, 60);

    const transicoes = Object.entries(transicoesCounter)
      .map(([key, QTD]) => {
        const [DE, PARA] = key.split("|||");
        return { DE, PARA, QTD };
      })
      .sort((a, b) => b.QTD - a.QTD)
      .slice(0, 80);

    // Backlog atual do SDR
    const diasCritico = Math.max(1, Number(document.getElementById("diasSemAtividadeCriticoSDR")?.value) || 3);
    const backlogLeads = leadsAtribuidos.filter((l) => {
      const sem = String(l.STATUS_SEMANTIC_ID || "").toLowerCase();
      return sem === "p" || sem === "process" || sem === "processing";
    });

    const backlog = backlogLeads.map((l) => {
      const ultima = parteDataISO(l.LAST_ACTIVITY_TIME);
      let diasSem = "";
      if (ultima) {
        const a = new Date(`${ultima}T12:00:00`);
        const b = new Date(`${referencia}T12:00:00`);
        diasSem = Math.max(0, Math.floor((b - a) / 86400000));
      }
      return {
        LEAD_ID: l.ID,
        CLIENTE: l.COMPANY_TITLE || `${l.NAME || ""} ${l.LAST_NAME || ""}`.trim() || l.TITLE || "",
        TITULO: l.TITLE || "",
        STATUS: labelStatusLead(mapaStatusLead, l.STATUS_ID),
        DATE_CREATE: parteDataISO(l.DATE_CREATE),
        LAST_ACTIVITY_TIME: l.LAST_ACTIVITY_TIME || "",
        DIAS_SEM_ATIVIDADE: diasSem,
        ATIVIDADE_NO_MES: leadIdsTocadosMes.has(String(l.ID)) ? "S" : "N",
        CRITICO: diasSem === "" ? "SEM DATA" : (Number(diasSem) >= diasCritico ? "S" : "N")
      };
    }).sort((a, b) => {
      const da = a.DIAS_SEM_ATIVIDADE === "" ? 999999 : Number(a.DIAS_SEM_ATIVIDADE);
      const db = b.DIAS_SEM_ATIVIDADE === "" ? 999999 : Number(b.DIAS_SEM_ATIVIDADE);
      return db - da;
    });

    const backlogPorStatusObj = {};
    backlog.forEach((x) => {
      const key = x.STATUS || "Sem status";
      if (!backlogPorStatusObj[key]) backlogPorStatusObj[key] = { STATUS: key, LEADS: 0, SEM_ATIVIDADE_MES: 0, CRITICOS: 0 };
      backlogPorStatusObj[key].LEADS++;
      if (x.ATIVIDADE_NO_MES !== "S") backlogPorStatusObj[key].SEM_ATIVIDADE_MES++;
      if (x.CRITICO === "S" || x.CRITICO === "SEM DATA") backlogPorStatusObj[key].CRITICOS++;
    });
    const backlogPorStatus = Object.values(backlogPorStatusObj).sort((a, b) => b.LEADS - a.LEADS);

    const backlogCriticos = backlog.filter((x) => x.CRITICO === "S" || x.CRITICO === "SEM DATA").length;
    const coberturaBacklogMes = taxaPct(
      backlog.filter((x) => x.ATIVIDADE_NO_MES === "S").length,
      backlog.length
    );

    resultadoAnaliseSDR = {
      meta: {
        sdr_id: sdrId,
        sdr_nome: sdrNome,
        referencia,
        semana_inicio: semanaInicio,
        semana_fim: semanaFim,
        mes_inicio: mesInicio,
        mes_fim: mesFim,
        dias_critico_sem_atividade: diasCritico,
        total_atividades_bitrix_mes: atividadesBusca.total,
        total_leads_atribuidos_atualmente: leadsAtribuidos.length,
        leads_na_jornada: idsJornadaLista.length,
        historico_leads_eventos: historicoLeads.length,
        historico_deals_eventos: historicoDeals.length
      },
      resumo: {
        semana: {
          ATIVIDADES: resumoSemana.ATIVIDADES,
          MEDIA_DIA_UTIL: resumoSemana.MEDIA_ATIVIDADES_DIA_UTIL,
          LEADS_TRABALHADOS: resumoSemana.LEADS_TRABALHADOS,
          REUNIOES: resumoSemana.REUNIOES,
          OPORTUNIDADES_CRIADAS: resumoSemana.OPORTUNIDADES_CRIADAS,
          GANHOS: resumoSemana.GANHOS,
          TAXA_LEAD_OPORTUNIDADE: resumoSemana.TAXA_LEAD_OPORTUNIDADE,
          CLIENTES_UNICOS: resumoSemana.CLIENTES_UNICOS,
          ATIVIDADES_SEM_CLIENTE: resumoSemana.ATIVIDADES_SEM_CLIENTE,
          MEDIA_ATIVIDADES_POR_CLIENTE: resumoSemana.MEDIA_ATIVIDADES_POR_CLIENTE,
          CLIENTES_COM_MULTIPLAS_ATIVIDADES: resumoSemana.CLIENTES_COM_MULTIPLAS_ATIVIDADES,
          MAIOR_CONCENTRACAO_ATIVIDADES: resumoSemana.MAIOR_CONCENTRACAO_ATIVIDADES,
          CLIENTE_MAIS_TRABALHADO: resumoSemana.CLIENTE_MAIS_TRABALHADO
        },
        mes: {
          ATIVIDADES: resumoMes.ATIVIDADES,
          MEDIA_DIA_UTIL: resumoMes.MEDIA_ATIVIDADES_DIA_UTIL,
          LEADS_TRABALHADOS: resumoMes.LEADS_TRABALHADOS,
          REUNIOES: resumoMes.REUNIOES,
          OPORTUNIDADES_CRIADAS: resumoMes.OPORTUNIDADES_CRIADAS,
          GANHOS: resumoMes.GANHOS,
          TAXA_LEAD_OPORTUNIDADE: resumoMes.TAXA_LEAD_OPORTUNIDADE,
          CLIENTES_UNICOS: resumoMes.CLIENTES_UNICOS,
          ATIVIDADES_SEM_CLIENTE: resumoMes.ATIVIDADES_SEM_CLIENTE,
          MEDIA_ATIVIDADES_POR_CLIENTE: resumoMes.MEDIA_ATIVIDADES_POR_CLIENTE,
          CLIENTES_COM_MULTIPLAS_ATIVIDADES: resumoMes.CLIENTES_COM_MULTIPLAS_ATIVIDADES,
          MAIOR_CONCENTRACAO_ATIVIDADES: resumoMes.MAIOR_CONCENTRACAO_ATIVIDADES,
          CLIENTE_MAIS_TRABALHADO: resumoMes.CLIENTE_MAIS_TRABALHADO
        },
        backlog_atual: backlog.length,
        backlog_criticos: backlogCriticos,
        cobertura_backlog_mes_pct: coberturaBacklogMes
      },
      diario,
      clientes_atividades: clientesAtividades,
      mix,
      conversoes,
      rotas,
      transicoes,
      jornada_leads: linhasJornada.sort((a, b) => b.ATIVIDADES_MES - a.ATIVIDADES_MES),
      backlog,
      backlog_por_status: backlogPorStatus
    };

    renderizarAnaliseSDR();
    dadosExtraidos = resultadoAnaliseSDR.jornada_leads;
    camposExtraidos = camposDeDados(dadosExtraidos);

    atualizarStatus(
      `Análise SDR concluída: ${resumoMes.ATIVIDADES} atividade(s) no mês, ` +
      `${resumoSemana.ATIVIDADES} na semana, ${resumoMes.LEADS_TRABALHADOS} Lead(s) trabalhado(s) no mês ` +
      `e ${backlog.length} Lead(s) atualmente em processamento com ${sdrNome}.`
    );
  } catch (e) {
    mostrarErro("Não foi possível montar a Análise SDR semanal/mensal.\n\nDetalhe técnico: " + e.message);
  } finally {
    document.getElementById("spinner").style.display = "none";
    document.getElementById("btnExtrair").disabled = false;
    document.getElementById("btnParar").disabled = true;
  }
}

function renderizarAnaliseSDR() {
  const r = resultadoAnaliseSDR;
  if (!r?.resumo) return;

  document.getElementById("bloco-analise-sdr").classList.remove("oculto");
  document.getElementById("analiseSdrPeriodoTexto").innerHTML =
    `<strong>${escapeHtmlRelatorio(r.meta.sdr_nome)}</strong> <span class="badge-relatorio ok">SDR</span> • ` +
    `Semana: <strong>${escapeHtmlRelatorio(formatarDataBR(r.meta.semana_inicio))} a ${escapeHtmlRelatorio(formatarDataBR(r.meta.semana_fim))}</strong> • ` +
    `Mês: <strong>${escapeHtmlRelatorio(formatarDataBR(r.meta.mes_inicio))} a ${escapeHtmlRelatorio(formatarDataBR(r.meta.mes_fim))}</strong> • ` +
    `Backlog atual: <strong>${r.resumo.backlog_atual}</strong> Lead(s), ${r.resumo.backlog_criticos} crítico(s).`;

  const semana = r.resumo.semana;
  const mes = r.resumo.mes;

  const montarKpis = (obj) => [
    ["Atividades", obj.ATIVIDADES],
    ["Clientes únicos", obj.CLIENTES_UNICOS],
    ["Atividades / cliente", obj.MEDIA_ATIVIDADES_POR_CLIENTE],
    ["Clientes com múltiplas", obj.CLIENTES_COM_MULTIPLAS_ATIVIDADES],
    ["Leads trabalhados", obj.LEADS_TRABALHADOS],
    ["Reuniões", obj.REUNIOES],
    ["Oportunidades criadas", obj.OPORTUNIDADES_CRIADAS],
    ["Lead → Oportunidade", `${obj.TAXA_LEAD_OPORTUNIDADE}%`]
  ].map(([rotulo, valor]) =>
    `<div class="relatorio-especial-kpi"><span class="valor">${escapeHtmlRelatorio(valor)}</span><span class="rotulo">${escapeHtmlRelatorio(rotulo)}</span></div>`
  ).join("");

  document.getElementById("analiseSdrSemanaKpis").innerHTML = montarKpis(semana);
  document.getElementById("analiseSdrMesKpis").innerHTML = montarKpis(mes);

  document.getElementById("analiseSdrDiarioTabela").innerHTML = tabelaRelatorio([
    { label: "Data", valor: (x) => x.DATA_BR || formatarDataBR(x.DATA) },
    { label: "Dia", valor: "DIA_SEMANA" },
    { label: "Atividades", valor: "ATIVIDADES" },
    { label: "Ligações", valor: "LIGACOES" },
    { label: "Reuniões", valor: "REUNIOES" },
    { label: "Tarefas", valor: "TAREFAS" },
    { label: "E-mails", valor: "EMAILS" },
    { label: "WhatsApp", valor: "WHATSAPP" },
    { label: "Leads únicos", valor: "LEADS_UNICOS" },
    { label: "Negócios únicos", valor: "NEGOCIOS_UNICOS" },
    { label: "Clientes únicos", valor: "CLIENTES_UNICOS" },
    { label: "Ativ./cliente", valor: "MEDIA_ATIVIDADES_POR_CLIENTE" },
    { label: "Sem cliente", valor: "ATIVIDADES_SEM_CLIENTE" }
  ], r.diario, 62);

  document.getElementById("analiseSdrClientesTabela").innerHTML = tabelaRelatorio([
    { label: "Cliente", valor: "CLIENTE" },
    { label: "Ativ. semana", valor: "ATIVIDADES_SEMANA" },
    { label: "Ativ. mês", valor: "ATIVIDADES_MES" },
    { label: "Dias ativos", valor: "DIAS_ATIVOS" },
    { label: "Ligações", valor: "LIGACOES" },
    { label: "Reuniões", valor: "REUNIOES" },
    { label: "WhatsApp", valor: "WHATSAPP" },
    { label: "E-mails", valor: "EMAILS" },
    { label: "Primeira", valor: "PRIMEIRA_ATIVIDADE_BR" },
    { label: "Última", valor: "ULTIMA_ATIVIDADE_BR" }
  ], r.clientes_atividades, 300);

  document.getElementById("analiseSdrMixTabela").innerHTML = tabelaRelatorio([
    { label: "Canal", valor: "CANAL" },
    { label: "Semana", valor: "SEMANA" },
    { label: "Mês", valor: "MES" }
  ], r.mix);

  document.getElementById("analiseSdrConversoesTabela").innerHTML = tabelaRelatorio([
    { label: "Conversão", valor: "METRICA" },
    { label: "Semana", valor: (x) => `<strong>${x.TAXA_SEMANA}%</strong> <span class="rodape-nota">(${x.NUMERADOR_SEMANA}/${x.DENOMINADOR_SEMANA})</span>`, html: true },
    { label: "Mês", valor: (x) => `<strong>${x.TAXA_MES}%</strong> <span class="rodape-nota">(${x.NUMERADOR_MES}/${x.DENOMINADOR_MES})</span>`, html: true }
  ], r.conversoes);

  document.getElementById("analiseSdrRotasTabela").innerHTML = tabelaRelatorio([
    { label: "Rota", valor: "ROTA" },
    { label: "Leads", valor: "LEADS" }
  ], r.rotas);

  document.getElementById("analiseSdrTransicoesTabela").innerHTML = tabelaRelatorio([
    { label: "De", valor: "DE" },
    { label: "Para", valor: "PARA" },
    { label: "Ocorrências", valor: "QTD" }
  ], r.transicoes);

  document.getElementById("analiseSdrLeadsTabela").innerHTML = tabelaRelatorio([
    { label: "Lead", valor: "LEAD_ID" },
    { label: "Cliente", valor: "CLIENTE" },
    { label: "Status atual", valor: "STATUS_ATUAL" },
    { label: "Ativ. semana", valor: "ATIVIDADES_SEMANA" },
    { label: "Ativ. mês", valor: "ATIVIDADES_MES" },
    { label: "Reuniões mês", valor: "REUNIOES_MES" },
    { label: "Oportunidades", valor: "OPORTUNIDADES" },
    { label: "Ganhos", valor: "GANHOS" },
    { label: "Jornada", valor: "JORNADA" }
  ], r.jornada_leads, 250);

  document.getElementById("analiseSdrBacklogTabela").innerHTML = tabelaRelatorio([
    { label: "Lead", valor: "LEAD_ID" },
    { label: "Cliente", valor: "CLIENTE" },
    { label: "Status", valor: "STATUS" },
    { label: "Criado em", valor: (x) => formatarDataBR(x.DATE_CREATE) },
    { label: "Última atividade", valor: (x) => formatarDataHoraBR(x.LAST_ACTIVITY_TIME) },
    { label: "Dias sem atividade", valor: "DIAS_SEM_ATIVIDADE" },
    { label: "Atividade no mês", valor: (x) => x.ATIVIDADE_NO_MES === "S" ? '<span class="badge-relatorio ok">Sim</span>' : '<span class="badge-relatorio alerta">Não</span>', html: true },
    { label: "Crítico", valor: (x) => x.CRITICO === "N" ? "" : `<span class="badge-relatorio alerta">${escapeHtmlRelatorio(x.CRITICO)}</span>`, html: true }
  ], r.backlog, 250);
}



function tabelaModelo(headers,rows){
  return `<div class="model-table-wrap"><table class="model-table"><thead><tr>${headers.map((h)=>`<th>${escapeHtmlRelatorio(h.label)}</th>`).join("")}</tr></thead><tbody>`+
    (rows||[]).map((r)=>`<tr>${headers.map((h)=>`<td>${h.html?h.valor(r):escapeHtmlRelatorio(h.valor(r)??"")}</td>`).join("")}</tr>`).join("")+
    `</tbody></table></div>`;
}
function gerarHTMLRelatorioJoao(){
  const r=resultadoAnaliseSDR;if(!r?.resumo)return "";
  const s=r.resumo.semana,m=r.resumo.mes,top=r.clientes_atividades?.[0];
  const insight=m.ATIVIDADES
    ? `${m.ATIVIDADES} atividades no mês correspondem a ${m.CLIENTES_UNICOS} cliente(s) único(s). ${m.CLIENTES_COM_MULTIPLAS_ATIVIDADES} cliente(s) receberam mais de uma atividade.`+(top?` Maior concentração: ${top.CLIENTE}, com ${top.ATIVIDADES_MES} atividade(s).`:"")
    : "Sem atividades concluídas no mês.";
  const cards=(r.clientes_atividades||[]).slice(0,100).map((x)=>`<div class="ccard"><div class="ccard-top"><span class="stage-badge s-2">${x.ATIVIDADES_MES} atividade(s)</span><span class="ccard-value">${x.DIAS_ATIVOS} dia(s)</span></div><div class="ccard-name">${escapeHtmlRelatorio(x.CLIENTE)}</div><div class="ccard-meta"><span>☎ ${x.LIGACOES} ligação(ões) · 🤝 ${x.REUNIOES} reunião(ões)</span><span>💬 ${x.WHATSAPP} WhatsApp · ✉ ${x.EMAILS} e-mail(s)</span></div><div class="ccard-date">Primeira: ${escapeHtmlRelatorio(x.PRIMEIRA_ATIVIDADE_BR||"—")} · Última: ${escapeHtmlRelatorio(x.ULTIMA_ATIVIDADE_BR||"—")}</div></div>`).join("");
  const diario=tabelaModelo([
    {label:"Data",valor:(x)=>x.DATA_BR||formatarDataBR(x.DATA)},{label:"Dia",valor:(x)=>x.DIA_SEMANA},{label:"Atividades",valor:(x)=>x.ATIVIDADES},
    {label:"Clientes únicos",valor:(x)=>x.CLIENTES_UNICOS},{label:"Ativ./cliente",valor:(x)=>x.MEDIA_ATIVIDADES_POR_CLIENTE},
    {label:"Ligações",valor:(x)=>x.LIGACOES},{label:"Reuniões",valor:(x)=>x.REUNIOES},{label:"WhatsApp",valor:(x)=>x.WHATSAPP}
  ],(r.diario||[]).filter((x)=>x.ATIVIDADES>0));
  const conv=tabelaModelo([
    {label:"Conversão",valor:(x)=>x.METRICA},{label:"Semana",valor:(x)=>`${x.TAXA_SEMANA}% (${x.NUMERADOR_SEMANA}/${x.DENOMINADOR_SEMANA})`},{label:"Mês",valor:(x)=>`${x.TAXA_MES}% (${x.NUMERADOR_MES}/${x.DENOMINADOR_MES})`}
  ],r.conversoes||[]);
  const backlog=tabelaModelo([
    {label:"Cliente",valor:(x)=>x.CLIENTE},{label:"Status",valor:(x)=>x.STATUS},{label:"Criado em",valor:(x)=>formatarDataBR(x.DATE_CREATE)},
    {label:"Última atividade",valor:(x)=>formatarDataHoraBR(x.LAST_ACTIVITY_TIME)},{label:"Dias sem atividade",valor:(x)=>x.DIAS_SEM_ATIVIDADE},{label:"Crítico",valor:(x)=>x.CRITICO}
  ],(r.backlog||[]).slice(0,120));
  const rotas=tabelaModelo([{label:"Rota",valor:(x)=>x.ROTA},{label:"Leads",valor:(x)=>x.LEADS}],(r.rotas||[]).slice(0,50));
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Análise SDR — ${escapeHtmlRelatorio(r.meta.sdr_nome)} · Atlas</title><style>${MODELO_EXECUTIVO_CSS}</style></head><body>`+
  `<div class="letterhead"><div class="letterhead-inner"><div class="letterhead-brand">${MODELO_EXECUTIVO_LOGO}<div class="letterhead-divider"></div><div class="letterhead-tagline">Gerenciamento de Risco em Processos Logísticos</div></div><div class="letterhead-ref"><strong>Relatório SDR</strong><br>Extraído do Bitrix24 em ${formatarDataBR(formatarDataISO(new Date()))}</div></div></div>`+
  `<header class="hero"><div class="hero-inner"><p class="eyebrow">Inteligência Comercial · SDR</p><h1>Análise SDR — ${escapeHtmlRelatorio(r.meta.sdr_nome)}</h1><p class="subtitle">Produção diária, clientes diferentes, jornada e taxas de conversão. Semana ${formatarDataBR(r.meta.semana_inicio)} a ${formatarDataBR(r.meta.semana_fim)} · Mês ${formatarDataBR(r.meta.mes_inicio)} a ${formatarDataBR(r.meta.mes_fim)}.</p></div></header>`+
  `<div class="wrap"><div class="overview-panel" id="visao-geral"><h2 class="section" style="margin-top:0;">Visão geral</h2><div class="kpis">`+
  `<div class="kpi accent"><div class="label">Atividades no mês</div><div class="value">${m.ATIVIDADES}</div><div class="small">${m.CLIENTES_UNICOS} clientes únicos</div></div>`+
  `<div class="kpi"><div class="label">Atividades na semana</div><div class="value">${s.ATIVIDADES}</div><div class="small">${s.CLIENTES_UNICOS} clientes únicos</div></div>`+
  `<div class="kpi good"><div class="label">Lead → Oportunidade</div><div class="value">${m.TAXA_LEAD_OPORTUNIDADE}%</div><div class="small">${m.LEADS_TRABALHADOS} Leads trabalhados</div></div>`+
  `<div class="kpi warn"><div class="label">Backlog atual</div><div class="value">${r.resumo.backlog_atual}</div><div class="small">${r.resumo.backlog_criticos} crítico(s)</div></div></div></div>`+
  `<div class="explainer"><h2>O que significa “${m.ATIVIDADES} atividades”?</h2><p>${escapeHtmlRelatorio(insight)}</p></div>`+
  `<div class="activity-insight"><div class="mini-kpi"><b>${m.CLIENTES_UNICOS}</b><span>Clientes únicos</span></div><div class="mini-kpi"><b>${m.MEDIA_ATIVIDADES_POR_CLIENTE}</b><span>Atividades / cliente</span></div><div class="mini-kpi"><b>${m.CLIENTES_COM_MULTIPLAS_ATIVIDADES}</b><span>Clientes com repetição</span></div><div class="mini-kpi"><b>${m.ATIVIDADES_SEM_CLIENTE}</b><span>Atividades sem cliente</span></div></div>`+
  `<h2 class="section">Semana e mês</h2><div class="top3grid"><details class="vcard section-card" open><summary><span class="vcard-name">📅 Semana atual</span><span class="vcard-stats">${s.ATIVIDADES} atividades · ${s.CLIENTES_UNICOS} clientes</span><span class="vcard-chevron">▾</span></summary><div class="vcard-body"><div class="activity-insight"><div class="mini-kpi"><b>${s.REUNIOES}</b><span>Reuniões</span></div><div class="mini-kpi"><b>${s.OPORTUNIDADES_CRIADAS}</b><span>Oportunidades</span></div><div class="mini-kpi"><b>${s.GANHOS}</b><span>Ganhos</span></div><div class="mini-kpi"><b>${s.MEDIA_ATIVIDADES_POR_CLIENTE}</b><span>Ativ./cliente</span></div></div></div></details>`+
  `<details class="vcard section-card"><summary><span class="vcard-name">🗓️ Mês atual</span><span class="vcard-stats">${m.ATIVIDADES} atividades · ${m.CLIENTES_UNICOS} clientes</span><span class="vcard-chevron">▾</span></summary><div class="vcard-body">${diario}</div></details>`+
  `<details class="vcard section-card"><summary><span class="vcard-name">📌 Backlog atual</span><span class="vcard-stats">${r.resumo.backlog_atual} Leads · ${r.resumo.backlog_criticos} críticos</span><span class="vcard-chevron">▾</span></summary><div class="vcard-body">${backlog}</div></details></div>`+
  `<h2 class="section">Atividades por cliente</h2><p class="section-sub">Mostra se o volume veio de clientes diferentes ou de várias atividades repetidas no mesmo cliente.</p><div class="cgrid">${cards||'<p class="small-note">Sem clientes trabalhados.</p>'}</div>`+
  `<h2 class="section">Taxas de conversão</h2>${conv}<h2 class="section">Jornadas mais frequentes</h2>${rotas}`+
  `<footer><div class="footer-brand">${MODELO_EXECUTIVO_LOGO}<span>Atlas</span></div>Atlas · Análise SDR · ${escapeHtmlRelatorio(r.meta.sdr_nome)}</footer></div></body></html>`;
}
function abrirRelatorioVisualJoao(){const h=gerarHTMLRelatorioJoao();if(h)abrirHtmlEmNovaAba(h);}
function baixarHTMLRelatorioJoao(){const h=gerarHTMLRelatorioJoao();if(h)baixarArquivo(h,`analise_sdr_joao_modelo_atlas_${dataHoje()}.html`,"text/html;charset=utf-8;");}

async function extrairDiarioSDR(webhook) {
  document.getElementById("spinner").style.display = "inline-block";
  document.getElementById("btnExtrair").disabled = true;
  document.getElementById("btnParar").disabled = false;
  extracaoCancelada = false;
  esconderErro();
  resultadoDiarioSDR = {};

  try {
    const inicio = document.getElementById("dataInicio").value;
    const fim = document.getElementById("dataFim").value || inicio;
    if (!inicio || !fim) throw new Error("Informe o dia/período em De/Até.");

    atualizarStatus("Diário SDR: carregando usuários, pipelines e etapas...");
    const [meta, statusLeads] = await Promise.all([
      buscarMetadadosFunisEEstagios(webhook),
      carregarListaPaginada(webhook, "crm.status.list", {
        "filter[ENTITY_ID]": "STATUS",
        "order[SORT]": "ASC"
      }),
      buscarUsuariosJornada(webhook)
    ]);

    const mapaStatusLead = {};
    statusLeads.forEach((s) => { mapaStatusLead[String(s.STATUS_ID)] = s; });

    const palavrasEtapas = palavrasConfiguradas("palavrasEtapasSDR");
    const palavrasFunis = palavrasConfiguradas("palavrasFunisSDR");

    const statusSdrIds = statusLeads
      .filter((s) => textoContemAlgumaPalavra(s.NAME || s.STATUS_ID, palavrasEtapas))
      .map((s) => String(s.STATUS_ID));

    let categoriasPotenciais = encontrarCategoriasPorPalavras(meta, palavrasFunis, true);
    if (!categoriasPotenciais.length && meta.categorias?.["0"]) categoriasPotenciais = ["0"];

    const inicioDt = inicio + "T00:00:00-03:00";
    const fimDt = fim + "T23:59:59-03:00";

    const camposAtividade = [
      "ID", "OWNER_ID", "OWNER_TYPE_ID", "TYPE_ID", "PROVIDER_ID", "PROVIDER_TYPE_ID",
      "SUBJECT", "COMPLETED", "RESPONSIBLE_ID", "AUTHOR_ID", "CREATED", "LAST_UPDATED",
      "START_TIME", "END_TIME", "DEADLINE", "DIRECTION", "BINDINGS"
    ];

    const atividadesBusca = await listarCompletoRelatorio(
      webhook,
      "crm.activity.list",
      camposAtividade,
      { "COMPLETED": "Y", ">=END_TIME": inicioDt, "<=END_TIME": fimDt },
      { ID: "ASC" },
      "Diário SDR: buscando atividades concluídas..."
    );
    const atividades = atividadesBusca.dados;

    atualizarStatus("Diário SDR: buscando Leads em processamento...");
    const leadsBusca = await listarCompletoRelatorio(
      webhook,
      "crm.lead.list",
      [
        "ID", "TITLE", "NAME", "LAST_NAME", "COMPANY_ID", "COMPANY_TITLE", "STATUS_ID",
        "STATUS_SEMANTIC_ID", "SOURCE_ID", "ASSIGNED_BY_ID", "DATE_CREATE", "DATE_MODIFY",
        "LAST_ACTIVITY_TIME", "LAST_ACTIVITY_BY", "PHONE", "EMAIL", "OPPORTUNITY"
      ],
      { "STATUS_SEMANTIC_ID": "P" },
      { ID: "ASC" },
      "Diário SDR: buscando Leads ativos..."
    );
    const leadsAtivos = leadsBusca.dados;

    atualizarStatus("Diário SDR: buscando potenciais nos pipelines Comercial / SDR...");
    const dealsBusca = await listarCompletoRelatorio(
      webhook,
      "crm.deal.list",
      [
        "ID", "TITLE", "CATEGORY_ID", "STAGE_ID", "STAGE_SEMANTIC_ID", "OPPORTUNITY",
        "ASSIGNED_BY_ID", "COMPANY_ID", "CONTACT_ID", "LEAD_ID", "DATE_CREATE",
        "DATE_MODIFY", "MOVED_TIME", "CLOSEDATE", "LAST_ACTIVITY_TIME", "SOURCE_ID"
      ],
      {
        "@CATEGORY_ID": categoriasPotenciais,
        "STAGE_SEMANTIC_ID": "P"
      },
      { ID: "ASC" },
      "Diário SDR: buscando negócios potenciais..."
    );
    const dealsPotenciaisBrutos = dealsBusca.dados;

    const leadIdsAtendidos = new Set();
    const dealIdsAtendidos = new Set();
    const atividadePorLead = {};
    const atividadePorDeal = {};

    atividades.forEach((a) => {
      const bindings = bindingsDaAtividade(a);
      bindings.forEach((b) => {
        if (b.OWNER_TYPE_ID === "1") {
          leadIdsAtendidos.add(b.OWNER_ID);
          (atividadePorLead[b.OWNER_ID] ||= []).push(a);
        }
        if (b.OWNER_TYPE_ID === "2") {
          dealIdsAtendidos.add(b.OWNER_ID);
          (atividadePorDeal[b.OWNER_ID] ||= []).push(a);
        }
      });
    });

    const leadsAtendidosMap = await buscarEntidadesPorIds(
      webhook,
      "crm.lead.list",
      [...leadIdsAtendidos],
      [
        "ID", "TITLE", "NAME", "LAST_NAME", "COMPANY_TITLE", "STATUS_ID", "STATUS_SEMANTIC_ID",
        "SOURCE_ID", "ASSIGNED_BY_ID", "DATE_CREATE", "DATE_MODIFY", "LAST_ACTIVITY_TIME", "OPPORTUNITY"
      ]
    );

    const idsEmpresaDeals = [...new Set(
      dealsPotenciaisBrutos.map((d) => d.COMPANY_ID).filter(idBitrixValido).map(idBitrixString)
    )];
    const empresasDeals = await buscarEntidadesPorIds(webhook, "crm.company.list", idsEmpresaDeals, ["ID", "TITLE"]);

    const potenciaisLeadsBase = statusSdrIds.length
      ? leadsAtivos.filter((l) => statusSdrIds.includes(String(l.STATUS_ID)))
      : leadsAtivos;

    const potenciaisLeads = potenciaisLeadsBase.map((l) => {
      const acts = atividadePorLead[String(l.ID)] || [];
      const canais = [...new Set(acts.map(canalAtividadeSDR))];
      return {
        LEAD_ID: l.ID,
        TITULO: l.TITLE || "",
        CONTATO: `${l.NAME || ""} ${l.LAST_NAME || ""}`.trim(),
        EMPRESA: l.COMPANY_TITLE || "",
        STATUS_ID: l.STATUS_ID || "",
        STATUS: labelStatusLead(mapaStatusLead, l.STATUS_ID),
        RESPONSAVEL_ID: idBitrixString(l.ASSIGNED_BY_ID),
        RESPONSAVEL: nomeUsuario(l.ASSIGNED_BY_ID),
        SOURCE_ID: l.SOURCE_ID || "",
        OPPORTUNITY: Number(l.OPPORTUNITY) || 0,
        DATE_CREATE: l.DATE_CREATE || "",
        LAST_ACTIVITY_TIME: l.LAST_ACTIVITY_TIME || "",
        ATENDIDO_NO_PERIODO: acts.length ? "S" : "N",
        ATIVIDADES_NO_PERIODO: acts.length,
        CANAIS_NO_PERIODO: canais.join(" | ")
      };
    });

    const potenciaisNegocios = dealsPotenciaisBrutos.map((d) => {
      const cat = String(d.CATEGORY_ID || "");
      const stageMeta = meta.estagios?.[cat]?.[String(d.STAGE_ID)] || {};
      const acts = atividadePorDeal[String(d.ID)] || [];
      const cliente = idBitrixValido(d.COMPANY_ID)
        ? (empresasDeals[idBitrixString(d.COMPANY_ID)]?.TITLE || d.TITLE || "")
        : (d.TITLE || "");
      return {
        DEAL_ID: d.ID,
        CLIENTE: cliente,
        TITULO: d.TITLE || "",
        PIPELINE: nomeFunilSemCodigo(meta.categorias?.[cat] || `Categoria ${cat}`),
        ESTAGIO: stageMeta.label || d.STAGE_ID || "",
        RESPONSAVEL_ID: idBitrixString(d.ASSIGNED_BY_ID),
        RESPONSAVEL: nomeUsuario(d.ASSIGNED_BY_ID),
        OPPORTUNITY: Number(d.OPPORTUNITY) || 0,
        CLOSEDATE: parteDataISO(d.CLOSEDATE),
        MOVED_TIME: d.MOVED_TIME || "",
        LAST_ACTIVITY_TIME: d.LAST_ACTIVITY_TIME || "",
        ATENDIDO_NO_PERIODO: acts.length ? "S" : "N",
        ATIVIDADES_NO_PERIODO: acts.length,
        CANAIS_NO_PERIODO: [...new Set(acts.map(canalAtividadeSDR))].join(" | ")
      };
    });

    const leadsAtendidos = Object.values(leadsAtendidosMap).map((l) => {
      const acts = atividadePorLead[String(l.ID)] || [];
      return {
        LEAD_ID: l.ID,
        TITULO: l.TITLE || "",
        CONTATO: `${l.NAME || ""} ${l.LAST_NAME || ""}`.trim(),
        EMPRESA: l.COMPANY_TITLE || "",
        STATUS: labelStatusLead(mapaStatusLead, l.STATUS_ID),
        RESPONSAVEL: nomeUsuario(l.ASSIGNED_BY_ID),
        SOURCE_ID: l.SOURCE_ID || "",
        ATIVIDADES_NO_PERIODO: acts.length,
        CANAIS: [...new Set(acts.map(canalAtividadeSDR))].join(" | "),
        LAST_ACTIVITY_TIME: l.LAST_ACTIVITY_TIME || ""
      };
    }).sort((a, b) => b.ATIVIDADES_NO_PERIODO - a.ATIVIDADES_NO_PERIODO);

    const nomeSdrPrincipal = String(document.getElementById("nomeSdrPrincipal")?.value || "João Reis").trim();
    const usuariosSdrConfigurados = encontrarUsuariosPorNomeConfigurado(nomeSdrPrincipal);

    const sdrUserIds = new Set([
      ...potenciaisLeads.map((x) => String(x.RESPONSAVEL_ID || "")).filter(Boolean),
      ...potenciaisNegocios.map((x) => String(x.RESPONSAVEL_ID || "")).filter(Boolean),
      ...usuariosSdrConfigurados.map((x) => String(x.id))
    ]);

    const atividadesEnriquecidas = atividades.map((a) => {
      const binds = bindingsDaAtividade(a);
      return {
        ATIVIDADE_ID: a.ID,
        DATA_FIM: a.END_TIME || "",
        RESPONSAVEL_ID: idBitrixString(a.RESPONSIBLE_ID),
        RESPONSAVEL: nomeUsuario(a.RESPONSIBLE_ID),
        TIPO_ID: a.TYPE_ID || "",
        TIPO: TIPOS_ATIVIDADE_BITRIX[String(a.TYPE_ID)] || "Outro",
        CANAL: canalAtividadeSDR(a),
        ASSUNTO: a.SUBJECT || "",
        DIRECAO: String(a.DIRECTION) === "1" ? "Entrada" : (String(a.DIRECTION) === "2" ? "Saída" : ""),
        VINCULOS: binds.map((b) => `${nomeTipoEntidadeCRM(b.OWNER_TYPE_ID)}:${b.OWNER_ID}`).join(" | "),
        EH_RESPONSAVEL_SDR_COMERCIAL: sdrUserIds.has(idBitrixString(a.RESPONSIBLE_ID)) ? "S" : "N"
      };
    });

    const atividadesSDR = atividadesEnriquecidas.filter((a) => a.EH_RESPONSAVEL_SDR_COMERCIAL === "S");

    const resumoPorResponsavel = {};
    const garantirResp = (id, nome) => {
      const k = String(id || "0");
      if (!resumoPorResponsavel[k]) {
        resumoPorResponsavel[k] = {
          RESPONSAVEL_ID: id || "",
          RESPONSAVEL: nome || (id ? `ID ${id}` : "Sem responsável"),
          ATIVIDADES: 0,
          REUNIOES: 0,
          LIGACOES: 0,
          TAREFAS: 0,
          EMAILS: 0,
          WHATSAPP: 0,
          OUTRAS: 0,
          LEADS_ATENDIDOS: 0,
          NEGOCIOS_ATENDIDOS: 0,
          POTENCIAIS_LEADS: 0,
          POTENCIAIS_NEGOCIOS: 0,
          POTENCIAIS_SEM_ATIVIDADE: 0
        };
      }
      return resumoPorResponsavel[k];
    };

    // SDR explicitamente configurado. João Reis permanece no relatório mesmo
    // quando não tiver Lead/Negócio potencial atribuído naquele dia.
    usuariosSdrConfigurados.forEach((u) => garantirResp(u.id, u.nome));

    potenciaisLeads.forEach((x) => {
      const rr = garantirResp(x.RESPONSAVEL_ID, x.RESPONSAVEL);
      rr.POTENCIAIS_LEADS++;
      if (x.ATENDIDO_NO_PERIODO !== "S") rr.POTENCIAIS_SEM_ATIVIDADE++;
    });
    potenciaisNegocios.forEach((x) => {
      const rr = garantirResp(x.RESPONSAVEL_ID, x.RESPONSAVEL);
      rr.POTENCIAIS_NEGOCIOS++;
      if (x.ATENDIDO_NO_PERIODO !== "S") rr.POTENCIAIS_SEM_ATIVIDADE++;
    });

    const leadsPorResp = {};
    const dealsPorResp = {};
    atividadesSDR.forEach((a) => {
      const rr = garantirResp(a.RESPONSAVEL_ID, a.RESPONSAVEL);
      rr.ATIVIDADES++;
      if (a.CANAL === "Reunião") rr.REUNIOES++;
      else if (a.CANAL === "Ligação") rr.LIGACOES++;
      else if (a.CANAL === "Tarefa") rr.TAREFAS++;
      else if (a.CANAL === "E-mail") rr.EMAILS++;
      else if (a.CANAL === "WhatsApp") rr.WHATSAPP++;
      else rr.OUTRAS++;

      const binds = String(a.VINCULOS || "").split(" | ");
      binds.forEach((b) => {
        if (b.startsWith("Lead:")) (leadsPorResp[a.RESPONSAVEL_ID] ||= new Set()).add(b.slice(5));
        if (b.startsWith("Negócio:")) (dealsPorResp[a.RESPONSAVEL_ID] ||= new Set()).add(b.slice(8));
      });
    });

    Object.values(resumoPorResponsavel).forEach((r) => {
      r.LEADS_ATENDIDOS = leadsPorResp[r.RESPONSAVEL_ID]?.size || 0;
      r.NEGOCIOS_ATENDIDOS = dealsPorResp[r.RESPONSAVEL_ID]?.size || 0;
    });

    const idsSdrPrincipal = new Set(usuariosSdrConfigurados.map((u) => String(u.id)));
    const responsaveis = Object.values(resumoPorResponsavel)
      .sort((a, b) => {
        const aPrincipal = idsSdrPrincipal.has(String(a.RESPONSAVEL_ID)) ? 1 : 0;
        const bPrincipal = idsSdrPrincipal.has(String(b.RESPONSAVEL_ID)) ? 1 : 0;
        if (aPrincipal !== bPrincipal) return bPrincipal - aPrincipal;
        return b.ATIVIDADES - a.ATIVIDADES || b.POTENCIAIS_SEM_ATIVIDADE - a.POTENCIAIS_SEM_ATIVIDADE;
      })
      .map((r) => ({
        ...r,
        PAPEL: idsSdrPrincipal.has(String(r.RESPONSAVEL_ID)) ? "SDR" : ""
      }));

    const potenciaisSemAtividade = potenciaisLeads.filter((x) => x.ATENDIDO_NO_PERIODO !== "S").length +
      potenciaisNegocios.filter((x) => x.ATENDIDO_NO_PERIODO !== "S").length;

    resultadoDiarioSDR = {
      meta: {
        inicio, fim,
        status_sdr_ids: statusSdrIds,
        status_sdr_labels: statusSdrIds.map((id) => labelStatusLead(mapaStatusLead, id)),
        fallback_todos_leads_ativos: statusSdrIds.length === 0,
        categorias_potenciais: categoriasPotenciais,
        funis_potenciais: categoriasPotenciais.map((id) => nomeFunilSemCodigo(meta.categorias?.[id] || `Categoria ${id}`)),
        sdr_principal_configurado: nomeSdrPrincipal,
        sdr_principal_encontrado: usuariosSdrConfigurados.length > 0,
        sdr_principal_ids: usuariosSdrConfigurados.map((u) => u.id),
        sdr_principal_nomes: usuariosSdrConfigurados.map((u) => u.nome),
        total_atividades_bitrix: atividadesBusca.total,
        total_leads_ativos_bitrix: leadsBusca.total,
        total_deals_potenciais_bitrix: dealsBusca.total
      },
      resumo: {
        ATIVIDADES_CRM_REALIZADAS: atividadesEnriquecidas.length,
        ATIVIDADES_SDR_COMERCIAL: atividadesSDR.length,
        LEADS_ATENDIDOS: leadsAtendidos.length,
        NEGOCIOS_ATENDIDOS: dealIdsAtendidos.size,
        POTENCIAIS_LEADS_SDR: potenciaisLeads.length,
        POTENCIAIS_NEGOCIOS_COMERCIAL_SDR: potenciaisNegocios.length,
        POTENCIAIS_SEM_ATIVIDADE: potenciaisSemAtividade,
        RESPONSAVEIS_MONITORADOS: responsaveis.length
      },
      responsaveis,
      atividades: atividadesEnriquecidas,
      atividades_sdr: atividadesSDR,
      leads_atendidos: leadsAtendidos,
      potenciais_leads: potenciaisLeads,
      potenciais_negocios: potenciaisNegocios
    };

    renderizarDiarioSDR();
    dadosExtraidos = atividadesSDR;
    camposExtraidos = camposDeDados(dadosExtraidos);
    atualizarStatus(`Diário SDR concluído: ${atividadesSDR.length} atividade(s) SDR/Comercial; ${leadsAtendidos.length} Lead(s) atendido(s); ${potenciaisSemAtividade} potencial(is) sem atividade no período.`);
  } catch (e) {
    mostrarErro("Não foi possível montar o Diário SDR.\n\nDetalhe técnico: " + e.message);
  } finally {
    document.getElementById("spinner").style.display = "none";
    document.getElementById("btnExtrair").disabled = false;
    document.getElementById("btnParar").disabled = true;
  }
}

function renderizarDiarioSDR() {
  const r = resultadoDiarioSDR;
  if (!r?.resumo) return;
  document.getElementById("bloco-diario-sdr").classList.remove("oculto");

  const etapasTexto = r.meta.status_sdr_labels.length ? r.meta.status_sdr_labels.join(", ") : "todos os Leads ativos (fallback)";
  const sdrPrincipalTexto = r.meta.sdr_principal_encontrado
    ? `${escapeHtmlRelatorio(r.meta.sdr_principal_nomes.join(", "))} <span class="badge-relatorio ok">SDR</span>`
    : `${escapeHtmlRelatorio(r.meta.sdr_principal_configurado)} <span class="badge-relatorio alerta">não localizado no crm.user.list</span>`;

  document.getElementById("diarioSdrPeriodoTexto").innerHTML =
    `<strong>${escapeHtmlRelatorio(formatarDataBR(r.meta.inicio))}${r.meta.fim !== r.meta.inicio ? " até " + escapeHtmlRelatorio(formatarDataBR(r.meta.fim)) : ""}</strong> • ` +
    `SDR principal: ${sdrPrincipalTexto} • Etapas SDR: ${escapeHtmlRelatorio(etapasTexto)} • ` +
    `Pipelines potenciais: ${escapeHtmlRelatorio(r.meta.funis_potenciais.join(", ") || "nenhum")}.`;

  const kpis = [
    ["Atividades CRM", r.resumo.ATIVIDADES_CRM_REALIZADAS],
    ["Atividades SDR/Comercial", r.resumo.ATIVIDADES_SDR_COMERCIAL],
    ["Leads atendidos", r.resumo.LEADS_ATENDIDOS],
    ["Negócios atendidos", r.resumo.NEGOCIOS_ATENDIDOS],
    ["Potenciais Leads SDR", r.resumo.POTENCIAIS_LEADS_SDR],
    ["Potenciais Comercial/SDR", r.resumo.POTENCIAIS_NEGOCIOS_COMERCIAL_SDR],
    ["Potenciais sem atividade", r.resumo.POTENCIAIS_SEM_ATIVIDADE],
    ["Responsáveis", r.resumo.RESPONSAVEIS_MONITORADOS]
  ];
  document.getElementById("diarioSdrKpis").innerHTML = kpis.map(([rotulo, valor]) =>
    `<div class="relatorio-especial-kpi"><span class="valor">${escapeHtmlRelatorio(valor)}</span><span class="rotulo">${escapeHtmlRelatorio(rotulo)}</span></div>`
  ).join("");

  document.getElementById("diarioSdrResponsaveisTabela").innerHTML = tabelaRelatorio([
    { label: "Responsável", valor: "RESPONSAVEL" },
    { label: "Papel", valor: (x) => x.PAPEL === "SDR" ? '<span class="badge-relatorio ok">SDR</span>' : "", html: true },
    { label: "Atividades", valor: "ATIVIDADES" },
    { label: "Ligações", valor: "LIGACOES" },
    { label: "Reuniões", valor: "REUNIOES" },
    { label: "WhatsApp", valor: "WHATSAPP" },
    { label: "E-mails", valor: "EMAILS" },
    { label: "Leads atendidos", valor: "LEADS_ATENDIDOS" },
    { label: "Negócios atendidos", valor: "NEGOCIOS_ATENDIDOS" },
    { label: "Potenciais Leads", valor: "POTENCIAIS_LEADS" },
    { label: "Potenciais negócios", valor: "POTENCIAIS_NEGOCIOS" },
    { label: "Sem atividade", valor: (x) => x.POTENCIAIS_SEM_ATIVIDADE ? `<span class="badge-relatorio alerta">${x.POTENCIAIS_SEM_ATIVIDADE}</span>` : "0", html: true }
  ], r.responsaveis);

  document.getElementById("diarioSdrAtividadesTabela").innerHTML = tabelaRelatorio([
    { label: "Fim", valor: (x) => formatarDataHoraBR(x.DATA_FIM) },
    { label: "Responsável", valor: "RESPONSAVEL" },
    { label: "Canal", valor: "CANAL" },
    { label: "Tipo", valor: "TIPO" },
    { label: "Assunto", valor: "ASSUNTO" },
    { label: "Direção", valor: "DIRECAO" },
    { label: "Vínculos", valor: "VINCULOS" }
  ], r.atividades_sdr);

  document.getElementById("diarioSdrLeadsAtendidosTabela").innerHTML = tabelaRelatorio([
    { label: "Lead", valor: "LEAD_ID" },
    { label: "Título", valor: "TITULO" },
    { label: "Empresa", valor: "EMPRESA" },
    { label: "Status", valor: "STATUS" },
    { label: "Responsável", valor: "RESPONSAVEL" },
    { label: "Atividades", valor: "ATIVIDADES_NO_PERIODO" },
    { label: "Canais", valor: "CANAIS" }
  ], r.leads_atendidos);

  document.getElementById("diarioSdrPotenciaisLeadsTabela").innerHTML = tabelaRelatorio([
    { label: "Lead", valor: "LEAD_ID" },
    { label: "Título", valor: "TITULO" },
    { label: "Empresa", valor: "EMPRESA" },
    { label: "Etapa", valor: "STATUS" },
    { label: "Responsável", valor: "RESPONSAVEL" },
    { label: "Atendido", valor: (x) => x.ATENDIDO_NO_PERIODO === "S" ? '<span class="badge-relatorio ok">Sim</span>' : '<span class="badge-relatorio alerta">Não</span>', html: true },
    { label: "Última atividade", valor: "LAST_ACTIVITY_TIME" }
  ], r.potenciais_leads);

  document.getElementById("diarioSdrPotenciaisNegociosTabela").innerHTML = tabelaRelatorio([
    { label: "Deal", valor: "DEAL_ID" },
    { label: "Cliente", valor: "CLIENTE" },
    { label: "Pipeline", valor: "PIPELINE" },
    { label: "Etapa", valor: "ESTAGIO" },
    { label: "Responsável", valor: "RESPONSAVEL" },
    { label: "Valor", valor: (x) => moedaRelatorio(x.OPPORTUNITY), html: true },
    { label: "Atendido", valor: (x) => x.ATENDIDO_NO_PERIODO === "S" ? '<span class="badge-relatorio ok">Sim</span>' : '<span class="badge-relatorio alerta">Não</span>', html: true },
    { label: "Última atividade", valor: "LAST_ACTIVITY_TIME" }
  ], r.potenciais_negocios);
}

// v11 — mesma ideia do adaptador da Jornada: monta {titulo,kpis,tabelas} a
// partir do resultado já calculado do Diário SDR para gerar o modelo visual.
function montarResultadoVisualDiarioSDR() {
  const r = resultadoDiarioSDR;
  if (!r?.resumo) return null;
  return {
    chave: "diario_sdr",
    titulo: "Diário SDR — atividades, Leads atendidos e potenciais",
    subtitulo: `${formatarDataBR(r.meta.inicio)}${r.meta.fim !== r.meta.inicio ? ` até ${formatarDataBR(r.meta.fim)}` : ""}`,
    kpis: [
      kpi("Atividades CRM", r.resumo.ATIVIDADES_CRM_REALIZADAS), kpi("Atividades SDR/Comercial", r.resumo.ATIVIDADES_SDR_COMERCIAL),
      kpi("Leads atendidos", r.resumo.LEADS_ATENDIDOS), kpi("Negócios atendidos", r.resumo.NEGOCIOS_ATENDIDOS),
      kpi("Potenciais Leads SDR", r.resumo.POTENCIAIS_LEADS_SDR), kpi("Potenciais Comercial/SDR", r.resumo.POTENCIAIS_NEGOCIOS_COMERCIAL_SDR),
      kpi("Potenciais sem atividade", r.resumo.POTENCIAIS_SEM_ATIVIDADE), kpi("Responsáveis", r.resumo.RESPONSAVEIS_MONITORADOS)
    ],
    tabelas: [
      { titulo: "Resumo por SDR / responsável", dados: r.responsaveis, colunas: [{ label: "Responsável", valor: "RESPONSAVEL" }, { label: "Atividades", valor: "ATIVIDADES" }, { label: "Leads atendidos", valor: "LEADS_ATENDIDOS" }, { label: "Negócios atendidos", valor: "NEGOCIOS_ATENDIDOS" }, { label: "Potenciais Leads", valor: "POTENCIAIS_LEADS" }, { label: "Potenciais negócios", valor: "POTENCIAIS_NEGOCIOS" }] },
      { titulo: "Leads atendidos no dia", dados: r.leads_atendidos, colunas: [{ label: "Lead", valor: "LEAD_ID" }, { label: "Empresa", valor: "EMPRESA" }, { label: "Status", valor: "STATUS" }, { label: "Responsável", valor: "RESPONSAVEL" }] },
      { titulo: "Potenciais Leads na esteira SDR", dados: r.potenciais_leads, colunas: [{ label: "Lead", valor: "LEAD_ID" }, { label: "Empresa", valor: "EMPRESA" }, { label: "Etapa", valor: "STATUS" }, { label: "Responsável", valor: "RESPONSAVEL" }] }
    ],
    nota: "Atividade realizada = COMPLETED=Y com END_TIME no período. Lead atendido exige vínculo da atividade ao Lead CRM."
  };
}
function abrirRelatorioVisualDiarioSDR() { const h = gerarHTMLRelatorioVisualGenerico(montarResultadoVisualDiarioSDR()); if (h) abrirHtmlEmNovaAba(h); }
function baixarHTMLRelatorioVisualDiarioSDR() { const h = gerarHTMLRelatorioVisualGenerico(montarResultadoVisualDiarioSDR()); if (h) baixarArquivo(h, `diario_sdr_modelo_atlas_${dataHoje()}.html`, "text/html;charset=utf-8;"); }


