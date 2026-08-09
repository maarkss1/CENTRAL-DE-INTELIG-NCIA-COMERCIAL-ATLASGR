/**
 * Fonte canônica de RBAC da plataforma — papel (role) único por usuário, hierárquico.
 *
 * Havia dois sistemas de autorização divergentes neste repositório (bloqueador prioritário
 * "RBAC duplicado ou divergente" — ver /AGENTS.md):
 *
 *  1. Um sistema de papéis hierárquico (ADMIN/GESTOR/VENDEDOR/VISUALIZADOR), antes duplicado
 *     entre `src/shared/middlewares/requireRole.ts` e `src/features/team/services/team.service.ts`,
 *     e efetivamente ligado a todas as rotas via `requireRole(...)` — alinhado ao valor default
 *     real da coluna `User.role` no schema Prisma ("VISUALIZADOR", ver prisma/schema.prisma) e ao
 *     que `src/lib/auth.ts` (Better Auth) e `src/features/team/services/team.service.ts`
 *     efetivamente gravam no banco.
 *  2. Um sistema de permissões baseado em um enum de papéis totalmente diferente e nunca gravado
 *     no banco (SUPER_ADMIN/TENANT_OWNER/ADMIN/MANAGER/COORDINATOR/SALES_MANAGER/SDR/BDR/CLOSER/
 *     CSM/FINANCE/HR/LEGAL/MARKETING/OPERATIONS/SUPPORT/AI_AGENT/API/READ_ONLY/GUEST), que morava
 *     também neste arquivo (`AuthorizationService`) e nunca esteve conectado a nenhuma rota —
 *     `requirePermission`/`requireAnyPermission` (`src/shared/middlewares/authorization.ts`) não
 *     eram importados em lugar nenhum fora do próprio teste unitário.
 *
 * Este arquivo elimina o sistema morto (2) e centraliza aqui o sistema (1), que é o realmente
 * usado, para todo o resto do código importar em vez de duplicar a hierarquia (única fonte de
 * verdade, sem criar um terceiro sistema).
 */

export type Role = 'ADMIN' | 'GESTOR' | 'VENDEDOR' | 'VISUALIZADOR';

export const ROLE_HIERARCHY: Record<Role, number> = {
    ADMIN: 100,
    GESTOR: 75,
    VENDEDOR: 50,
    VISUALIZADOR: 10,
};

export const ASSIGNABLE_ROLES: Role[] = Object.keys(ROLE_HIERARCHY) as Role[];

/**
 * Papel-sentinela para sessões sem um `role` reconhecível (nunca deve acontecer em uso normal —
 * `src/lib/auth.ts` sempre grava um default válido — mas serve de fallback seguro/fail-closed em
 * `authenticateToken`). Fica de propósito FORA de `ROLE_HIERARCHY`: `hasRequiredRole` resolve
 * qualquer papel desconhecido para nível 0, sempre abaixo do papel mais fraco real
 * (VISUALIZADOR = 10), então nunca satisfaz nenhuma checagem de `requireRole`.
 */
export const UNVERIFIED_ROLE = 'UNVERIFIED' as const;

/**
 * Retorna true se `userRole` tem nível igual ou superior ao papel de MENOR nível em `allowedRoles`.
 * Papel desconhecido (fora da hierarquia, dos dois lados) nunca satisfaz uma checagem.
 */
export function hasRequiredRole(userRole: string, allowedRoles: readonly string[]): boolean {
    const userLevel = ROLE_HIERARCHY[userRole as Role] ?? 0;
    const requiredLevel = Math.min(...allowedRoles.map((r) => ROLE_HIERARCHY[r as Role] ?? 999));
    return userLevel >= requiredLevel;
}

export function isKnownRole(role: string): role is Role {
    return Object.prototype.hasOwnProperty.call(ROLE_HIERARCHY, role);
}
