import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { notificationService, type NotificationKind } from '../notifications/notification.service.js';
import { toPrismaAutomationTrigger, fromPrismaAutomationAction } from '../../lib/enumMap.js';

export type AutomationTrigger = 'Lead criado' | 'Lead mudou de status' | 'Atividade concluída';
export type AutomationActionType = 'Notificar equipe' | 'Criar atividade' | 'Ligar via SDR de Voz';

/**
 * Contexto do evento que disparou o motor. As chaves viram tanto critério de condição quanto
 * variáveis de template no texto da ação.
 */
export interface AutomationEvent {
    organizationId: string;
    trigger: AutomationTrigger;
    /** Entidade de origem, para a notificação conseguir levar de volta a ela. */
    entity: 'Lead' | 'Activity';
    entityId: string;
    /** Campos comparáveis nas condições: status, owner, temperature, type… */
    data: Record<string, unknown>;
}

interface NotifyConfig {
    title?: string;
    body?: string;
    kind?: NotificationKind;
}

interface CreateActivityConfig {
    type?: string;
    owner?: string;
    /** Dias a partir de hoje para a atividade nascer agendada. */
    dueInDays?: number;
    observations?: string;
}

/**
 * Substitui `{{campo}}` pelos valores do evento.
 * Placeholder sem valor correspondente é removido, para não vazar `{{status}}` cru na interface.
 */
export function renderTemplate(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
        const value = data[key];
        return value == null ? '' : String(value);
    }).replace(/\s{2,}/g, ' ').trim();
}

/**
 * Decide se a regra se aplica ao evento.
 *
 * Condições são um objeto simples de igualdades (`{ "status": "Proposta" }`); todas precisam bater.
 * Comparação é feita como string para o JSON do banco não divergir de enums e números.
 */
export function matchesConditions(
    conditions: unknown,
    data: Record<string, unknown>,
): boolean {
    if (conditions == null) return true;
    if (typeof conditions !== 'object' || Array.isArray(conditions)) return true;

    const entries = Object.entries(conditions as Record<string, unknown>);
    // Objeto vazio significa "sem filtro", não "nunca casa".
    if (entries.length === 0) return true;

    return entries.every(([key, expected]) => {
        if (expected == null || expected === '') return true;
        const actual = data[key];
        return actual != null && String(actual) === String(expected);
    });
}

export class AutomationEngine {
    /**
     * Roda todas as automações ativas que casam com o evento.
     *
     * Nunca lança: automação é efeito colateral do fluxo principal. Uma regra mal configurada não
     * pode impedir que o lead seja salvo — o erro vai para o log e as demais regras seguem.
     */
    async handle(event: AutomationEvent): Promise<number> {
        let executed = 0;
        try {
            const automations = await prisma.automation.findMany({
                // O Prisma Client só aceita o identificador do enum (`Lead_Mudou_Status`), nunca o
                // rótulo humano mapeado (`@map`) que trafega no resto do sistema — mesma conversão
                // que PrismaAutomationRepository já faz para as rotas de CRUD (ver enumMap.ts).
                where: {
                    organizationId: event.organizationId,
                    enabled: true,
                    trigger: toPrismaAutomationTrigger(event.trigger) as never,
                },
            });

            for (const automation of automations) {
                if (!matchesConditions(automation.conditions, event.data)) continue;
                try {
                    await this.runAction(
                        { ...automation, action: fromPrismaAutomationAction(automation.action) },
                        event,
                    );
                    await prisma.automation.update({
                        where: { id: automation.id },
                        data: { lastRunAt: new Date(), runCount: { increment: 1 } },
                    });
                    executed++;
                } catch (err) {
                    logger.error(
                        { err, automationId: automation.id, name: automation.name },
                        'Automação falhou ao executar',
                    );
                }
            }
        } catch (err) {
            logger.error({ err, trigger: event.trigger }, 'Falha ao avaliar automações');
        }
        return executed;
    }

    private async runAction(
        automation: { id: string; name: string; action: string; actionConfig: unknown },
        event: AutomationEvent,
    ): Promise<void> {
        const config = (automation.actionConfig ?? {}) as Record<string, unknown>;

        if (automation.action === 'Notificar equipe') {
            const c = config as NotifyConfig;
            await notificationService.create({
                organizationId: event.organizationId,
                title: renderTemplate(c.title || automation.name, event.data),
                body: c.body ? renderTemplate(c.body, event.data) : null,
                kind: c.kind ?? 'Info',
                entity: event.entity,
                entityId: event.entityId,
                automationId: automation.id,
            });
            return;
        }

        if (automation.action === 'Criar atividade') {
            // Em evento de Lead, o próprio evento É o lead. Em evento de Activity (ex.: "Atividade
            // concluída"), o lead vem em event.data.leadId — permite regras como "toda vez que uma
            // atividade for concluída, agende um follow-up no mesmo lead".
            const leadId = event.entity === 'Lead'
                ? event.entityId
                : (typeof event.data.leadId === 'string' ? event.data.leadId : null);
            if (!leadId) {
                throw new Error('A ação "Criar atividade" precisa de um lead vinculado ao evento.');
            }
            const c = config as CreateActivityConfig;
            const date = new Date();
            date.setDate(date.getDate() + (Number(c.dueInDays) || 1));

            await prisma.activity.create({
                data: {
                    organizationId: event.organizationId,
                    leadId,
                    type: (c.type || 'Follow_up') as never,
                    owner: c.owner || String(event.data.owner ?? 'Não atribuído'),
                    date,
                    status: 'Pendente' as never,
                    observations: renderTemplate(
                        c.observations || `Criada pela automação "${automation.name}".`,
                        event.data,
                    ),
                },
            });
            return;
        }

        if (automation.action === 'Ligar via SDR de Voz') {
            if (event.entity !== 'Lead') {
                throw new Error('A ação "Ligar via SDR de Voz" só se aplica a eventos de lead.');
            }
            // Import tardio (mesmo padrão do Bitrix24Adapter em LeadUseCases): o serviço carrega
            // configuração de ambiente e o cliente HTTP do Hub, que não fazem falta para nenhuma
            // outra ação — e um deployment que não usa SDR de voz nunca chega a carregá-lo.
            const { callLead, SuppressedNumberError } = await import('../integrations/birth-voice/birthVoice.service.js');
            try {
                await callLead(event.organizationId, event.entityId);
            } catch (error) {
                // Número com opt-out é a regra funcionando, não uma falha: registrar como erro
                // encheria o log de alarme falso e faria a automação parecer quebrada toda vez que
                // ela respeitasse um bloqueio. Qualquer outro erro (lead sem telefone, Hub fora do
                // ar) continua subindo, para quem chama isolar por automação e registrar no log.
                if (!(error instanceof SuppressedNumberError)) throw error;
                logger.info(
                    { automationId: automation.id, leadId: event.entityId },
                    'Automação de SDR de voz não ligou: número na lista de bloqueio (opt-out).',
                );
            }
            return;
        }

        throw new Error(`Ação desconhecida: ${automation.action}`);
    }
}

export const automationEngine = new AutomationEngine();
