// ---------------------------------------------------------------------------
// Metadados conhecidos do Bitrix da AtlasGR (confirmados via API em 08/08/2026
// — ver PIPELINE_MAPPING.md). Se a estrutura do CRM mudar, atualize aqui.
// ---------------------------------------------------------------------------

const ENTIDADES = {
  negocios: {
    label: "Negócios (Deals)",
    method: "crm.deal.list",
    fieldsMethod: "crm.deal.fields",
    hasCategoria: true,
    categorias: [
      { code: "", label: "Todas as categorias" },
      { code: "0", label: "0 — Comercial" },
      { code: "20", label: "20 — Financeiro" },
      { code: "50", label: "50 — Perfil Securitário" },
      { code: "3", label: "3 — Implantação" },
      { code: "5", label: "5 — Pós-Vendas" },
      { code: "46", label: "46 — Sucesso do Cliente" },
      { code: "48", label: "48 — Implantação Logística" },
      { code: "44", label: "44 — Financeiro (Reembolsos)" },
      { code: "8", label: "8 — RH" },
      { code: "32", label: "32 — T.I (interno)" },
      { code: "30", label: "30 — Negócios Perdidos (arquivo histórico)" },
      { code: "42", label: "42 — Área de Teste (dado de teste — não recomendado)" },
      { code: "56", label: "56 — Chamados SC" },
    ],
    estagiosPorCategoria: {
      "0": [
        { code: "UC_A0VPC5", label: "Nova Oportunidade" },
        { code: "NEW", label: "Proposta Enviada" },
        { code: "UC_5X3WZN", label: "Call/Visita Agendada" },
        { code: "UC_R1YAOS", label: "Piloto" },
        { code: "WON", label: "Negócios Ganhos" },
        { code: "LOSE", label: "Negócios Perdidos" },
      ],
      "20": [
        { code: "UC_JWY0OY", label: "Piloto Atlas Profile" },
        { code: "UC_AM8GK1", label: "Aguardando Assinatura (Piloto Atlas Profile)" },
        { code: "UC_I37148", label: "Termo Aceito (Piloto Profile)" },
        { code: "UC_EU6LUO", label: "Piloto Logístico" },
        { code: "UC_WBYFT4", label: "Aguardando Assinatura (Piloto Logístico)" },
        { code: "UC_QT3CO8", label: "Termo Aceito (Piloto Logístico)" },
        { code: "NEW", label: "Análise de Documentos" },
        { code: "UC_H2J1XM", label: "Aguardando Assinatura de Contrato" },
        { code: "WON", label: "Contrato Assinado" },
        { code: "LOSE", label: "Contrato Cancelado" },
      ],
    },
    camposData: [
      { code: "DATE_CREATE", label: "Data de criação" },
      { code: "DATE_MODIFY", label: "Data de modificação" },
      { code: "MOVED_TIME", label: "Data da última mudança de estágio" },
      { code: "CLOSEDATE", label: "Data de fechamento (campo de sistema)" },
      { code: "BEGINDATE", label: "Data de início" },
      { code: "UF_CRM_1770928318695", label: "Data do contrato assinado (campo oficial)" },
    ],
    campos: [
      { code: "ID", label: "ID", padrao: true },
      { code: "TITLE", label: "Título", padrao: true },
      { code: "STAGE_ID", label: "Estágio", padrao: true },
      { code: "CATEGORY_ID", label: "Categoria", padrao: true },
      { code: "OPPORTUNITY", label: "Valor (R$)", padrao: true },
      { code: "CURRENCY_ID", label: "Moeda" },
      { code: "DATE_CREATE", label: "Data de criação" },
      { code: "DATE_MODIFY", label: "Data de modificação" },
      { code: "MOVED_TIME", label: "Data última mudança de estágio (usada para calcular dias parado)", padrao: true },
      { code: "CLOSEDATE", label: "Data de fechamento (sistema)" },
      { code: "BEGINDATE", label: "Data de início" },
      { code: "UF_CRM_1770928318695", label: "Data do contrato assinado", padrao: true },
      { code: "ASSIGNED_BY_ID", label: "Responsável atual (ID)", padrao: true },
      { code: "CREATED_BY_ID", label: "Criado por (ID)", padrao: true },
      { code: "MODIFY_BY_ID", label: "Última modificação por (ID)", padrao: true },
      { code: "MOVED_BY_ID", label: "Última mudança de estágio por (ID)", padrao: true },
      { code: "COMPANY_ID", label: "ID Empresa", padrao: true },
      { code: "CONTACT_ID", label: "ID Contato" },
      { code: "SOURCE_ID", label: "Origem" },
      { code: "CLOSED", label: "Fechado (S/N)" },
      { code: "LEAD_ID", label: "ID Lead de origem" },
    ],
  },
  leads: {
    label: "Leads",
    method: "crm.lead.list",
    fieldsMethod: "crm.lead.fields",
    hasCategoria: false,
    estagios: [
      { code: "", label: "Todos os estágios" },
      { code: "NEW", label: "Lead Recebido" },
      { code: "UC_IX9SZ8", label: "Cadência Iniciada" },
      { code: "UC_0NU8BD", label: "Qualificação (SDR)" },
      { code: "UC_B5Q2RS", label: "Reunião Agendada" },
      { code: "CONVERTED", label: "Convertido em Oportunidade" },
      { code: "JUNK", label: "Lead Desqualificado" },
    ],
    campoEstagio: "STATUS_ID",
    camposData: [
      { code: "DATE_CREATE", label: "Data de criação" },
      { code: "DATE_MODIFY", label: "Data de modificação" },
    ],
    campos: [
      { code: "ID", label: "ID", padrao: true },
      { code: "TITLE", label: "Título", padrao: true },
      { code: "STATUS_ID", label: "Estágio", padrao: true },
      { code: "SOURCE_ID", label: "Origem", padrao: true },
      { code: "OPPORTUNITY", label: "Valor (R$)" },
      { code: "DATE_CREATE", label: "Data de criação", padrao: true },
      { code: "DATE_MODIFY", label: "Data de modificação" },
      { code: "ASSIGNED_BY_ID", label: "Responsável (ID)", padrao: true },
      { code: "COMPANY_ID", label: "ID Empresa" },
      { code: "COMPANY_TITLE", label: "Nome Empresa" },
      { code: "CONTACT_ID", label: "ID Contato" },
      { code: "NAME", label: "Nome (contato)" },
      { code: "LAST_NAME", label: "Sobrenome (contato)" },
      { code: "PHONE", label: "Telefone" },
      { code: "EMAIL", label: "E-mail" },
    ],
  },
  empresas: {
    label: "Empresas",
    method: "crm.company.list",
    fieldsMethod: "crm.company.fields",
    hasCategoria: false,
    camposData: [{ code: "DATE_CREATE", label: "Data de criação" }],
    campos: [
      { code: "ID", label: "ID", padrao: true },
      { code: "TITLE", label: "Nome", padrao: true },
      { code: "COMPANY_TYPE", label: "Tipo" },
      { code: "INDUSTRY", label: "Setor" },
      { code: "DATE_CREATE", label: "Data de criação", padrao: true },
      { code: "ASSIGNED_BY_ID", label: "Responsável (ID)" },
    ],
  },
  contatos: {
    label: "Contatos",
    method: "crm.contact.list",
    fieldsMethod: "crm.contact.fields",
    hasCategoria: false,
    camposData: [{ code: "DATE_CREATE", label: "Data de criação" }],
    campos: [
      { code: "ID", label: "ID", padrao: true },
      { code: "NAME", label: "Nome", padrao: true },
      { code: "LAST_NAME", label: "Sobrenome", padrao: true },
      { code: "COMPANY_ID", label: "ID Empresa" },
      { code: "DATE_CREATE", label: "Data de criação", padrao: true },
      { code: "ASSIGNED_BY_ID", label: "Responsável (ID)" },
      { code: "PHONE", label: "Telefone" },
      { code: "EMAIL", label: "E-mail" },
    ],
  },
  atividades: {
    label: "Atividades (ligações, reuniões, tarefas)",
    method: "crm.activity.list",
    fieldsMethod: "crm.activity.fields",
    hasCategoria: false,
    // COMPLETED é um campo S/N do Bitrix (não uma lista de estágios), mas reaproveita o
    // mesmo mecanismo de "estágio" da interface (rótulo genérico "Estágio / Status").
    campoEstagio: "COMPLETED",
    estagios: [
      { code: "", label: "Todas" },
      { code: "Y", label: "Concluídas" },
      { code: "N", label: "Pendentes / em aberto" },
    ],
    camposData: [
      { code: "CREATED", label: "Data de criação" },
      { code: "LAST_UPDATED", label: "Última atualização" },
      { code: "START_TIME", label: "Início previsto/realizado" },
      { code: "DEADLINE", label: "Prazo" },
    ],
    campos: [
      { code: "ID", label: "ID", padrao: true },
      { code: "SUBJECT", label: "Assunto", padrao: true },
      { code: "TYPE_ID", label: "Tipo (1=Reunião, 2=Ligação, 3=Tarefa, 4=E-mail, 5=Ação, 6=Ação do usuário)", padrao: true },
      { code: "PROVIDER_TYPE_ID", label: "Canal (ex: CALL, EMAIL, WHATSAPP_MESSAGE)" },
      { code: "DIRECTION", label: "Direção da ligação (1=Entrada, 2=Saída)" },
      { code: "COMPLETED", label: "Concluída (S/N)", padrao: true },
      { code: "STATUS", label: "Status" },
      { code: "RESPONSIBLE_ID", label: "Responsável (ID)", padrao: true },
      { code: "OWNER_ID", label: "ID da entidade vinculada (negócio/lead/contato)", padrao: true },
      { code: "OWNER_TYPE_ID", label: "Tipo da entidade vinculada (1=Lead, 2=Negócio, 3=Contato, 4=Empresa)", padrao: true },
      { code: "PRIORITY", label: "Prioridade" },
      { code: "CREATED", label: "Data de criação", padrao: true },
      { code: "LAST_UPDATED", label: "Última atualização" },
      { code: "START_TIME", label: "Início" },
      { code: "END_TIME", label: "Fim" },
      { code: "DEADLINE", label: "Prazo" },
      { code: "DESCRIPTION", label: "Descrição" },
    ],
  },
  usuarios: {
    label: "Usuários",
    method: "user.get",
    fieldsMethod: null, // Bitrix não expõe um "user.fields" público — lista fixa abaixo
    hasCategoria: false,
    semFiltroData: true,
    campos: [
      { code: "ID", label: "ID", padrao: true },
      { code: "XML_ID", label: "XML ID" },
      { code: "NAME", label: "Nome", padrao: true },
      { code: "LAST_NAME", label: "Sobrenome", padrao: true },
      { code: "SECOND_NAME", label: "Nome do meio" },
      { code: "ACTIVE", label: "Ativo", padrao: true },
      { code: "WORK_POSITION", label: "Cargo", padrao: true },
      { code: "EMAIL", label: "E-mail" },
      { code: "LOGIN", label: "Login" },
      { code: "PERSONAL_PHONE", label: "Telefone (fixo)" },
      { code: "PERSONAL_MOBILE", label: "Celular" },
      { code: "PERSONAL_WWW", label: "Site pessoal" },
      { code: "PERSONAL_BIRTHDAY", label: "Data de nascimento" },
      { code: "PERSONAL_PHOTO", label: "Foto" },
      { code: "LAST_LOGIN", label: "Último login" },
      { code: "DATE_REGISTER", label: "Data de cadastro" },
      { code: "TIME_ZONE", label: "Fuso horário" },
      { code: "UF_DEPARTMENT", label: "Departamento (ID)" },
      { code: "IS_ONLINE", label: "Está online" },
    ],
  },
  jornada: {
    label: "🟣 Jornada do Cliente — todos os funis, agrupados por empresa",
    especial: true,
    jornada: true,
    hasCategoria: false,
  },
  forecast_semanal: {
    label: "📈 Forecast semanal — Comercial",
    especial: true,
    forecastSemanal: true,
    hasCategoria: false,
  },
  diario_sdr: {
    label: "📅 Relatório diário SDR — atividades, leads atendidos e potenciais",
    especial: true,
    diarioSdr: true,
    hasCategoria: false,
  },
  analise_sdr: {
    label: "📊 Análise SDR — semanal e mensal (João Reis)",
    especial: true,
    analiseSdr: true,
    hasCategoria: false,
  },
  tudo: {
    label: "🔵 Extração completa — tudo do Bitrix (negócios, leads, empresas, contatos, atividades, usuários)",
    especial: true,
    hasCategoria: false,
  },
};

