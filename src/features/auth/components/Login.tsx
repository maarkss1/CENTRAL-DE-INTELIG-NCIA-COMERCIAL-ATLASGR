import { useState } from 'react';
import { authClient } from '../../../lib/auth-client';

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
            // The browser will redirect to the OAuth provider, so we won't hit here immediately
        } catch (err: any) {
            setError(`Falha ao fazer login com ${provider}. Tente novamente.`);
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-4">
            {/* Background elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px]" />
            </div>

            <div className="relative w-full max-w-md bg-[#121214]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 mb-6">
                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">NexusOne OS</h1>
                    <p className="text-gray-400 text-sm">
                        Enterprise Prospecting & Intelligence
                    </p>
                </div>

                {error && (
                    <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    <button
                        onClick={() => handleSocialLogin('google')}
                        disabled={isLoading}
                        className="w-full relative group flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white font-medium transition-all duration-300 hover:bg-white/10 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
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
                        className="w-full relative group flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white font-medium transition-all duration-300 hover:bg-white/10 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <svg className="w-5 h-5 relative z-10" viewBox="0 0 21 21">
                            <path fill="#f35325" d="M0 0h10v10H0z" />
                            <path fill="#81bc06" d="M11 0h10v10H11z" />
                            <path fill="#05a6f0" d="M0 11h10v10H0z" />
                            <path fill="#ffba08" d="M11 11h10v10H11z" />
                        </svg>
                        <span className="relative z-10">Continuar com Microsoft</span>
                    </button>
                </div>

                <div className="mt-8 pt-6 border-t border-white/5">
                    <p className="text-xs text-center text-gray-500">
                        Acesso exclusivo para clientes corporativos.<br />
                        Ambiente protegido e monitorado (Zero Trust).
                    </p>
                </div>
            </div>
        </div>
    );
}
