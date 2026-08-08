import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnv: Record<string, unknown> = {
    SWARM_SCHEDULER_ENABLED: false,
    SWARM_SCHEDULER_ORGANIZATIONS: '',
    SWARM_SCHEDULER_MAX_LEADS_PER_RUN: 5,
    SWARM_AUTONOMY_MODE: 'supervised',
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
const pendingActionFindFirst = vi.fn();
const pendingActionCreate = vi.fn().mockResolvedValue({});
const organizationFindMany = vi.fn().mockResolvedValue([]);
vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        lead: { findMany: (...args: unknown[]) => leadFindMany(...args) },
        conversationSignal: { findMany: (...args: unknown[]) => signalFindMany(...args) },
        organization: { findMany: (...args: unknown[]) => organizationFindMany(...args) },
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

const runAutonomyRole = vi.fn();
vi.mock('../../../../../src/features/intelligence/services/autonomyRoleRunner.service.js', () => ({
    runAutonomyRole: (...args: unknown[]) => runAutonomyRole(...args),
}));

const { enabledOrganizations, runSwarmScheduler } = await import(
    '../../../../../src/features/intelligence/services/swarmScheduler.service'
);

const NOW = new Date('2026-08-03T12:00:00Z'); // segunda-feira, 09:00 em São Paulo

function emptySources() {
    leadFindMany.mockResolvedValue([]);
    signalFindMany.mockResolvedValue([]);
}

afterEach(() => {
    vi.clearAllMocks();
    Object.assign(mockEnv, {
        SWARM_SCHEDULER_ENABLED: false,
        SWARM_SCHEDULER_ORGANIZATIONS: '',
        SWARM_SCHEDULER_MAX_LEADS_PER_RUN: 5,
        SWARM_AUTONOMY_MODE: 'supervised',
        SWARM_AUTONOMOUS_MIN_SCORE: 80,
    });
    emptySources();
    pendingActionFindFirst.mockResolvedValue(null);
    pendingActionCreate.mockResolvedValue({});
    runAutonomyRole.mockResolvedValue('Recomendação comercial objetiva.');
});

describe('enabledOrganizations', () => {
    it('permanece fail-closed por padrão', async () => {
        mockEnv.SWARM_SCHEDULER_ORGANIZATIONS = 'org-1';
        expect(await enabledOrganizations()).toEqual([]);
    });

    it('aceita somente a lista explícita quando habilitado', async () => {
        mockEnv.SWARM_SCHEDULER_ENABLED = true;
        mockEnv.SWARM_SCHEDULER_ORGANIZATIONS = 'org-1, org-2 ,, org-3';
        expect(await enabledOrganizations()).toEqual(['org-1', 'org-2', 'org-3']);
    });

    it('não transforma lista vazia em todas as organizações', async () => {
        mockEnv.SWARM_SCHEDULER_ENABLED = true;
        expect(await enabledOrganizations()).toEqual([]);
    });

    it('usa todas as organizações somente com opt-in *', async () => {
        mockEnv.SWARM_SCHEDULER_ENABLED = true;
        mockEnv.SWARM_SCHEDULER_ORGANIZATIONS = '*';
        organizationFindMany.mockResolvedValueOnce([{ id: 'org-a' }, { id: 'org-b' }]);
        expect(await enabledOrganizations()).toEqual(['org-a', 'org-b']);
    });
});

describe('runSwarmScheduler', () => {
    it('não faz nada quando o funil não tem gatilhos', async () => {
        emptySources();

        const result = await runSwarmScheduler('org-1', NOW);

        expect(result).toEqual({
            organizationId: 'org-1',
            scanned: 0,
            proposed: 0,
            outboundDraftsQueued: 0,
            autoExecutionEligible: 0,
            skippedAlreadyPending: 0,
            errors: 0,
        });
        expect(runAutonomyRole).not.toHaveBeenCalled();
    });

    it('analisa follow-up vencido em modo read-only e registra decisão auditável', async () => {
        leadFindMany
            .mockResolvedValueOnce([{
                id: 'lead-1', status: 'Qualificacao_SDR', score: 66,
                nextAction: new Date('2026-08-01T00:00:00Z'), contact: { email: null },
            }])
            .mockResolvedValueOnce([]);
        signalFindMany.mockResolvedValueOnce([]);
        runAutonomyRole.mockResolvedValueOnce('Risco: follow-up atrasado. Próxima ação: ligar hoje.');

        const result = await runSwarmScheduler('org-1', NOW);

        expect(result.proposed).toBe(1);
        expect(runAutonomyRole).toHaveBeenCalledWith('CRM', expect.stringContaining('Follow-up vencido'), expect.any(String));
        expect(pendingActionCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                action: 'swarm_recommendation',
                agentRole: 'CRM',
                organizationId: 'org-1',
                payload: expect.objectContaining({
                    leadId: 'lead-1',
                    trigger: 'due_follow_up',
                    synthesis: 'Risco: follow-up atrasado. Próxima ação: ligar hoje.',
                }),
            }),
        });
    });

    it('não repete recomendação recente para o mesmo lead', async () => {
        leadFindMany
            .mockResolvedValueOnce([{
                id: 'lead-1', status: 'Qualificacao_SDR', score: 66,
                nextAction: new Date('2026-08-01T00:00:00Z'), contact: { email: null },
            }])
            .mockResolvedValueOnce([]);
        signalFindMany.mockResolvedValueOnce([]);
        pendingActionFindFirst.mockResolvedValueOnce({ id: 'recent' });

        const result = await runSwarmScheduler('org-1', NOW);

        expect(result.skippedAlreadyPending).toBe(1);
        expect(runAutonomyRole).not.toHaveBeenCalled();
    });

    it('prioriza sinal de conversa e aciona o Closer em uma proposta', async () => {
        leadFindMany
            .mockResolvedValueOnce([{
                id: 'lead-1', status: 'Proposta_Enviada', score: 91,
                nextAction: new Date('2026-08-01T00:00:00Z'), contact: { email: 'buyer@empresa.com' },
            }])
            .mockResolvedValueOnce([]);
        signalFindMany.mockResolvedValueOnce([{
            leadId: 'lead-1', intent: 'objecao_preco', urgency: 'alta', summary: 'Comprador pediu condição final.', confidence: 0.93,
            lead: { status: 'Proposta_Enviada', score: 91, contact: { email: 'buyer@empresa.com' } },
        }]);

        await runSwarmScheduler('org-1', NOW);

        expect(runAutonomyRole).toHaveBeenCalledWith('CLOSER', expect.stringContaining('objeção'), expect.any(String));
        expect(pendingActionCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                agentRole: 'CLOSER',
                riskLevel: 'high',
                payload: expect.objectContaining({ trigger: 'conversation_signal' }),
            }),
        });
    });

    it('liga o produtor do SDR outbound e libera autoexecução apenas com score e janela válidos', async () => {
        mockEnv.SWARM_AUTONOMY_MODE = 'full';
        leadFindMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{
                id: 'lead-hot', status: 'Lead_Recebido', score: 92,
                createdAt: new Date('2026-08-03T10:00:00Z'), updatedAt: new Date('2026-08-03T10:00:00Z'),
                lastInteraction: null, nextAction: null,
                company: { tradeName: 'Translog', segment: 'Logística', size: 'Grande' },
                contact: { email: 'decisor@translog.com', emailStatus: 'verified', role: 'Diretor' },
            }]);
        signalFindMany.mockResolvedValueOnce([]);

        const result = await runSwarmScheduler('org-1', NOW);

        expect(enqueueSdrOutboundDraft).toHaveBeenCalledWith('lead-hot', 'org-1', true);
        expect(result.outboundDraftsQueued).toBe(1);
        expect(result.autoExecutionEligible).toBe(1);
    });

    it('isola falha de um lead e continua processando os demais', async () => {
        leadFindMany
            .mockResolvedValueOnce([
                { id: 'lead-1', status: 'Qualificacao_SDR', score: 50, nextAction: new Date('2026-08-01'), contact: { email: null } },
                { id: 'lead-2', status: 'Qualificacao_SDR', score: 60, nextAction: new Date('2026-08-01'), contact: { email: null } },
            ])
            .mockResolvedValueOnce([]);
        signalFindMany.mockResolvedValueOnce([]);
        runAutonomyRole
            .mockRejectedValueOnce(new Error('LLM indisponível'))
            .mockResolvedValueOnce('ok');

        const result = await runSwarmScheduler('org-1', NOW);

        expect(result.errors).toBe(1);
        expect(result.proposed).toBe(1);
        expect(runAutonomyRole).toHaveBeenCalledTimes(2);
    });

    it('respeita o teto por rodada após priorização', async () => {
        mockEnv.SWARM_SCHEDULER_MAX_LEADS_PER_RUN = 1;
        leadFindMany
            .mockResolvedValueOnce([
                { id: 'lead-1', status: 'Qualificacao_SDR', score: 50, nextAction: new Date('2026-08-01'), contact: { email: null } },
                { id: 'lead-2', status: 'Qualificacao_SDR', score: 60, nextAction: new Date('2026-08-01'), contact: { email: null } },
            ])
            .mockResolvedValueOnce([]);
        signalFindMany.mockResolvedValueOnce([]);

        const result = await runSwarmScheduler('org-1', NOW);

        expect(result.scanned).toBe(1);
        expect(runAutonomyRole).toHaveBeenCalledTimes(1);
    });
});
