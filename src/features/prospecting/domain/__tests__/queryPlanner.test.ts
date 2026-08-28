/**
 * CPI DEC-12 (opção A) — cobre `queryPlanner.ts`: dado um `SearchIntent` X, prova que o planner
 * decide a ordem/cota Y, com justificativa (`reasons`) legível. Duas frentes:
 *
 * 1. `scoreProvider`/`planCompanyDiscovery`/`planShortfallFallback` isolados — o núcleo de decisão
 *    em si, testado com um `SearchIntent` construído à mão (sem depender de `buildSearchIntent`).
 * 2. "Paridade com o cascade legado" — reproduz a ARITMÉTICA EXATA que `discoverCandidates`
 *    (prospecting.service.ts) usava antes desta refatoração (Apollo cota=total só em modo hybrid;
 *    Google Places cota=round(total*0.4) quando cidade+estado, senão min(total,25); Nominatim só
 *    quando total>15, cota=min(total,20)) e prova que o plano gerado bate número a número — o
 *    requisito da tarefa de "preservar exatamente o comportamento observável de hoje como
 *    caso-base".
 */
import { describe, it, expect } from 'vitest';
import {
  planCompanyDiscovery,
  planShortfallFallback,
  scoreProvider,
  NOMINATIM_SUPPLEMENT_MIN_QUANTITY,
} from '../queryPlanner.js';
import type { SearchIntent } from '../searchIntent.js';
import type { ProspectingProviderMode } from '../../../../config/prospecting-integrations.js';

function baseIntent(overrides: Partial<SearchIntent> = {}): SearchIntent {
  return {
    segment: 'Transportadora',
    freeTextTerms: [],
    location: { label: 'Rio de Janeiro e Região', excluded: [], isCitySpecific: false },
    firmographics: {
      technologiesInclude: [],
      technologiesExclude: [],
      publicCompanyOnly: false,
    },
    needsFirmographicFiltering: false,
    decisionMakerTitles: [],
    needsDecisionMakerContacts: false,
    quantityRequested: 20,
    excludeNames: [],
    ...overrides,
  };
}

function stepFor(
  steps: ReturnType<typeof planCompanyDiscovery>['steps'],
  provider: 'apollo' | 'googlePlaces' | 'nominatim',
) {
  return steps.find((s) => s.provider === provider);
}

describe('scoreProvider', () => {
  it('para uma busca neutra, a prioridade-base é Apollo > Google Places > Nominatim', () => {
    const intent = baseIntent();
    const apollo = scoreProvider('apollo', intent).score;
    const places = scoreProvider('googlePlaces', intent).score;
    const nominatim = scoreProvider('nominatim', intent).score;
    expect(apollo).toBeGreaterThan(places);
    expect(places).toBeGreaterThan(nominatim);
  });

  it('bônus de filtro firmográfico só se aplica à Apollo (único provider que sabe filtrar por isso)', () => {
    const intent = baseIntent({ needsFirmographicFiltering: true });
    const base = scoreProvider('apollo', baseIntent()).score;
    expect(scoreProvider('apollo', intent).score).toBeGreaterThan(base);
    expect(scoreProvider('googlePlaces', intent).score).toBe(
      scoreProvider('googlePlaces', baseIntent()).score,
    );
    expect(scoreProvider('nominatim', intent).score).toBe(
      scoreProvider('nominatim', baseIntent()).score,
    );
  });

  it('bônus de precisão geográfica se aplica a Google Places e Nominatim, não à Apollo', () => {
    const intent = baseIntent({
      location: {
        label: 'Niterói, RJ',
        city: 'Niterói',
        state: 'RJ',
        excluded: [],
        isCitySpecific: true,
      },
    });
    expect(scoreProvider('apollo', intent).score).toBe(scoreProvider('apollo', baseIntent()).score);
    expect(scoreProvider('googlePlaces', intent).score).toBeGreaterThan(
      scoreProvider('googlePlaces', baseIntent()).score,
    );
    expect(scoreProvider('nominatim', intent).score).toBeGreaterThan(
      scoreProvider('nominatim', baseIntent()).score,
    );
  });

  it('bônus de decisor pré-buscado só se aplica à Apollo', () => {
    const intent = baseIntent({
      needsDecisionMakerContacts: true,
      decisionMakerTitles: ['Diretor de Logística'],
    });
    expect(scoreProvider('apollo', intent).score).toBeGreaterThan(
      scoreProvider('apollo', baseIntent()).score,
    );
    expect(scoreProvider('googlePlaces', intent).score).toBe(
      scoreProvider('googlePlaces', baseIntent()).score,
    );
  });

  it('a ordem relativa Apollo > Google Places > Nominatim nunca inverte, mesmo com todos os bônus empilhados', () => {
    const maxedOutIntent = baseIntent({
      needsFirmographicFiltering: true,
      needsDecisionMakerContacts: true,
      location: {
        label: 'Niterói, RJ',
        city: 'Niterói',
        state: 'RJ',
        excluded: [],
        isCitySpecific: true,
      },
    });
    const apollo = scoreProvider('apollo', maxedOutIntent).score;
    const places = scoreProvider('googlePlaces', maxedOutIntent).score;
    const nominatim = scoreProvider('nominatim', maxedOutIntent).score;
    expect(apollo).toBeGreaterThan(places);
    expect(places).toBeGreaterThan(nominatim);
  });

  it('sempre devolve ao menos a razão de prioridade-base', () => {
    const { reasons } = scoreProvider('apollo', baseIntent());
    expect(reasons.length).toBeGreaterThanOrEqual(1);
    expect(reasons[0]).toMatch(/Prioridade-base/);
  });
});

