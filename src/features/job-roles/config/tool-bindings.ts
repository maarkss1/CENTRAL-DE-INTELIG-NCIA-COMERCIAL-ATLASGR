// Registry de Tool Bindings do Capability & Permission Engine (PROMPT 3) — EM CÓDIGO, não tabela
// nova (decisão explícita do prompt da onda: "criar registry em código/config, não nova tabela,
// salvo necessidade real" — não há necessidade real aqui, o binding é estático por deploy).
//
// REGRA ABSOLUTA (PROMPT 3 + hardening PROMPT 3B): só `verification: 'VERIFIED'` pode ser
// considerado executável (`available: true`). Nome conceitual não é evidência — todo binding
// VERIFIED aponta para um `evidencePath` (arquivo real) + `symbol` (classe/função/método real
// exportado daquele arquivo), e `tests/integration/tool-bindings.evidence.test.ts` importa
// CADA arquivo listado aqui e confirma em runtime que o símbolo realmente existe e é uma função —
// se o símbolo for renomeado/removido do arquivo real, o teste quebra (não silenciosamente
// desatualiza este registry). Testes não são escaneados pelo `dependency-cruiser`
// (`npm run lint:architecture` roda só sobre `src server.ts worker.ts`), então importar um módulo
// de outra feature ali não viola `no-cross-feature-imports` — mas o CÓDIGO DE PRODUÇÃO deste
// registry (e do resto do Capability Engine) nunca importa esses módulos diretamente, só referencia
// o caminho como string, exatamente como `commercialAgentRegistry.ts` já faz com `bindings: string[]`.
//
// Três motivos distintos de indisponibilidade, nunca colapsados um no outro (PROMPT 3B, item 5):
//  - SOURCE_REQUIRED: a integração/fonte de dado real não existe (ex.: faturamento de venda real).
//  - FUTURE_TOOL: a capability/integração ainda será construída numa onda futura já mapeada
//    (ex.: `signature.request` — transporte gov.br ainda é stub, nunca promovido a integração real
//    aqui). `agent.execute`/`agent.request_cross_role` já saíram desta categoria — ver os
//    respectivos bindings abaixo (o comentário aqui ficou desatualizado numa rodada anterior;
//    corrigido para não voltar a "descobrir" o mesmo débito).
//  - TOOL_UNAVAILABLE: existe uma capability plausível, mas nenhum símbolo real e específico foi
//    encontrado/comprovado nesta auditoria — não é "fonte ausente" nem "onda futura conhecida", é
//    "não verificado ainda". Registrado como gap explícito, nunca fabricado.
export type ToolBindingVerification = 'VERIFIED' | 'UNVERIFIED';

export interface ToolBinding {
  capabilityCode: string;
  toolCode: string;
  /** Descrição curta do que o binding real faz. */
  binding: string;
  available: boolean;
  reason: 'AVAILABLE' | 'SOURCE_REQUIRED' | 'FUTURE_TOOL' | 'TOOL_UNAVAILABLE';
  verification: ToolBindingVerification;
  /** Caminho real do arquivo, relativo à raiz do repo — só preenchido quando `verification === 'VERIFIED'`. */
  evidencePath: string | null;
  /** Símbolo exportado no nível do módulo (classe, função ou const) — sempre o que `import { X }
   *  from evidencePath` realmente traria. */
  exportName: string | null;
  /** Quando o real trabalho é um MÉTODO de instância de `exportName` (ex.: `LeadUseCases.
   *  findLeadById`), o nome do método — verificado via `exportName.prototype[methodName]`. `null`
   *  quando `exportName` já é a própria função/const executável (ex.: `createCalendarEvent`). */
  methodName: string | null;
}

