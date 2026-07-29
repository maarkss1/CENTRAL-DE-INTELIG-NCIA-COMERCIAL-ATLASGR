const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export function normalizeCompanyDomain(value?: string | null): string {
    const input = value?.trim();
    if (!input || input.length > 2_048) return '';

    try {
        const parsed = new URL(input.includes('://') ? input : `https://${input}`);
        if (parsed.username || parsed.password) return '';

        const hostname = parsed.hostname
            .toLowerCase()
            .replace(/^www\./, '')
            .replace(/\.$/, '');
        const labels = hostname.split('.');

        if (hostname.length > 253 || labels.length < 2) return '';
        if (!labels.every((label) => DOMAIN_LABEL_PATTERN.test(label))) return '';

        return hostname;
    } catch {
        return '';
    }
}

export function findCompanyDomain(website?: string | null, rationale?: string | null): string {
    const websiteDomain = normalizeCompanyDomain(website);
    if (websiteDomain) return websiteDomain;

    const rationaleMatch = rationale?.match(/dom(?:í|i)nio:\s*([a-z0-9.-]+\.[a-z]{2,})/i);
    return normalizeCompanyDomain(rationaleMatch?.[1]);
}
