import type { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  computeDataQualityReport,
  type DataQualityReportRawInput,
} from '../server/dataQualityReport.service';

const NOW = new Date('2026-08-27T12:00:00Z');

function emptyInput(overrides: Partial<DataQualityReportRawInput> = {}): DataQualityReportRawInput {
  return {
    now: NOW,
    totalAccounts: 0,
    latestSnapshots: [],
    evidenceByType: [],
    totalEvidence: 0,
    evidenceAccountCount: 0,
    signalsByType: [],
    signalsByStatus: [],
    totalSignals: 0,
    signalAccountCount: 0,
    decisionMakerTotal: 0,
    decisionMakerVerifiedCount: 0,
    decisionMakerByStatus: [],
    relationshipTotal: 0,
    relationshipByStatus: [],
    ...overrides,
  };
}

describe('dataQualityReport.computeDataQualityReport — sem dados suficientes', () => {
  it('marca todas as seções como indisponíveis, com motivo, quando o tenant não tem nenhum dado', () => {
    const report = computeDataQualityReport(emptyInput());

    expect(report.accountCoverage).toEqual({
      available: false,
      reason: 'sem_contas_cadastradas_no_tenant',
      totalAccounts: 0,
      accountsWithSnapshot: null,
      accountsWithoutSnapshot: null,
      coveragePct: null,
      byStatus: null,
    });
    expect(report.sourceStatus.available).toBe(false);
    expect(report.sourceStatus.reason).toBe('nenhuma_conta_possui_snapshot_ainda');
    expect(report.snapshotFreshness.available).toBe(false);
    expect(report.snapshotFreshness.reason).toBe('nenhuma_conta_possui_snapshot_ainda');
    expect(report.evidenceCoverage).toEqual({
      available: false,
      reason: 'nenhuma_evidencia_registrada_no_tenant',
      totalEvidence: 0,
      accountsWithEvidence: null,
      byEvidenceType: null,
    });
    expect(report.signalCoverage).toEqual({
      available: false,
      reason: 'nenhum_sinal_registrado_no_tenant',
      totalSignals: 0,
      accountsWithSignals: null,
      byType: null,
      byStatus: null,
    });
    expect(report.decisionMakerVerification).toEqual({
      available: false,
      reason: 'nenhum_decisor_registrado_no_tenant',
      total: 0,
      verifiedCount: null,
      unverifiedCount: null,
      verifiedRatePct: null,
      byStatus: null,
    });
    expect(report.relationshipVerification).toEqual({
      available: false,
      reason: 'nenhuma_relacao_economica_registrada_no_tenant',
      total: 0,
      verifiedCount: null,
      nonVerifiedCount: null,
      verifiedRatePct: null,
      byStatus: null,
    });
    // Nunca fabrica número: nenhuma seção indisponível carrega um valor numérico.
    expect(report.generatedAt).toBe(NOW.toISOString());
  });

  it('conta cadastrada sem nenhum snapshot ainda: cobertura fica disponível com 0%, mas sourceStatus/freshness continuam indisponíveis (populações diferentes)', () => {
    const report = computeDataQualityReport(emptyInput({ totalAccounts: 3 }));

    expect(report.accountCoverage).toEqual({
      available: true,
      reason: null,
      totalAccounts: 3,
      accountsWithSnapshot: 0,
      accountsWithoutSnapshot: 3,
      coveragePct: 0,
      byStatus: {},
    });
    // A ausência TOTAL de snapshot (não apenas cobertura parcial) ainda impede calcular
    // sourceStatus/freshness — não existe "snapshot mais recente" nenhum para descrever.
    expect(report.sourceStatus.available).toBe(false);
    expect(report.snapshotFreshness.available).toBe(false);
  });
});

