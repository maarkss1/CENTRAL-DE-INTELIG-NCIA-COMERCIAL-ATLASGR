import { afterEach, describe, expect, it, vi } from 'vitest';

// Achado real de finalização (2026-09-04): runTranscribeConversationJob enviava áudio real
// (Whisper) e texto real da conversa (extractConversationIntelligence/
// evaluateConversationCoaching) a provedores de IA externos sem checar
// assertPiiExternalConsent — a mesma trava LGPD que já protege WhatsApp/SDR/Ops/Learning/
// Supervisor (ver conversation-intelligence.service.test.ts, mesmo padrão de mock aqui).
const mockEnv: Record<string, unknown> = { AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS: '*' };
vi.mock('../../../../config/env.js', () => ({ env: mockEnv }));

vi.mock('../../../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../../../../lib/async-context.js', () => ({
  requestContext: { run: (_ctx: unknown, fn: () => unknown) => fn() },
}));

vi.mock('../../../../lib/ai/budget.js', () => ({
  assertAiBudgetNotExceeded: vi.fn().mockResolvedValue(undefined),
}));

const transcribeAudioWithWhisper = vi.fn();
const isWhisperConfigured = vi.fn().mockReturnValue(true);
vi.mock('../../infra/whisperTranscription.service.js', () => ({
  transcribeAudioWithWhisper: (...args: unknown[]) => transcribeAudioWithWhisper(...args),
  isWhisperConfigured: () => isWhisperConfigured(),
  WHISPER_USD_PER_MINUTE: 0.006,
}));

const extractConversationIntelligence = vi.fn();
vi.mock('../../infra/conversationIntelligence.service.js', () => ({
  extractConversationIntelligence: (...args: unknown[]) => extractConversationIntelligence(...args),
}));

const evaluateConversationCoaching = vi.fn();
vi.mock('../../infra/coachingEvaluation.service.js', () => ({
  evaluateConversationCoaching: (...args: unknown[]) => evaluateConversationCoaching(...args),
}));

vi.mock('../../../../lib/storage/index.js', () => ({
  getDownloadUrl: vi.fn().mockResolvedValue({ signedUrl: 'https://example.com/audio.webm' }),
}));

vi.mock('../../../../lib/prisma.js', () => ({
  prisma: { aILog: { create: vi.fn().mockResolvedValue({}) } },
}));

const getConversationState = vi.fn();
const updateTranscriptionStatus = vi.fn().mockResolvedValue(undefined);
vi.mock('../../infra/PrismaCopilotoIaRepository.js', () => ({
  PrismaCopilotoIaRepository: function PrismaCopilotoIaRepository(this: unknown) {
    Object.assign(this as object, {
      getConversationState: (...args: unknown[]) => getConversationState(...args),
      updateTranscriptionStatus: (...args: unknown[]) => updateTranscriptionStatus(...args),
    });
  },
}));

const markFailed = vi.fn().mockResolvedValue(undefined);
vi.mock('../../application/CopilotoIaUseCases.js', () => ({
  // Proxy: qualquer método não explicitamente mockado (markReady, addTranscriptSegments,
  // createInsight etc. — chamados só DEPOIS do ponto que este teste verifica) vira um no-op
  // resolvido, para não precisar enumerar o pipeline inteiro só para provar a trava de
  // consentimento no início dele.
  CopilotoIaUseCases: function CopilotoIaUseCases(this: unknown) {
    return new Proxy(
      { markFailed: (...args: unknown[]) => markFailed(...args) },
      {
        get: (target, prop) =>
          prop in target ? (target as never)[prop] : vi.fn().mockResolvedValue(undefined),
      },
    );
  },
}));

const { runTranscribeConversationJob } = await import('../transcribeConversation.worker.js');

const fakeDeps = { meetingSynthesisPort: { synthesizeMeeting: vi.fn() } };

afterEach(() => {
  vi.clearAllMocks();
  mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = '*';
});

describe('transcribeConversation.worker — trava de consentimento LGPD (base legal para IA externa)', () => {
  it('bloqueia sem base legal registrada: nunca chama Whisper nem extração de inteligência', async () => {
    mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = undefined;
    getConversationState.mockResolvedValueOnce({
      audioObjectKey: 'audio/real-key.webm',
      audioMimeType: 'audio/webm',
    });

    await runTranscribeConversationJob(
      { conversationId: 'conv-1', organizationId: 'org-sem-consentimento' },
      fakeDeps,
    );

    expect(transcribeAudioWithWhisper).not.toHaveBeenCalled();
    expect(extractConversationIntelligence).not.toHaveBeenCalled();
    expect(evaluateConversationCoaching).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith('org-sem-consentimento', 'conv-1');
    expect(updateTranscriptionStatus).toHaveBeenCalledWith(
      'org-sem-consentimento',
      'conv-1',
      expect.objectContaining({ transcriptionError: expect.stringContaining('base legal LGPD') }),
    );
  });

  it('com base legal registrada, segue até o ponto de chamar o Whisper', async () => {
    mockEnv.AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS = 'org-1';
    getConversationState.mockResolvedValueOnce({
      audioObjectKey: 'audio/real-key.webm',
      audioMimeType: 'audio/webm',
    });
    transcribeAudioWithWhisper.mockResolvedValueOnce({
      text: '',
      durationSeconds: 1,
      segments: [],
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(new ArrayBuffer(0), { status: 200 }));

    await runTranscribeConversationJob(
      { conversationId: 'conv-1', organizationId: 'org-1' },
      fakeDeps,
    );

    expect(transcribeAudioWithWhisper).toHaveBeenCalledTimes(1);
    expect(markFailed).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
