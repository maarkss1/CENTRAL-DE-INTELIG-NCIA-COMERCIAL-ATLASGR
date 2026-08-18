import { prisma } from '../../../lib/prisma.js';

/**
 * Ponto único de escrita de `LeadStageHistory` (ver comentário no schema). Chamado pelos mesmos
 * pontos do CRM que já movem uma oportunidade de etapa (`PrismaCrm360Repository.ts`:
 * `updateLeadStage`, `convertLead`) — este módulo pertence a `commercial-intelligence` (dono do
 * histórico), mas é importado por `crm360` no ponto exato da escrita real, em vez de duplicar a
 * lógica de "qual é a etapa atual" em outro lugar.
 *
 * Fecha a entrada aberta anterior (se houver) e abre uma nova. Não lança em caso de erro de
 * histórico — nunca deve derrubar a operação real de mover o negócio (o histórico é uma camada de
 * observabilidade, não a fonte de verdade da etapa atual, que continua sendo `Lead.pipelineStageId`).
 */
export async function recordStageTransition(
    organizationId: string,
    leadId: string,
    stage: { id: string; name: string; probability: number; isWon: boolean; isLost: boolean } | null,
    pipelineId: string | null,
    now: Date = new Date()
): Promise<void> {
    try {
        await prisma.leadStageHistory.updateMany({
            where: { organizationId, leadId, exitedAt: null },
            data: { exitedAt: now },
        });

        if (stage) {
            await prisma.leadStageHistory.create({
                data: {
                    organizationId,
                    leadId,
                    pipelineId,
                    stageId: stage.id,
                    stageName: stage.name,
                    probability: stage.probability,
                    isWon: stage.isWon,
                    isLost: stage.isLost,
                    enteredAt: now,
                },
            });
        }
    } catch (error) {
        // Logger estruturado em vez de console — mesmo padrão do resto do backend
        // (ver src/lib/logger.ts). Falha aqui nunca deve propagar para o caller (moveRecord/
        // createDeal/convertLead) — o negócio já foi movido de verdade, só o registro histórico
        // (usado por Aging por Etapa/Sales Cycle) que ficaria incompleto.
        const { logger } = await import('../../../lib/logger.js');
        logger.error({ err: error, leadId, organizationId }, 'Falha ao registrar LeadStageHistory');
    }
}
