// PROMPT 4 — Agent Runtime Genérico: Tool Executor Registry.
//
// Cada executor é um wrapper FINO sobre um serviço real já existente — nunca um motor de negócio
// novo, nunca uma segunda implementação (regra do prompt da onda: "agents são wrappers sobre
// serviços reais... não duplicar motores"). Só capabilities com `ToolBinding` `VERIFIED`
// (`tool-bindings.ts`, PROMPT 3) têm executor aqui — "Somente registrar executores comprovados".
//
// Os serviços reais vivem em outras features (`crm`, `companies`, `commercial-intelligence`,
// `knowledge`, `intelligence/agents`, `integrations/bitrix`, `integrations/google`,
// `chatbook`) — `job-roles` não os importa diretamente (`no-cross-feature-imports`,
// dependency-cruiser). Resolvidos via `container.resolve<T>(name)` com contrato estrutural local,
// mesmo padrão já usado por `src/features/intelligence/routes/agent.routes.ts` (ver comentário em
// `src/shared/di/setup.ts` para o racional completo e onde cada um é registrado).

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getAiModel } from '../../../lib/ai/gateway.js';
import { prisma } from '../../../lib/prisma.js';
import { container } from '../../../shared/di/container.js';
import { assertPiiExternalConsent } from '../../../shared/services/aiPiiConsent.service.js';

export interface ToolExecutionContext {
  organizationId: string;
  actorId: string;
  resource: Record<string, unknown>;
  mission?: string;
  /** Contexto adicional livre do contrato de `POST /agents/:agentCode/run`
   *  (`AgentExecutionRequest.context`) — hoje só consumido pelo executor genérico `agent.execute`;
   *  os demais executores o ignoram (mantido opcional para não forçar todo chamador existente a
   *  informar um campo que não usa). */
  context?: Record<string, unknown>;
  /** `AgentDefinition.code` já resolvido/autorizado por `authorizeCapability` — nunca o valor cru
   *  do body (mesmo `request.agentCode` que `agentRuntime.service.ts` já usou para autorizar).
   *  Hoje só consumido por `agent.execute` (rótulo de `agentContext` no gateway de IA). */
  agentCode: string;
  /** `AgentVersion` com `status = 'ACTIVE'` do agente em execução — a MESMA linha que
   *  `agentRuntime.service.ts` já busca para persistir `AgentExecution.agentVersionId` (nunca uma
   *  segunda consulta duplicada aqui). `null` quando o agente não tem nenhuma versão ativa. Hoje só
   *  consumido por `agent.execute`: `systemPrompt` não-nulo é a condição PROMPT_READY (ver
   *  scripts/import-agent-catalog.ts:resolveStatus) que autoriza a chamada real de IA. */
  agentVersion: { id: string; version: number; systemPrompt: string | null } | null;
}

export interface ToolFact {
  label: string;
  value: string;
  source: string;
}

export interface ToolExecutionOutput {
  summary: string;
  facts: ToolFact[];
  metrics: Record<string, number | string | null>;
  evidence: string[];
  missingData: string[];
  /** Retorno bruto do serviço real, para depuração/auditoria — nunca reformulado como fato novo. */
  raw?: unknown;
}

export type ToolExecutor = (ctx: ToolExecutionContext) => Promise<ToolExecutionOutput>;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

function requireStr(resource: Record<string, unknown>, key: string): string {
  const v = str(resource[key]);
  if (!v) throw new Error(`resource.${key} é obrigatório para este executor.`);
  return v;
}

// ─── CRM: Lead ───────────────────────────────────────────────────────────────────────────────
interface LeadUseCasesContract {
  findLeadById(organizationId: string, id: string): Promise<Record<string, unknown> | null>;
  findLeads(
    organizationId: string,
    status?: string,
    page?: number,
    limit?: number,
    funnel?: string,
    query?: string,
  ): Promise<unknown>;
  enrichLead(organizationId: string, id: string): Promise<unknown>;
  updateLead(
    organizationId: string,
    id: string,
    data: Record<string, unknown>,
    actorUserId?: string,
  ): Promise<Record<string, unknown>>;
  updateLeadStatus(
    organizationId: string,
    id: string,
    newStatus: string,
    actorUserId?: string,
  ): Promise<Record<string, unknown>>;
}

