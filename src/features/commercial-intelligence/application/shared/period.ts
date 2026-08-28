/**
 * Granularidade mensal ("YYYY-MM") do módulo — todo relatório "do mês" ancora neste período,
 * sempre calculado no fuso de Brasília (ver `shared/time/brazilCalendar.ts`, dono real da regra de
 * fuso; este arquivo só nomeia o wrapper usado pelos relatórios de Comercial Inteligente).
 */

import { brazilMonthKey, brazilMonthRange } from '../../../../shared/time/brazilCalendar.js';

export function monthRange(period: string): { start: Date; end: Date; daysInMonth: number } {
  return brazilMonthRange(period);
}

export function currentPeriod(now = new Date()): string {
  return brazilMonthKey(now);
}
