import type { CoverageProtectionStatus } from '../domain/CommercialIntelligence';

/**
 * Limiares-padrão de "Proteção 90 dias" (seção 11) quando ainda não há Win Rate histórico
 * calculável para derivar `coverageRecommended` (1 / Win Rate). Política inicial documentada —
 * mesmo espírito de `STAGE_AGING_CRITICAL_DAYS` — não uma medição. Quando há Win Rate real, os
 * limiares saudável/atenção usam `coverageRecommended` no lugar destes.
 */
export const COVERAGE_PROTECTION_FALLBACK_HEALTHY = 3;
export const COVERAGE_PROTECTION_FALLBACK_WARNING = 1.5;

export function classifyCoverageProtection(
  hasGoal: boolean,
  coverage: number | null,
  coverageRecommended: number | null,
): CoverageProtectionStatus {
  if (!hasGoal || coverage == null) return 'sem_dados';
  if (coverageRecommended != null && coverageRecommended > 0) {
    if (coverage >= coverageRecommended) return 'saudavel';
    if (coverage >= coverageRecommended * 0.6) return 'atencao';
    return 'critico';
  }
  if (coverage >= COVERAGE_PROTECTION_FALLBACK_HEALTHY) return 'saudavel';
  if (coverage >= COVERAGE_PROTECTION_FALLBACK_WARNING) return 'atencao';
  return 'critico';
}
