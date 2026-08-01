import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'node:crypto';
import * as dotenv from 'dotenv';
dotenv.config();

// Script de provisionamento manual de usuários. NUNCA hardcode senhas reais aqui —
// elas ficariam expostas em texto puro no histórico do Git permanentemente. Em vez
// disso, cada execução gera uma senha aleatória forte por usuário (ou usa a senha
// informada via variável de ambiente), que é impressa uma única vez no terminal
// para ser repassada ao usuário por um canal seguro (gerenciador de senhas, etc).
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

function generateRandomPassword(): string {
    return crypto.randomBytes(18).toString('base64url');
}

interface SeedUserDefinition {
    name: string;
    email: string;
    role: string;
    /** Nome da variável de ambiente que pode fornecer uma senha específica para este usuário. Opcional. */
    passwordEnvVar?: string;
}

const USERS: SeedUserDefinition[] = [
    { name: 'Marcelo Nascimento', email: 'marcelo.nascimento@atlasgr.com.br', role: 'admin', passwordEnvVar: 'SEED_PASSWORD_MARCELO' },
    { name: 'João Reis', email: 'joao.reis@atlasgr.com.br', role: 'user', passwordEnvVar: 'SEED_PASSWORD_JOAO' },
    { name: 'Comercial', email: 'comercial@atlas.com.br', role: 'user', passwordEnvVar: 'SEED_PASSWORD_COMERCIAL' },
    { name: 'Ronan', email: 'ronan@totaltrac.com.br', role: 'user', passwordEnvVar: 'SEED_PASSWORD_RONAN' },
    { name: 'Kauê Oliveira', email: 'kaue.oliveira@totaltrack.com.br', role: 'user', passwordEnvVar: 'SEED_PASSWORD_KAUE' },
];

async function seed() {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_SEED !== 'true') {
        console.error('Recusando executar seed_users.ts contra um ambiente de produção sem ALLOW_PROD_SEED=true explícito.');
        process.exit(1);
    }

    const generatedCredentials: Array<{ email: string; password: string }> = [];

    for (const u of USERS) {
        try {
            const password = (u.passwordEnvVar && process.env[u.passwordEnvVar]) || generateRandomPassword();
            const orgId = uuidv4();
            const userId = uuidv4();
            const accountId = uuidv4();
            const hashedPassword = await bcrypt.hash(password, 10);

            // Check if user exists
            const res = await pool.query('SELECT id FROM "user" WHERE email = $1', [u.email]);
            if (res.rows.length > 0) {
                console.log(`User ${u.email} already exists, updating password and role...`);
                await pool.query('UPDATE account SET password = $1 WHERE "userId" = $2 AND "providerId" = $3', [hashedPassword, res.rows[0].id, 'credential']);
                await pool.query('UPDATE "user" SET role = $1 WHERE id = $2', [u.role, res.rows[0].id]);
                generatedCredentials.push({ email: u.email, password });
                continue;
            }

            // Create organization
            await pool.query('INSERT INTO "Organization" (id, name, "updatedAt") VALUES ($1, $2, NOW())', [orgId, `${u.name}'s Organization`]);

            // Create user
            await pool.query('INSERT INTO "user" (id, name, email, role, "organizationId", "emailVerified", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())',
                [userId, u.name, u.email, u.role, orgId, true]);

            // Create account
            await pool.query('INSERT INTO account (id, "accountId", "providerId", "userId", password, "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW())',
                [accountId, u.email, 'credential', userId, hashedPassword]);

            generatedCredentials.push({ email: u.email, password });
            console.log(`Created user: ${u.email}`);
        } catch (err) {
            console.error(`Failed to create user ${u.email}:`, err);
        }
    }

    if (generatedCredentials.length > 0) {
        console.log('\n=== Credenciais geradas nesta execução (repasse por canal seguro; não ficam salvas em nenhum arquivo) ===');
        for (const { email, password } of generatedCredentials) {
            console.log(`${email} -> ${password}`);
        }
        console.log('=== Fim da lista de credenciais ===\n');
    }
}

seed().then(() => {
    console.log('Done');
    process.exit(0);
});
