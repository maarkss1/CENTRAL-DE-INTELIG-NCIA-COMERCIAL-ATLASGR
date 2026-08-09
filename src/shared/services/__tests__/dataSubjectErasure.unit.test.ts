import { describe, it, expect, vi, beforeEach } from 'vitest';

const findFirstMock = vi.fn();
const updateMock = vi.fn();
const updateManyMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
    prisma: {
        contact: {
            findFirst: (...args: unknown[]) => findFirstMock(...args),
            update: (...args: unknown[]) => updateMock(...args),
        },
        whatsAppMessage: {
            updateMany: (...args: unknown[]) => updateManyMock(...args),
        },
    },
}));

import { eraseDataSubject, ANONYMIZED_CONTACT_NAME } from '@/shared/services/dataSubjectErasure.service';

const ORG_ID = 'org-1';
const CONTACT_ID = 'contact-1';

beforeEach(() => {
    vi.clearAllMocks();
    updateManyMock.mockResolvedValue({ count: 3 });
});

describe('eraseDataSubject — mecanismo técnico de exclusão/anonimização LGPD (art. 18)', () => {
    it('lança erro quando o contato não existe nesta organização (nunca anonimiza sem confirmar posse)', async () => {
        findFirstMock.mockResolvedValue(null);

        await expect(eraseDataSubject({ organizationId: ORG_ID, contactId: CONTACT_ID })).rejects.toThrow(
            /não encontrado/,
        );

        expect(findFirstMock).toHaveBeenCalledWith({
            where: { id: CONTACT_ID, organizationId: ORG_ID },
        });
        expect(updateMock).not.toHaveBeenCalled();
    });

    it('anonimiza todos os campos identificadores do contato e mascara o WhatsApp ligado a ele', async () => {
        findFirstMock.mockResolvedValue({ id: CONTACT_ID, name: 'Fulano de Tal', organizationId: ORG_ID });

        const result = await eraseDataSubject({ organizationId: ORG_ID, contactId: CONTACT_ID });

        expect(updateMock).toHaveBeenCalledWith({
            where: { id: CONTACT_ID },
            data: {
                name: ANONYMIZED_CONTACT_NAME,
                phone: null,
                whatsapp: null,
                email: null,
                linkedin: null,
                birthDate: null,
                observations: null,
                customFields: {},
            },
        });
        expect(updateManyMock).toHaveBeenCalledWith({
            where: { contactId: CONTACT_ID, body: { not: null } },
            data: { body: null },
        });
        expect(result).toEqual({ contactId: CONTACT_ID, whatsAppMessagesMasked: 3, alreadyAnonymized: false });
    });

    it('é idempotente: contato já anonimizado não é regravado, mas WhatsApp continua sendo verificado', async () => {
        findFirstMock.mockResolvedValue({ id: CONTACT_ID, name: ANONYMIZED_CONTACT_NAME, organizationId: ORG_ID });

        const result = await eraseDataSubject({ organizationId: ORG_ID, contactId: CONTACT_ID });

        expect(updateMock).not.toHaveBeenCalled();
        expect(updateManyMock).toHaveBeenCalled();
        expect(result.alreadyAnonymized).toBe(true);
    });
});
