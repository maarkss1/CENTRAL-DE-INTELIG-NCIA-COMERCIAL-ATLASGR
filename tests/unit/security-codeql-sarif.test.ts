import { describe, expect, it } from 'vitest';

import { describeResult, findBlockingResults } from '../../scripts/security/check-codeql-sarif';

describe('CodeQL SARIF gate', () => {
    it('ignores warning/note level results (style, low-confidence)', () => {
        const sarif = {
            runs: [
                {
                    results: [
                        { level: 'warning', ruleId: 'js/unused-local-variable' },
                        { level: 'note', ruleId: 'js/useless-assignment-to-local' },
                    ],
                },
            ],
        };

        expect(findBlockingResults(sarif)).toEqual([]);
    });

    it('flags error-level results as blocking', () => {
        const sarif = {
            runs: [
                {
                    results: [
                        { level: 'warning', ruleId: 'js/unused-local-variable' },
                        {
                            level: 'error',
                            ruleId: 'js/sql-injection',
                            message: { text: 'This query depends on a user-provided value.' },
                            locations: [
                                {
                                    physicalLocation: {
                                        artifactLocation: { uri: 'src/routes/leads.ts' },
                                        region: { startLine: 42 },
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const blocking = findBlockingResults(sarif);
        expect(blocking).toHaveLength(1);
        expect(blocking[0].ruleId).toBe('js/sql-injection');
        expect(describeResult(blocking[0])).toContain('src/routes/leads.ts:42');
        expect(describeResult(blocking[0])).toContain('js/sql-injection');
    });

    it('handles multiple runs (one per CodeQL language in the same SARIF file)', () => {
        const sarif = {
            runs: [
                { results: [{ level: 'error', ruleId: 'py/sql-injection' }] },
                { results: [{ level: 'warning', ruleId: 'js/unused-local-variable' }] },
            ],
        };

        expect(findBlockingResults(sarif)).toHaveLength(1);
    });

    it('returns no blocking results when the SARIF has no runs/results', () => {
        expect(findBlockingResults({})).toEqual([]);
        expect(findBlockingResults({ runs: [] })).toEqual([]);
        expect(findBlockingResults({ runs: [{}] })).toEqual([]);
    });
});
