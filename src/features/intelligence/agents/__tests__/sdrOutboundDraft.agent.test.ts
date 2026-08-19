import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnv: Record<string, unknown> = { AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS: undefined };
vi.mock('../../../../config/env.js', () => ({ env: mockEnv }));

vi.mock('../../../../lib/logger.js', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const leadFindFirst = vi.fn();
const pendingActionFindUnique = vi.fn();
const pendingActionCreate = vi.fn();
const pendingActionUpdate = vi.fn();
vi.mock('../../../../lib/prisma.js', () => ({
    prisma: {
        lead: { findFirst: (...args: unknown[]) => leadFindFirst(...args) },
        aIPendingAction: {
            findUnique: (...args: unknown[]) => pendingActionFindUnique(...args),
            create: (...args: unknown[]) => pendingActionCreate(...args),
            update: (...args: unknown[]) => pendingActionUpdate(...args),
        },
    },
}));

const searchSimilar = vi.fn().mockResolvedValue([]);
vi.mock('../../services/vector.service.js', () => ({
    vectorService: { searchSimilar: (...args: unknown[]) => searchSimilar(...args) },
}));

const executeAndRecord = vi.fn();
vi.mock('../../services/aiPendingAction.service.js', () => ({
    executeAndRecord: (...args: unknown[]) => executeAndRecord(...args),
}));

// processMessage vem de AgentService (base) — mockamos só o suficiente para produzir um JSON
// válido de rascunho, já que o que este arquivo de teste cobre é o gate de consentimento e a
// idempotência, não a geração de copy em si. `processMessageMock` é controlável por teste (ver
// describe AI-004 abaixo, que precisa simular um retorno fora do schema).
const processMessageMock = vi.fn().mockResolvedValue(
    JSON.stringify({ subject: 'Uma ideia para sua operação', body: 'Olá, tudo bem?' }),
);
vi.mock('../../services/agent.service.js', () => ({
    AgentService: class {
        async processMessage(...args: unknown[]) {
            return processMessageMock(...args);
        }
    },
}));

const { SDROutboundDraftAgent } = await import('../sdrOutboundDraft.agent');

const baseLead = {
    id: 'lead-1',
    score: 82,
    qualification: null,
    company: { legalName: 'Translog Transportes Ltda', segment: 'Logística', size: 'Grande', tradeName: 'Translog' },
    contact: { name: 'Maria Silva', role: 'Diretora de Operações', email: 'maria@translog.com' },
};

afterEach(() => {
    vi.clearAllMocks();
    mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = undefined;
});

describe('SDROutboundDraftAgent.draftEmailForLead — trava de consentimento LGPD', () => {
    it('bloqueia a geração do rascunho sem base legal registrada para a organização', async () => {
        leadFindFirst.mockResolvedValue(baseLead);
        pendingActionFindUnique.mockResolvedValue(null);

        const agent = new SDROutboundDraftAgent('session-1', 'org-sem-consentimento');
        const result = await agent.draftEmailForLead('lead-1', 'org-sem-consentimento', false);

        expect(result.status).toBe('skipped');
        expect(result.reason).toContain('LGPD');
        expect(pendingActionCreate).not.toHaveBeenCalled();
        expect(searchSimilar).not.toHaveBeenCalled();
    });

    it('com base legal registrada, segue e cria a ação pendente normalmente', async () => {
        mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = 'org-1';
        leadFindFirst.mockResolvedValue(baseLead);
        pendingActionFindUnique.mockResolvedValue(null);
        pendingActionCreate.mockResolvedValue({ id: 'action-1' });

        const agent = new SDROutboundDraftAgent('session-1', 'org-1');
        const result = await agent.draftEmailForLead('lead-1', 'org-1', false);

        expect(result.status).toBe('created');
        expect(pendingActionCreate).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ action: 'send_email', agentRole: 'SDR' }),
        }));
    });
});

