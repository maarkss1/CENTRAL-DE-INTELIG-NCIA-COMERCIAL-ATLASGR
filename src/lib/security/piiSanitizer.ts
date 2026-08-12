/**
Helper para sanitização e mascaramento de PII (Dados Pessoais Identificáveis).
Atende aos requisitos de LGPD, prevenção de vazamentos e envio seguro para LLMs.
*/

/**
 * Mascara e-mails: "usuario@dominio.com" -> "u*****o@dominio.com"
 */
export function maskEmail(email: string | null | undefined): string {
    if (!email) return 'N/A';
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    if (local.length <= 2) return `${local[0]}***@${domain}`;
    return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

/**
 * Mascara telefones: "+5511999998888" -> "+55 11 *****-8888"
 */
export function maskPhone(phone: string | null | undefined): string {
    if (!phone) return 'N/A';
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8) return '****-****';
    const last4 = digits.slice(-4);
    return `***-***-${last4}`;
}

/**
 * Sanitiza um texto/prompt removendo ou mascarando PII antes de enviar para LLMs externos (Gemini/OpenAI/Bland).
 */
export function sanitizePromptForLLM(prompt: string): string {
    if (!prompt) return '';

    // Regex para e-mail
    let sanitized = prompt.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]');

    // Regex para telefones brasileiros (DD9XXXX-XXXX ou DDXXXX-XXXX ou com +55)
    sanitized = sanitized.replace(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\d{4}|\d{4})[-\s]?\d{4}/g, '[PHONE_REDACTED]');

    // Regex para CPF
    sanitized = sanitized.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[CPF_REDACTED]');

    return sanitized;
}
