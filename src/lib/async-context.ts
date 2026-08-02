import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
    tenantId?: string;
    userId?: string;
    role?: string;
    // Só usado para as rotas do Better Auth (/api/auth/*, ver server.ts): antes de uma sessão
    // existir não há tenantId conhecido, mas o Better Auth ainda precisa localizar o usuário por
    // e-mail (login), criar a Organization inicial (signup) e ler/gravar Session — todas essas
    // tabelas têm FORCE ROW LEVEL SECURITY (prisma/migrations/20260722020322_enable_rls). Sem
    // este bypass explícito, current_setting('app.current_tenant_id') nunca bate com nada e as
    // policies de RLS bloqueiam até as próprias queries internas do Better Auth.
    bypassRls?: boolean;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export const getTenantId = (): string | undefined => {
    return requestContext.getStore()?.tenantId;
};

export const getUserId = (): string | undefined => {
    return requestContext.getStore()?.userId;
};
