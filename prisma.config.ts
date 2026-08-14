import 'dotenv/config';
import { defineConfig } from '@prisma/config';

const LOCAL_FALLBACK_URL = 'postgresql://postgres:postgres@localhost:5432/prospector';

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
