import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma.js';
import { getTenantId } from '../../../lib/async-context.js';
import { ACTIVITY_TYPE } from '../../../lib/zod.js';
import type { NotificationKind } from '../../notifications/notification.service.js';

// GOV-13 (Agente 13 — enxame autônomo): substitui as ferramentas de `opsTools.ts` para o
// OpsAgent especificamente. Diferente de SDR/BDR/Closer/CRM (que sempre passam recomendação
// crítica por `AIPendingAction` antes de qualquer efeito real — ver
// `services/aiPendingAction.service.ts` e as rotas de aprovação em `routes/intelligence.routes.ts`),
// o OpsAgent chamava `activityService.create`/`notificationService.create` DIRETO a partir do
// tool-calling do LLM, sem nenhuma aprovação humana no meio — a única "IA executora" do enxame que
// contornava esse portão (documentado antes desta correção como `OPS_NO_LEDGER_NOTE` em
// `services/swarmScheduler.service.ts`). Estas duas ferramentas têm o MESMO nome/schema que as de
// `opsTools.ts` (o LLM não percebe diferença na chamada), mas em vez de executar o efeito
// diretamente elas só REGISTRAM uma `AIPendingAction` — a execução real (criar a Activity/
// Notification) só acontece quando um humano aprova via
// `POST /agent/pending/:id/approve` (`pending-actions.service.ts` → `executeAndRecord` →
// `aiPendingAction.service.ts`), exatamente como já acontece para `send_email` (SDR) e
// `swarm_recommendation` (BDR/CLOSER/CRM).
//
// tenantId, tool allowlist (ver `ops.agent.ts`, `tools`) e o guard de PII/LGPD que o OpsAgent já
// tinha (`assertPiiExternalConsent` em `ops.agent.ts:run()`) continuam intocados — a mudança é
// só ONDE o efeito de fato acontece (depois da aprovação), nunca se o OpsAgent ainda pode agir,
// nem para quem, nem com qual tenant.

/** Janela de deduplicação: uma retentativa do próprio loop de tool-calling do LLM para a MESMA
 * proposta (mesmo lead/data ou mesmo título/corpo) dentro desta janela colapsa numa única
 * `AIPendingAction`, em vez de empilhar entradas duplicadas na fila de aprovação. Passada a
 * janela, uma proposta com o mesmo conteúdo é tratada como uma nova decisão legítima. */
const IDEMPOTENCY_BUCKET_MS = 30 * 60 * 1000;

function idempotencyBucket(now: number = Date.now()): number {
  return Math.floor(now / IDEMPOTENCY_BUCKET_MS);
}

/** `P2002` = violação da unique constraint `(organizationId, idempotencyKey)` — outra chamada
 * (retentativa do próprio LLM dentro da mesma janela) já criou a proposta primeiro. Não é uma
 * falha real: a proposta já existe e já está na fila de aprovação. */
function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
  );
}

async function findExistingByIdempotencyKey(organizationId: string, idempotencyKey: string) {
  return prisma.aIPendingAction.findUnique({
    where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
  });
}

/**
 * Substitui a execução direta de `create_follow_up_task` (`opsTools.ts`) por uma proposta em
 * `AIPendingAction` (`action: 'create_follow_up'` — mesmo tipo já suportado pelo executor central
 * de `aiPendingAction.service.ts`, reaproveitado aqui em vez de recriado). A resolução de
 * responsável (`owner`) quando não informado explicitamente já é feita pelo PRÓPRIO executor no
 * momento da aprovação (mesma regra de `assertRealOwner`/"nunca um nome de IA fabricado"), então
 * não é duplicada aqui — só validamos que o Lead existe, para dar um erro específico ao LLM em vez
 * de deixar uma proposta órfã na fila.
 */
