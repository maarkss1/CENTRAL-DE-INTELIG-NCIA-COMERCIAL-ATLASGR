import { useState } from 'react';
import { Sun, Moon, Check, User, Users, Puzzle, Flag } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import { Logo } from '../../../components/Logo';
import { TotalTrackLogo } from '../../../components/TotalTrackLogo';
import { IconSliders } from '../../../components/icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { useBrand, BRAND_CONFIGS, type Brand } from '../../../contexts/BrandContext';
import { useAuth } from '../../../contexts/AuthContext';
import { FeatureFlagsPanel } from '../../feature-flags/components/FeatureFlagsPanel';
import { Team } from '../../team/components/Team';
import { Integrations } from '../../integrations/components/Integrations';

const BRAND_OPTIONS: Brand[] = ['atlasgr', 'totaltrac'];

export function Settings() {
    const { theme, toggleTheme } = useTheme();
    const { activeBrand, setActiveBrand } = useBrand();
    const { currentUser, isAdmin } = useAuth();

    const [activeTab, setActiveTab] = useState<'profile' | 'users' | 'integrations' | 'featureFlags'>('profile');

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
                            <p className="text-ink-2 text-sm">Gerencie sua conta, equipe, integrações e sistema.</p>
                        </div>
                    </div>

                    <div className="flex gap-6 overflow-x-auto no-scrollbar">
                        <button
                            type="button"
                            onClick={() => setActiveTab('profile')}
                            className={`flex items-center gap-2 pb-3 border-b-2 font-bold text-sm transition-colors whitespace-nowrap cursor-pointer ${
                                activeTab === 'profile'
                                    ? 'border-brand text-brand'
                                    : 'border-transparent text-ink-2 hover:text-ink hover:border-line'
                            }`}
                        >
                            <User size={16} /> Perfil e Aparência
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('users')}
                            className={`flex items-center gap-2 pb-3 border-b-2 font-bold text-sm transition-colors whitespace-nowrap cursor-pointer ${
                                activeTab === 'users'
                                    ? 'border-brand text-brand'
                                    : 'border-transparent text-ink-2 hover:text-ink hover:border-line'
                            }`}
                        >
                            <Users size={16} /> Usuários
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('integrations')}
                            className={`flex items-center gap-2 pb-3 border-b-2 font-bold text-sm transition-colors whitespace-nowrap cursor-pointer ${
                                activeTab === 'integrations'
                                    ? 'border-brand text-brand'
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
                                        ? 'border-brand text-brand'
                                        : 'border-transparent text-ink-2 hover:text-ink hover:border-line'
                                }`}
                            >
                                <Flag size={16} /> Feature Flags
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
                                <CardContent>
                                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <dt className="text-xs font-bold uppercase tracking-wide text-ink-2">Nome</dt>
                                            <dd className="text-sm text-ink mt-1">{currentUser?.name ?? '—'}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs font-bold uppercase tracking-wide text-ink-2">E-mail</dt>
                                            <dd className="text-sm text-ink mt-1">{currentUser?.email ?? '—'}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs font-bold uppercase tracking-wide text-ink-2">Função</dt>
                                            <dd className="text-sm text-ink mt-1">{currentUser?.roleTitle ?? '—'}</dd>
                                        </div>
                                    </dl>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Aparência</CardTitle>
                                    <CardDescription>Tema da interface e marca comercial ativa.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-5">
                                    <div className="flex items-center justify-between gap-4 p-4 rounded-card border border-line bg-surface-2">
                                        <div>
                                            <p className="text-sm font-bold text-ink">Tema</p>
                                            <p className="text-xs text-ink-2 mt-0.5">
                                                {theme === 'dark' ? 'Escuro' : 'Claro'} — muda em toda a plataforma.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={toggleTheme}
                                            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-line bg-surface text-ink text-sm font-bold hover:bg-surface-2 transition-colors cursor-pointer"
                                        >
                                            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                                            Mudar para {theme === 'dark' ? 'claro' : 'escuro'}
                                        </button>
                                    </div>

                                    <div>
                                        <p className="text-sm font-bold text-ink mb-2">Marca ativa</p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {BRAND_OPTIONS.map((brand) => {
                                                const info = BRAND_CONFIGS[brand];
                                                const isActive = activeBrand === brand;
                                                return (
                                                    <button
                                                        key={brand}
                                                        type="button"
                                                        onClick={() => setActiveBrand(brand)}
                                                        aria-pressed={isActive}
                                                        className={`relative flex items-center gap-3 p-4 rounded-card border text-left transition-all cursor-pointer ${
                                                            isActive
                                                                ? 'border-brand bg-brand/10'
                                                                : 'border-line bg-surface hover:bg-surface-2'
                                                        }`}
                                                    >
                                                        {brand === 'atlasgr'
                                                            ? <Logo variant="symbol" className="h-8 w-8 shrink-0" />
                                                            : <TotalTrackLogo variant="symbol" className="h-8 w-8 shrink-0" />}
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-black text-ink">{info.name}</p>
                                                            <p className="text-xs text-ink-2 truncate">{info.operatingSystemName}</p>
                                                        </div>
                                                        {isActive && (
                                                            <Check className="w-4 h-4 text-brand ml-auto shrink-0" aria-hidden="true" />
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                )}
                
                {activeTab === 'users' && (
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
            </div>
        </div>
    );
}