function leadUseCases() {
  return container.resolve<LeadUseCasesContract>('LeadUseCases');
}

const leadRead: ToolExecutor = async (ctx) => {
  const id = requireStr(ctx.resource, 'leadId');
  const lead = await leadUseCases().findLeadById(ctx.organizationId, id);
  if (!lead) {
    return {
      summary: `Lead ${id} não encontrado nesta organização.`,
      facts: [],
      metrics: {},
      evidence: [],
      missingData: ['lead'],
      raw: null,
    };
  }
  return {
    summary: `Lead "${lead.title ?? id}" — status "${lead.status ?? 'desconhecido'}".`,
    facts: [
      { label: 'status', value: String(lead.status ?? ''), source: 'LeadUseCases.findLeadById' },
      { label: 'owner', value: String(lead.owner ?? ''), source: 'LeadUseCases.findLeadById' },
    ],
    metrics: {},
    evidence: [`Lead.id=${id}`],
    missingData: [],
    raw: lead,
  };
};

const leadSearch: ToolExecutor = async (ctx) => {
  const status = str(ctx.resource.status);
  const query = str(ctx.resource.query);
  const page = typeof ctx.resource.page === 'number' ? ctx.resource.page : undefined;
  const limit = typeof ctx.resource.limit === 'number' ? ctx.resource.limit : undefined;
  const result = await leadUseCases().findLeads(
    ctx.organizationId,
    status,
    page,
    limit,
    undefined,
    query,
  );
  const rows = Array.isArray((result as { data?: unknown[] })?.data)
    ? ((result as { data: unknown[] }).data as unknown[])
    : Array.isArray(result)
      ? (result as unknown[])
      : [];
  return {
    summary: `${rows.length} lead(s) encontrados${status ? ` com status "${status}"` : ''}.`,
    facts: [{ label: 'total', value: String(rows.length), source: 'LeadUseCases.findLeads' }],
    metrics: { total: rows.length },
    evidence: ['LeadUseCases.findLeads'],
    missingData: [],
    raw: result,
  };
};

const leadEnrich: ToolExecutor = async (ctx) => {
  const id = requireStr(ctx.resource, 'leadId');
  const result = await leadUseCases().enrichLead(ctx.organizationId, id);
  return {
    summary: `Enriquecimento disparado para o lead ${id}.`,
    facts: [],
    metrics: {},
    evidence: [`Lead.id=${id}`],
    missingData: [],
    raw: result,
  };
};

const leadUpdate: ToolExecutor = async (ctx) => {
  const id = requireStr(ctx.resource, 'leadId');
  const data = (ctx.resource.data as Record<string, unknown>) ?? {};
  const updated = await leadUseCases().updateLead(ctx.organizationId, id, data, ctx.actorId);
  return {
    summary: `Lead ${id} atualizado.`,
    facts: [
      { label: 'status', value: String(updated.status ?? ''), source: 'LeadUseCases.updateLead' },
    ],
    metrics: {},
    evidence: [`Lead.id=${id}`],
    missingData: [],
    raw: updated,
  };
};

const dealMoveStage: ToolExecutor = async (ctx) => {
  const id = requireStr(ctx.resource, 'leadId');
  const newStatus = requireStr(ctx.resource, 'newStatus');
  const updated = await leadUseCases().updateLeadStatus(
    ctx.organizationId,
    id,
    newStatus,
    ctx.actorId,
  );
  return {
    summary: `Negociação ${id} movida para o estágio "${newStatus}".`,
    facts: [
      {
        label: 'status',
        value: String(updated.status ?? newStatus),
        source: 'LeadUseCases.updateLeadStatus',
      },
    ],
    metrics: {},
    evidence: [`Lead.id=${id}`],
    missingData: [],
    raw: updated,
  };
};

// ─── CRM: Company ────────────────────────────────────────────────────────────────────────────
interface CompanyUseCasesContract {
  findCompanyById(organizationId: string, id: string): Promise<Record<string, unknown> | null>;
  findCompanies(
    organizationId: string,
    query?: string,
    page?: number,
    limit?: number,
  ): Promise<unknown>;
}

