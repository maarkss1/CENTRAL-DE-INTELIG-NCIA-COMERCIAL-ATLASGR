/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from 'react';
import { authClient } from '../lib/auth-client';
import { getBrandFromEmail } from '../config/access-policy';
import {
  hasRequiredRole,
  isKnownRole,
  canAccessCommercialIntelligence,
  canAccessCopilotoIa,
  type Role,
} from '../lib/auth/authorization';

export interface UserSession {
  id: string;
  name: string;
  email: string;
  role: string;
  roleTitle: string;
  brand: 'atlasgr' | 'totaltrac';
  permissions: string[];
  avatarBg: string;
  mustChangePassword: boolean;
  /** Avatar do usuário (User.image no schema) — já gravado no backend, opcional. Consumidores
   *  devem sempre ter um fallback (iniciais) para quando for null/undefined. */
  image?: string | null;
}

interface AuthContextType {
  currentUser: UserSession | null;
  isAdmin: boolean;
  logout: () => void;
  canAccessAdminPanel: () => boolean;
  canAccessBrand: (brand: 'atlasgr' | 'totaltrac') => boolean;
  /** Comercial Inteligente (Revenue Command Center executivo) — ADMIN/GESTOR, ver src/lib/auth/authorization.ts. */
  canAccessCommercialIntelligence: boolean;
  /** Copiloto Comercial IA — ADMIN/GESTOR/CLOSER/SDR, ver COPILOTO_IA_ROLES em src/lib/auth/authorization.ts. */
  canAccessCopilotoIa: boolean;
  isPending: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Papéis reais gravados em User.role (ver src/lib/auth/authorization.ts, fonte canônica de RBAC).
// Este arquivo já usou um segundo taxonomia de papéis (SUPER_ADMIN/TENANT_OWNER/MANAGER/SDR/...)
// que nunca era gravada no banco — qualquer usuário GESTOR/CLOSER/SDR/VISUALIZADOR real (a imensa
// maioria) caía no fallback `[] ` de permissões porque essas chaves não existiam na tabela antiga,
// e `isAdmin`/`canAccessAdminPanel` só reconheciam papéis (SUPER_ADMIN/TENANT_OWNER) que nenhum
// usuário jamais tem. Substituído pela hierarquia real, alinhada ao que o backend efetivamente
// autoriza via `requireRole` (ver src/shared/middlewares/requireRole.ts).
const ROLE_TITLES: Record<Role, string> = {
  ADMIN: 'Administrador',
  GESTOR: 'Gestor',
  CLOSER: 'Closer',
  SDR: 'SDR',
  VISUALIZADOR: 'Visualizador',
};

// Espelha os gates reais de `requireRole(['ADMIN', 'GESTOR'])` já usados nas rotas de
// companies/contacts/leads (exclusão) e `requireRole(['ADMIN'])` em team — não é um catálogo à
// parte: se o backend mudar quem pode o quê, este mapa precisa mudar junto (ver AGENTS.md sobre
// não reintroduzir um terceiro sistema de RBAC).
const ROLE_PERMISSIONS: Record<Role, string[]> = {
  ADMIN: [
    'crm.read',
    'crm.write',
    'crm.delete',
    'settings.manage',
    'users.manage',
    'billing.manage',
  ],
  GESTOR: ['crm.read', 'crm.write', 'crm.delete'],
  CLOSER: ['crm.read', 'crm.write'],
  SDR: ['crm.read', 'crm.write'],
  VISUALIZADOR: ['crm.read'],
};

function permissionsForRole(role: string): string[] {
  return isKnownRole(role) ? ROLE_PERMISSIONS[role] : [];
}

function titleForRole(role: string): string {
  return isKnownRole(role) ? ROLE_TITLES[role] : role;
}

// A sessão do better-auth carrega os campos adicionais configurados em src/lib/auth.ts
// (role/organizationId), mas o client não os tipa automaticamente — refletimos aqui o
// mesmo formato usado pelo middleware de autenticação do servidor (authenticateToken.ts).
interface SessionUser {
  id: string;
  name?: string | null;
  email: string;
  role?: string;
  mustChangePassword?: boolean;
  image?: string | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isPending } = authClient.useSession();
  const sessionUser = data?.user as SessionUser | undefined;

  const savedBrand = localStorage.getItem('selectedBrand') as 'atlasgr' | 'totaltrac' | null;

  const currentUser: UserSession | null = sessionUser
    ? (() => {
        // Fallback fail-closed: papel ausente/desconhecido nunca vira 'ADMIN' nem qualquer papel
        // com permissões — vira string vazia, que `isKnownRole`/`hasRequiredRole` sempre negam.
        const role = sessionUser.role || '';
        const permissions = permissionsForRole(role);
        return {
          id: sessionUser.id,
          name: sessionUser.name || sessionUser.email.split('@')[0],
          email: sessionUser.email,
          role,
          roleTitle: titleForRole(role),
          brand: savedBrand || getBrandFromEmail(sessionUser.email),
          permissions,
          avatarBg: 'bg-gradient-to-r from-blue-500 to-indigo-500',
          mustChangePassword: !!sessionUser.mustChangePassword,
          image: sessionUser.image ?? null,
        };
      })()
    : null;

  const logout = async () => {
    try {
      await authClient.signOut();
    } catch (err) {
      console.error('Erro ao encerrar sessão:', err);
    } finally {
      window.location.href = '/login';
    }
  };

  const isAdmin = currentUser ? hasRequiredRole(currentUser.role, ['ADMIN']) : false;
  const canAccessCommercialIntelligenceValue = currentUser
    ? canAccessCommercialIntelligence(currentUser.role)
    : false;
  const canAccessCopilotoIaValue = currentUser ? canAccessCopilotoIa(currentUser.role) : false;

  const canAccessAdminPanel = () => isAdmin;

  const canAccessBrand = (brand: 'atlasgr' | 'totaltrac') => {
    // Isolamento de tenant nunca é decidido no cliente por papel — cada usuário pertence a UMA
    // Organization (AtlasGR ou TotalTrac); a separação de verdade é aplicada no backend por
    // organizationId (ver src/lib/tenant-prisma.ts). Este helper só decide o que a UI mostra por
    // padrão, sempre restrito à marca do próprio e-mail — nenhum papel "cruza" marcas aqui.
    if (!currentUser) return false;
    return getBrandFromEmail(currentUser.email) === brand;
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAdmin,
        logout,
        canAccessAdminPanel,
        canAccessBrand,
        canAccessCommercialIntelligence: canAccessCommercialIntelligenceValue,
        canAccessCopilotoIa: canAccessCopilotoIaValue,
        isPending,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}
