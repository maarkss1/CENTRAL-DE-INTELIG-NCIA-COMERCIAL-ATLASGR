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

/**
 * Comercial Inteligente (Revenue Command Center executivo) — módulo restrito a quem toma decisão
 * de receita. O pedido de produto descreve os papéis permitidos como "Gestor/Diretor/CEO" e os
 * bloqueados como "SDR/vendedor/operador/financeiro/suporte/usuário comum/outros". Este sistema
 * de RBAC só tem os 4 papéis reais documentados acima — não existe DIRETOR, CEO, SDR, OPERADOR,
 * FINANCEIRO nem SUPORTE gravado em `User.role`, e criar um enum novo só para este módulo seria
 * reintroduzir exatamente o "terceiro sistema de permissões" que este arquivo já eliminou uma vez
 * (ver o comentário no topo do arquivo e o bloqueador "RBAC duplicado ou divergente" em
 * `/AGENTS.md`). A tradução usada aqui, e a única aplicada em toda a pilha (frontend, rotas,
 * controllers, exportações):
 *   - GESTOR (75) e ADMIN (100) → autorizados. ADMIN é hoje também o papel do fundador da
 *     organização (ver `src/lib/auth.ts`) e cobre Diretor/CEO na ausência de um papel executivo
 *     próprio — é o nível mais alto da hierarquia existente, o análogo mais próximo disponível.
 *   - VENDEDOR (50), VISUALIZADOR (10) e qualquer papel desconhecido/UNVERIFIED (0) → bloqueados.
 *     Nenhum desses papéis distingue SDR de vendedor, nem operador/financeiro/suporte de
 *     visualizador — todos caem abaixo do nível mínimo exigido (GESTOR), que é o efeito prático
 *     pedido: só gestão para cima acessa o módulo.
 * `hasRequiredRole` é a MESMA função usada por todo o resto do RBAC — nenhuma lógica nova, só um
 * nome de domínio para o nível mínimo exigido por este módulo específico.
 */
export const COMMERCIAL_INTELLIGENCE_ROLES: readonly Role[] = ['ADMIN', 'GESTOR'];

export function canAccessCommercialIntelligence(role: string): boolean {
    return hasRequiredRole(role, COMMERCIAL_INTELLIGENCE_ROLES);
}