function companyUseCases() {
  return container.resolve<CompanyUseCasesContract>('CompanyUseCases');
}

const companyRead: ToolExecutor = async (ctx) => {
  const id = requireStr(ctx.resource, 'companyId');
  const company = await companyUseCases().findCompanyById(ctx.organizationId, id);
  if (!company) {
    return {
      summary: `Empresa ${id} não encontrada nesta organização.`,
      facts: [],
      metrics: {},
      evidence: [],
      missingData: ['company'],
      raw: null,
    };
  }
  return {
    summary: `Empresa "${company.tradeName ?? company.legalName ?? id}".`,
    facts: [
      {
        label: 'segment',
        value: String(company.segment ?? ''),
        source: 'CompanyUseCases.findCompanyById',
      },
    ],
    metrics: {},
    evidence: [`Company.id=${id}`],
    missingData: [],
    raw: company,
  };
};

const companySearch: ToolExecutor = async (ctx) => {
  const query = str(ctx.resource.query);
  const result = await companyUseCases().findCompanies(ctx.organizationId, query);
  const rows = Array.isArray((result as { data?: unknown[] })?.data)
    ? ((result as { data: unknown[] }).data as unknown[])
    : Array.isArray(result)
      ? (result as unknown[])
      : [];
  return {
    summary: `${rows.length} empresa(s) encontrada(s)${query ? ` para "${query}"` : ''}.`,
    facts: [
      { label: 'total', value: String(rows.length), source: 'CompanyUseCases.findCompanies' },
    ],
    metrics: { total: rows.length },
    evidence: ['CompanyUseCases.findCompanies'],
    missingData: [],
    raw: result,
  };
};

// ─── Reuniões ────────────────────────────────────────────────────────────────────────────────
interface MeetingSynthesisContract {
  synthesizeMeeting(input: { transcript: string; leadId?: string }): Promise<{
    summary: string;
    actionItems?: { title: string }[];
    risks?: unknown[];
  }>;
}

const meetingAnalyze: ToolExecutor = async (ctx) => {
  const transcript = requireStr(ctx.resource, 'transcript');
  const leadId = str(ctx.resource.leadId);
  const service = container.resolve<MeetingSynthesisContract>('MeetingSynthesisService');
  const result = await service.synthesizeMeeting({ transcript, leadId });
  return {
    summary: result.summary,
    facts: [],
    metrics: { actionItems: result.actionItems?.length ?? 0 },
    evidence: ['MeetingSynthesisService.synthesizeMeeting'],
    missingData: [],
    raw: result,
  };
};

interface GoogleCalendarContract {
  createCalendarEvent(
    organizationId: string,
    input: { title: string; startTime: string; endTime: string; attendeeEmails?: string[] },
  ): Promise<{ id: string; meetLink?: string | null }>;
}

const meetingSchedule: ToolExecutor = async (ctx) => {
  const title = requireStr(ctx.resource, 'title');
  const startTime = requireStr(ctx.resource, 'startTime');
  const endTime = requireStr(ctx.resource, 'endTime');
  const service = container.resolve<GoogleCalendarContract>('GoogleCalendarService');
  const result = await service.createCalendarEvent(ctx.organizationId, {
    title,
    startTime,
    endTime,
  });
  return {
    summary: `Reunião "${title}" agendada.`,
    facts: [{ label: 'eventId', value: result.id, source: 'createCalendarEvent' }],
    metrics: {},
    evidence: [`CalendarEvent.id=${result.id}`],
    missingData: [],
    raw: result,
  };
};

// ─── Pipeline / Forecast (via CommercialIntelligenceUseCases) ─────────────────────────────────
interface CommercialIntelligenceFilter {
  month: string;
  owner?: string;
  product?: string;
  source?: string;
  icp?: string;
  company?: string;
}
interface CommercialIntelligenceContract {
  pipelineCreation(organizationId: string, filter: CommercialIntelligenceFilter): Promise<unknown>;
  performance(organizationId: string, filter: CommercialIntelligenceFilter): Promise<unknown>;
  executiveOverview(organizationId: string, filter: CommercialIntelligenceFilter): Promise<unknown>;
  forecastExplain(organizationId: string, leadId: string): Promise<unknown>;
  crmQuality(organizationId: string, filter: CommercialIntelligenceFilter): Promise<unknown>;
}

