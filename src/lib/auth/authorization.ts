/**
 * Fonte canônica de RBAC da plataforma — papel (role) único por usuário, hierárquico.
 *
 * Havia dois sistemas de autorização divergentes neste repositório (bloqueador prioritário
 * "RBAC duplicado ou divergente" — ver /AGENTS.md):
 *
 *  1. Um sistema de papéis hierárquico (ADMIN/GESTOR/CLOSER/SDR/VISUALIZADOR), antes duplicado
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

import type { UserRole } from '@prisma/client';

export type Role = UserRole;

export const ROLE_HIERARCHY: Record<Role, number> = {
  ADMIN: 100,
  GESTOR: 75,
  CLOSER: 50,
  SDR: 40,
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
  return Object.hasOwn(ROLE_HIERARCHY, role);
}

/**
 * Comercial Inteligente (Revenue Command Center executivo) — módulo restrito a quem toma decisão
 * de receita. O pedido de produto descreve os papéis permitidos como "Gestor/Diretor/CEO" e os
 * bloqueados como "SDR/vendedor/operador/financeiro/suporte/usuário comum/outros". Este sistema
 * de RBAC só tem os 5 papéis reais documentados acima — não existe DIRETOR, CEO, OPERADOR,
 * FINANCEIRO nem SUPORTE gravado em `User.role`, e criar um enum novo só para este módulo seria
 * reintroduzir exatamente o "terceiro sistema de permissões" que este arquivo já eliminou uma vez
 * (ver o comentário no topo do arquivo e o bloqueador "RBAC duplicado ou divergente" em
 * `/AGENTS.md`). A tradução usada aqui, e a única aplicada em toda a pilha (frontend, rotas,
 * controllers, exportações):
 *   - GESTOR (75) e ADMIN (100) → autorizados. ADMIN é hoje também o papel do fundador da
 *     organização (ver `src/lib/auth.ts`) e cobre Diretor/CEO na ausência de um papel executivo
 *     próprio — é o nível mais alto da hierarquia existente, o análogo mais próximo disponível.
 *   - CLOSER (50), SDR (40), VISUALIZADOR (10) e qualquer papel desconhecido/UNVERIFIED (0) →
 *     bloqueados. Nenhum desses papéis distingue operador/financeiro/suporte de visualizador —
 *     todos caem abaixo do nível mínimo exigido (GESTOR), que é o efeito prático pedido: só gestão
 *     para cima acessa o módulo.
 * `hasRequiredRole` é a MESMA função usada por todo o resto do RBAC — nenhuma lógica nova, só um
 * nome de domínio para o nível mínimo exigido por este módulo específico.
 */
export const COMMERCIAL_INTELLIGENCE_ROLES: readonly Role[] = ['ADMIN', 'GESTOR'];

export function canAccessCommercialIntelligence(role: string): boolean {
  return hasRequiredRole(role, COMMERCIAL_INTELLIGENCE_ROLES);
}

/**
 * Mesa de Tratamento (fila de trabalho SDR do funil de Lead) — mesmo conjunto de papéis do
 * `mesaRoles` em `mesaTratamento.routes.ts` (backend). Exportado aqui para a rota de frontend
 * (`RequireRole` em `App.tsx`) e o item de navegação condicional (`Sidebar.tsx`) nunca divergirem
 * do que o backend realmente exige — só VISUALIZADOR (e papel desconhecido) ficam de fora.
 */
export const MESA_TRATAMENTO_ROLES: readonly Role[] = ['ADMIN', 'GESTOR', 'CLOSER', 'SDR'];

export function canAccessMesaTratamento(role: string): boolean {
  return hasRequiredRole(role, MESA_TRATAMENTO_ROLES);
}

/**
 * Copiloto Comercial IA (fundação — Onda 1 do pacote `atlasgr_copiloto_ai_pack`) — quem captura,
 * revisa e aprova sinais de conversa comercial (Google Meet, ligação) no dia a dia: mesmo conjunto
 * de papéis de `MESA_TRATAMENTO_ROLES` (ADMIN/GESTOR/CLOSER/SDR). VISUALIZADOR fica de fora porque
 * este módulo cria/altera dado (consentimento, sugestão de campo de CRM), não é só leitura.
 */
export const COPILOTO_IA_ROLES: readonly Role[] = ['ADMIN', 'GESTOR', 'CLOSER', 'SDR'];

export function canAccessCopilotoIa(role: string): boolean {
  return hasRequiredRole(role, COPILOTO_IA_ROLES);
}