// ---------------------------------------------------------------------------
// v6 — Catálogo de relatórios
// ---------------------------------------------------------------------------
const RELATORIOS = {
  jornada: { grupo:"Jornada & Cliente", label:"🟣 Jornada do Cliente — completa", descricao:"Cliente único por pipeline, histórico de estágios, mudança de funil, reentrada, duplicidade, aging e responsáveis.", handler:"jornada", periodo:"todas" },
  handoffs: { grupo:"Jornada & Cliente", label:"🤝 Handoffs e trocas de responsável", descricao:"Mudanças observáveis de responsável entre Leads, negócios e passagens entre pipelines.", handler:"catalogo", periodo:"todas" },
  reentradas: { grupo:"Jornada & Cliente", label:"🔁 Reentradas, retrabalho e mudanças de pipeline", descricao:"Reentradas históricas em estágios e mudanças reais de pipeline.", handler:"catalogo", periodo:"todas" },
  duplicidades: { grupo:"Jornada & Cliente", label:"🧬 Duplicidades e identidade do cliente", descricao:"Clientes repetidos no pipeline e possíveis empresas duplicadas por nome, e-mail ou telefone.", handler:"catalogo", periodo:"todas" },
  implantacao_posvenda: { grupo:"Jornada & Cliente", label:"🚀 Implantação, Onboarding e Pós-Venda", descricao:"Backlog e aging dos pipelines posteriores ao Comercial.", handler:"catalogo", periodo:"todas" },

  forecast_semanal: { grupo:"Comercial & Receita", label:"📈 Forecast semanal — Comercial", descricao:"Fechado, Commit, Best Case, pipeline ponderado, previsão por vendedor e higiene de CLOSEDATE.", handler:"forecast_semanal", periodo:"semana_atual" },
  forecast_mensal: { grupo:"Comercial & Receita", label:"🗓️ Forecast mensal — Comercial", descricao:"Forecast do mês, buckets de confiança e gap para a meta opcional.", handler:"catalogo", periodo:"mensal", meta:true },
  pipeline_coverage: { grupo:"Comercial & Receita", label:"🎯 Pipeline & Coverage — 30/60/90 dias", descricao:"Pipeline aberto, ponderado, horizontes de fechamento e cobertura da meta.", handler:"catalogo", periodo:"mensal", meta:true },
  conversao_comercial: { grupo:"Comercial & Receita", label:"🧭 Conversão Comercial — funil e Win Rate", descricao:"Coorte de oportunidades, ganhos/perdas e conversão histórica por estágio.", handler:"catalogo", periodo:"mensal" },
  aging_sla: { grupo:"Comercial & Receita", label:"⏱️ Aging & SLA Comercial", descricao:"Backlog por tempo no estágio atual e SLA configurável.", handler:"catalogo", periodo:"todas", slaAging:true },
  performance_vendedores: { grupo:"Comercial & Receita", label:"🏆 Performance por vendedor", descricao:"Pipeline, ganhos, perdas, receita, ticket, Win Rate e ciclo por responsável atual.", handler:"catalogo", periodo:"mensal" },
  ganhos_perdas_ciclo: { grupo:"Comercial & Receita", label:"🏁 Ganhos, perdas e ciclo de vendas", descricao:"Fechamentos, receita ganha, valor perdido, ticket e ciclo de venda.", handler:"catalogo", periodo:"mensal" },
  origens_canais: { grupo:"Comercial & Receita", label:"🛰️ Origens, canais e conversão", descricao:"Leads, oportunidades, ganhos e receita por SOURCE_ID ou UTM_SOURCE.", handler:"catalogo", periodo:"mensal" },
  produtos_receita: { grupo:"Comercial & Receita", label:"📦 Produtos e receita", descricao:"Produtos presentes em negócios ganhos, unidades, negócios e valor das linhas.", handler:"catalogo", periodo:"mensal" },
  clientes_receita: { grupo:"Comercial & Receita", label:"🏢 Clientes, receita e concentração", descricao:"Receita por cliente, recorrência, ticket médio e concentração Top 10.", handler:"catalogo", periodo:"mensal" },

  diario_sdr: { grupo:"SDR & Leads", label:"📅 Diário SDR — atividades, Leads atendidos e potenciais", descricao:"Atividades concluídas, Leads atendidos e potenciais ainda sem atividade.", handler:"diario_sdr", periodo:"diario" },
  analise_sdr: { grupo:"SDR & Leads", label:"📊 João Reis — análise semanal e mensal", descricao:"Produção diária do João, mix de atividades, jornada, backlog e conversões.", handler:"analise_sdr", periodo:"mensal" },
  funil_leads: { grupo:"SDR & Leads", label:"🪜 Funil de Leads & conversão SDR", descricao:"Leads criados, status, desqualificação, oportunidades e ganhos.", handler:"catalogo", periodo:"mensal" },
  produtividade_atividades: { grupo:"SDR & Leads", label:"⚡ Produtividade de atividades por responsável", descricao:"Atividades concluídas por usuário/canal e entidades únicas tocadas.", handler:"catalogo", periodo:"mensal" },
  sla_primeiro_contato: { grupo:"SDR & Leads", label:"☎️ SLA de primeiro contato", descricao:"Tempo da criação do Lead até a primeira atividade concluída vinculada.", handler:"catalogo", periodo:"mensal", slaPrimeiroContato:true },
  auditoria_sdr: { grupo:"SDR & Leads", label:"🧪 Auditoria SDR — validar dados e plano", descricao:"Leads sem atividade, atividades sem resultado registrado e completude de campos-chave do trabalho de SDR.", handler:"catalogo", periodo:"mensal" },
  decisao_final_sdr: { grupo:"SDR & Leads", label:"🧭 Decisão Final SDR — saneamento seguro", descricao:"Leads estagnados classificados em ação recomendada (recontatar, desqualificar, escalar ou nutrir), sem escrever no Bitrix.", handler:"catalogo", periodo:"todas", diasEstagnacao:true },

  atividades_pendentes: { grupo:"Operação & Qualidade", label:"📌 Atividades pendentes e atrasadas", descricao:"Backlog de atividades abertas, atrasadas, sem prazo e por responsável.", handler:"catalogo", periodo:"todas" },
  qualidade_crm: { grupo:"Operação & Qualidade", label:"🧹 Qualidade do CRM & campos faltantes", descricao:"Completude de Negócios e Leads nos campos operacionais já mapeados.", handler:"catalogo", periodo:"todas" }
};

