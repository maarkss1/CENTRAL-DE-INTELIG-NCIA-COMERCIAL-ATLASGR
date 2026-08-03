import { env } from '../../../config/env.js';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { requestContext } from '../../../lib/async-context.js';
import { SwarmOrchestrator } from '../agents/supervisor.agent.js';

const CLOSED_STATUSES: Array<'Fechado_Ganho' | 'Fechado_Perdido'> = ['Fechado_Ganho', 'Fechado_Perdido'];
/** Só sinais recentes contam como gatilho — uma conversa "quente" de duas semanas atrás já esfriou. */
const SIGNAL_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const SCAN_LIMIT = 50;

const PENDING_ACTION_TYPE = 'swarm_recommendation';

export type SwarmTriggerReason = 'due_follow_up' | 'conversation_signal';

export interface SwarmSchedulerRunResult {
    organizationId: string;
    scanned: number;
    proposed: number;
    skippedAlreadyPending: number;
    errors: number;
}

interface Candidate {
    leadId: string;
    reason: SwarmTriggerReason;
    detail: string;
}

/**
 * Organizações autorizadas a receber execução autônoma do enxame.
 *
 * Fail-closed por desenho, mesmo padrão de `enabledOrganizations()` em coldCall.service.ts: lista
 * explícita de ids, e não um booleano global — habilitar por engano precisa ser difícil.
 */
export function enabledOrganizations(): string[] {
    if (!env.SWARM_SCHEDULER_ENABLED) return [];
    return (env.SWARM_SCHEDULER_ORGANIZATIONS ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
}

/** Leads com follow-up vencido — o próprio propósito do campo `nextAction`. */
async function findDueFollowUps(organizationId: string, now: Date): Promise<Candidate[]> {
    const leads = await prisma.lead.findMany({
        where: {
            organizationId,
            status: { notIn: CLOSED_STATUSES },
            nextAction: { lte: now },
        },
        orderBy: { nextAction: 'asc' },
        take: SCAN_LIMIT,
        select: { id: true, nextAction: true },
    });
    return leads.map((lead) => ({
        leadId: lead.id,
        reason: 'due_follow_up' as const,
        detail: `Follow-up estava agendado para ${lead.nextAction?.toLocaleDateString('pt-BR')} e ainda não foi feito.`,
    }));
}

/** Leads com sinal de conversa recente (WhatsApp) indicando alta intenção/urgência — ver conversation-intelligence.service.ts. */
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
        select: { leadId: true, intent: true, urgency: true, summary: true },
    });
    return signals.map((signal) => ({
        leadId: signal.leadId,
        reason: 'conversation_signal' as const,
        detail: `Sinal de conversa (WhatsApp): intenção "${signal.intent ?? 'não classificada'}", urgência "${signal.urgency ?? 'não classificada'}". ${signal.summary ?? ''}`.trim(),
    }));
}

function buildMission(detail: string): string {
    return `Um lead precisa de atenção agora, sem que um humano tenha pedido explicitamente: ${detail} Avalie o contexto real deste lead no CRM e recomende objetivamente o próximo passo — não invente dados que não existem no sistema.`;
}

/**
 * Roda o enxame de forma autônoma para uma organização: encontra leads que precisam de atenção
 * (follow-up vencido, ou sinal de conversa recente de alta intenção/urgência), executa a missão do
 * SwarmOrchestrator para cada um e grava a síntese como uma AIPendingAction — nunca executa nada
 * diretamente. Um humano ainda decide se a recomendação vira ação real (ver aiPendingAction.service.ts).
 *
 * Não lança: uma falha em um lead não pode interromper os demais da mesma rodada.
 */
export async function runSwarmScheduler(organizationId: string, now: Date = new Date()): Promise<SwarmSchedulerRunResult> {
    const result: SwarmSchedulerRunResult = {
        organizationId,
        scanned: 0,
        proposed: 0,
        skippedAlreadyPending: 0,
        errors: 0,
    };

    // O worker roda fora de uma requisição HTTP — nada preencheria o tenant que a RLS exige.
    return requestContext.run({ tenantId: organizationId }, async () => {
        const [dueFollowUps, signaledLeads] = await Promise.all([
            findDueFollowUps(organizationId, now),
            findSignaledLeads(organizationId, now),
        ]);

        // Um lead pode aparecer nas duas listas — o sinal de conversa é mais específico/urgente
        // que um follow-up vencido genérico, então ele vence quando os dois batem no mesmo lead.
        const byLead = new Map<string, Candidate>();
        for (const candidate of dueFollowUps) byLead.set(candidate.leadId, candidate);
        for (const candidate of signaledLeads) byLead.set(candidate.leadId, candidate);

        const candidates = Array.from(byLead.values()).slice(0, env.SWARM_SCHEDULER_MAX_LEADS_PER_RUN);
        result.scanned = candidates.length;

        for (const candidate of candidates) {
            try {
                const alreadyPending = await prisma.aIPendingAction.findFirst({
                    where: {
                        organizationId,
                        action: PENDING_ACTION_TYPE,
                        approved: false,
                        payload: { path: ['leadId'], equals: candidate.leadId },
                    },
                    select: { id: true },
                });
                if (alreadyPending) {
                    result.skippedAlreadyPending++;
                    continue;
                }

                const mission = buildMission(candidate.detail);
                const swarm = new SwarmOrchestrator();
                const messages = await swarm.executeMission(mission, `swarm-auto-${candidate.leadId}-${now.getTime()}`, candidate.leadId);
                const synthesis = messages[messages.length - 1]?.content;
                const synthesisText = typeof synthesis === 'string' ? synthesis : JSON.stringify(synthesis);

                await prisma.aIPendingAction.create({
                    data: {
                        entity: 'Lead',
                        action: PENDING_ACTION_TYPE,
                        organizationId,
                        payload: {
                            leadId: candidate.leadId,
                            trigger: candidate.reason,
                            triggerDetail: candidate.detail,
                            mission,
                            synthesis: synthesisText,
                        },
                    },
                });
                result.proposed++;
            } catch (error) {
                result.errors++;
                logger.error({ err: error, organizationId, leadId: candidate.leadId }, 'Falha ao executar o enxame autônomo para um lead.');
            }
        }

        logger.info({ ...result }, 'Enxame autônomo executado.');
        return result;
    });
}