export const createFollowUpTaskTool = tool(
  async ({
    leadId,
    date,
    type,
    observations,
    owner,
  }: {
    leadId: string;
    date: string;
    type?: (typeof ACTIVITY_TYPE)[number];
    observations?: string;
    owner?: string;
  }) => {
    const organizationId = getTenantId();
    if (!organizationId) {
      return 'Erro: contexto de organização ausente — não é possível propor a tarefa com segurança.';
    }

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId },
      select: { id: true },
    });
    if (!lead) {
      return `Erro: Lead ${leadId} não encontrado no CRM — não é possível propor a tarefa.`;
    }

    const idempotencyKey = `ops:create_follow_up:${leadId}:${date}:${type ?? 'Follow-up'}:${idempotencyBucket()}`;

    try {
      await prisma.aIPendingAction.create({
        data: {
          entity: 'Lead',
          action: 'create_follow_up',
          agentRole: 'OPS',
          riskLevel: 'low',
          idempotencyKey,
          organizationId,
          payload: {
            leadId,
            date,
            type: type ?? 'Follow-up',
            observations: observations ?? null,
            owner: owner ?? null,
          },
        },
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        return `Erro ao registrar a proposta de tarefa: ${error instanceof Error ? error.message : String(error)}`;
      }
      const existing = await findExistingByIdempotencyKey(organizationId, idempotencyKey);
      if (!existing) {
        return `Erro ao registrar a proposta de tarefa: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    return `Proposta de tarefa "${type ?? 'Follow-up'}" registrada para o lead ${leadId} em ${date}, aguardando aprovação humana antes de ser criada de fato no CRM.`;
  },
  {
    name: 'create_follow_up_task',
    description:
      'Propõe uma tarefa/atividade de follow-up vinculada a um Lead no CRM, para um vendedor humano executar depois. A proposta fica pendente de aprovação humana antes de ser criada de fato — use quando a missão pedir para marcar um próximo contato ou lembrete concreto.',
    schema: z.object({
      leadId: z.string().describe('O ID do Lead ao qual a tarefa deve ser vinculada'),
      date: z
        .string()
        .describe(
          'Data (e opcionalmente hora) da tarefa, em formato ISO 8601, ex: 2026-08-05T14:00:00.000Z',
        ),
      type: z.enum(ACTIVITY_TYPE).optional().describe('Tipo da atividade (padrão: Follow-up)'),
      observations: z
        .string()
        .optional()
        .describe('Observações/contexto para quem for executar a tarefa'),
      owner: z.string().optional().describe('Nome do responsável humano pela tarefa, se conhecido'),
    }),
  },
);

/**
 * Substitui a execução direta de `notify_team` (`opsTools.ts`) por uma proposta em
 * `AIPendingAction` (novo tipo `notify_team`, executado por `aiPendingAction.service.ts` só após
 * aprovação humana).
 */
export const notifyTeamTool = tool(
  async ({
    title,
    body,
    kind,
    leadId,
  }: {
    title: string;
    body?: string;
    kind?: NotificationKind;
    leadId?: string;
  }) => {
    const organizationId = getTenantId();
    if (!organizationId) {
      return 'Erro: contexto de organização ausente — não é possível propor a notificação com segurança.';
    }

    const idempotencyKey = `ops:notify_team:${leadId ?? 'org'}:${title}:${idempotencyBucket()}`;

    try {
      await prisma.aIPendingAction.create({
        data: {
          entity: leadId ? 'Lead' : 'Organization',
          action: 'notify_team',
          agentRole: 'OPS',
          riskLevel: 'medium',
          idempotencyKey,
          organizationId,
          payload: { title, body: body ?? null, kind: kind ?? 'Info', leadId: leadId ?? null },
        },
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        return `Erro ao registrar a proposta de notificação: ${error instanceof Error ? error.message : String(error)}`;
      }
      const existing = await findExistingByIdempotencyKey(organizationId, idempotencyKey);
      if (!existing) {
        return `Erro ao registrar a proposta de notificação: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    return `Proposta de notificação "${title}" registrada, aguardando aprovação humana antes de ser enviada de fato à equipe.`;
  },
  {
    name: 'notify_team',
    description:
      'Propõe uma notificação interna para a equipe comercial (aparece no sino de notificações do CRM). A proposta fica pendente de aprovação humana antes de ser enviada de fato — use para alertar sobre um risco, oportunidade ou resultado importante da missão que exige atenção humana.',
    schema: z.object({
      title: z.string().min(1).max(160).describe('Título curto e direto da notificação'),
      body: z.string().max(1000).optional().describe('Detalhe opcional da notificação'),
      kind: z
        .enum(['Info', 'Sucesso', 'Alerta', 'Erro'])
        .optional()
        .describe('Severidade da notificação (padrão: Info)'),
      leadId: z.string().optional().describe('ID do Lead relacionado, se houver'),
    }),
  },
);
