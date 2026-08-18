import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const preload = resolve(process.cwd(), 'scripts/runtime-db-preload.mjs');

function runWithDatabaseUrl(databaseUrl: string): string {
  return execFileSync(
    process.execPath,
    ['--import', preload, '-e', 'process.stdout.write(process.env.DATABASE_URL ?? "")'],
    {
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

describe('runtime-db-preload', () => {
  it('troca somente 6543 por 5432 no Supavisor do Supabase', () => {
    const output = runWithDatabaseUrl(
      'postgresql://postgres.project:secret@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5',
    );

    expect(output).toBe(
      'postgresql://postgres.project:secret@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?pgbouncer=true&connection_limit=5',
    );
  });

  it('não altera uma conexão local ou de outro provedor', () => {
    const local = 'postgresql://postgres:postgres@localhost:5432/prospector';
    expect(runWithDatabaseUrl(local)).toBe(local);
  });

  it('preserva URL malformada para o driver reportar o erro original', () => {
    const malformed = 'not-a-postgres-url';
    expect(runWithDatabaseUrl(malformed)).toBe(malformed);
  });
});
