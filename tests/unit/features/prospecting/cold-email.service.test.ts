import { describe, it, expect, vi } from 'vitest';
import { sendColdEmail } from '../../../../src/features/prospecting/services/cold-email.service';

describe('Cold Email Service', () => {
    it('should fail if missing required fields', async () => {
        const result = await sendColdEmail({} as any);
        expect(result).toBe(false);
    });

    it('should fail if LGPD compliance fields are missing', async () => {
        const result = await sendColdEmail({
            id: '1',
            targetEmail: 'test@example.com',
            subject: 'Test',
            body: 'Hello',
            status: 'draft',
            legalBasis: '',
            dataSource: ''
        } as any);
        expect(result).toBe(false);
    });

    it('should succeed if all fields and LGPD compliance are provided', async () => {
        const result = await sendColdEmail({
            id: '1',
            targetEmail: 'test@example.com',
            subject: 'Test',
            body: 'Hello',
            status: 'draft',
            legalBasis: 'legitimate_interest',
            dataSource: 'apollo'
        });
        expect(result).toBe(true);
    });
});
