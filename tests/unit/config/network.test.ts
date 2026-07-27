import { describe, expect, it } from 'vitest';
import { isOriginAllowed, parseAllowedOrigins } from '../../../src/config/network';

describe('network configuration', () => {
    it('normalizes and deduplicates configured origins', () => {
        expect(
            parseAllowedOrigins(
                'http://localhost:3000/, http://192.168.60.217:3000, http://localhost:3000'
            )
        ).toEqual([
            'http://localhost:3000',
            'http://192.168.60.217:3000',
        ]);
    });

    it('allows non-browser requests and exact configured origins', () => {
        const allowed = ['http://192.168.60.217:3000'];
        expect(isOriginAllowed(undefined, allowed)).toBe(true);
        expect(isOriginAllowed('http://192.168.60.217:3000/', allowed)).toBe(true);
    });

    it('rejects origins outside the allowlist', () => {
        expect(
            isOriginAllowed('https://untrusted.example', ['http://localhost:3000'])
        ).toBe(false);
    });
});
