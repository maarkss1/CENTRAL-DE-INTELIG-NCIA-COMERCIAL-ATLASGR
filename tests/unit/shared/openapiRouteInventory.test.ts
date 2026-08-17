import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { parse as parseYaml } from 'yaml';
import { computeOpenApiDrift, extractMountedRoutes } from '../../../src/shared/contracts/openapiRouteInventory.js';

/**
 * Testes da verificação estática de deriva entre `docs/openapi.yaml` e `server.ts`
 * (Onda 8, Agente 18 — Contratos, API e Documentação Viva).
 *
 * O primeiro teste roda contra o repositório real e prova que a verificação passa hoje (depois da
 * correção da deriva medida no início da onda). Os demais usam fixtures sintéticas — nunca editam
 * `server.ts` de verdade (fora do escopo do Agente 18) — para provar que a verificação FALHA
 * quando deveria: critério verificável explícito da missão desta onda ("introduzir uma rota nova
 * sem documentar faz a verificação falhar").
 */
describe('computeOpenApiDrift', () => {
    it('não encontra deriva estrutural no repositório real (server.ts vs docs/openapi.yaml)', () => {
        const repoRoot = path.resolve(__dirname, '../../..');
        const serverTsSource = readFileSync(path.join(repoRoot, 'server.ts'), 'utf-8');
        const openapiDocument = parseYaml(readFileSync(path.join(repoRoot, 'docs', 'openapi.yaml'), 'utf-8'));

        const result = computeOpenApiDrift(serverTsSource, openapiDocument.paths ?? {});

        expect(result.undocumentedPrefixes).toEqual([]);
        expect(result.phantomDocumentedPaths).toEqual([]);
        // Sanity: garante que a extração real encontrou um número plausível de rotas — se isso cair
        // para 0, o regex de extração provavelmente quebrou silenciosamente (falso "sem deriva").
        expect(result.allMountedPrefixes.length).toBeGreaterThan(15);
        expect(result.allDocumentedPaths.length).toBeGreaterThan(50);
    });

    it('FALHA (reporta prefixo não documentado) quando uma rota nova é montada sem documentação', () => {
        const fakeServerTs = `
            app.use('/api/companies', authenticateToken, requireTenant, companyRoutes);
            app.use('/api/leads', authenticateToken, requireTenant, leadRoutes);
            app.use('/api/nova-feature-sem-doc', authenticateToken, requireTenant, novaFeatureRoutes);
        `;
        const fakeOpenApiPaths = {
            '/companies': { get: {} },
            '/leads': { get: {} },
        };

        const result = computeOpenApiDrift(fakeServerTs, fakeOpenApiPaths);

        expect(result.undocumentedPrefixes).toEqual(['nova-feature-sem-doc']);
    });

    it('FALHA (reporta path fantasma) quando o documento descreve uma rota que não existe em server.ts', () => {
        const fakeServerTs = `
            app.use('/api/companies', authenticateToken, requireTenant, companyRoutes);
        `;
        const fakeOpenApiPaths = {
            '/companies': { get: {} },
            '/rota-que-nunca-existiu': { get: {} },
        };

        const result = computeOpenApiDrift(fakeServerTs, fakeOpenApiPaths);

        expect(result.phantomDocumentedPaths).toEqual(['/rota-que-nunca-existiu']);
    });

    it('não reporta deriva quando o path documentado usa parâmetro e o mount usa :param do Express', () => {
        const fakeServerTs = `
            app.use('/api/leads', authenticateToken, requireTenant, leadRoutes);
            app.use('/api/leads/:leadId/notes', authenticateToken, requireTenant, noteRoutes);
        `;
        const fakeOpenApiPaths = {
            '/leads': { get: {} },
            '/leads/{id}/enrich': { post: {} },
            '/leads/{leadId}/notes': { get: {} },
        };

        const result = computeOpenApiDrift(fakeServerTs, fakeOpenApiPaths);

        expect(result.undocumentedPrefixes).toEqual([]);
        expect(result.phantomDocumentedPaths).toEqual([]);
    });

    it('ignora mounts fora do universo /api (health checks, SPA fallback) sem precisar de allowlist individual', () => {
        const fakeServerTs = `
            app.get('/health/live', handleLiveness);
            app.get('/healthz', handleLiveness);
            app.use('/api/companies', authenticateToken, requireTenant, companyRoutes);
            app.get('*', (_req, res) => res.sendFile('index.html'));
        `;
        const fakeOpenApiPaths = {
            '/companies': { get: {} },
        };

        const result = computeOpenApiDrift(fakeServerTs, fakeOpenApiPaths);

        expect(result.undocumentedPrefixes).toEqual([]);
        expect(result.phantomDocumentedPaths).toEqual([]);
    });
});

describe('extractMountedRoutes', () => {
    it('extrai path e resourceKey de app.use/app.get com string literal', () => {
        const source = `
            app.use('/api/companies', mw1, mw2, companyRoutes);
            app.get('/api/notifications/stream', mw1, handler);
        `;
        const routes = extractMountedRoutes(source);

        expect(routes).toContainEqual({ path: '/api/companies', resourceKey: ['api', 'companies'] });
        expect(routes).toContainEqual({ path: '/api/notifications/stream', resourceKey: ['api', 'notifications', 'stream'] });
    });

    it('para o resourceKey no primeiro segmento de parâmetro (:param)', () => {
        const source = `app.use('/api/leads/:leadId/notes', mw, noteRoutes);`;
        const routes = extractMountedRoutes(source);

        expect(routes[0].resourceKey).toEqual(['api', 'leads']);
    });
});
