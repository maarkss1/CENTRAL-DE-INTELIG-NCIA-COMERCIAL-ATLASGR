import dns from 'node:dns/promises';
import net from 'node:net';
import { logger } from '../../../lib/logger';
import { AppError } from '../../../shared/middlewares/errorHandler';
import { IEnrichedLead } from '../../../types/prospecting';

// SSRF: usuários autenticados fornecem sua própria URL de webhook do Bitrix24, e o
// servidor faz requisições autenticadas (com PII) para ela. Sem validação, essa URL
// pode apontar para infraestrutura interna (Redis, Postgres, serviços do cluster,
// endpoint de metadados de nuvem). Bloqueamos esquemas não-HTTPS e qualquer host que
// resolva para um endereço privado/reservado/loopback/link-local antes de qualquer fetch.
function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
    if (a >= 224) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fe80:')) return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('::ffff:')) {
      const mapped = lower.split(':').pop();
      if (mapped && net.isIPv4(mapped)) return isPrivateOrReservedIp(mapped);
    }
    return false;
  }
  return true;
}

export async function assertSafeWebhookUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AppError('URL de webhook do Bitrix24 inválida.', 400);
  }

  if (url.protocol !== 'https:') {
    throw new AppError('O webhook do Bitrix24 deve usar HTTPS.', 400);
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new AppError('Endereço de webhook não permitido.', 400);
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new AppError('Endereço de webhook não permitido (IP privado/reservado).', 400);
    }
    return;
  }

  // Resolve todos os endereços do host e valida cada um (mitigação parcial de DNS
  // rebinding — não há pinning de IP na conexão real feita pelo fetch subsequente).
  const records = await dns.lookup(hostname, { all: true }).catch(() => []);
  if (records.length === 0) {
    throw new AppError('Não foi possível resolver o host do webhook do Bitrix24.', 400);
  }
  for (const record of records) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new AppError('Endereço de webhook não permitido (resolve para IP privado/reservado).', 400);
    }
  }
}

export class Bitrix24Adapter {
  public webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  /**
   * Exporta o Lead enriquecido para o Bitrix24 criando Empresa, Contato e Negócio
   */
  async exportLead(lead: IEnrichedLead): Promise<string> {
    await assertSafeWebhookUrl(this.webhookUrl);
    try {
      // 1. Criar Empresa
      const companyId = await this.createCompany(lead);

      // 2. Criar Contatos e atrelar à empresa
      for (const dm of lead.decisionMakers) {
        await this.createContact(dm, companyId);
      }

      // 3. Criar Deal/Lead com resumo da IA
      const dealId = await this.createDeal(lead, companyId);

      // 4. Adicionar nota na timeline do Deal
      await this.addTimelineNote(dealId, lead);

      return dealId;
    } catch (error) {
      logger.error({ err: error }, "[Bitrix24Adapter] Falha ao exportar Lead:");
      throw error;
    }
  }

  private async createCompany(lead: IEnrichedLead): Promise<string> {
    const response = await fetch(`${this.webhookUrl}crm.company.add.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          TITLE: (lead as any).legalName || lead.socialReason || lead.fantasyName || 'Empresa Prospectada',
          COMPANY_TYPE: 'CUSTOMER',
          INDUSTRY: lead.cnaeMain,
          EMPLOYEES: lead.employeesCount,
          REVENUE: lead.estimatedRevenue,
          PHONE: lead.commercialPhone ? [{ VALUE: lead.commercialPhone, VALUE_TYPE: 'WORK' }] : undefined,
          EMAIL: lead.generalEmail ? [{ VALUE: lead.generalEmail, VALUE_TYPE: 'WORK' }] : undefined,
          WEB: lead.website ? [{ VALUE: lead.website, VALUE_TYPE: 'WORK' }] : undefined,
          COMMENTS: lead.description,
        }
      })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error_description);
    return data.result;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async createContact(dm: any, companyId: string): Promise<string> {
    const response = await fetch(`${this.webhookUrl}crm.contact.add.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          NAME: dm.name,
          POST: dm.role,
          COMPANY_ID: companyId,
          PHONE: dm.phone || dm.whatsapp ? [{ VALUE: dm.phone || dm.whatsapp, VALUE_TYPE: 'WORK' }] : undefined,
          EMAIL: dm.corporateEmail ? [{ VALUE: dm.corporateEmail, VALUE_TYPE: 'WORK' }] : undefined,
        }
      })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error_description);
    return data.result;
  }

  private async createDeal(lead: IEnrichedLead, companyId: string): Promise<string> {
    const response = await fetch(`${this.webhookUrl}crm.deal.add.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          TITLE: `Oportunidade: ${lead.fantasyName || lead.socialReason}`,
          COMPANY_ID: companyId,
          STAGE_ID: 'NEW', // Estágio inicial padrão do Bitrix24
          PROBABILITY: lead.intelligence?.fitScore || 0,
        }
      })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error_description);
    return data.result;
  }

  private async addTimelineNote(dealId: string, lead: IEnrichedLead): Promise<void> {
    const comment = `
[b]Análise de Inteligência (AtlasGR)[/b]
Fit Score: ${lead.intelligence?.fitScore || 'N/A'}
Motivo: ${lead.intelligence?.fitReason || 'N/A'}

[b]Dores Mapeadas:[/b]
${lead.intelligence?.painPoints?.join(', ') || 'N/A'}

[b]Proposta de Valor:[/b]
${lead.intelligence?.valueProposition || 'N/A'}
    `.trim();

    await fetch(`${this.webhookUrl}crm.timeline.comment.add.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          ENTITY_ID: dealId,
          ENTITY_TYPE: 'deal',
          COMMENT: comment
        }
      })
    });
  }
}
