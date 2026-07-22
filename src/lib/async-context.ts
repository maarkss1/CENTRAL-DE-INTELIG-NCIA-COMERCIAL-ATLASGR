import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
    tenantId?: string;
    userId?: string;
    role?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export const getTenantId = (): string | undefined => {
    return requestContext.getStore()?.tenantId;
};

export const getUserId = (): string | undefined => {
    return requestContext.getStore()?.userId;
};
