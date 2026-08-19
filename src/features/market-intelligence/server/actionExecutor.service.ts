import { withRlsContext } from '../../../lib/prisma.js';
import { callBitrix } from '../../integrations/bitrix/service/client.js';
import { getUserId } from '../../../lib/async-context.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';

export const actionExecutorService = {
    async executeAction(recommendationId: string) {
        return withRlsContext(async (prisma) => {
            const recommendation = await prisma.accountRecommendation.findUnique({
                where: { id: recommendationId },
                include: { company: { include: { organization: { include: { bitrixConnections: true } } } } }
            });

            if (!recommendation) throw new AppError('Recomendação não encontrada', 404);
            if (recommendation.status === 'Executed') throw new AppError('Recomendação já executada', 400);

            const company = recommendation.company;
            const webhookUrl = company?.organization?.bitrixConnections?.[0]?.webhookUrl;

            try {
                if (recommendation.actionType === 'CREATE_BITRIX_TASK') {
                    if (!webhookUrl) throw new AppError('Bitrix não conectado nesta organização', 400);

                    const currentUser = await prisma.user.findUnique({ where: { id: getUserId() } });
                    const responsibleId = currentUser?.bitrixUserId || 1;

                    // Criação da task no Bitrix
                    const response = await callBitrix<any>(webhookUrl, 'tasks.task.add', {
                        fields: {
                            TITLE: recommendation.title,
                            DESCRIPTION: `${recommendation.rationale}\n\nCriado via Central AtlasGR para a conta: ${company.legalName}`,
                            RESPONSIBLE_ID: responsibleId,
                            // Outras props relevantes
                        }
                    });

                    await prisma.accountRecommendation.update({
                        where: { id: recommendationId },
                        data: {
                            status: 'Executed',
                            executedAt: new Date(),
                            externalRef: response?.result?.task?.id?.toString()
                        }
                    });

                    return { success: true, taskId: response?.result?.task?.id };

                } else if (recommendation.actionType === 'START_SDR_CADENCE') {
                    // Handoff lógico (Fase 4 stub)
                    await prisma.accountRecommendation.update({
                        where: { id: recommendationId },
                        data: {
                            status: 'Executed',
                            executedAt: new Date()
                        }
                    });
                    return { success: true, message: 'Cadência iniciada logicamente.' };
                } else {
                    // Outras ações suportadas logicamente
                    await prisma.accountRecommendation.update({
                        where: { id: recommendationId },
                        data: {
                            status: 'Executed',
                            executedAt: new Date()
                        }
                    });
                    return { success: true, message: 'Ação executada.' };
                }
            } catch (err: any) {
                await prisma.accountRecommendation.update({
                    where: { id: recommendationId },
                    data: { status: 'Failed' }
                });
                throw err;
            }
        });
    }
};
