// Opções de ICP (Perfil de Cliente Ideal) para os dropdowns do Prospector.
// Extraídas do "Playbook de Pré-Vendas Atlas" e do "Playbook Comercial - AtlasGR"
// fornecidos pelo time comercial.

export const SEGMENTO_OPTIONS = [
    'Transportadora / Frotista',
    'Operador Logístico (3PL/4PL)',
    'Indústria (Embarcador)',
    'Varejo / E-commerce (Embarcador)',
    'Agro / Trading (Embarcador)',
    'Distribuidor / Atacadista',
    'Gerenciadora de Risco (GR)',
    'Corretora de Seguros',
    'Seguradora',
];

export const TOTALTRAC_SEGMENTO_OPTIONS = [
    'Transportadora',
    'Empresas de Logística',
    'Frotas Corporativas',
    'Transporte Refrigerado / Frigorificado',
    'Locação de Máquinas Pesadas',
    'Embarcador com Frota Própria'
];

// RJ e Grande SP aparecem no playbook como regiões de maior índice de roubo — prioridade de risco.
export const LOCALIZACAO_OPTIONS = [
    'Rio de Janeiro e Região',
    'São Paulo e Grande SP',
    'Sul (PR, SC, RS)',
    'Sudeste (MG, ES)',
    'Nordeste',
    'Centro-Oeste',
    'Norte',
    'Brasil (todas as regiões)',
];

export const QUANTIDADE_OPTIONS = [10, 25, 50, 100, 200, 500];

// Estados do Brasil — usados para refinar a busca (Google Places + Apollo) além da região ampla do playbook.
export const ESTADO_OPTIONS = [
    'Acre', 'Alagoas', 'Amapá', 'Amazonas', 'Bahia', 'Ceará', 'Distrito Federal',
    'Espírito Santo', 'Goiás', 'Maranhão', 'Mato Grosso', 'Mato Grosso do Sul',
    'Minas Gerais', 'Pará', 'Paraíba', 'Paraná', 'Pernambuco', 'Piauí',
    'Rio de Janeiro', 'Rio Grande do Norte', 'Rio Grande do Sul', 'Rondônia',
    'Roraima', 'Santa Catarina', 'São Paulo', 'Sergipe', 'Tocantins',
];

// Faixas de funcionários no formato exigido pela Apollo Organization Search API
// (organization_num_employees_ranges: "min,max").
export const PORTE_OPTIONS = [
    { label: 'Qualquer porte', value: '' },
    { label: '1-10 funcionários', value: '1,10' },
    { label: '11-50 funcionários', value: '11,50' },
    { label: '51-200 funcionários', value: '51,200' },
    { label: '201-500 funcionários', value: '201,500' },
    { label: '501-1000 funcionários', value: '501,1000' },
    { label: '1001+ funcionários', value: '1001,1000000' },
];

// Personas-alvo da Atlas — extraídas da tabela "Contatos ideais" do Playbook de Pré-Vendas Atlas,
// ordenadas por nível de decisão real observado em campo (Dono/CEO decide sozinho; TI/Compras são
// gatekeepers que raramente decidem, mas travam o processo). Usado como atalho na busca de
// decisores em vez de digitar cargo "no chute" — cada opção já vem com as variações de título em
// português mais comuns para esse papel e a senioridade Apollo correspondente.
export const ATLAS_PERSONA_OPTIONS = [
    { label: 'Dono / CEO', nivel: 'Decisor final', titles: 'CEO,Dono,Diretor Presidente,Diretor Geral', seniorities: ['c_suite'] },
    { label: 'Diretor de Operações / COO', nivel: 'Decisor final', titles: 'Diretor de Operações,COO,Diretor Operacional', seniorities: ['c_suite'] },
    { label: 'Diretor de Logística / Supply', nivel: 'Decisor final', titles: 'Diretor de Logística,Diretor de Supply Chain,Diretor de Cadeia de Suprimentos', seniorities: ['c_suite'] },
    { label: 'Head / Gerente de GR (Risco)', nivel: 'Influenciador forte', titles: 'Gerente de Risco,Head de Risco,Gerente de Gerenciamento de Risco,Gerente de Compliance', seniorities: ['director', 'manager'] },
    { label: 'Gerente de Operações / Transportes', nivel: 'Influenciador-chave', titles: 'Gerente de Operações,Gerente de Transportes,Gerente de Logística', seniorities: ['manager'] },
    { label: 'Coordenador de Monitoramento / Torre', nivel: 'Usuário influente', titles: 'Coordenador de Monitoramento,Coordenador de Torre de Controle,Coordenador de Rastreamento,Supervisor de Frota', seniorities: ['manager'] },
    { label: 'Segurança Patrimonial / Corporativa', nivel: 'Influenciador', titles: 'Gerente de Segurança Patrimonial,Segurança Corporativa,Gerente de Segurança', seniorities: ['manager'] },
    { label: 'Jurídico / Compliance', nivel: 'Influenciador', titles: 'Jurídico,Compliance,Gerente Jurídico', seniorities: ['manager'] },
    { label: 'TI / Integrações / Dados', nivel: 'Gatekeeper', titles: 'TI,Tecnologia da Informação,Gerente de TI,Integrações', seniorities: ['manager'] },
    { label: 'Compras / Suprimentos', nivel: 'Gatekeeper', titles: 'Compras,Suprimentos,Gerente de Compras', seniorities: ['manager'] },
    { label: 'Financeiro / Controller', nivel: 'Co-decisor', titles: 'Financeiro,Controller,CFO,Gerente Financeiro', seniorities: ['director', 'manager'] },
] as const;

