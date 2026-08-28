import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';

const withBypass = <T>(fn: () => Promise<T>): Promise<T> => requestContext.run({ bypassRls: true }, fn);

// Achado real (investigação de flakiness da suíte E2E, 2026-08-28): `tests/e2e/accessibility.spec.ts`
// › "Deck de aprovação de leads (Market Intelligence)" visita `/app/market-intelligence/deck`, cuja
// API (`activeDataset()` em `marketIntelligence.service.ts`) lança 503 sempre que não existe nenhum
// `MarketIntelligenceDataset` com `publicationSlot: 'CNPJ_ACTIVE'` e `status: 'READY'` — uma tabela
// GLOBAL (não por organização). Nenhum spec/fixture de e2e jamais semeava essa linha; o teste só
// "passava" por acidente quando um banco de teste compartilhado tinha lixo de uma execução anterior.
// O 503 mostra o toast de erro (`Toaster.tsx`, `bg-red-600 text-white animate-toast-in`) — que a
// própria Onda 42 já tinha diagnosticado como causa de falso positivo do axe-core (contraste
// capturado a meio caminho da transição de opacidade), mas `reducedMotion: 'reduce'` só evita ISSO
// quando o toast aparece; não evita o teste depender de um estado de erro que nunca deveria ser o
// caminho padrão testado. A correção real é garantir que o dataset global exista antes da suíte
// rodar, para que o Deck exerça sua UI de verdade (vazio ou com candidatos), não o toast de 503.
export default async function globalSetup() {
  await withBypass(async () => {
    const existing = await prisma.marketIntelligenceDataset.findFirst({
      where: { publicationSlot: 'CNPJ_ACTIVE', status: 'READY' },
      select: { id: true },
    });
    if (existing) return;

    await prisma.marketIntelligenceDataset.create({
      data: {
        id: 'e2e-fixture-cnpj-active',
        dataset: 'CNPJ_COMPANIES',
        competencia: '2026-08',
        source: 'RECEITA_FEDERAL_CNPJ',
        sourceVersion: 'e2e-fixture',
        status: 'READY',
        publicationSlot: 'CNPJ_ACTIVE',
        recordsRead: 0,
        recordsImported: 0,
        recordsActive: 0,
        hash: 'e2e-fixture-'.padEnd(64, '0'),
        pipelineVersion: 'e2e-global-setup-v1',
        activatedAt: new Date(),
      },
    });
  });

  await prisma.$disconnect();
}
