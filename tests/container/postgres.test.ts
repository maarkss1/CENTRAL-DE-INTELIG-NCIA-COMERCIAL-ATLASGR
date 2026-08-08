import { GenericContainer, Wait } from 'testcontainers';
import { afterAll, describe, expect, it } from 'vitest';

const runContainerTests = process.env.RUN_INFRA_TESTS === '1';
const suite = runContainerTests ? describe : describe.skip;

suite('PostgreSQL de inteligência comercial', () => {
    let stop: (() => Promise<void>) | undefined;

    afterAll(async () => {
        await stop?.();
    });

    it('inicializa a imagem com pgvector e PostGIS', async () => {
        const container = await new GenericContainer('atlasgr/postgres-intelligence:16')
            .withEnvironment({
                POSTGRES_USER: 'test',
                POSTGRES_PASSWORD: 'test',
                POSTGRES_DB: 'test',
            })
            .withExposedPorts(5432)
            .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
            .start();
        stop = async () => container.stop().then(() => undefined);
        expect(container.getMappedPort(5432)).toBeGreaterThan(0);
    }, 90_000);
});
