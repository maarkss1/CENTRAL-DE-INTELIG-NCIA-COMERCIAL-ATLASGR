import { describe, it, expect } from 'vitest';
import {
    buildExecutiveExportRows,
    rowsToCsv,
    buildExecutiveExportJson,
    buildExecutiveExportHtml,
    buildExecutiveExport,
} from '../application/executiveExport';
import type { ExecutiveOverview, PerformanceMetrics, PipelineCreation, ExecutiveAlert } from '../domain/CommercialIntelligence';

const NOW = new Date('2026-08-15T12:00:00Z');

const OVERVIEW: ExecutiveOverview = {
    period: '2026-08',
    goal: { period: '2026-08', metric: 'NEW_MRR', amount: 300_000, currency: 'BRL', updatedAt: '2026-08-01T00:00:00Z', createdBy: 'user-1' },
    closedAmount: 80_000,
    closedCount: 2,
    pctOfGoal: 26.67,
    commitAmount: 100_000,
    commitCount: 1,
    bestCaseAmount: 50_000,
    bestCaseCount: 1,
    upsideAmount: 10_000,
    upsideCount: 1,
    forecastAmount: 236_000,
    gapForecast: 64_000,
    gapCommit: 120_000,
    pipelineTotal: 500_000,
    pipelineTotalCount: 10,
    pipelineEligible: 300_000,
    pipelineEligibleCount: 6,
    coverageMonth: { coverage: 1.5, coverageRecommended: 2, pipelineEligible: 300_000, remainingGoal: 200_000 },
    coverage30: { coverage: null, coverageRecommended: 2, pipelineEligible: 0, remainingGoal: 0 },
    coverage60: { coverage: null, coverageRecommended: 2, pipelineEligible: 0, remainingGoal: 0 },
    coverage90: { coverage: null, coverageRecommended: 2, pipelineEligible: 0, remainingGoal: 0 },
    coverageProtection: [],
    previousPeriod: null,
    forecastConfidence: {
        score: null,
        classification: null,
        sampleSize: 0,
        fieldCompletenessScore: null,
        stageHistoryCoverage: null,
        sampleSizePenaltyApplied: false,
    },
    isEmpty: false,
    dataAsOf: NOW.toISOString(),
};

const PERFORMANCE: PerformanceMetrics = {
    period: '2026-08',
    winRate: 50,
    wonCount: 1,
    lostCount: 1,
    opportunities: { open: 8, createdInPeriod: 3, won: 1, lost: 1, advanced: 2, stalled: 1, eligible: 6, commit: 1, bestCase: 1, atRisk: 1 },
    averageTicket: { created: 25_000, open: 40_000, won: 80_000, lost: 5_000 },
    salesCycle: { meanDays: 26, medianDays: 26, sampleSize: 2 },
    funnelHistoricalTrackingSince: null,
    funnel: [],
};

const CREATION: PipelineCreation = {
    period: '2026-08',
    count: 4,
    amount: 120_000,
    averageTicket: 30_000,
    bySource: [],
    byOwner: [],
    pipelineNeeded: 240_000,
    creationCoverage: 0.5,
    elapsedBusinessDays: 10,
    totalBusinessDays: 21,
    paceExpectedAmount: 114_285.71,
    paceGapAmount: null,
    pacePercent: 105,
};

const ALERTS: ExecutiveAlert[] = [
    { id: 'forecast-abaixo-meta', severity: 'critical', title: 'Forecast abaixo da meta', description: 'Forecast atual cobre apenas 79% da meta.', metricValue: 64_000 },
];

describe('buildExecutiveExportRows — uma linha por indicador (bloco, indicador, valor, unidade)', () => {
    it('inclui os blocos principais e nunca fabrica um valor "0" quando o dado é null', () => {
        const rows = buildExecutiveExportRows(OVERVIEW, PERFORMANCE, CREATION, ALERTS);
        const blocks = new Set(rows.map((r) => r.block));
        expect(blocks).toEqual(new Set(['Resultado do Mês', 'Forecast', 'Pipeline', 'Eficiência', 'Alertas']));

        const gapForecastRow = rows.find((r) => r.indicator === 'Gap Forecast');
        expect(gapForecastRow?.value).toBe('64000');
        expect(gapForecastRow?.unit).toBe('BRL');
    });

    it('coverage30 sem valor (null) vira "Não disponível" — nunca 0 fabricado', () => {
        const rows = buildExecutiveExportRows(OVERVIEW, PERFORMANCE, CREATION, ALERTS);
        const coverage30Row = rows.find((r) => r.indicator === 'Coverage 30 dias');
        expect(coverage30Row?.value).toBe('Não disponível');
    });

    it('inclui o ritmo de criação (pace) e os dias úteis decorridos/total do PipelineCreation', () => {
        const rows = buildExecutiveExportRows(OVERVIEW, PERFORMANCE, CREATION, ALERTS);
        const paceRow = rows.find((r) => r.indicator === 'Ritmo de criação (pace)');
        expect(paceRow?.value).toBe('105');
        const daysRow = rows.find((r) => r.indicator === 'Dias úteis decorridos / total do mês');
        expect(daysRow?.value).toBe('10/21');
    });

    it('cada alerta vira uma linha no bloco Alertas, com título e descrição preservados', () => {
        const rows = buildExecutiveExportRows(OVERVIEW, PERFORMANCE, CREATION, ALERTS);
        const alertRow = rows.find((r) => r.block === 'Alertas');
        expect(alertRow?.indicator).toBe('Forecast abaixo da meta');
        expect(alertRow?.value).toContain('79%');
    });

    it('sem alertas: uma linha informativa em vez de bloco vazio', () => {
        const rows = buildExecutiveExportRows(OVERVIEW, PERFORMANCE, CREATION, []);
        const alertRow = rows.find((r) => r.block === 'Alertas');
        expect(alertRow?.indicator).toBe('Nenhum risco identificado');
    });
});

