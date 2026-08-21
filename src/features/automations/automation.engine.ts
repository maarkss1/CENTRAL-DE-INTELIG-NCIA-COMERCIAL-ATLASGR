import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { requestContext } from '../../lib/async-context.js';
import { notificationService, type NotificationKind } from '../notifications/notification.service.js';
import { toPrismaAutomationTrigger, fromPrismaAutomationAction } from '../../lib/enumMap.js';
import { automationHistoryService } from './automation-history.service.js';

export type AutomationTrigger = 'Lead criado' | 'Lead mudou de status' | 'Atividade concluída' | 'Lead sem interação';
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
    /**
     * Canal do aviso. `in_app` (padrão, comportamento original) cria só a notificação interna do
     * sino. `email` ENVIA de verdade um e-mail via SMTP (`sendEmail`) para `to`, além de continuar
     * criando a notificação interna — ação de alto impacto (ação externa), mas pré-autorizada no
     * momento em que um humano configurou a regra (mesmo raciocínio já aplicado à ação "Ligar via
     * SDR de Voz": a automação é a confirmação humana, dada uma vez na criação da regra, não a cada
     * disparo — diferente de uma ferramenta do Hub de IA decidindo agir sozinha em tempo real).
     */
    channel?: 'in_app' | 'email';
    /** Obrigatório quando `channel === 'email'`. Suporta `{{campo}}` do evento via renderTemplate. */
    to?: string;
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

/** As quatro chaves de operador numérico aceitas num valor de condição (ver `isConditionOperator`). */
const CONDITION_OPERATOR_KEYS = ['gte', 'lte', 'gt', 'lt'] as const;
type ConditionOperatorKey = (typeof CONDITION_OPERATOR_KEYS)[number];
type ConditionOperator = Record<ConditionOperatorKey, number>;

/**
 * Reconhece o formato `{ gte: 3 }` (e variantes `lte`/`gt`/`lt`) usado pelas regras de estagnação
 * (ex.: "Negócio parado há X dias", "Proposta enviada sem resposta há X dias" — ver
 * `stagnation-scanner.service.ts`). Nunca colide com uma condição de igualdade legada: o formulário
 * de automações sempre grava valores de condição como string simples, então um objeto com
 * exatamente uma das quatro chaves acima só pode ter vindo de uma regra de operador numérico.
 */
function isConditionOperator(value: unknown): value is ConditionOperator {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length !== 1) return false;
    const [key] = keys as [string];
    if (!CONDITION_OPERATOR_KEYS.includes(key as ConditionOperatorKey)) return false;
    return typeof (value as Record<string, unknown>)[key] === 'number';
}

