import { logger } from '../../../lib/logger.js';
import {
    anyRecordBlocksChannel,
    hasAnyIdentifier,
    normalizeOptOutSubject,
    type CadenceChannel,
    type OptOutRecord,
    type OptOutRepository,
    type OptOutSubject,
    type RecordOptOutInput,
} from '../domain/optOut.js';

/**
 * Camada de aplicação do opt-out unificado: orquestra a porta `OptOutRepository` em cima das
 * regras puras de `domain/optOut.ts`. Nenhuma função aqui assume qual adaptador (memória, Prisma)
 * está por trás — é isso que permite os canais (05/06/12) chamarem exatamente esta API assim que
 * o adaptador Prisma real existir (ver `17-para-05-06-12-contrato-optout.md`).
 */

/** Lançado por `assertNotOptedOut` — o chamador decide como tratar (registrar tentativa 'skipped', nunca lançar direto ao usuário). */
export class OptOutBlockedError extends Error {
    constructor(public readonly channel: CadenceChannel) {
        super(`Contato bloqueado por opt-out no canal '${channel}'.`);
        this.name = 'OptOutBlockedError';
    }
}

/**
 * Registra um pedido de opt-out. Devolve `null` (em vez de lançar) quando o sujeito não tem
 * nenhum identificador aproveitável — mesma disciplina de `recordOptOut` em
 * `callSuppression.service.ts`: melhor logar e não gravar do que gravar um registro inerte que
 * nunca vai casar com nada.
 */
export async function recordOptOut(repo: OptOutRepository, input: RecordOptOutInput): Promise<OptOutRecord | null> {
    const normalized = normalizeOptOutSubject(input.subject);
    if (!hasAnyIdentifier(normalized)) {
        logger.warn(
            { organizationId: input.organizationId, originChannel: input.originChannel },
            'Pedido de opt-out sem identificador aproveitável (sem leadId, e-mail ou telefone válido) — nada foi bloqueado.',
        );
        return null;
    }

    const record = await repo.create({
        organizationId: input.organizationId,
        scope: input.scope,
        leadId: normalized.leadId,
        email: normalized.email,
        phoneE164: normalized.phoneE164,
        originChannel: input.originChannel,
        reason: input.reason ?? null,
        evidence: input.evidence ?? null,
        requestedBy: input.requestedBy ?? null,
    });

    logger.info(
        {
            organizationId: input.organizationId,
            scope: input.scope,
            originChannel: input.originChannel,
            leadId: normalized.leadId,
            // Nunca logar e-mail/telefone completos em texto puro (mesma disciplina de PII de cold-email.service.ts).
            hasEmail: normalized.email !== null,
            hasPhone: normalized.phoneE164 !== null,
        },
        'Opt-out registrado.',
    );

    return record;
}

/**
 * Consulta obrigatória antes de qualquer disparo, nos três canais. Um sujeito sem identificador
 * algum nunca está bloqueado (não há o que consultar) — mas também nunca deveria chegar aqui: o
 * canal chamador já precisaria de pelo menos um identificador para saber para quem enviar.
 */
export async function isOptedOut(
    repo: OptOutRepository,
    organizationId: string,
    subject: OptOutSubject,
    channel: CadenceChannel,
): Promise<boolean> {
    const normalized = normalizeOptOutSubject(subject);
    if (!hasAnyIdentifier(normalized)) return false;

    const matches = await repo.findMatches(organizationId, normalized);
    return anyRecordBlocksChannel(matches, channel);
}

/** Mesma checagem de `isOptedOut`, mas lança em vez de devolver booleano — para caminhos que preferem short-circuit por exceção. */
export async function assertNotOptedOut(
    repo: OptOutRepository,
    organizationId: string,
    subject: OptOutSubject,
    channel: CadenceChannel,
): Promise<void> {
    if (await isOptedOut(repo, organizationId, subject, channel)) {
        throw new OptOutBlockedError(channel);
    }
}

export { normalizeOptOutSubject };
export type { CadenceChannel, OptOutRecord, OptOutRepository, OptOutSubject };
