import { z } from 'zod';

export const ICP_TIERS = ['MUITO_ALTO', 'ALTO', 'MEDIO', 'BAIXO', 'FORA_DO_ICP'] as const;
export type MarketIcpTier = typeof ICP_TIERS[number];

export function normalizeCnpj(value: string): string {
    return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function formatCnpj(value: string): string {
    const normalized = normalizeCnpj(value);
    return normalized.length === 14
        ? normalized.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5')
        : value;
}

export function normalizeCnae(value: string): string {
    return value.replace(/\D/g, '');
}

export function normalizeSearch(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

const cnpjSchema = z.string().trim().transform(normalizeCnpj)
    .refine((value) => /^[A-Z0-9]{12}\d{2}$/.test(value), 'CNPJ deve ter 14 posições; os 2 dígitos verificadores finais são numéricos.');
const cnaeSchema = z.string().trim().transform(normalizeCnae)
    .refine((value) => /^\d{7}$/.test(value), 'CNAE deve conter 7 dígitos.');
const ufSchema = z.string().trim().transform((value) => value.toUpperCase())
    .refine((value) => /^[A-Z]{2}$/.test(value), 'UF inválida.');
const ibgeSchema = z.string().trim().regex(/^\d{7}$/, 'Código IBGE deve conter 7 dígitos.');

const optionalBoolean = z.preprocess((value) => {
    if (value === undefined || value === '') return undefined;
    if (value === 'true' || value === true || value === '1') return true;
    if (value === 'false' || value === false || value === '0') return false;
    return value;
}, z.boolean().optional());

export const companyListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
    cnpj: cnpjSchema.optional(),
    razaoSocial: z.string().trim().min(2).max(160).optional(),
    nomeFantasia: z.string().trim().min(2).max(160).optional(),
    cnae: cnaeSchema.optional(),
    cnaeScope: z.enum(['principal', 'all']).default('all'),
    municipio: z.string().trim().min(2).max(120).optional(),
    municipioIbge: ibgeSchema.optional(),
    uf: ufSchema.optional(),
    situacaoCadastral: z.enum(['ATIVA', 'SUSPENSA', 'INAPTA', 'BAIXADA', 'NULA']).optional(),
    icpMinimo: z.enum(ICP_TIERS).optional(),
    matrizFilial: z.enum(['MATRIZ', 'FILIAL']).optional(),
    rntrc: optionalBoolean,
    porte: z.string().trim().min(2).max(80).optional(),
    simples: z.enum(['SIM', 'NAO', 'NAO_INFORMADO']).optional(),
    mei: z.enum(['SIM', 'NAO', 'NAO_INFORMADO']).optional(),
    capitalSocialMin: z.coerce.number().nonnegative().optional(),
    capitalSocialMax: z.coerce.number().nonnegative().optional(),
    sort: z.enum(['razaoSocial', 'nomeFantasia', 'capitalSocial', 'icpScore', 'dataInicioAtividade']).default('razaoSocial'),
    order: z.enum(['asc', 'desc']).default('asc'),
}).superRefine((query, context) => {
    if (query.capitalSocialMin !== undefined && query.capitalSocialMax !== undefined
        && query.capitalSocialMin > query.capitalSocialMax) {
        context.addIssue({ code: 'custom', path: ['capitalSocialMax'], message: 'capitalSocialMax deve ser maior ou igual a capitalSocialMin.' });
    }
});

export const companyCnpjParamsSchema = z.object({ cnpj: cnpjSchema });
export const territoriesQuerySchema = z.object({
    uf: ufSchema.optional(),
    municipioIbge: ibgeSchema.optional(),
});
export const rankingsQuerySchema = z.object({
    metric: z.enum(['EMPRESAS_ATIVAS', 'EMPRESAS_ICP', 'RNTRC_EMPRESARIAL', 'RNTRC_TERRITORIAL']).default('EMPRESAS_ATIVAS'),
    uf: ufSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CompanyListQuery = z.infer<typeof companyListQuerySchema>;
export type TerritoriesQuery = z.infer<typeof territoriesQuerySchema>;
export type RankingsQuery = z.infer<typeof rankingsQuerySchema>;
