import { PrismaClient, Prisma } from '@prisma/client';
import { Pool } from 'pg';
import { AuditService, type AuditAction } from './audit/audit.service.js';

import { PrismaPg } from '@prisma/adapter-pg';
import { searchQueue } from './queue/search.queue.js';
import { queuesEnabled } from './queue/redis.js';
import { logger } from './logger.js';
import { requestContext } from './async-context.js';
import { env } from '../config/env.js';
import { encryptField, decryptField } from './crypto/secretFields.js';
const connectionString = env.DATABASE_URL || process.env.DATABASE_URL || "";

// Campos de credencial de integração que são cifrados em repouso (AES-256-GCM, ver
// src/lib/crypto/secretFields.ts) — cifra ao gravar/decifra ao ler, de forma transparente para
// todo o resto do código (services de Bitrix/Google continuam lendo texto puro em memória; só o
// valor persistido no Postgres é cifrado).
const ENCRYPTED_FIELDS: Record<string, readonly string[]> = {
  GoogleWorkspaceConnection: ['accessToken', 'refreshToken'],
  BitrixConnection: ['webhookUrl', 'webhookSecret'],
  // Credencial de PABX 3CX (Call Control API) — mesmo tratamento das duas linhas acima. Ver
  // .agents/handoffs/onda-5/01-para-06-persistencia-3cx-implementada.md.
  ThreeCXConnection: ['apiKey', 'apiSecret'],
};

function encryptSensitiveFields(model: string, data: Record<string, unknown>): Record<string, unknown> {
  const fields = ENCRYPTED_FIELDS[model];
  if (!fields) return data;
  const out = { ...data };
  for (const field of fields) {
    if (typeof out[field] === 'string' && out[field]) {
      out[field] = encryptField(out[field] as string);
    }
  }
  return out;
}

function decryptSensitiveRecord<T>(model: string, record: T): T {
  const fields = ENCRYPTED_FIELDS[model];
  if (!fields || !record || typeof record !== 'object') return record;
  const out = record as Record<string, unknown>;
  for (const field of fields) {
    if (typeof out[field] === 'string' && out[field]) {
      out[field] = decryptField(out[field] as string);
    }
  }
  return out as T;
}