export const TOTALTRAC_PERSONA_OPTIONS = [
    { label: 'Dono / CEO', nivel: 'Decisor final', titles: 'CEO,Dono,Diretor Presidente,Diretor Geral', seniorities: ['c_suite'] },
    { label: 'Diretor de Operações / Logística', nivel: 'Decisor final', titles: 'Diretor de Operações,COO,Diretor Operacional,Diretor de Logística', seniorities: ['c_suite', 'director'] },
    { label: 'Gerente de Frotas / Transportes', nivel: 'Influenciador-chave / Decisor', titles: 'Gerente de Frotas,Gerente de Transportes,Gestor de Frotas', seniorities: ['manager'] },
    { label: 'Gerente de Risco / Segurança', nivel: 'Influenciador forte', titles: 'Gerente de Risco,Gerente de Segurança,Segurança Patrimonial', seniorities: ['manager'] },
    { label: 'RH / DP (Para Jornada)', nivel: 'Usuário / Influenciador', titles: 'RH,Recursos Humanos,Departamento Pessoal,Gerente de RH', seniorities: ['manager'] },
    { label: 'Coordenador de Logística', nivel: 'Usuário influente', titles: 'Coordenador de Logística,Supervisor de Logística', seniorities: ['manager'] },
] as const;

// Os 3 PICs (Perfil de Cliente Ideal) do Playbook de Pré-Vendas Atlas — cada um com gatilho,
// decisor e discurso diferentes. Setado manualmente pelo SDR/AM após identificar o gatilho real
// numa conversa (nunca inferido automaticamente — não há sinal confiável disponível hoje para
// "processo judicial recente" ou "troca de liderança" sem uma fonte de dados dedicada).
export const PIC_OPTIONS = [
    { value: 'PIC1_Expansao', label: 'PIC 1 — Expansão Operacional', desc: 'Frota/rotas crescendo, mais terceiros, processo manual não acompanha.' },
    { value: 'PIC2_Risco', label: 'PIC 2 — Pressão de Risco', desc: 'Sinistro recente, exigência de seguradora, medo de não-cobertura.' },
    { value: 'PIC3_Transicao', label: 'PIC 3 — Transição de Liderança', desc: 'Novo diretor/gerente de risco, reestruturação, revisão de fornecedores.' },
] as const;

// Tecnologias como filtro de busca (Apollo `currently_using_any_of_technology_uids`).
// A Apollo só filtra por "UID" (slug), não pelo nome de exibição — e não existe endpoint público
// para listar todos os UIDs válidos. Esta lista foi validada uma a uma contra a API real (cada slug
// abaixo devolveu resultados > 0 numa busca de teste); um nome "chutado" errado é silenciosamente
// ignorado pela Apollo sem erro, então preferimos uma lista curada e confirmada a um campo livre.
export const TECNOLOGIA_OPTIONS = [
    { label: 'Salesforce', value: 'salesforce' },
    { label: 'SAP', value: 'sap' },
    { label: 'SAP Business One', value: 'sap_business_one' },
    { label: 'TOTVS Protheus', value: 'protheus' },
    { label: 'Oracle NetSuite', value: 'oracle_netsuite' },
    { label: 'Microsoft Dynamics 365', value: 'microsoft_dynamics_365' },
    { label: 'HubSpot', value: 'hubspot' },
    { label: 'Zoho CRM', value: 'zoho_crm' },
    { label: 'Pipedrive', value: 'pipedrive' },
    { label: 'AWS', value: 'aws' },
    { label: 'Google Workspace', value: 'google_analytics' },
    { label: 'Microsoft Teams', value: 'microsoft_teams' },
    { label: 'Slack', value: 'slack' },
    { label: 'Zendesk', value: 'zendesk' },
    { label: 'Shopify', value: 'shopify' },
    { label: 'WordPress', value: 'wordpress_org' },
    { label: 'Mailchimp', value: 'mailchimp' },
    { label: 'DocuSign', value: 'docusign' },
    { label: 'Stripe', value: 'stripe' },
    { label: 'Sankhya', value: 'sankhya' },
];
