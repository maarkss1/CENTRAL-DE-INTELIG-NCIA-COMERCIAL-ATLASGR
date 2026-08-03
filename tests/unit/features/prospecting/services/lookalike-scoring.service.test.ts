import { afterEach, describe, expect, it, vi } from 'vitest';

const findFirst = vi.fn();
const update = vi.fn().mockResolvedValue({});
const queryRaw = vi.fn();
const executeRaw = vi.fn().mockResolvedValue(1);

vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        company: { findFirst: (...args: unknown[]) => findFirst(...args), update: (...args: unknown[]) => update(...args) },
        $queryRaw: (...args: unknown[]) => queryRaw(...args),
        $executeRaw: (...args: unknown[]) => executeRaw(...args),
    },
}));

const generateEmbedding = vi.fn();
vi.mock('../../../../../src/lib/ai/gateway.js', () => ({
    generateEmbedding: (...args: unknown[]) => generateEmbedding(...args),
}));

vi.mock('../../../../../src/lib/logger.js', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { buildCompanyProfileText, updateCompanyProfileEmbedding, computeLookalikeScore } = await import(
    '../../../../../src/features/prospecting/services/lookalike-scoring.service'
);

afterEach(() => {
    vi.clearAllMocks();
});

describe('buildCompanyProfileText', () => {
    it('joins only the fields that are actually present, never inventing data', () => {
        const text = buildCompanyProfileText({
            tradeName: 'Transportadora Exemplo',
            segment: 'Transporte de cargas',
            cnae: null,
            city: 'Ribeirão Preto',
            state: 'SP',
            size: null,
            employeeCount: null,
            technologies: ['SAP'],
            keywords: [],
        });

        expect(text).toBe('Transportadora Exemplo | Segmento: Transporte de cargas | Localização: Ribeirão Preto, SP | Tecnologias: SAP');
    });
});

describe('updateCompanyProfileEmbedding', () => {
    it('returns false without calling the AI gateway when the company has no profile text', async () => {
        findFirst.mockResolvedValueOnce({
            tradeName: '', segment: null, cnae: null, city: null, state: null, size: null, employeeCount: null, technologies: [], keywords: [],
        });

        const ok = await updateCompanyProfileEmbedding('company-1', 'org-1');

        expect(ok).toBe(false);
        expect(generateEmbedding).not.toHaveBeenCalled();
    });

    it('embeds the profile and writes it to the company row', async () => {
        findFirst.mockResolvedValueOnce({
            tradeName: 'Transportadora Exemplo', segment: 'Cargas', cnae: null, city: null, state: null, size: null, employeeCount: null, technologies: [], keywords: [],
        });
        generateEmbedding.mockResolvedValueOnce([0.1, 0.2, 0.3]);

        const ok = await updateCompanyProfileEmbedding('company-1', 'org-1');

        expect(ok).toBe(true);
        expect(executeRaw).toHaveBeenCalledTimes(1);
    });
});

describe('computeLookalikeScore', () => {
    it('returns null without an organizationId (no tenant to scope the comparison to)', async () => {
        const result = await computeLookalikeScore('company-1', '');
        expect(result).toBeNull();
        expect(findFirst).not.toHaveBeenCalled();
    });

    it('returns null when the target company still has no embedding after the refresh attempt', async () => {
        findFirst.mockResolvedValueOnce({
            tradeName: 'Sem Perfil', segment: null, cnae: null, city: null, state: null, size: null, employeeCount: null, technologies: [], keywords: [],
        });
        queryRaw.mockResolvedValueOnce([{ profileEmbedding: null }]);

        const result = await computeLookalikeScore('company-1', 'org-1');

        expect(result).toBeNull();
    });

    it('returns null (cold start) when there are fewer won reference companies than the minimum', async () => {
        findFirst.mockResolvedValueOnce({
            tradeName: 'Empresa X', segment: 'Cargas', cnae: null, city: null, state: null, size: null, employeeCount: null, technologies: [], keywords: [],
        });
        generateEmbedding.mockResolvedValueOnce([0.1, 0.2]);
        queryRaw
            .mockResolvedValueOnce([{ profileEmbedding: '[0.1,0.2]' }]) // target fetch
            .mockResolvedValueOnce([ // only 2 matches, below MIN_REFERENCE_COMPANIES (3)
                { id: 'c2', tradeName: 'Ganha 1', similarity: 0.9 },
                { id: 'c3', tradeName: 'Ganha 2', similarity: 0.8 },
            ]);

        const result = await computeLookalikeScore('company-1', 'org-1');

        expect(result).toBeNull();
        expect(update).not.toHaveBeenCalled();
    });

    it('scores from the average of the top matches and persists an auditable match list', async () => {
        findFirst.mockResolvedValueOnce({
            tradeName: 'Empresa X', segment: 'Cargas', cnae: null, city: null, state: null, size: null, employeeCount: null, technologies: [], keywords: [],
        });
        generateEmbedding.mockResolvedValueOnce([0.1, 0.2]);
        queryRaw
            .mockResolvedValueOnce([{ profileEmbedding: '[0.1,0.2]' }])
            .mockResolvedValueOnce([
                { id: 'c2', tradeName: 'Ganha 1', similarity: 0.9 },
                { id: 'c3', tradeName: 'Ganha 2', similarity: 0.8 },
                { id: 'c4', tradeName: 'Ganha 3', similarity: 0.7 },
            ]);

        const result = await computeLookalikeScore('company-1', 'org-1');

        expect(result).toEqual({
            score: 80, // avg(0.9, 0.8, 0.7) = 0.8 -> 80
            matches: [
                { companyId: 'c2', tradeName: 'Ganha 1', similarity: 0.9 },
                { companyId: 'c3', tradeName: 'Ganha 2', similarity: 0.8 },
                { companyId: 'c4', tradeName: 'Ganha 3', similarity: 0.7 },
            ],
        });
        expect(update).toHaveBeenCalledWith({
            where: { id: 'company-1' },
            data: { lookalikeScore: 80, lookalikeTopMatches: result!.matches },
        });
    });

    it('fails safe (null) instead of throwing when the database query errors', async () => {
        findFirst.mockRejectedValueOnce(new Error('db offline'));

        await expect(computeLookalikeScore('company-1', 'org-1')).resolves.toBeNull();
    });
});
