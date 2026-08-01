import { describe, it, expect } from 'vitest';
import {
    dayKey, dayKeyToDate, isSameDay, addMonths,
    buildMonthGrid, monthGridRange, moveToDay, groupByDay,
} from '../calendar.util';

describe('dayKey', () => {
    it('usa o fuso local e preenche com zero à esquerda', () => {
        expect(dayKey(new Date(2026, 6, 5))).toBe('2026-07-05');
    });

    it('não desloca o dia perto da meia-noite (o bug clássico de usar toISOString)', () => {
        // 23:30 local: com toISOString em fuso negativo isso viraria o dia seguinte.
        expect(dayKey(new Date(2026, 6, 31, 23, 30))).toBe('2026-07-31');
        expect(dayKey(new Date(2026, 6, 1, 0, 15))).toBe('2026-07-01');
    });

    it('faz ida e volta com dayKeyToDate', () => {
        const original = new Date(2026, 11, 25);
        expect(isSameDay(dayKeyToDate(dayKey(original)), original)).toBe(true);
    });
});

describe('addMonths', () => {
    it('avança e retrocede o mês', () => {
        expect(dayKey(addMonths(new Date(2026, 6, 15), 1))).toBe('2026-08-01');
        expect(dayKey(addMonths(new Date(2026, 6, 15), -1))).toBe('2026-06-01');
    });

    it('não pula fevereiro ao sair de um dia 31', () => {
        // O bug seria 31/jan + 1 mês = 03/mar.
        expect(dayKey(addMonths(new Date(2026, 0, 31), 1))).toBe('2026-02-01');
    });

    it('cruza a virada de ano', () => {
        expect(dayKey(addMonths(new Date(2026, 11, 10), 1))).toBe('2027-01-01');
        expect(dayKey(addMonths(new Date(2026, 0, 10), -1))).toBe('2025-12-01');
    });
});

describe('buildMonthGrid', () => {
    it('devolve sempre 42 dias, para a grade não mudar de altura', () => {
        for (const month of [0, 1, 5, 11]) {
            expect(buildMonthGrid(new Date(2026, month, 1))).toHaveLength(42);
        }
    });

    it('começa no domingo', () => {
        expect(buildMonthGrid(new Date(2026, 6, 1))[0].getDay()).toBe(0);
    });

    it('contém todos os dias do mês de referência', () => {
        const grid = buildMonthGrid(new Date(2026, 1, 1)); // fevereiro/2026
        const chaves = new Set(grid.map(dayKey));
        expect(chaves.has('2026-02-01')).toBe(true);
        expect(chaves.has('2026-02-28')).toBe(true);
    });

    it('inclui os dias vizinhos que completam a primeira e a última semana', () => {
        // 01/07/2026 é quarta, então a grade abre no domingo 28/06.
        const grid = buildMonthGrid(new Date(2026, 6, 1));
        expect(dayKey(grid[0])).toBe('2026-06-28');
    });
});

describe('monthGridRange', () => {
    it('cobre a grade inteira e termina no dia seguinte ao último (intervalo aberto)', () => {
        const grid = buildMonthGrid(new Date(2026, 6, 1));
        const { from, to } = monthGridRange(new Date(2026, 6, 1));

        expect(dayKey(from)).toBe(dayKey(grid[0]));
        expect(from.getHours()).toBe(0);
        // `to` é exclusivo: o último dia da grade ainda cai dentro do intervalo.
        expect(to.getTime()).toBeGreaterThan(grid[41].getTime());
        expect(Math.round((to.getTime() - from.getTime()) / 86_400_000)).toBe(42);
    });
});

describe('moveToDay', () => {
    it('troca o dia preservando o horário marcado', () => {
        const original = new Date(2026, 6, 10, 14, 30);
        const movida = moveToDay(original, '2026-07-22');

        expect(dayKey(movida)).toBe('2026-07-22');
        expect(movida.getHours()).toBe(14);
        expect(movida.getMinutes()).toBe(30);
    });

    it('aceita a data em string ISO, como vem da API', () => {
        const movida = moveToDay(new Date(2026, 6, 10, 9, 5).toISOString(), '2026-08-03');
        expect(dayKey(movida)).toBe('2026-08-03');
        expect(movida.getHours()).toBe(9);
    });

    it('atravessa meses e anos', () => {
        const movida = moveToDay(new Date(2026, 11, 31, 8, 0), '2027-01-02');
        expect(dayKey(movida)).toBe('2027-01-02');
        expect(movida.getHours()).toBe(8);
    });
});

describe('groupByDay', () => {
    it('agrupa por dia e ordena cronologicamente dentro de cada um', () => {
        const grupos = groupByDay([
            { id: 'b', date: new Date(2026, 6, 10, 16, 0).toISOString() },
            { id: 'a', date: new Date(2026, 6, 10, 9, 0).toISOString() },
            { id: 'c', date: new Date(2026, 6, 11, 8, 0).toISOString() },
        ]);

        expect(grupos.get('2026-07-10')!.map((i) => i.id)).toEqual(['a', 'b']);
        expect(grupos.get('2026-07-11')!.map((i) => i.id)).toEqual(['c']);
    });

    it('devolve mapa vazio para lista vazia', () => {
        expect(groupByDay([]).size).toBe(0);
    });
});
