/**
 * CYC-006 (onda 28) — assinatura eletrônica de documento comercial. Decisão de produto já
 * documentada em `prisma/schema.prisma` (comentário de `CrmDocumentSignatureRequest`): provedor
 * real é a Assinatura Eletrônica gov.br, mas o schema (e este domínio) ficam agnósticos de
 * propósito — `provider` é texto livre, nunca um enum fechado.
 *
 * O único portão de decisão real que este módulo cobre: uma atualização de status de um provedor
 * de assinatura chega por webhook, potencialmente fora de ordem ou reentregue (mesmo risco de
 * qualquer webhook externo) — `isValidSignatureTransition` garante que um evento atrasado
 * ("Sent" chegando depois de "Signed" já aplicado) nunca reverte um estado terminal, e que uma
 * transição nunca pula para um estado que o fluxo real de assinatura não permite.
 */

export type SignatureStatus = 'created' | 'sent' | 'viewed' | 'signed' | 'declined' | 'expired' | 'cancelled';

const TERMINAL_STATUSES = new Set<SignatureStatus>(['signed', 'declined', 'expired', 'cancelled']);

/** Transições permitidas do fluxo real de assinatura eletrônica — nunca a partir de um estado terminal. */
const ALLOWED_TRANSITIONS: Record<SignatureStatus, SignatureStatus[]> = {
    created: ['sent', 'cancelled'],
    sent: ['viewed', 'signed', 'declined', 'expired', 'cancelled'],
    viewed: ['signed', 'declined', 'expired', 'cancelled'],
    signed: [],
    declined: [],
    expired: [],
    cancelled: [],
};

/** Único portão de decisão: `false` significa "ignore esta atualização silenciosamente" — nunca "aplique mesmo assim". */
export function isValidSignatureTransition(current: SignatureStatus, next: SignatureStatus): boolean {
    if (TERMINAL_STATUSES.has(current)) return false;
    return ALLOWED_TRANSITIONS[current].includes(next);
}

export interface SignatureRequestDraft {
    organizationId: string;
    documentId: string;
    provider: string;
    signerEmail: string;
    signerName: string | null;
    requestedBy: string | null;
}

/**
 * Monta o rascunho de uma solicitação de assinatura — não valida nada sozinho (o chamador
 * garante que o documento existe e o signerEmail é real, mesmo raciocínio de
 * `buildCalendarEventDraft` em `scheduling.ts`).
 */
export function buildSignatureRequestDraft(input: {
    organizationId: string;
    documentId: string;
    provider: string;
    signerEmail: string;
    signerName?: string | null;
    requestedBy?: string | null;
}): SignatureRequestDraft {
    return {
        organizationId: input.organizationId,
        documentId: input.documentId,
        provider: input.provider,
        signerEmail: input.signerEmail,
        signerName: input.signerName ?? null,
        requestedBy: input.requestedBy ?? null,
    };
}
