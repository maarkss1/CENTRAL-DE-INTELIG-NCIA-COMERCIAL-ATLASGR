import { describe, expect, it, vi, beforeEach } from 'vitest';

// GOV-13 (Agente 13): estas duas ferramentas substituem `opsTools.ts` no OpsAgent — em vez de
// executar `activityService.create`/`notificationService.create` direto, elas só registram uma
// `AIPendingAction` pendente de aprovação humana (mesmo ledger que SDR/BDR/Closer/CRM já usam).
// `opsTools.test.ts` continua cobrindo o comportamento de execução direta do módulo antigo, que
// permanece no repositório mas não é mais usado pelo OpsAgent.

const getTenantIdMock = vi.fn<() => string | undefined>();
vi.mock('../../../../lib/async-context.js', () => ({
  getTenantId: () => getTenantIdMock(),
}));

const leadFindFirstMock = vi.fn();
const pendingActionCreateMock = vi.fn();
const pendingActionFindUniqueMock = vi.fn();
vi.mock('../../../../lib/prisma.js', () => ({
  prisma: {
    lead: { findFirst: (...args: unknown[]) => leadFindFirstMock(...args) },
    aIPendingAction: {
      create: (...args: unknown[]) => pendingActionCreateMock(...args),
      findUnique: (...args: unknown[]) => pendingActionFindUniqueMock(...args),
    },
  },
}));

import { createFollowUpTaskTool, notifyTeamTool } from '../opsPendingActions.tool';

describe('createFollowUpTaskTool (OpsAgent, proposta pendente de aprovação)', () => {
  beforeEach(() => {
    getTenantIdMock.mockReset();
    leadFindFirstMock.mockReset();
    pendingActionCreateMock.mockReset();
    pendingActionFindUniqueMock.mockReset();
  });

  it('recusa a proposta sem contexto de organização (evita vazamento entre tenants)', async () => {
    getTenantIdMock.mockReturnValue(undefined);

    const result = await createFollowUpTaskTool.invoke({
      leadId: 'lead-1',
      date: '2026-08-05T14:00:00.000Z',
    });

    expect(result).toContain('contexto de organização ausente');
    expect(pendingActionCreateMock).not.toHaveBeenCalled();
  });

  it('recusa a proposta para um lead inexistente', async () => {
    getTenantIdMock.mockReturnValue('org-1');
    leadFindFirstMock.mockResolvedValue(null);

    const result = await createFollowUpTaskTool.invoke({
      leadId: 'lead-inexistente',
      date: '2026-08-05T14:00:00.000Z',
    });

    expect(result).toContain('não encontrado no CRM');
    expect(pendingActionCreateMock).not.toHaveBeenCalled();
  });

  it('registra uma AIPendingAction em vez de criar a atividade diretamente', async () => {
    getTenantIdMock.mockReturnValue('org-1');
    leadFindFirstMock.mockResolvedValue({ id: 'lead-1' });
    pendingActionCreateMock.mockResolvedValue({ id: 'pending-1' });

    const result = await createFollowUpTaskTool.invoke({
      leadId: 'lead-1',
      date: '2026-08-05T14:00:00.000Z',
      observations: 'Retomar proposta.',
      owner: 'Maria Souza',
    });

    expect(pendingActionCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entity: 'Lead',
        action: 'create_follow_up',
        agentRole: 'OPS',
        riskLevel: 'low',
        organizationId: 'org-1',
        payload: {
          leadId: 'lead-1',
          date: '2026-08-05T14:00:00.000Z',
          type: 'Follow-up',
          observations: 'Retomar proposta.',
          owner: 'Maria Souza',
        },
      }),
    });
    // Nunca executa a atividade real diretamente — só propõe.
    expect(result).toContain('aguardando aprovação humana');
    expect(result).not.toContain('agendada com sucesso');
  });

  it('retentativa idêntica do próprio LLM (mesma chave de idempotência) não lança e não duplica a proposta', async () => {
    getTenantIdMock.mockReturnValue('org-1');
    leadFindFirstMock.mockResolvedValue({ id: 'lead-1' });
    const conflict = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    pendingActionCreateMock.mockRejectedValue(conflict);
    pendingActionFindUniqueMock.mockResolvedValue({ id: 'pending-existente' });

    const result = await createFollowUpTaskTool.invoke({
      leadId: 'lead-1',
      date: '2026-08-05T14:00:00.000Z',
    });

    expect(result).toContain('aguardando aprovação humana');
  });

  it('erro real (não conflito de idempotência) na criação devolve mensagem, não lança', async () => {
    getTenantIdMock.mockReturnValue('org-1');
    leadFindFirstMock.mockResolvedValue({ id: 'lead-1' });
    pendingActionCreateMock.mockRejectedValue(new Error('conexão com o banco perdida'));

    const result = await createFollowUpTaskTool.invoke({
      leadId: 'lead-1',
      date: '2026-08-05T14:00:00.000Z',
    });

    expect(result).toContain('Erro ao registrar a proposta de tarefa');
    expect(result).toContain('conexão com o banco perdida');
  });
});

describe('notifyTeamTool (OpsAgent, proposta pendente de aprovação)', () => {
  beforeEach(() => {
    getTenantIdMock.mockReset();
    pendingActionCreateMock.mockReset();
    pendingActionFindUniqueMock.mockReset();
  });

  it('recusa a proposta sem contexto de organização', async () => {
    getTenantIdMock.mockReturnValue(undefined);

    const result = await notifyTeamTool.invoke({ title: 'Risco de churn' });

    expect(result).toContain('contexto de organização ausente');
    expect(pendingActionCreateMock).not.toHaveBeenCalled();
  });

  it('registra uma AIPendingAction em vez de notificar a equipe diretamente', async () => {
    getTenantIdMock.mockReturnValue('org-1');
    pendingActionCreateMock.mockResolvedValue({ id: 'pending-2' });

    const result = await notifyTeamTool.invoke({
      title: 'Risco de churn no deal X',
      leadId: 'lead-1',
      kind: 'Alerta',
    });

    expect(pendingActionCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entity: 'Lead',
        action: 'notify_team',
        agentRole: 'OPS',
        riskLevel: 'medium',
        organizationId: 'org-1',
        payload: {
          title: 'Risco de churn no deal X',
          body: null,
          kind: 'Alerta',
          leadId: 'lead-1',
        },
      }),
    });
    expect(result).toContain('aguardando aprovação humana');
    expect(result).not.toContain('enviada para a equipe');
  });

  it('retentativa idêntica do próprio LLM não lança e não duplica a proposta', async () => {
    getTenantIdMock.mockReturnValue('org-1');
    const conflict = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    pendingActionCreateMock.mockRejectedValue(conflict);
    pendingActionFindUniqueMock.mockResolvedValue({ id: 'pending-existente' });

    const result = await notifyTeamTool.invoke({ title: 'Risco de churn' });

    expect(result).toContain('aguardando aprovação humana');
  });
});
