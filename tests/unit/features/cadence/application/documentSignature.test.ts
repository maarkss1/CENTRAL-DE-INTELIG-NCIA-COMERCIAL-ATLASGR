import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applySignatureStatusUpdate, requestDocumentSignature } from '@/features/cadence/application/documentSignature';
import type { SignatureRequestRepositoryPort, SignatureProviderPort } from '@/features/cadence/application/documentSignature';

function buildRepository(overrides: Partial<SignatureRequestRepositoryPort> = {}): SignatureRequestRepositoryPort {
    return {
        create: vi.fn(async () => ({ id: 'request-1' })),
        markSent: vi.fn(async () => {}),
        findByProviderRequestId: vi.fn(async () => null),
        updateStatus: vi.fn(async () => {}),
        ...overrides,
    };
}

function buildProvider(overrides: Partial<SignatureProviderPort> = {}): SignatureProviderPort {
    return {
        sendForSignature: vi.fn(async () => ({ providerRequestId: 'provider-request-1' })),
        ...overrides,
    };
}

beforeEach(() => vi.clearAllMocks());

const baseInput = {
    organizationId: 'org-1',
    documentId: 'doc-1',
    provider: 'govbr',
    signerEmail: 'signer@exemplo.com',
};

describe('requestDocumentSignature', () => {
    it('cria a solicitação, envia ao provedor e grava o providerRequestId (status sent)', async () => {
        const repository = buildRepository();
        const provider = buildProvider();

        const result = await requestDocumentSignature({ repository, provider }, baseInput);

        expect(result).toEqual({ id: 'request-1', providerRequestId: 'provider-request-1' });
        expect(repository.create).toHaveBeenCalledWith(
            expect.objectContaining({ organizationId: 'org-1', documentId: 'doc-1', provider: 'govbr', signerEmail: 'signer@exemplo.com' }),
        );
        expect(provider.sendForSignature).toHaveBeenCalledWith(
            expect.objectContaining({ organizationId: 'org-1', documentId: 'doc-1' }),
        );
        expect(repository.markSent).toHaveBeenCalledWith('request-1', 'provider-request-1');
    });
});

describe('applySignatureStatusUpdate', () => {
    it('solicitação inexistente: não aplica, devolve not-found', async () => {
        const repository = buildRepository({ findByProviderRequestId: vi.fn(async () => null) });

        const result = await applySignatureStatusUpdate(
            { repository },
            { provider: 'govbr', providerRequestId: 'provider-request-1', nextStatus: 'signed', evidenceRef: null, rawWebhookPayload: {} },
        );

        expect(result).toEqual({ applied: false, reason: 'not-found' });
        expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('transição inválida (webhook fora de ordem/reentregue): não aplica, devolve invalid-transition', async () => {
        const repository = buildRepository({
            findByProviderRequestId: vi.fn(async () => ({ id: 'request-1', organizationId: 'org-1', status: 'signed' })),
        });

        const result = await applySignatureStatusUpdate(
            { repository },
            { provider: 'govbr', providerRequestId: 'provider-request-1', nextStatus: 'sent', evidenceRef: null, rawWebhookPayload: {} },
        );

        expect(result).toEqual({ applied: false, reason: 'invalid-transition' });
        expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('transição válida: aplica e grava o evidenceRef/payload real', async () => {
        const repository = buildRepository({
            findByProviderRequestId: vi.fn(async () => ({ id: 'request-1', organizationId: 'org-1', status: 'sent' })),
        });
        const rawPayload = { provider: 'govbr', providerRequestId: 'provider-request-1', status: 'signed', evidenceRef: 'cert-123' };

        const result = await applySignatureStatusUpdate(
            { repository },
            { provider: 'govbr', providerRequestId: 'provider-request-1', nextStatus: 'signed', evidenceRef: 'cert-123', rawWebhookPayload: rawPayload },
        );

        expect(result).toEqual({ applied: true });
        expect(repository.updateStatus).toHaveBeenCalledWith({
            id: 'request-1',
            organizationId: 'org-1',
            status: 'signed',
            evidenceRef: 'cert-123',
            rawWebhookPayload: rawPayload,
        });
    });
});
