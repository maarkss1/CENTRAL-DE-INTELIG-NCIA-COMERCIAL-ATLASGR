import { describe, expect, it } from 'vitest';

import { evaluateBudget, DOCUMENTED_LARGE_CHUNKS } from '../../scripts/ci/check-bundle-budget.mjs';

describe('bundle budget gate (ITEM-15)', () => {
  it('passes when total and every file stay within budget', () => {
    const assets = [
      { name: 'vendor-react-abc.js', rawBytes: 261_040, gzipBytes: 83_992 },
      { name: 'index-def.css', rawBytes: 256_176, gzipBytes: 31_345 },
    ];

    const result = evaluateBudget(assets, {
      maxTotalGzipBytes: 1_700_000,
      maxFileGzipBytes: 160 * 1024,
      documentedLargeChunks: DOCUMENTED_LARGE_CHUNKS,
    });

    expect(result.status).toBe('ok');
    expect(result.violations).toEqual([]);
    expect(result.totalGzipBytes).toBe(83_992 + 31_345);
  });

  it('fails when the aggregate gzip total exceeds the budget', () => {
    const assets = [
      { name: 'a.js', rawBytes: 100, gzipBytes: 600_000 },
      { name: 'b.js', rawBytes: 100, gzipBytes: 600_000 },
    ];

    const result = evaluateBudget(assets, { maxTotalGzipBytes: 1_000_000, maxFileGzipBytes: 700_000 });

    expect(result.status).toBe('fail');
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].type).toBe('total-budget');
  });

  it('fails when an undocumented chunk exceeds the generic per-file budget', () => {
    const assets = [{ name: 'some-new-heavy-feature-xyz.js', rawBytes: 900_000, gzipBytes: 300_000 }];

    const result = evaluateBudget(assets, { maxTotalGzipBytes: 10_000_000, maxFileGzipBytes: 160 * 1024 });

    expect(result.status).toBe('fail');
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].type).toBe('file-budget');
    expect(result.violations[0].file).toBe('some-new-heavy-feature-xyz.js');
  });

  it('lets a documented large chunk (e.g. exceljs) stay under its own, higher ceiling', () => {
    const assets = [{ name: 'exceljs.min-BPuRbAmC.js', rawBytes: 1_069_254, gzipBytes: 267_932 }];

    const result = evaluateBudget(assets, { maxTotalGzipBytes: 10_000_000, maxFileGzipBytes: 160 * 1024 });

    expect(result.status).toBe('ok');
  });

  it('still fails a documented large chunk if it grows past its own ceiling', () => {
    const assets = [{ name: 'exceljs.min-BPuRbAmC.js', rawBytes: 2_000_000, gzipBytes: 400_000 }];

    const result = evaluateBudget(assets, { maxTotalGzipBytes: 10_000_000, maxFileGzipBytes: 160 * 1024 });

    expect(result.status).toBe('fail');
    expect(result.violations[0].type).toBe('documented-chunk-budget');
  });

  it('every documented exception ships with a non-empty written justification', () => {
    for (const entry of DOCUMENTED_LARGE_CHUNKS) {
      expect(entry.reason).toBeTruthy();
      expect(entry.reason.length).toBeGreaterThan(10);
      expect(entry.maxGzipBytes).toBeGreaterThan(0);
    }
  });
});
