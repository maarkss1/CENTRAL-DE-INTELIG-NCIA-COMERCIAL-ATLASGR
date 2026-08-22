import type { CrmCommercialDocumentVersionDTO } from '../crm360.types';

/**
 * Diferença legível entre duas versões de um documento comercial — mesma lógica de
 * `src/features/cadence/domain/proposal.ts` (`diffProposalVersions`), reimplementada aqui sobre o
 * DTO do client (`CrmCommercialDocumentVersionDTO`) em vez de importada, para não puxar código de
 * domínio do backend para o bundle do frontend por uma função de ~5 linhas.
 */
export interface ProposalVersionDiff {
    totalChanged: boolean;
    previousTotal: number | null;
    newTotal: number;
    itemCountChanged: boolean;
}

export function diffProposalVersions(
    previous: CrmCommercialDocumentVersionDTO | null,
    next: CrmCommercialDocumentVersionDTO,
): ProposalVersionDiff {
    return {
        totalChanged: previous ? previous.snapshot.total !== next.snapshot.total : true,
        previousTotal: previous?.snapshot.total ?? null,
        newTotal: next.snapshot.total,
        itemCountChanged: previous ? previous.snapshot.lineItems.length !== next.snapshot.lineItems.length : true,
    };
}
