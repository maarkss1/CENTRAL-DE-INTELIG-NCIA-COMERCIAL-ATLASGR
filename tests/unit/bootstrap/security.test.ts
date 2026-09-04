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

        // Regressão real: Better Auth resolve IP do cliente lendo x-forwarded-for por conta
        // própria (getIp, @better-auth/core/utils/ip.ts) — sem trustedProxies configurado, um
        // header com mais de um IP (formato de cadeia com mais de um proxy à frente da
        // aplicação) é tratado como não confiável e devolve null, fazendo o rate limit de login
        // virar um único bucket compartilhado entre todos os clientes (warning real de produção
        // "Rate limiting could not determine a client IP", issues #157/#158). Reaproveitar
        // req.ip do Express foi tentado e descartado (trust proxy: N conta hops a partir do
        // socket que conecta na aplicação, não a partir do cliente — com mais de 1 proxy à
        // frente, req.ip resolve para outro proxy, não para o cliente real). Com
        // TRUST_PROXY=true este middleware aplica a convenção universal do próprio cabeçalho
        // (cada proxy ANEXA ao final; o valor mais à esquerda é sempre o cliente original) —
        // sem precisar conhecer a contagem de hops nem o CIDR do proxy do Render.
        it('com TRUST_PROXY=true, normaliza x-forwarded-for multi-hop para o primeiro valor (cliente original, convenção do header)', async () => {
            vi.doMock('../../../src/config/env.js', () => ({
                env: { NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://app.example.com', TRUST_PROXY: true },
            }));
            const { applySecurityMiddleware } = await import('../../../src/bootstrap/security.js');
            const app = express();
            app.set('trust proxy', 1);
            applySecurityMiddleware(app);
            app.get('/ping', (req, res) => res.status(200).json({ xff: req.headers['x-forwarded-for'] }));

            // Simula uma cadeia com mais de um proxy à frente da aplicação: "<cliente>, <proxy>".
            const res = await request(app)
                .get('/ping')
                .set('X-Forwarded-For', '203.0.113.7, 10.0.0.5')
                .set('Origin', 'https://app.example.com');

            expect(res.status).toBe(200);
            expect(res.body.xff).toBe('203.0.113.7');
        });

        it('não mexe em x-forwarded-for de hop único (caso já suportado pelo Better Auth)', async () => {
            vi.doMock('../../../src/config/env.js', () => ({
                env: { NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://app.example.com', TRUST_PROXY: true },
            }));
            const { applySecurityMiddleware } = await import('../../../src/bootstrap/security.js');
            const app = express();
            app.set('trust proxy', 1);
            applySecurityMiddleware(app);
            app.get('/ping', (req, res) => res.status(200).json({ xff: req.headers['x-forwarded-for'] }));

            const res = await request(app)
                .get('/ping')
                .set('X-Forwarded-For', '203.0.113.7')
                .set('Origin', 'https://app.example.com');

            expect(res.body.xff).toBe('203.0.113.7');
        });
    });
});
