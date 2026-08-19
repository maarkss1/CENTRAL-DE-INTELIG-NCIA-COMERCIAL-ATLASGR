import { Prisma, SignatureRequestStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import { requestContext } from '../../../lib/async-context.js';
import type { SignatureRequestRepositoryPort } from '../application/documentSignature.js';
import type { SignatureStatus } from '../domain/signature.js';

/** CYC-006 (onda 28) — implementação real de `SignatureRequestRepositoryPort`. Mesmo padrão de
 * `PrismaCalendarSchedulerPort`: enum Postgres (PascalCase) mapeado aqui, nunca propagado cru para
 * o domínio. `CrmDocumentSignatureRequest` era tabela morta confirmada até esta onda.
 *
 * `create`/`markSent` rodam dentro da request autenticada (`authenticateToken`/`requireTenant` já
 * montaram o tenant no contexto) — RLS normal. `findByProviderRequestId`/`updateStatus` são
 * chamados pelo webhook de status (sem tenant conhecido a priori, mesmo problema de
 * `recordDocumentView` em `PrismaCrm360Repository`): o bypass cobre só o lookup pelo
 * `providerRequestId` (opaco, não adivinhável — mesmo modelo de confiança do `publicToken`); a
 * escrita real roda escopada pelo `organizationId` já resolvido por esse lookup, nunca por um
 * valor solto do payload do webhook. */

const STATUS_TO_DB: Record<SignatureStatus, SignatureRequestStatus> = {
    created: SignatureRequestStatus.Created,
    sent: SignatureRequestStatus.Sent,
    viewed: SignatureRequestStatus.Viewed,
    signed: SignatureRequestStatus.Signed,
    declined: SignatureRequestStatus.Declined,
    expired: SignatureRequestStatus.Expired,
    cancelled: SignatureRequestStatus.Cancelled,
};

const STATUS_FROM_DB: Record<SignatureRequestStatus, SignatureStatus> = {
    Created: 'created',
    Sent: 'sent',
    Viewed: 'viewed',
    Signed: 'signed',
    Declined: 'declined',
    Expired: 'expired',
    Cancelled: 'cancelled',
};

export const prismaSignatureRequestRepository: SignatureRequestRepositoryPort = {
    async create(draft) {
        const request = await prisma.crmDocumentSignatureRequest.create({
            data: {
                organizationId: draft.organizationId,
                documentId: draft.documentId,
                provider: draft.provider,
                signerEmail: draft.signerEmail,
                signerName: draft.signerName,
                requestedBy: draft.requestedBy,
                status: SignatureRequestStatus.Created,
            },
            select: { id: true },
        });
        return { id: request.id };
    },

    async markSent(id, providerRequestId) {
        await prisma.crmDocumentSignatureRequest.update({
            where: { id },
            data: { status: SignatureRequestStatus.Sent, providerRequestId },
        });
    },

    async findByProviderRequestId(provider, providerRequestId) {
        const request = await requestContext.run({ bypassRls: true }, () =>
            prisma.crmDocumentSignatureRequest.findFirst({
                where: { provider, providerRequestId },
                select: { id: true, organizationId: true, status: true },
            }),
        );
        if (!request) return null;
        return { id: request.id, organizationId: request.organizationId, status: STATUS_FROM_DB[request.status] };
    },

    async updateStatus({ id, organizationId, status, evidenceRef, rawWebhookPayload }) {
        await requestContext.run({ tenantId: organizationId }, () =>
            prisma.crmDocumentSignatureRequest.update({
                where: { id },
                data: {
                    status: STATUS_TO_DB[status],
                    respondedAt: new Date(),
                    ...(evidenceRef ? { evidenceRef } : {}),
                    rawWebhookPayload: rawWebhookPayload as unknown as Prisma.InputJsonValue,
                },
            }),
        );
    },
};
