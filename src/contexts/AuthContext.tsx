/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, ReactNode } from 'react';
import { authClient } from '../lib/auth-client';
import { getBrandFromEmail } from '../config/access-policy';
import { AuthorizationService, type Role, type Permission } from '../lib/auth/authorization';

export interface UserSession {
  id: string;
  name: string;
  email: string;
  role: string;
  roleTitle: string;
  brand: 'atlasgr' | 'totaltrac';
  permissions: Permission[];
  avatarBg: string;
  mustChangePassword: boolean;
}

interface AuthContextType {
  currentUser: UserSession | null;
  isAdmin: boolean;
  logout: () => void;
  canAccessAdminPanel: () => boolean;
  canAccessBrand: (brand: 'atlasgr' | 'totaltrac') => boolean;
  isPending: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ADMIN_ROLES: readonly string[] = ['SUPER_ADMIN', 'TENANT_OWNER', 'ADMIN'];

const ROLE_TITLES: Record<string, string> = {
  SUPER_ADMIN: 'Super Administrador',
  TENANT_OWNER: 'Proprietário da Conta',
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  COORDINATOR: 'Coordenador',
  SALES_MANAGER: 'Gerente Comercial',
  SDR: 'SDR',
  BDR: 'BDR',
  CLOSER: 'Closer',
  CSM: 'Customer Success',
  FINANCE: 'Financeiro',
  HR: 'RH',
  LEGAL: 'Jurídico',
  MARKETING: 'Marketing',
  OPERATIONS: 'Operações',
  SUPPORT: 'Suporte',
  READ_ONLY: 'Somente Leitura',
  GUEST: 'Convidado',
};

// A sessão do better-auth carrega os campos adicionais configurados em src/lib/auth.ts
// (role/organizationId), mas o client não os tipa automaticamente — refletimos aqui o
// mesmo formato usado pelo middleware de autenticação do servidor (authenticateToken.ts).
interface SessionUser {
  id: string;
  name?: string | null;
  email: string;
  role?: string;
  mustChangePassword?: boolean;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isPending } = authClient.useSession();
  const sessionUser = data?.user as SessionUser | undefined;

  const savedBrand = localStorage.getItem('selectedBrand') as 'atlasgr' | 'totaltrac' | null;

  const currentUser: UserSession | null = sessionUser
    ? (() => {
        const role = sessionUser.role || 'GUEST';
        const permissions = AuthorizationService.getPermissions(role as Role);
        return {
          id: sessionUser.id,
          name: sessionUser.name || sessionUser.email.split('@')[0],
          email: sessionUser.email,
          role,
          roleTitle: ROLE_TITLES[role] || role,
          brand: savedBrand || getBrandFromEmail(sessionUser.email),
          permissions,
          avatarBg: 'bg-gradient-to-r from-blue-500 to-indigo-500',
          mustChangePassword: !!sessionUser.mustChangePassword,
        };
      })()
    : null;

  const logout = async () => {
    await authClient.signOut();
    window.location.href = '/app';
  };

  const isAdmin = currentUser ? ADMIN_ROLES.includes(currentUser.role) : false;

  const canAccessAdminPanel = () =>
    isAdmin || !!currentUser?.permissions.includes('settings.manage');

  const canAccessBrand = (brand: 'atlasgr' | 'totaltrac') => {
    // Papéis administrativos de conta cruzam marcas; os demais ficam restritos
    // à marca associada ao domínio do próprio e-mail corporativo.
    if (!currentUser) return false;
    if (currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'TENANT_OWNER') return true;
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
        isPending
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
