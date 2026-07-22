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