// v11 — Metas mensais do forecast Comercial (R$), usadas como valor padrão da
// "Meta comercial mensal" e da meta mensal do Forecast semanal. O campo continua
// editável — isto é só o ponto de partida por mês/ano corrente.
//
// ⚠️ Estes valores devem ser mantidos idênticos aos de
// METAS_FORECAST_MENSAL_PADRAO em scripts/forecast-semanal.mjs — não há
// compartilhamento de módulo entre o navegador (este arquivo, carregado como
// <script> clássico) e o script Node (roda fora do navegador via GitHub
// Actions). Ao mudar uma meta aqui, replique manualmente no outro arquivo.
const METAS_FORECAST_MENSAL_PADRAO = {
  1: 13650.00, 2: 27300.00, 3: 38500.00, 4: 27300.00, 5: 27300.00, 6: 27300.00,
  7: 27300.00, 8: 34845.70, 9: 40470.70, 10: 40520.70, 11: 34845.70, 12: 21195.70
};
function metaMensalPadrao(dataISO) {
  const m = String(dataISO || "").match(/^\d{4}-(\d{2})/);
  return m ? (METAS_FORECAST_MENSAL_PADRAO[Number(m[1])] || 0) : 0;
}

// Campos de usuário: não existe um método "user.fields" público no Bitrix (diferente de
// crm.*.fields), então para a Extração completa usamos uma lista ampliada e fixa.
const CAMPOS_USUARIO_COMPLETO = [
  "ID", "XML_ID", "ACTIVE", "NAME", "LAST_NAME", "SECOND_NAME", "EMAIL", "LOGIN",
  "WORK_POSITION", "PERSONAL_PHONE", "PERSONAL_MOBILE", "PERSONAL_WWW", "PERSONAL_BIRTHDAY",
  "PERSONAL_PHOTO", "LAST_LOGIN", "DATE_REGISTER", "TIME_ZONE", "UF_DEPARTMENT", "IS_ONLINE",
];

