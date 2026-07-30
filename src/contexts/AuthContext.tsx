/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, ReactNode } from 'react';
import { UserPreset } from '../features/auth/constants/userPresets';
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
  const { data: session, isPending } = authClient.useSession();
  
  const savedBrand = localStorage.getItem('selectedBrand') as 'atlasgr' | 'totaltrac' | null;

  const currentUser: UserSession | null = session?.user ? {
      id: session.user.id,
      name: session.user.name || 'Usuário',
      email: session.user.email || '',
      role: ((session.user as Record<string, unknown>).role as 'user' | 'admin') || 'user',
      roleTitle: ((session.user as Record<string, unknown>).role as string) === 'admin' ? 'Administrador Master' : 'Executivo Comercial B2B',
      brand: savedBrand || 'atlasgr', // Use the one selected before Google Login
      permissions: ['all'],
      avatarBg: 'bg-gradient-to-r from-blue-500 to-indigo-500'
  } : null;

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