describe('planCompanyDiscovery — quais providers e em que ordem', () => {
  it('modo hybrid, busca neutra (sem cidade, quantidade=20): inclui os 3 providers, ordenados Apollo → Google Places → Nominatim', () => {
    const plan = planCompanyDiscovery(baseIntent(), 'hybrid');
    expect(plan.steps.map((s) => s.provider)).toEqual(['apollo', 'googlePlaces', 'nominatim']);
  });

  it('modo free: Apollo NUNCA entra no plano (não há chave paga habilitada)', () => {
    const plan = planCompanyDiscovery(baseIntent(), 'free');
    expect(stepFor(plan.steps, 'apollo')).toBeUndefined();
    expect(plan.steps.map((s) => s.provider)).toEqual(['googlePlaces', 'nominatim']);
  });

  it('quantidade <= 15: Nominatim não entra no plano (busca pequena já bem coberta por Apollo+Places)', () => {
    const plan = planCompanyDiscovery(baseIntent({ quantityRequested: 15 }), 'hybrid');
    expect(stepFor(plan.steps, 'nominatim')).toBeUndefined();
    expect(plan.steps.map((s) => s.provider)).toEqual(['apollo', 'googlePlaces']);
  });

  it(`quantidade > ${NOMINATIM_SUPPLEMENT_MIN_QUANTITY}: Nominatim entra no plano`, () => {
    const plan = planCompanyDiscovery(
      baseIntent({ quantityRequested: NOMINATIM_SUPPLEMENT_MIN_QUANTITY + 1 }),
      'hybrid',
    );
    expect(stepFor(plan.steps, 'nominatim')).toBeDefined();
  });

  it('modo free + quantidade pequena: só Google Places entra no plano', () => {
    const plan = planCompanyDiscovery(baseIntent({ quantityRequested: 5 }), 'free');
    expect(plan.steps.map((s) => s.provider)).toEqual(['googlePlaces']);
  });

  it('cada step carrega ao menos uma razão legível (auditável em log/teste, não só comentário)', () => {
    const plan = planCompanyDiscovery(baseIntent(), 'hybrid');
    for (const step of plan.steps) {
      expect(step.reasons.length).toBeGreaterThan(0);
      expect(step.reasons.every((r) => typeof r === 'string' && r.length > 0)).toBe(true);
    }
  });

  it('a razão de inclusão da Apollo cita explicitamente o modo hybrid', () => {
    const plan = planCompanyDiscovery(baseIntent(), 'hybrid');
    expect(stepFor(plan.steps, 'apollo')?.reasons.join(' ')).toMatch(/hybrid/);
  });

  it('a razão de inclusão do Nominatim cita a quantidade solicitada e o limiar', () => {
    const plan = planCompanyDiscovery(baseIntent({ quantityRequested: 20 }), 'hybrid');
    expect(stepFor(plan.steps, 'nominatim')?.reasons.join(' ')).toMatch(/20/);
  });
});