// As seis entidades buscadas pelo modo "Extração completa". Para as que têm um método
// "*.fields" no Bitrix, os campos são descobertos dinamicamente (inclusive UF_CRM_* customizados)
// em vez de usar uma lista fixa — por isso é mais robusto a mudanças no CRM do que os modos manuais acima.
const SUBENTIDADES_TUDO = [
  { chave: "negocios", label: "Negócios (todos os funis/pipelines)", method: "crm.deal.list", fieldsMethod: "crm.deal.fields", campoData: "DATE_CREATE" },
  { chave: "leads", label: "Leads", method: "crm.lead.list", fieldsMethod: "crm.lead.fields", campoData: "DATE_CREATE" },
  { chave: "empresas", label: "Empresas", method: "crm.company.list", fieldsMethod: "crm.company.fields", campoData: "DATE_CREATE" },
  { chave: "contatos", label: "Contatos", method: "crm.contact.list", fieldsMethod: "crm.contact.fields", campoData: "DATE_CREATE" },
  { chave: "atividades", label: "Atividades (ligações, reuniões e tarefas de CRM)", method: "crm.activity.list", fieldsMethod: "crm.activity.fields", campoData: "CREATED" },
  { chave: "usuarios", label: "Usuários", method: "user.get", fieldsMethod: null, camposFixos: CAMPOS_USUARIO_COMPLETO, semFiltroData: true },
];
const LIMITE_POR_ENTIDADE_TUDO = Number.POSITIVE_INFINITY; // v3: não truncar extrações completas silenciosamente

