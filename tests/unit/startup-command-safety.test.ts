import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type PackageManifest = {
  scripts?: Record<string, string>;
};

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
) as PackageManifest;

describe('production startup command safety', () => {
  it('starts only the built application server', () => {
    expect(manifest.scripts?.start).toBe('node dist/server.cjs');
    expect(manifest.scripts?.start).not.toContain('emergency-reset');
  });

  it('keeps the global password reset behind an explicit command', () => {
    expect(manifest.scripts?.['auth:emergency-reset']).toBe(
      'tsx scripts/emergency-reset-all-passwords.ts',
    );
  });
});
