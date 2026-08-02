/**
 * Números de celular brasileiros (DDD + 9 dígitos, começando com 9) normalmente têm WhatsApp —
 * heurística padrão de SDR, não uma verificação real. Devolve o primeiro telefone já coletado que
 * bate com esse formato (nunca inventa um número novo) para montar um link direto de WhatsApp.
 */
export function findLikelyWhatsapp(phones: string[] | undefined | null): string | null {
    for (const phone of phones || []) {
        const digits = phone.replace(/\D/g, '').replace(/^55(?=\d{11}$)/, '');
        if (digits.length === 11 && digits[2] === '9') return phone;
    }
    return null;
}

/** Monta o link wa.me a partir de um telefone brasileiro já no formato de celular. */
export function whatsappLink(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
    return `https://wa.me/${withCountry}`;
}

/**
 * Converte um telefone brasileiro para E.164 (`+5511999998888`), formato exigido por qualquer
 * discador. Devolve `null` quando o número não tem tamanho plausível — melhor não ligar do que
 * ligar para um número inventado a partir de um cadastro incompleto.
 *
 * O guarda de comprimento é o que desfaz a ambiguidade do DDD 55 (Santa Maria/RS): `5532165498`
 * tem 10 dígitos, então é DDD 55 + número local, e não código do país + número de 8 dígitos.
 */
export function toE164BR(phone: string | null | undefined): string | null {
    if (!phone) return null;

    // O prefixo de discagem interurbana (0xx) não faz parte do número.
    const digits = phone.replace(/\D/g, '').replace(/^0+/, '');

    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
        return `+${digits}`;
    }
    // 10 dígitos = fixo (DDD + 8), 11 = celular (DDD + 9).
    if (digits.length === 10 || digits.length === 11) {
        return `+55${digits}`;
    }
    return null;
}
