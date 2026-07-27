export function parseAllowedOrigins(value?: string): string[] {
    return Array.from(
        new Set(
            (value || '')
                .split(',')
                .map((origin) => origin.trim().replace(/\/$/, ''))
                .filter(Boolean)
        )
    );
}

export function isOriginAllowed(
    origin: string | undefined,
    allowedOrigins: readonly string[]
): boolean {
    if (!origin) return true;
    return allowedOrigins.includes(origin.replace(/\/$/, ''));
}

