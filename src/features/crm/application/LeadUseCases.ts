import { Lead, LeadRepository } from '../domain/Lead';
import { z } from 'zod';
import { leadSchema } from '../../../lib/zod';
import { enrichCompany } from '../../prospecting/services/enrichment.service';
import { fromPrismaLeadStatus } from '../../../lib/enumMap';
import { BaseUseCases } from '../../../shared/application/BaseUseCases';

/** Shape of the company relation when Lead is fetched with `include: { company: true }` */
interface LeadCompanyRelation {
    legalName?: string | null;
    tradeName?: string | null;
    cnae?: string | null;
    size?: string | null;
    segment?: string | null;
    phones?: string[] | null;
    website?: string | null;
    observations?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
    linkedin?: string | null;
}

/** Shape of the contact relation when Lead is fetched with `include: { contact: true }` */
interface LeadContactRelation {
    name?: string | null;
    role?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    email?: string | null;
    linkedin?: string | null;
}

export class LeadUseCases extends BaseUseCases<Lead, LeadRepository> {
    constructor(leadRepository: LeadRepository) {
        super(leadRepository);
    }

    async findLeads(organizationId: string, status?: string, page: number = 1, limit: number = 50) {
        return this.findAll(organizationId, status, page, limit);
    }

    async findLeadById(organizationId: string, id: string) {
        return this.findById(organizationId, id);
    }

    async createLead(organizationId: string, data: z.infer<typeof leadSchema>) {
        const validated = leadSchema.parse(data);
        return this.create(organizationId, validated);
    }

    async updateLead(organizationId: string, id: string, data: Partial<z.infer<typeof leadSchema>>) {
        return this.update(organizationId, id, data);
    }

    async updateLeadStatus(organizationId: string, id: string, newStatus: string) {
        return this.repository.updateStatus(organizationId, id, newStatus);
    }

    async deleteLead(organizationId: string, id: string) {
        return this.delete(organizationId, id);
    }

    async enrichLead(organizationId: string, id: string) {
        const lead = await this.repository.findById!(organizationId, id);
        if (!lead) throw new Error('Lead not found');
        if (!lead.companyId) throw new Error('Lead sem empresa vinculada — não é possível enriquecer');

        const company = lead.company as LeadCompanyRelation | undefined;
        const result = await enrichCompany(lead.companyId, {
            segmentKeywords: company?.segment ? [company.segment] : undefined,
            fleetSizeHint: company?.size || undefined,
        });

        // Note: Timeline events should ideally be emitted as domain events.
        // We simulate the previous behavior by extending the repository update to accept timeline inputs if supported,
        // or for now, we just update the core attributes. The timeline update is managed by the Infrastructure repository method if we added it,
        // but since we want to remove Prisma from Application, we update via repository.
        await this.repository.update!(organizationId, id, {
            score: result.fit.score,
            temperature: result.fit.temperature,
            // Assuming the repository handles timelines or we emit an event.
        });

        // Since we removed prisma import, we rely on the repository to fetch the updated lead.
        const finalLead = await this.repository.findById!(organizationId, id);

        return { lead: finalLead, fit: result.fit, enrichment: result };
    }

