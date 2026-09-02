import type { Lead, LeadRepository } from '../domain/Lead';
import { prisma } from '../../../lib/prisma';
import { recordLeadFieldChanges } from '../../../shared/services/leadFieldChangeHistory.service.js';
import type { LeadFunnel, Prisma } from '@prisma/client';
import type { LeadStatus } from '../../../lib/zod';
import {
  toPrismaLeadStatus,
  fromPrismaLeadStatus,
  fromPrismaCompanyStatus,
  fromPrismaActivityType,
  fromPrismaActivityStatus,
  isLeadClosingStatus,
} from '../../../lib/enumMap';
import { searchLeadIds } from '../../../lib/search/index.js';

function serializeLead<
  T extends {
    status: string;
    company?: { status: string } | null;
    activities?: Array<{ type: string; status: string }>;
  },
>(lead: T): unknown {
  return {
    ...lead,
    status: fromPrismaLeadStatus(lead.status),
    ...(lead.company
      ? { company: { ...lead.company, status: fromPrismaCompanyStatus(lead.company.status) } }
      : {}),
    ...(lead.activities
      ? {
          activities: lead.activities.map((a) => ({
            ...a,
            type: fromPrismaActivityType(a.type),
            status: fromPrismaActivityStatus(a.status),
          })),
        }
      : {}),
  };
}

