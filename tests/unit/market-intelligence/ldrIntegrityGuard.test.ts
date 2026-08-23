import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const guardScript = resolve(process.cwd(), 'scripts/security/check-ldr-integrity.mjs');
const tempRoots: string[] = [];

function makeFixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'ldr-integrity-'));
  tempRoots.push(root);

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(root, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, 'utf8');
  }

  return root;
}

function runGuard(root: string) {
  return spawnSync(process.execPath, [guardScript, '--root', root], {
    encoding: 'utf8',
  });
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('LDR integrity guard', () => {
  it('aceita fatos rastreáveis, responsável dinâmico e status não executado', () => {
    const root = makeFixture({
      'src/features/market-intelligence/server/safe.service.ts': `
        const evidence = { evidenceType: 'FACT', source: providerName };
        const task = { RESPONSIBLE_ID: currentUser.bitrixUserId };
        const recommendation = { status: 'Pending' };
      `,
    });

    const result = runGuard(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('LDR integrity guard: OK');
  });

  it('bloqueia FACT criado perto de mock, fake ou aleatoriedade', () => {
    const root = makeFixture({
      'src/lib/queue/newsMonitor.worker.ts': `
        const mockNews = ['Empresa anuncia investimento fictício'];
        const selected = mockNews[Math.floor(Math.random() * mockNews.length)];
        await prisma.accountSignal.create({ data: { description: selected, evidenceType: 'FACT' } });
      `,
    });

    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('LDR_FACT_FROM_SYNTHETIC_SOURCE');
  });

  it('bloqueia RESPONSIBLE_ID numérico no caminho do LDR', () => {
    const root = makeFixture({
      'src/features/market-intelligence/server/action.service.ts': `
        await callBitrix(url, 'tasks.task.add', { fields: { RESPONSIBLE_ID: 1 } });
      `,
    });

    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('LDR_HARDCODED_BITRIX_RESPONSIBLE');
  });

  it('bloqueia transição direta para Executed', () => {
    const root = makeFixture({
      'src/features/market-intelligence/server/action.service.ts': `
        await prisma.accountRecommendation.update({ data: { status: 'Executed' } });
      `,
    });

    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('LDR_DIRECT_EXECUTED_STATUS');
  });

  it('permite a transição direta para Executed só no executor validado (grava externalRef)', () => {
    const root = makeFixture({
      'src/features/market-intelligence/server/actionExecutor.service.ts': `
        await prisma.accountRecommendation.update({ data: { status: 'Executed', externalRef: taskId } });
      `,
    });

    const result = runGuard(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('LDR integrity guard: OK');
  });

  it('bloqueia AccountScore persistido com dimensão hardcoded', () => {
    const root = makeFixture({
      'src/features/market-intelligence/server/score.service.ts': `
        await prisma.accountScore.create({
          data: { companyId, total: 85, fit, timing, intent, relationship }
        });
      `,
    });

    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('LDR_HARDCODED_ACCOUNT_SCORE');
  });

  it('bloqueia retorno do append.cjs obsoleto', () => {
    const root = makeFixture({
      'append.cjs': `require('fs').appendFileSync('prisma/schema.prisma', 'model AccountScore {}');`,
    });

    const result = runGuard(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('LDR_OBSOLETE_SCHEMA_APPENDER');
  });

  it('aprova o estado atual do repositório', () => {
    const result = runGuard(process.cwd());
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('LDR integrity guard: OK');
  });
});
