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

  const currentUser: UserSession | null = {
      id: 'dev-bypass-user',
      name: 'Administrador (Bypass)',
      email: 'admin@prospector.com',
      role: 'admin',
      roleTitle: 'Administrador Master',
      brand: savedBrand || 'atlasgr',
      permissions: ['all'],
      avatarBg: 'bg-gradient-to-r from-blue-500 to-indigo-500'
  };

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
