import type { Express } from 'express';
import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { env } from '../config/env.js';

/**
 * Serve o frontend: em desenvolvimento, monta o middleware do Vite (HMR, SPA fallback) em modo
 * middleware embutido no mesmo processo Express; em produção, serve os estáticos já buildados em
 * `dist/` e devolve `index.html` para qualquer rota não estática (SPA client-side routing).
 * Assíncrono porque `createViteServer` é assíncrono — precisa ser aguardado antes do error
 * handler e do restante do boot em server.ts.
 */
export async function mountFrontend(app: Express): Promise<void> {
  if (env.NODE_ENV !== 'production') {
    // Serve estáticos do /tools antes do Vite, para evitar que o Vite intercepte .html e retorne o SPA fallback
    app.use('/tools', express.static(path.join(process.cwd(), 'public', 'tools')));
    // Treinamento AtlasGR (Next.js export) precisa de /_next na raiz
    app.use(
      '/_next',
      express.static(path.join(process.cwd(), 'public', 'tools', 'treinamento-atlasgr', '_next')),
    );

    const vite = await createViteServer({
      server: { middlewareMode: true, host: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));

    // Treinamento AtlasGR (Next.js export) precisa de /_next na raiz (em produção fica em dist/tools/...)
    app.use('/_next', express.static(path.join(distPath, 'tools', 'treinamento-atlasgr', '_next')));

    // Express 5 (path-to-regexp v8) não aceita mais o wildcard nu `'*'` — o processo morria no
    // boot com `PathError: Missing parameter name at index 1: *` (Render, deploys de 03/09/2026,
    // commits 6624fda/5cd0a2d, ambos `update_failed`). A CI nunca pegou porque o E2E roda com
    // NODE_ENV=test, que cai no branch do Vite acima e nunca executa este fallback de produção —
    // ver scripts/ci/smoke-production-boot.mjs, que passou a exercitar exatamente este caminho.
    // `/{*splat}` é a sintaxe oficial do Express 5 para "qualquer caminho, inclusive a raiz".
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}
