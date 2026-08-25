/**
 * Qualidade do CRM (Fase 7) — completude bruta por campo, "Confiabilidade dos Dados" ponderada
 * (`dataReadiness.ts`), duplicidade suspeita e saúde da sincronização Bitrix24
 * (`bitrixSyncHealthReport.ts`).
 */

import type { CommercialIntelligenceFilter, CommercialIntelligenceRepository, CrmQualityIndex, DealRow } from '../../domain/CommercialIntelligence';
import { computeDataReadiness } from '../dataReadiness';
import { roundMoney } from '../shared/mathUtils';
import { loadScoredDeals } from '../scoring/dealScoring';
import { applyScope } from '../scoring/scopeFilter';
import { isDealOpen } from '../pipelineEligibility';
import { computeBitrixSyncHealth } from './bitrixSyncHealthReport';

const FIELD_CHECKS: Array<{ field: string; label: string; test: (d: DealRow) => boolean }> = [
    { field: 'owner', label: 'Responsável', test: (d) => !!d.owner },
    { field: 'amount', label: 'Valor', test: (d) => d.amount > 0 },
    { field: 'companyId', label: 'Empresa', test: (d) => !!d.companyId },
    { field: 'contactId', label: 'Contato', test: (d) => !!d.contactId },
    { field: 'companyCnpj', label: 'CNPJ', test: (d) => !!d.companyCnpj },
    { field: 'pipelineStageId', label: 'Etapa', test: (d) => !!d.pipelineStageId },
    { field: 'expectedCloseAt', label: 'Data prevista', test: (d) => !!d.expectedCloseAt },
    { field: 'nextAction', label: 'Próxima ação', test: (d) => !!d.nextAction },
    { field: 'lastInteraction', label: 'Última atividade', test: (d) => !!d.lastInteraction },
    { field: 'source', label: 'Origem', test: (d) => !!d.source },
];

export async function buildCrmQuality(
    repository: CommercialIntelligenceRepository,
    organizationId: string,
    filter: CommercialIntelligenceFilter,
    now: Date
): Promise<CrmQualityIndex> {
    // Aging/crmQuality ignoravam o filtro de owner (liam deals/history direto do repositório em
    // vez de passar por applyScope) — corrigido usando o mesmo padrão de loadScoredDeals +
    // applyScope já usado pelo restante do módulo.
    const { scored, history } = await loadScoredDeals(repository, organizationId, now);
    const inScope = applyScope(scored, filter);
    const open = inScope.filter((s) => isDealOpen(s.deal)).map((s) => s.deal);
    const lost = inScope.filter((s) => s.deal.stageIsLost).map((s) => s.deal);
    const historyLeadIds = new Set(history.map((h) => h.leadId));

    const fields = FIELD_CHECKS.map(({ field, label, test }) => {
        const filled = open.filter(test).length;
        return {
            field,
            label,
            filled,
            total: open.length,
            completeness: open.length > 0 ? roundMoney((filled / open.length) * 100) : null,
        };
    });

    const withCompleteness = fields.filter((f) => f.completeness != null);
    const overallScore = withCompleteness.length > 0 ? roundMoney(withCompleteness.reduce((sum, f) => sum + (f.completeness as number), 0) / withCompleteness.length) : null;

    const suspectedDuplicateGroups = await repository.countDuplicateCompanyGroupsAmongOpenDeals(organizationId);
    const bitrixSync = await computeBitrixSyncHealth(repository, organizationId, open, now);
    const dataReadiness = computeDataReadiness(open, lost, historyLeadIds);

    return {
        period: filter.month,
        overallScore,
        fields,
        dataReadiness,
        suspectedDuplicateGroups,
        evaluatedCount: open.length,
        bitrixSync,
    };
}
