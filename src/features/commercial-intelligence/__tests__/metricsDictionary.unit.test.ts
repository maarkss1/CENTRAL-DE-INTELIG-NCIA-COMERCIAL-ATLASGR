import { describe, it, expect } from 'vitest';
import { METRICS_DICTIONARY } from '../application/metricsDictionary';

describe('metricsDictionary — fonte única de verdade de fórmula/origem/limitação de cada KPI', () => {
    it('toda métrica tem os campos obrigatórios preenchidos (key, name, description, formula, source)', () => {
        for (const metric of METRICS_DICTIONARY) {
            expect(metric.key.trim()).not.toBe('');
            expect(metric.name.trim()).not.toBe('');
            expect(metric.description.trim()).not.toBe('');
            expect(metric.formula.trim()).not.toBe('');
            expect(metric.source.trim()).not.toBe('');
        }
    });

    it('não há chave duplicada — cada KPI tem um identificador único usado pelos tooltips do frontend', () => {
        const keys = METRICS_DICTIONARY.map((m) => m.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('cobre os KPIs centrais do cockpit executivo (meta, forecast, pipeline, coverage, win rate)', () => {
        const keys = new Set(METRICS_DICTIONARY.map((m) => m.key));
        for (const expected of [
            'meta_new_mrr', 'fechado', 'pct_meta', 'commit', 'best_case', 'forecast',
            'pipeline_total', 'pipeline_elegivel', 'coverage', 'pipeline_criado',
            'win_rate', 'ticket_medio', 'sales_cycle', 'aging', 'aging_etapa', 'motivos_perda',
        ]) {
            expect(keys.has(expected)).toBe(true);
        }
    });

    it('a documentação do Coverage cita explicitamente as janelas móveis de 30/60/90 dias', () => {
        const coverage = METRICS_DICTIONARY.find((m) => m.key === 'coverage');
        expect(coverage).toBeDefined();
        expect(coverage!.exclusionRules).toContain('coverage30');
        expect(coverage!.exclusionRules).toContain('coverage60');
        expect(coverage!.exclusionRules).toContain('coverage90');
    });
});
