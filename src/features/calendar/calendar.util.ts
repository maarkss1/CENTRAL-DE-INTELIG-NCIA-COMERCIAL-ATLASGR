/**
 * Geometria da grade do calendário — separada do componente porque é aritmética de data pura,
 * a parte mais fácil de errar e a mais fácil de testar.
 */

/** Chave estável de um dia (YYYY-MM-DD) no fuso local, usada para agrupar e como id de drop. */
export function dayKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Converte uma chave YYYY-MM-DD de volta para Date local à meia-noite. */
export function dayKeyToDate(key: string): Date {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
}

export function startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

export function isSameDay(a: Date, b: Date): boolean {
    return dayKey(a) === dayKey(b);
}

export function addMonths(date: Date, delta: number): Date {
    // Fixa o dia 1 antes de somar: senão 31/jan + 1 mês vira 03/mar (fevereiro não tem 31).
    return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

/**
 * As 6 semanas (42 dias) que cobrem o mês, começando no domingo.
 *
 * Sempre 6 linhas, mesmo quando 5 bastariam: uma grade que muda de altura ao trocar de mês faz o
 * conteúdo abaixo dela pular.
 */
export function buildMonthGrid(reference: Date): Date[] {
    const firstOfMonth = new Date(reference.getFullYear(), reference.getMonth(), 1);
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(1 - firstOfMonth.getDay());

    return Array.from({ length: 42 }, (_, i) => {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + i);
        return d;
    });
}

/** Intervalo [from, to) que cobre a grade inteira — é o que o backend recebe. */
export function monthGridRange(reference: Date): { from: Date; to: Date } {
    const grid = buildMonthGrid(reference);
    const from = startOfDay(grid[0]);
    const to = startOfDay(grid[grid.length - 1]);
    to.setDate(to.getDate() + 1);
    return { from, to };
}

/**
 * Reposiciona uma atividade num novo dia preservando o horário original.
 * Arrastar um card muda a data, não a hora marcada com o cliente.
 */
export function moveToDay(original: Date | string, targetDayKey: string): Date {
    const source = typeof original === 'string' ? new Date(original) : original;
    const target = dayKeyToDate(targetDayKey);
    target.setHours(source.getHours(), source.getMinutes(), source.getSeconds(), 0);
    return target;
}

/** Agrupa por dia, mantendo a ordem cronológica dentro de cada um. */
export function groupByDay<T extends { date: string }>(items: T[]): Map<string, T[]> {
    const map = new Map<string, T[]>();
    const sorted = [...items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    for (const item of sorted) {
        const key = dayKey(new Date(item.date));
        const bucket = map.get(key);
        if (bucket) bucket.push(item);
        else map.set(key, [item]);
    }
    return map;
}