describe('SDROutboundDraftAgent.draftEmailForLead — trava de idempotência (reprocessamento não duplica)', () => {
    it('não cria uma segunda ação quando já existe uma para o mesmo lead', async () => {
        mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = 'org-1';
        leadFindFirst.mockResolvedValue(baseLead);
        pendingActionFindUnique.mockResolvedValue({
            id: 'action-existing', approved: false, executed: false, discardedAt: null,
        });

        const agent = new SDROutboundDraftAgent('session-1', 'org-1');
        const result = await agent.draftEmailForLead('lead-1', 'org-1', false);

        expect(result.status).toBe('existing');
        expect(result.actionId).toBe('action-existing');
        expect(pendingActionCreate).not.toHaveBeenCalled();
        expect(searchSimilar).not.toHaveBeenCalled();
    });

    it('em modo full, reaproveita a ação existente (rascunho validado por schema) e não gera um segundo rascunho para o mesmo lead', async () => {
        mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = 'org-1';
        leadFindFirst.mockResolvedValue(baseLead);
        pendingActionFindUnique.mockResolvedValue({
            id: 'action-existing', approved: false, executed: false, discardedAt: null,
            payload: { structuredOutputValid: true },
        });
        executeAndRecord.mockResolvedValue({ sent: true });
        pendingActionUpdate.mockResolvedValue({});

        const agent = new SDROutboundDraftAgent('session-1', 'org-1');
        const result = await agent.draftEmailForLead('lead-1', 'org-1', true);

        expect(result.status).toBe('executed');
        expect(result.actionId).toBe('action-existing');
        expect(pendingActionCreate).not.toHaveBeenCalled();
        expect(executeAndRecord).toHaveBeenCalledTimes(1);
    });
});

describe('SDROutboundDraftAgent.draftEmailForLead — AI-004 (onda-20): schema inválido nunca autoExecute', () => {
    it('LLM devolve texto fora do schema: cria a ação para revisão humana, mas NUNCA autoExecute mesmo com autoExecute=true', async () => {
        mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = 'org-1';
        leadFindFirst.mockResolvedValue(baseLead);
        pendingActionFindUnique.mockResolvedValue(null);
        pendingActionCreate.mockResolvedValue({ id: 'action-fallback' });
        processMessageMock.mockResolvedValueOnce('Isto não é JSON, é só um parágrafo de texto livre que o modelo devolveu.');

        const agent = new SDROutboundDraftAgent('session-1', 'org-1');
        const result = await agent.draftEmailForLead('lead-1', 'org-1', true);

        expect(result.status).toBe('created');
        expect(result.actionId).toBe('action-fallback');
        expect(executeAndRecord).not.toHaveBeenCalled();
        expect(pendingActionCreate).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                payload: expect.objectContaining({ structuredOutputValid: false }),
            }),
        }));
    });

    it('rascunho validado por schema grava structuredOutputValid:true e pode autoExecute', async () => {
        mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = 'org-1';
        leadFindFirst.mockResolvedValue(baseLead);
        pendingActionFindUnique.mockResolvedValue(null);
        pendingActionCreate.mockResolvedValue({ id: 'action-valid' });
        executeAndRecord.mockResolvedValue({ sent: true });
        pendingActionUpdate.mockResolvedValue({});

        const agent = new SDROutboundDraftAgent('session-1', 'org-1');
        const result = await agent.draftEmailForLead('lead-1', 'org-1', true);

        expect(result.status).toBe('executed');
        expect(pendingActionCreate).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                payload: expect.objectContaining({ structuredOutputValid: true }),
            }),
        }));
    });

    it('ação existente sem structuredOutputValid (criada antes desta correção) não é autoExecutada — fail-closed', async () => {
        mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = 'org-1';
        leadFindFirst.mockResolvedValue(baseLead);
        pendingActionFindUnique.mockResolvedValue({
            id: 'action-legacy', approved: false, executed: false, discardedAt: null,
            payload: { subject: 'x', body: 'y' },
        });

        const agent = new SDROutboundDraftAgent('session-1', 'org-1');
        const result = await agent.draftEmailForLead('lead-1', 'org-1', true);

        expect(result.status).toBe('existing');
        expect(executeAndRecord).not.toHaveBeenCalled();
    });
});

describe('SDROutboundDraftAgent.draftEmailForLead — pré-condições existentes (regressão)', () => {
    it('não gera rascunho para contato sem e-mail', async () => {
        mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = '*';
        leadFindFirst.mockResolvedValue({ ...baseLead, contact: { ...baseLead.contact, email: null } });

        const agent = new SDROutboundDraftAgent('session-1', 'org-1');
        const result = await agent.draftEmailForLead('lead-1', 'org-1', false);

        expect(result.status).toBe('skipped');
        expect(result.reason).toContain('e-mail');
        expect(pendingActionFindUnique).not.toHaveBeenCalled();
    });
});
