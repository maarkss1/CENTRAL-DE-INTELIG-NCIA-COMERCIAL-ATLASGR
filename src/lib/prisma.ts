import { PrismaClient, Prisma } from '@prisma/client';
import { Pool } from 'pg';
import { AuditService, type AuditAction } from './audit/audit.service.js';

import { PrismaPg } from '@prisma/adapter-pg';
import { searchQueue } from './queue/search.queue.js';
import { queuesEnabled } from './queue/redis.js';
import { logger } from './logger.js';
import { requestContext } from './async-context.js';
import { env } from '../config/env.js';
const connectionString = env.DATABASE_URL || process.env.DATABASE_URL || "";

// Production-ready connection pool configuration
const pool = new Pool({
  connectionString,
  max: 20, // Max number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
  allowExitOnIdle: true,
});

// Error handling for idle clients — usa logger estruturado (não console.error) para aparecer no Pino/Datadog.
pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle database client');
});

const adapter = new PrismaPg(pool);

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const basePrisma = globalForPrisma.prisma || new PrismaClient({
  adapter,
});

export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const store = requestContext.getStore();
        const tenantId = store?.tenantId;
        const userId = store?.userId;
        // bypassRls em produção só existe pra as rotas do Better Auth (login/signup/sessão, ver
        // server.ts e authenticateToken.ts), que precisam localizar usuário/sessão/organização
        // antes de haver um tenant conhecido. Em produção, restringe o efeito do bypass a esses
        // models — mesmo que o contexto vaze pra uma query de outro model (ex.: um handler futuro
        // do Better Auth que também toque Company/Lead), RLS continua valendo normalmente ali. Em
        // dev/test não restringe: fixtures de teste de integração (ver tests/helpers/
        // integration-setup.ts e tests/integration/tenant-isolation-db001.test.ts) legitimamente
        // manipulam múltiplos tenants fora de qualquer request HTTP, e essa camada nunca é exposta
        // a usuário real fora de produção.
        const rawBypassRls = Boolean((store as Record<string, unknown>)?.bypassRls);
        const BYPASS_RLS_ALLOWED_MODELS = ['User', 'Organization', 'Session', 'Account', 'Verification'];
        const bypassRls = rawBypassRls && (env.NODE_ENV !== 'production' || BYPASS_RLS_ALLOWED_MODELS.includes(model as string));

        const tenantModels = [
          'Company', 'Contact', 'Lead', 'Activity', 'User',
          'CrmPipeline', 'CrmProduct', 'CrmDealItem', 'CrmCommercialDocument',
        ];
        const auditableModels = [
          'Company', 'Contact', 'Lead', 'Activity',
          'CrmPipeline', 'CrmProduct', 'CrmDealItem', 'CrmCommercialDocument',
        ];
        const isAuditable = auditableModels.includes(model as string);

        if (tenantId && tenantModels.includes(model as string)) {
          const a = args as Record<string, unknown>;
          if (operation === 'create' || operation === 'createMany') {
             if (a.data) {
                if (Array.isArray(a.data)) {
                  a.data = (a.data as Record<string, unknown>[]).map(d => ({ ...d, organizationId: tenantId }));
                } else {
                  a.data = { ...(a.data as Record<string, unknown>), organizationId: tenantId };
                }
             }
          }
          if (operation === 'upsert') {
             if (a.create) {
                a.create = { ...(a.create as Record<string, unknown>), organizationId: tenantId };
             }
          }
        }

        // --- 2. Soft Delete (Read Filtering) ---
        if (isAuditable) {
          if (['findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy'].includes(operation)) {
             const a = args as Record<string, unknown>;
             a.where = { ...(a.where as Record<string, unknown>), deletedAt: null };
          }
        }

        const executeWithRls = async (prismaPromise: Prisma.PrismaPromise<unknown>) => {
          if (!tenantId && !bypassRls) return await prismaPromise;
          // Sem try/catch de propósito: um `catch { return await prismaPromise }` aqui existia antes
          // e mascarava o erro real de qualquer falha (ex.: violação de unique constraint) reexecutando
          // a MESMA query fora da transação, sem nenhum app.current_tenant_id/bypass_rls setado —
          // essa segunda tentativa então falhava de um jeito diferente e enganoso (parecia RLS
          // "new row violates row-level security policy", quando o problema real era outro, ver
          // TEST-002/e2e). Se a transação com contexto de tenant falha, o erro real deve subir —
          // nunca cair pra uma tentativa sem proteção de tenant/RLS.
          const [, res] = await basePrisma.$transaction([
            basePrisma.$executeRawUnsafe(
              `SELECT set_config('app.bypass_rls', $1, TRUE), set_config('app.current_tenant_id', $2, TRUE);`,
              bypassRls ? 'on' : 'off',
              tenantId || ''
            ),
            prismaPromise
          ]);
          return res;
        };

        // --- 3. Audit Log - Capture Before State ---
        let beforeState: Record<string, unknown> | null = null;
        if (isAuditable && (operation === 'update' || operation === 'delete')) {
           try {
              const a = args as Record<string, unknown>;
              const modelDelegate = (basePrisma as unknown as Record<string, unknown>)[model as string] as Record<string, unknown>;
              beforeState = await executeWithRls((modelDelegate.findUnique as (args: unknown) => Prisma.PrismaPromise<unknown>)({ where: a.where })) as Record<string, unknown> | null;
           } catch {
              // Ignore if we can't find it or where is complex
           }
        }

        // --- 4. Execute Query (Intercepting Delete) ---
        let result: Record<string, unknown> | null = null;
        let affectedIds: string[] = [];
        const basePrismaRecord = basePrisma as unknown as Record<string, unknown>;
        const a = args as Record<string, unknown>;

        if (isAuditable && operation === 'delete') {
            const modelDelegate = basePrismaRecord[model as string] as Record<string, unknown>;
            result = await executeWithRls((modelDelegate.update as (args: unknown) => Prisma.PrismaPromise<unknown>)({
                where: a.where,
                data: { deletedAt: new Date(), deletedBy: userId, deleteReason: 'Soft delete' }
            })) as Record<string, unknown>;
            if (result && result.id) {
               affectedIds.push(result.id as string);
            }
        } else if (isAuditable && operation === 'deleteMany') {
            const modelDelegate = basePrismaRecord[model as string] as Record<string, unknown>;
            // Need to fetch IDs first to cascade
            const recordsToSoftDelete = await executeWithRls((modelDelegate.findMany as (args: unknown) => Prisma.PrismaPromise<unknown>)({
                where: a.where,
                select: { id: true }
            })) as Record<string, unknown>[];
            affectedIds = recordsToSoftDelete.map((r) => r.id as string);

            result = await executeWithRls((modelDelegate.updateMany as (args: unknown) => Prisma.PrismaPromise<unknown>)({
                where: a.where,
                data: { deletedAt: new Date(), deletedBy: userId, deleteReason: 'Soft delete' }
            })) as Record<string, unknown>;
        } else {
            result = await executeWithRls(query(args)) as Record<string, unknown>;
        }

        // --- Cascade Soft Deletes ---
        if (isAuditable && (operation === 'delete' || operation === 'deleteMany') && affectedIds.length > 0) {
            const cascadeData = { deletedAt: new Date(), deletedBy: userId, deleteReason: 'Cascade Soft Delete' };
            
            if (model === 'Company') {
                await executeWithRls(basePrisma.contact.updateMany({
                    where: { companyId: { in: affectedIds } },
                    data: cascadeData
                }));
                await executeWithRls(basePrisma.lead.updateMany({
                    where: { companyId: { in: affectedIds } },
                    data: cascadeData
                }));
            } else if (model === 'Contact') {
                await executeWithRls(basePrisma.lead.updateMany({
                    where: { contactId: { in: affectedIds } },
                    data: cascadeData
                }));
            } else if (model === 'Lead') {
                await executeWithRls(basePrisma.activity.updateMany({
                    where: { leadId: { in: affectedIds } },
                    data: cascadeData
                }));
            }
        }

        // --- Soft Delete (findUnique filtering) ---
        if (isAuditable && (operation === 'findUnique' || operation === 'findUniqueOrThrow')) {
            if (result && result.deletedAt !== null) {
                if (operation === 'findUniqueOrThrow') {
                    throw new Prisma.PrismaClientKnownRequestError(
                        'An operation failed because it depends on one or more records that were required but not found.',
                        { code: 'P2025', clientVersion: Prisma.prismaVersion.client }
                    );
                }
                return null;
            }
        }

        // --- 5. Audit Log & Search Queue ---
        if (isAuditable && ['create', 'update', 'delete'].includes(operation) && result) {
             // Cast seguro: o `.includes` acima já garante operation ∈ {create,update,delete}.
             const action = operation.toUpperCase() as AuditAction;
             const entityId = result.id as string | undefined;
             AuditService.log({
                 action,
                 entity: model as string,
                 entityId,
                 actorId: userId as string | undefined,
                 tenantId: (tenantId || result.organizationId) as string | undefined,
                 beforeState: beforeState ?? undefined,
                 afterState: operation === 'delete' ? undefined : result
             }).catch(err => logger.error(err, 'AuditLog failed'));
             
             if (queuesEnabled && (model === 'Company' || model === 'Lead')) {
                 const indexName = model === 'Company' ? 'companies' : 'leads';
                 const searchAction = operation === 'delete' ? 'delete' : (operation === 'create' ? 'add' : 'update');
                 searchQueue.add(searchAction, {
                     index: indexName,
                     action: searchAction,
                     data: operation === 'delete' ? [result.id] : [{ ...result }]
                 }).catch(err => logger.error(err, 'Failed to enqueue search index task'));
             }
        }

        return result;
      }
    }
  }
}) as unknown as PrismaClient; // Cast needed due to complex extension types

/**
 * Executa `fn` dentro de uma transação com `app.current_tenant_id`/`app.bypass_rls` já setados.
 *
 * Necessário para SQL cru (`$executeRaw`/`$queryRaw`): esses métodos não passam pela extensão
 * `$allOperations` acima (ela só intercepta operações de model), então uma query crua na tabela
 * "prisma" exportada nunca teria o contexto de tenant setado — e bateria na RLS mesmo com um
 * usuário autenticado normal (ver DocumentChunk em ingestion.service.ts).
 */
export async function withRlsContext<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const store = requestContext.getStore();
  const tenantId = store?.tenantId ?? '';
  const bypassRls = Boolean((store as Record<string, unknown>)?.bypassRls);
  return basePrisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.bypass_rls', $1, TRUE), set_config('app.current_tenant_id', $2, TRUE);`,
      bypassRls ? 'on' : 'off',
      tenantId,
    );
    return fn(tx);
  });
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma;

// Graceful shutdown handling
process.on('beforeExit', async () => {
  logger.info('Shutting down Prisma client and database connection pool...');
  await prisma.$disconnect();
  await pool.end();
  logger.info('Shutdown complete.');
});
