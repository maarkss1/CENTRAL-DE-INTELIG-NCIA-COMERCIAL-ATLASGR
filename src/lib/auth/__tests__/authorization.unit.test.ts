import { describe, it, expect } from 'vitest';
import {
    ASSIGNABLE_ROLES,
    ROLE_HIERARCHY,
    UNVERIFIED_ROLE,
    COMMERCIAL_INTELLIGENCE_ROLES,
    hasRequiredRole,
    isKnownRole,
    canAccessCommercialIntelligence,
} from '../authorization';

describe('RBAC canônico (src/lib/auth/authorization.ts)', () => {
    it('expõe exatamente os quatro papéis realmente gravados em User.role', () => {
        expect(ASSIGNABLE_ROLES.sort()).toEqual(['ADMIN', 'GESTOR', 'VENDEDOR', 'VISUALIZADOR'].sort());
        expect(Object.keys(ROLE_HIERARCHY).sort()).toEqual(ASSIGNABLE_ROLES.sort());
    });

    describe('hasRequiredRole', () => {
        it('permite papel exatamente igual ao exigido', () => {
            expect(hasRequiredRole('ADMIN', ['ADMIN'])).toBe(true);
            expect(hasRequiredRole('GESTOR', ['GESTOR'])).toBe(true);
        });

        it('permite papel de nível maior que o mínimo exigido pela lista', () => {
            expect(hasRequiredRole('ADMIN', ['GESTOR', 'VENDEDOR'])).toBe(true);
        });

        it('nega papel de nível menor que o exigido', () => {
            expect(hasRequiredRole('VENDEDOR', ['ADMIN', 'GESTOR'])).toBe(false);
            expect(hasRequiredRole('VISUALIZADOR', ['GESTOR'])).toBe(false);
        });

        it('nega papel desconhecido/fora da hierarquia', () => {
            expect(hasRequiredRole('SUPER_ADMIN', ['ADMIN'])).toBe(false);
            expect(hasRequiredRole('', ['VISUALIZADOR'])).toBe(false);
            expect(hasRequiredRole(UNVERIFIED_ROLE, ['VISUALIZADOR'])).toBe(false);
        });
    });

    describe('isKnownRole', () => {
        it('reconhece os quatro papéis válidos', () => {
            for (const role of ASSIGNABLE_ROLES) {
                expect(isKnownRole(role)).toBe(true);
            }
        });

        it('rejeita papéis do sistema de permissões antigo, agora removido', () => {
            expect(isKnownRole('SUPER_ADMIN')).toBe(false);
            expect(isKnownRole('TENANT_OWNER')).toBe(false);
            expect(isKnownRole('GUEST')).toBe(false);
            expect(isKnownRole(UNVERIFIED_ROLE)).toBe(false);
        });
    });

    describe('canAccessCommercialIntelligence (módulo Comercial Inteligente)', () => {
        it('define o nível mínimo como GESTOR (ADMIN e GESTOR, nada abaixo)', () => {
            expect(COMMERCIAL_INTELLIGENCE_ROLES.slice().sort()).toEqual(['ADMIN', 'GESTOR'].sort());
        });

        it('autoriza ADMIN e GESTOR', () => {
            expect(canAccessCommercialIntelligence('ADMIN')).toBe(true);
            expect(canAccessCommercialIntelligence('GESTOR')).toBe(true);
        });

        it('bloqueia VENDEDOR e VISUALIZADOR — cobre SDR/vendedor/operador/financeiro/suporte/usuário comum, que não são papéis distintos hoje', () => {
            expect(canAccessCommercialIntelligence('VENDEDOR')).toBe(false);
            expect(canAccessCommercialIntelligence('VISUALIZADOR')).toBe(false);
        });

        it('bloqueia papel desconhecido, vazio ou o sentinela UNVERIFIED (fail-closed)', () => {
            expect(canAccessCommercialIntelligence('SDR')).toBe(false);
            expect(canAccessCommercialIntelligence('DIRETOR')).toBe(false);
            expect(canAccessCommercialIntelligence('CEO')).toBe(false);
            expect(canAccessCommercialIntelligence('')).toBe(false);
            expect(canAccessCommercialIntelligence(UNVERIFIED_ROLE)).toBe(false);
        });
    });
});
