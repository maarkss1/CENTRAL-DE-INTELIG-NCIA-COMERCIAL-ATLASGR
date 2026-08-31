import { prisma } from '../../../lib/prisma.js';

export interface SellerPerformancePeriod {
  from: Date;
  to: Date;
}

export interface AggregatedSellerPerformance {
  callsMade: number;
  meetingsScheduled: number;
  dealsClosed: number;
  avgTicket: number;
  conversionRatePercent: number;
  topLossReason?: string;
}

// Mesmo recorte de "qualificado" de PrismaAnalyticsRepository.groupQualifiedLeadsByOwner: saiu das
// duas primeiras etapas do funil e não foi desqualificado. Deliberadamente NÃO escopado ao período
// (lifetime, como o resto do app já faz) — não existe um carimbo de "data de qualificação" no
// schema para recortar isso por semana sem inventar um.
const QUALIFIED_EXCLUDED_STATUSES = ['Lead_Recebido', 'Cadencia_Iniciada', 'Lead_Desqualificado'];

export class SellerPerformanceAggregatorService {
  async compute(
    organizationId: string,
    owner: string,
    period: SellerPerformancePeriod,
  ): Promise<AggregatedSellerPerformance> {
    const { from, to } = period;

    const [
      callsMade,
      meetingsScheduled,
      dealsAggregate,
      dealsClosed,
      qualifiedCount,
      lossReasonRows,
    ] = await Promise.all([
      prisma.activity.count({
        where: {
          organizationId,
          owner,
          type: 'Ligacao',
          date: { gte: from, lt: to },
          deletedAt: null,
        },
      }),
      prisma.activity.count({
        where: {
          organizationId,
          owner,
          type: 'Reuniao',
          date: { gte: from, lt: to },
          deletedAt: null,
        },
      }),
      prisma.lead.aggregate({
        where: {
          organizationId,
          owner,
          status: 'Negocios_Ganhos',
          closedAt: { gte: from, lt: to },
          deletedAt: null,
        },
        _avg: { amount: true },
      }),
      prisma.lead.count({
        where: {
          organizationId,
          owner,
          status: 'Negocios_Ganhos',
          closedAt: { gte: from, lt: to },
          deletedAt: null,
        },
      }),
      prisma.lead.count({
        where: {
          organizationId,
          owner,
          deletedAt: null,
          status: { notIn: QUALIFIED_EXCLUDED_STATUSES as unknown as never[] },
        },
      }),
      prisma.lead.groupBy({
        by: ['lossReason'],
        where: {
          organizationId,
          owner,
          deletedAt: null,
          status: 'Negocios_Perdidos',
          closedAt: { gte: from, lt: to },
        },
        _count: { _all: true },
      }),
    ]);

    const topLossRow = [...lossReasonRows].sort((a, b) => b._count._all - a._count._all)[0];

    return {
      callsMade,
      meetingsScheduled,
      dealsClosed,
      avgTicket: dealsAggregate._avg?.amount ?? 0,
      conversionRatePercent:
        qualifiedCount > 0 ? Math.round((dealsClosed / qualifiedCount) * 1000) / 10 : 0,
      topLossReason: topLossRow?.lossReason ?? undefined,
    };
  }
}

export const sellerPerformanceAggregator = new SellerPerformanceAggregatorService();
