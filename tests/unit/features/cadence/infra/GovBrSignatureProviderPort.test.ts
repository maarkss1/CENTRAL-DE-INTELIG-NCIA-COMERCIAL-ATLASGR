import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../src/lib/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { govBrSignatureProviderPort } = await import('../../../../../src/features/cadence/infra/GovBrSignatureProviderPort');

afterEach(() => {
    vi.clearAllMocks();
});

describe('govBrSignatureProviderPort', () => {
    it('devolve um providerRequestId sintético (stub de transporte — nenhuma chamada real ao gov.br)', async () => {
        const result = await govBrSignatureProviderPort.sendForSignature({
            organizationId: 'org-1',
            documentId: 'doc-1',
            provider: 'govbr',
            signerEmail: 'signer@exemplo.com',
            signerName: null,
            requestedBy: null,
        });

        expect(result.providerRequestId).toMatch(/^stub-govbr-request-/);
    });
});
