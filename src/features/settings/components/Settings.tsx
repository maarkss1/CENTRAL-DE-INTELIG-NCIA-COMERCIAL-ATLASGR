import { useState } from 'react';
import { Sun, Moon, Check, User, Users, Puzzle, Flag, Shield } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '../../../components/ui/Card';
import { Logo } from '../../../components/Logo';
import { TotalTrackLogo } from '../../../components/TotalTrackLogo';
import { IconSliders } from '../../../components/icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { useBrand, BRAND_CONFIGS, type Brand } from '../../../contexts/BrandContext';
import { useAuth } from '../../../contexts/AuthContext';
import { hasRequiredRole } from '../../../lib/auth/authorization';
import { FeatureFlagsPanel } from '../../feature-flags/components/FeatureFlagsPanel';
import { Team } from '../../team/components/Team';
import { Integrations } from '../../integrations/components/Integrations';
import { AuditLogs } from '../../lgpd/components/AuditLogs';
import { DataSubjectRights } from '../../lgpd/components/DataSubjectRights';

const BRAND_OPTIONS: Brand[] = ['atlasgr', 'totaltrac'];

export function Settings() {
  const { theme, setThemeMode } = useTheme();
  const { activeBrand, setActiveBrand } = useBrand();
  const { currentUser, isAdmin } = useAuth();
  // GESTOR também pode ler auditoria no backend (`lgpd.routes.ts`, `requireRole(['ADMIN',
  // 'GESTOR'])`, já coberto por teste), mas a aba só checava `isAdmin` — GESTOR nunca tinha como
  // chegar numa ação que o próprio backend autoriza (achado do Piloto 025, mesmo tipo de bug de
  // RBAC dos pilotos anteriores, só que na direção oposta: esconder em vez de mostrar demais).
  const canViewAudit = hasRequiredRole(currentUser?.role ?? '', ['ADMIN', 'GESTOR']);

  const [activeTab, setActiveTab] = useState<
    'profile' | 'users' | 'integrations' | 'featureFlags' | 'audit'
  >('profile');

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent overflow-hidden">
      {/* Header com Abas */}
      <div className="bg-surface border-b border-line px-6 sm:px-8 pt-8 shrink-0">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-surface-2 border border-line rounded-xl flex items-center justify-center shadow-sm text-brand">
              <IconSliders className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-ink">Configurações</h1>
              <p className="text-ink-2 text-sm">
                Gerencie sua conta, equipe, integrações e sistema.
              </p>
            </div>
          </div>

          <div className="flex gap-6 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`flex items-center gap-2 pb-3 border-b-2 font-bold text-sm transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'profile'
                  ? 'border-brand text-brand-active dark:text-brand-2'
                  : 'border-transparent text-ink-2 hover:text-ink hover:border-line'
              }`}
            >
              <User size={16} /> Perfil e Aparência
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('users')}
                className={`flex items-center gap-2 pb-3 border-b-2 font-bold text-sm transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'users'
                    ? 'border-brand text-brand-active dark:text-brand-2'
                    : 'border-transparent text-ink-2 hover:text-ink hover:border-line'
                }`}
              >
                <Users size={16} /> Usuários
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('integrations')}
              className={`flex items-center gap-2 pb-3 border-b-2 font-bold text-sm transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'integrations'
                  ? 'border-brand text-brand-active dark:text-brand-2'
                  : 'border-transparent text-ink-2 hover:text-ink hover:border-line'
              }`}
            >
              <Puzzle size={16} /> Integrações
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('featureFlags')}
                className={`flex items-center gap-2 pb-3 border-b-2 font-bold text-sm transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'featureFlags'
                    ? 'border-brand text-brand-active dark:text-brand-2'
                    : 'border-transparent text-ink-2 hover:text-ink hover:border-line'
                }`}
              >
                <Flag size={16} /> Feature Flags
              </button>
            )}
            {canViewAudit && (
              <button
                type="button"
                onClick={() => setActiveTab('audit')}
                className={`flex items-center gap-2 pb-3 border-b-2 font-bold text-sm transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'audit'
                    ? 'border-brand text-brand-active dark:text-brand-2'
                    : 'border-transparent text-ink-2 hover:text-ink hover:border-line'
                }`}
              >
                <Shield size={16} /> Auditoria & LGPD
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Conteúdo da Aba */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'profile' && (
          <div className="p-6 sm:p-8">
            <div className="max-w-4xl mx-auto space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Perfil</CardTitle>
                  <CardDescription>Dados da conta autenticada — somente leitura.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    {currentUser?.image ? (
                      <img
                        src={currentUser.image}
                        alt=""
                        className="w-14 h-14 rounded-full border border-line object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-surface-2 border border-line flex items-center justify-center text-ink font-bold text-lg">
                        {currentUser?.name?.slice(0, 2).toUpperCase() || 'US'}
                      </div>
                    )}
                    <div>
                      <p className="font-bold text-ink text-base">
                        {currentUser?.name || 'Usuário'}
                      </p>
                      <p className="text-xs text-ink-2">
                        {currentUser?.email || 'email@exemplo.com'}
                      </p>
                      <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-brand/10 text-brand-active dark:text-brand-2">
                        {currentUser?.role || 'USUÁRIO'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Aparência e Tema</CardTitle>
                  <CardDescription>Escolha o tema visual e a marca da interface.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    {/* Não é <label htmlFor>: rotula um grupo de botões de escolha (Escuro/Claro),
                        não um único controle — role="group" + aria-labelledby é a associação
                        correta aqui. */}
                    <span
                      id="settings-theme-label"
                      className="text-xs font-bold text-ink-2 uppercase tracking-wider block mb-3"
                    >
                      Tema
                    </span>
                    <div role="group" aria-labelledby="settings-theme-label" className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => setThemeMode('dark')}
                        aria-pressed={theme === 'dark'}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border font-bold text-sm transition-all ${
                          theme === 'dark'
                            ? 'border-brand bg-brand/10 text-ink'
                            : 'border-line bg-surface-2 text-ink-2 hover:text-ink'
                        }`}
                      >
                        <Moon size={18} /> Modo Escuro
                      </button>
                      <button
                        type="button"
                        onClick={() => setThemeMode('light')}
                        aria-pressed={theme === 'light'}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border font-bold text-sm transition-all ${
                          theme === 'light'
                            ? 'border-brand bg-brand/10 text-ink'
                            : 'border-line bg-surface-2 text-ink-2 hover:text-ink'
                        }`}
                      >
                        <Sun size={18} /> Modo Claro
                      </button>
                    </div>
                  </div>

                  <div>
                    {/* Não é <label htmlFor>: rotula um grupo de botões de escolha de marca, não
                        um único controle — role="group" + aria-labelledby é a associação correta
                        aqui. */}
                    <span
                      id="settings-brand-label"
                      className="text-xs font-bold text-ink-2 uppercase tracking-wider block mb-3"
                    >
                      Marca Ativa
                    </span>
                    <div
                      role="group"
                      aria-labelledby="settings-brand-label"
                      className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                    >
                      {BRAND_OPTIONS.map((brand) => (
                        <button
                          key={brand}
                          type="button"
                          onClick={() => setActiveBrand(brand)}
                          className={`flex items-center justify-between p-4 rounded-xl border transition-all text-left ${
                            activeBrand === brand
                              ? 'border-brand bg-brand/5 shadow-sm'
                              : 'border-line bg-surface-2/40 hover:bg-surface-2 text-ink-2 hover:text-ink'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {brand === 'atlasgr' ? (
                              <Logo className="h-6 w-auto" />
                            ) : (
                              <TotalTrackLogo className="h-6 w-auto" />
                            )}
                            <div>
                              <p className="font-bold text-sm text-ink">
                                {BRAND_CONFIGS[brand].name}
                              </p>
                              <p className="text-xs text-ink-2">
                                {BRAND_CONFIGS[brand].operatingSystemName}
                              </p>
                            </div>
                          </div>
                          {activeBrand === brand && (
                            <div className="w-5 h-5 rounded-full bg-brand-active text-white flex items-center justify-center">
                              <Check size={12} />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'users' && isAdmin && (
          <div className="relative h-full flex flex-col">
            <Team />
          </div>
        )}

        {activeTab === 'integrations' && (
          <div className="relative h-full flex flex-col">
            <Integrations />
          </div>
        )}

        {activeTab === 'featureFlags' && isAdmin && (
          <div className="p-6 sm:p-8">
            <div className="max-w-4xl mx-auto">
              <FeatureFlagsPanel />
            </div>
          </div>
        )}

        {activeTab === 'audit' && canViewAudit && (
          <div className="p-6 sm:p-8">
            <div className="max-w-5xl mx-auto space-y-6">
              <DataSubjectRights />
              <AuditLogs />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
