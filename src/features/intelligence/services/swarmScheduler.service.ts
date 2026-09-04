import type { LeadStatus } from '@prisma/client';
import { env } from '../../../config/env.js';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { requestContext } from '../../../lib/async-context.js';
import { enqueueSdrOutboundDraft } from '../../../lib/queue/agent.worker.js';
import { isWithinCallWindow } from '../../integrations/birth-voice/coldCall.policy.js';
import { runAutonomyRole, type AutonomyRole } from './autonomyRoleRunner.service.js';

const CLOSED_STATUSES: LeadStatus[] = [
  'Negocios_Ganhos',
  'Negocios_Perdidos',
  'Lead_Desqualificado',
];
const EARLY_STATUSES: LeadStatus[] = ['Lead_Recebido', 'Cadencia_Iniciada'];
const CLOSER_STATUSES: LeadStatus[] = [
  'Convertido_em_Oportunidade',
  'Nova_Oportunidade',
  'Proposta_Enviada',
  'Call_Visita_Agendada',
  'Piloto_VTECH',
  'Piloto_Atlas_Profile',
  'Piloto_Atlas_Profile_Concluido',
  'Piloto_Logistica',
  'Piloto_Logistico_Concluido',
];
const SIGNAL_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const SCAN_LIMIT = 80;
const PENDING_ACTION_TYPE = 'swarm_recommendation';

export type SwarmTriggerReason =
  | 'conversation_signal'
  | 'stalled_proposal'
  | 'due_follow_up'
  | 'high_score_unworked'
  | 'stale_pipeline'
  | 'new_lead_untouched';

export interface SwarmSchedulerRunResult {
  organizationId: string;
  scanned: number;
  proposed: number;
  outboundDraftsQueued: number;
  autoExecutionEligible: number;
  skippedAlreadyPending: number;
  errors: number;
}

interface Candidate {
  leadId: string;
  reason: SwarmTriggerReason;
  role: AutonomyRole;
  detail: string;
  status: LeadStatus;
  score: number | null;
  hasEmail: boolean;
  confidence: number | null;
  priority: number;
}

