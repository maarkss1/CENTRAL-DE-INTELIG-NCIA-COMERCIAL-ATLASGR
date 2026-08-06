import { checkEmailDeliverability } from '../email-verification.service';

function slugify(name: string): string {
    return (name || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/(ltda|me|eireli|s\/a|sa|epp)\b/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .join('');
}

export interface DomainGuess {
    domain: string;
    verified: boolean;
    emails: string[];
}

/**
 * Traduz a checagem de MX/disposable (`checkEmailDeliverability`) para o vocabulário já usado em
 * `Contact.emailStatus` ("verified"/"guessed"). Apollo/Hunter não garantem que o e-mail devolvido
 * realmente exista — hoje todo contato virava "guessed" sem checagem nenhuma; com MX real, um
 * e-mail sem domínio de e-mail válido vira "invalid" em vez de entrar como se fosse confiável.
 */
export async function resolveEmailStatus(email: string | null): Promise<string | null> {
    if (!email) return null;
    const result = await checkEmailDeliverability(email);
    if (result.status === 'verified') return 'verified';
    if (result.status === 'invalid') return 'invalid';
    return 'guessed';
}

/**
 * Números de celular brasileiros (DDD + 9 dígitos, começando com 9) normalmente têm WhatsApp —
 * heurística padrão de SDR, não uma verificação real. Não inventamos um número novo: só
 * reaproveitamos o mesmo telefone já coletado (Apollo/Hunter) quando o formato indica celular.
 */
export function guessWhatsappFromPhone(phone: string | null | undefined): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '').replace(/^55(?=\d{11}$)/, '');
    if (digits.length === 11 && digits[2] === '9') return phone;
    return null;
}

/** Extrai o hostname (sem "www.") de uma URL de site já conhecida — usado para preferir um domínio real a uma heurística. */
export function extractDomainFromWebsite(website?: string | null): string | null {
    if (!website) return null;
    try {
        const url = new URL(website.startsWith('http') ? website : `https://${website}`);
        return url.hostname.replace(/^www\./, '') || null;
    } catch {
        return null;
    }
}

/**
 * Heurística de descoberta de domínio/e-mail (SDR manual faz isso o tempo todo):
 * deriva um domínio provável a partir do nome e tenta uma verificação HTTP real.
 * Se o domínio responder, marcamos como "verificado"; caso contrário é só uma sugestão.
 */
export async function guessDomainAndEmails(companyName: string): Promise<DomainGuess> {
    const slug = slugify(companyName);
    const domain = slug ? `${slug}.com.br` : '';
    let verified = false;

    if (domain) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3500);
            const res = await fetch(`https://${domain}`, { method: 'HEAD', signal: controller.signal });
            clearTimeout(timeout);
            verified = res.ok || (res.status >= 300 && res.status < 500);
        } catch {
            verified = false;
        }
    }

    const emails = domain
        ? [`contato@${domain}`, `comercial@${domain}`, `atendimento@${domain}`]
        : [];

    return { domain, verified, emails };
}
