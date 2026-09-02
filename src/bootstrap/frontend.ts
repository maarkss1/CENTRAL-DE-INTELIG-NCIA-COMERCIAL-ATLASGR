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
    app.use('/_next', express.static(path.join(process.cwd(), 'public', 'tools', 'treinamento-atlasgr', '_next')));
    
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

    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}
