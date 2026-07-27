import { describe, expect, it } from 'vitest';
import {
    getPaidProspectingKey,
    getProspectingProviderMode,
} from '../../../src/config/prospecting-integrations';

describe('prospecting integrations', () => {
    it('defaults to free mode', () => {
        expect(getProspectingProviderMode({})).toBe('free');
    });

    it('blocks paid keys in free mode', () => {
        expect(
            getPaidProspectingKey('APOLLO_API_KEY', {
                PROSPECTING_PROVIDER_MODE: 'free',
                APOLLO_API_KEY: 'trial-key',
            })
        ).toBeUndefined();
    });

    it('returns configured keys only in hybrid mode', () => {
        expect(
            getPaidProspectingKey('APOLLO_API_KEY', {
                PROSPECTING_PROVIDER_MODE: 'hybrid',
                APOLLO_API_KEY: ' trial-key ',
            })
        ).toBe('trial-key');
    });
});
