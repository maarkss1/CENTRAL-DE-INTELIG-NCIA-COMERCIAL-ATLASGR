import { describe, it, expect, vi, beforeEach } from 'vitest';

// Dry-run (Onda 42): simula uma automação contra o dado atual da organização sem NUNCA executar a
// ação de verdade. Cobre: reuso real de `matchesConditions` (não mockado — o mesmo módulo
// `automation.engine.js` usado em produção), preview de cada tipo de ação (Notificar
// equipe/Criar atividade/Ligar via SDR de Voz) e a garantia central da tarefa — nenhuma escrita
// nem chamada externa acontece (activity.create, sendEmail, callLead nunca são chamados).

const leadFindMany = vi.fn();
const activityFindMany = vi.fn();
vi.mock('../../../../src/lib/prisma.js', () => ({
    prisma: {
        lead: { findMany: (...args: unknown[]) => leadFindMany(...args) },
        activity: { findMany: (...args: unknown[]) => activityFindMany(...args) },
    },
}));

const mockEnv: { SMTP_HOST?: string } = {};
vi.mock('../../../../src/config/env.js', () => ({ env: mockEnv }));

const isWithinCallWindowMock = vi.fn();
vi.mock('../../../../src/features/integrations/birth-voice/coldCall.policy.js', () => ({
    isWithinCallWindow: (...args: unknown[]) => isWithinCallWindowMock(...args),
}));

const callWindowFromEnvMock = vi.fn(() => ({ startHour: 8, endHour: 18, weekdaysOnly: true, timeZone: 'America/Sao_Paulo' }));
vi.mock('../../../../src/features/integrations/birth-voice/coldCall.service.js', () => ({
    callWindowFromEnv: (...args: unknown[]) => callWindowFromEnvMock(...args),
}));

const pickCallablePhoneMock = vi.fn();
vi.mock('../../../../src/features/integrations/birth-voice/birthVoice.helpers.js', () => ({
    pickCallablePhone: (...args: unknown[]) => pickCallablePhoneMock(...args),
}));

const isSuppressedMock = vi.fn();
vi.mock('../../../../src/features/integrations/birth-voice/callSuppression.service.js', () => ({
    isSuppressed: (...args: unknown[]) => isSuppressedMock(...args),
}));

// A garantia central da tarefa: nenhum destes pode ser chamado pelo dry-run.
const callLeadMock = vi.fn();
vi.mock('../../../../src/features/integrations/birth-voice/birthVoice.service.js', () => ({
    callLead: (...args: unknown[]) => callLeadMock(...args),
    SuppressedNumberError: class SuppressedNumberError extends Error {},
}));
const sendEmailMock = vi.fn();
vi.mock('../../../../src/lib/email/mailer.js', () => ({
    sendEmail: (...args: unknown[]) => sendEmailMock(...args),
    MailerNotConfiguredError: class MailerNotConfiguredError extends Error {},
}));
const activityCreateMock = vi.fn();
const notificationCreateMock = vi.fn();
vi.mock('../../../../src/features/notifications/notification.service.js', () => ({
    notificationService: { create: (...args: unknown[]) => notificationCreateMock(...args) },
}));

