import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnv: Record<string, unknown> = {
    SWARM_SCHEDULER_ENABLED: false,
    SWARM_SCHEDULER_ORGANIZATIONS: '',
    SWARM_SCHEDULER_MAX_LEADS_PER_RUN: 5,
};
vi.mock('../../../../../src/config/env.js', () => ({ env: mockEnv }));

const leadFindMany = vi.fn();
const signalFindMany = vi.fn();
const pendingActionFindFirst = vi.fn();
const pendingActionCreate = vi.fn().mockResolvedValue({});
vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        lead: { findMany: (...args: unknown[]) => leadFindMany(...args) },
        conversationSignal: { findMany: (...args: unknown[]) => signalFindMany(...args) },
        organization: { findMany: vi.fn().mockResolvedValue([]) },
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

const executeMission = vi.fn();
// `class`, não arrow function: `new SwarmOrchestrator()` precisa de algo invocável como
// construtor — o próprio Vitest recusa (`is not a constructor`) um mock com `() => ({...})`.
vi.mock('../../../../../src/features/intelligence/agents/supervisor.agent.js', () => {
    class MockSwarmOrchestrator {
        executeMission(...args: unknown[]) { return executeMission(...args); }
    }
    return { SwarmOrchestrator: MockSwarmOrchestrator };
});

const { enabledOrganizations, runSwarmScheduler } = await import(
    '../../../../../src/features/intelligence/services/swarmScheduler.service'
);

afterEach(() => {
    vi.clearAllMocks();
    mockEnv.SWARM_SCHEDULER_ENABLED = false;
    mockEnv.SWARM_SCHEDULER_ORGANIZATIONS = '';
    mockEnv.SWARM_SCHEDULER_MAX_LEADS_PER_RUN = 5;
    leadFindMany.mockResolvedValue([]);
    signalFindMany.mockResolvedValue([]);
    pendingActionFindFirst.mockResolvedValue(null);
});

describe('enabledOrganizations (swarm scheduler)', () => {
    it('is fail-closed: disabled by default even with organizations listed', async () => {
        mockEnv.SWARM_SCHEDULER_ENABLED = false;
        mockEnv.SWARM_SCHEDULER_ORGANIZATIONS = 'org-1,org-2';
        expect(await enabledOrganizations()).toEqual([]);
    });

    it('parses the comma-separated list only when explicitly enabled', async () => {
        mockEnv.SWARM_SCHEDULER_ENABLED = true;
        mockEnv.SWARM_SCHEDULER_ORGANIZATIONS = 'org-1, org-2 ,, org-3';
        expect(await enabledOrganizations()).toEqual(['org-1', 'org-2', 'org-3']);
    });

    it('is fail-closed when enabled but the organization list is left empty (never falls back to "all orgs")', async () => {
        mockEnv.SWARM_SCHEDULER_ENABLED = true;
        mockEnv.SWARM_SCHEDULER_ORGANIZATIONS = '';
        expect(await enabledOrganizations()).toEqual([]);
    });

    it('only treats an explicit "*" as opt-in to every organization', async () => {
        mockEnv.SWARM_SCHEDULER_ENABLED = true;
        mockEnv.SWARM_SCHEDULER_ORGANIZATIONS = '*';
        const { prisma } = await import('../../../../../src/lib/prisma.js');
        (prisma.organization.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 'org-a' }, { id: 'org-b' }]);
        expect(await enabledOrganizations()).toEqual(['org-a', 'org-b']);
    });
});