let dadosExtraidos = [];
let camposExtraidos = [];
let resultadoCompleto = {};
let extracaoCancelada = false;
let dadosProdutos = [];
let camposProdutosAtual = [];

// v3 — dados derivados de qualidade/jornada. O bruto é sempre preservado em dadosExtraidos.
let auditoriaJornada = {};
let dadosJornadaNormalizada = [];
let dadosDuplicidadesJornada = [];
let dadosHistoricoEstagios = [];
let dadosHandoffsCliente = [];
let mapaUsuariosJornada = {};
let metadadosFunisJornada = { categorias: {}, estagios: {}, dinamico: false };

// v5 — relatórios gerenciais especiais.
let resultadoForecastSemanal = {};
let resultadoDiarioSDR = {};
let resultadoAnaliseSDR = {};
let resultadoRelatorioCatalogo = {};

// Cache por entidade da lista completa de campos já carregada direto do Bitrix
// (via "Carregar todos os campos do Bitrix", passo 4) — evita rebuscar toda vez
// que o usuário troca de entidade e volta.
let camposCompletosCache = {};

// Campos de identificação (vêm do negócio já extraído / da empresa vinculada,
// não da API de linhas de produto).
const CAMPOS_CONTEXTO_PRODUTO = [
  { code: "cliente", label: "Cliente (nome da empresa)", padrao: true },
  { code: "negocio_id", label: "ID do negócio", padrao: true },
  { code: "negocio_titulo", label: "Título do negócio", padrao: true },
  { code: "valor_total_negocio", label: "Valor total do negócio (OPPORTUNITY)", padrao: true },
];

