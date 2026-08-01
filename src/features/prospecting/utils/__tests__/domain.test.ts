import { describe, expect, it } from 'vitest';

import { findCompanyDomain, normalizeCompanyDomain } from '../domain';

describe('prospecting domain helpers', () => {
    it('extrai o domínio de uma URL completa', () => {
        expect(normalizeCompanyDomain('https://www.rodonaves.com.br/contato'))
            .toBe('rodonaves.com.br');
    });

    it('aceita um domínio informado sem protocolo', () => {
        expect(normalizeCompanyDomain('empresa.com.br')).toBe('empresa.com.br');
    });

    it('prioriza o website do candidato e mantém compatibilidade com o rationale', () => {
        expect(findCompanyDomain(
            'https://www.empresa.com.br',
            'Encontrado via Apollo — domínio: legado.com.br',
        )).toBe('empresa.com.br');
        expect(findCompanyDomain(null, 'Encontrado via Apollo — dominio: legado.com.br'))
            .toBe('legado.com.br');
    });

    it('rejeita entradas que não são domínios públicos válidos', () => {
        expect(normalizeCompanyDomain('localhost')).toBe('');
        expect(normalizeCompanyDomain('https://usuario:senha@empresa.com.br')).toBe('');
        expect(normalizeCompanyDomain('texto sem dominio')).toBe('');
    });
});