/**
 * Decide se a regra se aplica ao evento.
 *
 * Duas formas de condição, por chave:
 * - igualdade simples (`{ "status": "Proposta Enviada" }`) — comparada como string, para o JSON do
 *   banco não divergir de enums e números;
 * - operador numérico (`{ "daysSinceLastInteraction": { "gte": 3 } }`) — usado pelas regras de
 *   estagnação disparadas por varredura periódica, nunca por um evento em tempo real (que não
 *   preenche esses campos derivados em `data`, então a condição falha naturalmente e a regra não
 *   dispara duas vezes por engano).
 *
 * Todas as chaves da condição precisam bater (AND implícito).
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

        if (isConditionOperator(expected)) {
            const actual = data[key];
            if (actual == null) return false;
            const actualNum = typeof actual === 'number' ? actual : Number(actual);
            if (Number.isNaN(actualNum)) return false;

            const [operator] = Object.keys(expected) as [ConditionOperatorKey];
            const threshold = expected[operator];
            if (operator === 'gte') return actualNum >= threshold;
            if (operator === 'lte') return actualNum <= threshold;
            if (operator === 'gt') return actualNum > threshold;
            return actualNum < threshold; // 'lt'
        }

        const actual = data[key];
        return actual != null && String(actual) === String(expected);
    });
}

export class AutomationEngine {
    /**
     * Roda todas as automações ativas que casam com o evento.
     *
     * Nunca lança: automação é efeito colateral do fluxo principal. Uma regra mal configurada não
     * pode impedir que o lead seja salvo. Cada execução, inclusive falhas, ganha trilha persistente
     * no AuditLog com correlationId e dados sanitizados.
     */
    async handle(event: AutomationEvent): Promise<number> {
        const store = requestContext.getStore();

        // Um evento nunca pode trocar silenciosamente o tenant de uma request já autenticada.
        if (store?.tenantId && store.tenantId !== event.organizationId) {
            logger.error(
                {
                    contextTenantId: store.tenantId,
                    eventTenantId: event.organizationId,
                    trigger: event.trigger,
                    entityId: event.entityId,
                },
                'Automação recusada por divergência de tenant',
            );
            return 0;
        }

        // Workers e consumidores de fila podem disparar o motor sem AsyncLocalStorage prévio.
        // Nesse caso o próprio evento carrega o tenant e passa a ser o contexto RLS desta execução.
        if (!store?.tenantId) {
            return requestContext.run(
                {
                    tenantId: event.organizationId,
                    userId: store?.userId,
                    role: store?.role,
                },
                () => this.handleScoped(event),
            );
        }

        return this.handleScoped(event);
    }

    private async handleScoped(event: AutomationEvent): Promise<number> {
        let executed = 0;
        try {
            const automations = await prisma.automation.findMany({
                // O Prisma Client só aceita o identificador do enum (`Lead_Mudou_Status`), nunca o
                // rótulo humano mapeado (`@map`) que trafega no resto do sistema.
                where: {
                    organizationId: event.organizationId,
                    enabled: true,
                    trigger: toPrismaAutomationTrigger(event.trigger) as never,
                },
            });

            for (const automation of automations) {
                if (!matchesConditions(automation.conditions, event.data)) continue;

                const startedAt = new Date();
                const correlationId = randomUUID();
                const action = fromPrismaAutomationAction(automation.action);

                try {
                    await this.runAction(
                        { ...automation, action },
                        event,
                    );
                    await prisma.automation.update({
                        where: { id: automation.id },
                        data: { lastRunAt: new Date(), runCount: { increment: 1 } },
                    });
                    executed++;

                    await this.recordHistorySafely({
                        automationId: automation.id,
                        automationName: automation.name,
                        organizationId: event.organizationId,
                        correlationId,
                        trigger: event.trigger,
                        entity: event.entity,
                        entityId: event.entityId,
                        action,
                        actionConfig: automation.actionConfig,
                        eventData: event.data,
                        status: 'success',
                        startedAt,
                        finishedAt: new Date(),
                    });
                } catch (err) {
                    await this.recordHistorySafely({
                        automationId: automation.id,
                        automationName: automation.name,
                        organizationId: event.organizationId,
                        correlationId,
                        trigger: event.trigger,
                        entity: event.entity,
                        entityId: event.entityId,
                        action,
                        actionConfig: automation.actionConfig,
                        eventData: event.data,
                        status: 'failed',
                        startedAt,
                        finishedAt: new Date(),
                        error: err,
                    });
                    logger.error(
                        { err, automationId: automation.id, name: automation.name, correlationId },
                        'Automação falhou ao executar',
                    );
                }
            }
        } catch (err) {
            logger.error({ err, trigger: event.trigger }, 'Falha ao avaliar automações');
        }
        return executed;
    }

    private async recordHistorySafely(
        input: Parameters<typeof automationHistoryService.record>[0],
    ): Promise<void> {
        try {
            await automationHistoryService.record(input);
        } catch (err) {
            // A trilha de auditoria é obrigatória para observabilidade, mas continua sendo efeito
            // colateral: uma indisponibilidade do AuditLog não pode desfazer a ação comercial que
            // já aconteceu nem derrubar o salvamento do lead que originou o evento.
            logger.error(
                { err, automationId: input.automationId, correlationId: input.correlationId },
                'Falha ao persistir histórico da automação',
            );
        }
    }

    private async runAction(
        automation: { id: string; name: string; action: string; actionConfig: unknown },
        event: AutomationEvent,
    ): Promise<void> {
        const config = (automation.actionConfig ?? {}) as Record<string, unknown>;

        if (automation.action === 'Notificar equipe') {
            const c = config as NotifyConfig;
            const title = renderTemplate(c.title || automation.name, event.data);
            const body = c.body ? renderTemplate(c.body, event.data) : null;

            await notificationService.create({
                organizationId: event.organizationId,
                title,
                body,
                kind: c.kind ?? 'Info',
                entity: event.entity,
                entityId: event.entityId,
                automationId: automation.id,
            });

            if (c.channel === 'email') {
                const to = c.to ? renderTemplate(c.to, event.data) : '';
                if (!to) {
                    throw new Error('A ação "Notificar equipe" com canal de e-mail precisa de um destinatário ("to").');
                }
                const { sendEmail, MailerNotConfiguredError } = await import('../../lib/email/mailer.js');
                try {
                    await sendEmail({ to, subject: title, text: body || title });
                } catch (error) {
                    // Sem SMTP configurado, a notificação interna já foi criada acima (o time não
                    // fica sem aviso nenhum) — só o e-mail extra não sai. Propaga um erro claro para
                    // o histórico da automação registrar a causa, em vez de fingir sucesso total.
                    if (error instanceof MailerNotConfiguredError) {
                        throw new Error('Canal de e-mail não configurado (SMTP_HOST ausente) — a notificação interna foi criada normalmente.');
                    }
                    throw error;
                }
            }
            return;
        }

        if (automation.action === 'Criar atividade') {
            // Em evento de Lead, o próprio evento É o lead. Em evento de Activity (ex.: "Atividade
            // concluída"), o lead vem em event.data.leadId.
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
            const { callLead, SuppressedNumberError } = await import('../integrations/birth-voice/birthVoice.service.js');
            const { isWithinCallWindow } = await import('../integrations/birth-voice/coldCall.policy.js');
            const { callWindowFromEnv } = await import('../integrations/birth-voice/coldCall.service.js');

            if (!isWithinCallWindow(new Date(), callWindowFromEnv())) {
                logger.info(
                    { automationId: automation.id, leadId: event.entityId },
                    'Automação de SDR de voz não ligou: fora da janela comercial de ligações.',
                );
                return;
            }

            try {
                await callLead(event.organizationId, event.entityId);
            } catch (error) {
                // Número com opt-out é a regra funcionando, não uma falha.
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

