/**
 * Resolução de identidade de empresa (dossiê CPI, DEC-16, opção A) — `resolveCompanyIdentity`.
 *
 * Cobre isoladamente (sem passar por `promoteToCrm`) as três saídas possíveis:
 *  - `method: 'cnpj'` — CNPJ normalizado+validado bateu com uma Company já cadastrada: essa é a
 *    ÚNICA saída que este módulo trata como identidade determinística real.
 *  - `method: 'name-heuristic'` — sem CNPJ confiável, achou por nome (best-effort).
 *  - `method: 'none'` — nada encontrado (ou erro — fail-closed).
 *
 * Mesmo padrão de mock de `withRlsContext`/`$queryRaw` já usado em
 * `prospecting.service.dedupe.test.ts` (ver comentário lá para o porquê do `withRlsContext`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryRawMock, withRlsContextMock } = vi.hoisted(() => {
    const queryRawMock = vi.fn();
    const withRlsContextMock = vi.fn((fn: (tx: { $queryRaw: typeof queryRawMock }) => unknown) => fn({ $queryRaw: queryRawMock }));
    return { queryRawMock, withRlsContextMock };
});

vi.mock('../../../../../src/lib/prisma.js', () => ({
    prisma: {
        company: { findFirst: vi.fn(), findUnique: vi.fn() },
    },
    withRlsContext: (fn: (tx: unknown) => unknown) => withRlsContextMock(fn as never),
}));

import { prisma } from '../../../../../src/lib/prisma.js';
import { resolveCompanyIdentity } from '../../../../../src/features/prospecting/services/companyIdentity.service';

const companyMock = prisma.company as unknown as {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
};

const VALID_CNPJ_PUNCTUATED = '11.222.333/0001-81';
const VALID_CNPJ_DIGITS = '11222333000181';
const INVALID_CNPJ = '11.222.333/0001-82'; // dígito verificador errado

beforeEach(() => {
    vi.clearAllMocks();
    queryRawMock.mockResolvedValue([]);
});

describe('resolveCompanyIdentity — CNPJ como identidade determinística', () => {
    it('devolve method "cnpj" e a Company certa quando o CNPJ normalizado bate com um registro existente', async () => {
        queryRawMock.mockResolvedValue([{ id: 'comp-cnpj-match' }]);
        companyMock.findUnique.mockResolvedValue({ id: 'comp-cnpj-match', cnpj: VALID_CNPJ_DIGITS });

        const result = await resolveCompanyIdentity({
            organizationId: 'org-1',
            cnpj: VALID_CNPJ_PUNCTUATED,
            tradeName: 'Nome Completamente Diferente Do Cadastro', // não importa: CNPJ manda
        });

        expect(result.method).toBe('cnpj');
        expect(result.company?.id).toBe('comp-cnpj-match');
        // CNPJ bateu — a heurística por nome nunca deveria ter sido consultada.
        expect(companyMock.findFirst).not.toHaveBeenCalled();
    });

    it('a chave usada na busca é o CNPJ normalizado (só dígitos), não a string com pontuação', async () => {
        queryRawMock.mockResolvedValue([]);
        companyMock.findFirst.mockResolvedValue(null);

        await resolveCompanyIdentity({
            organizationId: 'org-1',
            cnpj: VALID_CNPJ_PUNCTUATED,
            tradeName: 'Qualquer',
        });

        expect(queryRawMock).toHaveBeenCalledTimes(1);
        const callArgs = queryRawMock.mock.calls[0];
        expect(callArgs).toContain(VALID_CNPJ_DIGITS);
        expect(callArgs).not.toContain(VALID_CNPJ_PUNCTUATED);
    });

    it('escopa a busca por CNPJ ao organizationId do chamador (isolamento de tenant)', async () => {
        queryRawMock.mockResolvedValue([]);
        companyMock.findFirst.mockResolvedValue(null);

        await resolveCompanyIdentity({ organizationId: 'org-tenant-x', cnpj: VALID_CNPJ_DIGITS, tradeName: 'Qualquer' });

        expect(queryRawMock.mock.calls[0]).toContain('org-tenant-x');
    });

    it('CNPJ válido mas sem match: cai para a heurística por nome em vez de devolver "none" direto', async () => {
        queryRawMock.mockResolvedValue([]); // nenhuma Company com este CNPJ
        companyMock.findFirst.mockResolvedValue({ id: 'comp-por-nome', cnpj: null });

        const result = await resolveCompanyIdentity({
            organizationId: 'org-1',
            cnpj: VALID_CNPJ_DIGITS,
            tradeName: 'Transportadora Exemplo',
        });

        expect(result.method).toBe('name-heuristic');
        expect(result.company?.id).toBe('comp-por-nome');
    });
});

describe('resolveCompanyIdentity — fallback heurístico (sem CNPJ confiável)', () => {
    it('CNPJ ausente: vai direto para a heurística por nome, sem consultar o banco por CNPJ', async () => {
        companyMock.findFirst.mockResolvedValue({ id: 'comp-por-nome', cnpj: null });

        const result = await resolveCompanyIdentity({
            organizationId: 'org-1',
            cnpj: null,
            tradeName: 'Transportadora Exemplo',
        });

        expect(queryRawMock).not.toHaveBeenCalled();
        expect(result.method).toBe('name-heuristic');
        expect(result.company?.id).toBe('comp-por-nome');
    });

    it('CNPJ com dígito verificador inválido é tratado como ausente — nunca usado como chave de busca', async () => {
        companyMock.findFirst.mockResolvedValue(null);

        const result = await resolveCompanyIdentity({
            organizationId: 'org-1',
            cnpj: INVALID_CNPJ,
            tradeName: 'Transportadora Exemplo',
        });

        expect(queryRawMock).not.toHaveBeenCalled();
        expect(result.method).toBe('none');
    });

    it('encontra por tradeName case-insensitive', async () => {
        companyMock.findFirst.mockImplementation(({ where }) => {
            const matches = where.OR[0].tradeName.equals.toLowerCase() === 'transportadora exemplo';
            return Promise.resolve(matches ? { id: 'comp-nome', cnpj: null } : null);
        });

        const result = await resolveCompanyIdentity({
            organizationId: 'org-1',
            cnpj: null,
            tradeName: 'TRANSPORTADORA EXEMPLO',
        });

        expect(result.method).toBe('name-heuristic');
        expect(result.company?.id).toBe('comp-nome');
    });

    it('usa legalName como fallback de busca quando informado', async () => {
        await resolveCompanyIdentity({
            organizationId: 'org-1',
            cnpj: null,
            tradeName: 'Nome Fantasia',
            legalName: 'Razão Social Ltda',
        });

        const where = companyMock.findFirst.mock.calls[0][0].where;
        expect(where.OR[1].legalName.equals).toBe('Razão Social Ltda');
    });

    it('sem CNPJ e sem match por nome: devolve method "none" e company null', async () => {
        companyMock.findFirst.mockResolvedValue(null);

        const result = await resolveCompanyIdentity({
            organizationId: 'org-1',
            cnpj: null,
            tradeName: 'Empresa Nova Nunca Vista',
        });

        expect(result).toEqual({ company: null, method: 'none' });
    });
});

describe('resolveCompanyIdentity — fail-closed', () => {
    it('erro na busca por CNPJ devolve method "none" em vez de propagar a exceção', async () => {
        queryRawMock.mockRejectedValue(new Error('db down'));

        const result = await resolveCompanyIdentity({
            organizationId: 'org-1',
            cnpj: VALID_CNPJ_DIGITS,
            tradeName: 'Qualquer',
        });

        expect(result).toEqual({ company: null, method: 'none' });
    });

    it('erro na busca heurística por nome devolve method "none" em vez de propagar a exceção', async () => {
        companyMock.findFirst.mockRejectedValue(new Error('db down'));

        const result = await resolveCompanyIdentity({
            organizationId: 'org-1',
            cnpj: null,
            tradeName: 'Qualquer',
        });

        expect(result).toEqual({ company: null, method: 'none' });
    });
});
