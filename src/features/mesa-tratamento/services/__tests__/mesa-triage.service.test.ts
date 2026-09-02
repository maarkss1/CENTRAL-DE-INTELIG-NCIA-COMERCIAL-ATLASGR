import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IncidentAlertInput } from '../mesa-triage.service';

/**
 * Regressão de um bug P0 real: um sinistro real (violação de trava de baú em zona de alto risco)
 * podia ser classificado como P2 (médio risco) sem lockdown nem acionamento de autoridade — tanto
 * no fallback de indisponibilidade da IA quanto quando a própria IA rebaixava incorretamente a
 * severidade no caminho normal. Estes testes provam o piso de severidade determinístico.
 */
vi.mock('../../../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { MesaTriageService } = await import('../mesa-triage.service');
const gateway = await import('../../../../lib/ai/gateway.js');

afterEach(() => {
  vi.restoreAllMocks();
});

const travaAltoRisco: IncidentAlertInput = {
  alertId: 'alert-1',
  vehiclePlate: 'ABC1D23',
  clientName: 'Cliente Teste',
  alertType: 'Violação de Trava de Baú',
  telemetryDataSummary: 'Sensor de trava disparado às 14:32.',
  riskZoneClassification: 'Zona de Alto Risco',
};

function mockModelResponse(content: string) {
  vi.spyOn(gateway, 'getAiModel').mockReturnValue({
    invoke: vi.fn().mockResolvedValue({
      content,
      response_metadata: { model: 'test-model', tokenUsage: {} },
    }),
  } as unknown as ReturnType<typeof gateway.getAiModel>);
  vi.spyOn(gateway, 'logAiUsage').mockResolvedValue(undefined);
}

describe('MesaTriageService — piso de severidade determinístico', () => {
  it('fallback: escalona para P0 com lockdown/autoridade quando a IA falha num sinistro real', async () => {
    vi.spyOn(gateway, 'getAiModel').mockReturnValue({
      invoke: vi.fn().mockRejectedValue(new Error('provedor indisponível')),
    } as unknown as ReturnType<typeof gateway.getAiModel>);

    const service = new MesaTriageService();
    const result = await service.triageIncident(travaAltoRisco);

    expect(result.severityLevel).toBe('P0 - Emergência Máxima / Sinistro Iminente');
    expect(result.shouldTriggerAutomaticLockdown).toBe(true);
    expect(result.contactAuthorityRecommendation).toBe(true);
  });

  it('caminho normal: eleva a severidade quando a IA rebaixa incorretamente um sinistro crítico', async () => {
    mockModelResponse(
      JSON.stringify({
        severityLevel: 'P2 - Médio Risco',
        immediateStandardOperatingProcedure: ['Checagem padrão.'],
        shouldTriggerAutomaticLockdown: false,
        contactAuthorityRecommendation: false,
        operatorChecklist: [],
        incidentBriefing: 'Sem gravidade aparente.',
      }),
    );

    const service = new MesaTriageService();
    const result = await service.triageIncident(travaAltoRisco);

    expect(result.severityLevel).toBe('P0 - Emergência Máxima / Sinistro Iminente');
    expect(result.shouldTriggerAutomaticLockdown).toBe(true);
    expect(result.contactAuthorityRecommendation).toBe(true);
  });

  it('caminho normal: não interfere quando a IA já classifica corretamente um alerta de baixo risco', async () => {
    mockModelResponse(
      JSON.stringify({
        severityLevel: 'P3 - Informativo / Operacional',
        immediateStandardOperatingProcedure: ['Nenhuma ação necessária.'],
        shouldTriggerAutomaticLockdown: false,
        contactAuthorityRecommendation: false,
        operatorChecklist: [],
        incidentBriefing: 'Perda de sinal em subsolo conhecido — alerta falso comum.',
      }),
    );

    const service = new MesaTriageService();
    const result = await service.triageIncident({
      alertId: 'alert-2',
      vehiclePlate: 'XYZ9Z99',
      clientName: 'Cliente Teste',
      alertType: 'Perda de Sinal em Subsolo Conhecido',
      telemetryDataSummary:
        'Sinal de GPS perdido por 2 minutos em túnel mapeado, sem outras anomalias.',
      riskZoneClassification: 'Zona de Baixo Risco',
    });

    expect(result.severityLevel).toBe('P3 - Informativo / Operacional');
    expect(result.shouldTriggerAutomaticLockdown).toBe(false);
  });

  it('caminho normal: corrige severityLevel fora do enum para um piso seguro em vez de propagar lixo', async () => {
    mockModelResponse(
      JSON.stringify({
        severityLevel: 'gravidade alta',
        immediateStandardOperatingProcedure: [],
        shouldTriggerAutomaticLockdown: false,
        contactAuthorityRecommendation: false,
        operatorChecklist: [],
        incidentBriefing: 'Saída fora do formato esperado.',
      }),
    );

    const service = new MesaTriageService();
    const result = await service.triageIncident(travaAltoRisco);

    // Mesmo com severityLevel inválido, o piso de trava+zona de alto risco ainda escalona pra P0.
    expect(result.severityLevel).toBe('P0 - Emergência Máxima / Sinistro Iminente');
  });
});
