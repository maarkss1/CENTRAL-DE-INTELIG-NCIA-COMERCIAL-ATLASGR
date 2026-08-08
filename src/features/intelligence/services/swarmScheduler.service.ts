import type { LeadStatus } from '@prisma/client';
import { env } from '../../../config/env.js';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { requestContext } from '../../../lib/async-context.js';
import { enqueueSdrOutboundDraft } from '../../../lib/queue/agent.worker.js';
import { isWithinCallWindow } from '../../integrations/birth-voice/coldCall.policy.js';
import { runAutonomyRole, type AutonomyRole } from './autonomyRoleRunner.service.js';

const CLOSED_STATUSES: LeadStatus[] = ['Negocios_Ganhos', 'Negocios_Perdidos', 'Lead_Desqualificado'];
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
        const orgs = await prisma.organization.findMany({ select: { id: true } });
        return orgs.map((organization) => organization.id);
    }
    return rawOrgs.split(',').map((id) => id.trim()).filter(Boolean);
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
            OR: [
                { intent: { in: ['alta_intencao_compra', 'objecao_preco'] } },
                { urgency: 'alta' },
            ],
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
        detail: `WhatsApp sinalizou intenção "${signal.intent ?? 'não classificada'}", urgência "${signal.urgency ?? 'não classificada'}". ${signal.summary ?? ''}`.trim(),
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
                { status: { in: EARLY_STATUSES }, score: { gte: env.SWARM_AUTONOMOUS_MIN_SCORE }, nextAction: null },
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
        if (EARLY_STATUSES.includes(lead.status) && (lead.score ?? -1) >= env.SWARM_AUTONOMOUS_MIN_SCORE && !lead.nextAction) {
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
    const roleInstruction = candidate.role === 'CLOSER'
        ? 'Atue como Closer: trate o risco de decisão/objeção e defina o próximo compromisso de fechamento.'
        : candidate.role === 'BDR'
            ? 'Atue como BDR: avalie o fit e defina uma abordagem inicial específica, curta e verificável.'
            : 'Atue como gestor de CRM: avalie o risco e recomende a próxima ação com responsável e prazo.';
    return `${roleInstruction}\n\nGatilho detectado automaticamente: ${candidate.detail}\nNão invente fatos e não execute comunicação externa nesta etapa; produza uma recomendação auditável.`;
}

function shouldDraftFirstContact(candidate: Candidate): boolean {
    return candidate.hasEmail && (candidate.reason === 'new_lead_untouched' || candidate.reason === 'high_score_unworked');
}

async function queueOutboundIfEligible(candidate: Candidate, organizationId: string, now: Date): Promise<{ queued: boolean; autoExecute: boolean }> {
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

    const autoExecute = env.SWARM_AUTONOMY_MODE === 'full'
        && withinWindow
        && (candidate.score ?? 0) >= env.SWARM_AUTONOMOUS_MIN_SCORE;
    await enqueueSdrOutboundDraft(candidate.leadId, organizationId, autoExecute);
    return { queued: true, autoExecute };
}

/**
 * Uma rodada do piloto automático comercial. A análise por papel é read-only; o SDR outbound gera
 * uma ação tipada no ledger e só envia em modo full após todas as travas. Falhas são isoladas por
 * lead para que a operação continue 24/7.
 */
export async function runSwarmScheduler(organizationId: string, now: Date = new Date()): Promise<SwarmSchedulerRunResult> {
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
            if (!current || candidate.priority > current.priority) byLead.set(candidate.leadId, candidate);
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
                        riskLevel: candidate.reason === 'conversation_signal' || candidate.reason === 'stalled_proposal' ? 'high' : 'medium',
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
                logger.error({ err: error, organizationId, leadId: candidate.leadId }, 'Falha no piloto automático comercial para um lead.');
            }
        }

        logger.info({ ...result, autonomyMode: env.SWARM_AUTONOMY_MODE }, 'Piloto automático comercial executado.');
        return result;
    });
}
