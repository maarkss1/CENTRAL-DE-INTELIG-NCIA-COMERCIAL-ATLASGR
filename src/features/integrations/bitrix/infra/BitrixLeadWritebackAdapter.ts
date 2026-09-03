import { randomUUID } from 'node:crypto';
import { prisma } from '../../../../lib/prisma.js';
import { AppError } from '../../../../shared/middlewares/errorHandler.js';
import { callBitrix } from '../service/client.js';
import type { BitrixLeadWritebackPort } from '../../../../shared/contracts/bitrixWriteback.contract.js';

/**
 * Implementação real de `BitrixLeadWritebackPort` — mesmo padrão de resolução de conexão que
 * `pushLeadToBitrix`/`exportLeadToBitrixNow` (`service/outboundSync.ts`): sem `connectionId`
 * explícito, usa a conexão mais antiga da organização (`findFirst` por `createdAt asc`). Uma
 * organização com múltiplos portais Bitrix (ex.: AtlasGR + TotalTrac) que precise escolher qual
 * conexão recebe o writeback do Copiloto IA ainda não é suportado — fica para quando isso virar um
 * problema real, não antecipado aqui.
 */
export class BitrixLeadWritebackAdapter implements BitrixLeadWritebackPort {
  async updateLeadFields(
    organizationId: string,
    bitrixLeadId: string,
    fields: Record<string, string>,
  ): Promise<void> {
    const connection = await prisma.bitrixConnection.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
    if (!connection) {
      throw new AppError(
        'Nenhuma conexão Bitrix24 configurada para esta organização (Configurações > Integrações).',
        409,
      );
    }

    const correlationId = randomUUID();
    await callBitrix(
      connection.webhookUrl,
      'crm.lead.update',
      { id: bitrixLeadId, fields },
      { correlationId },
    );
  }
}
