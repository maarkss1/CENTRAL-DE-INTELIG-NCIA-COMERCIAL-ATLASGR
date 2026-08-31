import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { requestContext } from '../../lib/async-context.js';
import {
  notificationService,
  type NotificationKind,
} from '../notifications/notification.service.js';
import { toPrismaAutomationTrigger, fromPrismaAutomationAction } from '../../lib/enumMap.js';
import { automationHistoryService } from './automation-history.service.js';
import {
  buildTriggerIdempotencyKey,
  claimAutomationTrigger,
} from './automation-idempotency.service.js';

export type AutomationTrigger =
  | 'Lead criado'
  | 'Lead mudou de status'
  | 'Atividade concluída'
  | 'Lead sem interação'
  | 'Lead estagnado';
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
  return template
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
      const value = data[key];
      return value == null ? '' : String(value);
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
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
export function matchesConditions(conditions: unknown, data: Record<string, unknown>): boolean {
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

/**
 * Erro de configuração/validação da própria regra (destinatário ausente, lead não vinculado ao
 * evento, ação desconhecida, SMTP não configurado…): o problema está no dado ou na config, não numa
 * falha transitória de rede/serviço externo. Repetir não muda o resultado, então este tipo de erro
 * NUNCA entra no retry de `runActionWithRetry` — evita esperar (e acumular backoff) por um erro que
 * vai se repetir de forma idêntica em toda tentativa.
 */
export class PermanentAutomationError extends Error {}

/** Tentativas totais por ação (1 original + 2 retries). Mesma ordem de grandeza do retry de IA já
 *  existente (`src/lib/ai/gateway/retry.ts`), mas com política de classificação própria do domínio
 *  de automações (ver `PermanentAutomationError`) — não reaproveitado diretamente porque aquele
 *  helper classifica erro por padrão de mensagem HTTP (429/5xx) específico de provedor de IA, que
 *  não se aplica às ações deste motor (DB write, SMTP, chamada de voz). */
export const MAX_ACTION_ATTEMPTS = 3;
export const ACTION_RETRY_BASE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type RunActionWithRetryResult =
  { success: true; attempts: number } | { success: false; attempts: number; error: unknown };

/**
 * Estado compartilhado entre as tentativas de UMA MESMA execução de ação (não sobrevive além de
 * `runActionWithRetry`). Existe porque uma ação pode ter uma etapa não-idempotente (criar a
 * notificação in-app) seguida de uma etapa que pode falhar de forma transitória (enviar o e-mail).
 * Sem isso, retry por falha do e-mail recriaria a notificação in-app a cada tentativa.
 */
interface ActionAttemptState {
  /** "Notificar equipe": true assim que a notificação in-app é criada — nunca recriar num retry
   *  motivado só pela falha do e-mail que vem depois. */
  inAppNotificationCreated?: boolean;
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

        const correlationId = randomUUID();
        const action = fromPrismaAutomationAction(automation.action);

        // Dedupe de disparo: mesmo evento de gatilho (replay, corrida entre workers) para a
        // mesma automação, dentro da janela de TTL, não executa a ação uma segunda vez. Ver
        // `automation-idempotency.service.ts` para a justificativa completa da chave e do
        // fail-open quando o Redis está indisponível.
        const idempotencyKey = buildTriggerIdempotencyKey({
          automationId: automation.id,
          organizationId: event.organizationId,
          entity: event.entity,
          entityId: event.entityId,
          trigger: event.trigger,
          data: event.data,
        });
        const claim = await claimAutomationTrigger(idempotencyKey);
        if (claim === 'duplicate') {
          logger.info(
            {
              automationId: automation.id,
              name: automation.name,
              correlationId,
              entityId: event.entityId,
            },
            'Disparo de automação ignorado: mesmo evento já processado dentro da janela de dedupe.',
          );
          continue;
        }

        const startedAt = new Date();
        const result = await this.runActionWithRetry({ ...automation, action }, event);

        if (result.success) {
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
            retryCount: result.attempts - 1,
          });
        } else {
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
            error: result.error,
            retryCount: result.attempts - 1,
          });
          logger.error(
            {
              err: result.error,
              automationId: automation.id,
              name: automation.name,
              correlationId,
              attempts: result.attempts,
            },
            'Automação falhou ao executar após esgotar as tentativas',
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

  /**
   * Executa a ação com retry e backoff linear para falhas transitórias.
   *
   * `PermanentAutomationError` (config/validação da regra — ver a classe) nunca é reexecutado:
   * tentar de novo daria o mesmo resultado, só mais devagar. Qualquer outro erro (DB indisponível,
   * SMTP fora do ar, falha de rede na chamada de voz) é tratado como transitório e reexecutado até
   * `MAX_ACTION_ATTEMPTS`, com backoff linear (`ACTION_RETRY_BASE_DELAY_MS * tentativa`) entre elas.
   *
   * Nunca lança: o chamador (`handleScoped`) decide o que fazer com sucesso/falha via o resultado
   * discriminado, para poder registrar `retryCount` no histórico mesmo em caso de falha final.
   */
  private async runActionWithRetry(
    automation: { id: string; name: string; action: string; actionConfig: unknown },
    event: AutomationEvent,
  ): Promise<RunActionWithRetryResult> {
    let lastError: unknown;
    const attemptState: ActionAttemptState = {};

    for (let attempt = 1; attempt <= MAX_ACTION_ATTEMPTS; attempt++) {
      try {
        await this.runAction(automation, event, attemptState);
        return { success: true, attempts: attempt };
      } catch (err) {
        lastError = err;
        const permanent = err instanceof PermanentAutomationError;
        const isLastAttempt = attempt === MAX_ACTION_ATTEMPTS;

        if (permanent || isLastAttempt) {
          return { success: false, attempts: attempt, error: err };
        }

        logger.warn(
          {
            err,
            automationId: automation.id,
            name: automation.name,
            attempt,
            maxAttempts: MAX_ACTION_ATTEMPTS,
          },
          'Ação de automação falhou; tentando novamente após backoff.',
        );
        await sleep(ACTION_RETRY_BASE_DELAY_MS * attempt);
      }
    }

    // Inatingível (o loop sempre retorna dentro de `MAX_ACTION_ATTEMPTS` iterações), mas
    // satisfaz o checador de tipos sem precisar de `!`/`as` no retorno.
    return { success: false, attempts: MAX_ACTION_ATTEMPTS, error: lastError };
  }

  private async runAction(
    automation: { id: string; name: string; action: string; actionConfig: unknown },
    event: AutomationEvent,
    attemptState: ActionAttemptState = {},
  ): Promise<void> {
    const config = (automation.actionConfig ?? {}) as Record<string, unknown>;

    if (automation.action === 'Notificar equipe') {
      const c = config as NotifyConfig;
      const title = renderTemplate(c.title || automation.name, event.data);
      const body = c.body ? renderTemplate(c.body, event.data) : null;

      // Guardado por `attemptState`: num retry motivado só pela falha do envio de e-mail
      // abaixo, a notificação in-app já criada numa tentativa anterior não é recriada.
      if (!attemptState.inAppNotificationCreated) {
        await notificationService.create({
          organizationId: event.organizationId,
          title,
          body,
          kind: c.kind ?? 'Info',
          entity: event.entity,
          entityId: event.entityId,
          automationId: automation.id,
        });
        attemptState.inAppNotificationCreated = true;
      }

      if (c.channel === 'email') {
        const to = c.to ? renderTemplate(c.to, event.data) : '';
        if (!to) {
          // Config da regra, não falha transitória — repetir não cria um destinatário.
          throw new PermanentAutomationError(
            'A ação "Notificar equipe" com canal de e-mail precisa de um destinatário ("to").',
          );
        }
        const { sendEmail, MailerNotConfiguredError } = await import('../../lib/email/mailer.js');
        try {
          await sendEmail({ to, subject: title, text: body || title });
        } catch (error) {
          // Sem SMTP configurado, a notificação interna já foi criada acima (o time não
          // fica sem aviso nenhum) — só o e-mail extra não sai. Propaga um erro claro para
          // o histórico da automação registrar a causa, em vez de fingir sucesso total.
          // Ausência de config (env var) não muda entre tentativas — não retryable.
          if (error instanceof MailerNotConfiguredError) {
            throw new PermanentAutomationError(
              'Canal de e-mail não configurado (SMTP_HOST ausente) — a notificação interna foi criada normalmente.',
            );
          }
          // Qualquer outra falha do transporte SMTP (timeout, recusa de conexão, 4xx/5xx
          // do provedor) é tratada como transitória e entra no retry do chamador.
          throw error;
        }
      }
      return;
    }

    if (automation.action === 'Criar atividade') {
      // Em evento de Lead, o próprio evento É o lead. Em evento de Activity (ex.: "Atividade
      // concluída"), o lead vem em event.data.leadId.
      const leadId =
        event.entity === 'Lead'
          ? event.entityId
          : typeof event.data.leadId === 'string'
            ? event.data.leadId
            : null;
      if (!leadId) {
        // Dado do evento, não instabilidade de rede/DB — retentar não cria um lead do nada.
        throw new PermanentAutomationError(
          'A ação "Criar atividade" precisa de um lead vinculado ao evento.',
        );
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
        // Config/tipo do evento, não instabilidade externa — nunca vira "Lead" tentando de novo.
        throw new PermanentAutomationError(
          'A ação "Ligar via SDR de Voz" só se aplica a eventos de lead.',
        );
      }
      const { callLead, SuppressedNumberError } =
        await import('../integrations/birth-voice/birthVoice.service.js');
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
        // Nota de limitação conhecida: se `callLead` falhar de forma transitória DEPOIS de a
        // chamada já ter sido efetivamente iniciada no provedor (resposta perdida na volta),
        // o retry abaixo pode discar de novo — `birthVoice.service.ts` não expõe hoje uma
        // chave de idempotência por tentativa para evitar isso (fora do escopo deste agente,
        // que só edita `src/features/automations/**`). Risco aceito nesta mudança: o cenário
        // real e frequente que motivou a tarefa (evento duplicado por replay/corrida) já é
        // coberto pelo dedupe de disparo em `automation-idempotency.service.ts`, que impede a
        // automação de sequer chegar a chamar `callLead` duas vezes para o MESMO evento.
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

    // Ação inexistente no catálogo — problema de config da regra, não retentável.
    throw new PermanentAutomationError(`Ação desconhecida: ${automation.action}`);
  }
}

export const automationEngine = new AutomationEngine();