describe('runSwarmScheduler', () => {
    it('does nothing when there are no due follow-ups and no recent high-signal conversations', async () => {
        leadFindMany.mockResolvedValueOnce([]);
        signalFindMany.mockResolvedValueOnce([]);

        const result = await runSwarmScheduler('org-1', new Date('2026-08-02T12:00:00Z'));

        expect(result).toEqual({ organizationId: 'org-1', scanned: 0, proposed: 0, skippedAlreadyPending: 0, errors: 0 });
        expect(executeMission).not.toHaveBeenCalled();
    });

    it('runs the swarm for a due follow-up and records the synthesis as a pending action, never executing directly', async () => {
        leadFindMany.mockResolvedValueOnce([{ id: 'lead-1', nextAction: new Date('2026-08-01T00:00:00Z') }]);
        signalFindMany.mockResolvedValueOnce([]);
        pendingActionFindFirst.mockResolvedValueOnce(null);
        executeMission.mockResolvedValueOnce([{ content: 'primeira mensagem' }, { content: 'Recomendação final: ligar amanhã.' }]);

        const result = await runSwarmScheduler('org-1', new Date('2026-08-02T12:00:00Z'));

        expect(result).toEqual({ organizationId: 'org-1', scanned: 1, proposed: 1, skippedAlreadyPending: 0, errors: 0 });
        expect(executeMission).toHaveBeenCalledTimes(1);
        expect(executeMission).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'lead-1');
        expect(pendingActionCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                entity: 'Lead',
                action: 'swarm_recommendation',
                organizationId: 'org-1',
                payload: expect.objectContaining({
                    leadId: 'lead-1',
                    trigger: 'due_follow_up',
                    synthesis: 'Recomendação final: ligar amanhã.',
                }),
            }),
        });
    });

    it('skips a lead that already has an unapproved recommendation pending review', async () => {
        leadFindMany.mockResolvedValueOnce([{ id: 'lead-1', nextAction: new Date('2026-08-01T00:00:00Z') }]);
        signalFindMany.mockResolvedValueOnce([]);
        pendingActionFindFirst.mockResolvedValueOnce({ id: 'existing-pending' });

        const result = await runSwarmScheduler('org-1', new Date('2026-08-02T12:00:00Z'));

        expect(result.skippedAlreadyPending).toBe(1);
        expect(result.proposed).toBe(0);
        expect(executeMission).not.toHaveBeenCalled();
    });

    it('prefers the conversation-signal reason over a generic due follow-up for the same lead', async () => {
        leadFindMany.mockResolvedValueOnce([{ id: 'lead-1', nextAction: new Date('2026-08-01T00:00:00Z') }]);
        signalFindMany.mockResolvedValueOnce([
            { leadId: 'lead-1', intent: 'alta_intencao_compra', urgency: 'alta', summary: 'Cliente pediu proposta.' },
        ]);
        executeMission.mockResolvedValueOnce([{ content: 'Recomendação: enviar proposta hoje.' }]);

        await runSwarmScheduler('org-1', new Date('2026-08-02T12:00:00Z'));

        expect(pendingActionCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                payload: expect.objectContaining({ trigger: 'conversation_signal' }),
            }),
        });
    });

    it('keeps going when the swarm fails for one lead instead of aborting the whole run', async () => {
        leadFindMany.mockResolvedValueOnce([
            { id: 'lead-1', nextAction: new Date('2026-08-01T00:00:00Z') },
            { id: 'lead-2', nextAction: new Date('2026-08-01T00:00:00Z') },
        ]);
        signalFindMany.mockResolvedValueOnce([]);
        executeMission
            .mockRejectedValueOnce(new Error('LLM indisponível'))
            .mockResolvedValueOnce([{ content: 'ok' }]);

        const result = await runSwarmScheduler('org-1', new Date('2026-08-02T12:00:00Z'));

        expect(result.errors).toBe(1);
        expect(result.proposed).toBe(1);
        expect(executeMission).toHaveBeenCalledTimes(2);
    });

    it('caps the number of leads acted on per run', async () => {
        mockEnv.SWARM_SCHEDULER_MAX_LEADS_PER_RUN = 1;
        leadFindMany.mockResolvedValueOnce([
            { id: 'lead-1', nextAction: new Date('2026-08-01T00:00:00Z') },
            { id: 'lead-2', nextAction: new Date('2026-08-01T00:00:00Z') },
        ]);
        signalFindMany.mockResolvedValueOnce([]);
        executeMission.mockResolvedValue([{ content: 'ok' }]);

        const result = await runSwarmScheduler('org-1', new Date('2026-08-02T12:00:00Z'));

        expect(result.scanned).toBe(1);
        expect(executeMission).toHaveBeenCalledTimes(1);
    });
});