describe('rowsToCsv — formato tabular simples (bloco;indicador;valor;unidade), compatível com Excel PT-BR', () => {
    it('usa `;` como delimitador, tem BOM UTF-8 no início e uma linha de cabeçalho', () => {
        const rows = buildExecutiveExportRows(OVERVIEW, PERFORMANCE, CREATION, ALERTS);
        const csv = rowsToCsv(rows);
        expect(csv.charCodeAt(0)).toBe(0xfeff);
        const lines = csv.replace('﻿', '').split('\r\n');
        expect(lines[0]).toBe('bloco;indicador;valor;unidade');
        expect(lines.length).toBe(rows.length + 1);
    });

    it('escapa valores com ponto-e-vírgula/aspas/quebra de linha entre aspas duplas', () => {
        const csv = rowsToCsv([{ block: 'Alertas', indicator: 'Título; com ponto e vírgula', value: 'Valor com "aspas"', unit: '' }]);
        expect(csv).toContain('"Título; com ponto e vírgula"');
        expect(csv).toContain('"Valor com ""aspas"""');
    });
});

describe('buildExecutiveExportJson — objeto completo já calculado, sem achatar campos', () => {
    it('preserva overview/performance/pipelineCreation/alerts intactos e marca generatedAt/period', () => {
        const json = buildExecutiveExportJson(OVERVIEW, PERFORMANCE, CREATION, ALERTS, NOW);
        expect(json.generatedAt).toBe(NOW.toISOString());
        expect(json.period).toBe('2026-08');
        expect(json.overview).toEqual(OVERVIEW);
        expect(json.performance).toEqual(PERFORMANCE);
        expect(json.pipelineCreation).toEqual(CREATION);
        expect(json.alerts).toEqual(ALERTS);
    });
});

describe('buildExecutiveExportHtml — relatório autônomo, sem CSS/JS externo', () => {
    it('inclui o período, os blocos de indicador e os alertas, com valores escapados', () => {
        const rows = buildExecutiveExportRows(OVERVIEW, PERFORMANCE, CREATION, ALERTS);
        const html = buildExecutiveExportHtml(rows, ALERTS, OVERVIEW.period, NOW.toISOString());
        expect(html).toContain('<!doctype html>');
        expect(html).toContain('2026-08');
        expect(html).toContain('Forecast abaixo da meta');
        expect(html).not.toContain('<script');
    });

    it('escapa caracteres HTML perigosos vindos de dados (ex.: título de alerta)', () => {
        const maliciousAlert: ExecutiveAlert = { id: 'x', severity: 'warning', title: '<img src=x onerror=alert(1)>', description: 'desc', metricValue: null };
        const html = buildExecutiveExportHtml([], [maliciousAlert], '2026-08', NOW.toISOString());
        expect(html).not.toContain('<img src=x');
        expect(html).toContain('&lt;img');
    });

    it('sem alertas, mostra a mensagem "nenhum risco identificado"', () => {
        const html = buildExecutiveExportHtml([], [], '2026-08', NOW.toISOString());
        expect(html).toContain('Nenhum risco identificado');
    });
});

describe('buildExecutiveExport — roteia para o serializador certo por formato e define mimeType/extensão', () => {
    it('csv', () => {
        const result = buildExecutiveExport('csv', OVERVIEW, PERFORMANCE, CREATION, ALERTS, NOW);
        expect(result.mimeType).toContain('text/csv');
        expect(result.fileExtension).toBe('csv');
        expect(result.content.charCodeAt(0)).toBe(0xfeff);
    });

    it('json', () => {
        const result = buildExecutiveExport('json', OVERVIEW, PERFORMANCE, CREATION, ALERTS, NOW);
        expect(result.mimeType).toContain('application/json');
        expect(result.fileExtension).toBe('json');
        expect(() => JSON.parse(result.content)).not.toThrow();
    });

    it('html', () => {
        const result = buildExecutiveExport('html', OVERVIEW, PERFORMANCE, CREATION, ALERTS, NOW);
        expect(result.mimeType).toContain('text/html');
        expect(result.fileExtension).toBe('html');
        expect(result.content).toContain('<!doctype html>');
    });
});
