import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { AuditService } from './audit/audit.service.js';

import { PrismaPg } from '@prisma/adapter-pg';
import { searchQueue } from './queue/search.queue.js';
import { logger } from './logger.js';
import { requestContext } from './async-context.js';
const connectionString = process.env.DATABASE_URL || "postgresql://dummy:dummy@localhost:5432/dummy";

// Production-ready connection pool configuration
const pool = new Pool({
  connectionString,
  max: 20, // Max number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// Error handling for idle clients
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
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
        const bypassRls = (store as any)?.bypassRls || false;
        
        const tenantModels = ['Company', 'Contact', 'Lead', 'Activity', 'User'];
        const auditableModels = ['Company', 'Contact', 'Lead', 'Activity'];
        const isAuditable = auditableModels.includes(model as string);

        if (tenantId && tenantModels.includes(model as string)) {
          if (operation === 'create' || operation === 'createMany') {
             if ((args as any).data) {
                if (Array.isArray((args as any).data)) {
                  (args as any).data = (args as any).data.map((d: any) => ({ ...d, organizationId: tenantId }));
                } else {
                  (args as any).data = { ...(args as any).data, organizationId: tenantId };
                }
             }
          }
          if (operation === 'upsert') {
             if ((args as any).create) {
                (args as any).create = { ...(args as any).create, organizationId: tenantId };
             }
          }
        }

        // --- 2. Soft Delete (Read Filtering) ---
        if (isAuditable) {
          if (['findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy'].includes(operation)) {
             (args as any).where = { ...(args as any).where, deletedAt: null };
          }
        }

        const executeWithRls = async (prismaPromise: any) => {
          if (!tenantId && !bypassRls) return await prismaPromise;
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
        let beforeState: any = null;
        if (isAuditable && (operation === 'update' || operation === 'delete')) {
           try {
              beforeState = await executeWithRls((basePrisma as any)[model as string].findUnique({ where: (args as any).where }));
           } catch (e) {
              // Ignore if we can't find it or where is complex
           }
        }

        // --- 4. Execute Query (Intercepting Delete) ---
        let result: any;
        let affectedIds: string[] = [];

        if (isAuditable && operation === 'delete') {
            result = await executeWithRls((basePrisma as any)[model as string].update({
                where: (args as any).where,
                data: { deletedAt: new Date(), deletedBy: userId, deleteReason: 'Soft delete' }
            }));
            if (result && result.id) {
               affectedIds.push(result.id);
            }
        } else if (isAuditable && operation === 'deleteMany') {
            // Need to fetch IDs first to cascade
            const recordsToSoftDelete = await executeWithRls((basePrisma as any)[model as string].findMany({
                where: (args as any).where,
                select: { id: true }
            }));
            affectedIds = recordsToSoftDelete.map((r: any) => r.id);

            result = await executeWithRls((basePrisma as any)[model as string].updateMany({
                where: (args as any).where,
                data: { deletedAt: new Date(), deletedBy: userId, deleteReason: 'Soft delete' }
            }));
        } else {
            result = await executeWithRls(query(args));
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
                if (operation === 'findUniqueOrThrow') throw new Error('Record not found');
                return null;
            }
        }

        // --- 5. Audit Log & Search Queue ---
        if (isAuditable && ['create', 'update', 'delete'].includes(operation) && result) {
             const action = operation.toUpperCase() as any;
             const entityId = result.id;
             AuditService.log({
                 action,
                 entity: model as string,
                 entityId: entityId,
                 actorId: userId,
                 tenantId: tenantId || result.organizationId,
                 beforeState: beforeState,
                 afterState: operation === 'delete' ? undefined : result
             }).catch(err => logger.error(err, 'AuditLog failed'));
             
             if (model === 'Company' || model === 'Lead') {
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

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma;

// Graceful shutdown handling
process.on('beforeExit', async () => {
  console.log('Shutting down Prisma client and database connection pool...');
  await prisma.$disconnect();
  await pool.end();
  console.log('Shutdown complete.');
});
