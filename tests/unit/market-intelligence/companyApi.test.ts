import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../src/shared/middlewares/errorHandler';
import { marketIntelligenceRoutes } from '../../../src/features/market-intelligence/server/marketIntelligence.routes';
import { marketIntelligenceService } from '../../../src/features/market-intelligence/server/marketIntelligence.service';
import {
    companyListQuerySchema,
    formatCnpj,
    normalizeCnpj,
    rankingsQuerySchema,
} from '../../../src/features/market-intelligence/server/marketIntelligence.schemas';
import { rntrcTerritorialSnapshot } from '../../../src/features/market-intelligence/server/rntrcTerritorial';

function app() {
    const instance = express();
    instance.use('/api/market-intelligence', marketIntelligenceRoutes);
    instance.use(errorHandler);
    return instance;
}

describe('Market Intelligence company API contract', () => {
    afterEach(() => vi.restoreAllMocks());

    it('normalizes numeric, formatted and alphanumeric CNPJ without losing positions', () => {
        expect(normalizeCnpj('12.345.678/0001-95')).toBe('12345678000195');
        expect(normalizeCnpj('A2.345.678/0001-95')).toBe('A2345678000195');
        expect(formatCnpj('A2345678000195')).toBe('A2.345.678/0001-95');
    });

    it('validates filters, false booleans, CNAE formatting and safe pagination', () => {
        const parsed = companyListQuerySchema.parse({
            page: '2', pageSize: '200', uf: 'sp', cnae: '49.30-2-02', rntrc: 'false',
            icpMinimo: 'ALTO', capitalSocialMin: '1000', capitalSocialMax: '5000',
        });
        expect(parsed).toMatchObject({
            page: 2, pageSize: 200, uf: 'SP', cnae: '4930202', rntrc: false,
            icpMinimo: 'ALTO', capitalSocialMin: 1000, capitalSocialMax: 5000,
        });
        expect(() => companyListQuerySchema.parse({ pageSize: '201' })).toThrow();
        expect(() => companyListQuerySchema.parse({ capitalSocialMin: '10', capitalSocialMax: '9' })).toThrow();
    });

    it('keeps observed municipal RNTRC separate from company-level enrichment', () => {
        expect(rankingsQuerySchema.parse({ metric: 'RNTRC_TERRITORIAL' }).metric).toBe('RNTRC_TERRITORIAL');
        const snapshot = rntrcTerritorialSnapshot();
        expect(snapshot.byIbge.get('3543402')).toMatchObject({
            name: 'Ribeirão Preto', uf: 'SP', transporters: 3663,
        });
        expect(snapshot.metadata).toMatchObject({
            competencia: '2026-07', granularity: 'MUNICIPAL', dataOrigin: 'OBSERVED',
        });
    });

    it('returns a paginated server-side result through the real router contract', async () => {
        vi.spyOn(marketIntelligenceService, 'listCompanies').mockResolvedValue({
            data: [{ cnpj: '12.345.678/0001-95', razaoSocial: 'EMPRESA OBSERVADA' }],
            pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
            filters: companyListQuerySchema.parse({}),
            metadata: { competencia: '2026-08', source: 'RECEITA_FEDERAL_CNPJ' },
        } as never);
        const response = await request(app()).get('/api/market-intelligence/companies?uf=SP');
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.pagination.total).toBe(1);
        expect(marketIntelligenceService.listCompanies).toHaveBeenCalledWith(expect.objectContaining({ uf: 'SP' }));
    });

    it('rejects invalid CNPJ before the service is called', async () => {
        const spy = vi.spyOn(marketIntelligenceService, 'getCompany');
        const response = await request(app()).get('/api/market-intelligence/companies/123');
        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(spy).not.toHaveBeenCalled();
    });
});
