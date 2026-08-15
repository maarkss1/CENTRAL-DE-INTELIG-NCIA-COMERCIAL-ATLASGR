// Dedupe de contato por e-mail/telefone normalizado — requisito explícito da missão de
// Prospecção (AGENTS.md → "05 garante proveniência... e não enriquece além do estritamente
// necessário"; .agents/prompts/05-prospeccao.md → "Evitar criar múltiplos leads da mesma
// empresa/contato por... e-mail normalizado; telefone normalizado").
//
// Antes deste módulo, `runEnrichment` (enrichment.service.ts) inseria os decisores encontrados
// via Apollo/Hunter com `prisma.contact.createMany` sem checar se aquele contato já existia para
// a mesma empresa — um reenriquecimento (manual, ou após o cache de `enrichCompany` expirar)
// duplicava o mesmo decisor a cada execução. Puro e testável sem Prisma: o chamador busca os
// contatos já existentes no banco e passa aqui.

export interface ContactIdentity {
    email?: string | null;
    phone?: string | null;
}

/** E-mail normalizado para comparação de duplicidade: trim + lowercase. `null` quando vazio —
 * dois contatos sem e-mail nunca são considerados "o mesmo" só por isso. */
export function normalizeEmailForDedupe(email?: string | null): string | null {
    const trimmed = (email || '').trim().toLowerCase();
    return trimmed || null;
}

/** Telefone normalizado para comparação de duplicidade: só dígitos. Descarta números com menos de
 * 8 dígitos — curto demais para ser um telefone real, ruído se usado como chave de dedupe. */
export function normalizePhoneForDedupe(phone?: string | null): string | null {
    const digits = (phone || '').replace(/\D/g, '');
    return digits.length >= 8 ? digits : null;
}

/**
 * Remove de `candidates` quem já existe em `existing` por e-mail normalizado OU telefone
 * normalizado. Mantém a ordem original de `candidates`.
 */
export function filterNewContacts<T extends ContactIdentity>(candidates: T[], existing: ContactIdentity[]): T[] {
    const existingEmails = new Set(
        existing.map((c) => normalizeEmailForDedupe(c.email)).filter((v): v is string => v !== null)
    );
    const existingPhones = new Set(
        existing.map((c) => normalizePhoneForDedupe(c.phone)).filter((v): v is string => v !== null)
    );

    return candidates.filter((c) => {
        const email = normalizeEmailForDedupe(c.email);
        if (email && existingEmails.has(email)) return false;
        const phone = normalizePhoneForDedupe(c.phone);
        if (phone && existingPhones.has(phone)) return false;
        return true;
    });
}
