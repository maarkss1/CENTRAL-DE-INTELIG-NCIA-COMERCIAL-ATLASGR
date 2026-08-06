// Setup global do MSW para os testes unitários (TEST-004). Registrado via `setupFiles` em
// `vitest.unit.config.ts`. Antes disto, o mock de HTTP era ad hoc por arquivo
// (`global.fetch = vi.fn()` / `vi.spyOn(globalThis, 'fetch')` / `vi.mock` da camada de API),
// espalhado por vários testes. Agora todos usam os handlers em `tests/mocks/handlers/` e
// sobrescrevem pontualmente com `server.use(...)` quando precisam de uma resposta diferente.
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';

// `onUnhandledRequest: 'bypass'` (em vez de 'error') porque o interceptor de `msw/node` é global
// no processo: alguns testes (ex.: tests/unit/features/companies/routes/company.routes.test.ts)
// usam supertest para bater direto num servidor Express real via socket TCP local — não é HTTP
// que devêssemos mockar. Com 'bypass' essas chamadas passam direto para a rede real/local em vez
// de o MSW tentar (e falhar) interceptá-las.
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Mock DATABASE_URL para os testes passarem na validação do Zod
process.env.DATABASE_URL = 'postgresql://dummy:dummy@localhost:5432/dummy';
