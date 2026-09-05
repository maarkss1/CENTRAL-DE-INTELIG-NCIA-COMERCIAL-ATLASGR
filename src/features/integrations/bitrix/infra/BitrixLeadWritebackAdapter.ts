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
  private async resolveWebhookUrl(organizationId: string): Promise<string> {
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
    return connection.webhookUrl;
  }

  async updateLeadFields(
    organizationId: string,
    bitrixLeadId: string,
    fields: Record<string, string>,
  ): Promise<void> {
    const webhookUrl = await this.resolveWebhookUrl(organizationId);
    await callBitrix(
      webhookUrl,
      'crm.lead.update',
      { id: bitrixLeadId, fields },
      { correlationId: randomUUID() },
    );
  }

  async updateCompanyFields(
    organizationId: string,
    bitrixCompanyId: string,
    fields: Record<string, string>,
  ): Promise<void> {
    const webhookUrl = await this.resolveWebhookUrl(organizationId);
    await callBitrix(
      webhookUrl,
      'crm.company.update',
      { id: bitrixCompanyId, fields },
      { correlationId: randomUUID() },
    );
  }

  async updateContactFields(
    organizationId: string,
    bitrixContactId: string,
    fields: Record<string, string>,
  ): Promise<void> {
    const webhookUrl = await this.resolveWebhookUrl(organizationId);
    await callBitrix(
      webhookUrl,
      'crm.contact.update',
      { id: bitrixContactId, fields },
      { correlationId: randomUUID() },
    );
  }
}
