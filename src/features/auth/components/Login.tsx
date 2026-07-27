import { useState } from 'react';
import { authClient } from '../../../lib/auth-client';
import { Logo } from '../../../components/Logo';
import { TotalTrackLogo } from '../../../components/TotalTrackLogo';

export function Login() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSocialLogin = async (provider: 'google' | 'microsoft') => {
        setIsLoading(true);
        setError(null);
        try {
            await authClient.signIn.social({
                provider,
                callbackURL: '/app',
            });
        } catch (err: any) {
            setError(`Falha ao fazer login com ${provider}. Tente novamente.`);
            setIsLoading(false);
        }
    };

    const handleDevLogin = async () => {
        setIsLoading(true);
        setError(null);
        try {
            await authClient.signUp.email({
                email: 'admin@prospector.com',
                password: 'password123',
                name: 'Administrador',
                callbackURL: '/app'
            }).catch(() => {});
            
            const res = await authClient.signIn.email({
                email: 'admin@prospector.com',
                password: 'password123',
                callbackURL: '/app'
            });
            
            if (res.error) {
                setError(res.error.message || 'Erro no login de dev');
                setIsLoading(false);
            }
        } catch (err: any) {
            setError('Falha no login de desenvolvimento.');
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Split Glowing Background: Left Orange / Right Blue */}
            <div className="absolute inset-0 flex z-0 overflow-hidden pointer-events-none">
                <div className="w-1/2 h-full bg-gradient-to-br from-amber-600 via-orange-600 to-rose-700 opacity-30 blur-2xl" />
                <div className="w-1/2 h-full bg-gradient-to-bl from-sky-500 via-blue-600 to-indigo-800 opacity-30 blur-2xl" />
            </div>

            <div className="relative z-10 w-full max-w-md bg-[#121214]/85 backdrop-blur-2xl border border-white/15 rounded-[3rem] p-10 shadow-[0_25px_60px_rgba(0,0,0,0.6)]">
                <div className="text-center mb-8">
                    <div className="flex items-center justify-center gap-6 mb-6 p-4 rounded-3xl bg-white/5 border border-white/10 shadow-inner">
                        <Logo variant="white" className="h-10" />
                        <div className="h-8 w-[1px] bg-white/20" />
                        <TotalTrackLogo className="h-9" />
                    </div>
                    <h2 className="text-xl font-black text-white tracking-tight uppercase">Plataforma Comercial</h2>
                    <p className="text-gray-400 text-xs font-medium mt-1">
                        AtlasGR & TotalTrac • Inteligência B2B
                    </p>
                </div>

                {error && (
                    <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    <button
                        onClick={() => handleSocialLogin('google')}
                        disabled={isLoading}
                        className="w-full relative group flex items-center justify-center gap-3 px-6 py-4 rounded-full bg-white/5 border border-white/10 text-white font-bold transition-all duration-300 hover:bg-white/10 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden shadow-md"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <svg className="w-5 h-5 relative z-10" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        <span className="relative z-10">Continuar com Google</span>
                    </button>

                    <button
                        onClick={() => handleSocialLogin('microsoft')}
                        disabled={isLoading}
                        className="w-full relative group flex items-center justify-center gap-3 px-6 py-4 rounded-full bg-white/5 border border-white/10 text-white font-bold transition-all duration-300 hover:bg-white/10 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden shadow-md"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <svg className="w-5 h-5 relative z-10" viewBox="0 0 21 21">
                            <path fill="#f35325" d="M0 0h10v10H0z" />
                            <path fill="#81bc06" d="M11 0h10v10H11z" />
                            <path fill="#05a6f0" d="M0 11h10v10H0z" />
                            <path fill="#ffba08" d="M11 11h10v10H11z" />
                        </svg>
                        <span className="relative z-10">Continuar com Microsoft</span>
                    </button>

                    <div className="relative flex items-center py-2">
                        <div className="flex-grow border-t border-white/10"></div>
                        <span className="flex-shrink-0 mx-4 text-xs font-bold text-gray-500">OU</span>
                        <div className="flex-grow border-t border-white/10"></div>
                    </div>

                    <button
                        onClick={handleDevLogin}
                        disabled={isLoading}
                        className="w-full relative group flex items-center justify-center gap-3 px-6 py-4 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black transition-all duration-300 hover:brightness-110 shadow-[0_10px_30px_rgba(255,86,24,0.4)] disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                    >
                        <span className="relative z-10">🚀 Login Rápido (Desenvolvimento)</span>
                    </button>
                </div>

                <div className="mt-8 pt-6 border-t border-white/5">
                    <p className="text-xs text-center text-gray-500 font-medium">
                        Acesso exclusivo para clientes corporativos.<br />
                        Ambiente protegido e monitorado (Zero Trust).
                    </p>
                </div>
            </div>
        </div>
    );
}