function commercialIntelligence() {
  return container.resolve<CommercialIntelligenceContract>('CommercialIntelligenceUseCases');
}

function resolveFilter(ctx: ToolExecutionContext): CommercialIntelligenceFilter {
  const { currentPeriod } = container.resolve<{ currentPeriod: () => string }>(
    'CommercialIntelligencePeriod',
  );
  return {
    month: str(ctx.resource.month) ?? currentPeriod(),
    owner: str(ctx.resource.owner),
    product: str(ctx.resource.product),
    source: str(ctx.resource.source),
    icp: str(ctx.resource.icp),
    company: str(ctx.resource.company),
  };
}

/** Extrai um subconjunto de campos REAIS do relatório (`CommercialIntelligenceUseCases`) para
 *  `metrics` — nunca recalcula nada, só escolhe quais campos já existentes no relatório valem a
 *  pena expor a um agente/supervisor sem forçá-lo a reconstruir o objeto inteiro a partir de
 *  `raw` (que não é persistido em `AgentExecution`, ver `agentRuntime.service.ts`). Cada extrator
 *  é resiliente a um formato inesperado (retorna `{}` em vez de lançar) — nunca inventa um número
 *  quando o campo não existir no resultado real. */
type CiMetricsExtractor = (result: unknown) => Record<string, number | string | null>;

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** `executiveOverview` — venda esperada (`forecastAmount`) e gap (`gapForecast`) vêm daqui
 *  (seção 6 do relatório executivo); `coverage90` é a "Proteção 90 dias" achatada em 3 campos. */
const executiveOverviewMetrics: CiMetricsExtractor = (result) => {
  const r = result as Record<string, unknown>;
  const coverage90 = r.coverage90 as Record<string, unknown> | undefined;
  return {
    closedAmount: num(r.closedAmount),
    forecastAmount: num(r.forecastAmount),
    gapForecast: num(r.gapForecast),
    gapCommit: num(r.gapCommit),
    pctOfGoal: num(r.pctOfGoal),
    pipelineEligible: num(r.pipelineEligible),
    coverage90Multiple: num(coverage90?.coverage),
    coverage90Recommended: num(coverage90?.coverageRecommended),
    coverage90RemainingGoal: num(coverage90?.remainingGoal),
  };
};

/** `pipelineCreation` — "ritmo pipeline novo" (Pipeline Creation Pace, seção 21): `pacePercent`
 *  100 = exatamente no ritmo esperado até hoje; `paceGapAmount` positivo = atrás do ritmo. */
const pipelineCreationMetrics: CiMetricsExtractor = (result) => {
  const r = result as Record<string, unknown>;
  return {
    amount: num(r.amount),
    count: num(r.count),
    averageTicket: num(r.averageTicket),
    pipelineNeeded: num(r.pipelineNeeded),
    creationCoverage: num(r.creationCoverage),
    pacePercent: num(r.pacePercent),
    paceExpectedAmount: num(r.paceExpectedAmount),
    paceGapAmount: num(r.paceGapAmount),
  };
};

const performanceMetrics: CiMetricsExtractor = (result) => {
  const r = result as Record<string, unknown>;
  return {
    winRate: num(r.winRate),
    wonCount: num(r.wonCount),
    lostCount: num(r.lostCount),
  };
};

const crmQualityMetrics: CiMetricsExtractor = (result) => {
  const r = result as Record<string, unknown>;
  const bitrixSync = r.bitrixSync as Record<string, unknown> | undefined;
  return {
    overallScore: num(r.overallScore),
    suspectedDuplicateGroups: num(r.suspectedDuplicateGroups),
    evaluatedCount: num(r.evaluatedCount),
    bitrixSyncHealthy: bitrixSync ? String(Boolean(bitrixSync.healthy)) : null,
  };
};

