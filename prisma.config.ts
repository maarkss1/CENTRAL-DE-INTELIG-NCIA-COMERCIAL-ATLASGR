import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { defineConfig } from '@prisma/config';

const LOCAL_FALLBACK_URL = 'postgresql://postgres:postgres@localhost:5432/prospector';
const RENDER_RECOVERY_MIGRATION = '20260808183000_crm_suite_parity';

/**
 * Resolve a connection suitable for Prisma CLI operations such as `migrate deploy`.
 *
 * Runtime traffic may legitimately use Supabase Supavisor transaction mode (:6543),
 * but migrations need a session-stable connection. DIRECT_URL remains the explicit
 * override. When it is absent and DATABASE_URL points at the shared Supabase pooler
 * on :6543, use the equivalent session-pooler endpoint on :5432 automatically.
 *
 * Only the port changes. Credentials, project-ref username, database and query params
 * are preserved and are never logged.
 */
function resolvePrismaCliUrl(): string {
  const directUrl = process.env.DIRECT_URL?.trim();
  if (directUrl) return directUrl;

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return LOCAL_FALLBACK_URL;

  try {
    const parsed = new URL(databaseUrl);
    const isSupabaseTransactionPooler =
      parsed.hostname.endsWith('.pooler.supabase.com') && parsed.port === '6543';

    if (isSupabaseTransactionPooler) {
      parsed.port = '5432';
      console.warn(
        '[prisma.config] Supabase transaction pooler (:6543) detected; Prisma CLI will use session pooler (:5432). Set DIRECT_URL to override.',
      );
      return parsed.toString();
    }
  } catch {
    // Preserve the original value so Prisma can report the malformed URL with its
    // normal datasource validation instead of masking it here.
  }

  return databaseUrl;
}

/**
 * Temporary one-shot recovery hook for one known failed Render production migration.
 *
 * Production contains part of this migration's end-state, but Prisma recorded P3018
 * when the original non-idempotent SQL collided with an existing object. The migration
 * SQL is now safe to re-run, so the supported recovery is to mark only this exact
 * failed attempt as rolled back and let the parent `migrate deploy` apply it again.
 *
 * This runs only on Render and only while the parent command is `prisma migrate deploy`.
 * The child receives PRISMA_RENDER_RECOVERY_CHILD=1 to prevent recursion. Once production
 * migrations are healthy, this temporary hook is removed in a cleanup commit.
 */
function recoverFailedRenderMigrationOnce(): void {
  const isRender = process.env.RENDER === 'true';
  const isChild = process.env.PRISMA_RENDER_RECOVERY_CHILD === '1';
  const isMigrateDeploy = process.argv.includes('migrate') && process.argv.includes('deploy');

  if (!isRender || isChild || !isMigrateDeploy) return;

  console.warn(
    `[prisma.config] Attempting one-time recovery of failed migration ${RENDER_RECOVERY_MIGRATION}.`,
  );

  const result = spawnSync(
    'npx',
    ['prisma', 'migrate', 'resolve', '--rolled-back', RENDER_RECOVERY_MIGRATION],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        PRISMA_RENDER_RECOVERY_CHILD: '1',
      },
    },
  );

  if (result.error) {
    console.warn(
      `[prisma.config] Could not launch one-time migration recovery: ${result.error.message}. Parent migrate deploy will report the database state.`,
    );
    return;
  }

  if (result.status === 0) {
    console.warn(
      `[prisma.config] Failed migration ${RENDER_RECOVERY_MIGRATION} marked rolled back; parent migrate deploy will reapply the idempotent SQL.`,
    );
    return;
  }

  console.warn(
    `[prisma.config] One-time migration recovery exited with status ${result.status ?? 'unknown'}; parent migrate deploy will continue and report the database state.`,
  );
}

recoverFailedRenderMigrationOnce();

// O Prisma CLI (migrate/generate) usa só este `url`, nunca o Pool/adapter de src/lib/prisma.ts.
// DIRECT_URL é sempre preferida. Em Render/Supabase, se DATABASE_URL vier por engano no
// Supavisor transaction-mode (:6543), resolvePrismaCliUrl converte apenas a porta para o
// Session Pooler (:5432), que mantém uma conexão estável para migrations em redes IPv4.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: resolvePrismaCliUrl(),
  },
});
