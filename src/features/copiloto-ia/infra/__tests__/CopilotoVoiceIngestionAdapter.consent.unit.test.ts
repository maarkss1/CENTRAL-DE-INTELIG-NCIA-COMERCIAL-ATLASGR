import { afterEach, describe, expect, it, vi } from 'vitest';

// Achado real de finalização (2026-09-04): a ponte de ligações de voz (birth-voice/Bland AI) ->
// Copiloto enviava a transcrição real da ligação a um provedor de IA externo
// (extractConversationIntelligence) checando só o consentimento de GRAVAÇÃO do interlocutor
// (input.consent.status), nunca a base legal LGPD da ORGANIZAÇÃO para IA externa
// (assertPiiExternalConsent) — mesmo gate que já protege WhatsApp/SDR/Ops/Learning/Supervisor e
// a transcrição de reunião do próprio Copiloto (ver transcribeConversation.consent.unit.test.ts).
const mockEnv: Record<string, unknown> = { AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS: '*' };
vi.mock('../../../../config/env.js', () => ({ env: mockEnv }));

vi.mock('../../../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const extractConversationIntelligence = vi.fn();
vi.mock('../conversationIntelligence.service.js', () => ({
  extractConversationIntelligence: (...args: unknown[]) => extractConversationIntelligence(...args),
}));

vi.mock('../PrismaCopilotoIaRepository.js', () => ({
  // Proxy: qualquer método do repositório não usado antes do ponto que este teste verifica
  // (getLeadProbability etc., parte do cálculo de forecast que roda DEPOIS da extração de
  // inteligência) vira no-op resolvido.
  PrismaCopilotoIaRepository: function PrismaCopilotoIaRepository(this: unknown) {
    return new Proxy({}, { get: () => vi.fn().mockResolvedValue(undefined) });
  },
}));

const recordConsent = vi.fn().mockResolvedValue(undefined);
const cancel = vi.fn().mockResolvedValue(undefined);
const createConversation = vi.fn();
vi.mock('../../application/CopilotoIaUseCases.js', () => ({
  // Proxy: métodos não mockados explicitamente (startCapture, addTranscriptSegments,
  // stopCapture, createInsight etc. — só alcançados DEPOIS do ponto que este teste verifica)
  // viram no-op resolvido.
  CopilotoIaUseCases: function CopilotoIaUseCases(this: unknown) {
    return new Proxy(
      {
        createConversation: (...args: unknown[]) => createConversation(...args),
        recordConsent: (...args: unknown[]) => recordConsent(...args),
        cancel: (...args: unknown[]) => cancel(...args),
      },
      {
        get: (target, prop) =>
          prop in target ? (target as never)[prop] : vi.fn().mockResolvedValue(undefined),
      },
    );
  },
}));

const { CopilotoVoiceIngestionAdapter } = await import('../CopilotoVoiceIngestionAdapter.js');

afterEach(() => {
  vi.clearAllMocks();
  mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = '*';
});

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    providerCallId: 'call-1',
    leadId: 'lead-1',
    durationSeconds: 30,
    consent: { status: 'GRANTED' as const, evidence: null },
    turns: [{ speaker: 'lead' as const, text: 'Conversa real do cliente, dado pessoal.' }],
    ...overrides,
  };
}

describe('CopilotoVoiceIngestionAdapter — trava de consentimento LGPD (base legal para IA externa)', () => {
  it('com consentimento de gravação concedido mas sem base legal LGPD, nunca envia a transcrição a um provedor externo', async () => {
    mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = undefined;
    createConversation.mockResolvedValueOnce({ id: 'conv-1' });
    const adapter = new CopilotoVoiceIngestionAdapter({ synthesizeMeeting: vi.fn() });

    await adapter.ingestCallResult('org-sem-consentimento', baseInput());

    expect(extractConversationIntelligence).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledWith('org-sem-consentimento', 'conv-1');
  });

  it('com base legal LGPD registrada, segue até chamar a extração de inteligência', async () => {
    mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = 'org-1';
    createConversation.mockResolvedValueOnce({ id: 'conv-1' });
    extractConversationIntelligence.mockResolvedValueOnce({
      objections: [],
      competitors: [],
      buyingSignals: [],
      complaints: [],
      promises: [],
      blockers: [],
    });
    const synthesizeMeeting = vi.fn().mockResolvedValueOnce({ sentimentScore: null });
    const adapter = new CopilotoVoiceIngestionAdapter({ synthesizeMeeting });

    await adapter.ingestCallResult('org-1', baseInput());

    expect(extractConversationIntelligence).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });
});