describe('planCompanyDiscovery — cotas (aritmética preservada do cascade legado)', () => {
  it('Apollo sempre pede a quantidade total, independente de cidade/geografia', () => {
    const withoutCity = planCompanyDiscovery(baseIntent({ quantityRequested: 20 }), 'hybrid');
    const withCity = planCompanyDiscovery(
      baseIntent({
        quantityRequested: 20,
        location: {
          label: 'Niterói, RJ',
          city: 'Niterói',
          state: 'RJ',
          excluded: [],
          isCitySpecific: true,
        },
      }),
      'hybrid',
    );
    expect(stepFor(withoutCity.steps, 'apollo')?.quota).toBe(20);
    expect(stepFor(withCity.steps, 'apollo')?.quota).toBe(20);
  });

  it('Google Places pede min(total, 25) quando a busca NÃO é hiperlocal', () => {
    expect(
      stepFor(
        planCompanyDiscovery(baseIntent({ quantityRequested: 20 }), 'hybrid').steps,
        'googlePlaces',
      )?.quota,
    ).toBe(20);
    expect(
      stepFor(
        planCompanyDiscovery(baseIntent({ quantityRequested: 3 }), 'hybrid').steps,
        'googlePlaces',
      )?.quota,
    ).toBe(3);
  });

  it('Google Places reserva ~40% da cota (arredondado, mínimo 1) quando a busca é hiperlocal (cidade+estado)', () => {
    const cityIntent = (quantityRequested: number) =>
      baseIntent({
        quantityRequested,
        location: {
          label: 'Niterói, RJ',
          city: 'Niterói',
          state: 'RJ',
          excluded: [],
          isCitySpecific: true,
        },
      });

    expect(
      stepFor(planCompanyDiscovery(cityIntent(20), 'hybrid').steps, 'googlePlaces')?.quota,
    ).toBe(8); // round(20*0.4)
    expect(
      stepFor(planCompanyDiscovery(cityIntent(5), 'hybrid').steps, 'googlePlaces')?.quota,
    ).toBe(2); // round(5*0.4)
    expect(
      stepFor(planCompanyDiscovery(cityIntent(1), 'hybrid').steps, 'googlePlaces')?.quota,
    ).toBe(1); // nunca cai a 0
  });

  it('Nominatim pede min(total, 20) quando entra no plano', () => {
    expect(
      stepFor(
        planCompanyDiscovery(baseIntent({ quantityRequested: 20 }), 'hybrid').steps,
        'nominatim',
      )?.quota,
    ).toBe(20);
    expect(
      stepFor(
        planCompanyDiscovery(baseIntent({ quantityRequested: 16 }), 'hybrid').steps,
        'nominatim',
      )?.quota,
    ).toBe(16);
  });
});

describe('planShortfallFallback', () => {
  it('nunca reforça fora do modo hybrid, mesmo com déficit grande', () => {
    const modes: ProspectingProviderMode[] = ['free'];
    for (const mode of modes) {
      expect(planShortfallFallback(baseIntent({ quantityRequested: 20 }), mode, 0)).toBeNull();
    }
  });

  it('não reforça quando a cota já foi preenchida', () => {
    expect(planShortfallFallback(baseIntent({ quantityRequested: 20 }), 'hybrid', 20)).toBeNull();
    expect(planShortfallFallback(baseIntent({ quantityRequested: 20 }), 'hybrid', 25)).toBeNull();
  });

  it('reforça via Google Places com a cota restante quando modo hybrid e há déficit', () => {
    const fallback = planShortfallFallback(baseIntent({ quantityRequested: 20 }), 'hybrid', 12);
    expect(fallback?.provider).toBe('googlePlaces');
    expect(fallback?.quota).toBe(8);
    expect(fallback?.reasons.join(' ')).toMatch(/12\/20/);
  });
});

