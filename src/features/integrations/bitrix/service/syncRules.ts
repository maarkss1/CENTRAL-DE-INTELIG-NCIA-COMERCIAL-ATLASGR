import { prisma } from '../../../../lib/prisma.js';
import { logger } from '../../../../lib/logger.js';
import { AppError } from '../../../../shared/middlewares/errorHandler.js';
import { requestContext } from '../../../../lib/async-context.js';
import { listBitrixLeads, importSelectedBitrixLeads } from './leads.js';
import { listBitrixDeals, importSelectedBitrixDeals } from './deals.js';

// ── Sincronização automática (regras) — ver bitrixSync.worker.ts ───────────────────────────────
//
// Diferente da importação manual acima (sempre por clique explícito), isto deixa o Atlas trazer
// negócios sozinho — mas só o que bate com uma regra que o usuário criou explicitamente aqui
// (pipeline + etapa/vendedor opcionais). Sem nenhuma regra ativa, nada acontece automaticamente;
// isto preserva a decisão original de não importar tudo do portal sem escopo (ver nota no topo
// deste arquivo sobre leads/negócios misturados com notificações de e-mail automáticas).

export interface BitrixSyncRuleInput {
    connectionId: string;
    source: 'lead' | 'deal';
    /** Obrigatório quando source="deal" (pipeline do Negócio); ignorado quando source="lead". */
    categoryId?: string | null;
    /** Etapa (Deal) ou status (Lead) — opcional nos dois casos. */
    stageId?: string | null;
    assignedById?: string | null;
}

export async function listSyncRules(organizationId: string, connectionId: string) {
    return prisma.bitrixSyncRule.findMany({ where: { organizationId, connectionId }, orderBy: { createdAt: 'desc' } });
}

export async function createSyncRule(organizationId: string, input: BitrixSyncRuleInput) {
    if (input.source === 'deal' && !input.categoryId) {
        throw new AppError('Informe o pipeline da regra.', 400);
    }
    // Confirma que a conexão realmente pertence a esta organização antes de gravar a regra —
    // sem isto, um connectionId de outro tenant passaria despercebido (RLS bloquearia a leitura
    // depois, mas o erro apareceria tarde demais, na primeira execução do worker).
    const connection = await prisma.bitrixConnection.findFirst({ where: { id: input.connectionId, organizationId } });
    if (!connection) throw new AppError('Conexão Bitrix24 não encontrada para esta organização.', 404);

    return prisma.bitrixSyncRule.create({
        data: {
            organizationId,
            connectionId: input.connectionId,
            source: input.source,
            categoryId: input.source === 'deal' ? input.categoryId : null,
            stageId: input.stageId || null,
            assignedById: input.assignedById || null,
        },
    });
}

export async function setSyncRuleActive(organizationId: string, ruleId: string, active: boolean) {
    const rule = await prisma.bitrixSyncRule.findFirst({ where: { id: ruleId, organizationId } });
    if (!rule) throw new AppError('Regra não encontrada.', 404);
    return prisma.bitrixSyncRule.update({ where: { id: ruleId }, data: { active } });
}

export async function deleteSyncRule(organizationId: string, ruleId: string): Promise<void> {
    const rule = await prisma.bitrixSyncRule.findFirst({ where: { id: ruleId, organizationId } });
    if (!rule) throw new AppError('Regra não encontrada.', 404);
    await prisma.bitrixSyncRule.delete({ where: { id: ruleId } });
}

// Trava de segurança por execução de regra: mesmo com um pipeline movimentado, uma regra nunca
// importa mais que isto numa única rodada do worker — evita que uma regra mal configurada (ex.:
// pipeline errado, sem etapa) inunde o CRM de uma vez só. O próximo tick pega o restante.
const MAX_AUTO_IMPORT_PER_RULE_PER_TICK = 25;

