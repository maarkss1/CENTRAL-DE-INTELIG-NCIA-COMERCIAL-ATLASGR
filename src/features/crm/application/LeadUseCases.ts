import { logger } from '../../../lib/logger.js';
import type { Lead, LeadRepository } from '../domain/Lead';
import type { z } from 'zod';
import { leadSchema } from '../../../lib/zod';
import { enrichCompany } from '../../prospecting/services/enrichment.service';
import { fromPrismaLeadStatus } from '../../../lib/enumMap';
import type { LeadFunnel } from '@prisma/client';
import { BaseUseCases } from '../../../shared/application/BaseUseCases';
import { AppError } from '../../../shared/middlewares/errorHandler';
import { ensureManualDealClosureAllowed } from './dealClosureGate.js';
import { prismaDealClosureGate } from '../infra/PrismaDealClosureGate.js';
import { broadcastEvent } from '../../../lib/eventsBus.js';

/** Mesmo rótulo usado em `LEAD_STATUS_TO_PRISMA`/`LEAD_CLOSING_STATUSES` (src/lib/enumMap.ts) — único status que exige o gate de fechamento determinístico (CYC-007). */
const WON_STATUS_LABEL = 'Negócios Ganhos';

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

  async findLeads(
    organizationId: string,
    status?: string,
    page: number = 1,
    limit: number = 50,
    funnel?: LeadFunnel,
    query?: string,
  ) {
    return this.repository.findAllWithFilters(organizationId, status, page, limit, funnel, query);
  }

  async findLeadById(organizationId: string, id: string) {
    return this.findById(organizationId, id);
  }

  async createLead(
    organizationId: string,
    data: z.infer<typeof leadSchema>,
    actor?: { userId: string; role: string },
  ) {
    const validated = leadSchema.parse(data);

    // CLOSER/SDR sempre captura para si mesmo — nunca cria um lead em nome de outra pessoa
    // (só GESTOR/ADMIN podem reatribuir, via update). Isso é o que torna a checagem de posse em
    // requireLeadOwnership.ts significativa: sem isto, um CLOSER/SDR podia informar `owner` de
    // outra pessoa no corpo da requisição e escapar da própria regra.
    if (actor?.role === 'CLOSER' || actor?.role === 'SDR') {
      validated.owner = actor.userId;
    }

    // Bloqueia lead duplicado para a mesma empresa no mesmo funil (Lead x Negócio já são
    // objetos distintos por natureza, ver LeadFunnel — não impedimos os dois coexistirem).
    // Cobre o caso de um vendedor tentar capturar uma empresa que outro já capturou.
    if (validated.companyId) {
      const { prisma } = await import('../../../lib/prisma.js');
      const funnel = validated.funnel ?? 'Lead';
      const existing = await prisma.lead.findFirst({
        where: { organizationId, companyId: validated.companyId, funnel, deletedAt: null },
        select: { id: true, owner: true },
      });
      if (existing) {
        let ownerLabel = existing.owner ?? 'outro usuário';
        if (existing.owner) {
          const ownerUser = await prisma.user.findUnique({
            where: { id: existing.owner },
            select: { name: true },
          });
          if (ownerUser?.name) ownerLabel = ownerUser.name;
        }
        throw new AppError(`Esta empresa já tem um lead capturado por ${ownerLabel}.`, 409, {
          existingLeadId: existing.id,
        });
      }
    }

    const lead = await this.create(organizationId, validated);

    // Se o lead foi criado sem dono (fluxo de gestão, sem CLOSER/SDR atribuído explicitamente),
    // tenta atribuir via Round-Robin.
    if (!validated.owner) {
      try {
        const { assignLeadRoundRobin } = await import('../services/assignment.service.js');
        const owner = await assignLeadRoundRobin(organizationId, lead.id);
        if (owner) {
          lead.owner = owner;
        }
      } catch (err) {
        // Log and swallow so the creation succeeds even if assignment fails
        logger.error({ err }, 'Failed to assign lead via Round-Robin');
      }
    }

    return lead;
  }

  /**
   * `actorUserId` é obrigatório quando `data.status` move o lead para "Negócios Ganhos" — sem
   * ele não há como registrar quem confirmou o fechamento (CYC-007, ver `dealClosureGate.ts`).
   * Opcional nos demais casos para não quebrar nenhum outro chamador existente.
   */
  async updateLead(
    organizationId: string,
    id: string,
    data: Partial<z.infer<typeof leadSchema>>,
    actorUserId?: string,
  ) {
    if (data.status === WON_STATUS_LABEL) {
      if (!actorUserId)
        throw new AppError('Fechar um negócio exige um usuário autenticado identificado.', 401);
      await ensureManualDealClosureAllowed(prismaDealClosureGate, {
        organizationId,
        leadId: id,
        actorUserId,
      });
    }
    const updated = await this.update(organizationId, id, data);

    if (data.status === WON_STATUS_LABEL) {
      broadcastEvent({ type: 'DEAL_WON', organizationId, payload: { leadId: id } });
    } else if (
      data.status &&
      (data.status.toLowerCase().includes('perdido') ||
        data.status.toLowerCase().includes('desqualificad'))
    ) {
      broadcastEvent({ type: 'DEAL_LOST', organizationId, payload: { leadId: id } });
    }
    return updated;
  }

  async updateLeadStatus(
    organizationId: string,
    id: string,
    newStatus: string,
    actorUserId?: string,
  ) {
    if (newStatus === WON_STATUS_LABEL) {
      if (!actorUserId)
        throw new AppError('Fechar um negócio exige um usuário autenticado identificado.', 401);
      await ensureManualDealClosureAllowed(prismaDealClosureGate, {
        organizationId,
        leadId: id,
        actorUserId,
      });
    }
    const updated = await this.repository.updateStatus(organizationId, id, newStatus);

    if (newStatus === WON_STATUS_LABEL) {
      broadcastEvent({ type: 'DEAL_WON', organizationId, payload: { leadId: id } });
    } else if (
      newStatus.toLowerCase().includes('perdido') ||
      newStatus.toLowerCase().includes('desqualificad')
    ) {
      broadcastEvent({ type: 'DEAL_LOST', organizationId, payload: { leadId: id } });
    }
    return updated;
  }

  async deleteLead(organizationId: string, id: string) {
    return this.delete(organizationId, id);
  }

  async enrichLead(organizationId: string, id: string) {
    const lead = await this.repository.findById!(organizationId, id);
    if (!lead) throw new AppError('Lead not found', 404);
    if (!lead.companyId)
      throw new AppError('Lead sem empresa vinculada — não é possível enriquecer', 400);

    const company = lead.company as LeadCompanyRelation | undefined;
    const result = await enrichCompany(organizationId, lead.companyId, {
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
      'ID',
      'Nome',
      'Saudação',
      'Primeiro nome',
      'Sobrenome',
      'Segundo nome',
      'Nome completo',
      'Data de nascimento',
      'Endereço: Endereço',
      'Endereço: Rua, edifício',
      'Endereço: Suíte / Apartamento',
      'Endereço: Cidade',
      'Endereço: Região',
      'Endereço: Estado / Província',
      'Endereço: CEP',
      'Endereço: País',
      'Telefone de trabalho',
      'Celular',
      'Fax',
      'Telefone de casa',
      'Número de pager',
      'Telefone de SMS Marketing',
      'Outro número de telefone',
      'Site Corporativo',
      'Página pessoal',
      'Página do Facebook',
      'Página VK',
      'LiveJournal',
      'Twitter',
      'Outro site',
      'Email de trabalho',
      'E-mail de casa',
      'E-mail para boletins',
      'Outro e-mail',
      'Conta do Facebook',
      'Conta Telegram',
      'Conta VK',
      'Contato Viber',
      'Comentários do Instagram',
      'Contato da rede',
      'Bate-papo ao vivo',
      'Conta Canal Aberto',
      'Outro contato',
      'Usuário vinculado',
      'Nome da empresa',
      'Cargo',
      'Comentário',
      'Etapa',
      'Informações da etapa',
      'Product',
      'Price',
      'Quantity',
      'Valor',
      'Moeda',
      'Fonte',
      'Informações da fonte',
      'Disponível para todos',
      'Pessoa responsável',
      'Criado em',
      'Criado por',
      'Atualizado em',
      'Atualizado por',
      'Data da mudança de etapa',
      'Etapa alterada por',
      'UTM Source',
      'UTM Medium',
      'UTM Campaign',
      'UTM Content',
      'UTM Term',
      'Origem',
      'deal_ID',
      'Etapa da Cadência',
      'Fluxo do Lead',
      'Motivo de desqualificação',
      'Data de Retomada',
      'Segmento da Operação',
      'Tipo de Carga',
      'Média mensal de contratação de terceiros',
      'Frota Própria (Quantidade)',
      'Agregados (Quantidade)',
      'Principais Rotas',
      'ERP/TMS Utilizado',
      'Rastreador Utilizado',
      'Seguradora',
      'Corretora',
      'Fornecedor de GR Atual',
      'Possui Gestão de Risco?',
      'Usa Motoristas Terceiros?',
      'Possui Software Logístico?',
      'Software Logístico Atual',
      'Possui Consulta e Cadastro de Motorista?',
      'Consulta e Cadastro Atual',
      'Dor Principal Mapeada',
      'Detalhamento da dor',
      'Dor se conecta a qual solução Atlas?',
      'Linkedin',
      'Cargo',
      'Nível de autoridade',
      'Interesse percebido',
      'Horizonte de Decisão',
      'Média de viagem / mês',
      'Telefone ',
      'Observações',
      'Perfil da Operação?',
      'O que você busca? ',
      'Finalidade Principal',
      'Média de Contratações Mês',
    ];

    const escapeCsvValue = (value: unknown) => {
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
      // CORREÇÃO: Preencher col[0] (ID) para que o Bitrix24 possa atualizar
      // registros existentes em vez de criar duplicados a cada re-exportação.
      cols[0] = l.id || '';
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
      // CORREÇÃO: cols[85] era 'possuiGR' duplicado — deve ser 'fornecedorGR'
      // (campo "Fornecedor de GR Atual" no cabeçalho).
      cols[85] = qual.fornecedorGR || '';
      cols[86] = qual.possuiGR || '';
      cols[87] = qual.usaTerceiros || '';
      // CORREÇÃO: cols[88] era 'possuiSoftwareLogistico' duplicado — deve ser
      // 'possuiSoftwareLogistico' e cols[89] deve ser 'softwareLogisticoAtual'.
      cols[88] = qual.possuiSoftwareLogistico || '';
      cols[89] = qual.softwareLogisticoAtual || '';
      // CORREÇÃO: cols[90] era 'possuiCadastroMotorista' duplicado — cols[91]
      // deve ser 'cadastroAtual' (campo "Consulta e Cadastro Atual").
      cols[90] = qual.possuiCadastroMotorista || '';
      cols[91] = qual.cadastroAtual || '';
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
      return cols.map(escapeCsvValue).join(';');
    });

    return [headers.map(escapeCsvValue).join(';'), ...rows].join('\n');
  }

  async exportLeadToBitrix(
    organizationId: string,
    leadId: string | undefined,
    options?: { connectionId?: string; statusId?: string; assignedById?: string },
  ) {
    const { exportLeadToBitrixNow } = await import('../../integrations/bitrix/bitrix.service.js');
    return exportLeadToBitrixNow(organizationId, leadId, options?.connectionId, {
      statusId: options?.statusId,
      assignedById: options?.assignedById,
    });
  }

  async importRecentBitrixLeads(organizationId: string) {
    const { prisma } = await import('../../../lib/prisma.js');
    const { findUnimportedBitrixLeadIds, importSelectedBitrixLeads, connectBitrix } = await import(
      '../../integrations/bitrix/bitrix.service.js'
    );

    let connection = await prisma.bitrixConnection.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });

    if (!connection && process.env.BITRIX24_WEBHOOK_URL) {
      const { id } = await connectBitrix(
        organizationId,
        process.env.BITRIX24_WEBHOOK_URL,
        'Bitrix Principal',
      );
      connection = await prisma.bitrixConnection.findUnique({ where: { id } });
    }

    if (!connection) {
      throw new AppError('Nenhuma conexão Bitrix24 configurada.', 400);
    }

    // findUnimportedBitrixLeadIds pagina de verdade (segue o cursor `next` do Bitrix) em vez
    // de olhar só a primeira página — antes desta correção, se os ~50 primeiros leads da
    // primeira página já estivessem todos importados, este botão nunca alcançava nenhum lead
    // além deles, para sempre (mesmo achado P0-2 do worker automático, ver syncRules.ts).
    const { ids: unimportedIds, pagesExhausted } = await findUnimportedBitrixLeadIds(
      organizationId,
      connection.id,
      25,
    );

    if (unimportedIds.length === 0) {
      return { imported: 0, skipped: 0, pagesExhausted };
    }

    const result = await importSelectedBitrixLeads(organizationId, connection.id, unimportedIds);
    return { ...result, pagesExhausted };
  }

  /**
   * Enfileira o enriquecimento em lote dos leads com empresa pendente.
   *
   * Honesto sobre o resultado: quando as filas estão desabilitadas (`queuesEnabled=false`,
   * `enrichmentQueue` é `null` — ver src/lib/queue/enrichment.queue.ts), `enrichmentQueue?.addBulk`
   * antes desta correção era um no-op silencioso que MESMO ASSIM marcava as empresas como
   * "Enriquecendo" e devolvia `{ enqueued: N }` — o chamador (LeadController.enrichBatch,
   * exposto na resposta da rota como `data`) acreditava que N leads seriam enriquecidos, mas
   * nenhum job era criado e as empresas ficavam presas em "Enriquecendo" para sempre, já que
   * nenhum worker jamais processaria esses jobs inexistentes. Agora, sem filas, nada é marcado
   * como "Enriquecendo" e o retorno expõe `enfileirado: false` + `motivo` para o cliente da API
   * distinguir "nada pendente" de "havia leads pendentes, mas a fila está fora do ar".
   */
  async enqueueBatchEnrichment(organizationId: string) {
    const { prisma } = await import('../../../lib/prisma.js');
    const { enrichmentQueue } = await import('../../../lib/queue/enrichment.queue.js');
    const { queuesEnabled } = await import('../../../lib/queue/redis.js');

    const leadsToEnrich = await prisma.lead.findMany({
      where: {
        organizationId,
        companyId: { not: null },
        company: { enrichmentStatus: 'Pendente' },
        // Garantir que não pegamos leads deletados se houver soft delete, mas o prisma de Company não tem deletedAt?
        // O schema diz que Company tem deletedAt.
        deletedAt: null,
      },
      select: { id: true, companyId: true, company: { select: { cnpj: true, segment: true } } },
    });

    if (leadsToEnrich.length === 0) return { enqueued: 0, enfileirado: true as const };

    if (!queuesEnabled || !enrichmentQueue) {
      return {
        enqueued: 0,
        enfileirado: false as const,
        motivo: 'filas desabilitadas' as const,
        leadsPendentes: leadsToEnrich.length,
      };
    }

    const jobs = leadsToEnrich.map((lead) => ({
      name: 'enrichment-job',
      data: {
        companyId: lead.companyId!,
        organizationId,
        cnpj: lead.company?.cnpj || undefined,
        segmentKeywords: lead.company?.segment ? [lead.company.segment] : undefined,
      },
    }));

    await enrichmentQueue.addBulk(jobs);

    const companyIds = Array.from(new Set(leadsToEnrich.map((l) => l.companyId!)));
    await prisma.company.updateMany({
      where: { id: { in: companyIds } },
      data: { enrichmentStatus: 'Enriquecendo' },
    });

    return { enqueued: leadsToEnrich.length, enfileirado: true as const };
  }

  async batchUpdateLeads(
    organizationId: string,
    leadIds: string[],
    updates: {
      status?: string;
      owner?: string;
      tags?: string[];
      addTags?: string[];
      removeTags?: string[];
    },
    actorUserId?: string,
  ) {
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      throw new AppError('Nenhum lead informado para atualização.', 400);
    }
    const { prisma } = await import('../../../lib/prisma.js');
    const leads = await prisma.lead.findMany({
      where: { id: { in: leadIds }, organizationId, deletedAt: null },
      select: { id: true, status: true, customFields: true, owner: true },
    });

    let updatedCount = 0;
    let failedCount = 0;
    for (const lead of leads) {
      // Cada lead vive no seu próprio try/catch: antes, uma falha no meio do lote (ex.: erro de
      // rede/DB no update de um item) lançava sem ser capturada e derrubava a função inteira —
      // os itens já atualizados nas iterações anteriores continuavam persistidos no banco, mas o
      // caller (CrmBoard.tsx) recebia um erro genérico em vez do resultado real, sem nenhuma forma
      // de saber quantos já tinham sido aplicados. Agora um item falho é contado em `failedCount`
      // e o lote continua para os demais.
      try {
        const dataToUpdate: Record<string, unknown> = {};
        if (updates.status && updates.status !== lead.status) {
          dataToUpdate.status = updates.status;
        }
        if (updates.owner !== undefined) {
          dataToUpdate.owner = updates.owner;
        }
        const customFieldsObj =
          lead.customFields &&
          typeof lead.customFields === 'object' &&
          !Array.isArray(lead.customFields)
            ? { ...(lead.customFields as Record<string, unknown>) }
            : {};

        if (updates.tags) {
          customFieldsObj.tags = updates.tags;
          dataToUpdate.customFields = customFieldsObj;
        } else if (updates.addTags || updates.removeTags) {
          let currentTags = Array.isArray(customFieldsObj.tags)
            ? [...(customFieldsObj.tags as string[])]
            : [];
          if (updates.addTags) {
            for (const tag of updates.addTags) {
              if (!currentTags.includes(tag)) currentTags.push(tag);
            }
          }
          if (updates.removeTags) {
            currentTags = currentTags.filter((t) => !updates.removeTags!.includes(t));
          }
          customFieldsObj.tags = currentTags;
          dataToUpdate.customFields = customFieldsObj;
        }

        if (Object.keys(dataToUpdate).length > 0) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: dataToUpdate,
          });
          if (dataToUpdate.owner !== undefined) {
            // Handoffs (Jornada): troca de responsável em lote também é uma troca real.
            const { recordLeadFieldChanges } = await import(
              '../../../shared/services/leadFieldChangeHistory.service.js'
            );
            await recordLeadFieldChanges(
              organizationId,
              lead.id,
              { owner: lead.owner },
              { owner: dataToUpdate.owner as string | null },
              { source: 'batch', changedBy: actorUserId ?? null },
            );
          }
          if (dataToUpdate.status) {
            await prisma.leadStageHistory
              .create({
                data: {
                  leadId: lead.id,
                  organizationId,
                  stageName: String(dataToUpdate.status),
                },
              })
              .catch(() => {});
          }
          updatedCount++;
        }
      } catch (err) {
        failedCount++;
        logger.error(
          { err, leadId: lead.id, organizationId },
          'batchUpdateLeads: falha ao atualizar um item do lote — contabilizado como falha, lote continua para os demais',
        );
      }
    }
    return { updatedCount, total: leads.length, failedCount };
  }
}
