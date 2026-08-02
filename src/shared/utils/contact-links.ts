function phoneDigits(value?: string | null): string {
    return value?.replace(/\D/g, '').replace(/^00/, '') || '';
}

function internationalPhoneDigits(value?: string | null): string {
    const digits = phoneDigits(value);
    if (!digits) return '';

    if (value?.trim().startsWith('+')) return digits;
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    return digits;
}

export function getTelephoneLink(value?: string | null): string {
    const digits = internationalPhoneDigits(value);
    return digits.length >= 10 && digits.length <= 15 ? `tel:+${digits}` : '';
}

export function getWhatsAppLink(value?: string | null): string {
    const digits = internationalPhoneDigits(value);
    return digits.length >= 10 && digits.length <= 15 ? `https://wa.me/${digits}` : '';
}

export function validContactEmails(values?: Array<string | null | undefined> | null): string[] {
    return Array.from(new Set(
        (values || [])
            .map((email) => email?.trim().toLowerCase() || '')
            .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    ));
}

export function validContactPhones(values?: Array<string | null | undefined> | null): string[] {
    return Array.from(new Set(
        (values || [])
            .map((phone) => phone?.trim() || '')
            .filter((phone) => !!getTelephoneLink(phone))
    ));
}
