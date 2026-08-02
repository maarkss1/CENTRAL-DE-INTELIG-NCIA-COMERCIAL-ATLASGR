import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
    tenantId?: string;
    userId?: string;
    role?: string;
    // Só deve ser setado por infraestrutura de teste (ver tests/helpers/integration-setup.ts) —
    // faz src/lib/prisma.ts pular a aplicação de RLS. Nenhum caminho de request real seta isso.
    bypassRls?: boolean;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export const getTenantId = (): string | undefined => {
    return requestContext.getStore()?.tenantId;
};

export const getUserId = (): string | undefined => {
    return requestContext.getStore()?.userId;
};
