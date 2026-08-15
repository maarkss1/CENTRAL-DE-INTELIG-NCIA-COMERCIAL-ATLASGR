import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Prova, uma trava por vez, as 7 condições simultâneas exigidas por AUTONOMIA_COMERCIAL_24X7.md
 * para o modo `full` autoexecutar o primeiro e-mail sem clique humano:
 *   1. organização autorizada
 *   2. modo é `full`
 *   3. lead tem e-mail
 *   4. score >= SWARM_AUTONOMOUS_MIN_SCORE
 *   5. dentro da janela comercial e não é fim de semana
 *   6. SMTP configurado
 *   7. a ação ainda não existe para o lead (idempotência)
 *
 * Cada teste muda SÓ a condição sob prova, mantendo as demais favoráveis — provando isoladamente
 * que a ausência de QUALQUER UMA basta para impedir a autoexecução (o job pode continuar sendo
 * ENFILEIRADO como rascunho supervisionado; o que nunca pode acontecer é o envio sem revisão).
 *
 * Travas 1 e 6 são cobertas em arquivos próprios (mais próximos da implementação real):
 *   - trava 1 (organização autorizada): tests/unit/lib/queue/swarmScheduler.worker.test.ts
 *     + describe('enabledOrganizations') em swarmScheduler.service.test.ts.
 *   - trava 6 (SMTP configurado): describe('executeAndRecord') em aiPendingAction.service.test.ts.
 *   - trava 7 (idempotência): describe('SDROutboundDraftAgent... trava de idempotência') em
 *     src/features/intelligence/agents/__tests__/sdr-agent.test.ts, e o teste "não repete
 *     recomendação recente" já existente em swarmScheduler.service.test.ts.
 */

const mockEnv: Record<string, unknown> = {
    SWARM_SCHEDULER_ENABLED: true,
    SWARM_SCHEDULER_ORGANIZATIONS: 'org-1',
    SWARM_SCHEDULER_MAX_LEADS_PER_RUN: 5,
    SWARM_AUTONOMY_MODE: 'full',
    SWARM_AUTONOMOUS_MIN_SCORE: 80,
    SWARM_NEW_LEAD_GRACE_MINUTES: 30,
    SWARM_STALE_PIPELINE_HOURS: 72,
    SWARM_STALE_PROPOSAL_HOURS: 48,
    SWARM_RECOMMENDATION_COOLDOWN_HOURS: 24,
    SDR_CALL_WINDOW_START: 9,
    SDR_CALL_WINDOW_END: 18,
    SDR_CALL_TIMEZONE: 'America/Sao_Paulo',
};
vi.mock('../../../../../src/config/env.js', () => ({ env: mockEnv }));

const leadFindMany = vi.fn();
const signalFindMany = vi.fn();
const pendingActionFindFirst = vi.fn().mockResolvedValue(null);
const pendingActionCreate = vi.fn().mockResolvedValue({});
vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        lead: { findMany: (...args: unknown[]) => leadFindMany(...args) },
        conversationSignal: { findMany: (...args: unknown[]) => signalFindMany(...args) },
        aIPendingAction: {
            findFirst: (...args: unknown[]) => pendingActionFindFirst(...args),
            create: (...args: unknown[]) => pendingActionCreate(...args),
        },
    },
}));

vi.mock('../../../../../src/lib/logger.js', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../../../../../src/lib/async-context.js', () => ({
    requestContext: { run: (_ctx: unknown, fn: () => unknown) => fn() },
}));

const enqueueSdrOutboundDraft = vi.fn().mockResolvedValue('job-1');
vi.mock('../../../../../src/lib/queue/agent.worker.js', () => ({
    enqueueSdrOutboundDraft: (...args: unknown[]) => enqueueSdrOutboundDraft(...args),
}));

const runAutonomyRole = vi.fn().mockResolvedValue('Recomendação comercial objetiva.');
vi.mock('../../../../../src/features/intelligence/services/autonomyRoleRunner.service.js', () => ({
    runAutonomyRole: (...args: unknown[]) => runAutonomyRole(...args),
}));

const { runSwarmScheduler } = await import(
    '../../../../../src/features/intelligence/services/swarmScheduler.service'
);