describe('dataQualityReport.computeDataQualityReport — com dados reais mockados', () => {
  const richInput: DataQualityReportRawInput = {
    now: NOW,
    totalAccounts: 5,
    latestSnapshots: [
      {
        companyId: 'c1',
        status: 'Complete',
        generatedAt: new Date('2026-08-25T12:00:00Z'), // 2 dias
        expiresAt: new Date('2026-09-25T12:00:00Z'), // no futuro
        sourceStatus: { crm: { status: 'available' }, enrichment: { status: 'available' } },
      },
      {
        companyId: 'c2',
        status: 'Partial',
        generatedAt: new Date('2026-08-20T12:00:00Z'), // 7 dias
        expiresAt: null,
        sourceStatus: { crm: { status: 'available' }, enrichment: { status: 'not_available' } },
      },
      {
        companyId: 'c3',
        status: 'Stale',
        generatedAt: new Date('2026-07-01T12:00:00Z'), // 57 dias
        expiresAt: new Date('2026-08-01T12:00:00Z'), // no passado
        sourceStatus: { crm: { status: 'available' }, enrichment: { status: 'failed' } },
      },
      {
        companyId: 'c4',
        status: 'Failed',
        generatedAt: new Date('2026-08-26T12:00:00Z'), // 1 dia
        expiresAt: null,
        // Formato inesperado/corrompido: nunca deve virar "available" por suposição.
        sourceStatus: 'not-an-object' as unknown as Prisma.JsonValue,
      },
    ],
    evidenceByType: [
      { key: 'FACT', count: 7 },
      { key: 'INFERENCE', count: 3 },
    ],
    totalEvidence: 10,
    evidenceAccountCount: 4,
    signalsByType: [
      { key: 'PRICE_CHANGE', count: 4 },
      { key: 'HIRING', count: 2 },
    ],
    signalsByStatus: [
      { key: 'Active', count: 5 },
      { key: 'Dismissed', count: 1 },
    ],
    totalSignals: 6,
    signalAccountCount: 3,
    decisionMakerTotal: 8,
    decisionMakerVerifiedCount: 5,
    decisionMakerByStatus: [
      { key: 'Active', count: 5 },
      { key: 'Unverified', count: 3 },
    ],
    relationshipTotal: 4,
    relationshipByStatus: [
      { key: 'Verified', count: 1 },
      { key: 'Inferred', count: 3 },
    ],
  };

  it('agrega cobertura de contas (1 de 5 sem snapshot) e a distribuição de status do snapshot mais recente', () => {
    const report = computeDataQualityReport(richInput);
    expect(report.accountCoverage).toEqual({
      available: true,
      reason: null,
      totalAccounts: 5,
      accountsWithSnapshot: 4,
      accountsWithoutSnapshot: 1,
      coveragePct: 80,
      byStatus: { Complete: 1, Partial: 1, Stale: 1, Failed: 1 },
    });
  });

  it('agrega sourceStatus (crm/enrichment) do snapshot mais recente de cada conta, sem promover formato inesperado a "available"', () => {
    const report = computeDataQualityReport(richInput);
    expect(report.sourceStatus).toEqual({
      available: true,
      reason: null,
      accountsConsidered: 4,
      crm: { available: 3, failed: 0, notAvailable: 0, unknown: 1, total: 4 },
      enrichment: { available: 1, failed: 1, notAvailable: 1, unknown: 1, total: 4 },
    });
  });

  it('calcula idade média/mín/máx do snapshot mais recente e conta obsolescência por dois critérios independentes', () => {
    const report = computeDataQualityReport(richInput);
    expect(report.snapshotFreshness.available).toBe(true);
    expect(report.snapshotFreshness.accountsConsidered).toBe(4);
    expect(report.snapshotFreshness.averageAgeDays).toBeCloseTo(16.75, 5);
    expect(report.snapshotFreshness.oldestAgeDays).toBeCloseTo(57, 5);
    expect(report.snapshotFreshness.newestAgeDays).toBeCloseTo(1, 5);
    // status Stale explícito
    expect(report.snapshotFreshness.staleByStatusCount).toBe(1);
    // expiresAt no passado (independente do campo status)
    expect(report.snapshotFreshness.staleByExpiresAtCount).toBe(1);
  });

  it('agrega cobertura de IntelligenceEvidence e AccountSignal por tipo/status', () => {
    const report = computeDataQualityReport(richInput);
    expect(report.evidenceCoverage).toEqual({
      available: true,
      reason: null,
      totalEvidence: 10,
      accountsWithEvidence: 4,
      byEvidenceType: { FACT: 7, INFERENCE: 3 },
    });
    expect(report.signalCoverage).toEqual({
      available: true,
      reason: null,
      totalSignals: 6,
      accountsWithSignals: 3,
      byType: { PRICE_CHANGE: 4, HIRING: 2 },
      byStatus: { Active: 5, Dismissed: 1 },
    });
  });

  it('calcula taxa de decisores verificados (verifiedAt preenchido) vs. não verificados', () => {
    const report = computeDataQualityReport(richInput);
    expect(report.decisionMakerVerification).toEqual({
      available: true,
      reason: null,
      total: 8,
      verifiedCount: 5,
      unverifiedCount: 3,
      verifiedRatePct: 62.5,
      byStatus: { Active: 5, Unverified: 3 },
    });
  });

  it('calcula taxa de relações econômicas verificadas (status=Verified) vs. não verificadas, sem tratar Inferred como verificado', () => {
    const report = computeDataQualityReport(richInput);
    expect(report.relationshipVerification).toEqual({
      available: true,
      reason: null,
      total: 4,
      verifiedCount: 1,
      nonVerifiedCount: 3,
      verifiedRatePct: 25,
      byStatus: { Verified: 1, Inferred: 3 },
    });
  });

  it('quando nenhuma relação está Verified, a taxa é 0% e não null (0 é um dado real, não ausência de dado)', () => {
    const report = computeDataQualityReport({
      ...richInput,
      relationshipByStatus: [{ key: 'Inferred', count: 4 }],
    });
    expect(report.relationshipVerification.verifiedCount).toBe(0);
    expect(report.relationshipVerification.verifiedRatePct).toBe(0);
  });
});
