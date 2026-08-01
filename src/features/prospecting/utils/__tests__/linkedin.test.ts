import { describe, expect, it } from 'vitest';
import { getDecisionMakerLinkedInLink } from '../linkedin';

describe('decision-maker LinkedIn links', () => {
    it('usa o perfil direto retornado pelo provedor', () => {
        expect(getDecisionMakerLinkedInLink({
            name: 'Maria Silva',
            title: 'Diretora de Operações',
            companyName: 'Empresa Exemplo',
            linkedinUrl: 'br.linkedin.com/in/maria-silva',
        })).toEqual({
            href: 'https://br.linkedin.com/in/maria-silva',
            isDirectProfile: true,
        });
    });

    it('gera uma busca preenchida quando o perfil exato não está disponível', () => {
        const result = getDecisionMakerLinkedInLink({
            name: 'João Souza',
            title: 'Gerente de Logística',
            companyName: 'Rodonaves',
            linkedinUrl: null,
        });

        expect(result.isDirectProfile).toBe(false);
        expect(decodeURIComponent(result.href)).toContain('João Souza Gerente de Logística Rodonaves');
    });

    it('não aceita páginas de empresa ou URLs externas como perfil pessoal', () => {
        const companyPage = getDecisionMakerLinkedInLink({
            name: 'Ana Lima',
            companyName: 'AtlasGR',
            linkedinUrl: 'https://www.linkedin.com/company/atlasgr',
        });
        const unsafeUrl = getDecisionMakerLinkedInLink({
            name: 'Ana Lima',
            companyName: 'AtlasGR',
            linkedinUrl: 'javascript:alert(1)',
        });

        expect(companyPage.isDirectProfile).toBe(false);
        expect(unsafeUrl.isDirectProfile).toBe(false);
        expect(companyPage.href).toMatch(/^https:\/\/www\.linkedin\.com\/search\/results\/people\//);
        expect(unsafeUrl.href).toMatch(/^https:\/\/www\.linkedin\.com\/search\/results\/people\//);
    });
});