function decryptSensitiveResult<T>(model: string, result: T): T {
  if (!ENCRYPTED_FIELDS[model] || !result) return result;
  if (Array.isArray(result)) {
    return result.map((item) => decryptSensitiveRecord(model, item)) as unknown as T;
  }
  return decryptSensitiveRecord(model, result);
}

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
      // `query` (a próxima operação na cadeia de extensão, ligada ao client base) não é mais usada
      // diretamente — ver comentário grande dentro de `executeWithRls` abaixo sobre por que ela foi
      // substituída por chamadas ao delegate do model/operation via o client (`tx` ou `basePrisma`)
      // passado explicitamente para cada `executeWithRls`.
      async $allOperations({ model, operation, args }) {
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
        // BitrixConnection entrou nesta allowlist só para o lookup de bootstrap do webhook de
        // entrada do Bitrix (ver bitrix.webhook.ts): a rota recebe apenas um connectionId (cuid,
        // não adivinhável) na URL e um segredo no corpo, sem JWT — não há tenant conhecido até
        // achar a conexão. O mesmo modelo de confiança das tabelas de identidade abaixo (um
        // token/id opaco É a credencial, não o "estar logado"). O bypass aqui só cobre esta ÚNICA
        // query (findUnique por id); toda leitura/escrita seguinte roda dentro de
        // requestContext.run({ tenantId: connection.organizationId }) com RLS normal, igual ao
        // padrão já usado pelo lookup de Organization em runBitrixSyncTick (syncRules.ts).
        // FeatureFlag entrou nesta allowlist por um motivo diferente das tabelas de identidade
        // acima: não tem organizationId (catálogo global, ver prisma/schema.prisma), e é
        // sincronizada em server.ts no BOOT do processo (featureFlagsService.syncRegistry()),
        // antes de qualquer request HTTP existir — logo sem tenantId nem sessão possíveis. A
        // policy de RLS da tabela (app_context_policy, ver migration
        // 20260815030000_feature_flags_and_bug_reports) exige app.bypass_rls='on' nesse caso
        // porque `INSERT ... ON CONFLICT DO UPDATE` (o que Prisma `upsert` gera) precisa da
        // visibilidade da cláusula USING para checar conflito, mesmo indo pelo ramo de INSERT.
        // Sem este bypass, o catálogo de flags nunca seria semeado em produção. Zero risco de
        // vazamento cross-tenant: a tabela não tem nenhuma linha "de uma organização" para vazar.
        // CadenceRun/CadenceSequence entraram nesta allowlist pelo mesmo motivo já documentado acima
        // para BitrixConnection: o worker de cadência (CYC-008, onda-19) precisa descobrir QUAIS
        // organizações têm CadenceRun ativo antes de saber qual tenant escopar — sem isso, a
        // varredura cross-tenant devolve sempre 0 linhas em produção (confirmado por teste de
        // integração real: FORCE ROW LEVEL SECURITY nessas tabelas nega qualquer leitura sem
        // app.current_tenant_id OU app.bypass_rls setados, e nenhum dos dois é setado numa query sem
        // contexto de request). bypassRls só cobre esta descoberta inicial: assim que o worker sabe o
        // `organizationId` de cada run, todo o resto do ciclo (`advanceCadenceRun`, dispatch,
        // gravação em CadenceTouchAttempt) roda escopado normalmente por tenant, sem bypass — nenhum
        // dado de outra organização é lido além da lista de runs ativos e das sequências que eles
        // referenciam (nenhuma delas contém credencial ou dado pessoal do lead, diferente de
        // BitrixConnection).
        // Lead entrou nesta allowlist pelo MESMO motivo e pelo MESMO teste de integração real que
        // confirmou CadenceRun/CadenceSequence: `followUp.worker.ts` (job diário de follow-up de
        // WhatsApp, cron 0 9 * * *) varre leads elegíveis de TODAS as organizações antes de saber
        // qual tenant escopar, exatamente como o worker de cadência. Sem isto, essa varredura
        // sempre devolvia 0 linhas em produção — o follow-up automático nunca disparava para
        // ninguém, silenciosamente (nenhum erro, nenhum log de falha: o worker via "0 leads
        // elegíveis hoje" e seguia em frente). O `include: { contact: true }` da mesma query
        // também precisa do bypass: a política de RLS é por sessão Postgres (`app.bypass_rls`),
        // não por model do Prisma, então o JOIN para Contact dentro dessa MESMA transação herda o
        // mesmo bypass — inerente ao que este worker já precisa fazer (ler telefone de leads de
        // qualquer tenant para decidir quem mensagear), não uma exposição nova. bypassRls só cobre
        // esta descoberta inicial: o envio real e o `Lead.update` seguinte rodam escopados por
        // tenant (`requestContext.run({ tenantId: lead.organizationId })`), sem bypass.
        const BYPASS_RLS_ALLOWED_MODELS = ['User', 'Organization', 'Session', 'Account', 'Verification', 'BitrixConnection', 'FeatureFlag', 'CadenceRun', 'CadenceSequence', 'Lead'];
        const bypassRls = rawBypassRls && (env.NODE_ENV !== 'production' || BYPASS_RLS_ALLOWED_MODELS.includes(model as string));

        const tenantModels = [
          'Company', 'Contact', 'Lead', 'Activity', 'User',
          'CrmPipeline', 'CrmProduct', 'CrmDealItem', 'CrmCommercialDocument',
          // Comercial Inteligente (ver prisma/schema.prisma) — mesmo tratamento: organizationId
          // é sempre injetado a partir do tenant da request, nunca aceito do corpo do payload.
          'CommercialGoal', 'LeadStageHistory',
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

        // --- 1b. Criptografia de credenciais em repouso (write) ---
        if (ENCRYPTED_FIELDS[model as string]) {
          const a = args as Record<string, unknown>;
          if ((operation === 'create' || operation === 'update' || operation === 'updateMany') && a.data) {
            a.data = encryptSensitiveFields(model as string, a.data as Record<string, unknown>);
          } else if (operation === 'createMany' && Array.isArray(a.data)) {
            a.data = (a.data as Record<string, unknown>[]).map((d) => encryptSensitiveFields(model as string, d));
          } else if (operation === 'upsert') {
            if (a.create) a.create = encryptSensitiveFields(model as string, a.create as Record<string, unknown>);
            if (a.update) a.update = encryptSensitiveFields(model as string, a.update as Record<string, unknown>);
          }
        }

        // --- 2. Soft Delete (Read Filtering) ---
        if (isAuditable) {
          if (['findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy'].includes(operation)) {
             const a = args as Record<string, unknown>;
             a.where = { ...(a.where as Record<string, unknown>), deletedAt: null };
          }
        }

        // IMPORTANTE (Onda 9, bug crítico de RLS — ver .agents/runs/onda-9.md): `executeWithRls`
        // costumava combinar o `SET LOCAL` de tenant com a query real via `basePrisma.$transaction([
        // setConfig, prismaPromise])` (array-form). Reproduzido de forma determinística contra
        // Postgres real (não mock): o Client Engine em TypeScript do Prisma 7 (que substituiu o
        // engine binário Rust) não garante, para esse array-form combinando uma `$executeRawUnsafe`
        // crua com uma promise vinda da cadeia de extensão (`query(args)`), que a segunda operação
        // realmente seja enviada ao Postgres dentro da MESMA transação — em alguns casos a operação
        // simplesmente não chega a gerar o INSERT/UPDATE real (nenhum erro, a promise resolve com um
        // objeto de resultado, mas a linha nunca existiu no banco), e em outros o `SET LOCAL` do
        // tenant não fica visível para a query seguinte (RLS rejeita ou devolve vazio). Confirmado
        // com `pg_backend_pid()`/log de SQL (`$on('query')`) que, fora dessa combinação específica,
        // uma transação array-form comum (duas queries do MESMO client base) funciona normalmente —
        // o problema é específico de misturar `$executeRawUnsafe` com uma promise que atravessa a
        // cadeia de extensão do Prisma.
        //
        // Fix: usar uma transação interativa (`basePrisma.$transaction(async (tx) => {...})`) e
        // executar o `SET LOCAL` e a operação real ambos via `tx` (o client vinculado à transação
        // interativa), nunca via `basePrisma` direto — isso é o padrão já usado com sucesso em
        // `withRlsContext` logo abaixo, e a documentação oficial do Prisma recomenda para RLS. Em
        // vez de receber uma `PrismaPromise` já construída (que carrega sua própria ligação ao
        // client base, não a `tx`), `executeWithRls` agora recebe uma função que constrói a operação
        // a partir do client passado (`tx` normal, ou `basePrisma` no caminho sem contexto de
        // tenant) — assim a MESMA referência de client roda o SET e a query.
        const executeWithRls = async <T>(
          build: (client: PrismaClient) => Prisma.PrismaPromise<T>,
        ): Promise<T> => {
          if (!tenantId && !bypassRls) return await build(basePrisma);
          // Sem try/catch de propósito: um `catch { return await prismaPromise }` aqui existia antes
          // e mascarava o erro real de qualquer falha (ex.: violação de unique constraint) reexecutando
          // a MESMA query fora da transação, sem nenhum app.current_tenant_id/bypass_rls setado —
          // essa segunda tentativa então falhava de um jeito diferente e enganoso (parecia RLS
          // "new row violates row-level security policy", quando o problema real era outro, ver
          // TEST-002/e2e). Se a transação com contexto de tenant falha, o erro real deve subir —
          // nunca cair pra uma tentativa sem proteção de tenant/RLS.
          return basePrisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(
              `SELECT set_config('app.bypass_rls', $1, TRUE), set_config('app.current_tenant_id', $2, TRUE);`,
              bypassRls ? 'on' : 'off',
              tenantId || ''
            );
            return build(tx as unknown as PrismaClient);
          });
        };

        // --- 3. Audit Log - Capture Before State ---
        let beforeState: Record<string, unknown> | null = null;
        if (isAuditable && (operation === 'update' || operation === 'delete')) {
           try {
              const a = args as Record<string, unknown>;
              beforeState = await executeWithRls((client) => {
                const modelDelegate = (client as unknown as Record<string, unknown>)[model as string] as Record<string, unknown>;
                return (modelDelegate.findUnique as (args: unknown) => Prisma.PrismaPromise<unknown>)({ where: a.where });
              }) as Record<string, unknown> | null;
           } catch {
              // Ignore if we can't find it or where is complex
           }
        }

        // --- 4. Execute Query (Intercepting Delete) ---
        let result: Record<string, unknown> | null = null;
        let affectedIds: string[] = [];
        const a = args as Record<string, unknown>;

        if (isAuditable && operation === 'delete') {
            result = await executeWithRls((client) => {
                const modelDelegate = (client as unknown as Record<string, unknown>)[model as string] as Record<string, unknown>;
                return (modelDelegate.update as (args: unknown) => Prisma.PrismaPromise<unknown>)({
                    where: a.where,
                    data: { deletedAt: new Date(), deletedBy: userId, deleteReason: 'Soft delete' }
                });
            }) as Record<string, unknown>;
            if (result && result.id) {
               affectedIds.push(result.id as string);
            }
        } else if (isAuditable && operation === 'deleteMany') {
            // Need to fetch IDs first to cascade
            const recordsToSoftDelete = await executeWithRls((client) => {
                const modelDelegate = (client as unknown as Record<string, unknown>)[model as string] as Record<string, unknown>;
                return (modelDelegate.findMany as (args: unknown) => Prisma.PrismaPromise<unknown>)({
                    where: a.where,
                    select: { id: true }
                });
            }) as Record<string, unknown>[];
            affectedIds = recordsToSoftDelete.map((r) => r.id as string);

            result = await executeWithRls((client) => {
                const modelDelegate = (client as unknown as Record<string, unknown>)[model as string] as Record<string, unknown>;
                return (modelDelegate.updateMany as (args: unknown) => Prisma.PrismaPromise<unknown>)({
                    where: a.where,
                    data: { deletedAt: new Date(), deletedBy: userId, deleteReason: 'Soft delete' }
                });
            }) as Record<string, unknown>;
        } else {
            // `query` é a operação original desta mesma extensão (ver `$allOperations` acima),
            // vinculada ao client base — equivalente a `client[model][operation](args)` quando
            // `client` é `basePrisma`, mas incapaz de rodar sobre `tx` (a transação interativa usada
            // por `executeWithRls` acima). Chamar o delegate de `client` diretamente pelo nome do
            // model/operation reproduz o mesmo efeito de `query(args)`, mas ligado ao client correto
            // em cada chamada (garante mesma conexão/transação do SET LOCAL de tenant).
            result = await executeWithRls((client) => {
                const modelDelegate = (client as unknown as Record<string, unknown>)[model as string] as Record<string, unknown>;
                return (modelDelegate[operation as string] as (args: unknown) => Prisma.PrismaPromise<unknown>)(args);
            }) as Record<string, unknown>;
        }

        // --- Cascade Soft Deletes ---
        if (isAuditable && (operation === 'delete' || operation === 'deleteMany') && affectedIds.length > 0) {
            const cascadeData = { deletedAt: new Date(), deletedBy: userId, deleteReason: 'Cascade Soft Delete' };
            
            if (model === 'Company') {
                await executeWithRls((client) => client.contact.updateMany({
                    where: { companyId: { in: affectedIds } },
                    data: cascadeData
                }));
                await executeWithRls((client) => client.lead.updateMany({
                    where: { companyId: { in: affectedIds } },
                    data: cascadeData
                }));
            } else if (model === 'Contact') {
                await executeWithRls((client) => client.lead.updateMany({
                    where: { contactId: { in: affectedIds } },
                    data: cascadeData
                }));
            } else if (model === 'Lead') {
                await executeWithRls((client) => client.activity.updateMany({
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
                 searchQueue?.add(searchAction, {
                     index: indexName,
                     action: searchAction,
                     data: operation === 'delete' ? [result.id] : [{ ...result }]
                 }).catch(err => logger.error(err, 'Failed to enqueue search index task'));
             }
        }

        // --- 6. Criptografia de credenciais em repouso (read) ---
        if (ENCRYPTED_FIELDS[model as string]) {
          result = decryptSensitiveResult(model as string, result);
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

// Graceful shutdown handling. `beforeExit` pode disparar mais de uma vez (o event loop pode
// esvaziar de novo enquanto o handler async anterior ainda está rodando) — process.once garante
// que $disconnect()/pool.end() só rodem uma vez, evitando "Called end on pool more than once".
process.once('beforeExit', async () => {
  logger.info('Shutting down Prisma client and database connection pool...');
  await prisma.$disconnect();
  await pool.end();
  logger.info('Shutdown complete.');
});
