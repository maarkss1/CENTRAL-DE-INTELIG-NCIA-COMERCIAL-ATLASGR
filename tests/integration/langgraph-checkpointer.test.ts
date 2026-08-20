import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Annotation, StateGraph } from '@langchain/langgraph';
import { checkpointer, ensureCheckpointerReady } from '../../src/lib/ai/checkpointer';

/**
 * AI-002 (onda 32) contra Postgres real: prova o que um teste com pg/PostgresSaver mockados não
 * consegue provar — que o estado de uma thread sobrevive a um processo diferente lendo o mesmo
 * Postgres. Duas instâncias INDEPENDENTES de `PostgresSaver` (cada uma com seu próprio `pg.Pool`,
 * como aconteceria num restart real do processo) apontadas para o mesmo banco de testes:
 * uma escreve, a outra lê de volta.
 */

const CounterState = Annotation.Root({
    count: Annotation<number>({ reducer: (_prev, next) => next, default: () => 0 }),
});

function buildCounterGraph(saver: PostgresSaver) {
    const workflow = new StateGraph(CounterState)
        .addNode('increment', async (state) => ({ count: state.count + 1 }))
        .addEdge('__start__', 'increment')
        .addEdge('increment', '__end__');
    return workflow.compile({ checkpointer: saver });
}

describe('AI-002: checkpointer de LangGraph persiste em Postgres real, não em RAM', () => {
    let secondPool: Pool;
    let secondSaver: PostgresSaver;

    beforeAll(async () => {
        await ensureCheckpointerReady();

        // Segunda instância, deliberadamente independente da primeira (pool próprio) — o
        // equivalente mais fiel a "outro processo" que dá para simular sem matar o processo de
        // teste de verdade.
        secondPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 2,
        });
        secondSaver = new PostgresSaver(secondPool);
    });

    afterAll(async () => {
        await secondPool.end();
    });

    it('setup() é idempotente — chamar de novo não falha nem duplica tabelas', async () => {
        await expect(checkpointer.setup()).resolves.toBeUndefined();
        await expect(secondSaver.setup()).resolves.toBeUndefined();
    });

    it('estado gravado por uma instância é lido de volta por uma instância independente (simula restart)', async () => {
        const threadId = `test-org-checkpointer-${randomUUID()}`;
        const config = { configurable: { thread_id: threadId } };

        const appA = buildCounterGraph(checkpointer);
        const firstRun = await appA.invoke({ count: 0 }, config);
        expect(firstRun.count).toBe(1);

        // "Restart": app B nunca viu app A, mas usa o mesmo Postgres — lê o checkpoint de A pelo
        // mesmo thread_id via getTuple, sem qualquer estado compartilhado em memória entre os dois.
        const tuple = await secondSaver.getTuple(config);
        expect(tuple).toBeDefined();
        expect(tuple?.checkpoint.channel_values.count).toBe(1);

        // E continua a execução a partir do checkpoint persistido, não do zero.
        const appB = buildCounterGraph(secondSaver);
        const secondRun = await appB.invoke({ count: tuple!.checkpoint.channel_values.count as number }, config);
        expect(secondRun.count).toBe(2);
    });

    it('threads diferentes não colidem entre si', async () => {
        const threadA = `test-org-checkpointer-a-${randomUUID()}`;
        const threadB = `test-org-checkpointer-b-${randomUUID()}`;

        const app = buildCounterGraph(checkpointer);
        await app.invoke({ count: 0 }, { configurable: { thread_id: threadA } });
        await app.invoke({ count: 0 }, { configurable: { thread_id: threadB } });
        await app.invoke({ count: 1 }, { configurable: { thread_id: threadA } });

        const tupleA = await checkpointer.getTuple({ configurable: { thread_id: threadA } });
        const tupleB = await checkpointer.getTuple({ configurable: { thread_id: threadB } });

        expect(tupleA?.checkpoint.channel_values.count).toBe(2);
        expect(tupleB?.checkpoint.channel_values.count).toBe(1);
    });
});
