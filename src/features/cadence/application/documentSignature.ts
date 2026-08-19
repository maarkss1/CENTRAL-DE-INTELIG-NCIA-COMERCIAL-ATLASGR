import {
    buildSignatureRequestDraft,
    isValidSignatureTransition,
    type SignatureRequestDraft,
    type SignatureStatus,
} from '../domain/signature.js';

/** Envia a solicitação ao provedor real (ou stub) e devolve o id que ele atribuiu — usado depois para casar o webhook de status com a solicitação certa. */
export interface SignatureProviderPort {
    sendForSignature(draft: SignatureRequestDraft): Promise<{ providerRequestId: string }>;
}

export interface SignatureRequestRepositoryPort {
    create(input: SignatureRequestDraft): Promise<{ id: string }>;
    markSent(id: string, providerRequestId: string): Promise<void>;
    findByProviderRequestId(provider: string, providerRequestId: string): Promise<{ id: string; organizationId: string; status: SignatureStatus } | null>;
    /** `organizationId` vem do registro já resolvido por `findByProviderRequestId` — nunca de um valor solto no payload do webhook (RLS escopado pelo tenant real). */
    updateStatus(input: { id: string; organizationId: string; status: SignatureStatus; evidenceRef: string | null; rawWebhookPayload: unknown }): Promise<void>;
}

export interface RequestDocumentSignatureInput {
    organizationId: string;
    documentId: string;
    provider: string;
    signerEmail: string;
    signerName?: string | null;
    requestedBy?: string | null;
}

/** Cria a solicitação (status `created`), envia ao provedor (real ou stub) e grava o resultado (status `sent` + `providerRequestId`). */
export async function requestDocumentSignature(
    ports: { repository: SignatureRequestRepositoryPort; provider: SignatureProviderPort },
    input: RequestDocumentSignatureInput,
): Promise<{ id: string; providerRequestId: string }> {
    const draft = buildSignatureRequestDraft(input);
    const created = await ports.repository.create(draft);
    const { providerRequestId } = await ports.provider.sendForSignature(draft);
    await ports.repository.markSent(created.id, providerRequestId);
    return { id: created.id, providerRequestId };
}

export type ApplySignatureStatusUpdateResult =
    | { applied: true }
    | { applied: false; reason: 'not-found' | 'invalid-transition' };

/**
 * Aplica um evento de status vindo do provedor (webhook). Idempotente/seguro contra reentrega e
 * entrega fora de ordem: uma transição que `isValidSignatureTransition` rejeita é ignorada sem
 * lançar — o chamador decide como logar isso, nunca deveria travar o processamento do webhook nem
 * corromper um estado terminal já aplicado.
 */
export async function applySignatureStatusUpdate(
    ports: { repository: SignatureRequestRepositoryPort },
    input: { provider: string; providerRequestId: string; nextStatus: SignatureStatus; evidenceRef: string | null; rawWebhookPayload: unknown },
): Promise<ApplySignatureStatusUpdateResult> {
    const existing = await ports.repository.findByProviderRequestId(input.provider, input.providerRequestId);
    if (!existing) return { applied: false, reason: 'not-found' };

    if (!isValidSignatureTransition(existing.status, input.nextStatus)) {
        return { applied: false, reason: 'invalid-transition' };
    }

    await ports.repository.updateStatus({
        id: existing.id,
        organizationId: existing.organizationId,
        status: input.nextStatus,
        evidenceRef: input.evidenceRef,
        rawWebhookPayload: input.rawWebhookPayload,
    });
    return { applied: true };
}
