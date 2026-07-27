export type ProspectingProviderMode = 'free' | 'hybrid';

type PaidProspectingKey =
    | 'APOLLO_API_KEY'
    | 'GOOGLE_MAPS_API_KEY'
    | 'HUNTER_API_KEY';

export function getProspectingProviderMode(
    environment: NodeJS.ProcessEnv = process.env
): ProspectingProviderMode {
    return environment.PROSPECTING_PROVIDER_MODE?.trim().toLowerCase() === 'hybrid'
        ? 'hybrid'
        : 'free';
}

/**
 * Paid providers are opt-in. A key alone is not enough to enable a billable
 * integration; PROSPECTING_PROVIDER_MODE must also be set to "hybrid".
 */
export function getPaidProspectingKey(
    name: PaidProspectingKey,
    environment: NodeJS.ProcessEnv = process.env
): string | undefined {
    if (getProspectingProviderMode(environment) !== 'hybrid') return undefined;
    const value = environment[name]?.trim();
    return value || undefined;
}

