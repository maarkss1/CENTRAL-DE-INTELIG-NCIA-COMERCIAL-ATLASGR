import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function seed() {
    const users = [
        { name: 'Marcelo Nascimento', email: 'marcelo.nascimento@atlasgr.com.br', password: '***REMOVED***' },
        { name: 'João Reis', email: 'joao.reis@atlasgr.com.br', password: '***REMOVED***' },
        { name: 'Murilo Marques', email: 'murilo.marques@atlasgr.com', password: '***REMOVED***' },
    ];

    for (const u of users) {
        try {
            const orgId = uuidv4();
            const userId = uuidv4();
            const accountId = uuidv4();
            const hashedPassword = await bcrypt.hash(u.password, 10);

            // Check if user exists
            const res = await pool.query('SELECT id FROM "user" WHERE email = $1', [u.email]);
            if (res.rows.length > 0) {
                console.log(`User ${u.email} already exists, updating password...`);
                await pool.query('UPDATE account SET password = $1 WHERE "userId" = $2 AND "providerId" = $3', [hashedPassword, res.rows[0].id, 'credential']);
                continue;
            }

            // Create organization
            await pool.query('INSERT INTO "Organization" (id, name, "updatedAt") VALUES ($1, $2, NOW())', [orgId, `${u.name}'s Organization`]);

            // Create user
            await pool.query('INSERT INTO "user" (id, name, email, role, "organizationId", "emailVerified", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())', 
                [userId, u.name, u.email, 'VISUALIZADOR', orgId, true]);

            // Create account
            await pool.query('INSERT INTO account (id, "accountId", "providerId", "userId", password, "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW())',
                [accountId, u.email, 'credential', userId, hashedPassword]);

            console.log(`Created user: ${u.email}`);
        } catch (err) {
            console.error(`Failed to create user ${u.email}:`, err);
        }
    }
}

seed().then(() => {
    console.log('Done');
    process.exit(0);
});