describe('paridade com o cascade legado (prospecting.service.ts antes desta refatoração)', () => {
  // Reproduz, linha a linha, a aritmética que `discoverCandidates` usava antes desta
  // refatoração (ver git blame de prospecting.service.ts) — não hardcoda os resultados
  // esperados; CALCULA-os pela fórmula legada e compara com o que o planner novo devolve. Se
  // qualquer um destes casos divergir, o cascade mudou de comportamento observável sem decisão
  // documentada — exatamente o que a tarefa pede para nunca acontecer sem justificativa.
  const legacyGooglePlacesQuota = (total: number, hasCity: boolean) =>
    hasCity ? Math.max(1, Math.round(total * 0.4)) : Math.min(total, 25);
  const legacyNominatimIncluded = (total: number) => total > 15;

  const scenarios: Array<{ total: number; hasCity: boolean; mode: ProspectingProviderMode }> = [
    { total: 20, hasCity: false, mode: 'hybrid' },
    { total: 20, hasCity: true, mode: 'hybrid' },
    { total: 20, hasCity: false, mode: 'free' },
    { total: 16, hasCity: true, mode: 'free' },
    { total: 15, hasCity: false, mode: 'hybrid' },
    { total: 5, hasCity: false, mode: 'hybrid' },
    { total: 5, hasCity: true, mode: 'hybrid' },
    { total: 1, hasCity: false, mode: 'free' },
  ];

  it.each(scenarios)('total=$total hasCity=$hasCity mode=$mode', ({ total, hasCity, mode }) => {
    const intent = baseIntent({
      quantityRequested: total,
      location: hasCity
        ? { label: 'Niterói, RJ', city: 'Niterói', state: 'RJ', excluded: [], isCitySpecific: true }
        : { label: 'Rio de Janeiro e Região', excluded: [], isCitySpecific: false },
    });
    const plan = planCompanyDiscovery(intent, mode);

    // Apollo: cascade legado só chamava `fetchApolloCandidates` em modo hybrid, sempre com
    // cota = total.
    const apolloStep = stepFor(plan.steps, 'apollo');
    expect(apolloStep !== undefined).toBe(mode === 'hybrid');
    if (apolloStep) expect(apolloStep.quota).toBe(total);

    // Google Places: cascade legado sempre chamava `discoverViaGooglePlaces`, com a mesma
    // aritmética de cota (reserva de 40% quando cidade+estado, senão min(total,25)).
    const placesStep = stepFor(plan.steps, 'googlePlaces');
    expect(placesStep).toBeDefined();
    expect(placesStep?.quota).toBe(legacyGooglePlacesQuota(total, hasCity));

    // Nominatim: cascade legado só chamava `discoverViaNominatim` quando total > 15, com cota
    // = min(total, 20).
    const nominatimStep = stepFor(plan.steps, 'nominatim');
    expect(nominatimStep !== undefined).toBe(legacyNominatimIncluded(total));
    if (nominatimStep) expect(nominatimStep.quota).toBe(Math.min(total, 20));

    // Ordem de absorção/dedupe: cascade legado sempre absorvia Apollo antes de Google Places
    // antes de Nominatim (array `Promise.allSettled([apollo, places, nominatim])` na ordem
    // literal do código) — o plano novo precisa preservar essa mesma ordem relativa entre os
    // providers que efetivamente entraram no plano.
    const order = plan.steps.map((s) => s.provider);
    const apolloIdx = order.indexOf('apollo');
    const placesIdx = order.indexOf('googlePlaces');
    const nominatimIdx = order.indexOf('nominatim');
    if (apolloIdx !== -1) expect(apolloIdx).toBeLessThan(placesIdx);
    if (nominatimIdx !== -1) expect(placesIdx).toBeLessThan(nominatimIdx);
  });
});
