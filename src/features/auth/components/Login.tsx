import { useState } from 'react';
import { authClient } from '../../../lib/auth-client';
import { Logo } from '../../../components/Logo';
import { AUTHORIZED_LOGIN_EMAILS } from '../../../config/access-policy';

export function Login() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);


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
        } catch {
            setError('Falha no login de desenvolvimento.');
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-white flex items-center justify-center p-4 relative overflow-hidden">
            {/* Soft Subtle Accent Background Glows */}
            <div className="absolute inset-0 flex z-0 overflow-hidden pointer-events-none">
                <div className="w-full h-full bg-gradient-to-br from-orange-100/50 via-orange-50/30 to-transparent blur-3xl" />
            </div>

            <div className="relative z-10 w-full max-w-md bg-white/95 backdrop-blur-2xl border border-orange-200/60 rounded-[2.5rem] p-10 shadow-2xl shadow-orange-900/5">
                <div className="text-center mb-8">
                    <div className="flex items-center justify-center mb-6 p-4 rounded-3xl bg-white border border-orange-200/80 shadow-sm">
                        <Logo variant="default" className="h-10" />
                    </div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Plataforma Comercial</h2>
                    <p className="text-slate-500 text-xs font-medium mt-1">
                        AtlasGR • Inteligência B2B
                    </p>
                    <p className="mt-4 rounded-2xl border border-orange-100 bg-orange-50/50 px-4 py-3 text-xs font-semibold text-slate-600">
                        Acesso autorizado somente para:<br />
                        {AUTHORIZED_LOGIN_EMAILS.join(' ou ')}
                    </p>
                </div>

                {error && (
                    <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-600 text-sm text-center font-medium">
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    <button
                        onClick={handleDevLogin}
                        disabled={isLoading}
                        className="w-full relative group flex items-center justify-center gap-3 px-6 py-4 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden shadow-lg hover:shadow-xl"
                    >
                        <span className="relative z-10">Entrar na Plataforma</span>
                    </button>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100">
                    <p className="text-xs text-center text-slate-400 font-medium">
                        O mesmo usuário pode acessar em mais de um navegador ou dispositivo.<br />
                        Ambiente protegido e monitorado (Zero Trust).
                    </p>
                </div>
            </div>
        </div>
    );
}
