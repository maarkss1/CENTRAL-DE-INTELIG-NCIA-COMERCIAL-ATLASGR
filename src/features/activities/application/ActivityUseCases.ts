import { ActivityRepository, ActivityListFilters } from '../domain/Activity';
import { z } from 'zod';
import { activitySchema } from '../../../lib/zod';
import { assertRealOwner } from '../domain/ownerGuard';

export class ActivityUseCases {
  constructor(private activityRepository: ActivityRepository) {}

  async findActivities(organizationId: string, dateStr?: string) {
    return this.activityRepository.findAllWithFilters(organizationId, dateStr);
  }

  async findActivitiesPaginated(
    organizationId: string,
    dateStr?: string,
    page?: number,
    limit?: number,
    filters?: ActivityListFilters,
  ) {
    return this.activityRepository.findAllPaginated(organizationId, dateStr, page, limit, filters);
  }

  async findActivitiesRange(organizationId: string, fromStr: string, toStr: string) {
    const from = new Date(fromStr);
    const to = new Date(toStr);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new Error('Intervalo de datas inválido.');
    }
    if (from >= to) throw new Error('A data inicial deve ser anterior à final.');
    return this.activityRepository.findRange(organizationId, from, to);
  }

  async createActivity(organizationId: string, data: z.infer<typeof activitySchema>) {
    const validated = activitySchema.parse(data);
    assertRealOwner(validated.owner);
    return this.activityRepository.createWithTimeline(
      organizationId,
      validated as Parameters<ActivityRepository['createWithTimeline']>[1],
    );
  }

  async updateActivity(
    organizationId: string,
    id: string,
    data: Partial<z.infer<typeof activitySchema>>,
  ) {
    if (data.owner) assertRealOwner(data.owner);
    return this.activityRepository.updateWithTimeline(
      organizationId,
      id,
      data as Parameters<ActivityRepository['updateWithTimeline']>[2],
    );
  }

  async deleteActivity(organizationId: string, id: string) {
    return this.activityRepository.delete!(organizationId, id);
  }

  async snoozeActivity(
    organizationId: string,
    id: string,
    duration: '2h' | 'tomorrow' | 'next_week',
  ) {
    const now = new Date();
    let targetDate = new Date();
    let targetTime = '09:00';

    if (duration === '2h') {
      targetDate = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      targetTime = `${String(targetDate.getHours()).padStart(2, '0')}:${String(targetDate.getMinutes()).padStart(2, '0')}`;
    } else if (duration === 'tomorrow') {
      targetDate.setDate(now.getDate() + 1);
      targetTime = '09:00';
    } else if (duration === 'next_week') {
      targetDate.setDate(now.getDate() + 7);
      targetTime = '09:00';
    }

    return this.activityRepository.updateWithTimeline(organizationId, id, {
      date: targetDate,
      time: targetTime,
      status: 'Pendente',
    });
  }

  getFollowUpTemplates() {
    return [
      {
        id: 'pos-demo',
        title: 'Follow-up Pós-Demo',
        type: 'Reunião',
        defaultTime: '10:00',
        description:
          'Revisão dos pontos discutidos na demonstração de telemetria/rastreamento e alinhamento do piloto.',
        suggestedOffsetDays: 1,
      },
      {
        id: 'alinhamento-proposta',
        title: 'Apresentação de Proposta',
        type: 'Reunião',
        defaultTime: '14:30',
        description:
          'Apresentação do ROI, dimensionamento de frota e validação com o decisor financeiro.',
        suggestedOffsetDays: 2,
      },
      {
        id: 'decisao-fechamento',
        title: 'Checagem de Decisão',
        type: 'Ligação',
        defaultTime: '11:00',
        description:
          'Contato direto para esclarecimento de dúvidas contratuais e data de assinatura.',
        suggestedOffsetDays: 3,
      },
      {
        id: 'diagnostico-frota',
        title: 'Diagnóstico Operacional de Frota',
        type: 'Visita',
        defaultTime: '09:00',
        description:
          'Mapeamento in-loco dos gargalos de telemetria, consumo de combustível e riscos de carga.',
        suggestedOffsetDays: 4,
      },
    ];
  }

  async generateIcalFeed(organizationId: string, owner?: string): Promise<string> {
    const from = new Date();
    from.setDate(from.getDate() - 30);
    const to = new Date();
    to.setDate(to.getDate() + 90);

    const activities = await this.activityRepository.findRange(organizationId, from, to);
    const filtered = owner ? activities.filter((a) => a.owner === owner) : activities;

    const formatIcsDate = (d: Date) => {
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//AtlasGR//Central de Inteligencia Comercial//PT',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:Agenda AtlasGR - ${owner || 'Equipe'}`,
    ];

    for (const act of filtered) {
      const startDate = new Date(act.date);
      if (act.time) {
        const [hh, mm] = act.time.split(':').map(Number);
        startDate.setHours(hh || 9, mm || 0, 0, 0);
      }
      const endDate = new Date(startDate.getTime() + 45 * 60 * 1000);

      const leadObj = (
        act as {
          lead?: {
            company?: { tradeName?: string; legalName?: string };
            contact?: { name?: string };
            title?: string;
          };
        }
      ).lead;
      const summary = `[${act.type}] ${leadObj?.company?.tradeName || leadObj?.company?.legalName || leadObj?.contact?.name || leadObj?.title || 'Cliente'}`;
      const desc = (act.observations || '').replace(/\n/g, '\\n');

      lines.push(
        'BEGIN:VEVENT',
        `UID:${act.id}@atlasgr.com.br`,
        `DTSTAMP:${formatIcsDate(new Date())}`,
        `DTSTART:${formatIcsDate(startDate)}`,
        `DTEND:${formatIcsDate(endDate)}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${desc}`,
        `STATUS:${act.status === 'Concluída' ? 'CONFIRMED' : 'TENTATIVE'}`,
        'END:VEVENT',
      );
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }
}
