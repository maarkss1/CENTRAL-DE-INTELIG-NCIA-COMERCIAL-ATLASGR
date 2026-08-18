// Render executa esta aplicação como um backend Node persistente. Para esse perfil, o Supabase
// recomenda o Supavisor em Session Mode (:5432), enquanto Transaction Mode (:6543) é voltado a
// clientes temporários/serverless. O Prisma CLI já faz a mesma normalização em prisma.config.ts.
//
// Este preload é ativado somente no runtime de produção via NODE_OPTIONS. Ele nunca imprime a URL
// completa e altera exclusivamente a porta do pooler Supabase, preservando usuário, senha, banco e
// query params. URLs locais, diretas e de outros provedores permanecem intocadas.
const databaseUrl = process.env.DATABASE_URL?.trim();

if (databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    const isSupabaseTransactionPooler =
      parsed.hostname.endsWith('.pooler.supabase.com') && parsed.port === '6543';

    if (isSupabaseTransactionPooler) {
      parsed.port = '5432';
      process.env.DATABASE_URL = parsed.toString();
      console.warn(
        '[runtime-db] Supabase transaction pooler (:6543) detected; persistent Node runtime will use session pooler (:5432).',
      );
    }
  } catch {
    // Preserve o valor original. O driver do banco continua responsável por reportar uma URL
    // inválida, em vez de este preload mascarar ou reescrever uma configuração defeituosa.
  }
}
