import { randomUUID } from 'node:crypto';
import { prisma } from '../../../../lib/prisma.js';
import { logger } from '../../../../lib/logger.js';
import { AppError } from '../../../../shared/middlewares/errorHandler.js';
import { requestContext } from '../../../../lib/async-context.js';
import { AuditService } from '../../../../lib/audit/audit.service.js';
import { findUnimportedBitrixLeadIds, importSelectedBitrixLeads } from './leads.js';
import { findUnimportedBitrixDealIds, importSelectedBitrixDeals } from './deals.js';

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

    const rule = await prisma.bitrixSyncRule.create({
        data: {
            organizationId,
            connectionId: input.connectionId,
            source: input.source,
            categoryId: input.source === 'deal' ? input.categoryId : null,
            stageId: input.stageId || null,
            assignedById: input.assignedById || null,
        },
    });
    await AuditService.log({ action: 'CREATE', entity: 'BitrixSyncRule', entityId: rule.id, tenantId: organizationId, afterState: { source: rule.source, categoryId: rule.categoryId, stageId: rule.stageId } });
    return rule;
}

export async function setSyncRuleActive(organizationId: string, ruleId: string, active: boolean) {
    const rule = await prisma.bitrixSyncRule.findFirst({ where: { id: ruleId, organizationId } });
    if (!rule) throw new AppError('Regra não encontrada.', 404);
    const updated = await prisma.bitrixSyncRule.update({ where: { id: ruleId }, data: { active } });
    await AuditService.log({ action: 'UPDATE', entity: 'BitrixSyncRule', entityId: ruleId, tenantId: organizationId, beforeState: { active: rule.active }, afterState: { active } });
    return updated;
}

export async function deleteSyncRule(organizationId: string, ruleId: string): Promise<void> {
    const rule = await prisma.bitrixSyncRule.findFirst({ where: { id: ruleId, organizationId } });
    if (!rule) throw new AppError('Regra não encontrada.', 404);
    await prisma.bitrixSyncRule.delete({ where: { id: ruleId } });
    await AuditService.log({ action: 'DELETE', entity: 'BitrixSyncRule', entityId: ruleId, tenantId: organizationId, beforeState: { source: rule.source, categoryId: rule.categoryId } });
}

// Trava de segurança por execução de regra: mesmo com um pipeline movimentado, uma regra nunca
// importa mais que isto numa única rodada do worker — evita que uma regra mal configurada (ex.:
// pipeline errado, sem etapa) inunde o CRM de uma vez só. O próximo tick pega o restante.
const MAX_AUTO_IMPORT_PER_RULE_PER_TICK = 25;

/**
 * Executa uma única regra: busca registros não importados que batem com o filtro e importa até o
 * teto por rodada. `findUnimportedBitrixLeadIds`/`findUnimportedBitrixDealIds` seguem o cursor
 * `next` do Bitrix por conta própria (até MAX_AUTO_IMPORT_PER_RULE_PER_TICK IDs encontrados ou o
 * teto de páginas escaneadas) — antes desta correção, esta função sempre lia `start=0` fixo, então
 * uma regra só enxergava a PRIMEIRA página (~50 registros) do Bitrix; se ela já estivesse toda
 * importada, os registros além dela nunca eram alcançados por nenhum tick futuro (achado P0-2 da
 * auditoria). Retorna também se a varredura desta rodada esgotou o portal ou parou por teto de
 * páginas, pro chamador poder registrar isso em BitrixSyncLog em vez de "0 importados" sem contexto.
 */
