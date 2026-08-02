import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { useBrand } from '../../../contexts/BrandContext';
import { authClient } from '../../../lib/auth-client';
import { isAuthorizedLoginEmail, getBrandFromEmail, AUTHORIZED_LOGIN_DOMAINS } from '../../../config/access-policy';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const navigate = useNavigate();
  const { setActiveBrand } = useBrand();

  const handleGoogleLogin = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/app'
      });
    } catch (err) {
      console.error('Erro no Google Login:', err);
      setError('Falha ao autenticar com o Google. Certifique-se de utilizar uma conta corporativa (@atlasgr.com.br ou @totaltrac.com.br).');
      setIsSubmitting(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    if (!isAuthorizedLoginEmail(email)) {
      setError('Acesso restrito. Utilize um e-mail corporativo autorizado da AtlasGR (@atlasgr.com.br) ou TotalTrac (@totaltrac.com.br).');
      setIsSubmitting(false);
      return;
    }

    setActiveBrand(getBrandFromEmail(email));

    // A validação de credenciais é feita inteiramente pelo servidor (better-auth);
    // o cliente nunca decide, por conta própria, se um login é válido.
    const result = isSignUp
      ? await authClient.signUp.email({ email, password, name: name || email.split('@')[0], callbackURL: '/app' })
      : await authClient.signIn.email({ email, password, callbackURL: '/app' });

    if (result.error) {
      setError(result.error.message || 'Não foi possível autenticar. Verifique suas credenciais.');
      setIsSubmitting(false);
      return;
    }

    navigate('/app');
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex items-center justify-center relative overflow-hidden font-sans p-4">
      {/* Elementos Ambientais Gradient Glow */}
      <motion.div
        animate={{ scale: [1, 1.1, 1], rotate: [0, 90, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-atlas-orange/15 rounded-full blur-[120px] pointer-events-none"
      />
      <motion.div
        animate={{ scale: [1, 1.2, 1], rotate: [0, -90, 0] }}
        transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
        className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[140px] pointer-events-none"
      />

      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
        
        {/* Painel Esquerdo: Formulário de Autenticação */}
        <div className="lg:col-span-6 glass-panel p-8 sm:p-10 rounded-[2.5rem] border border-white/10 bg-slate-900/80 shadow-2xl relative">
          <div className="flex flex-col items-center mb-6">
            <div className="flex items-center gap-4 mb-4 bg-white rounded-2xl px-5 py-3 shadow-lg">
              <img src="/atlas-logo.svg" alt="AtlasGR" className="h-9 w-auto object-contain" />
              <div className="h-8 w-px bg-slate-200" />
              <img src="/totaltrack-logo.png" alt="TotalTrac" className="h-9 w-auto object-contain" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">AtlasGR & TotalTrac</h1>
            <p className="text-gray-400 text-xs mt-1 font-medium text-center">Plataforma Unificada de Inteligência Comercial B2B</p>
          </div>

          <div className="space-y-4 mb-4">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isSubmitting}
              className="w-full bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs py-3.5 px-4 rounded-2xl border border-gray-200 shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-3 cursor-pointer active:scale-[0.98] disabled:opacity-50"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              <span>Entrar com Google (AtlasGR / TotalTrac)</span>
            </button>

            <div className="relative flex items-center justify-center my-4">
              <div className="border-t border-white/10 w-full"></div>
              <span className="bg-slate-900 px-3 text-[10px] uppercase tracking-wider text-gray-400 font-bold absolute">ou e-mail corporativo</span>
            </div>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="bg-red-500/10 border border-red-500/30 text-red-300 p-3.5 rounded-2xl text-xs flex items-start gap-2.5"
              >
                <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-400" />
                <p>{error}</p>
              </motion.div>
            )}

            {isSignUp && (
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1">Seu Nome Completo</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-800/90 border border-white/10 rounded-2xl px-4 py-3.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-atlas-orange transition-all"
                  placeholder="Ex: Marcelo Nascimento"
                  required={isSignUp}
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1">E-mail Corporativo Autorizado</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-800/90 border border-white/10 rounded-2xl px-4 py-3.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-atlas-orange transition-all"
                placeholder="seu.nome@atlasgr.com.br ou @totaltrac.com.br"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 ml-1">Senha de Acesso</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-800/90 border border-white/10 rounded-2xl px-4 py-3.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-atlas-orange transition-all"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !email || !password}
              className="w-full mt-2 bg-gradient-to-r from-atlas-orange to-amber-500 text-white py-3.5 rounded-2xl font-extrabold text-xs shadow-lg shadow-atlas-orange/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  {isSignUp ? 'Criar Nova Conta' : 'Entrar na Plataforma'} <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
              }}
              className="text-xs text-gray-400 hover:text-atlas-orange font-bold transition-colors cursor-pointer"
            >
              {isSignUp ? 'Já possui conta? Fazer Login' : 'Não possui conta? Registrar Novo Acesso'}
            </button>
          </div>
        </div>

        {/* Painel Direito: Informações de Acesso */}
        <div className="lg:col-span-6 space-y-4">
          <div className="glass-panel p-6 rounded-[2.5rem] border border-white/10 bg-slate-900/60 backdrop-blur-xl">
            <div className="flex items-center gap-2 pb-3 border-b border-white/10 mb-4">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h3 className="font-extrabold text-white text-sm">Acesso Corporativo</h3>
            </div>

            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              O acesso é restrito a contas de e-mail corporativas verificadas pelo servidor. Use sua conta Google
              corporativa ou seu e-mail e senha cadastrados junto aos domínios autorizados abaixo:
            </p>

            <div className="space-y-2">
              {AUTHORIZED_LOGIN_DOMAINS.map((domain) => (
                <div
                  key={domain}
                  className="p-3 rounded-2xl border border-white/5 bg-slate-800/60 text-gray-300 text-xs font-semibold"
                >
                  @{domain}
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-center">
            <p className="text-[11px] text-gray-400 font-medium">
              🔒 Autenticação obrigatória e validada pelo servidor. Nenhuma credencial é aceita sem verificação real.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
