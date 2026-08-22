import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P0 (bloqueador de confiança): `getConversionRates` retornava `{ variantA: 15.4, variantB: 12.1 }`
 * fixo para qualquer `promptName`, mesmo sem nenhuma interação rastreada — número inventado exibido
 * como se fosse taxa de conversão real. Agora calcula a partir das Notas de tracking gravadas por
 * `logPromptUsage` e do status real do Lead.
 */

const noteFindMany = vi.fn();
const leadCount = vi.fn();

vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        note: { findMany: (...args: unknown[]) => noteFindMany(...args) },
        lead: { count: (...args: unknown[]) => leadCount(...args) },
    },
}));

const { abTestingService } = await import('../../../../../src/features/intelligence/services/abTesting.service');

beforeEach(() => {
    noteFindMany.mockResolvedValue([]);
    leadCount.mockResolvedValue(0);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('ABTestingService.getConversionRates', () => {
    it('retorna 0/0 (zero real) quando nenhuma variante tem interação rastreada', async () => {
        await expect(abTestingService.getConversionRates('roleplay-v3')).resolves.toEqual({
            variantA: 0,
            variantB: 0,
        });
        expect(leadCount).not.toHaveBeenCalled();
    });

    it('calcula a taxa a partir de leads distintos ganhos por variante, não um número fixo', async () => {
        noteFindMany.mockImplementation(({ where }: { where: { content: { contains: string } } }) => {
            if (where.content.contains.includes("variante 'A'")) {
                return Promise.resolve([{ leadId: 'lead-1' }, { leadId: 'lead-2' }, { leadId: 'lead-1' }]);
            }
            return Promise.resolve([{ leadId: 'lead-3' }]);
        });
        leadCount.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
            Promise.resolve(where.id.in.includes('lead-1') ? 1 : 0),
        );

        const rates = await abTestingService.getConversionRates('roleplay-v3');

        expect(rates.variantA).toBe(50); // 1 ganho de 2 leads distintos (lead-1, lead-2)
        expect(rates.variantB).toBe(0); // lead-3 não ganho
        expect(noteFindMany).toHaveBeenCalledWith({
            where: { content: { contains: "variante 'A' do modelo 'roleplay-v3'" } },
            select: { leadId: true },
        });
    });
});
