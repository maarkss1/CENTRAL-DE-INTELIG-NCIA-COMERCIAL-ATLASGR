import 'dotenv/config';
import { defineConfig } from '@prisma/config';

// O Prisma CLI (migrate/generate) usa só este `url`, nunca o Pool/adapter de src/lib/prisma.ts.
// Em produção com um pooler transaction-mode (PgBouncer/Supavisor porta 6543), migrations e os
// advisory locks que elas tomam podem falhar porque a conexão não é fixa por sessão — defina
// DIRECT_URL apontando para a conexão direta (ou o pooler em session-mode) do provedor
// (Supabase: Settings > Database > Connection string > "Direct connection"; Neon: a URL sem
// "-pooler" no host) quando isso acontecer. Sem DIRECT_URL, cai para DATABASE_URL normalmente —
// é exatamente o que o Session Pooler do Supabase (porta 5432) já suporta sem problema.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url:
      process.env.DIRECT_URL ||
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/prospector',
  },
});
