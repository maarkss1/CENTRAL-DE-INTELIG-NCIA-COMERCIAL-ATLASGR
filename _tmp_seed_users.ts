import { Pool } from 'pg';
import { hashPassword } from 'better-auth/crypto';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'node:crypto';
import * as dotenv from 'dotenv';
dotenv.config({ path: 'C:\\Users\\Marks\\Documents\\GitHub\\CENTRAL-DE-INTELIGENCIA-COMECIAL-ATLASGR\\.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
await client.query("SELECT set_config('app.bypass_rls', 'on', FALSE);");

function generateRandomPassword(): string {
  return crypto.randomBytes(18).toString('base64url');
}

interface SeedUserDefinition {
  name: string;
  email: string;
  role: string;
  joinOrganizationOfEmail?: string;
}

// Só os dois usuários pedidos explicitamente pelo usuário nesta sessão (marcelo ADMIN, joao
// usuário/SDR) — deliberadamente sem o terceiro usuário (Kaue) que existe em seed_users.ts mas
// não foi solicitado aqui.
const USERS: SeedUserDefinition[] = [
  { name: 'Marcelo Nascimento', email: 'marcelo.nascimento@atlasgr.com.br', role: 'ADMIN' },
  { name: 'Joao Reis', email: 'joao.reis@atlasgr.com.br', role: 'SDR', joinOrganizationOfEmail: 'marcelo.nascimento@atlasgr.com.br' },
];

async function seed() {
  const generatedCredentials: Array<{ email: string; password: string }> = [];

  for (const u of USERS) {
    try {
      const password = generateRandomPassword();
      const orgId = uuidv4();
      const userId = uuidv4();
      const accountId = uuidv4();
      const hashedPassword = await hashPassword(password);

      const res = await client.query('SELECT id FROM "user" WHERE email = $1', [u.email]);
      if (res.rows.length > 0) {
        console.log(`User ${u.email} already exists — leaving password untouched, updating role only.`);
        await client.query('UPDATE "user" SET role = $1 WHERE id = $2', [u.role, res.rows[0].id]);
        continue;
      }

      let targetOrgId = orgId;
      if (u.joinOrganizationOfEmail) {
        const orgRes = await client.query('SELECT "organizationId" FROM "user" WHERE email = $1', [u.joinOrganizationOfEmail]);
        if (orgRes.rows.length === 0 || !orgRes.rows[0].organizationId) {
          console.error(`Não encontrei a organização de ${u.joinOrganizationOfEmail}. Rode o seed desse usuário primeiro. Pulando ${u.email}.`);
          continue;
        }
        targetOrgId = orgRes.rows[0].organizationId;
      } else {
        await client.query('INSERT INTO "Organization" (id, name, "updatedAt") VALUES ($1, $2, NOW())', [orgId, `${u.name}'s Organization`]);
      }

      await client.query('INSERT INTO "user" (id, name, email, role, "organizationId", "emailVerified", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())',
        [userId, u.name, u.email, u.role, targetOrgId, true]);

      await client.query('INSERT INTO account (id, "accountId", "providerId", "userId", password, "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW())',
        [accountId, u.email, 'credential', userId, hashedPassword]);

      generatedCredentials.push({ email: u.email, password });
      console.log(`Created user: ${u.email}`);
    } catch (err) {
      console.error(`Failed to create user ${u.email}:`, err);
    }
  }

  if (generatedCredentials.length > 0) {
    console.log('\n=== Credenciais geradas nesta execução ===');
    for (const { email, password } of generatedCredentials) {
      console.log(`${email} -> ${password}`);
    }
    console.log('=== Fim ===\n');
  }
}

seed().finally(() => {
  client.release();
  return pool.end();
}).then(() => {
  console.log('Done');
  process.exit(0);
});
