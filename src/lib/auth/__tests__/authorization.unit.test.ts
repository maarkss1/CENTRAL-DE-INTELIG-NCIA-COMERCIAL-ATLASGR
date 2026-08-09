import { describe, it, expect } from 'vitest';
import { ASSIGNABLE_ROLES, ROLE_HIERARCHY, UNVERIFIED_ROLE, hasRequiredRole, isKnownRole } from '../authorization';

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
});