function makeCiExecutor(
  label: string,
  call: (
    ci: CommercialIntelligenceContract,
    organizationId: string,
    filter: CommercialIntelligenceFilter,
  ) => Promise<unknown>,
  extractMetrics: CiMetricsExtractor,
): ToolExecutor {
  return async (ctx) => {
    const filter = resolveFilter(ctx);
    const result = await call(commercialIntelligence(), ctx.organizationId, filter);
    let metrics: Record<string, number | string | null> = {};
    try {
      metrics = extractMetrics(result);
    } catch {
      // Formato inesperado do relatório real — nunca lança nem inventa métrica; segue com {}.
    }
    return {
      summary: `${label} para o período ${filter.month}.`,
      facts: [],
      metrics,
      evidence: [`CommercialIntelligenceUseCases.${label} — período ${filter.month}`],
      missingData: [],
      raw: result,
    };
  };
}

const pipelineRead = makeCiExecutor(
  'pipelineCreation',
  (ci, org, f) => ci.pipelineCreation(org, f),
  pipelineCreationMetrics,
);
const pipelineAnalyze = makeCiExecutor(
  'performance',
  (ci, org, f) => ci.performance(org, f),
  performanceMetrics,
);
// PIPELINE != FORECAST (invariante do prompt da onda — ver PROMPT 5, perfil REVENUE_INTELLIGENCE):
// `executiveOverview` é o único executor cujas métricas alimentam "venda esperada"/"gap", nunca
// misturado com `pipelineCreation` (que é sobre pipeline NOVO criado, não sobre forecast).
const forecastRead = makeCiExecutor(
  'executiveOverview',
  (ci, org, f) => ci.executiveOverview(org, f),
  executiveOverviewMetrics,
);
const bitrixRead = makeCiExecutor(
  'crmQuality',
  (ci, org, f) => ci.crmQuality(org, f),
  crmQualityMetrics,
);

const forecastExplain: ToolExecutor = async (ctx) => {
  const leadId = requireStr(ctx.resource, 'leadId');
  const result = await commercialIntelligence().forecastExplain(ctx.organizationId, leadId);
  if (!result) {
    return {
      summary: `Sem forecast explicável para o lead ${leadId} (fora do pipeline elegível ou sem dado suficiente).`,
      facts: [],
      metrics: {
        amount: null,
        stageProbability: null,
        weightedProbability: null,
        weightedValue: null,
        tier: null,
      },
      evidence: [],
      missingData: ['forecastExplain'],
      raw: null,
    };
  }
  const r = result as Record<string, unknown>;
  return {
    summary: `Explicação de forecast gerada para o lead ${leadId}.`,
    facts: [],
    metrics: {
      amount: num(r.amount),
      stageProbability: num(r.stageProbability),
      weightedProbability: num(r.weightedProbability),
      weightedValue: num(r.weightedValue),
      tier: typeof r.tier === 'string' ? r.tier : null,
    },
    evidence: [`CommercialIntelligenceUseCases.forecastExplain leadId=${leadId}`],
    missingData: [],
    raw: result,
  };
};

// ─── Conhecimento ────────────────────────────────────────────────────────────────────────────
interface SearchServiceContract {
  hybridSearch(
    organizationId: string,
    query: string,
    limit?: number,
  ): Promise<{ hits: { title?: string; content?: string; score?: number }[] } | unknown>;
}

const knowledgeSearch: ToolExecutor = async (ctx) => {
  const query = requireStr(ctx.resource, 'query');
  const service = container.resolve<SearchServiceContract>('KnowledgeSearchService');
  const result = await service.hybridSearch(ctx.organizationId, query);
  const hits = (result as { hits?: unknown[] })?.hits ?? [];
  return {
    summary: `${hits.length} resultado(s) na base de conhecimento para "${query}".`,
    facts: [{ label: 'total', value: String(hits.length), source: 'SearchService.hybridSearch' }],
    metrics: { total: hits.length },
    evidence: ['SearchService.hybridSearch'],
    missingData: [],
    raw: result,
  };
};

