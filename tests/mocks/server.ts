import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// `environment: 'jsdom'` no vitest.unit.config.ts ainda roda em cima do Node, então o
// interceptor de `msw/node` funciona normalmente (patcheia `fetch`/`http` globais do processo).
export const server = setupServer(...handlers);