export class PrismaLeadRepository implements LeadRepository {
  async findAllWithFilters(
    organizationId: string,
    status?: string,
    page: number = 1,
    limit: number = 50,
    funnel?: LeadFunnel,
    query?: string,
  ): Promise<{ data: Lead[]; meta: unknown }> {
    const where: Prisma.LeadWhereInput = { organizationId };
    if (status) {
      where.status = toPrismaLeadStatus(
        status as LeadStatus,
      ) as unknown as Prisma.LeadWhereInput['status'];
    }
    if (funnel) where.funnel = funnel;

    if (query) {
      const matchedIds = await searchLeadIds(organizationId, query, 500);
      if (matchedIds !== null) {
        if (matchedIds.length === 0) {
          return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
        }
        where.id = { in: matchedIds };
      } else {
        // Fallback to postgres basic search
        where.OR = [
          { title: { contains: query, mode: 'insensitive' } },
          { contact: { name: { contains: query, mode: 'insensitive' } } },
          { company: { legalName: { contains: query, mode: 'insensitive' } } },
        ];
      }
    }

    const skip = (page - 1) * limit;

    const leads = await prisma.lead.findMany({
      where,
      skip,
      take: limit,
      include: { company: true, contact: true },
      orderBy: { createdAt: 'desc' },
    });
    const total = await prisma.lead.count({ where });

    return {
      data: leads.map(serializeLead) as unknown as Lead[],
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(organizationId: string, id: string): Promise<Lead | null> {
    const lead = await prisma.lead.findFirst({
      where: { id, organizationId },
      include: {
        company: true,
        contact: true,
        activities: { orderBy: { date: 'desc' } },
        timeline: { orderBy: { createdAt: 'desc' } },
        internalNotes: { orderBy: { createdAt: 'desc' } },
      },
    });
    return lead ? (serializeLead(lead) as unknown as Lead) : null;
  }

  async create(organizationId: string, data: Partial<Lead> & { status: string }): Promise<Lead> {
    const expectedCloseAt = data.expectedCloseAt
      ? new Date(data.expectedCloseAt as unknown as string | Date)
      : data.expectedCloseAt;
    const lead = await prisma.lead.create({
      data: {
        ...data,
        expectedCloseAt,
        status: toPrismaLeadStatus(
          data.status as LeadStatus,
        ) as unknown as Prisma.LeadCreateInput['status'],
        organizationId,
        company: undefined,
        contact: undefined,
        activities: undefined,
        internalNotes: undefined,
        timeline: {
          create: {
            type: 'creation',
            description: 'Lead criado no sistema',
          },
        },
      } as Prisma.LeadCreateInput,
      include: { company: true, contact: true },
    });
    return serializeLead(lead) as unknown as Lead;
  }

  async update(
    organizationId: string,
    id: string,
    data: Partial<Lead> & { status?: string },
  ): Promise<Lead> {
    // Não fazemos findFirst prévio: se o lead não existir (ou não pertencer ao org),
    // o Prisma lança P2025 que o errorHandler mapeia para 404 — sem N+1 queries.
    // O `where` inclui organizationId para garantir isolamento de tenant.
    // Mesmo cast de conveniência da linha de baixo (toPrismaLeadStatus(data.status as LeadStatus)):
    // o tipo de domínio de Lead.status não bate 1:1 com o LeadStatus "rótulo legível" do zod.
    const statusLabel = data.status as LeadStatus | undefined;
    const isClosingNow = isLeadClosingStatus(statusLabel);
    const expectedCloseAt = data.expectedCloseAt
      ? new Date(data.expectedCloseAt as unknown as string | Date)
      : data.expectedCloseAt;
    // CLOSEDATE Intelligence / Handoffs: só quando o payload toca um campo rastreado, lê o valor
    // anterior (uma query leve, 2 colunas) para registrar a mudança real em LeadFieldChange.
    // Sem isso, nenhum adiamento de data prevista nem troca de responsável feito por esta rota
    // (PUT /api/leads/:id, único caminho da UI para os dois campos) deixaria histórico.
    const tracksField = data.expectedCloseAt !== undefined || data.owner !== undefined;
    const previousTracked = tracksField
      ? await prisma.lead.findFirst({
          where: { id, organizationId },
          select: { expectedCloseAt: true, owner: true },
        })
      : null;
    const lead = await prisma.lead.update({
      where: { id, organizationId },
      data: {
        ...data,
        expectedCloseAt,
        ...(data.status
          ? {
              status: toPrismaLeadStatus(
                data.status as LeadStatus,
              ) as unknown as Prisma.LeadUpdateInput['status'],
            }
          : {}),
        // Mesma lógica de closedAt de updateStatus (ver comentário lá) — este método também
        // aceita `status` no payload, então precisa manter a mesma garantia.
        ...(data.status ? { closedAt: isClosingNow ? new Date() : null } : {}),
        organizationId: undefined,
        company: undefined,
        contact: undefined,
        activities: undefined,
        internalNotes: undefined,
        timeline: {
          create: {
            type: 'edition',
            description: 'Dados do lead atualizados',
          },
        },
      } as Prisma.LeadUpdateInput,
    });
    if (previousTracked) {
      await recordLeadFieldChanges(
        organizationId,
        id,
        previousTracked,
        { expectedCloseAt: expectedCloseAt as Date | null | undefined, owner: data.owner },
        { source: 'crm' },
      );
    }
    return serializeLead(lead) as unknown as Lead;
  }

  async updateStatus(organizationId: string, id: string, newStatus: string): Promise<Lead> {
    // Busca o status atual para compor a mensagem de timeline, e valida a existência + tenant
    // numa única query. Se não encontrar, lança Error que o errorHandler converte em 404.
    const currentLead = await prisma.lead.findFirst({ where: { id, organizationId } });
    if (!currentLead) throw new Error('Lead not found');

    const previousStatusLabel = fromPrismaLeadStatus(currentLead.status);
    // closedAt: setado só nesta transição (não é @updatedAt) — analytics.service.ts depende
    // disso pra "ganho/perdido no mês" não contar como fechamento qualquer update posterior do
    // lead (sync do Bitrix, uma ligação tocando só lastInteraction, etc.). Volta a null se o
    // lead for reaberto pra uma etapa que não é final.
    // Os dois estágios "...Cancelado" dos pilotos comerciais entram aqui pelo mesmo motivo que
    // "Negócios Perdidos": crm360.service.ts (DEAL_STAGES) já os define como isLost:true — sem
    // fechar closedAt aqui, um piloto cancelado por este caminho (update legado de status, sem
    // passar por /api/crm/records/:id/stage) ficaria "aberto" para sempre nos relatórios.
    // Lista compartilhada com update() (acima) e PrismaCrm360Repository.updateLeadStage() —
    // ver isLeadClosingStatus em src/lib/enumMap.ts.
    const isClosingNow = isLeadClosingStatus(newStatus);
    // O `where` inclui organizationId para garantir isolamento de tenant no update.
    const lead = await prisma.lead.update({
      where: { id, organizationId },
      data: {
        status: toPrismaLeadStatus(
          newStatus as LeadStatus,
        ) as unknown as Prisma.LeadUpdateInput['status'],
        closedAt: isClosingNow ? new Date() : null,
        timeline: {
          create: {
            type: 'movement',
            description: `Lead movido de '${previousStatusLabel}' para '${newStatus}'`,
          },
        },
      },
      include: {
        company: true,
        contact: true,
        timeline: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    return serializeLead(lead) as unknown as Lead;
  }

  async delete(organizationId: string, id: string): Promise<Lead> {
    // CORREÇÃO: Usar soft delete (update com deletedAt) em vez de hard delete.
    // A chamada direta a prisma.lead.delete() bypassava a extensão em prisma.ts que
    // intercepta deletes e os converte para update com deletedAt — o registro era
    // removido fisicamente do banco. Agora aplicamos o soft delete explicitamente,
    // garantindo consistência com o resto do sistema (filtros de findMany, cascade, etc.).
    // O `where` inclui organizationId para garantir isolamento de tenant.
    const lead = await prisma.lead
      .update({
        where: { id, organizationId },
        data: { deletedAt: new Date() },
      })
      .catch((err) => {
        // Prisma lança P2025 quando o registro não existe — propagamos como erro simples
        // para o errorHandler mapear para 404.
        if (err?.code === 'P2025') throw new Error('Lead not found');
        throw err;
      });
    return lead as unknown as Lead;
  }

  async findAllForExport(organizationId: string): Promise<Lead[]> {
    const leads = await prisma.lead.findMany({
      where: { organizationId },
      include: { company: true, contact: true },
      orderBy: { createdAt: 'desc' },
    });
    // CORREÇÃO: Aplicar serializeLead para converter enums internos do Prisma
    // (ex: 'Lead_Recebido') para os rótulos legíveis usados na UI e no CSV
    // (ex: 'Lead Recebido'). Sem isso, o Bitrix24 recebia valores ilegíveis.
    return leads.map(serializeLead) as unknown as Lead[];
  }
}
