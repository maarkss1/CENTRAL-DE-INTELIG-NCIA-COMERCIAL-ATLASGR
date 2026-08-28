import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { CnpjResultCard } from '../../../../../src/features/prospecting/components/prospecting-hub/CnpjResultCard';
import type { CnpjLookupResult } from '../../../../../src/features/prospecting/services/enrichment/cnpjLookup';

function baseResult(overrides: Partial<CnpjLookupResult> = {}): CnpjLookupResult {
    return {
        found: true,
        cnpj: '12.345.678/0001-95',
        source: 'BrasilAPI-CNPJ',
        data: {
            legalName: 'EMPRESA REAL DE TRANSPORTES LTDA',
            tradeName: 'EMPRESA REAL',
            situacaoCadastral: 'ATIVA',
            naturezaJuridica: 'Sociedade empresária limitada',
            capitalSocial: 100000,
            dataAbertura: '2010-01-01',
            cnae: '4930202',
            cnaeDescription: 'Transporte rodoviário de carga',
            size: 'DEMAIS',
            employeeCountEstimate: 25,
            address: 'RUA TESTE, 100',
            city: 'Ribeirão Preto',
            state: 'SP',
            zipCode: '14000-000',
            phones: [],
            emails: [],
            qsa: [],
        },
        ...overrides,
    };
}

// MI-014 (dossiê CPI, DEC-15 opção A): o card de empresa individual da Prospecção passa a exibir
// o indicador territorial RNTRC (ANTT) já publicado em Market Intelligence (`marketRisk`,
// preenchido pela rota `/enrich-cnpj`, ver `prospecting.routes.ts`), sempre com contexto — nunca
// um número solto — seguindo o mesmo padrão `available`/`reason` do relatório de qualidade de
// dados (`dataQualityReport.service.ts`).
describe('CnpjResultCard — sinal territorial RNTRC (ANTT)', () => {
    afterEach(cleanup);

    it('não renderiza a seção quando marketRisk não foi buscado (compatibilidade)', () => {
        render(<CnpjResultCard result={baseResult()} onPromote={vi.fn()} isPromoting={false} promoted={false} />);
        expect(screen.queryByText(/Sinal territorial RNTRC/)).not.toBeInTheDocument();
    });

    it('mostra o tier, o total de transportadoras e a explicação do que o número significa', () => {
        const result = baseResult({
            marketRisk: {
                available: true,
                reason: null,
                uf: 'SP',
                transporters: 253129,
                etc: 1000,
                tac: 2000,
                ctc: 1,
                etcEquiparada: 500,
                municipalitiesCount: 644,
                percentile: 100,
                tier: 'ALTA',
                metadata: {
                    dataset: 'ANTT RNTRC', competencia: '2026-07', sourceUrl: 'https://dados.antt.gov.br/',
                    hash: 'a'.repeat(64), granularity: 'MUNICIPAL', dataOrigin: 'OBSERVED',
                },
            },
        });
        render(<CnpjResultCard result={result} onPromote={vi.fn()} isPromoting={false} promoted={false} />);

        expect(screen.getByText(/Sinal territorial RNTRC \(ANTT\) — SP/)).toBeInTheDocument();
        expect(screen.getByText('Concentração alta de transportadoras RNTRC')).toBeInTheDocument();
        expect(screen.getByText(/253\.129 transportadoras registradas no RNTRC em SP/)).toBeInTheDocument();
        expect(screen.getByText(/percentil 100 entre as UFs do Brasil/)).toBeInTheDocument();
        expect(screen.getByText(/competência 2026-07/)).toBeInTheDocument();
        expect(screen.getByText(/não é uma medida de sinistralidade \(roubo\/furto\)/)).toBeInTheDocument();
    });

    it('nunca mostra um número solto: quando indisponível, explica o motivo em vez de esconder ou inventar', () => {
        const result = baseResult({
            marketRisk: {
                available: false,
                reason: 'Nenhum dado RNTRC (ANTT) publicado para AP no snapshot atual.',
                uf: 'AP',
                transporters: null, etc: null, tac: null, ctc: null, etcEquiparada: null,
                municipalitiesCount: null, percentile: null, tier: null,
                metadata: null,
            },
        });
        render(<CnpjResultCard result={result} onPromote={vi.fn()} isPromoting={false} promoted={false} />);

        expect(screen.getByText(/Sinal territorial RNTRC \(ANTT\) — AP/)).toBeInTheDocument();
        expect(screen.getByText(/RNTRC territorial NÃO DISPONÍVEL — Nenhum dado RNTRC \(ANTT\) publicado para AP/)).toBeInTheDocument();
        expect(screen.queryByText('Concentração alta de transportadoras RNTRC')).not.toBeInTheDocument();
    });
});
