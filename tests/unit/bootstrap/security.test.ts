import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// `ALLOWED_ORIGINS` (o array exportado) é calculado uma única vez, no momento em que o módulo é
// importado — para exercitar os dois ramos (fallback de localhost vs. lista vinda da env) sem
// vazar estado entre testes, cada teste reseta o registro de módulos e reimporta
// `src/bootstrap/security.ts` depois de mockar `env` com o valor que quer observar.
async function loadSecurityModule(envOverrides: Record<string, unknown>) {
    vi.resetModules();
    vi.doMock('../../../src/config/env.js', () => ({
        env: {
            NODE_ENV: 'development',
            ALLOWED_ORIGINS: undefined,
            TRUST_PROXY: false,
            ...envOverrides,
        },
    }));
    return import('../../../src/bootstrap/security.js');
}

describe('bootstrap/security', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.doUnmock('../../../src/config/env.js');
    });

    describe('ALLOWED_ORIGINS', () => {
        it('cai para o fallback de localhost quando ALLOWED_ORIGINS não está definida', async () => {
            const mod = await loadSecurityModule({ ALLOWED_ORIGINS: undefined });
            expect(mod.ALLOWED_ORIGINS).toEqual([
                'http://localhost:3005',
                'http://localhost:3000',
                'http://localhost:5173',
            ]);
        });

        it('faz parse da lista CSV configurada, removendo espaços e entradas vazias', async () => {
            const mod = await loadSecurityModule({
                ALLOWED_ORIGINS: 'https://app.atlasgr.com.br, https://app.totaltrac.com.br,',
            });
            expect(mod.ALLOWED_ORIGINS).toEqual([
                'https://app.atlasgr.com.br',
                'https://app.totaltrac.com.br',
            ]);
        });
    });

    describe('assertAllowedOriginsConfigured', () => {
        it('encerra o processo em produção sem ALLOWED_ORIGINS configurada', async () => {
            const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

            const mod = await loadSecurityModule({ NODE_ENV: 'production', ALLOWED_ORIGINS: undefined });
            mod.assertAllowedOriginsConfigured();

            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('ALLOWED_ORIGINS'));
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        it('NÃO encerra o processo em produção quando ALLOWED_ORIGINS está configurada', async () => {
            const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

            const mod = await loadSecurityModule({
                NODE_ENV: 'production',
                ALLOWED_ORIGINS: 'https://app.atlasgr.com.br',
            });
            mod.assertAllowedOriginsConfigured();

            expect(exitSpy).not.toHaveBeenCalled();
        });

        it('NÃO encerra o processo fora de produção, mesmo sem ALLOWED_ORIGINS', async () => {
            const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

            const mod = await loadSecurityModule({ NODE_ENV: 'development', ALLOWED_ORIGINS: undefined });
            mod.assertAllowedOriginsConfigured();

            expect(exitSpy).not.toHaveBeenCalled();
        });
    });

    describe('applySecurityMiddleware', () => {
        beforeEach(() => {
            vi.resetModules();
            vi.doUnmock('../../../src/config/env.js');
        });

        it('aplica cabeçalhos de segurança do Helmet e permite qualquer origem fora de produção', async () => {
            const { applySecurityMiddleware } = await import('../../../src/bootstrap/security.js');
            const app = express();
            applySecurityMiddleware(app);
            app.get('/ping', (_req, res) => res.status(200).json({ ok: true }));

            const res = await request(app).get('/ping').set('Origin', 'https://qualquer-origem.example.com');

            expect(res.status).toBe(200);
            // Helmet aplica X-Content-Type-Options: nosniff por padrão.
            expect(res.headers['x-content-type-options']).toBe('nosniff');
            expect(res.headers['access-control-allow-origin']).toBe('https://qualquer-origem.example.com');
        });
    });
});