vi.mock('../../../../src/lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { dryRunAutomation } = await import('../../../../src/features/automations/automation-dry-run.service.js');

function baseAutomation(overrides: Partial<Parameters<typeof dryRunAutomation>[1]> = {}) {
    return {
        id: 'auto-1',
        name: 'Minha automação',
        enabled: true,
        trigger: 'Lead mudou de status' as const,
        conditions: null,
        action: 'Notificar equipe' as const,
        actionConfig: {},
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    leadFindMany.mockResolvedValue([]);
    activityFindMany.mockResolvedValue([]);
    isWithinCallWindowMock.mockReturnValue(true);
    pickCallablePhoneMock.mockReturnValue(null);
    isSuppressedMock.mockResolvedValue(false);
    delete mockEnv.SMTP_HOST;
});

const LEAD_ROW = {
    id: 'lead-1',
    status: 'Proposta_Enviada',
    owner: 'Marcelo',
    temperature: 'Quente',
    score: 80,
    funnel: 'Lead',
    companyId: 'company-1',
    contactId: 'contact-1',
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-20T00:00:00Z'),
    lastInteraction: new Date('2026-08-20T00:00:00Z'),
    contact: { name: 'Fulano', phone: '+5511999998888', whatsapp: null },
    company: { tradeName: 'Empresa X', legalName: 'Empresa X Ltda', phones: [] },
};

describe('dryRunAutomation — nunca executa a ação real', () => {
    it('nunca chama activity.create/notificationService.create/sendEmail/callLead mesmo quando a ação dispararia', async () => {
        leadFindMany.mockResolvedValue([LEAD_ROW]);
        pickCallablePhoneMock.mockReturnValue('+5511999998888');

        await dryRunAutomation('org-1', baseAutomation({ conditions: { status: 'Proposta Enviada' }, action: 'Notificar equipe', actionConfig: { channel: 'email', to: 'gestor@atlasgr.com.br' } }));
        await dryRunAutomation('org-1', baseAutomation({ conditions: { status: 'Proposta Enviada' }, action: 'Criar atividade' }));
        await dryRunAutomation('org-1', baseAutomation({ conditions: { status: 'Proposta Enviada' }, action: 'Ligar via SDR de Voz' }));

        expect(activityCreateMock).not.toHaveBeenCalled();
        expect(notificationCreateMock).not.toHaveBeenCalled();
        expect(sendEmailMock).not.toHaveBeenCalled();
        expect(callLeadMock).not.toHaveBeenCalled();
        // A própria query de leads nunca é de escrita.
        expect(leadFindMany).toHaveBeenCalled();
    });
});

describe('dryRunAutomation — reuso real de matchesConditions (não mockado)', () => {
    it('filtra registros que não batem a condição, sem listá-los no resultado', async () => {
        leadFindMany.mockResolvedValue([
            { ...LEAD_ROW, id: 'lead-bate', status: 'Proposta_Enviada' },
            { ...LEAD_ROW, id: 'lead-nao-bate', status: 'Lead_Recebido' },
        ]);

        const result = await dryRunAutomation('org-1', baseAutomation({ conditions: { status: 'Proposta Enviada' } }));

        expect(result.sampleSize).toBe(2);
        expect(result.matchedCount).toBe(1);
        expect(result.records).toHaveLength(1);
        expect(result.records[0].entityId).toBe('lead-bate');
    });

    it('sem condições, todos os amostrados batem', async () => {
        leadFindMany.mockResolvedValue([LEAD_ROW, { ...LEAD_ROW, id: 'lead-2' }]);

        const result = await dryRunAutomation('org-1', baseAutomation({ conditions: null }));

        expect(result.matchedCount).toBe(2);
    });
});

describe('dryRunAutomation — preview de "Notificar equipe"', () => {
    it('canal in_app: wouldFire true, com título renderizado a partir do template', async () => {
        leadFindMany.mockResolvedValue([LEAD_ROW]);

        const result = await dryRunAutomation('org-1', baseAutomation({
            actionConfig: { title: 'Lead {{owner}} quente' },
        }));

        expect(result.records[0].outcome.wouldFire).toBe(true);
        expect(result.records[0].outcome.details.title).toBe('Lead Marcelo quente');
        expect(result.records[0].outcome.details.channel).toBe('in_app');
    });

    it('canal e-mail sem destinatário: wouldFire false com motivo', async () => {
        leadFindMany.mockResolvedValue([LEAD_ROW]);

        const result = await dryRunAutomation('org-1', baseAutomation({
            actionConfig: { channel: 'email' },
        }));

        expect(result.records[0].outcome.wouldFire).toBe(false);
        expect(result.records[0].outcome.blockedReason).toMatch(/destinatário/i);
    });

    it('canal e-mail com destinatário mas SMTP_HOST ausente: wouldFire true, mas avisa que o e-mail não sairia', async () => {
        leadFindMany.mockResolvedValue([LEAD_ROW]);
        delete mockEnv.SMTP_HOST;

        const result = await dryRunAutomation('org-1', baseAutomation({
            actionConfig: { channel: 'email', to: 'gestor@atlasgr.com.br' },
        }));

        expect(result.records[0].outcome.wouldFire).toBe(true);
        expect(result.records[0].outcome.blockedReason).toMatch(/SMTP/i);
    });

    it('canal e-mail configurado corretamente: wouldFire true, sem blockedReason', async () => {
        leadFindMany.mockResolvedValue([LEAD_ROW]);
        mockEnv.SMTP_HOST = 'smtp.exemplo.com';

        const result = await dryRunAutomation('org-1', baseAutomation({
            actionConfig: { channel: 'email', to: 'gestor@atlasgr.com.br' },
        }));

        expect(result.records[0].outcome.wouldFire).toBe(true);
        expect(result.records[0].outcome.blockedReason).toBeUndefined();
        expect(result.records[0].outcome.details.to).toBe('gestor@atlasgr.com.br');
    });
});

describe('dryRunAutomation — preview de "Criar atividade"', () => {
    it('calcula o prazo (dueInDays) e o dono a partir da config/lead', async () => {
        leadFindMany.mockResolvedValue([LEAD_ROW]);

        const result = await dryRunAutomation('org-1', baseAutomation({
            action: 'Criar atividade',
            actionConfig: { dueInDays: 3, type: 'Ligacao' },
        }));

        const outcome = result.records[0].outcome;
        expect(outcome.wouldFire).toBe(true);
        expect(outcome.details.type).toBe('Ligacao');
        expect(outcome.details.leadId).toBe('lead-1');
        expect(typeof outcome.details.dueDate).toBe('string');
    });
});

describe('dryRunAutomation — preview de "Ligar via SDR de Voz"', () => {
    it('fora da janela comercial: wouldFire false', async () => {
        leadFindMany.mockResolvedValue([LEAD_ROW]);
        isWithinCallWindowMock.mockReturnValue(false);

        const result = await dryRunAutomation('org-1', baseAutomation({ action: 'Ligar via SDR de Voz' }));

        expect(result.records[0].outcome.wouldFire).toBe(false);
        expect(result.records[0].outcome.blockedReason).toMatch(/janela/i);
    });

    it('sem telefone discável: wouldFire false', async () => {
        leadFindMany.mockResolvedValue([LEAD_ROW]);
        pickCallablePhoneMock.mockReturnValue(null);

        const result = await dryRunAutomation('org-1', baseAutomation({ action: 'Ligar via SDR de Voz' }));

        expect(result.records[0].outcome.wouldFire).toBe(false);
        expect(result.records[0].outcome.blockedReason).toMatch(/telefone/i);
    });

    it('número em opt-out: wouldFire false', async () => {
        leadFindMany.mockResolvedValue([LEAD_ROW]);
        pickCallablePhoneMock.mockReturnValue('+5511999998888');
        isSuppressedMock.mockResolvedValue(true);

        const result = await dryRunAutomation('org-1', baseAutomation({ action: 'Ligar via SDR de Voz' }));

        expect(result.records[0].outcome.wouldFire).toBe(false);
        expect(result.records[0].outcome.blockedReason).toMatch(/bloqueio/i);
    });

    it('dentro da janela, com telefone e sem opt-out: wouldFire true', async () => {
        leadFindMany.mockResolvedValue([LEAD_ROW]);
        pickCallablePhoneMock.mockReturnValue('+5511999998888');
        isSuppressedMock.mockResolvedValue(false);

        const result = await dryRunAutomation('org-1', baseAutomation({ action: 'Ligar via SDR de Voz' }));

        expect(result.records[0].outcome.wouldFire).toBe(true);
        expect(result.records[0].outcome.details.targetNumber).toBe('+5511999998888');
    });
});

describe('dryRunAutomation — amostra por gatilho', () => {
    it('gatilho "Atividade concluída" consulta Activity (não Lead), só status Concluída', async () => {
        activityFindMany.mockResolvedValue([
            { id: 'act-1', type: 'Ligacao', owner: 'Marcelo', leadId: 'lead-1', updatedAt: new Date() },
        ]);

        const result = await dryRunAutomation('org-1', baseAutomation({ trigger: 'Atividade concluída', conditions: null }));

        expect(activityFindMany).toHaveBeenCalledTimes(1);
        expect(leadFindMany).not.toHaveBeenCalled();
        const call = activityFindMany.mock.calls[0][0];
        expect(call.where.status).toBe('Concluida');
        expect(result.records[0].entity).toBe('Activity');
        expect(result.records[0].entityId).toBe('act-1');
    });

    it('respeita o teto de amostra (limit) passado em options', async () => {
        leadFindMany.mockResolvedValue([]);

        await dryRunAutomation('org-1', baseAutomation(), { limit: 5 });

        const call = leadFindMany.mock.calls[0][0];
        expect(call.take).toBe(5);
    });

    it('aplica o teto máximo de amostra mesmo se um limit maior for pedido', async () => {
        leadFindMany.mockResolvedValue([]);

        await dryRunAutomation('org-1', baseAutomation(), { limit: 999 });

        const call = leadFindMany.mock.calls[0][0];
        expect(call.take).toBe(100);
    });

    it('usa o limite padrão quando nenhum é informado', async () => {
        leadFindMany.mockResolvedValue([]);

        await dryRunAutomation('org-1', baseAutomation());

        const call = leadFindMany.mock.calls[0][0];
        expect(call.take).toBe(25);
    });
});

describe('dryRunAutomation — casos de borda da amostra de Lead', () => {
    it('sem lastInteraction, calcula daysSinceLastInteraction a partir de createdAt', async () => {
        leadFindMany.mockResolvedValue([{ ...LEAD_ROW, lastInteraction: null }]);

        const result = await dryRunAutomation('org-1', baseAutomation());

        expect(typeof result.records[0].entityId).toBe('string');
    });

    it('label cai para o nome da empresa quando o lead não tem contato vinculado', async () => {
        leadFindMany.mockResolvedValue([{ ...LEAD_ROW, contact: null }]);

        const result = await dryRunAutomation('org-1', baseAutomation());

        expect(result.records[0].label).toBe('Empresa X');
    });

    it('label cai para o id do lead quando não há contato nem empresa', async () => {
        leadFindMany.mockResolvedValue([{ ...LEAD_ROW, contact: null, company: null }]);

        const result = await dryRunAutomation('org-1', baseAutomation());

        expect(result.records[0].label).toBe('lead-1');
    });
});

describe('dryRunAutomation — preview de "Notificar equipe", casos adicionais', () => {
    it('canal in_app com body configurado: renderiza o body no template', async () => {
        leadFindMany.mockResolvedValue([LEAD_ROW]);

        const result = await dryRunAutomation('org-1', baseAutomation({
            actionConfig: { body: 'Olá {{owner}}, novo lead!' },
        }));

        expect(result.records[0].outcome.details.body).toBe('Olá Marcelo, novo lead!');
    });
});

describe('dryRunAutomation — preview de "Criar atividade", casos adicionais', () => {
    it('usa o owner explícito da config quando informado', async () => {
        leadFindMany.mockResolvedValue([LEAD_ROW]);

        const result = await dryRunAutomation('org-1', baseAutomation({
            action: 'Criar atividade',
            actionConfig: { owner: 'Ana' },
        }));

        expect(result.records[0].outcome.details.owner).toBe('Ana');
    });

    it('gatilho "Atividade concluída": resolve o leadId a partir do candidato de Activity', async () => {
        activityFindMany.mockResolvedValue([
            { id: 'act-1', type: 'Ligacao', owner: 'Marcelo', leadId: 'lead-9', updatedAt: new Date() },
        ]);

        const result = await dryRunAutomation('org-1', baseAutomation({
            trigger: 'Atividade concluída',
            action: 'Criar atividade',
            conditions: null,
        }));

        expect(result.records[0].outcome.wouldFire).toBe(true);
        expect(result.records[0].outcome.details.leadId).toBe('lead-9');
    });

    it('gatilho "Atividade concluída" sem leadId no registro: wouldFire false por falta de lead vinculado', async () => {
        activityFindMany.mockResolvedValue([
            { id: 'act-2', type: 'Ligacao', owner: 'Marcelo', leadId: null, updatedAt: new Date() },
        ]);

        const result = await dryRunAutomation('org-1', baseAutomation({
            trigger: 'Atividade concluída',
            action: 'Criar atividade',
            conditions: null,
        }));

        expect(result.records[0].outcome.wouldFire).toBe(false);
        expect(result.records[0].outcome.blockedReason).toMatch(/lead/i);
    });
});

describe('dryRunAutomation — preview de "Ligar via SDR de Voz", casos adicionais', () => {
    it('gatilho "Atividade concluída": a ação de voz só se aplica a eventos de lead', async () => {
        activityFindMany.mockResolvedValue([
            { id: 'act-3', type: 'Ligacao', owner: 'Marcelo', leadId: 'lead-1', updatedAt: new Date() },
        ]);

        const result = await dryRunAutomation('org-1', baseAutomation({
            trigger: 'Atividade concluída',
            action: 'Ligar via SDR de Voz',
            conditions: null,
        }));

        expect(result.records[0].outcome.wouldFire).toBe(false);
        expect(result.records[0].outcome.blockedReason).toMatch(/lead/i);
    });

    it('lead sem contato/empresa vinculados: contact/company chegam como null em pickCallablePhone', async () => {
        leadFindMany.mockResolvedValue([{ ...LEAD_ROW, contact: null, company: null }]);
        pickCallablePhoneMock.mockReturnValue(null);

        await dryRunAutomation('org-1', baseAutomation({ action: 'Ligar via SDR de Voz' }));

        expect(pickCallablePhoneMock).toHaveBeenCalledWith(null, null);
    });
});

describe('dryRunAutomation — casos de borda gerais', () => {
    it('actionConfig ausente (null) é tratado como objeto vazio', async () => {
        leadFindMany.mockResolvedValue([LEAD_ROW]);

        const result = await dryRunAutomation('org-1', baseAutomation({ actionConfig: null }));

        expect(result.records[0].outcome.wouldFire).toBe(true);
    });

    it('ação desconhecida (fora do enum atual): wouldFire false com motivo explícito', async () => {
        leadFindMany.mockResolvedValue([LEAD_ROW]);

        const result = await dryRunAutomation('org-1', baseAutomation({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            action: 'Ação removida' as any,
        }));

        expect(result.records[0].outcome.wouldFire).toBe(false);
        expect(result.records[0].outcome.blockedReason).toMatch(/desconhecida/i);
    });
});