const MONDAY_09H_SP = new Date('2026-08-03T12:00:00Z'); // segunda-feira, 09:00 em São Paulo — dentro da janela
const SATURDAY_10H_SP = new Date('2026-08-08T13:00:00Z'); // sábado, 10:00 em São Paulo — fim de semana

/** Lead "quente": Lead_Recebido, sem próxima ação, criado há tempo suficiente, com e-mail e score alto. */
function hotLead(overrides: Record<string, unknown> = {}) {
    return {
        id: 'lead-hot',
        status: 'Lead_Recebido',
        score: 92,
        createdAt: new Date('2026-08-03T10:00:00Z'),
        updatedAt: new Date('2026-08-03T10:00:00Z'),
        lastInteraction: null,
        nextAction: null,
        company: { tradeName: 'Translog', segment: 'Logística', size: 'Grande' },
        contact: { email: 'decisor@translog.com', emailStatus: 'verified', role: 'Diretor' },
        ...overrides,
    };
}

function mockPipelineOnly(lead: ReturnType<typeof hotLead>) {
    leadFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([lead]);
    signalFindMany.mockResolvedValueOnce([]);
}

afterEach(() => {
    vi.clearAllMocks();
    Object.assign(mockEnv, {
        SWARM_SCHEDULER_ENABLED: true,
        SWARM_SCHEDULER_ORGANIZATIONS: 'org-1',
        SWARM_AUTONOMY_MODE: 'full',
        SWARM_AUTONOMOUS_MIN_SCORE: 80,
    });
    pendingActionFindFirst.mockResolvedValue(null);
    pendingActionCreate.mockResolvedValue({});
    runAutonomyRole.mockResolvedValue('Recomendação comercial objetiva.');
});

describe('Modo full — 7 travas simultâneas do primeiro e-mail autônomo', () => {
    it('condição de controle: com as 7 condições favoráveis, o job é enfileirado JÁ elegível para autoexecução', async () => {
        mockPipelineOnly(hotLead());

        const result = await runSwarmScheduler('org-1', MONDAY_09H_SP);

        expect(result.outboundDraftsQueued).toBe(1);
        expect(result.autoExecutionEligible).toBe(1);
        expect(enqueueSdrOutboundDraft).toHaveBeenCalledWith('lead-hot', 'org-1', true);
    });

    it('trava 2 (modo full): em modo supervised, o rascunho é enfileirado mas NUNCA autoexecutado', async () => {
        mockEnv.SWARM_AUTONOMY_MODE = 'supervised';
        mockPipelineOnly(hotLead());

        const result = await runSwarmScheduler('org-1', MONDAY_09H_SP);

        expect(result.outboundDraftsQueued).toBe(1);
        expect(result.autoExecutionEligible).toBe(0);
        expect(enqueueSdrOutboundDraft).toHaveBeenCalledWith('lead-hot', 'org-1', false);
    });

    it('trava 3 (lead com e-mail): sem e-mail do contato, nem chega a enfileirar rascunho de contato', async () => {
        mockPipelineOnly(hotLead({ contact: { email: null, emailStatus: null, role: 'Diretor' } }));

        const result = await runSwarmScheduler('org-1', MONDAY_09H_SP);

        expect(result.outboundDraftsQueued).toBe(0);
        expect(result.autoExecutionEligible).toBe(0);
        expect(enqueueSdrOutboundDraft).not.toHaveBeenCalled();
    });

    it('trava 4 (score mínimo): abaixo de SWARM_AUTONOMOUS_MIN_SCORE, enfileira mas NUNCA autoexecuta', async () => {
        mockPipelineOnly(hotLead({ score: 40 }));

        const result = await runSwarmScheduler('org-1', MONDAY_09H_SP);

        expect(result.outboundDraftsQueued).toBe(1);
        expect(result.autoExecutionEligible).toBe(0);
        expect(enqueueSdrOutboundDraft).toHaveBeenCalledWith('lead-hot', 'org-1', false);
    });

    it('trava 5 (janela comercial / fim de semana): fora da janela, o job nem é enfileirado em modo full', async () => {
        mockPipelineOnly(hotLead());

        const result = await runSwarmScheduler('org-1', SATURDAY_10H_SP);

        expect(result.outboundDraftsQueued).toBe(0);
        expect(result.autoExecutionEligible).toBe(0);
        expect(enqueueSdrOutboundDraft).not.toHaveBeenCalled();
    });
});
