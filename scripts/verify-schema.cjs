/**
 * Confere, em modo somente-leitura, se as migrations da Base de Conhecimento, das Notificacoes e
 * das Automacoes chegaram ao banco apontado por DATABASE_URL — e se os dados seguem intactos.
 *
 *   node scripts/verify-schema.cjs
 */
require('dotenv').config({ quiet: true, override: true });
const { Client } = require('pg');

const CONSULTAS = [
    ['tabelas no schema ', "SELECT count(*)::int AS v FROM information_schema.tables WHERE table_schema='public'"],
    ['tabela Notification', `SELECT (to_regclass('public."Notification"') IS NOT NULL) AS v`],
    ['tabela Automation  ', `SELECT (to_regclass('public."Automation"') IS NOT NULL) AS v`],
    ['Document.organizationId', "SELECT count(*)::int AS v FROM information_schema.columns WHERE table_name='Document' AND column_name='organizationId'"],
    ['AILog.organizationId', "SELECT count(*)::int AS v FROM information_schema.columns WHERE table_name='AILog' AND column_name='organizationId'"],
    ['dimensao do vetor  ', "SELECT format_type(a.atttypid,a.atttypmod) AS v FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relname='DocumentChunk' AND a.attname='vector' AND NOT a.attisdropped"],
    ['indice vetorial    ', "SELECT count(*)::int AS v FROM pg_indexes WHERE tablename='DocumentChunk' AND indexname LIKE '%vector%'"],
    ['tabelas com RLS    ', "SELECT string_agg(relname,',' ORDER BY relname) AS v FROM pg_class WHERE relrowsecurity AND relname IN ('Document','DocumentChunk','Notification','Automation','AILog')"],
    ['Organizations      ', 'SELECT count(*)::int AS v FROM "Organization"'],
    ['Companies          ', 'SELECT count(*)::int AS v FROM "Company"'],
    ['Leads              ', 'SELECT count(*)::int AS v FROM "Lead"'],
    ['Activities         ', 'SELECT count(*)::int AS v FROM "Activity"'],
];

(async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    console.log('host:', new URL(process.env.DATABASE_URL).hostname, '\n');

    for (const [rotulo, sql] of CONSULTAS) {
        try {
            const { rows } = await client.query(sql);
            console.log(rotulo, '->', rows[0] ? rows[0].v : '(sem linha)');
        } catch (err) {
            console.log(rotulo, '-> ERRO:', err.message.slice(0, 70));
        }
    }

    await client.end();
})().catch((err) => {
    console.error('FALHA:', err.message);
    process.exit(1);
});
