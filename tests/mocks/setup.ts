process.env.DATABASE_URL = 'postgresql://dummy:dummy@localhost:5432/dummy';
// Setup global do MSW para os testes unitários (TEST-004). Registrado via `setupFiles` em
// `vitest.unit.config.ts`. Antes disto, o mock de HTTP era ad hoc por arquivo
// (`global.fetch = vi.fn()` / `vi.spyOn(globalThis, 'fetch')` / `vi.mock` da camada de API),
// espalhado por vários testes. Agora todos usam os handlers em `tests/mocks/handlers/` e
// sobrescrevem pontualmente com `server.use(...)` quando precisam de uma resposta diferente.
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';

// jsdom não implementa HTMLDialogElement.showModal()/close() (usado pelo componente Dialog
// compartilhado, ver src/components/ui/Dialog.tsx) — sem isso, qualquer teste que monte um
// componente com Dialog aberto (CompanyForm, ContactForm etc.) quebra com
// "TypeError: dialog.showModal is not a function".
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
        this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
        this.open = false;
        this.dispatchEvent(new Event('close'));
    };
}

server.listen({ onUnhandledRequest: 'bypass' });
if (typeof window !== 'undefined') {
    window.fetch = globalThis.fetch;
}

afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Mock DATABASE_URL para os testes passarem na validação do Zod
process.env.DATABASE_URL = 'postgresql://dummy:dummy@localhost:5432/dummy';
