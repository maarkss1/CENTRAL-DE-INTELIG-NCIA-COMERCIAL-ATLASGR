import { randomUUID } from 'node:crypto';
import { AppError } from '../../../shared/middlewares/errorHandler.js';
import { evaluateDealClosure, isDeterministicCloseEvent, type DealClosureEvent } from '../../cadence/domain/dealClosure.js';

/**
 * CYC-007 (onda 24) — conecta `dealClosure.ts` (domínio puro do Agente 17, entregue na Sprint 06
 * mas nunca chamado por `LeadUseCases.updateLeadStatus`, per `docs/CADENCE-CYCLE-AUDIT.md`) aos 3
 * caminhos de escrita reais que movem um Lead para "Negócios Ganhos": `LeadUseCases.updateLeadStatus`
 * (drag no Kanban), `LeadUseCases.updateLead` (edição completa) e
 * `PrismaCrm360Repository.updateLeadStage` (módulo CRM360).
 *
 * Decisão de produto (não corrigida sozinha, confirmada com o usuário nesta rodada): o gate não
 * bloqueia o fluxo humano que já funciona em produção hoje — CYC-005/CYC-006 (versionamento de
 * proposta / assinatura eletrônica) ainda não têm integração real de provedor, então exigir essa
 * evidência bloquearia todo fechamento manual. Em vez disso, o próprio ato de um humano autenticado
 * confirmar o fechamento pelo CRM É a evidência: cria-se uma `Note` real no lead (rastreável,
 * visível no histórico) e um `DealClosureEvent` do tipo `manual_crm_confirmation` referenciando
 * essa nota. O que o gate garante de verdade — e é o objetivo central do CYC-007 — é que **nenhum
 * fechamento automatizado passa por aqui**: `evaluateDealClosure` rejeita qualquer `triggeredBy`
 * que pareça vir de IA/automação (`ai-`, `agent-`, `swarm-`, `closer-`, `bot-`), então um
 * `actorUserId` sintético desse tipo é bloqueado com 403, nunca silenciosamente aceito.
 */

export interface DealClosureEvidencePort {
    /** Cria o registro de evidência real (Note do lead) referenciado pelo DealClosureEvent. */
    createConfirmationNote(input: { organizationId: string; leadId: string; authorUserId: string }): Promise<{ id: string }>;
    saveDealClosureEvent(event: DealClosureEvent): Promise<void>;
}

/**
 * Deve ser chamada ANTES de qualquer escrita que mova `Lead.status` para "Negócios Ganhos".
 * Lança `AppError` (403) se `evaluateDealClosure` rejeitar — o chamador nunca deve prosseguir com
 * a mudança de status quando esta função lança.
 *
 * A checagem de `triggeredBy` roda ANTES de criar qualquer evidência: `isDeterministicCloseEvent`
 * não depende do conteúdo de `evidenceRef` (só verifica que não é vazio), então um pré-check com
 * um valor de referência qualquer decide aceitar/rejeitar sem custar uma escrita real. Criar a
 * `Note` antes desse pré-check deixaria, numa tentativa rejeitada (ex.: `actorUserId` com cara de
 * IA/automação — o próprio caso que este gate existe para bloquear), uma nota falsa de
 * "confirmação manual" no histórico do lead mesmo com o fechamento negado.
 */
export async function ensureManualDealClosureAllowed(
    port: DealClosureEvidencePort,
    input: { organizationId: string; leadId: string; actorUserId: string },
): Promise<void> {
    const preflight = {
        organizationId: input.organizationId,
        leadId: input.leadId,
        type: 'manual_crm_confirmation' as const,
        evidenceRef: input.actorUserId,
        triggeredBy: input.actorUserId,
    };

    if (!isDeterministicCloseEvent(preflight)) {
        throw new AppError(
            'Fechamento de negócio recusado (untrusted-trigger) — um lead só é movido para "Negócios Ganhos" com confirmação humana real.',
            403,
        );
    }

    const note = await port.createConfirmationNote({
        organizationId: input.organizationId,
        leadId: input.leadId,
        authorUserId: input.actorUserId,
    });

    const result = evaluateDealClosure(
        {
            organizationId: input.organizationId,
            leadId: input.leadId,
            type: 'manual_crm_confirmation',
            evidenceRef: note.id,
            triggeredBy: input.actorUserId,
        },
        () => randomUUID(),
        new Date(),
    );

    if (!result.accepted || !result.event) {
        throw new AppError(
            `Fechamento de negócio recusado (${result.rejectedReason ?? 'motivo desconhecido'}) — um lead só é movido para "Negócios Ganhos" com confirmação humana real.`,
            403,
        );
    }

    await port.saveDealClosureEvent(result.event);
}
