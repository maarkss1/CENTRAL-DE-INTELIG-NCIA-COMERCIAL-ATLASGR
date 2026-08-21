import { afterEach, describe, expect, it, vi } from 'vitest';

const signatureRequestCreate = vi.fn().mockResolvedValue({ id: 'request-1' });
const signatureRequestUpdate = vi.fn().mockResolvedValue({});
const signatureRequestFindFirst = vi.fn().mockResolvedValue(null);

vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        crmDocumentSignatureRequest: {
            create: (...args: unknown[]) => signatureRequestCreate(...args),
            update: (...args: unknown[]) => signatureRequestUpdate(...args),
            findFirst: (...args: unknown[]) => signatureRequestFindFirst(...args),
        },
    },
}));

vi.mock('@prisma/client', () => ({
    SignatureRequestStatus: {
        Created: 'Created', Sent: 'Sent', Viewed: 'Viewed', Signed: 'Signed',
        Declined: 'Declined', Expired: 'Expired', Cancelled: 'Cancelled',
    },
    Prisma: {},
}));

const contextRuns: Array<Record<string, unknown>> = [];
vi.mock('../../../../../src/lib/async-context.js', () => ({
    requestContext: {
        run: (store: Record<string, unknown>, fn: () => unknown) => {
            contextRuns.push(store);
            return fn();
        },
        getStore: () => undefined,
    },
}));

const { prismaSignatureRequestRepository } = await import('../../../../../src/features/cadence/infra/PrismaSignatureRequestRepository');

const draft = { organizationId: 'org-1', documentId: 'doc-1', provider: 'govbr', signerEmail: 'signer@exemplo.com', signerName: null, requestedBy: null };

afterEach(() => {
    vi.clearAllMocks();
    contextRuns.length = 0;
});

describe('prismaSignatureRequestRepository', () => {
    it('create: grava com status Created', async () => {
        const result = await prismaSignatureRequestRepository.create(draft);

        expect(result).toEqual({ id: 'request-1' });
        expect(signatureRequestCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({ organizationId: 'org-1', documentId: 'doc-1', provider: 'govbr', status: 'Created' }),
            select: { id: true },
        });
    });

    it('markSent: atualiza status para Sent com o providerRequestId', async () => {
        await prismaSignatureRequestRepository.markSent('request-1', 'provider-request-1');

        expect(signatureRequestUpdate).toHaveBeenCalledWith({
            where: { id: 'request-1' },
            data: { status: 'Sent', providerRequestId: 'provider-request-1' },
        });
    });

    it('findByProviderRequestId: inexistente devolve null (lookup roda com bypassRls — sem tenant conhecido a priori)', async () => {
        const result = await prismaSignatureRequestRepository.findByProviderRequestId('govbr', 'provider-request-1');
        expect(result).toBeNull();
        expect(contextRuns).toContainEqual({ bypassRls: true });
    });

    it('findByProviderRequestId: mapeia o status do banco (PascalCase) de volta para o domínio (lowercase)', async () => {
        signatureRequestFindFirst.mockResolvedValueOnce({ id: 'request-1', organizationId: 'org-1', status: 'Signed' });

        const result = await prismaSignatureRequestRepository.findByProviderRequestId('govbr', 'provider-request-1');

        expect(result).toEqual({ id: 'request-1', organizationId: 'org-1', status: 'signed' });
    });

    it('updateStatus: grava status/respondedAt/evidenceRef/rawWebhookPayload, escopado pelo tenant resolvido', async () => {
        await prismaSignatureRequestRepository.updateStatus({ id: 'request-1', organizationId: 'org-1', status: 'signed', evidenceRef: 'cert-123', rawWebhookPayload: { a: 1 } });

        expect(signatureRequestUpdate).toHaveBeenCalledWith({
            where: { id: 'request-1' },
            data: expect.objectContaining({ status: 'Signed', evidenceRef: 'cert-123', rawWebhookPayload: { a: 1 } }),
        });
        expect(contextRuns).toContainEqual({ tenantId: 'org-1' });
    });

    it('updateStatus: sem evidenceRef, não sobrescreve o campo', async () => {
        await prismaSignatureRequestRepository.updateStatus({ id: 'request-1', organizationId: 'org-1', status: 'expired', evidenceRef: null, rawWebhookPayload: {} });

        const call = signatureRequestUpdate.mock.calls[0][0];
        expect(call.data).not.toHaveProperty('evidenceRef');
    });
});
