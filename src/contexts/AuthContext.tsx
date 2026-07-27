import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserPreset } from '../features/auth/constants/userPresets';
import { useBrand } from './BrandContext';

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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setActiveBrand } = useBrand();

  const defaultAdmin: UserSession = {
    id: 'user-1',
    name: 'Marcelo Nascimento',
    email: 'marcelo.nascimento@atlasgr.com.br',
    role: 'admin',
    roleTitle: 'Administrador Master (Acesso Total)',
    brand: 'atlasgr',
    permissions: ['all', 'admin_panel', 'user_management', 'global_metrics', 'prompt_studio'],
    avatarBg: 'bg-gradient-to-r from-orange-500 to-amber-500'
  };

  const [currentUser, setCurrentUser] = useState<UserSession | null>(() => {
    const saved = localStorage.getItem('atlas_user_session');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return defaultAdmin;
      }
    }
    return defaultAdmin;
  });

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('atlas_user_session', JSON.stringify(currentUser));
    }
  }, [currentUser]);

  const loginAsPreset = (preset: UserPreset) => {
    const isAdmin = preset.email.toLowerCase() === 'marcelo.nascimento@atlasgr.com.br';
    const session: UserSession = {
      id: preset.id,
      name: preset.name,
      email: preset.email,
      role: isAdmin ? 'admin' : 'user',
      roleTitle: isAdmin ? 'Administrador Master (Acesso Total)' : `Executivo de Vendas (${preset.role})`,
      brand: preset.brand,
      permissions: ['all', 'atlasgr', 'totaltrac', 'prospector', 'crm', 'intelligence', 'chatbook'],
      avatarBg: preset.avatarBg
    };

    setCurrentUser(session);
    setActiveBrand(preset.brand);
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('atlas_user_session');
  };

  const isAdmin = currentUser?.role === 'admin';

  const canAccessAdminPanel = () => true;

  // LIBERADO 100%: Todos os usuários podem acessar AtlasGR e TotalTrac!
  const canAccessBrand = () => true;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAdmin,
        loginAsPreset,
        logout,
        canAccessAdminPanel,
        canAccessBrand
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
