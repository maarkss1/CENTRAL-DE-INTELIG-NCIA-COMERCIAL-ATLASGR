/**
 * Entrega 5 (parte 1) — proposta versionada, com histórico de versões e rastro de quem alterou o
 * quê. `.agents/prompts/17-cadencia-ciclo-receita.md`: "`CrmCommercialDocument`, `CrmProduct` e
 * `CrmDealItem` já existem no schema — comece por eles, não por um modelo novo."
 *
 * Este módulo não recria `CrmCommercialDocument` — assume que ele já existe (dono: schema
 * aprovado pelo Agente 01, hoje sem versionamento) e modela só o que falta: uma versão é uma
 * fotografia imutável do documento em um instante, e `nextVersionNumber` é a única forma
 * permitida de avançar o histórico (nunca sobrescrever uma versão existente).
 */

export interface ProposalLineItem {
    name: string;
    sku: string | null;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    taxPercent: number;
    total: number;
}

/** Espelha os campos monetários/de conteúdo de `CrmCommercialDocument` que fazem sentido versionar — não os campos operacionais (status, publicToken). */
export interface ProposalSnapshot {
    title: string;
    currency: string;
    lineItems: ProposalLineItem[];
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    notes: string | null;
    terms: string | null;
}

export interface ProposalVersion {
    id: string;
    documentId: string;
    versionNumber: number;
    snapshot: ProposalSnapshot;
    changedBy: string | null;
    changeReason: string | null;
    createdAt: Date;
}

/** Recalcula o total a partir dos itens — a mesma disciplina de nunca confiar num total "informado" sem recomputar (evita divergência silenciosa entre itens e total exibido). */
export function computeLineItemTotal(item: Pick<ProposalLineItem, 'quantity' | 'unitPrice' | 'discountPercent' | 'taxPercent'>): number {
    const gross = item.quantity * item.unitPrice;
    const afterDiscount = gross * (1 - item.discountPercent / 100);
    const afterTax = afterDiscount * (1 + item.taxPercent / 100);
    return Math.round(afterTax * 100) / 100;
}

export function computeSnapshotTotals(lineItems: ProposalLineItem[]): { subtotal: number; total: number } {
    const subtotal = Math.round(lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * 100) / 100;
    const total = Math.round(lineItems.reduce((sum, item) => sum + computeLineItemTotal(item), 0) * 100) / 100;
    return { subtotal, total };
}

/** Próximo número de versão — sempre o maior existente + 1, nunca reaproveitado mesmo se versões intermediárias forem removidas (auditoria não pode ter ambiguidade). */
export function nextVersionNumber(existingVersions: ProposalVersion[]): number {
    if (existingVersions.length === 0) return 1;
    return Math.max(...existingVersions.map((v) => v.versionNumber)) + 1;
}

export interface CreateProposalVersionInput {
    documentId: string;
    snapshot: ProposalSnapshot;
    changedBy: string | null;
    changeReason: string | null;
}

/** Cria a estrutura da próxima versão (sem `id`/`createdAt` — atribuídos pelo repositório real). O histórico nunca é mutado: cada chamada é sempre um novo registro. */
export function draftNextProposalVersion(
    existingVersions: ProposalVersion[],
    input: CreateProposalVersionInput,
): Omit<ProposalVersion, 'id' | 'createdAt'> {
    return {
        documentId: input.documentId,
        versionNumber: nextVersionNumber(existingVersions),
        snapshot: input.snapshot,
        changedBy: input.changedBy,
        changeReason: input.changeReason,
    };
}

/** Diferença legível entre duas versões — só os campos monetários/de itens, para exibir "o que mudou" no histórico sem reprocessar o snapshot inteiro na UI. */
export interface ProposalVersionDiff {
    totalChanged: boolean;
    previousTotal: number | null;
    newTotal: number;
    itemCountChanged: boolean;
}

export function diffProposalVersions(previous: ProposalVersion | null, next: ProposalVersion): ProposalVersionDiff {
    return {
        totalChanged: previous ? previous.snapshot.total !== next.snapshot.total : true,
        previousTotal: previous?.snapshot.total ?? null,
        newTotal: next.snapshot.total,
        itemCountChanged: previous ? previous.snapshot.lineItems.length !== next.snapshot.lineItems.length : true,
    };
}
