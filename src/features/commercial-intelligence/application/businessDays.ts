/**
 * Contagem de dias úteis (seção 17-19 do Cockpit legado — `js/cockpit.js`,
 * `cockpitCalcularGeracaoPipeline`; `ehDiaUtilISO` em `js/sdr.js`), reimplementada em TS puro para
 * o Pipeline Creation Pace (`PipelineCreation.businessDaysElapsed`/`businessDaysTotal`/
 * `expectedByNow`/`pacePercent` em `CommercialIntelligence.ts`).
 *
 * Dia útil = segunda a sexta. Sem calendário de feriados nacional/municipal configurado no
 * produto — mesma simplificação documentada na fonte (`ehDiaUtilISO`), não um esquecimento aqui.
 * Todas as datas são tratadas em UTC (meia-noite), consistente com `monthRange` em
 * `CommercialIntelligenceUseCases.ts`.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function isBusinessDayUTC(date: Date): boolean {
    const day = date.getUTCDay();
    return day >= 1 && day <= 5;
}

/** Conta dias úteis no intervalo [start, end) — end exclusivo, mesma convenção de `monthRange`. */
export function countBusinessDays(start: Date, end: Date): number {
    let count = 0;
    for (let t = start.getTime(); t < end.getTime(); t += DAY_MS) {
        if (isBusinessDayUTC(new Date(t))) count++;
    }
    return count;
}

/**
 * Dias úteis já decorridos em [start, end), contando o dia de `now` como decorrido (mesma
 * semântica do Cockpit legado: `iso <= hojeISO`). Mês inteiramente no futuro em relação a `now` →
 * 0 decorridos. Mês inteiramente no passado → decorridos = total do intervalo (mês fechado).
 */
export function countBusinessDaysElapsed(start: Date, end: Date, now: Date): number {
    const nowDateOnly = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const elapsedEndRaw = new Date(nowDateOnly.getTime() + DAY_MS); // exclusivo, cobre o dia de "hoje"
    const elapsedEnd = elapsedEndRaw < end ? elapsedEndRaw : end;
    if (elapsedEnd <= start) return 0;
    return countBusinessDays(start, elapsedEnd);
}
