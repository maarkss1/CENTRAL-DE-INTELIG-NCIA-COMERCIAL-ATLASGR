/**
 * Entrega 5 (parte 2) — fechamento determinístico. Substitui a proibição absoluta descrita em
 * `AUTONOMIA_COMERCIAL_24X7.md` → "Critério honesto de Closer autônomo" ("a transição para
 * Negócios Ganhos não deve ser decidida por texto gerado") por um caminho legítimo: um
 * `DealClosureEvent` de um tipo fechado e com evidência real é o único jeito de mover um Lead
 * para `Negocios_Ganhos`.
 *
 * Contrato acordado com o Agente 13 (dono dos guardrails do enxame nesta onda) em
 * `.agents/handoffs/onda-7/17-para-13-evento-fechamento.md`. Os três tipos abaixo são o mínimo
 * necessário para a entrega 5 do meu prompt — não uma lista fechada por princípio; ajustável se o
 * 13 responder pedindo um quarto tipo.
 */

export type DealClosureEventType = 'signature_completed' | 'payment_confirmed' | 'manual_crm_confirmation';

const VALID_TYPES = new Set<DealClosureEventType>(['signature_completed', 'payment_confirmed', 'manual_crm_confirmation']);

/** Marcadores que só existem para o teste provar que texto gerado por modelo nunca passa por aqui — nunca devem aparecer num evento real. */
const FORBIDDEN_TYPE_MARKERS = new Set(['ai_inferred', 'ai_judgment', 'model_decision', 'assumed_won']);

export interface DealClosureEventInput {
    organizationId: string;
    leadId: string;
    type: DealClosureEventType | string;
    /** Id de outro registro real que prova o evento (id de CrmDocumentSignatureRequest, id de transação de pagamento, id de Activity/Note de confirmação manual). Nunca um resumo/texto gerado. */
    evidenceRef: string;
    /** userId de quem confirmou manualmente, ou 'webhook:<provider>' quando automático — nunca um agente de IA. */
    triggeredBy: string;
}

/**
 * Único portão que decide se um evento é aceito como fechamento determinístico. `false` significa
 * "não mova o Lead" — o chamador deve tratar isso como rejeição silenciosa segura, nunca como
 * "deu erro, mas prossiga mesmo assim".
 */
export function isDeterministicCloseEvent(event: DealClosureEventInput): boolean {
    if (FORBIDDEN_TYPE_MARKERS.has(event.type)) return false;
    if (!VALID_TYPES.has(event.type as DealClosureEventType)) return false;
    if (!event.evidenceRef || !event.evidenceRef.trim()) return false;
    if (!event.triggeredBy || !event.triggeredBy.trim()) return false;
    // O Closer (agente de IA) nunca é um triggeredBy válido — fechamento sempre vem de um humano
    // (userId) ou de um webhook de provedor real, nunca do próprio enxame se autodeclarando.
    if (/^(ai|agent|swarm|closer|bot)[:_-]/i.test(event.triggeredBy.trim())) return false;
    return true;
}

export interface DealClosureEvent extends DealClosureEventInput {
    id: string;
    type: DealClosureEventType;
    occurredAt: Date;
}

export interface DealClosureResult {
    accepted: boolean;
    event: DealClosureEvent | null;
    /** Quando `accepted` é `false`, explica por que — para log/observabilidade, nunca para decidir mover o Lead mesmo assim. */
    rejectedReason: 'invalid-type' | 'missing-evidence' | 'untrusted-trigger' | null;
}

function rejectionReason(event: DealClosureEventInput): DealClosureResult['rejectedReason'] {
    if (!event.evidenceRef || !event.evidenceRef.trim()) return 'missing-evidence';
    if (!event.triggeredBy || !event.triggeredBy.trim() || /^(ai|agent|swarm|closer|bot)[:_-]/i.test(event.triggeredBy.trim())) {
        return 'untrusted-trigger';
    }
    return 'invalid-type';
}

/**
 * Cria o evento de fechamento se (e somente se) `isDeterministicCloseEvent` aprovar. A criação do
 * evento é o gatilho para o serviço de aplicação mover `Lead.status` para `Negocios_Ganhos` — esse
 * lado (escrita real no Lead) fica fora deste módulo de propósito, coordenado com o 04
 * (`src/features/crm/**`), já que `Lead` não é meu arquivo.
 */
export function evaluateDealClosure(
    event: DealClosureEventInput,
    idFactory: () => string,
    now: Date,
): DealClosureResult {
    if (!isDeterministicCloseEvent(event)) {
        return { accepted: false, event: null, rejectedReason: rejectionReason(event) };
    }
    return {
        accepted: true,
        event: { ...event, type: event.type as DealClosureEventType, id: idFactory(), occurredAt: now },
        rejectedReason: null,
    };
}
