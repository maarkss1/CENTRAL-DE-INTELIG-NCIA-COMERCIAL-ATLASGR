/**
 * Aplica o `CommercialIntelligenceFilter` (owner/source/ICP/produto/empresa) sobre negócios já
 * pontuados (`ScoredDeal`) — único ponto de "escopo" reaproveitado por todos os relatórios, para
 * que um filtro nunca seja interpretado de forma diferente em duas telas.
 */

import type { CommercialIntelligenceFilter } from '../../domain/CommercialIntelligence';
import type { ScoredDeal } from './dealScoring';

export function applyScope(scored: ScoredDeal[], filter: CommercialIntelligenceFilter): ScoredDeal[] {
    return scored.filter((s) => {
        if (filter.owner && s.deal.owner !== filter.owner) return false;
        if (filter.source && s.deal.source !== filter.source) return false;
        // O ICP / Produto ainda não estão em DealRow, precisaremos adicioná-los no findDeals.
        if (filter.icp && s.deal.icp !== filter.icp) return false;
        if (filter.product && !s.deal.productSkus?.includes(filter.product)) return false;
        if (filter.company && s.deal.companyName !== filter.company) return false;
        return true;
    });
}
