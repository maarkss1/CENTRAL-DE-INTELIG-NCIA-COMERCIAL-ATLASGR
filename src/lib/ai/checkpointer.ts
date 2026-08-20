import { Pool } from 'pg';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { logger } from '../logger.js';
import { env } from '../../config/env.js';

/**
 * AI-002 (onda 32): checkpointer real de LangGraph, compartilhado pelos 3 grafos que hoje usam
 * `MemorySaver` (RAM) — `sdrQualification.agent.ts`, `ops.agent.ts`, `supervisor.agent.ts`. Antes,
 * o estado de uma execução em andamento (thread) desaparecia a cada restart/deploy do processo; o
 * `thread_id` já era prefixado por tenant (`${organizationId}:${sessionId}`, correção anterior
 * documentada nos 3 arquivos acima) — isso fechou a colisão entre organizações, mas não a perda de
 * estado.
 *
 * Tabelas próprias (`checkpoints`, `checkpoint_writes`, `checkpoint_blobs`,
 * `checkpoint_migrations`), criadas e migradas pelo próprio pacote
 * `@langchain/langgraph-checkpoint-postgres` via `setup()` — DELIBERADAMENTE fora do sistema de
 * migrations do Prisma (`prisma/migrations/`) e no schema `public` padrão (não um schema dedicado:
 * criar um schema novo exigiria confirmar `CREATE SCHEMA` no papel de produção, que não pôde ser
 * verificado neste ambiente; `public` já é onde o papel da aplicação comprovadamente tem DDL, é o
 * mesmo schema que Prisma já usa). Não colidem com nenhum model do schema.prisma (nomes conferidos).
 *
 * Pool dedicado (não o pool interno de `prisma.ts`, que não é exportado e cuja vida útil não deve
 * ser acoplada à do checkpointer — `PostgresSaver` expõe `end()` para fechar seu próprio pool, e
 * chamar isso no pool do Prisma por engano derrubaria toda a aplicação).
 *
 * SEM RLS: as tabelas do checkpointer não passam pela extensão do Prisma
 * (`$allOperations`/`app.current_tenant_id`) — o pacote fala SQL cru direto no `pg.Pool`. Isolamento
 * de tenant aqui é só o prefixo de `thread_id`, mesmo modelo de confiança já aceito neste repo para
 * BullMQ/Redis (ver `src/lib/queue/agent.worker.ts`: fila também não tem RLS-equivalente, e depende
 * de cada job carregar `tenantId` explícito no payload). Documentado como risco aceito, não uma
 * omissão — ver docs/AI-SWARM-GOVERNANCE-AUDIT.md, seção AI-002.
 *
 * SEM política de TTL: checkpoints se acumulam indefinidamente até uma limpeza ser construída
 * (job agendado chamando `checkpointer.deleteThread(threadId)` para threads antigas) — fora do
 * escopo desta correção, documentado como pendência própria.
 */

const connectionString = env.DATABASE_URL || process.env.DATABASE_URL || '';

const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
});
pool.on('error', (err) => {
    logger.error({ err }, 'Unexpected error on idle LangGraph checkpointer pool client');
});

export const checkpointer = new PostgresSaver(pool);

let setupPromise: Promise<void> | null = null;

/**
 * Garante que as tabelas do checkpointer existam antes do primeiro uso real. Memoizado por
 * processo: chamadas concorrentes compartilham a mesma promise (uma única migration roda por
 * processo, não uma por request), e uma falha limpa o cache para permitir nova tentativa na
 * próxima chamada (transitório — ex.: Postgres temporariamente indisponível no boot — não deveria
 * deixar o processo inteiro permanentemente incapaz de persistir checkpoints).
 *
 * Chamado a partir de cada `run()`/`executeMission()` dos 3 agentes, não no boot do processo: há
 * dois processos de entrada distintos (`server.ts` e `worker.ts`, ver `npm run build:worker`) e
 * inicialização preguiçosa evita depender de lembrar de conectar isso às duas sequências de boot.
 */
export async function ensureCheckpointerReady(): Promise<void> {
    if (!setupPromise) {
        setupPromise = checkpointer.setup().catch((err) => {
            setupPromise = null;
            throw err;
        });
    }
    return setupPromise;
}

/** Só para testes: força uma nova chamada a `setup()` na próxima `ensureCheckpointerReady()`. */
export function __resetCheckpointerSetupForTests(): void {
    setupPromise = null;
}

export async function closeCheckpointerPool(): Promise<void> {
    await pool.end();
}

// Mesmo cuidado documentado em prisma.ts: `beforeExit` pode disparar mais de uma vez, e chamar
// `pool.end()` duas vezes lança "Called end on pool more than once".
let closed = false;
process.once('beforeExit', async () => {
    if (closed) return;
    closed = true;
    await closeCheckpointerPool().catch((err) => {
        logger.warn({ err }, 'Falha ao fechar o pool do checkpointer no shutdown');
    });
});