/** Executa uma única regra: busca registros não importados que batem com o filtro e importa até o teto por rodada. */
async function runSyncRule(
    organizationId: string,
    rule: { id: string; connectionId: string; source: string; categoryId: string | null; stageId: string | null; assignedById: string | null },
): Promise<number> {
    if (rule.source === 'lead') {
        const { leads } = await listBitrixLeads(organizationId, rule.connectionId, 0, {
            statusId: rule.stageId || undefined,
            assignedById: rule.assignedById || undefined,
        });
        const pendingIds = leads.filter((l) => !l.alreadyImported).map((l) => l.id).slice(0, MAX_AUTO_IMPORT_PER_RULE_PER_TICK);
        if (pendingIds.length === 0) return 0;
        const { imported } = await importSelectedBitrixLeads(organizationId, rule.connectionId, pendingIds);
        return imported;
    }

    if (!rule.categoryId) return 0; // regra "deal" mal formada (não deveria acontecer — createSyncRule já valida)
    const { deals } = await listBitrixDeals(organizationId, rule.connectionId, 0, {
        categoryId: rule.categoryId,
        stageId: rule.stageId || undefined,
        assignedById: rule.assignedById || undefined,
    });
    const pendingIds = deals.filter((d) => !d.alreadyImported).map((d) => d.id).slice(0, MAX_AUTO_IMPORT_PER_RULE_PER_TICK);
    if (pendingIds.length === 0) return 0;

    const { imported } = await importSelectedBitrixDeals(organizationId, rule.connectionId, pendingIds);
    return imported;
}

/**
 * Roda uma vez para TODAS as organizações com pelo menos uma regra ativa — chamado pelo worker
 * periódico (bitrixSync.worker.ts). Uma regra com erro (ex.: webhook desconectado nesse meio
 * tempo) não derruba as demais; cada uma registra seu próprio resultado.
 *
 * BitrixSyncRule tem RLS por tenant (como toda tabela de dado de cliente) — não está na allowlist
 * de bypass (essa allowlist é só para tabelas de identidade: User/Organization/Session/etc., ver
 * async-context.ts). Por isso a descoberta de "quais organizações existem" usa bypass só em cima
 * de Organization (que ESTÁ na allowlist), e cada regra é lida/gravada dentro do contexto de
 * tenant real dela — RLS de verdade, não uma exceção só pra este worker.
 */
export async function runBitrixSyncTick(): Promise<{ organizationsProcessed: number; totalImported: number }> {
    // IMPORTANTE: o callback do run() precisa dar `await` na query Prisma, não só retorná-la.
    // `prisma.model.findMany(...)` devolve um PrismaPromise "lazy" (um thenable customizado, não
    // uma Promise nativa) — a query só é de fato disparada (e o hook $allOperations de prisma.ts
    // só é chamado) quando algo dá `.then()`/`await` nela. Se o callback só faz
    // `() => prisma.organization.findMany(...)`, o `.then()` acontece no `await` DE FORA do
    // run(), depois que o AsyncLocalStorage já saiu de escopo — requestContext.getStore() então
    // chega `undefined` dentro de $allOperations e a query roda sem bypass_rls, sem achar nenhuma
    // organização. Confirmado via scripts/debug-als-hypothesis.ts.
    const organizations = await requestContext.run({ bypassRls: true }, async () => {
        return await prisma.organization.findMany({ select: { id: true } });
    });

    let organizationsProcessed = 0;
    let totalImported = 0;

    for (const { id: organizationId } of organizations) {
        await requestContext.run({ tenantId: organizationId }, async () => {
            const rules = await prisma.bitrixSyncRule.findMany({ where: { active: true } });
            if (rules.length === 0) return;
            organizationsProcessed++;

            for (const rule of rules) {
                try {
                    const imported = await runSyncRule(organizationId, rule);
                    totalImported += imported;
                    await prisma.bitrixSyncRule.update({
                        where: { id: rule.id },
                        data: { lastRunAt: new Date(), lastImportedCount: imported },
                    });
                    if (imported > 0) {
                        logger.info({ organizationId, ruleId: rule.id, imported }, '[bitrix] Regra de sincronização automática importou registros');
                    }
                } catch (err) {
                    logger.error({ err, organizationId, ruleId: rule.id }, '[bitrix] Falha ao executar regra de sincronização automática');
                }
            }
        });
    }

    return { organizationsProcessed, totalImported };
}
