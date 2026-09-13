// Catálogo estático das capabilities canônicas do Capability & Permission Engine (PROMPT 3 —
// Capability & Permission Engine). Mesmo papel que `job-role-catalog.ts` cumpre para `JobRole`:
// fonte única de `code` válido, consumida pelo seed (`scripts/seed-capability-engine.ts`), pelo
// serviço (`capability.service.ts`) e pelo motor de autorização (`capabilityAuthorization.service.ts`).
//
// Nomenclatura obrigatória `resource.action` (regra do prompt da onda). Esta é a lista EXATA de
// exemplos dada pelo prompt — nenhuma capability nova foi inventada além dela: cobertura real
// (quais agentes/cargos recebem qual capability) fica em
// `src/features/job-roles/catalog/{agentCapabilities,roleCapabilities}.normalized.json`, gerado
// por `scripts/capability-import/build-capability-catalog.ts`.
//
// `riskLevel` segue a classificação do prompt da onda:
//   LOW: leitura/análise.
//   MEDIUM: geração/execução sem efeito crítico.
//   HIGH: writes sensíveis, pricing, deal changes, billing.
//   CRITICAL: assinatura, config Bitrix, ação administrativa crítica.
// `actionType` decide o que `RoleCapabilityGrant.accessLevel = READ` pode autorizar (nunca
// WRITE/EXECUTE/ADMIN — ver `capabilityAuthorization.service.ts`).
export type CapabilityActionType = 'READ' | 'WRITE' | 'EXECUTE' | 'ADMIN';
export type CapabilityRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface CapabilityCatalogEntry {
  code: string;
  name: string;
  description: string;
  domain: string;
  actionType: CapabilityActionType;
  riskLevel: CapabilityRiskLevel;
}

