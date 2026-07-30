import { IEnrichedLead } from '../../../types/prospecting';

export class Bitrix24Adapter {
  public webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  /**
   * Exporta o Lead enriquecido para o Bitrix24 criando Empresa, Contato e Negócio
   */
  async exportLead(lead: IEnrichedLead): Promise<string> {
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
      console.error("[Bitrix24Adapter] Falha ao exportar Lead:", error);
      throw error;
    }
  }

  private async createCompany(lead: IEnrichedLead): Promise<string> {
    const response = await fetch(`${this.webhookUrl}crm.company.add.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          TITLE: lead.socialReason || lead.fantasyName || 'Empresa Prospectada',
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

  private async createContact(dm: unknown, companyId: string): Promise<string> {
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
