import { createContext, useContext, useEffect, ReactNode } from 'react';
import { UserPreset } from '../features/auth/constants/userPresets';
import { useBrand } from './BrandContext';
import { authClient } from '../lib/auth-client';

export interface UserSession {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  roleTitle: string;
  brand: 'atlasgr' | 'totaltrac';
  permissions: string[];
  avatarBg: string;
}

interface AuthContextType {
  currentUser: UserSession | null;
  isAdmin: boolean;
  loginAsPreset: (preset: UserPreset) => void;
  logout: () => void;
  canAccessAdminPanel: () => boolean;
  canAccessBrand: (brand: 'atlasgr' | 'totaltrac') => boolean;
  isPending: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setActiveBrand } = useBrand();
  const { data: sessionData, isPending } = authClient.useSession();

  let currentUser: UserSession | null = null;

  if (sessionData?.user) {
      const user = sessionData.user;
      const isAdmin = user.email.toLowerCase() === 'marcelo.nascimento@atlasgr.com.br';

      currentUser = {
          id: user.id,
          name: user.name || 'Usuário',
          email: user.email,
          role: isAdmin ? 'admin' : 'user',
          roleTitle: isAdmin ? 'Administrador Master' : 'Usuário',
          brand: 'atlasgr', // Default
          permissions: ['all'],
          avatarBg: 'bg-gradient-to-r from-blue-500 to-indigo-500'
      };
  }

  const loginAsPreset = () => {
    // Deprecated with real auth
  };

  const logout = async () => {
    await authClient.signOut();
    window.location.href = '/login';
  };

  const isAdmin = currentUser?.role === 'admin';
  const canAccessAdminPanel = () => true;
  const canAccessBrand = () => true;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAdmin,
        loginAsPreset,
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