export const CAPABILITY_CATALOG: CapabilityCatalogEntry[] = [
  // --- CRM: Lead ---
  {
    code: 'lead.read',
    name: 'Ler lead',
    description: 'Consultar os dados de um lead específico.',
    domain: 'CRM',
    actionType: 'READ',
    riskLevel: 'LOW',
  },
  {
    code: 'lead.search',
    name: 'Buscar leads',
    description: 'Listar/filtrar leads da organização.',
    domain: 'CRM',
    actionType: 'READ',
    riskLevel: 'LOW',
  },
  {
    code: 'lead.enrich',
    name: 'Enriquecer lead',
    description: 'Disparar enriquecimento de dados de um lead a partir de fontes configuradas.',
    domain: 'CRM',
    actionType: 'EXECUTE',
    riskLevel: 'MEDIUM',
  },
  {
    code: 'lead.qualify',
    name: 'Qualificar lead',
    description: 'Executar/propor qualificação de um lead com evidência (BANT/matriz).',
    domain: 'CRM',
    actionType: 'EXECUTE',
    riskLevel: 'MEDIUM',
  },
  {
    code: 'lead.update',
    name: 'Atualizar lead',
    description: 'Gravar alteração de campo de um lead.',
    domain: 'CRM',
    actionType: 'WRITE',
    riskLevel: 'MEDIUM',
  },
  // --- CRM: Company ---
  {
    code: 'company.read',
    name: 'Ler empresa',
    description: 'Consultar os dados de uma empresa específica.',
    domain: 'CRM',
    actionType: 'READ',
    riskLevel: 'LOW',
  },
  {
    code: 'company.search',
    name: 'Buscar empresas',
    description: 'Listar/filtrar empresas da organização.',
    domain: 'CRM',
    actionType: 'READ',
    riskLevel: 'LOW',
  },
  // --- Reuniões ---
  {
    code: 'meeting.read',
    name: 'Ler reunião',
    description: 'Consultar dados/registro de uma reunião.',
    domain: 'Reuniões',
    actionType: 'READ',
    riskLevel: 'LOW',
  },
  {
    code: 'meeting.analyze',
    name: 'Analisar reunião',
    description: 'Sintetizar transcrição/gravação de reunião em pontos, riscos e próximos passos.',
    domain: 'Reuniões',
    actionType: 'EXECUTE',
    riskLevel: 'LOW',
  },
  {
    code: 'meeting.schedule',
    name: 'Agendar reunião',
    description: 'Criar um novo evento de agenda/reunião (com Google Meet quando aplicável).',
    domain: 'Reuniões',
    actionType: 'WRITE',
    riskLevel: 'MEDIUM',
  },
  // --- CRM: Deal (oportunidade — Lead em estágio de pipeline neste produto) ---
  {
    code: 'deal.read',
    name: 'Ler negociação',
    description: 'Consultar dados de uma oportunidade/negociação.',
    domain: 'CRM',
    actionType: 'READ',
    riskLevel: 'LOW',
  },
  {
    code: 'deal.analyze',
    name: 'Analisar negociação',
    description: 'Analisar estratégia, objeções e probabilidade real de uma negociação.',
    domain: 'CRM',
    actionType: 'EXECUTE',
    riskLevel: 'LOW',
  },
  {
    code: 'deal.update',
    name: 'Atualizar negociação',
    description: 'Gravar alteração de campo de uma negociação (ex.: valor, produto).',
    domain: 'CRM',
    actionType: 'WRITE',
    riskLevel: 'HIGH',
  },
  {
    code: 'deal.move_stage',
    name: 'Mover estágio da negociação',
    description: 'Mover uma negociação para outro estágio do pipeline (inclui ganho/perda).',
    domain: 'CRM',
    actionType: 'WRITE',
    riskLevel: 'HIGH',
  },
  // --- Pipeline / Forecast ---
  {
    code: 'pipeline.read',
    name: 'Ler pipeline',
    description: 'Consultar números agregados de pipeline (nunca forecast — PIPELINE != FORECAST).',
    domain: 'Pipeline/Forecast',
    actionType: 'READ',
    riskLevel: 'LOW',
  },
  {
    code: 'pipeline.analyze',
    name: 'Analisar pipeline',
    description: 'Analisar cobertura, ritmo de geração e composição do pipeline.',
    domain: 'Pipeline/Forecast',
    actionType: 'EXECUTE',
    riskLevel: 'LOW',
  },
  {
    code: 'forecast.read',
    name: 'Ler forecast',
    description:
      'Consultar números de forecast já calculados pelo motor real (commit/best case/gap).',
    domain: 'Pipeline/Forecast',
    actionType: 'READ',
    riskLevel: 'LOW',
  },
  {
    code: 'forecast.explain',
    name: 'Explicar forecast',
    description: 'Explicar a composição/racional do forecast já calculado.',
    domain: 'Pipeline/Forecast',
    actionType: 'EXECUTE',
    riskLevel: 'LOW',
  },
  // --- Conhecimento ---
  {
    code: 'knowledge.search',
    name: 'Buscar na base de conhecimento',
    description:
      'Busca híbrida (semântica + palavra-chave) na base de conhecimento da organização.',
    domain: 'Conhecimento',
    actionType: 'READ',
    riskLevel: 'LOW',
  },
  // --- Contratos / Assinatura ---
  {
    code: 'contract.read',
    name: 'Ler contrato',
    description: 'Consultar prontidão e status real de assinatura de um contrato.',
    domain: 'Contratos',
    actionType: 'READ',
    riskLevel: 'LOW',
  },
  {
    code: 'contract.generate',
    name: 'Gerar contrato',
    description: 'Gerar um documento de contrato a partir de um template/dados do negócio.',
    domain: 'Contratos',
    actionType: 'EXECUTE',
    riskLevel: 'MEDIUM',
  },
  {
    code: 'signature.request',
    name: 'Solicitar assinatura',
    description: 'Disparar um pedido de assinatura eletrônica externo para um documento.',
    domain: 'Contratos',
    actionType: 'EXECUTE',
    riskLevel: 'CRITICAL',
  },
  // --- Financeiro ---
  {
    code: 'billing.read',
    name: 'Ler faturamento',
    description: 'Consultar dados de faturamento (vendido x faturado, MRR/ARR).',
    domain: 'Financeiro',
    actionType: 'READ',
    riskLevel: 'MEDIUM',
  },
  {
    code: 'billing.reconcile',
    name: 'Reconciliar faturamento',
    description: 'Reconciliar vendido x faturado contra a fonte real de cobrança.',
    domain: 'Financeiro',
    actionType: 'EXECUTE',
    riskLevel: 'HIGH',
  },
  // --- Bitrix ---
  {
    code: 'bitrix.read',
    name: 'Ler saúde do Bitrix',
    description: 'Consultar saúde de sincronização, qualidade e duplicidade do Bitrix24.',
    domain: 'Bitrix',
    actionType: 'READ',
    riskLevel: 'LOW',
  },
  {
    code: 'bitrix.write',
    name: 'Gravar no Bitrix',
    description: 'Gravar campos de volta no Bitrix24 (writeback).',
    domain: 'Bitrix',
    actionType: 'WRITE',
    riskLevel: 'HIGH',
  },
  {
    code: 'bitrix.configure',
    name: 'Configurar integração Bitrix',
    description: 'Conectar/desconectar/configurar webhook e mapeamento de campos do Bitrix24.',
    domain: 'Bitrix',
    actionType: 'ADMIN',
    riskLevel: 'CRITICAL',
  },
  // --- Governança de Agentes ---
  {
    code: 'agent.discover',
    name: 'Descobrir agente',
    description: 'Ver que um agente existe no catálogo (sem detalhe/execução).',
    domain: 'Governança de Agentes',
    actionType: 'READ',
    riskLevel: 'LOW',
  },
  {
    code: 'agent.execute',
    name: 'Executar agente',
    description:
      'Executar um agente via AgentRuntime. Para agentes PROMPT_READY (AgentVersion ativa com systemPrompt real — 27 dos 379 agentes do catálogo Birth Hub nesta rodada), chama o gateway de IA com esse system prompt; agentes sem prompt real configurado ainda falham fechado, nunca fabricam uma resposta.',
    domain: 'Governança de Agentes',
    actionType: 'EXECUTE',
    riskLevel: 'MEDIUM',
  },
  {
    code: 'agent.request_cross_role',
    name: 'Solicitar acesso entre cargos',
    description:
      'Solicitar autorização temporária para usar um agente/capability fora do próprio cargo. Fluxo de aprovação (PROMPT 7) já implementado em accessRequest.service.ts — ver tool-bindings.ts.',
    domain: 'Governança de Agentes',
    actionType: 'EXECUTE',
    riskLevel: 'MEDIUM',
  },
];

export type CapabilityCode = (typeof CAPABILITY_CATALOG)[number]['code'];

export const CAPABILITY_CODES: string[] = CAPABILITY_CATALOG.map((c) => c.code);

export function isCapabilityCode(value: string): boolean {
  return CAPABILITY_CODES.includes(value);
}

export function getCapabilityCatalogEntry(code: string): CapabilityCatalogEntry | undefined {
  return CAPABILITY_CATALOG.find((c) => c.code === code);
}
