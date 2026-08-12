import { prisma } from '../src/lib/prisma.js';
import { logger } from '../src/lib/logger.js';
import { connection } from '../src/lib/queue/redis.js';

async function verifyProd() {
    console.log('🚀 Iniciando verificação de produção (Health & Connectivity)...');

    // 1. Conexão com Banco de Dados
    try {
        await prisma.$queryRaw`SELECT 1`;
        console.log('✅ Banco de dados PostgreSQL (Supabase/Prisma): CONECTADO');
    } catch (err) {
        console.error('❌ Falha de conexão com Banco de Dados:', err);
        process.exit(1);
    }

    // 2. Conexão com Redis
    if (connection) {
        try {
            await connection.ping();
            console.log('✅ Redis (BullMQ / SSE PubSub): CONECTADO');
        } catch (err) {
            console.error('⚠️ Redis indisponível ou desacoplado');
        }
    } else {
        console.log('ℹ️ Redis não configurado (Modo Standalone)');
    }

    // 3. Verificação de Variáveis Críticas
    const requiredEnvs = ['DATABASE_URL'];
    const missing = requiredEnvs.filter(e => !process.env[e]);

    if (missing.length > 0) {
        console.error(`❌ Variáveis de ambiente ausentes: ${missing.join(', ')}`);
        process.exit(1);
    }

    console.log('🎉 TODAS AS VERIFICAÇÕES PASSARAM! Sistema pronto para operação.');
    process.exit(0);
}

verifyProd().catch((err) => {
    console.error('Erro na verificação:', err);
    process.exit(1);
});
