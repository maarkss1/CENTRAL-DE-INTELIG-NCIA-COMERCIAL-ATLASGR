import { prisma } from './prisma.js';

/**
 * Retorna uma instância do Prisma Client estendida para garantir o Row-Level Security (RLS)
 * a nível de aplicação. Todas as operações de leitura e escrita interceptadas por esta
 * extensão vão automaticamente injetar e validar o `organizationId`.
 *
 * @param organizationId - ID do locatário atual
 */
export function getTenantPrisma(organizationId: string) {
    if (!organizationId) {
        throw new Error('Tenant Prisma initialization requires a valid organizationId');
    }

    return prisma.$extends({
        query: {
            $allModels: {
                async $allOperations({ model, operation, args, query }) {
                    const skipTenantCheck = ['User', 'Session', 'Account', 'Verification', 'Organization'];
                    
                    if (skipTenantCheck.includes(model)) {
                        return query(args);
                    }

                    // Se a operação for find/update/delete, precisamos forçar o organizationId no where
                    if (
                        operation === 'findUnique' ||
                        operation === 'findUniqueOrThrow' ||
                        operation === 'findFirst' ||
                        operation === 'findFirstOrThrow' ||
                        operation === 'findMany' ||
                        operation === 'count' ||
                        operation === 'update' ||
                        operation === 'updateMany' ||
                        operation === 'delete' ||
                        operation === 'deleteMany'
                    ) {
                        args.where = {
                            ...(args.where || {}),
                            organizationId,
                        };
                    }

                    // Se a operação for de criação (create), precisamos forçar a injeção do organizationId nos dados
                    if (operation === 'create') {
                        args.data = {
                            ...(args.data as any),
                            organizationId,
                        } as any;
                    }

                    // Se for createMany, iterar para garantir o organizationId
                    if (operation === 'createMany' && Array.isArray(args.data)) {
                        args.data = (args.data as any[]).map(item => ({
                            ...item,
                            organizationId,
                        })) as any;
                    }

                    return query(args);
                },
            },
        },
    });
}