// ─── Contratos ───────────────────────────────────────────────────────────────────────────────
// Lê diretamente `CrmDocumentSignatureRequest` via o cliente Prisma compartilhado — não é import
// cross-feature (é o mesmo `prisma` que toda feature já usa), e é a fonte mais direta e honesta
// do status real de assinatura (mesma tabela por trás de `signature.ts`/`documentSignature.ts`).
const contractRead: ToolExecutor = async (ctx) => {
  const documentId = requireStr(ctx.resource, 'documentId');
  const requests = await prisma.crmDocumentSignatureRequest.findMany({
    where: { organizationId: ctx.organizationId, documentId },
    orderBy: { requestedAt: 'desc' },
    select: { id: true, status: true, signerEmail: true, requestedAt: true },
  });
  const output: ToolExecutionOutput = {
    summary:
      requests.length === 0
        ? `Nenhuma solicitação de assinatura encontrada para o documento ${documentId}.`
        : `Documento ${documentId} — status de assinatura mais recente: "${requests[0]?.status}".`,
    facts:
      requests.length === 0
        ? []
        : [
            {
              label: 'status',
              value: String(requests[0]?.status),
              source: 'CrmDocumentSignatureRequest',
            },
          ],
    metrics: { totalRequests: requests.length },
    evidence: requests.length === 0 ? [] : [`CrmDocumentSignatureRequest.id=${requests[0]?.id}`],
    missingData: requests.length === 0 ? ['signatureRequest'] : [],
    raw: requests,
  };
  return output;
};

// ─── Bitrix ──────────────────────────────────────────────────────────────────────────────────
interface BitrixWritebackContract {
  updateLeadFields(
    organizationId: string,
    bitrixLeadId: string,
    fields: Record<string, string>,
  ): Promise<void>;
}

const bitrixWrite: ToolExecutor = async (ctx) => {
  const bitrixLeadId = requireStr(ctx.resource, 'bitrixLeadId');
  const fields = (ctx.resource.fields as Record<string, string>) ?? {};
  const adapter = container.resolve<BitrixWritebackContract>('BitrixLeadWritebackAdapter');
  await adapter.updateLeadFields(ctx.organizationId, bitrixLeadId, fields);
  return {
    summary: `Campos gravados no lead Bitrix ${bitrixLeadId}.`,
    facts: [],
    metrics: { fieldsUpdated: Object.keys(fields).length },
    evidence: [`Bitrix.leadId=${bitrixLeadId}`],
    missingData: [],
  };
};

interface BitrixConnectionOpsContract {
  testBitrixConnection(organizationId: string, connectionId: string): Promise<unknown>;
}

const bitrixConfigure: ToolExecutor = async (ctx) => {
  const connectionId = requireStr(ctx.resource, 'connectionId');
  const ops = container.resolve<BitrixConnectionOpsContract>('BitrixConnectionOps');
  const result = await ops.testBitrixConnection(ctx.organizationId, connectionId);
  return {
    summary: `Conexão Bitrix ${connectionId} testada.`,
    facts: [],
    metrics: {},
    evidence: [`BitrixConnection.id=${connectionId}`],
    missingData: [],
    raw: result,
  };
};

// ─── Governança de Agentes ───────────────────────────────────────────────────────────────────
const agentDiscover: ToolExecutor = async () => ({
  summary: 'Agente presente no catálogo (AgentDefinition ativo).',
  facts: [],
  metrics: {},
  evidence: ['AgentDefinition'],
  missingData: [],
});

