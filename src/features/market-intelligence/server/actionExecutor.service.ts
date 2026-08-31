import { withRlsContext } from '../../../lib/prisma.js';
import { callBitrix } from '../../integrations/bitrix/service/client.js';
import { getUserId } from '../../../lib/async-context.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';

export const actionExecutorService = {
  async executeAction(recommendationId: string, expectedCompanyId?: string) {
    return withRlsContext(async (prisma) => {
      const recommendation = await prisma.accountRecommendation.findUnique({
        where: { id: recommendationId },
        include: {
          company: { include: { organization: { include: { bitrixConnections: true } } } },
        },
      });

      if (!recommendation) throw new AppError('Recomendação não encontrada', 404);
      // Confusão de rota: garante que a recomendação pertence à conta pedida na URL, não só
      // ao tenant (RLS já restringe ao tenant, mas não à conta específica).
      if (expectedCompanyId && recommendation.companyId !== expectedCompanyId) {
        throw new AppError('Recomendação não encontrada', 404);
      }
      if (recommendation.status === 'Executed')
        throw new AppError('Recomendação já executada', 400);

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
            },
          });

          await prisma.accountRecommendation.update({
            where: { id: recommendationId },
            data: {
              status: 'Executed',
              executedAt: new Date(),
              externalRef: response?.result?.task?.id?.toString(),
            },
          });

          return { success: true, taskId: response?.result?.task?.id };
        } else if (recommendation.actionType === 'START_SDR_CADENCE') {
          if (!company.organizationId) throw new AppError('Conta sem organização.', 400);

          const lead = await prisma.lead.findFirst({
            where: { companyId: company.id, deletedAt: null },
            orderBy: { createdAt: 'desc' },
          });
          if (!lead)
            throw new AppError('Nenhum lead associado a esta conta para iniciar cadência.', 400);

          const sequenceRow = await prisma.cadenceSequence.findFirst({
            where: { organizationId: company.organizationId, active: true, deletedAt: null },
            orderBy: { createdAt: 'desc' },
          });
          if (!sequenceRow)
            throw new AppError('Nenhuma sequência ativa encontrada para iniciar cadência.', 400);

          const userId = getUserId();
          const { startCadenceRun } = await import('../../cadence/domain/cadence.js');
          const { prismaCadenceRunRepository } =
            await import('../../cadence/infra/PrismaCadenceRunRepository.js');
          const { randomUUID } = await import('node:crypto');

          const run = startCadenceRun({
            id: randomUUID(),
            organizationId: company.organizationId,
            leadId: lead.id,
            sequenceId: sequenceRow.id,
            startedAt: new Date(),
            createdBy: userId || 'system',
          });

          try {
            await prismaCadenceRunRepository.save(run);
          } catch (err: any) {
            if (err?.code === 'P2002') {
              throw new AppError('Este lead já tem uma cadência ativa em andamento.', 409);
            }
            throw err;
          }

          await prisma.accountRecommendation.update({
            where: { id: recommendationId },
            data: {
              status: 'Executed',
              executedAt: new Date(),
            },
          });
          return { success: true, message: 'Cadência iniciada.' };
        } else {
          // Outras ações suportadas logicamente
          await prisma.accountRecommendation.update({
            where: { id: recommendationId },
            data: {
              status: 'Executed',
              executedAt: new Date(),
            },
          });
          return { success: true, message: 'Ação executada.' };
        }
      } catch (err: any) {
        await prisma.accountRecommendation.update({
          where: { id: recommendationId },
          data: { status: 'Failed' },
        });
        throw err;
      }
    });
  },
};
