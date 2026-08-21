import { randomUUID } from 'node:crypto';
import { logger } from '../../../lib/logger.js';
import type { SignatureProviderPort } from '../application/documentSignature.js';
import type { SignatureRequestDraft } from '../domain/signature.js';

/**
 * CYC-006 (onda 28) — implementação real de `SignatureProviderPort` para o provedor `'govbr'`
 * (Assinatura Eletrônica gov.br, decisão de produto já documentada no schema). **Stub de
 * transporte** — mesma categoria de CYC-003/CYC-004: nenhuma chamada real à API do gov.br
 * acontece ainda (nenhuma credencial de integrador está configurada neste projeto). Devolve um
 * `providerRequestId` sintético e loga como tal. Tudo em volta — criação da solicitação, guardrail
 * de transição de status (`isValidSignatureTransition`), webhook de entrada real
 * (`signatureStatus.webhook.ts`) — é real: plugar o provedor de verdade depois é só trocar esta
 * função por uma chamada HTTP real à API do gov.br e apontar o webhook dele para o endpoint já
 * existente.
 */
export const govBrSignatureProviderPort: SignatureProviderPort = {
    async sendForSignature(draft: SignatureRequestDraft) {
        const providerRequestId = `stub-govbr-request-${randomUUID()}`;
        logger.info(
            { organizationId: draft.organizationId, documentId: draft.documentId, provider: draft.provider, providerRequestId },
            '[CYC-006] Solicitação de assinatura — stub de transporte (provedor gov.br real ainda não plugado, ver GovBrSignatureProviderPort.ts)',
        );
        return { providerRequestId };
    },
};
