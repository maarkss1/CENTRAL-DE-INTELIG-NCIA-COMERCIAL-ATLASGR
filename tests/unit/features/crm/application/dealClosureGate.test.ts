import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ensureDealClosureAllowed,
  ensureManualDealClosureAllowed,
  type DealClosureEventPort,
  type DealClosureEvidencePort,
} from '@/features/crm/application/dealClosureGate';

/**
 * CYC-007 (onda 24) — a garantia central deste gate é a mesma do domínio puro que ele conecta
 * (`dealClosure.ts`, `isDeterministicCloseEvent`): nenhum fechamento com `actorUserId` de
 * cara de IA/automação passa, e nenhum evento é persistido quando o gate rejeita.
 */

function buildPort(overrides: Partial<DealClosureEvidencePort> = {}): DealClosureEvidencePort {
  return {
    createConfirmationNote: vi.fn(async () => ({ id: 'note-1' })),
    saveDealClosureEvent: vi.fn(async () => {}),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('ensureManualDealClosureAllowed', () => {
  it('userId humano real: cria a nota de evidência e persiste o DealClosureEvent', async () => {
    const port = buildPort();

    await ensureManualDealClosureAllowed(port, {
      organizationId: 'org-1',
      leadId: 'lead-1',
      actorUserId: 'user-1',
    });

    expect(port.createConfirmationNote).toHaveBeenCalledWith({
      organizationId: 'org-1',
      leadId: 'lead-1',
      authorUserId: 'user-1',
    });
    expect(port.saveDealClosureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        leadId: 'lead-1',
        type: 'manual_crm_confirmation',
        evidenceRef: 'note-1',
        triggeredBy: 'user-1',
      }),
    );
  });

  it.each(['ai-closer', 'agent:swarm-1', 'bot_generic', 'swarm-bdr'])(
    'actorUserId com cara de IA/automação (%s): rejeita e NUNCA cria nota nem persiste o evento',
    async (fakeActor) => {
      const port = buildPort();

      await expect(
        ensureManualDealClosureAllowed(port, {
          organizationId: 'org-1',
          leadId: 'lead-1',
          actorUserId: fakeActor,
        }),
      ).rejects.toThrow();

      // A checagem de triggeredBy roda antes de qualquer escrita: uma tentativa rejeitada nunca
      // deve deixar uma nota de "confirmação manual" falsa no histórico do lead.
      expect(port.createConfirmationNote).not.toHaveBeenCalled();
      expect(port.saveDealClosureEvent).not.toHaveBeenCalled();
    },
  );

  it('erro lançado é um AppError com status 403 (não um 500 genérico)', async () => {
    const port = buildPort();

    await expect(
      ensureManualDealClosureAllowed(port, {
        organizationId: 'org-1',
        leadId: 'lead-1',
        actorUserId: 'closer-ia',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

/**
 * ACH-17-08 — mesma garantia de `ensureManualDealClosureAllowed`, mas para evidência que já existe
 * fora deste gate (ex.: `CrmCommercialDocument` marcado "Pago"): nenhuma Note é criada, e nenhum
 * evento é persistido quando o gate rejeita.
 */
function buildEventPort(overrides: Partial<DealClosureEventPort> = {}): DealClosureEventPort {
  return {
    saveDealClosureEvent: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('ensureDealClosureAllowed', () => {
  it('userId humano real + evidência real: persiste o DealClosureEvent do tipo informado', async () => {
    const port = buildEventPort();

    const event = await ensureDealClosureAllowed(port, {
      organizationId: 'org-1',
      leadId: 'lead-1',
      type: 'payment_confirmed',
      evidenceRef: 'doc-1',
      triggeredBy: 'user-1',
    });

    expect(port.saveDealClosureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        leadId: 'lead-1',
        type: 'payment_confirmed',
        evidenceRef: 'doc-1',
        triggeredBy: 'user-1',
      }),
    );
    expect(event).toMatchObject({ type: 'payment_confirmed', evidenceRef: 'doc-1' });
  });

  it.each(['ai-closer', 'agent:swarm-1', 'bot_generic', 'swarm-bdr'])(
    'triggeredBy com cara de IA/automação (%s): rejeita com 403 e nunca persiste o evento',
    async (fakeActor) => {
      const port = buildEventPort();

      await expect(
        ensureDealClosureAllowed(port, {
          organizationId: 'org-1',
          leadId: 'lead-1',
          type: 'payment_confirmed',
          evidenceRef: 'doc-1',
          triggeredBy: fakeActor,
        }),
      ).rejects.toMatchObject({ statusCode: 403 });

      expect(port.saveDealClosureEvent).not.toHaveBeenCalled();
    },
  );

  it('evidenceRef vazio: rejeita com 403 e nunca persiste o evento', async () => {
    const port = buildEventPort();

    await expect(
      ensureDealClosureAllowed(port, {
        organizationId: 'org-1',
        leadId: 'lead-1',
        type: 'payment_confirmed',
        evidenceRef: '   ',
        triggeredBy: 'user-1',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(port.saveDealClosureEvent).not.toHaveBeenCalled();
  });
});
