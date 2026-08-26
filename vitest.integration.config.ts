import { defineConfig } from 'vitest/config';
import { config as loadEnv } from 'dotenv';
import path from 'path';

// Precisa estar setado em process.env ANTES do grafo de módulos ser avaliado: src/lib/prisma.ts lê
// DATABASE_URL no top-level do módulo (na criação do Pool), e ES modules avaliam todos os imports
// de um arquivo antes das próprias instruções desse arquivo — então um `dotenv.config()` chamado
// de dentro do setupFile roda tarde demais, depois que o Pool já foi criado com a URL errada
// (o fallback fixo do prisma.ts, porta 5432, onde nada está escutando). Carregar aqui, na config do
// Vitest (que roda antes de qualquer módulo de teste ser importado), resolve isso de vez.
const testEnv = loadEnv({ path: path.resolve(process.cwd(), '.env.test') }).parsed || {};

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    env: testEnv,
    // tests/helpers/integration-setup.ts seeds the "test-org-id" Organization that every
    // integration test's fixtures depend on (foreign key) and cleans up before/after each test -
    // it existed but was never wired here, so on a genuinely fresh DB (like CI) every test failed
    // with a foreign key violation the first time nothing had happened to create that row yet.
    setupFiles: ['./tests/helpers/integration-setup.ts'],
    fileParallelism: false,
    singleThread: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      // Diretório próprio — ver o mesmo comentário em vitest.unit.config.ts. Sem isto, este run
      // sobrescrevia (por rodar depois, no script `coverage`/no job de CI) o relatório de
      // cobertura unitária no './coverage' default compartilhado.
      reportsDirectory: './coverage/integration',
      reportOnFailure: true,
      // Mesmo problema documentado em vitest.unit.config.ts: sem `include`, arquivo nunca
      // importado por um teste de integração não entra no relatório (nem como 0%). Diferente do
      // unit config, aqui o `include` fica restrito a `.ts` (backend/server) — este ambiente roda
      // em Node puro (`environment: 'node'`), sem jsdom, e nunca renderiza um componente `.tsx`;
      // incluir a árvore de UI aqui só padronizaria zeros artificiais para código que a suíte de
      // integração não tem como exercitar por design, distorcendo o threshold. A cobertura de
      // `.tsx` é responsabilidade do relatório unitário.
      include: ['src/**/*.ts', 'server/**/*.ts'],
      // ITEM-04: mesma remoção das exclusões amplas de src/components/** e src/features/**/*.tsx
      // feita em vitest.unit.config.ts — os testes de integração deste repo também exercitam rotas
      // que importam componentes/features reais (ex.: supertest batendo em handlers Express que
      // vivem ao lado de código de feature), então escondê-los do relatório de integração também
      // mascarava cobertura real. Mesma exclusão justificável de logo estático mantida por
      // consistência com o config de unit.
      exclude: [
        'src/main.tsx',
        'src/**/*.d.ts',
        'src/components/ui/AtlasLogo.tsx',
        // `src/**/*.{ts,tsx}` inclui os arquivos de teste unitário que moram ao lado do código-fonte
        // em `__tests__/` (convenção usada em boa parte de `src/features/**`). Esta suíte de
        // integração nunca os executa (não estão em `test.include` acima) — sem esta exclusão eles
        // apareciam no relatório como "código-fonte" 0% cobrindo, o que é incorreto: são os próprios
        // testes, não produto.
        'src/**/__tests__/**',
      ],
      // ITEM-04: thresholds bloqueantes, medidos rodando `npm run coverage:integration` localmente
      // contra um Postgres/Redis isolados (mesmas imagens do job `build-and-test` do ci.yml:
      // pgvector/pgvector:pg17 + redis:7-alpine, com o mesmo bootstrap de papel de app) em
      // 2026-08-25, depois da correção do `include`/exclusão de `__tests__` acima:
      //   Statements 20.78% · Branches 14.34% · Functions 19.51% · Lines 21.58%
      // Piso ~1pp abaixo do baseline, mesmo raciocínio do vitest.unit.config.ts — não é meta, é o
      // ponto atual, para travar regressão. Sem threshold por domínio aqui: nesta suíte (Node puro,
      // sem jsdom) o risco maior de UI já é coberto pelos thresholds por domínio do config de
      // unit; a suíte de integração está concentrada em autenticação/RBAC/isolamento de tenant
      // (ver DoD do ci.yml, step "Run Integration Tests (auth, RBAC and tenant isolation)"), que já
      // é o próprio propósito declarado da suíte.
      thresholds: {
        statements: 20,
        branches: 13,
        functions: 19,
        lines: 21,
      },
    },
    alias: {
      '@/': new URL('./src/', import.meta.url).pathname,
    }
  },
});
