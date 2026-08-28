import type { Express } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from '../lib/auth.js';
import { requestContext } from '../lib/async-context.js';

/**
 * Monta o handler do Better Auth em /api/auth. As tabelas Organization/user/session/account/
 * verification têm tenant_isolation_policy via RLS (app.current_tenant_id = organizationId).
 * Login e validação de sessão acontecem ANTES de descobrir o tenant do usuário — sem bypass
 * explícito, a própria consulta que descobriria o tenant é bloqueada pelo RLS, e login por
 * e-mail/senha nunca consegue ler o usuário (ver bypassRls em src/lib/async-context.ts e o
 * allowlist de models em src/lib/prisma.ts, que restringe esse bypass só às tabelas de
 * identidade do Better Auth). O isolamento de dados de negócio (companies, leads, etc.) continua
 * real: essas rotas passam por authenticateToken, que só concede tenantId real da sessão.
 */
export function mountAuthHandler(app: Express): void {
  const authHandler = toNodeHandler(auth);
  // CORREÇÃO: app.all captura todos os métodos HTTP, incluindo CONNECT e TRACE.
  // app.use é mais correto aqui: deixa o Better Auth decidir quais métodos aceita.
  app.use('/api/auth', (req, res) => {
    requestContext.run({ bypassRls: true }, () => authHandler(req, res));
  });
}
