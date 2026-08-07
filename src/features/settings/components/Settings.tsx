import { Sun, Moon, Check } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import { Logo } from '../../../components/Logo';
import { TotalTrackLogo } from '../../../components/TotalTrackLogo';
import { IconSliders } from '../../../components/icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { useBrand, BRAND_CONFIGS, type Brand } from '../../../contexts/BrandContext';
import { useAuth } from '../../../contexts/AuthContext';

const BRAND_OPTIONS: Brand[] = ['atlasgr', 'totaltrac'];

export function Settings() {
    const { theme, toggleTheme } = useTheme();
    const { activeBrand, setActiveBrand } = useBrand();
    const { currentUser } = useAuth();

    return (
        <div className="flex-1 overflow-y-auto bg-transparent p-8">
            <div className="max-w-3xl mx-auto space-y-6">
                <div className="flex items-center gap-4 border-b border-line pb-6">
                    <div className="w-12 h-12 bg-surface rounded-xl flex items-center justify-center shadow-sm text-brand">
                        <IconSliders className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-ink">Configurações</h1>
                        <p className="text-ink-2">Tema, marca ativa e dados da sua conta.</p>
                    </div>
                </div>

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
                                                : <TotalTrackLogo className="h-8 w-8 shrink-0 text-ink" />}
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
            </div>
        </div>
    );
}
