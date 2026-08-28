import { prisma } from '../../../../lib/prisma.js';

// ── Histórico real de sincronização Bitrix24 (inbound + outbound) ──────────────────────────────
//
// Backing real para a tela "Webhooks & Monitor" — ver achado da Onda 1 (Roadmap v2, Agente 06):
// antes desta correção, o componente `WebhookMonitor.tsx` chamava um endpoint que nunca existiu
// (`/api/integrations/webhooks/logs`) e, ao falhar/vir vazio, caía silenciosamente para uma lista
// de 4 eventos FABRICADOS no próprio componente (um "webhook Bitrix24" que nunca aconteceu, uma
// chamada de voz que nunca ocorreu, um envio WhatsApp inventado, uma falha 3CX de mentira) —
// dado fictício apresentado como telemetria real, exatamente o que a seção "Dados reais x
// demonstração" de `/AGENTS.md` proíbe ("Nenhuma métrica comercial pode ser fabricada para
// 'preencher' a interface"). `BitrixSyncLog` é a única tabela deste domínio com um histórico real
// de webhook/sincronização (inbound: import manual, regra automática, webhook de entrada;
// outbound: push automático/manual Atlas→Bitrix) — WhatsApp/3CX/voz não têm uma tabela equivalente
// hoje, então a correção expõe o que É real em vez de inventar um placeholder cross-integração.

export interface BitrixSyncLogSummary {
  id: string;
  connectionId: string | null;
  direction: string;
  entityType: string;
  leadId: string | null;
  bitrixRecordId: string | null;
  status: string;
  errorMessage: string | null;
  correlationId: string | null;
  createdAt: Date;
}

/** Lista as últimas entradas de BitrixSyncLog desta organização — sempre escopado por tenant. */
export async function listRecentBitrixSyncLogs(
  organizationId: string,
  take = 50,
): Promise<BitrixSyncLogSummary[]> {
  return prisma.bitrixSyncLog.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(take, 1), 200),
    select: {
      id: true,
      connectionId: true,
      direction: true,
      entityType: true,
      leadId: true,
      bitrixRecordId: true,
      status: true,
      errorMessage: true,
      correlationId: true,
      createdAt: true,
    },
  });
}