// Campos conhecidos de crm.deal.productrows.get. O Bitrix não expõe um método
// "*.fields" para esta entidade, por isso a lista é fixa (como em Usuários).
const CAMPOS_PRODUTO_BITRIX = [
  { code: "PRODUCT_NAME", label: "Nome do produto", padrao: true },
  { code: "QUANTITY", label: "Quantidade", padrao: true },
  { code: "MEASURE_NAME", label: "Unidade de medida" },
  { code: "PRICE", label: "Preço unitário", padrao: true },
  { code: "PRICE_ACCOUNT", label: "Valor da linha (contabilizado)", padrao: true },
  { code: "PRICE_BRUTTO", label: "Preço unitário bruto" },
  { code: "PRICE_NETTO", label: "Preço unitário líquido" },
  { code: "PRICE_EXCLUSIVE", label: "Preço unitário (sem imposto)" },
  { code: "DISCOUNT_RATE", label: "Desconto (%)" },
  { code: "DISCOUNT_SUM", label: "Desconto (valor)" },
  { code: "DISCOUNT_TYPE_ID", label: "Tipo de desconto" },
  { code: "TAX_RATE", label: "Alíquota de imposto (%)" },
  { code: "TAX_INCLUDED", label: "Imposto incluso no preço (S/N)" },
  { code: "PRODUCT_ID", label: "ID do produto" },
  { code: "ID", label: "ID da linha" },
  { code: "TYPE", label: "Tipo de linha" },
  { code: "SORT", label: "Ordem" },
  { code: "CUSTOMIZED", label: "Editado manualmente (S/N)" },
];

