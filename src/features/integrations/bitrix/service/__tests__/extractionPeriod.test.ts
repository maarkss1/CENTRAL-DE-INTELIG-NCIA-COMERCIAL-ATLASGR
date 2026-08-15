import { describe, it, expect } from 'vitest';
import { resolvePeriodRange, InvalidExtractionPeriodError, EXTRACTION_PERIODS } from '../extractionPeriod.js';

// "now" fixo para todo o arquivo: 15/08/2026 14:30 UTC = 11:30 em Brasília (UTC-03:00) — meio do
// dia, meio do mês, meio do 3º trimestre (Q3 = jul/ago/set) e do 2º semestre, escolhido de
// propósito para não cair em nenhuma borda de calendário por acidente.
const NOW = new Date('2026-08-15T14:30:00.000Z');

describe('resolvePeriodRange — cada preset obrigatório da spec de extrações (06A, seção 9)', () => {
    it('EXTRACTION_PERIODS lista os 7 presets exigidos pela spec', () => {
        expect(EXTRACTION_PERIODS).toEqual(['today', 'last7days', 'thisMonth', 'thisQuarter', 'thisSemester', 'all', 'custom']);
    });

    it('"all" não filtra nada (null)', () => {
        expect(resolvePeriodRange('all', {}, NOW)).toBeNull();
    });

    it('"today" começa à meia-noite de Brasília (03:00 UTC) do dia corrente e vai até agora', () => {
        const range = resolvePeriodRange('today', {}, NOW)!;
        expect(range.from.toISOString()).toBe('2026-08-15T03:00:00.000Z');
        expect(range.to).toBe(NOW);
    });

    it('"last7days" é uma janela corrida de 168 horas terminando agora (não um corte de calendário)', () => {
        const range = resolvePeriodRange('last7days', {}, NOW)!;
        expect(range.to).toBe(NOW);
        expect(range.to.getTime() - range.from.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('"thisMonth" começa no dia 1 do mês corrente (Brasília)', () => {
        const range = resolvePeriodRange('thisMonth', {}, NOW)!;
        expect(range.from.toISOString()).toBe('2026-08-01T03:00:00.000Z');
        expect(range.to).toBe(NOW);
    });

    it('"thisQuarter" começa no 1º mês do trimestre corrente (agosto → Q3 → julho)', () => {
        const range = resolvePeriodRange('thisQuarter', {}, NOW)!;
        expect(range.from.toISOString()).toBe('2026-07-01T03:00:00.000Z');
    });

    it('"thisSemester" começa em julho quando "now" cai no 2º semestre', () => {
        const range = resolvePeriodRange('thisSemester', {}, NOW)!;
        expect(range.from.toISOString()).toBe('2026-07-01T03:00:00.000Z');
    });

    it('"thisSemester" começa em janeiro quando "now" cai no 1º semestre', () => {
        const range = resolvePeriodRange('thisSemester', {}, new Date('2026-03-10T12:00:00.000Z'))!;
        expect(range.from.toISOString()).toBe('2026-01-01T03:00:00.000Z');
    });

    it('"thisQuarter" começa em outubro no 4º trimestre (dezembro → Q4 → outubro)', () => {
        const range = resolvePeriodRange('thisQuarter', {}, new Date('2026-12-20T12:00:00.000Z'))!;
        expect(range.from.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    });

    it('"custom" com from+to em YYYY-MM-DD vira início/fim do dia em Brasília, intervalo inclusivo', () => {
        const range = resolvePeriodRange('custom', { from: '2026-08-01', to: '2026-08-05' }, NOW)!;
        expect(range.from.toISOString()).toBe('2026-08-01T03:00:00.000Z');
        // 05/08 23:59:59.999 em Brasília = 06/08 02:59:59.999 em UTC — se isto estivesse errado
        // (ex.: usando meia-noite UTC do dia 05), registros criados à noite do dia 05 em Brasília
        // ficariam de fora do filtro "até 05/08" sem nenhum aviso.
        expect(range.to.toISOString()).toBe('2026-08-06T02:59:59.999Z');
    });

    it('"custom" sem "to" usa "now" como limite superior', () => {
        const range = resolvePeriodRange('custom', { from: '2026-08-01' }, NOW)!;
        expect(range.to).toBe(NOW);
    });

    it('"custom" sem "from" é rejeitado', () => {
        expect(() => resolvePeriodRange('custom', {}, NOW)).toThrow(InvalidExtractionPeriodError);
    });

    it('"custom" com from depois de to é rejeitado', () => {
        expect(() => resolvePeriodRange('custom', { from: '2026-08-10', to: '2026-08-01' }, NOW)).toThrow(InvalidExtractionPeriodError);
    });

    it('"custom" com data malformada é rejeitado em vez de virar "Invalid Date" silencioso', () => {
        expect(() => resolvePeriodRange('custom', { from: 'não-é-uma-data' }, NOW)).toThrow(InvalidExtractionPeriodError);
    });

    it('aceita ISO datetime completo em "custom" (não só YYYY-MM-DD)', () => {
        const range = resolvePeriodRange('custom', { from: '2026-08-01T09:00:00.000Z', to: '2026-08-01T18:00:00.000Z' }, NOW)!;
        expect(range.from.toISOString()).toBe('2026-08-01T09:00:00.000Z');
        expect(range.to.toISOString()).toBe('2026-08-01T18:00:00.000Z');
    });
});
