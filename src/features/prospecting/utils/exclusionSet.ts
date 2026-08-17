function normalizeDomain(website: string | null | undefined): string | null {
    if (!website) return null;
    const trimmed = website.trim();
    if (!trimmed) return null;
    try {
        const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        const host = new URL(withProtocol).hostname.replace(/^www\./i, '').toLowerCase();
        return host || null;
    } catch {
        return null;
    }
}

function normalizeName(name: string): string {
    return name.trim().toLowerCase();
}

/**
 * Conjunto de empresas a excluir de uma descoberta (já cadastradas no CRM, já rejeitadas, ou já
 * escolhidas nesta mesma busca) — casa por domínio normalizado quando disponível, caindo para o
 * nome fantasia só quando nenhum dos dois lados tem site conhecido. Casar só por nome era frágil:
 * "JSL" e "JSL Logística S.A." nunca batiam como a mesma empresa, então uma empresa já salva no
 * CRM com o nome ligeiramente diferente do que a Apollo devolve continuava reaparecendo em buscas
 * futuras.
 */
export class ExclusionSet {
    private readonly domains = new Set<string>();
    private readonly names = new Set<string>();

    has(name: string, website?: string | null): boolean {
        const domain = normalizeDomain(website);
        if (domain && this.domains.has(domain)) return true;
        return this.names.has(normalizeName(name));
    }

    add(name: string, website?: string | null): void {
        const domain = normalizeDomain(website);
        if (domain) this.domains.add(domain);
        this.names.add(normalizeName(name));
    }

    get size(): number {
        return this.names.size;
    }
}