export const TOOL_BINDINGS: ToolBinding[] = [
  {
    capabilityCode: 'lead.read',
    toolCode: 'crm.lead-usecases.find-by-id',
    binding: 'LeadUseCases.findLeadById — leitura de um lead real do banco, por tenant.',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath: 'src/features/crm/application/LeadUseCases.ts',
    exportName: 'LeadUseCases',
    methodName: 'findLeadById',
  },
  {
    capabilityCode: 'lead.search',
    toolCode: 'crm.lead-usecases.find-many',
    binding: 'LeadUseCases.findLeads — listagem/filtro de leads reais.',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath: 'src/features/crm/application/LeadUseCases.ts',
    exportName: 'LeadUseCases',
    methodName: 'findLeads',
  },
  {
    capabilityCode: 'lead.enrich',
    toolCode: 'crm.lead-usecases.enrich',
    binding: 'LeadUseCases.enrichLead — dispara enriquecimento real de um lead.',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath: 'src/features/crm/application/LeadUseCases.ts',
    exportName: 'LeadUseCases',
    methodName: 'enrichLead',
  },
  {
    capabilityCode: 'lead.qualify',
    toolCode: 'intelligence.sdr-qualification-agent.run',
    binding: 'SDRQualificationAgent.run — já em produção (REAL_EM_PRODUCAO no catálogo comercial).',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath: 'src/features/intelligence/agents/sdrQualification.agent.ts',
    exportName: 'SDRQualificationAgent',
    methodName: 'run',
  },
  {
    capabilityCode: 'lead.update',
    toolCode: 'crm.lead-usecases.update',
    binding: 'LeadUseCases.updateLead — grava alteração de campo de um lead real.',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath: 'src/features/crm/application/LeadUseCases.ts',
    exportName: 'LeadUseCases',
    methodName: 'updateLead',
  },
  {
    capabilityCode: 'company.read',
    toolCode: 'companies.usecases.find-by-id',
    binding: 'CompanyUseCases.findCompanyById — leitura de uma empresa real do banco.',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath: 'src/features/companies/application/CompanyUseCases.ts',
    exportName: 'CompanyUseCases',
    methodName: 'findCompanyById',
  },
  {
    capabilityCode: 'company.search',
    toolCode: 'companies.usecases.find-many',
    binding: 'CompanyUseCases.findCompanies — listagem/filtro de empresas reais.',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath: 'src/features/companies/application/CompanyUseCases.ts',
    exportName: 'CompanyUseCases',
    methodName: 'findCompanies',
  },
  {
    capabilityCode: 'meeting.read',
    toolCode: 'meeting.read.unverified',
    binding:
      'Nenhum símbolo único e específico de "ler reunião" foi encontrado nesta auditoria (dado de reunião hoje é espalhado entre Activity/CalendarEvent/copiloto). Não é fonte ausente nem onda futura conhecida — gap registrado, não fabricado.',
    available: false,
    reason: 'TOOL_UNAVAILABLE',
    verification: 'UNVERIFIED',
    evidencePath: null,
    exportName: null,
    methodName: null,
  },
  {
    capabilityCode: 'meeting.analyze',
    toolCode: 'chatbook.meeting-synthesis.synthesize',
    binding: 'MeetingSynthesisService.synthesizeMeeting — síntese real de transcrição de reunião.',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath: 'src/features/chatbook/services/meeting-synthesis.service.ts',
    exportName: 'MeetingSynthesisService',
    methodName: 'synthesizeMeeting',
  },
  {
    capabilityCode: 'meeting.schedule',
    toolCode: 'integrations.google.create-calendar-event',
    binding:
      'createCalendarEvent — cria evento real no Google Calendar (+ Google Meet quando aplicável).',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath: 'src/features/integrations/google/google.service.ts',
    exportName: 'createCalendarEvent',
    methodName: null,
  },
  {
    capabilityCode: 'deal.read',
    toolCode: 'crm.lead-usecases.find-by-id',
    binding:
      'LeadUseCases.findLeadById — "negociação"/"deal" neste produto é o próprio Lead quando em estágio de pipeline (Lead.pipelineStageId); não existe um segundo modelo "Deal" paralelo.',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath: 'src/features/crm/application/LeadUseCases.ts',
    exportName: 'LeadUseCases',
    methodName: 'findLeadById',
  },
  {
    capabilityCode: 'deal.analyze',
    toolCode: 'intelligence.closer-agent.run',
    binding: 'CloserAgent.run — já em produção, narra estratégia de negociação/objeções.',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath: 'src/features/intelligence/agents/closer.agent.ts',
    exportName: 'CloserAgent',
    methodName: 'run',
  },
  {
    capabilityCode: 'deal.update',
    toolCode: 'crm.lead-usecases.update',
    binding: 'LeadUseCases.updateLead — grava alteração de campo de um lead/negociação real.',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath: 'src/features/crm/application/LeadUseCases.ts',
    exportName: 'LeadUseCases',
    methodName: 'updateLead',
  },
  {
    capabilityCode: 'deal.move_stage',
    toolCode: 'crm.lead-usecases.update-status',
    binding:
      'LeadUseCases.updateLeadStatus — move o lead/negociação de estágio real de pipeline, sujeito a `dealClosureGate` para fechamento.',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath: 'src/features/crm/application/LeadUseCases.ts',
    exportName: 'LeadUseCases',
    methodName: 'updateLeadStatus',
  },
  {
    capabilityCode: 'pipeline.read',
    toolCode: 'commercial-intelligence.usecases.pipeline-creation',
    binding:
      'CommercialIntelligenceUseCases.pipelineCreation — números reais de geração de pipeline.',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath:
      'src/features/commercial-intelligence/application/CommercialIntelligenceUseCases.ts',
    exportName: 'CommercialIntelligenceUseCases',
    methodName: 'pipelineCreation',
  },
  {
    capabilityCode: 'pipeline.analyze',
    toolCode: 'commercial-intelligence.usecases.performance',
    binding:
      'CommercialIntelligenceUseCases.performance — análise real de composição/ritmo de pipeline.',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath:
      'src/features/commercial-intelligence/application/CommercialIntelligenceUseCases.ts',
    exportName: 'CommercialIntelligenceUseCases',
    methodName: 'performance',
  },
  {
    capabilityCode: 'forecast.read',
    toolCode: 'commercial-intelligence.usecases.executive-overview',
    binding:
      'CommercialIntelligenceUseCases.executiveOverview — inclui números de forecast já calculados.',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath:
      'src/features/commercial-intelligence/application/CommercialIntelligenceUseCases.ts',
    exportName: 'CommercialIntelligenceUseCases',
    methodName: 'executiveOverview',
  },
  {
    capabilityCode: 'forecast.explain',
    toolCode: 'commercial-intelligence.usecases.forecast-explain',
    binding:
      'CommercialIntelligenceUseCases.forecastExplain — explica o forecast real já calculado (PIPELINE != FORECAST).',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath:
      'src/features/commercial-intelligence/application/CommercialIntelligenceUseCases.ts',
    exportName: 'CommercialIntelligenceUseCases',
    methodName: 'forecastExplain',
  },
  {
    capabilityCode: 'knowledge.search',
    toolCode: 'knowledge.search-service.hybrid-search',
    binding: 'SearchService.hybridSearch — busca híbrida real (semântica + palavra-chave).',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath: 'src/features/knowledge/search.service.ts',
    exportName: 'SearchService',
    methodName: 'hybridSearch',
  },
  {
    capabilityCode: 'contract.read',
    toolCode: 'cadence.signature.is-valid-transition',
    binding:
      'signature.ts (isValidSignatureTransition/SignatureStatus) — status real de assinatura, mesma fonte espelhada por ContractSignatureAgent.',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath: 'src/shared/domain/signature.ts',
    exportName: 'isValidSignatureTransition',
    methodName: null,
  },
  {
    capabilityCode: 'contract.generate',
    toolCode: 'contract.generate.future',
    binding: 'Nenhum motor real de geração de documento de contrato encontrado nesta auditoria.',
    available: false,
    reason: 'FUTURE_TOOL',
    verification: 'UNVERIFIED',
    evidencePath: null,
    exportName: null,
    methodName: null,
  },
  {
    capabilityCode: 'signature.request',
    toolCode: 'cadence.signature.govbr-stub',
    binding:
      'GovBrSignatureProviderPort — máquina de estados e webhook são reais, mas o transporte externo (gov.br) ainda é stub documentado (ver commercialAgentRegistry.ts). PROMPT 3B item 6: nunca promover stub a integração real — permanece FUTURE_TOOL mesmo com símbolo real existente.',
    available: false,
    reason: 'FUTURE_TOOL',
    verification: 'UNVERIFIED',
    evidencePath: null,
    exportName: null,
    methodName: null,
  },
  {
    capabilityCode: 'billing.read',
    toolCode: 'billing.read.source-required',
    binding:
      'src/features/billing/** é custo de uso de IA (consumo de token), não faturamento de venda — SEM fonte real de faturamento confirmada (mesma conclusão de commercialAgentRegistry.ts/billing-revenue).',
    available: false,
    reason: 'SOURCE_REQUIRED',
    verification: 'UNVERIFIED',
    evidencePath: null,
    exportName: null,
    methodName: null,
  },
  {
    capabilityCode: 'billing.reconcile',
    toolCode: 'billing.reconcile.source-required',
    binding: 'Mesma ausência de fonte real de faturamento de venda — nunca fabricar o faturado.',
    available: false,
    reason: 'SOURCE_REQUIRED',
    verification: 'UNVERIFIED',
    evidencePath: null,
    exportName: null,
    methodName: null,
  },
  {
    capabilityCode: 'bitrix.read',
    toolCode: 'commercial-intelligence.usecases.crm-quality',
    binding:
      'CommercialIntelligenceUseCases.crmQuality — saúde/qualidade real de sincronização Bitrix.',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath:
      'src/features/commercial-intelligence/application/CommercialIntelligenceUseCases.ts',
    exportName: 'CommercialIntelligenceUseCases',
    methodName: 'crmQuality',
  },
  {
    capabilityCode: 'bitrix.write',
    toolCode: 'integrations.bitrix.lead-writeback-adapter',
    binding:
      'BitrixLeadWritebackAdapter.updateLeadFields — writeback real (crm.lead.update via callBitrix). Binding VERIFIED, mas por ser HIGH: allowed=false/requiresApproval=true/APPROVAL_REQUIRED (PROMPT 3B item 7) — verificado nunca é sinônimo de autorizado.',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath: 'src/features/integrations/bitrix/infra/BitrixLeadWritebackAdapter.ts',
    exportName: 'BitrixLeadWritebackAdapter',
    methodName: 'updateLeadFields',
  },
  {
    capabilityCode: 'bitrix.configure',
    toolCode: 'integrations.bitrix.routes.connect',
    binding: 'bitrix.routes.ts (POST conexão/webhook) — configuração real de integração Bitrix24.',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath: 'src/features/integrations/bitrix/bitrix.routes.ts',
    exportName: 'bitrixRoutes',
    methodName: null,
  },
  {
    capabilityCode: 'agent.discover',
    toolCode: 'job-roles.agent-catalog.list',
    binding: 'listAgentDefinitions — o próprio catálogo já construído nos PROMPTs 1/2.',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath: 'src/features/job-roles/services/agentCatalog.service.ts',
    exportName: 'listAgentDefinitions',
    methodName: null,
  },
  {
    capabilityCode: 'agent.execute',
    toolCode: 'job-roles.agent-runtime.execute-prompt-ready',
    binding:
      'agentExecute (toolExecutors.ts) — executor genérico do AgentRuntime: para um agente PROMPT_READY (AgentVersion.systemPrompt real, resolvido por agentRuntime.service.ts antes de chamar o executor), monta um SystemMessage com o prompt armazenado e chama getAiModel/gateway de IA real; agente sem systemPrompt falha fechado com erro explícito, nunca fabrica resposta. Correção do achado da auditoria de dívida técnica (AIAGENT-001/002): o comentário acima que bloqueava isto "até o PROMPT 4" estava desatualizado — o runtime genérico (agentRuntime.service.ts/toolExecutors.ts) já existia, só faltava este executor.',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath: 'src/lib/ai/gateway/chat-model.ts',
    exportName: 'getAiModel',
    methodName: null,
  },
  {
    capabilityCode: 'agent.request_cross_role',
    toolCode: 'access-request.create',
    binding:
      'accessRequest.service.createAccessRequest — cria um AccessRequest real (categoria via access-request-policy.ts), com aprovação automática para READ_CONSULTA de baixo risco ou pendente de decisão humana elegível (PROMPT 7).',
    available: true,
    reason: 'AVAILABLE',
    verification: 'VERIFIED',
    evidencePath: 'src/features/job-roles/services/accessRequest.service.ts',
    exportName: 'createAccessRequest',
    methodName: null,
  },
];

export function getToolBinding(capabilityCode: string): ToolBinding | undefined {
  return TOOL_BINDINGS.find((b) => b.capabilityCode === capabilityCode);
}
