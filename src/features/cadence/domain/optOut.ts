import { toE164BR } from '../../../lib/phone.js';

/**
 * Registro único de opt-out — protege os três canais de contato externo (e-mail, WhatsApp, voz)
 * a partir de um único pedido, em vez do que existe hoje (`CallSuppression`, só válido para voz).
 *
 * Entrega 1 do Agente 17 (`.agents/prompts/17-cadencia-ciclo-receita.md`): "a mentira mais
 * provável do seu domínio" é uma cadência que continua disparando depois de um opt-out feito em
 * outro canal — por isso este módulo é lógica de domínio pura, sem I/O, para poder ser testada
 * exaustivamente e composta por qualquer canal sem depender de rede/banco.
 *
 * Adaptador real (Prisma, tabela `OptOutRecord`) depende do schema proposto em
 * `.agents/handoffs/onda-7/17-para-01-schema-cadencia-optout-proposta.md`, ainda não aplicado —
 * até lá, `InMemoryOptOutRepository` (ver `../infra/InMemoryOptOutRepository.ts`) é a única
 * implementação real da porta `OptOutRepository` abaixo, usada nos testes deste módulo.
 */

/** Canal de contato externo real — os três que este produto dispara hoje ou vai disparar. */
export type CadenceChannel = 'email' | 'whatsapp' | 'voice';

/**
 * Escopo do bloqueio: um canal específico ("não me liga mais, pode mandar e-mail") ou `global`
 * ("não me contate por nada"). `global` é a interpretação correta por padrão sempre que o pedido
 * do lead não restringir explicitamente a um canal — ver `interpretOptOutScope` mais abaixo.
 */
export type OptOutScope = CadenceChannel | 'global';

/** Canal por onde o pedido de opt-out chegou — não é o mesmo que o escopo do bloqueio. */
export type OptOutOriginChannel = CadenceChannel | 'manual' | 'import';

/**
 * O que identifica quem está pedindo o opt-out, do ponto de vista de quem está prestes a
 * disparar uma mensagem. Um canal pode conhecer só um destes três campos (ex.: um webhook de
 * descadastro de e-mail só tem o endereço) — por isso todos são opcionais, mas pelo menos um é
 * obrigatório (ver `normalizeOptOutSubject`).
 */
export interface OptOutSubject {
    leadId?: string | null;
    email?: string | null;
    phoneE164?: string | null;
}

/** Forma normalizada de `OptOutSubject`, já sem nenhum identificador vazio/inválido. */
export interface NormalizedOptOutSubject {
    leadId: string | null;
    email: string | null;
    phoneE164: string | null;
}

export interface RecordOptOutInput {
    organizationId: string;
    scope: OptOutScope;
    subject: OptOutSubject;
    originChannel: OptOutOriginChannel;
    reason?: string | null;
    /** Trecho real do pedido (transcrição, mensagem) — nunca inferência, mesma disciplina de evidência de `CallSuppression`. */
    evidence?: string | null;
    /** userId de quem registrou manualmente, quando aplicável. */
    requestedBy?: string | null;
}

export interface OptOutRecord {
    id: string;
    organizationId: string;
    scope: OptOutScope;
    leadId: string | null;
    email: string | null;
    phoneE164: string | null;
    originChannel: OptOutOriginChannel;
    reason: string | null;
    evidence: string | null;
    requestedBy: string | null;
    createdAt: Date;
}

/** E-mail normalizado (minúsculo, sem espaço nas pontas) — mesma chave de comparação sempre. */
function normalizeEmail(email: string | null | undefined): string | null {
    if (!email) return null;
    const trimmed = email.trim().toLowerCase();
    return trimmed.length > 0 && trimmed.includes('@') ? trimmed : null;
}

/**
 * Normaliza um sujeito de opt-out: telefone vira E.164 (mesma função usada pela supressão de
 * voz, `toE164BR`), e-mail vira minúsculo/trim, leadId passa direto. Identificadores que não
 * normalizam (telefone implausível, e-mail sem `@`) somem — melhor não bloquear por um dado
 * inválido do que criar um registro que nunca vai casar com nada.
 */
export function normalizeOptOutSubject(subject: OptOutSubject): NormalizedOptOutSubject {
    return {
        leadId: subject.leadId?.trim() || null,
        email: normalizeEmail(subject.email),
        phoneE164: toE164BR(subject.phoneE164 ?? undefined),
    };
}

/** Um sujeito sem nenhum identificador válido não é bloqueável nem consultável — não há o que gravar/comparar. */
export function hasAnyIdentifier(subject: NormalizedOptOutSubject): boolean {
    return subject.leadId !== null || subject.email !== null || subject.phoneE164 !== null;
}

/**
 * Um registro "casa" com um sujeito de consulta quando compartilham QUALQUER identificador não
 * nulo — é assim que um opt-out registrado por telefone (voz/WhatsApp) bloqueia e-mail do mesmo
 * lead sem exigir uma tabela de resolução de identidade separada: o chamador (contrato em
 * `17-para-05-06-12-contrato-optout.md`) já passa leadId + email + phoneE164 quando os tiver.
 */
export function subjectsMatch(record: NormalizedOptOutSubject, query: NormalizedOptOutSubject): boolean {
    if (record.leadId !== null && record.leadId === query.leadId) return true;
    if (record.email !== null && record.email === query.email) return true;
    if (record.phoneE164 !== null && record.phoneE164 === query.phoneE164) return true;
    return false;
}

/** Se um registro de opt-out bloqueia especificamente este canal (o registro casou; falta checar o escopo). */
export function scopeBlocksChannel(scope: OptOutScope, channel: CadenceChannel): boolean {
    return scope === 'global' || scope === channel;
}

/**
 * Decide se, entre vários registros já casados por identificador, algum bloqueia o canal
 * consultado. Separado de `isOptedOut` (que também faz I/O via repositório) para ser testável
 * sem depender de nenhuma implementação de porta.
 */
export function anyRecordBlocksChannel(records: OptOutRecord[], channel: CadenceChannel): boolean {
    return records.some((r) => scopeBlocksChannel(r.scope, channel));
}

/**
 * Porta que qualquer canal real (e-mail/05, WhatsApp/06, voz/12) implementa para persistir e
 * consultar opt-outs. `InMemoryOptOutRepository` é a implementação de referência/teste; o
 * adaptador Prisma real é responsabilidade de quem aplicar o schema proposto.
 */
export interface OptOutRepository {
    create(record: Omit<OptOutRecord, 'id' | 'createdAt'>): Promise<OptOutRecord>;
    /** Registros da organização que casam com QUALQUER identificador não nulo do sujeito consultado. */
    findMatches(organizationId: string, subject: NormalizedOptOutSubject): Promise<OptOutRecord[]>;
    list(organizationId: string, limit?: number): Promise<OptOutRecord[]>;
}