// ---------------------------------------------------------------------------
// Montagem da interface
// ---------------------------------------------------------------------------


function baixarArquivo(conteudo, nomeArquivo, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function baixarCSV() {
  if (dadosExtraidos.length === 0) return;
  const linhas = [camposExtraidos.join(";")];
  dadosExtraidos.forEach((registro) => {
    const linha = camposExtraidos.map((c) => {
      let v = registro[c];
      if (v === null || v === undefined) v = "";
      v = String(v).replace(/"/g, '""');
      if (v.includes(";") || v.includes("\n") || v.includes('"')) v = `"${v}"`;
      return v;
    });
    linhas.push(linha.join(";"));
  });
  const chaveEnt = document.getElementById("entidade").value;
  baixarArquivo("﻿" + linhas.join("\r\n"), `bitrix_${chaveEnt}_${dataHoje()}.csv`, "text/csv;charset=utf-8;");
}

function baixarJSON() {
  if (dadosExtraidos.length === 0) return;
  const chaveEnt = document.getElementById("entidade").value;
  baixarArquivo(JSON.stringify(dadosExtraidos, null, 2), `bitrix_${chaveEnt}_${dataHoje()}.json`, "application/json;charset=utf-8;");
}

function dataHoje() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Código Python equivalente (fallback caso CORS bloqueie, ou para automatizar)
// ---------------------------------------------------------------------------

