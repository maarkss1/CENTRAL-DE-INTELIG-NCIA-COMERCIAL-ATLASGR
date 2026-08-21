import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';

// RUN-002e (Sprint 02/Onda 14): o boot do processo worker dedicado (worker.ts) precisa falhar
// VISIVELMENTE (crash, exit code != 0) quando uma dependência obrigatória (Redis/DB) não está
// disponível — nunca degradar silenciosamente. `worker.ts` não é testável por import direto (é um
// script de bootstrap sem exports, ver `startWorkerProcess().catch(...)` no fim do arquivo) — a
// única forma real de provar esse comportamento é rodar o processo de verdade e observar o exit
// code, exatamente como o Render/qualquer orquestrador de produção observaria.
//
// Timeout generoso (spawn de processo real via tsx + falha rápida esperada de conexão) — não
// precisa de Postgres real rodando para este teste específico: a falha de Redis deve ocorrer
// antes mesmo de qualquer tentativa de conexão ao Postgres (`worker.ts`: `await pingRedis(...)`
// vem antes de `await prisma.$queryRaw`).

const REPO_ROOT = path.resolve(__dirname, '../..');

function runWorkerProcess(env: NodeJS.ProcessEnv): Promise<{ code: number | null; stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', 'worker.ts'], {
      cwd: REPO_ROOT,
      env,
      shell: process.platform === 'win32',
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`worker.ts não saiu sozinho dentro do timeout — stdout:\n${stdout}\n\nstderr:\n${stderr}`));
    }, 30_000);

    child.on('exit', (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

describe('RUN-002e — worker.ts falha visivelmente sem dependência obrigatória (processo real)', () => {
  it('sai com código != 0 quando REDIS_URL aponta para uma porta sem ninguém escutando', async () => {
    const { code, stdout, stderr } = await runWorkerProcess({
      ...process.env,
      NODE_ENV: 'test',
      ENABLE_QUEUES: 'true',
      // Porta alta improvável de ter algo real escutando neste ambiente de teste.
      REDIS_URL: 'redis://127.0.0.1:18379',
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://invalid:invalid@127.0.0.1:1/invalid',
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? 'test-secret-not-for-production-000000',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    });

    expect(code).not.toBe(0);
    expect(code).not.toBeNull();
    // Não deve ser um crash silencioso — precisa haver algum indício textual do motivo real.
    expect((stdout + stderr).toLowerCase()).toMatch(/redis|econnrefused|worker dedicado/);
  }, 35_000);

  it('sai com código != 0 quando ENABLE_QUEUES não está habilitado (worker dedicado sem filas não faz sentido)', async () => {
    const { code, stdout, stderr } = await runWorkerProcess({
      ...process.env,
      NODE_ENV: 'test',
      ENABLE_QUEUES: 'false',
      REDIS_URL: 'redis://127.0.0.1:18379',
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://invalid:invalid@127.0.0.1:1/invalid',
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? 'test-secret-not-for-production-000000',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    });

    expect(code).not.toBe(0);
    expect(code).not.toBeNull();
    expect((stdout + stderr).toLowerCase()).toMatch(/enable_queues|worker dedicado/);
  }, 25_000);
});
