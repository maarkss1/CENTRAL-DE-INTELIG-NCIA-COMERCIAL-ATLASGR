import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

// Modelos que realmente têm a coluna `organizationId` no schema — calculado a partir do DMMF em vez
// de mantido à mão, porque uma lista fixa ("skip estes 5, força nos outros") já quebrou antes: todo
// modelo novo sem organizationId (Prompt, AiEngineSetting, Note, etc.) explode com
// "Unknown argument organizationId" assim que é consultado via `req.db` (o client tenant-scoped),
// mesmo que o model nunca devesse ser filtrado por tenant.
const MODELS_WITH_ORGANIZATION_ID = new Set(
    Prisma.dmmf.datamodel.models
        .filter((m) => m.fields.some((f) => f.name === 'organizationId'))
        .map((m) => m.name),
);

/**
 * Retorna uma instância do Prisma Client estendida para garantir o Row-Level Security (RLS)
 * a nível de aplicação. Todas as operações de leitura e escrita interceptadas por esta
 * extensão vão automaticamente injetar e validar o `organizationId` — mas apenas nos modelos
 * que de fato possuem essa coluna.
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
                    if (!MODELS_WITH_ORGANIZATION_ID.has(model)) {
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
                        const createData = args.data as Record<string, unknown>;
                        args.data = {
                            ...createData,
                            organizationId,
                        } as typeof args.data;
                    }

                    // Se for createMany, iterar para garantir o organizationId
                    if (operation === 'createMany' && Array.isArray(args.data)) {
                        const createManyData = args.data as Array<Record<string, unknown>>;
                        args.data = createManyData.map(item => ({
                            ...item,
                            organizationId,
                        })) as typeof args.data;
                    }

                    return query(args);
                },
            },
        },
    });
}
