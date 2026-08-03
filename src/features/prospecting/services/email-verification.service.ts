import dns from 'node:dns/promises';
import disposableDomains from 'disposable-email-domains';
import { logger } from '../../../lib/logger';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPOSABLE_DOMAIN_SET = new Set(disposableDomains);

export type EmailDeliverabilityStatus = 'verified' | 'invalid' | 'unknown';

export interface EmailDeliverabilityResult {
    email: string;
    status: EmailDeliverabilityStatus;
    reason?: 'invalid_format' | 'disposable_domain' | 'no_mail_server' | 'check_failed';
}

/**
 * Checagem de entregabilidade sem handshake SMTP de propósito: a maioria dos provedores de nuvem
 * bloqueia saída na porta 25, o handshake é lento (segundos por e-mail) e não é confiável o
 * bastante pra decidir se um contato entra ou não no CRM. Em vez disso: formato + domínio
 * descartável (lista `disposable-email-domains`, mantida pela comunidade) + registro MX real via
 * DNS — o mesmo sinal que qualquer verificador comercial usa como primeira triagem.
 */
export async function checkEmailDeliverability(email: string): Promise<EmailDeliverabilityResult> {
    const trimmed = (email || '').trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmed)) {
        return { email: trimmed, status: 'invalid', reason: 'invalid_format' };
    }

    const domain = trimmed.split('@')[1];
    if (DISPOSABLE_DOMAIN_SET.has(domain)) {
        return { email: trimmed, status: 'invalid', reason: 'disposable_domain' };
    }

    try {
        const records = await dns.resolveMx(domain);
        if (!records.length) {
            return { email: trimmed, status: 'invalid', reason: 'no_mail_server' };
        }
        return { email: trimmed, status: 'verified' };
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        // ENOTFOUND/ENODATA = o domínio realmente não tem MX (sinal real). Qualquer outro erro
        // (timeout de DNS, rede instável) não é culpa do e-mail — não penalizamos o contato por
        // uma falha da nossa própria infraestrutura.
        if (code === 'ENOTFOUND' || code === 'ENODATA') {
            return { email: trimmed, status: 'invalid', reason: 'no_mail_server' };
        }
        logger.warn({ err: error, domain }, 'Email MX check inconclusive');
        return { email: trimmed, status: 'unknown', reason: 'check_failed' };
    }
}
