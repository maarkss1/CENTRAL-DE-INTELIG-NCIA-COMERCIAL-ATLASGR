import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Regressão de um bug P0 real: antes desta correção, tanto a falha da IA quanto uma saída da IA
 * com PII residual eram reportadas como sucesso (complianceScore fabricado, ex.: 90), sem
 * nenhum sinal de que o texto não foi realmente verificado como anonimizado. Estes testes provam
 * que o serviço agora é fail-closed: nunca infla o score de conformidade quando não pode garantir
 * que o texto está limpo.
 */
vi.mock('../../../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { LgpdSanitizerService } = await import('../lgpd-sanitizer.service');
const gateway = await import('../../../../lib/ai/gateway.js');

afterEach(() => {
  vi.restoreAllMocks();
});

function mockModelResponse(content: string) {
  vi.spyOn(gateway, 'getAiModel').mockReturnValue({
    invoke: vi.fn().mockResolvedValue({
      content,
      response_metadata: { model: 'test-model', tokenUsage: {} },
    }),
  } as unknown as ReturnType<typeof gateway.getAiModel>);
  vi.spyOn(gateway, 'logAiUsage').mockResolvedValue(undefined);
}

describe('LgpdSanitizerService — fail-closed', () => {
  it('quando a IA falha, nunca finge sucesso: complianceScore 0 e requiresManualReview true', async () => {
    vi.spyOn(gateway, 'getAiModel').mockReturnValue({
      invoke: vi.fn().mockRejectedValue(new Error('provedor indisponível')),
    } as unknown as ReturnType<typeof gateway.getAiModel>);

    const service = new LgpdSanitizerService();
    const result = await service.sanitizeText({
      rawText: 'Fulano de Tal, CPF 123.456.789-00, mora na Rua das Flores, 123.',
      maskLevel: 'estrito',
    });

    expect(result.requiresManualReview).toBe(true);
    expect(result.complianceScore).toBe(0);
    // CPF já é redigido pela camada de regex determinística antes de qualquer chamada à IA.
    expect(result.sanitizedText).not.toContain('123.456.789-00');
    // Nome/endereço não são cobertos por regex — continuam intactos quando a IA falha, e é
    // exatamente por isso que requiresManualReview precisa ser true (não pode virar relatório
    // externo sem revisão humana).
    expect(result.sanitizedText).toContain('Rua das Flores');
  });

  it('quando a IA devolve PII residual detectável mesmo com formato válido, marca para revisão em vez de aceitar', async () => {
    mockModelResponse(
      JSON.stringify({
        sanitizedText: 'Texto com um CPF que a IA esqueceu de mascarar: 987.654.321-00',
        detectedPersonalDataTypes: ['CPF'],
        redactionCount: 1,
        complianceScore: 100,
      }),
    );

    const service = new LgpdSanitizerService();
    const result = await service.sanitizeText({
      rawText: 'Texto qualquer contendo CPF 987.654.321-00',
      maskLevel: 'estrito',
    });

    expect(result.requiresManualReview).toBe(true);
    expect(result.complianceScore).toBe(0);
    expect(result.sanitizedText).not.toContain('987.654.321-00');
  });

  it('quando a IA devolve um formato inválido (fora do schema), marca para revisão em vez de propagar lixo', async () => {
    mockModelResponse(JSON.stringify({ oops: 'formato inesperado' }));

    const service = new LgpdSanitizerService();
    const result = await service.sanitizeText({
      rawText: 'Texto qualquer sem PII óbvia.',
      maskLevel: 'moderado',
    });

    expect(result.requiresManualReview).toBe(true);
    expect(result.complianceScore).toBe(0);
  });

  it('quando a IA anonimiza corretamente e sem PII residual, reporta sucesso real', async () => {
    mockModelResponse(
      JSON.stringify({
        sanitizedText: '[NOME REDIGIDO], [CPF REDIGIDO], mora em [ENDEREÇO REDIGIDO].',
        detectedPersonalDataTypes: ['Nome de Pessoa Física', 'CPF', 'Endereço Residencial'],
        redactionCount: 3,
        complianceScore: 100,
      }),
    );

    const service = new LgpdSanitizerService();
    const result = await service.sanitizeText({
      rawText: 'Fulano de Tal, CPF 123.456.789-00, mora na Rua das Flores, 123.',
      maskLevel: 'estrito',
    });

    expect(result.requiresManualReview).toBe(false);
    expect(result.complianceScore).toBe(100);
  });
});