// Achado real da auditoria de dívida técnica (AIAGENT-001/AIAGENT-002): `agent.execute` estava
// bloqueado como FUTURE_TOOL por um comentário desatualizado ("até o PROMPT 4") mesmo depois de
// `agentRuntime.service.ts`/este arquivo já existirem, e mesmo quando desbloqueado não havia
// NENHUM executor registrado — a pipeline de autorização (13 etapas, capabilityAuthorization.
// service.ts) já roteava/autorizava corretamente, mas não tinha o que chamar no fim. Este é esse
// executor: diferente de todo outro nesta seção (wrapper fino sobre um serviço de OUTRA feature),
// este É o motor genérico em si — lê o `AgentVersion.systemPrompt` já resolvido por
// `agentRuntime.service.ts` (nunca uma segunda consulta) e invoca o gateway de IA real
// (`getAiModel`, mesmo caminho de BaseAgent.run()/lib/ai/features.ts) com esse prompt como
// SystemMessage.
//
// Condição PROMPT_READY = `AgentVersion.systemPrompt` não-nulo (27 dos 379 agentes importados do
// catálogo Birth Hub nesta rodada — ver scripts/import-agent-catalog.ts:resolveStatus). Os outros
// 352 (systemPrompt null) falham fechado com um erro explícito: nunca fabrica uma resposta (mesmo
// princípio já em BaseAgent.run() — "nunca fabricar uma resposta falsa").
//
// Gate LGPD: `mission`/`resource`/`context` aqui são texto/JSON livres informados por quem chama
// `POST /agents/:agentCode/run` — a mesma superfície que pode carregar nome/e-mail/telefone de um
// lead ou empresa real (ex.: um operador colando o perfil de um lead no `mission`, ou `resource`
// carregando `{leadId, contactName, ...}`). Antes de qualquer chamada ao provedor de IA externo,
// passa pelo MESMO gate fail-closed que já protege SDR/BDR/Closer/CRM/Ops/Supervisor (BaseAgent),
// WhatsApp e a transcrição de reunião do Copiloto (`assertPiiExternalConsent`,
// aiPiiConsent.service.ts) — nunca um caminho novo de PII para IA externa que ignore essa base
// legal já estabelecida.
const agentExecute: ToolExecutor = async (ctx) => {
  if (!ctx.agentVersion?.systemPrompt) {
    // Fail closed, honesto: sem prompt real configurado, não há nada real para executar — nunca
    // inventa um resumo/resposta. `runAgentExecution` converte esta exceção em `AgentExecution`
    // `status = 'FAILED'` com `errorMessage` sanitizado, o mesmo caminho que qualquer outro
    // executor desta tabela já usa para um pré-requisito ausente (ex.: `requireStr` acima).
    throw new Error(
      'Este agente não tem conteúdo executável configurado ainda (nenhuma AgentVersion ativa com systemPrompt real).',
    );
  }

  assertPiiExternalConsent(ctx.organizationId);

  const missionText = str(ctx.mission);
  const resourceJson =
    ctx.resource && Object.keys(ctx.resource).length > 0 ? JSON.stringify(ctx.resource) : null;
  const contextJson =
    ctx.context && Object.keys(ctx.context).length > 0 ? JSON.stringify(ctx.context) : null;

  const humanPromptParts = [
    missionText ??
      'Execute a tarefa de acordo com o seu system prompt — nenhuma instrução adicional foi informada nesta chamada.',
  ];
  if (resourceJson) humanPromptParts.push(`Dados de recurso (JSON):\n${resourceJson}`);
  if (contextJson) humanPromptParts.push(`Contexto adicional (JSON):\n${contextJson}`);

  const model = getAiModel('local-llama3', 0.4, `agent.execute:${ctx.agentCode}`);
  const result = await model.invoke([
    new SystemMessage(ctx.agentVersion.systemPrompt),
    new HumanMessage(humanPromptParts.join('\n\n')),
  ]);

  return {
    summary: result.content,
    facts: [],
    metrics: {
      promptTokens: result.response_metadata.tokenUsage.promptTokens,
      completionTokens: result.response_metadata.tokenUsage.completionTokens,
      totalTokens: result.response_metadata.tokenUsage.totalTokens,
    },
    evidence: [
      `AgentVersion.id=${ctx.agentVersion.id} version=${ctx.agentVersion.version}`,
      `AiModel.model=${result.response_metadata.model}`,
    ],
    missingData: [],
    raw: { model: result.response_metadata.model },
  };
};

