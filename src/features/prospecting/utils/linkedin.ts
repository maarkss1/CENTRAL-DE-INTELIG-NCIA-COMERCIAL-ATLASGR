interface DecisionMakerLinkedInInput {
    name: string;
    title?: string | null;
    companyName: string;
    linkedinUrl?: string | null;
}

export interface DecisionMakerLinkedInLink {
    href: string;
    isDirectProfile: boolean;
}

function normalizeLinkedInProfileUrl(value?: string | null): string {
    const input = value?.trim();
    if (!input) return '';

    try {
        const url = new URL(input.includes('://') ? input : `https://${input}`);
        const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
        const isLinkedIn = hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com');

        if (!isLinkedIn || !url.pathname.toLowerCase().startsWith('/in/')) return '';

        url.protocol = 'https:';
        url.username = '';
        url.password = '';
        url.hash = '';
        return url.toString();
    } catch {
        return '';
    }
}

export function getDecisionMakerLinkedInLink({
    name,
    title,
    companyName,
    linkedinUrl,
}: DecisionMakerLinkedInInput): DecisionMakerLinkedInLink {
    const directProfile = normalizeLinkedInProfileUrl(linkedinUrl);
    if (directProfile) {
        return { href: directProfile, isDirectProfile: true };
    }

    const keywords = [name, title, companyName]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(' ');

    return {
        href: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`,
        isDirectProfile: false,
    };
}
