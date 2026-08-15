import { describe, it, expect } from 'vitest';
import {
    computeLineItemTotal,
    computeSnapshotTotals,
    nextVersionNumber,
    draftNextProposalVersion,
    diffProposalVersions,
    type ProposalLineItem,
    type ProposalVersion,
    type ProposalSnapshot,
} from '../domain/proposal';

const ITEM: ProposalLineItem = { name: 'Monitoramento de risco', sku: 'RISK-01', quantity: 2, unitPrice: 500, discountPercent: 10, taxPercent: 5, total: 945 };

function snapshot(overrides: Partial<ProposalSnapshot> = {}): ProposalSnapshot {
    return {
        title: 'Proposta Transportadora Exemplo',
        currency: 'BRL',
        lineItems: [ITEM],
        subtotal: 1000,
        discount: 100,
        tax: 45,
        total: 945,
        notes: null,
        terms: null,
        ...overrides,
    };
}

function version(versionNumber: number, overrides: Partial<ProposalVersion> = {}): ProposalVersion {
    return {
        id: `v-${versionNumber}`,
        documentId: 'doc-1',
        versionNumber,
        snapshot: snapshot(),
        changedBy: 'user-1',
        changeReason: null,
        createdAt: new Date('2026-08-03T12:00:00Z'),
        ...overrides,
    };
}

describe('computeLineItemTotal / computeSnapshotTotals', () => {
    it('aplica desconto e depois imposto, nesta ordem', () => {
        // 2 * 500 = 1000; -10% = 900; +5% = 945
        expect(computeLineItemTotal(ITEM)).toBe(945);
    });

    it('nunca confia num total informado — recomputa a partir dos itens', () => {
        const totals = computeSnapshotTotals([ITEM, { ...ITEM, quantity: 1, discountPercent: 0, taxPercent: 0 }]);
        expect(totals.subtotal).toBe(1500); // 1000 + 500
        expect(totals.total).toBe(1445); // 945 + 500
    });
});

describe('nextVersionNumber', () => {
    it('começa em 1 quando não há versão anterior', () => {
        expect(nextVersionNumber([])).toBe(1);
    });

    it('sempre maior existente + 1, mesmo com versões intermediárias ausentes', () => {
        expect(nextVersionNumber([version(1), version(3)])).toBe(4);
    });
});

describe('draftNextProposalVersion', () => {
    it('nunca reaproveita um número de versão existente', () => {
        const existing = [version(1), version(2)];
        const draft = draftNextProposalVersion(existing, {
            documentId: 'doc-1',
            snapshot: snapshot({ total: 1200 }),
            changedBy: 'user-2',
            changeReason: 'Cliente pediu desconto adicional',
        });
        expect(draft.versionNumber).toBe(3);
        expect(draft.snapshot.total).toBe(1200);
        expect(draft.changeReason).toBe('Cliente pediu desconto adicional');
    });
});

describe('diffProposalVersions', () => {
    it('primeira versão sempre conta como mudança de total', () => {
        const diff = diffProposalVersions(null, version(1));
        expect(diff.totalChanged).toBe(true);
        expect(diff.previousTotal).toBeNull();
    });

    it('detecta quando o total não mudou entre versões', () => {
        const v1 = version(1);
        const v2 = version(2, { snapshot: v1.snapshot });
        const diff = diffProposalVersions(v1, v2);
        expect(diff.totalChanged).toBe(false);
        expect(diff.previousTotal).toBe(v1.snapshot.total);
    });

    it('detecta mudança de total e de quantidade de itens', () => {
        const v1 = version(1);
        const v2 = version(2, { snapshot: snapshot({ total: 2000, lineItems: [ITEM, ITEM] }) });
        const diff = diffProposalVersions(v1, v2);
        expect(diff.totalChanged).toBe(true);
        expect(diff.itemCountChanged).toBe(true);
        expect(diff.newTotal).toBe(2000);
    });
});