async function runSyncRule(
    organizationId: string,
    rule: { id: string; connectionId: string; source: string; categoryId: string | null; stageId: string | null; assignedById: string | null },
): Promise<{ imported: number; pagesScanned: number; pagesExhausted: boolean }> {
    if (rule.source === 'lead') {
        const { ids, pagesScanned, pagesExhausted } = await findUnimportedBitrixLeadIds(organizationId, rule.connectionId, MAX_AUTO_IMPORT_PER_RULE_PER_TICK, {
            statusId: rule.stageId || undefined,
            assignedById: rule.assignedById || undefined,
        });
        if (ids.length === 0) return { imported: 0, pagesScanned, pagesExhausted };
        const { imported } = await importSelectedBitrixLeads(organizationId, rule.connectionId, ids);
        return { imported, pagesScanned, pagesExhausted };
    }

    if (!rule.categoryId) return { imported: 0, pagesScanned: 0, pagesExhausted: true }; // regra "deal" mal formada (não deveria acontecer — createSyncRule já valida)
    const { ids, pagesScanned, pagesExhausted } = await findUnimportedBitrixDealIds(organizationId, rule.connectionId, MAX_AUTO_IMPORT_PER_RULE_PER_TICK, {
        categoryId: rule.categoryId,
        stageId: rule.stageId || undefined,
        assignedById: rule.assignedById || undefined,
    });
    if (ids.length === 0) return { imported: 0, pagesScanned, pagesExhausted };

    const { imported } = await importSelectedBitrixDeals(organizationId, rule.connectionId, ids);
    return { imported, pagesScanned, pagesExhausted };
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
export async function runBitrixSyncTick(): Promise<{ organizationsProcessed: number; totalImported: number; rulesFailed: number }> {
    // Amarra todas as regras processadas nesta rodada do worker a um único id — sem isso, uma
    // falha intermitente vira uma linha de log solta, impossível de distinguir de qualquer outra
    // rodada dos últimos 15 minutos.
    const tickCorrelationId = randomUUID();
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
    let rulesFailed = 0;

    for (const { id: organizationId } of organizations) {
        await requestContext.run({ tenantId: organizationId }, async () => {
            const rules = await prisma.bitrixSyncRule.findMany({ where: { active: true } });
            if (rules.length === 0) return;
            organizationsProcessed++;

            for (const rule of rules) {
                try {
                    const { imported, pagesScanned, pagesExhausted } = await runSyncRule(organizationId, rule);
                    totalImported += imported;
                    await prisma.bitrixSyncRule.update({
                        where: { id: rule.id },
                        data: { lastRunAt: new Date(), lastImportedCount: imported, lastError: null },
                    });
                    await prisma.bitrixSyncLog.create({
                        data: {
                            organizationId,
                            connectionId: rule.connectionId,
                            direction: 'inbound',
                            entityType: rule.source,
                            status: 'success',
                            bitrixRecordId: null,
                            errorMessage: pagesExhausted ? null : `Teto de páginas escaneadas atingido (${pagesScanned}) — pode haver mais registros pendentes além do que esta rodada alcançou.`,
                            correlationId: tickCorrelationId,
                        },
                    });
                    if (imported > 0) {
                        logger.info({ correlationId: tickCorrelationId, organizationId, ruleId: rule.id, imported, pagesScanned }, '[bitrix] Regra de sincronização automática importou registros');
                    }
                    if (!pagesExhausted) {
                        logger.warn({ correlationId: tickCorrelationId, organizationId, ruleId: rule.id, pagesScanned }, '[bitrix] Varredura de paginação parou pelo teto de segurança antes de esgotar o portal — retoma no próximo tick');
                    }
                } catch (err) {
                    rulesFailed++;
                    // BUG CORRIGIDO (bloqueador #11 — "sincronização não pode falhar silenciosamente"):
                    // antes desta correção, uma regra que falhasse em TODA execução nunca tinha
                    // `lastRunAt` atualizado, então a tela de Integrações mostrava "Ainda não rodou"
                    // pra sempre — uma mentira, já que o worker rodava (e falhava) a cada 15 minutos
                    // sem que ninguém percebesse. `lastRunAt` agora reflete a ÚLTIMA TENTATIVA (sucesso
                    // ou falha); `lastImportedCount` continua representando a última importação bem
                    // sucedida (não é zerado numa falha, pra não apagar o histórico do último sucesso).
                    // `lastError` fecha a lacuna que este comentário descrevia antes: agora a MENSAGEM
                    // da última falha também fica visível (ver BitrixSyncRulesPanel.tsx).
                    const errorMessage = err instanceof Error ? err.message : String(err);
                    await prisma.bitrixSyncRule.update({
                        where: { id: rule.id },
                        data: { lastRunAt: new Date(), lastError: errorMessage },
                    }).catch((updateErr) => {
                        logger.error({ err: updateErr, organizationId, ruleId: rule.id }, '[bitrix] Falha ao registrar a tentativa da regra (lastRunAt) — vai continuar parecendo "nunca rodou"');
                    });
                    await prisma.bitrixSyncLog.create({
                        data: {
                            organizationId,
                            connectionId: rule.connectionId,
                            direction: 'inbound',
                            entityType: rule.source,
                            status: 'failed',
                            errorMessage,
                            correlationId: tickCorrelationId,
                        },
                    }).catch((logErr) => logger.error({ err: logErr, organizationId, ruleId: rule.id }, '[bitrix] Falha ao gravar BitrixSyncLog da falha'));
                    logger.error({ err, correlationId: tickCorrelationId, organizationId, ruleId: rule.id }, '[bitrix] Falha ao executar regra de sincronização automática');
                }
            }
        });
    }

    if (rulesFailed > 0) {
        logger.warn({ correlationId: tickCorrelationId, organizationsProcessed, totalImported, rulesFailed }, '[bitrix] Tick de sincronização automática concluído com falhas parciais');
    }

    return { organizationsProcessed, totalImported, rulesFailed };
}
