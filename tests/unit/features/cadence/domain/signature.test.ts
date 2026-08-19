import { describe, it, expect } from 'vitest';
import { buildSignatureRequestDraft, isValidSignatureTransition } from '@/features/cadence/domain/signature';

/**
 * CYC-006 (onda 28) — a garantia central deste domínio é que um webhook fora de ordem ou
 * reentregue nunca reverte um estado terminal, nem pula para um estado que o fluxo real de
 * assinatura não permite.
 */

describe('isValidSignatureTransition', () => {
    it.each([
        ['created', 'sent'],
        ['created', 'cancelled'],
        ['sent', 'viewed'],
        ['sent', 'signed'],
        ['sent', 'declined'],
        ['sent', 'expired'],
        ['sent', 'cancelled'],
        ['viewed', 'signed'],
        ['viewed', 'declined'],
    ] as const)('%s → %s: permitido', (current, next) => {
        expect(isValidSignatureTransition(current, next)).toBe(true);
    });

    it.each(['signed', 'declined', 'expired', 'cancelled'] as const)(
        'estado terminal (%s): nenhuma transição é permitida (webhook atrasado nunca reverte)',
        (terminal) => {
            expect(isValidSignatureTransition(terminal, 'sent')).toBe(false);
            expect(isValidSignatureTransition(terminal, 'viewed')).toBe(false);
            expect(isValidSignatureTransition(terminal, 'signed')).toBe(false);
        },
    );

    it('created → viewed: rejeitado (pula etapa que o fluxo real não anuncia sem passar por sent)', () => {
        expect(isValidSignatureTransition('created', 'viewed')).toBe(false);
    });

    it('created → signed: rejeitado (não é possível assinar sem o provedor ter enviado)', () => {
        expect(isValidSignatureTransition('created', 'signed')).toBe(false);
    });
});

describe('buildSignatureRequestDraft', () => {
    it('monta o rascunho com os campos opcionais normalizados para null quando ausentes', () => {
        const draft = buildSignatureRequestDraft({
            organizationId: 'org-1',
            documentId: 'doc-1',
            provider: 'govbr',
            signerEmail: 'signer@exemplo.com',
        });

        expect(draft).toEqual({
            organizationId: 'org-1',
            documentId: 'doc-1',
            provider: 'govbr',
            signerEmail: 'signer@exemplo.com',
            signerName: null,
            requestedBy: null,
        });
    });

    it('preserva signerName/requestedBy quando informados', () => {
        const draft = buildSignatureRequestDraft({
            organizationId: 'org-1',
            documentId: 'doc-1',
            provider: 'govbr',
            signerEmail: 'signer@exemplo.com',
            signerName: 'Fulano',
            requestedBy: 'user-1',
        });

        expect(draft.signerName).toBe('Fulano');
        expect(draft.requestedBy).toBe('user-1');
    });
});
