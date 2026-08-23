import { describe, expect, it } from 'vitest';

import { parseAuditReport } from '../../scripts/security/check-audit-waivers';

describe('security audit waiver gate', () => {
  it('fails closed when npm returns a registry error as JSON', () => {
    const registryFailure = JSON.stringify({
      error: {
        code: 'E403',
        summary: '403 Forbidden - POST https://registry.example.test/-/npm/v1/security/audits/quick',
      },
    });

    expect(() => parseAuditReport(registryFailure)).toThrow(/refusing to pass open/);
  });

  it('accepts the shape of a completed audit with no vulnerabilities', () => {
    const completedAudit = JSON.stringify({
      auditReportVersion: 2,
      vulnerabilities: {},
      metadata: { vulnerabilities: { high: 0, critical: 0 } },
    });

    expect(parseAuditReport(completedAudit).vulnerabilities).toEqual({});
  });
});
