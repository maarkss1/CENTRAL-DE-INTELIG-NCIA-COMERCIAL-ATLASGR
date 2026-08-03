import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useBrand, BRAND_CONFIGS } from '../../../contexts/BrandContext';
import { authClient } from '../../../lib/auth-client';
import { isAuthorizedLoginEmail, getBrandFromEmail } from '../../../config/access-policy';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const navigate = useNavigate();
  const { activeBrand, setActiveBrand, brandInfo } = useBrand();

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

      <div className="w-full max-w-md relative z-10">

        {/* Card de Autenticação */}
        <div className="glass-panel p-8 sm:p-10 rounded-[2.5rem] border border-white/10 bg-slate-900/80 shadow-2xl relative">
          <div className="flex flex-col items-center mb-6">
            <div className="flex items-center gap-1 mb-6 bg-slate-800/60 border border-white/10 rounded-full p-1">
              {(Object.keys(BRAND_CONFIGS) as Array<keyof typeof BRAND_CONFIGS>).map((brand) => (
                <button
                  key={brand}
                  type="button"
                  onClick={() => setActiveBrand(brand)}
                  className={`px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    activeBrand === brand
                      ? 'bg-white text-slate-900 shadow'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {BRAND_CONFIGS[brand].name}
                </button>
              ))}
            </div>
            {activeBrand === 'atlasgr' ? (
              <img src="/atlas-logo.svg" alt="AtlasGR" className="h-10 w-auto object-contain" />
            ) : (
              <img src="/totaltrack-logo.png" alt="TotalTrac" className="h-10 w-auto object-contain" />
            )}
            <p className="text-gray-400 text-xs mt-3 font-medium text-center">{brandInfo.slogan}</p>
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

      </div>
    </div>
  );
}