// ─── SDR/Closer (agentes reais de LangGraph — já em produção) ──────────────────────────────────
// Diferente dos demais executores (função pura ou use case síncrono com retorno estruturado),
// estes dois chamam agentes de IA reais já em produção no Enxame (BaseAgent/LangGraph, tenant lido
// de `getTenantId()` via async-context — por isso não recebem `organizationId` como parâmetro).
// O retorno deles é `{success, sessionId}` (ver `base.agent.ts`/`sdrQualification.agent.ts`), não
// o contrato rico de facts/evidence — o resultado completo (mensagens, tool calls) continua vivo
// em `AgentMemory` (`GET /agents/sdr/status/:sessionId`, já existente), nunca duplicado aqui.
// Nunca invocados nesta onda em `SUCCEEDED`: `lead.qualify`/`deal.analyze` são MEDIUM/LOW mas o
// caminho síncrono de request/response do Agent Runtime não é adequado para uma execução
// LangGraph de vários segundos com chamada de LLM real — registrados aqui para completude do
// registry (regra "somente executores comprovados", e o binding É real/VERIFIED), com aviso
// explícito em `missingData` de que a execução completa acontece de forma assíncrona.
interface SDRQualificationContract {
  run(
    leadId: string,
    sessionId?: string,
    instruction?: string,
  ): Promise<{ success: boolean; sessionId?: string; error?: string }>;
}
interface CloserAgentContract {
  run(
    inputData: string,
    sessionId?: string,
  ): Promise<{ success: boolean; sessionId?: string; error?: string }>;
}

const leadQualify: ToolExecutor = async (ctx) => {
  const leadId = requireStr(ctx.resource, 'leadId');
  const agent = container.resolve<SDRQualificationContract>('SDRQualificationAgent');
  const result = await agent.run(leadId, undefined, ctx.mission);
  return {
    summary: result.success
      ? `Qualificação do lead ${leadId} iniciada — acompanhe em AgentMemory (sessionId=${result.sessionId}).`
      : `Qualificação do lead ${leadId} falhou: ${result.error ?? 'motivo desconhecido'}.`,
    facts: [],
    metrics: {},
    evidence: result.sessionId ? [`AgentMemory.sessionId=${result.sessionId}`] : [],
    missingData: [
      'Resultado completo (mensagens/tool calls) vive em AgentMemory, não neste registro.',
    ],
    raw: result,
  };
};

const dealAnalyze: ToolExecutor = async (ctx) => {
  const leadId = requireStr(ctx.resource, 'leadId');
  const instruction = ctx.mission ? `${leadId}\n\n${ctx.mission}` : leadId;
  const agent = container.resolve<CloserAgentContract>('CloserAgent');
  const result = await agent.run(instruction);
  return {
    summary: result.success
      ? `Análise de negociação ${leadId} iniciada — acompanhe em AgentMemory (sessionId=${result.sessionId}).`
      : `Análise da negociação ${leadId} falhou: ${result.error ?? 'motivo desconhecido'}.`,
    facts: [],
    metrics: {},
    evidence: result.sessionId ? [`AgentMemory.sessionId=${result.sessionId}`] : [],
    missingData: [
      'Resultado completo (mensagens/tool calls) vive em AgentMemory, não neste registro.',
    ],
    raw: result,
  };
};

/** Registry final — chave é sempre um `CapabilityDefinition.code` com `ToolBinding.verification
 *  === 'VERIFIED'` (tool-bindings.ts). Nunca contém entrada para capability SOURCE_REQUIRED/
 *  FUTURE_TOOL/TOOL_UNAVAILABLE — essas nunca alcançam a etapa de execução
 *  (`capabilityAuthorization.service.ts` já nega antes). */
export const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  'lead.read': leadRead,
  'lead.search': leadSearch,
  'lead.enrich': leadEnrich,
  'lead.qualify': leadQualify,
  'lead.update': leadUpdate,
  'company.read': companyRead,
  'company.search': companySearch,
  'meeting.analyze': meetingAnalyze,
  'meeting.schedule': meetingSchedule,
  'deal.read': leadRead,
  'deal.analyze': dealAnalyze,
  'deal.update': leadUpdate,
  'deal.move_stage': dealMoveStage,
  'pipeline.read': pipelineRead,
  'pipeline.analyze': pipelineAnalyze,
  'forecast.read': forecastRead,
  'forecast.explain': forecastExplain,
  'knowledge.search': knowledgeSearch,
  'contract.read': contractRead,
  'bitrix.read': bitrixRead,
  'bitrix.write': bitrixWrite,
  'bitrix.configure': bitrixConfigure,
  'agent.discover': agentDiscover,
  'agent.execute': agentExecute,
};

export function getToolExecutor(capabilityCode: string): ToolExecutor | undefined {
  return TOOL_EXECUTORS[capabilityCode];
}
