import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import pg from 'pg';

const { Pool } = pg;
const emergencyPassword = process.env.EMERGENCY_RESET_ALL_PASSWORDS_PASSWORD?.trim();
const databaseUrl = process.env.DATABASE_URL?.trim();

type UserRow = { id: string; email: string };
type CredentialRow = { id: string };

async function main() {
  if (!emergencyPassword) {
    console.log('Emergency password reset disabled.');
    return;
  }

  if (emergencyPassword.length < 16) {
    throw new Error('EMERGENCY_RESET_ALL_PASSWORDS_PASSWORD must have at least 16 characters.');
  }

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for emergency password reset.');
  }

  // Este caminho de recuperação usa pg diretamente de propósito. O Prisma Client desta aplicação
  // encapsula operações em transações curtas para aplicar contexto/RLS; durante o incidente, esse
  // wrapper falhou antes mesmo da primeira leitura com P2028 (timeout para iniciar transação).
  // Uma conexão SQL dedicada evita esse wrapper, sem alterar o banco nem a configuração normal da API.
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 30_000,
    idleTimeoutMillis: 5_000,
  });
  const client = await pool.connect();

  try {
    const passwordHash = await hashPassword(emergencyPassword);

    await client.query('BEGIN');
    // As policies RLS do projeto usam app.bypass_rls para operações globais controladas.
    await client.query(`SELECT set_config('app.bypass_rls', 'on', true)`);

    const usersResult = await client.query<UserRow>(
      `SELECT "id", "email" FROM "user" ORDER BY "createdAt" ASC`,
    );
    const users = usersResult.rows;

    if (users.length === 0) {
      await client.query('COMMIT');
      console.log('EMERGENCY_AUTH_RESET no users found.');
      return;
    }

    let removedDuplicateCredentials = 0;
    let revokedSessions = 0;

    for (const user of users) {
      const credentialsResult = await client.query<CredentialRow>(
        `SELECT "id" FROM "account" WHERE "userId" = $1 AND "providerId" = 'credential' ORDER BY "createdAt" ASC, "id" ASC`,
        [user.id],
      );
      const credentialAccounts = credentialsResult.rows;

      if (credentialAccounts.length === 0) {
        await client.query(
          `INSERT INTO "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
           VALUES ($1, $2, 'credential', $3, $4, NOW(), NOW())`,
          [randomUUID(), user.id, user.id, passwordHash],
        );
      } else {
        const [canonicalCredential, ...duplicates] = credentialAccounts;

        await client.query(
          `UPDATE "account" SET "password" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
          [passwordHash, canonicalCredential.id],
        );

        if (duplicates.length > 0) {
          const duplicateIds = duplicates.map((account) => account.id);
          const deleted = await client.query(
            `DELETE FROM "account" WHERE "id" = ANY($1::text[])`,
            [duplicateIds],
          );
          removedDuplicateCredentials += deleted.rowCount ?? 0;
        }
      }

      const sessions = await client.query(
        `DELETE FROM "session" WHERE "userId" = $1`,
        [user.id],
      );
      revokedSessions += sessions.rowCount ?? 0;

      await client.query(
        `UPDATE "user" SET "mustChangePassword" = TRUE, "updatedAt" = NOW() WHERE "id" = $1`,
        [user.id],
      );

      console.log(`EMERGENCY_AUTH_RESET user=${user.email} status=reset`);
    }

    await client.query('COMMIT');
    console.log(
      `EMERGENCY_AUTH_RESET completed users=${users.length} revokedSessions=${revokedSessions} removedDuplicateCredentials=${removedDuplicateCredentials}`,
    );
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original incident error below.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('EMERGENCY_AUTH_RESET failed', error);
  process.exitCode = 1;
});
