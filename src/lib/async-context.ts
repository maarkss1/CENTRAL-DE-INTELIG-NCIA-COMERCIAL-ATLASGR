import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
    tenantId?: string;
    userId?: string;
    role?: string;
    // Só usado para as rotas do Better Auth (/api/auth/*, ver server.ts) e para a checagem de
    // sessão em authenticateToken.ts: antes de uma sessão existir não há tenantId conhecido, mas
    // o Better Auth ainda precisa localizar o usuário por e-mail (login), criar a Organization
    // inicial (signup) e ler/gravar Session — todas essas tabelas têm FORCE ROW LEVEL SECURITY
    // (prisma/migrations/20260722020322_enable_rls). Sem este bypass explícito,
    // current_setting('app.current_tenant_id') nunca bate com nada e as policies de RLS bloqueiam
    // até as próprias queries internas do Better Auth. O efeito do bypass, na camada do Prisma
    // (src/lib/prisma.ts), é restrito a um allowlist de models de identidade — nunca vale para
    // Company/Lead/etc.
    bypassRls?: boolean;
}

// IMPORTANTE (Onda 9, bug crítico de RLS — ver .agents/runs/onda-9.md e os handoffs
// 07-para-01-flaky-org-creation-mid-integration-test.md /
// 13-para-01-anomalia-visibilidade-entre-requestcontext-run.md): a causa raiz real do "escrita e
// leitura em requestContext.run() separados perdem visibilidade entre si" NÃO estava em
// `executeWithRls`/`src/lib/prisma.ts` (array-form de `$transaction` vs. transação interativa —
// ambas foram testadas contra Postgres real e o sintoma persistiu). A causa raiz é uma interação
// conhecida (e documentada na comunidade Prisma) entre `AsyncLocalStorage.run(store, callback)` e
// o fato de `PrismaClient` devolver uma `PrismaPromise` **lazy** (um thenable customizado que só
// começa a executar de verdade quando `.then()`/`await` é chamado por quem consome o valor, não
// quando o método `.create()`/`.findMany()` é invocado).
//
// Padrão comum neste código (`asOrg`/`withRlsBypass` em vários arquivos, todos definidos como
// `requestContext.run({tenantId}, fn)` devolvendo `fn()` sem `await` interno):
// ```
// const asOrg = (id, fn) => requestContext.run({ tenantId: id }, fn);
// await asOrg(ORG_A, () => prisma.model.findMany(...));
// ```
// `Node.js AsyncLocalStorage.run()` só garante a store para a extensão SÍNCRONA do callback (mais
// qualquer continuação de Promise NATIVA iniciada durante essa extensão). Como `fn()` aqui apenas
// constrói e devolve a `PrismaPromise` (sem dar `await`), a store de `run()` já "saiu de cena" no
// momento em que o `await` externo (`await asOrg(...)`) efetivamente dispara `.then()` na lazy
// promise — nesse instante, o contexto ambiente já pode ser outro (ex.: sobrescrito por um
// `enterWith` de um hook global de teste, ou pelo contexto de uma request HTTP concorrente
// processada entretanto). Resultado: a extensão Prisma (`$allOperations` em `src/lib/prisma.ts`)
// lê `requestContext.getStore()` e pega o tenant ERRADO — não porque a query em si tenha
// problema, mas porque o valor de `getStore()` já mudou antes da query realmente começar.
// Confirmado isoladamente, sem Prisma, com um thenable customizado equivalente
// (`then(resolve){ setTimeout(() => resolve(als.getStore())) }`): `als.run(store, () => thenable)`
// seguido de `await` externo devolve a store ERRADA; envolver o callback numa função `async` que dá
// `await` no valor de retorno ANTES de `run()` "terminar" resolve o problema — porque aí a
// continuação de fato roda dentro da extensão dinâmica que o AsyncLocalStorage rastreia.
//
// Fix aplicado aqui, uma única vez, no ponto central (não em cada um dos vários `asOrg`/
// `withRlsBypass` espalhados pelo código — eles continuam funcionando exatamente como estão
// escritos): sobrescrever `run()` para, quando o callback devolver algo "thenable" (incluindo
// `PrismaPromise`), envolvê-lo numa função `async` que dá `await` nele imediatamente — assim a
// store correta fica ancorada durante toda a execução real da query, não só até o `callback()`
// retornar. Chamadas cujo callback não devolve uma promise continuam idênticas (sem overhead
// extra de microtask).
class TenantAwareAsyncLocalStorage extends AsyncLocalStorage<RequestContext> {
    run<R, TArgs extends unknown[]>(store: RequestContext, callback: (...args: TArgs) => R, ...args: TArgs): R {
        return super.run(store, ((): R => {
            const result = callback(...args);
            if (result && typeof (result as { then?: unknown }).then === 'function') {
                // Ancora a store durante a execução real da promise/thenable lazy, mesmo que quem
                // chamou `run()` só dê `await` no valor de retorno DEPOIS que `run()` já retornou.
                return (async () => await (result as unknown as Promise<unknown>))() as unknown as R;
            }
            return result;
        }) as unknown as (...args: TArgs) => R);
    }
}

export const requestContext = new TenantAwareAsyncLocalStorage();

export const getTenantId = (): string | undefined => {
    return requestContext.getStore()?.tenantId;
};

export const getUserId = (): string | undefined => {
    return requestContext.getStore()?.userId;
};
