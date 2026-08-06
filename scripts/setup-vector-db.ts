/**
 * Prepara o Postgres com pgvector para a Base de Conhecimento.
 *
 * Contexto: o `.env` de desenvolvimento costuma apontar para um Postgres comum (localhost:5432),
 * que NÃO tem a extensão pgvector — nele a Base de Conhecimento funciona só com busca por
 * palavra-chave. O docker-compose sobe a imagem `pgvector/pgvector:pg16` na porta 5434, que tem a
 * extensão. Este script prepara esse banco e deixa o histórico de migrations consistente.
 *
 * É idempotente: pode rodar quantas vezes precisar.
 *
 *   npx tsx scripts/setup-vector-db.ts            # verifica e prepara
 *   npx tsx scripts/setup-vector-db.ts --check    # só diagnostica, não altera nada
 *
 * O script NÃO edita o seu .env — ele imprime no fim a linha DATABASE_URL a usar, porque trocar a
 * conexão do ambiente é decisão sua, não dele.
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { Client } from 'pg';

const VECTOR_DB_URL =
    process.env.VECTOR_DATABASE_URL ||
    'postgresql://prospector:prospector_pass@localhost:5434/prospectordb?schema=public';

const checkOnly = process.argv.includes('--check');

const ok = (m: string) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const fail = (m: string) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const info = (m: string) => console.log(`  \x1b[36m•\x1b[0m ${m}`);

function run(cmd: string, env?: NodeJS.ProcessEnv): string {
    return execSync(cmd, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ...env },
    });
}

/** Aguarda o Postgres aceitar conexões (o container leva alguns segundos para inicializar). */
async function waitForPostgres(url: string, attempts = 30): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
        const client = new Client({ connectionString: url, connectionTimeoutMillis: 1500 });
        try {
            await client.connect();
            await client.end();
            return true;
        } catch {
            await new Promise((r) => setTimeout(r, 1000));
        }
    }
    return false;
}

async function inspect(url: string) {
    const client = new Client({ connectionString: url, connectionTimeoutMillis: 3000 });
    await client.connect();
    try {
        const ext = await client.query("SELECT 1 FROM pg_extension WHERE extname = 'vector'");
        const available = await client.query(
            "SELECT 1 FROM pg_available_extensions WHERE name = 'vector'",
        );
        const tables = await client.query(
            "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'",
        );
        const history = await client.query(
            "SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present",
        );
        return {
            vectorEnabled: ext.rowCount! > 0,
            vectorAvailable: available.rowCount! > 0,
            tableCount: tables.rows[0].n as number,
            hasMigrationHistory: history.rows[0].present as boolean,
        };
    } finally {
        await client.end();
    }
}

async function main() {
    console.log('Preparando o Postgres com pgvector...');

    // 1. Container

    let containerUp = false;
    try {
        const running = run('docker ps --filter name=atlas_postgres --format "{{.Names}}"').trim();
        containerUp = running.includes('atlas_postgres');
        if (containerUp) {
            ok('atlas_postgres já está em execução');
        } else if (checkOnly) {
            fail('atlas_postgres não está em execução (use sem --check para subir)');
        } else {
            info('subindo atlas_postgres…');
            run('docker compose up -d postgres');
            ok('container iniciado');
            containerUp = true;
        }
    } catch (err) {
        fail(`Docker indisponível: ${(err as Error).message.split('\n')[0]}`);
        console.log('O engine do Docker Desktop não está respondendo. Reinicie o Docker Desktop e rode este script de novo.');
        process.exit(1);
    }

    // 2. Conexão

    if (!(await waitForPostgres(VECTOR_DB_URL))) {
        fail(`sem resposta em ${VECTOR_DB_URL.replace(/:[^:@]+@/, ':***@')}`);
        process.exit(1);
    }
    ok('Postgres aceitando conexões na porta 5434');

    // 3. Extensão

    let state = await inspect(VECTOR_DB_URL);
    if (state.vectorEnabled) {
        ok('pgvector já está ativa');
    } else if (!state.vectorAvailable) {
        fail('a imagem deste Postgres não traz pgvector — confira se é pgvector/pgvector:pg16');
        process.exit(1);
    } else if (checkOnly) {
        info('pgvector disponível, mas não ativada');
    } else {
        const client = new Client({ connectionString: VECTOR_DB_URL });
        await client.connect();
        await client.query('CREATE EXTENSION IF NOT EXISTS vector');
        await client.end();
        ok('pgvector ativada');
        state = await inspect(VECTOR_DB_URL);
    }

    // 4. Schema

    info(`${state.tableCount} tabelas no schema public`);
    if (checkOnly) {
        info(
            state.hasMigrationHistory
                ? 'histórico de migrations presente'
                : 'sem histórico de migrations',
        );
        console.log('\n  (--check: nada foi alterado)\n');
        return;
    }

    if (state.tableCount === 0) {
        // Banco novo: aplica as migrations na ordem e o histórico nasce correto.
        info('banco vazio — aplicando todas as migrations…');
        run('npx prisma migrate deploy', { DATABASE_URL: VECTOR_DB_URL });
        ok('migrations aplicadas');
    } else if (!state.hasMigrationHistory) {
        // Banco com tabelas mas sem histórico (criado por `db push`): faz o baseline das antigas e
        // aplica só as pendentes, para não tentar recriar o que já existe.
        info('tabelas existentes sem histórico — fazendo baseline…');
        const pending = run('npx prisma migrate status', { DATABASE_URL: VECTOR_DB_URL });
        const names = [...pending.matchAll(/^(\d{14}_\w+)$/gm)].map((m) => m[1]);
        // A última é a da Base de Conhecimento; as anteriores já estão refletidas no schema.
        for (const name of names.slice(0, -1)) {
            run(`npx prisma migrate resolve --applied ${name}`, { DATABASE_URL: VECTOR_DB_URL });
            info(`baseline: ${name}`);
        }
        run('npx prisma migrate deploy', { DATABASE_URL: VECTOR_DB_URL });
        ok('baseline concluído e migration pendente aplicada');
    } else {
        run('npx prisma migrate deploy', { DATABASE_URL: VECTOR_DB_URL });
        ok('migrations em dia');
    }

    // 5. Conferência final

    const client = new Client({ connectionString: VECTOR_DB_URL });
    await client.connect();
    const col = await client.query(
        `SELECT udt_name FROM information_schema.columns
         WHERE table_name = 'DocumentChunk' AND column_name = 'vector'`,
    );
    const tipo = col.rows[0]?.udt_name;
    if (tipo === 'vector') ok('DocumentChunk.vector é do tipo vector — busca semântica habilitada');
    else fail(`DocumentChunk.vector é "${tipo ?? 'ausente'}" — a busca ficará só por palavra-chave`);
    await client.end();

    console.log(`\nPronto. Aponte a aplicação para este banco com:\n  DATABASE_URL="${VECTOR_DB_URL}"`);
}

main().catch((err) => {
    console.error('\nFalhou:', err.message, '\n');
    process.exit(1);
});
