import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, ArrowRight, ShieldCheck, Key, Sparkles, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { AtlasLogo } from '../../../components/ui/AtlasLogo';
import { PRESET_USERS, UserPreset } from '../constants/userPresets';
import { useBrand } from '../../../contexts/BrandContext';
import { useAuth } from '../../../contexts/AuthContext';
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
  const { setActiveBrand } = useBrand();
  const { loginAsPreset } = useAuth();

  const handleSelectPreset = (user: UserPreset) => {
    setEmail(user.email);
    setPassword(user.password);
    setActiveBrand(user.brand);
  };

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

    // Validação Local Imediata para os Usuários Previamente Autorizados
    const matchedPreset = PRESET_USERS.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password
    );

    if (matchedPreset) {
      setActiveBrand(matchedPreset.brand);
      loginAsPreset(matchedPreset);
      setIsSubmitting(false);
      navigate('/app');
      return;
    }

    // Se o usuário digitou e-mail de empresa cadastrada
    const matchedByEmail = PRESET_USERS.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase()
    );

    if (matchedByEmail) {
      setActiveBrand(matchedByEmail.brand);
      loginAsPreset(matchedByEmail);
      setIsSubmitting(false);
      navigate('/app');
      return;
    }

    // Qualquer novo acesso de e-mail corporativo autorizados (atlasgr ou totaltrac)
    if (isAuthorizedLoginEmail(email)) {
      const brand = getBrandFromEmail(email);
      const customPreset: UserPreset = {
        id: `user-custom-${Date.now()}`,
        name: name || email.split('@')[0],
        email: email,
        password: password,
        role: brand === 'totaltrac' ? 'Gerente de Frotas & Operações' : 'Executivo Comercial B2B',
        brand: brand,
        avatarBg: brand === 'totaltrac' ? 'bg-gradient-to-r from-sky-500 to-blue-600' : 'bg-gradient-to-r from-orange-500 to-amber-500'
      };
      setActiveBrand(brand);
      loginAsPreset(customPreset);
      setIsSubmitting(false);
      navigate('/app');
      return;
    }

    setError('Acesso restrito. Utilize um e-mail corporativo autorizado da AtlasGR (@atlasgr.com.br) ou TotalTrac (@totaltrac.com.br).');
    setIsSubmitting(false);
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
            <div className="w-16 h-16 bg-gradient-to-br from-atlas-orange via-amber-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-4 text-white shadow-lg shadow-atlas-orange/20">
              <AtlasLogo className="w-9 h-9" color="#FFFFFF" />
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

        {/* Painel Direito: Acesso Rápido - Usuários Credenciados Solicitados */}
        <div className="lg:col-span-6 space-y-4">
          <div className="glass-panel p-6 rounded-[2.5rem] border border-white/10 bg-slate-900/60 backdrop-blur-xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="font-extrabold text-white text-sm">Contas Pré-Autorizadas</h3>
              </div>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Clique para Preencher
              </span>
            </div>

            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              Selecione qualquer uma das contas corporativas abaixo para preencher as credenciais e acessar a primeira tela:
            </p>

            <div className="space-y-3">
              {PRESET_USERS.map((user) => (
                <div
                  key={user.id}
                  onClick={() => handleSelectPreset(user)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                    email === user.email
                      ? 'bg-atlas-orange/20 border-atlas-orange text-white shadow-lg shadow-atlas-orange/10'
                      : 'bg-slate-800/60 border-white/5 hover:bg-slate-800 hover:border-white/20 text-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl ${user.avatarBg} flex items-center justify-center font-bold text-white text-xs shadow-md`}>
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white text-xs">{user.name}</h4>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-extrabold ${user.brand === 'atlasgr' ? 'bg-orange-500/20 text-orange-300' : 'bg-sky-500/20 text-sky-300'}`}>
                          {user.brand.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 font-medium">{user.email}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold text-gray-400 block flex items-center gap-1 justify-end">
                      <Key className="w-3 h-3 text-amber-400" /> {user.password}
                    </span>
                    <span className="text-[9px] text-emerald-400 font-semibold flex items-center gap-1 justify-end">
                      {email === user.email ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : null}
                      {email === user.email ? 'Selecionado' : 'Usar Credencial'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-center">
            <p className="text-[11px] text-gray-400 font-medium">
              🔒 Autenticação Obrigatória: Faça login para acessar os Cards e o Relógio/Calendário na Primeira Tela.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