    async exportLeadsCsv(organizationId: string): Promise<string> {
        const leads = await this.repository.findAllForExport(organizationId);

        const headers = [
            'ID', 'Nome', 'Saudação', 'Primeiro nome', 'Sobrenome', 'Segundo nome', 'Nome completo',
            'Data de nascimento', 'Endereço: Endereço', 'Endereço: Rua, edifício', 'Endereço: Suíte / Apartamento',
            'Endereço: Cidade', 'Endereço: Região', 'Endereço: Estado / Província', 'Endereço: CEP', 'Endereço: País',
            'Telefone de trabalho', 'Celular', 'Fax', 'Telefone de casa', 'Número de pager',
            'Telefone de SMS Marketing', 'Outro número de telefone', 'Site Corporativo', 'Página pessoal',
            'Página do Facebook', 'Página VK', 'LiveJournal', 'Twitter', 'Outro site', 'Email de trabalho',
            'E-mail de casa', 'E-mail para boletins', 'Outro e-mail', 'Conta do Facebook', 'Conta Telegram',
            'Conta VK', 'Contato Viber', 'Comentários do Instagram', 'Contato da rede', 'Bate-papo ao vivo',
            'Conta Canal Aberto', 'Outro contato', 'Usuário vinculado', 'Nome da empresa', 'Cargo', 'Comentário',
            'Etapa', 'Informações da etapa', 'Product', 'Price', 'Quantity', 'Valor', 'Moeda', 'Fonte',
            'Informações da fonte', 'Disponível para todos', 'Pessoa responsável', 'Criado em', 'Criado por',
            'Atualizado em', 'Atualizado por', 'Data da mudança de etapa', 'Etapa alterada por', 'UTM Source',
            'UTM Medium', 'UTM Campaign', 'UTM Content', 'UTM Term', 'Origem', 'deal_ID', 'Etapa da Cadência',
            'Fluxo do Lead', 'Motivo de desqualificação', 'Data de Retomada', 'Segmento da Operação', 'Tipo de Carga',
            'Média mensal de contratação de terceiros', 'Frota Própria (Quantidade)', 'Agregados (Quantidade)',
            'Principais Rotas', 'ERP/TMS Utilizado', 'Rastreador Utilizado', 'Seguradora', 'Corretora',
            'Fornecedor de GR Atual', 'Possui Gestão de Risco?', 'Usa Motoristas Terceiros?',
            'Possui Software Logístico?', 'Software Logístico Atual', 'Possui Consulta e Cadastro de Motorista?',
            'Consulta e Cadastro Atual', 'Dor Principal Mapeada', 'Detalhamento da dor',
            'Dor se conecta a qual solução Atlas?', 'Linkedin', 'Cargo', 'Nível de autoridade',
            'Interesse percebido', 'Horizonte de Decisão', 'Média de viagem / mês', 'Telefone ', 'Observações',
            'Perfil da Operação?', 'O que você busca? ', 'Finalidade Principal', 'Média de Contratações Mês',
        ];

        const escape = (value: unknown) => {
            const s = value == null ? '' : String(value);
            return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };

        const rows = leads.map((l) => {
            const company = l.company as LeadCompanyRelation | undefined;
            const contact = l.contact as LeadContactRelation | undefined;
            const qual = (l.qualification || {}) as Record<string, string | undefined>;
            const [firstName, ...restName] = (contact?.name || '').trim().split(/\s+/);
            const lastName = restName.join(' ');
            const linkedin = contact?.linkedin || company?.linkedin || '';
            const phone = contact?.phone || company?.phones?.[0] || '';

            const cols: unknown[] = new Array(headers.length).fill('');
            cols[1] = company?.tradeName || company?.legalName || l.source || '';
            cols[3] = firstName || '';
            cols[4] = lastName || '';
            cols[6] = contact?.name || '';
            cols[8] = company?.address || '';
            cols[11] = company?.city || '';
            cols[13] = company?.state || '';
            cols[14] = company?.zipCode || '';
            cols[15] = 'Brasil';
            cols[16] = phone;
            cols[17] = contact?.whatsapp || '';
            cols[23] = company?.website || '';
            cols[30] = contact?.email || '';
            cols[44] = company?.tradeName || company?.legalName || '';
            cols[45] = contact?.role || '';
            cols[46] = company?.observations || '';
            cols[47] = fromPrismaLeadStatus(l.status);
            cols[54] = l.source || '';
            cols[57] = l.owner || '';
            cols[58] = l.createdAt.toISOString();
            cols[69] = l.channel || '';
            cols[71] = l.cadenceStage || '';
            cols[73] = l.lossReason || '';
            cols[74] = l.resumeDate ? new Date(l.resumeDate).toISOString() : '';
            cols[75] = qual.segmentoOperacao || company?.segment || '';
            cols[76] = qual.tipoCarga || '';
            cols[77] = qual.mediaContratacaoTerceiros || '';
            cols[78] = qual.frotaPropria || '';
            cols[79] = qual.frotaAgregados || '';
            cols[80] = qual.principaisRotas || '';
            cols[81] = qual.ermTms || '';
            cols[82] = qual.rastreador || '';
            cols[83] = qual.seguradora || '';
            cols[84] = qual.corretora || '';
            cols[85] = qual.fornecedorGRAtual || '';
            cols[86] = qual.possuiGR || '';
            cols[87] = qual.usaTerceiros || '';
            cols[88] = qual.possuiSoftwareLogistico || '';
            cols[89] = qual.softwareLogisticoAtual || '';
            cols[90] = qual.possuiCadastroMotorista || '';
            cols[91] = qual.consultaCadastroAtual || '';
            cols[92] = qual.dorPrincipal || '';
            cols[93] = qual.detalhamentoDor || '';
            cols[94] = qual.solucaoAtlas || '';
            cols[95] = linkedin;
            cols[96] = contact?.role || '';
            cols[97] = qual.nivelAutoridade || '';
            cols[98] = qual.interessePercebido || '';
            cols[99] = qual.horizonteDecisao || '';
            cols[100] = qual.viagensPorMes || '';
            cols[101] = phone;
            cols[102] = company?.observations || '';
            return cols.map(escape).join(';');
        });

        return [headers.map(escape).join(';'), ...rows].join('\n');
    }

    async exportLeadToBitrix(organizationId: string, leadId: string | undefined) {
        if (!leadId) {
            return { success: true, message: 'Exportação em lote via webhook em breve' };
        }
        const { exportLeadToBitrixNow } = await import('../../integrations/bitrix/bitrix.service');
        const { bitrixLeadId } = await exportLeadToBitrixNow(organizationId, leadId);
        return { bitrixLeadId };
    }
}