function hoursBefore(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

function roleForStatus(status: LeadStatus): AutonomyRole {
  if (CLOSER_STATUSES.includes(status)) return 'CLOSER';
  if (EARLY_STATUSES.includes(status)) return 'BDR';
  return 'CRM';
}

function normalizedConfidence(score: number | null | undefined, fallback = 0.65): number {
  return score == null ? fallback : Math.max(0, Math.min(1, score / 100));
}

/** Organizações autorizadas, com opt-in duplo e comportamento fail-closed. */
export async function enabledOrganizations(): Promise<string[]> {
  if (!env.SWARM_SCHEDULER_ENABLED) return [];
  const rawOrgs = (env.SWARM_SCHEDULER_ORGANIZATIONS ?? '').trim();
  if (!rawOrgs) return [];
  if (rawOrgs === '*' || rawOrgs === 'all') {
    // Achado real de finalização (2026-09-04): sem contexto de RLS, `Organization` (sob FORCE ROW
    // LEVEL SECURITY, migration 20260722020322_enable_rls) nega a leitura por completo — esta
    // chamada devolvia SEMPRE 0 organizações, então `SWARM_SCHEDULER_ORGANIZATIONS=*` nunca
    // habilitava o swarm scheduler pra ninguém (fail-closed por acidente, não pela trava
    // fail-closed documentada acima). `Organization` está no allowlist de bypass
    // (BYPASS_RLS_ALLOWED_MODELS, src/lib/prisma.ts) exatamente para esta descoberta inicial.
    const orgs = await requestContext.run({ bypassRls: true }, () =>
      prisma.organization.findMany({ select: { id: true } }),
    );
    return orgs.map((organization) => organization.id);
  }
  return rawOrgs
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

async function findDueFollowUps(organizationId: string, now: Date): Promise<Candidate[]> {
  const leads = await prisma.lead.findMany({
    where: {
      organizationId,
      status: { notIn: CLOSED_STATUSES },
      nextAction: { lte: now },
    },
    orderBy: { nextAction: 'asc' },
    take: SCAN_LIMIT,
    select: {
      id: true,
      status: true,
      score: true,
      nextAction: true,
      contact: { select: { email: true } },
    },
  });
  return leads.map((lead) => ({
    leadId: lead.id,
    reason: 'due_follow_up',
    role: roleForStatus(lead.status),
    status: lead.status,
    score: lead.score,
    hasEmail: Boolean(lead.contact?.email),
    confidence: normalizedConfidence(lead.score),
    priority: 80,
    detail: `Follow-up vencido em ${lead.nextAction?.toLocaleString('pt-BR')}; status atual ${lead.status}; score ${lead.score ?? 'não calculado'}.`,
  }));
}

async function findSignaledLeads(organizationId: string, now: Date): Promise<Candidate[]> {
  const signals = await prisma.conversationSignal.findMany({
    where: {
      organizationId,
      createdAt: { gte: new Date(now.getTime() - SIGNAL_LOOKBACK_MS) },
      OR: [{ intent: { in: ['alta_intencao_compra', 'objecao_preco'] } }, { urgency: 'alta' }],
    },
    orderBy: { createdAt: 'desc' },
    distinct: ['leadId'],
    take: SCAN_LIMIT,
    select: {
      leadId: true,
      intent: true,
      urgency: true,
      summary: true,
      confidence: true,
      lead: {
        select: {
          status: true,
          score: true,
          contact: { select: { email: true } },
        },
      },
    },
  });
  return signals.map((signal) => ({
    leadId: signal.leadId,
    reason: 'conversation_signal',
    role: roleForStatus(signal.lead.status),
    status: signal.lead.status,
    score: signal.lead.score,
    hasEmail: Boolean(signal.lead.contact?.email),
    confidence: signal.confidence ?? normalizedConfidence(signal.lead.score, 0.75),
    priority: 100,
    detail:
      `WhatsApp sinalizou intenção "${signal.intent ?? 'não classificada'}", urgência "${signal.urgency ?? 'não classificada'}". ${signal.summary ?? ''}`.trim(),
  }));
}

/** Detecta trabalho que não depende de nextAction: topo abandonado, alto fit e deals estagnados. */
async function findPipelineCandidates(organizationId: string, now: Date): Promise<Candidate[]> {
  const newLeadCutoff = new Date(now.getTime() - env.SWARM_NEW_LEAD_GRACE_MINUTES * 60 * 1000);
  const staleCutoff = hoursBefore(now, env.SWARM_STALE_PIPELINE_HOURS);
  const proposalCutoff = hoursBefore(now, env.SWARM_STALE_PROPOSAL_HOURS);

  const leads = await prisma.lead.findMany({
    where: {
      organizationId,
      status: { notIn: CLOSED_STATUSES },
      OR: [
        { status: 'Lead_Recebido', createdAt: { lte: newLeadCutoff }, lastInteraction: null },
        {
          status: { in: EARLY_STATUSES },
          score: { gte: env.SWARM_AUTONOMOUS_MIN_SCORE },
          nextAction: null,
        },
        { status: 'Proposta_Enviada', updatedAt: { lte: proposalCutoff } },
        {
          status: { in: CLOSER_STATUSES.filter((status) => status !== 'Proposta_Enviada') },
          OR: [
            { lastInteraction: { lte: staleCutoff } },
            { lastInteraction: null, updatedAt: { lte: staleCutoff } },
          ],
        },
      ],
    },
    orderBy: { updatedAt: 'asc' },
    take: SCAN_LIMIT,
    select: {
      id: true,
      status: true,
      score: true,
      createdAt: true,
      updatedAt: true,
      lastInteraction: true,
      nextAction: true,
      company: { select: { tradeName: true, segment: true, size: true } },
      contact: { select: { email: true, emailStatus: true, role: true } },
    },
  });

  return leads.map((lead): Candidate => {
    const common = `Empresa ${lead.company?.tradeName ?? 'não identificada'}; segmento ${lead.company?.segment ?? 'não informado'}; porte ${lead.company?.size ?? 'não informado'}; decisor ${lead.contact?.role ?? 'não identificado'}; status ${lead.status}; score ${lead.score ?? 'não calculado'}.`;
    if (lead.status === 'Proposta_Enviada') {
      return {
        leadId: lead.id,
        reason: 'stalled_proposal',
        role: 'CLOSER',
        status: lead.status,
        score: lead.score,
        hasEmail: Boolean(lead.contact?.email),
        confidence: normalizedConfidence(lead.score, 0.75),
        priority: 90,
        detail: `Proposta sem avanço desde ${lead.updatedAt.toLocaleString('pt-BR')}. ${common}`,
      };
    }
    if (
      EARLY_STATUSES.includes(lead.status) &&
      (lead.score ?? -1) >= env.SWARM_AUTONOMOUS_MIN_SCORE &&
      !lead.nextAction
    ) {
      return {
        leadId: lead.id,
        reason: 'high_score_unworked',
        role: 'BDR',
        status: lead.status,
        score: lead.score,
        hasEmail: Boolean(lead.contact?.email),
        confidence: normalizedConfidence(lead.score),
        priority: 70,
        detail: `Lead de alto fit sem próxima ação programada. ${common}`,
      };
    }
    if (lead.status === 'Lead_Recebido') {
      return {
        leadId: lead.id,
        reason: 'new_lead_untouched',
        role: 'BDR',
        status: lead.status,
        score: lead.score,
        hasEmail: Boolean(lead.contact?.email),
        confidence: normalizedConfidence(lead.score, 0.6),
        priority: 50,
        detail: `Novo lead sem primeira interação desde ${lead.createdAt.toLocaleString('pt-BR')}. ${common}`,
      };
    }
    return {
      leadId: lead.id,
      reason: 'stale_pipeline',
      role: 'CLOSER',
      status: lead.status,
      score: lead.score,
      hasEmail: Boolean(lead.contact?.email),
      confidence: normalizedConfidence(lead.score, 0.7),
      priority: 60,
      detail: `Oportunidade estagnada; última interação ${lead.lastInteraction?.toLocaleString('pt-BR') ?? 'não registrada'}. ${common}`,
    };
  });
}

function buildMission(candidate: Candidate): string {
  const roleInstruction =
    candidate.role === 'CLOSER'
      ? 'Atue como Closer: trate o risco de decisão/objeção e defina o próximo compromisso de fechamento.'
      : candidate.role === 'BDR'
        ? 'Atue como BDR: avalie o fit e defina uma abordagem inicial específica, curta e verificável.'
        : 'Atue como gestor de CRM: avalie o risco e recomende a próxima ação com responsável e prazo.';
  return `${roleInstruction}\n\nGatilho detectado automaticamente: ${candidate.detail}\nNão invente fatos e não execute comunicação externa nesta etapa; produza uma recomendação auditável.`;
}

function shouldDraftFirstContact(candidate: Candidate): boolean {
  return (
    candidate.hasEmail &&
    (candidate.reason === 'new_lead_untouched' || candidate.reason === 'high_score_unworked')
  );
}

async function queueOutboundIfEligible(
  candidate: Candidate,
  organizationId: string,
  now: Date,
): Promise<{ queued: boolean; autoExecute: boolean }> {
  if (!shouldDraftFirstContact(candidate)) return { queued: false, autoExecute: false };

  const withinWindow = isWithinCallWindow(now, {
    startHour: env.SDR_CALL_WINDOW_START,
    endHour: env.SDR_CALL_WINDOW_END,
    weekdaysOnly: true,
    timeZone: env.SDR_CALL_TIMEZONE,
  });
  // No modo full esperamos a janela comercial para criar o job. Assim ele não vira um rascunho
  // manual às 2h e perde a chance de ser autoexecutado quando a janela abrir.
  if (env.SWARM_AUTONOMY_MODE === 'full' && !withinWindow) {
    return { queued: false, autoExecute: false };
  }

  const autoExecute =
    env.SWARM_AUTONOMY_MODE === 'full' &&
    withinWindow &&
    (candidate.score ?? 0) >= env.SWARM_AUTONOMOUS_MIN_SCORE;
  await enqueueSdrOutboundDraft(candidate.leadId, organizationId, autoExecute);
  return { queued: true, autoExecute };
}

/**
 * Uma rodada do piloto automático comercial. A análise por papel é read-only; o SDR outbound gera
 * uma ação tipada no ledger e só envia em modo full após todas as travas. Falhas são isoladas por
 * lead para que a operação continue 24/7.
 */
export async function runSwarmScheduler(
  organizationId: string,
  now: Date = new Date(),
): Promise<SwarmSchedulerRunResult> {
  const result: SwarmSchedulerRunResult = {
    organizationId,
    scanned: 0,
    proposed: 0,
    outboundDraftsQueued: 0,
    autoExecutionEligible: 0,
    skippedAlreadyPending: 0,
    errors: 0,
  };

  return requestContext.run({ tenantId: organizationId }, async () => {
    const [dueFollowUps, signaledLeads, pipelineCandidates] = await Promise.all([
      findDueFollowUps(organizationId, now),
      findSignaledLeads(organizationId, now),
      findPipelineCandidates(organizationId, now),
    ]);

    const byLead = new Map<string, Candidate>();
    for (const candidate of [...pipelineCandidates, ...dueFollowUps, ...signaledLeads]) {
      const current = byLead.get(candidate.leadId);
      if (!current || candidate.priority > current.priority)
        byLead.set(candidate.leadId, candidate);
    }

    const candidates = Array.from(byLead.values())
      .sort((left, right) => right.priority - left.priority)
      .slice(0, env.SWARM_SCHEDULER_MAX_LEADS_PER_RUN);
    result.scanned = candidates.length;

    const recentCutoff = hoursBefore(now, env.SWARM_RECOMMENDATION_COOLDOWN_HOURS);
    const bucketMs = env.SWARM_RECOMMENDATION_COOLDOWN_HOURS * 60 * 60 * 1000;

    for (const candidate of candidates) {
      try {
        const outbound = await queueOutboundIfEligible(candidate, organizationId, now);
        if (outbound.queued) result.outboundDraftsQueued++;
        if (outbound.autoExecute) result.autoExecutionEligible++;

        const alreadyPending = await prisma.aIPendingAction.findFirst({
          where: {
            organizationId,
            action: PENDING_ACTION_TYPE,
            discardedAt: null,
            createdAt: { gte: recentCutoff },
            payload: { path: ['leadId'], equals: candidate.leadId },
          },
          select: { id: true },
        });
        if (alreadyPending) {
          result.skippedAlreadyPending++;
          continue;
        }

        const mission = buildMission(candidate);
        const synthesis = await runAutonomyRole(
          candidate.role,
          mission,
          `autonomy-${candidate.role.toLowerCase()}-${candidate.leadId}-${now.getTime()}`,
        );
        const timeBucket = Math.floor(now.getTime() / bucketMs);

        await prisma.aIPendingAction.create({
          data: {
            entity: 'Lead',
            action: PENDING_ACTION_TYPE,
            agentRole: candidate.role,
            riskLevel:
              candidate.reason === 'conversation_signal' || candidate.reason === 'stalled_proposal'
                ? 'high'
                : 'medium',
            confidence: candidate.confidence,
            idempotencyKey: `recommendation:${candidate.leadId}:${candidate.reason}:${timeBucket}`,
            organizationId,
            payload: {
              leadId: candidate.leadId,
              trigger: candidate.reason,
              triggerDetail: candidate.detail,
              role: candidate.role,
              status: candidate.status,
              score: candidate.score,
              mission,
              synthesis,
            },
          },
        });
        result.proposed++;
      } catch (error) {
        result.errors++;
        logger.error(
          { err: error, organizationId, leadId: candidate.leadId },
          'Falha no piloto automático comercial para um lead.',
        );
      }
    }

    logger.info(
      { ...result, autonomyMode: env.SWARM_AUTONOMY_MODE },
      'Piloto automático comercial executado.',
    );
    return result;
  });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Painel de SLO por agente — AUTONOMIA_COMERCIAL_24X7.md pede, na seção final, um "painel de SLO
// por agente: cobertura, conversão, custo, latência, erro e override humano". Nunca foi
// implementado (ver .agents/completion/02-mapa-plataforma.md §7.5). Esta função é a fonte de
// dados real — consumida pela aba "SLO" de SwarmDashboard.tsx via uma rota que o Agente 07 expõe
// (ver handoff .agents/handoffs/onda-7/13-para-07-rota-slo-swarm.md), nunca por número inventado.
//
// Fontes e por que cada métrica vem de onde vem:
//  - `AIPendingAction.agentRole` é o ÚNICO campo do schema que atribui uma decisão a um papel do
//    enxame (SDR/BDR/CLOSER/CRM/OPS) — cobertura, conversão, override humano e taxa de erro vêm
//    daqui, por papel, dentro da janela pedida.
//  - `AILog` tem custo/tokens/latência reais, mas NÃO tem coluna que amarre um registro a um
//    agentRole (só a `model` e a `organizationId`, opcional) — por isso custo e latência de
//    geração aparecem agregados por ORGANIZAÇÃO, nunca fatiados por agente. Fatiar por agente
//    exigiria uma migração de schema (fora do meu escopo: `prisma/schema.prisma` é do Agente 01) —
//    documentado como lacuna explícita no snapshot, não estimado.
//  - GOV-13 (Agente 13): "OPS" passou a registrar `AIPendingAction` (`action: 'create_follow_up'`/
//    `'notify_team'`, `agentRole: 'OPS'`) como os demais papéis — `create_follow_up_task`/
//    `notify_team` (`agents/opsPendingActions.tool.ts`) não executam mais o efeito real
//    diretamente, só propõem, e a execução real só acontece após aprovação humana (mesmo fluxo de
//    `send_email`/`swarm_recommendation`). O caso especial que antes retornava um estado vazio
//    fixo para OPS foi removido: OPS agora entra no mesmo cálculo genérico das outras linhas, e um
//    estado vazio (`value: null`) só aparece quando a janela realmente não tem base suficiente,
//    igual às demais.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const SLO_SWARM_ROLES = ['SDR', 'BDR', 'CLOSER', 'CRM', 'OPS'] as const;
export type SloSwarmRole = (typeof SLO_SWARM_ROLES)[number];

/** Uma taxa (0–1) só existe quando há base para calculá-la — nunca 0% fabricado sobre 0/0. */
export interface SloRate {
  value: number | null;
  numerator: number;
  denominator: number;
  /** Presente somente quando `value` é `null`: por que a base não sustenta este número ainda. */
  emptyReason?: string;
}

export interface AgentSloMetrics {
  role: SloSwarmRole;
  /** Quantas decisões/recomendações este papel produziu na janela (sempre um número real, 0 incluso). */
  coverage: number;
  /** executed / total propostas — quanto da recomendação do agente virou ação de fato. */
  conversion: SloRate;
  /** discardedAt / (approved ou discardedAt) — quanto um humano rejeitou o que a IA recomendou. */
  humanOverride: SloRate;
  /** executionError / tentativas de execução — falha operacional, não "a IA errou a análise". */
  errorRate: SloRate;
  /** Latência OPERACIONAL média (proposta → execução), em ms — não é latência de geração do modelo. */
  avgExecutionLatencyMs: number | null;
  /** Motivo explícito quando a linha inteira não tem dado suficiente (ex.: OPS não usa o ledger). */
  dataSourceNote?: string;
}

export interface SwarmCostSnapshot {
  windowDays: number;
  totalCostUsd: number;
  totalTokens: number;
  requestCount: number;
  avgLatencyMs: number | null;
  /** Sempre presente: custo/latência do AILog não são atribuíveis a um agente específico hoje. */
  note: string;
}

export interface SwarmSloSnapshot {
  organizationId: string;
  windowDays: number;
  generatedAt: string;
  agents: AgentSloMetrics[];
  cost: SwarmCostSnapshot;
}

/** Exportado para reuso por evaluationMetrics.service.ts (AI-006) — mesmo padrão de taxa honesta. */
export function emptyRate(numerator: number, denominator: number, emptyReason: string): SloRate {
  if (denominator === 0) return { value: null, numerator, denominator, emptyReason };
  return { value: numerator / denominator, numerator, denominator };
}

/**
 * Snapshot de SLO por agente para uma organização, na janela solicitada (padrão 30 dias).
 * Nunca fabrica número: toda métrica sem base suficiente vem como estado vazio explícito
 * (`value: null` + `emptyReason`), nunca como 0% ou latência inventada.
 */
export async function getSwarmSloSnapshot(
  organizationId: string,
  windowDays = 30,
  now: Date = new Date(),
): Promise<SwarmSloSnapshot> {
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const [pendingActions, aiLogAggregate] = await Promise.all([
    prisma.aIPendingAction.findMany({
      where: { organizationId, createdAt: { gte: since } },
      select: {
        agentRole: true,
        approved: true,
        discardedAt: true,
        executed: true,
        executedAt: true,
        executionError: true,
        attempts: true,
        createdAt: true,
      },
    }),
    prisma.aILog.aggregate({
      where: { organizationId, createdAt: { gte: since } },
      _sum: { cost: true, tokens: true },
      _avg: { latencyMs: true },
      _count: { _all: true },
    }),
  ]);

  const agents: AgentSloMetrics[] = SLO_SWARM_ROLES.map((role) => {
    const rows = pendingActions.filter((row) => (row.agentRole ?? '').toUpperCase() === role);
    const coverage = rows.length;

    const executedRows = rows.filter((row) => row.executed);
    const conversion = emptyRate(
      executedRows.length,
      coverage,
      'Nenhuma recomendação registrada para este agente na janela selecionada.',
    );

    const reviewedRows = rows.filter((row) => row.approved || row.discardedAt);
    const humanOverride = emptyRate(
      rows.filter((row) => row.discardedAt).length,
      reviewedRows.length,
      'Nenhuma decisão deste agente foi aprovada ou descartada por um humano ainda nesta janela.',
    );

    const attemptedRows = rows.filter((row) => row.attempts > 0);
    const errorRate = emptyRate(
      attemptedRows.filter((row) => row.executionError).length,
      attemptedRows.length,
      'Nenhuma execução foi tentada para este agente ainda nesta janela.',
    );

    const executionLatencies = executedRows
      .filter((row) => row.executedAt)
      .map((row) => row.executedAt!.getTime() - row.createdAt.getTime());
    const avgExecutionLatencyMs =
      executionLatencies.length > 0
        ? executionLatencies.reduce((sum, ms) => sum + ms, 0) / executionLatencies.length
        : null;

    return { role, coverage, conversion, humanOverride, errorRate, avgExecutionLatencyMs };
  });

  return {
    organizationId,
    windowDays,
    generatedAt: now.toISOString(),
    agents,
    cost: {
      windowDays,
      totalCostUsd: aiLogAggregate._sum.cost ?? 0,
      totalTokens: aiLogAggregate._sum.tokens ?? 0,
      requestCount: aiLogAggregate._count._all,
      avgLatencyMs: aiLogAggregate._avg.latencyMs ?? null,
      note: 'Custo/latência agregados da organização inteira (AILog não referencia qual agente originou cada chamada) — não fatiado por agente até que o schema seja estendido.',
    },
  };
}
