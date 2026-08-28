import { describe, expect, it } from 'vitest';

import { rntrcRiskByUf } from '../../../src/features/market-intelligence/server/rntrcTerritorial';

// MI-014 (dossiê CPI, DEC-15 opção A): `rntrcRiskByUf` reaproveita o mesmo dataset municipal já
// carregado por `rntrcTerritorialSnapshot()` (ver `companyApi.test.ts`, que já lê o mesmo arquivo
// real sem mockar `fs` — mesma convenção aqui). Os totais/percentis por UF abaixo foram conferidos
// diretamente contra `public/tools/atlas-market-intelligence/data/rntrc_municipios.json`: SP é a
// UF com mais transportadoras (percentil 100/ALTA), AP é a UF com menos (percentil 0/BAIXA) e CE
// fica exatamente no meio (percentil 50/MEDIA) entre as 27 UFs do dataset.
describe('rntrcRiskByUf', () => {
    it('agrega o snapshot municipal por UF e classifica a UF com mais transportadoras como ALTA', () => {
        const result = rntrcRiskByUf('SP');
        expect(result.available).toBe(true);
        expect(result.reason).toBeNull();
        expect(result.uf).toBe('SP');
        expect(result.transporters).toBe(253129);
        expect(result.percentile).toBe(100);
        expect(result.tier).toBe('ALTA');
        expect(result.municipalitiesCount).toBeGreaterThan(0);
        expect(result.metadata).toMatchObject({ granularity: 'MUNICIPAL', dataOrigin: 'OBSERVED' });
    });

    it('classifica a UF com menos transportadoras como BAIXA', () => {
        const result = rntrcRiskByUf('AP');
        expect(result.available).toBe(true);
        expect(result.transporters).toBe(427);
        expect(result.percentile).toBe(0);
        expect(result.tier).toBe('BAIXA');
    });

    it('classifica uma UF intermediária como MEDIA', () => {
        const result = rntrcRiskByUf('CE');
        expect(result.available).toBe(true);
        expect(result.percentile).toBe(50);
        expect(result.tier).toBe('MEDIA');
    });

    it('normaliza minúsculas e espaços antes de procurar a UF', () => {
        expect(rntrcRiskByUf(' sp ')).toMatchObject({ available: true, uf: 'SP' });
    });

    it('nunca fabrica um número quando a UF não foi informada', () => {
        const result = rntrcRiskByUf(undefined);
        expect(result.available).toBe(false);
        expect(result.uf).toBeNull();
        expect(result.transporters).toBeNull();
        expect(result.tier).toBeNull();
        expect(result.reason).toMatch(/UF não informada/);
    });

    it('nunca fabrica um número para uma UF fora do padrão de 2 letras', () => {
        const result = rntrcRiskByUf('São Paulo');
        expect(result.available).toBe(false);
        expect(result.reason).toMatch(/UF não informada/);
    });

    it('devolve indisponível com motivo explícito para uma UF sem linhas no snapshot', () => {
        const result = rntrcRiskByUf('ZZ');
        expect(result.available).toBe(false);
        expect(result.uf).toBe('ZZ');
        expect(result.transporters).toBeNull();
        expect(result.reason).toMatch(/Nenhum dado RNTRC \(ANTT\) publicado para ZZ/);
    });
});
