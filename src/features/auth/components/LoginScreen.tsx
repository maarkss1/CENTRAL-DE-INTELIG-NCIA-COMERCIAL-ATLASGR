import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, ArrowRight, ShieldCheck, Key, Sparkles, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { AtlasLogo } from '../../../components/ui/AtlasLogo';
import { PRESET_USERS, UserPreset } from '../constants/userPresets';
import { useBrand } from '../../../contexts/BrandContext';
import { useAuth } from '../../../contexts/AuthContext';

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

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    // Validação Local Imediata para os Usuários Previamente Autorizados
    const matchedPreset = PRESET_USERS.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password
    );

    if (matchedPreset) {
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
      loginAsPreset(matchedByEmail);
      setIsSubmitting(false);
      navigate('/app');
      return;
    }

    // Qualquer novo acesso de e-mail corporativo
    if (email.includes('@atlasgr.com.br') || email.includes('@totaltrack.com.br') || email.includes('@')) {
      const customPreset: UserPreset = {
        id: `user-custom-${Date.now()}`,
        name: name || email.split('@')[0],
        email: email,
        password: password,
        role: 'Executivo Comercial B2B',
        brand: email.includes('totaltrack') ? 'totaltrac' : 'atlasgr',
        avatarBg: 'bg-gradient-to-r from-orange-500 to-amber-500'
      };
      loginAsPreset(customPreset);
      setIsSubmitting(false);
      navigate('/app');
      return;
    }

    setError('Credenciais não encontradas. Selecione um dos usuários credenciados no painel.');
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-[#030305] text-slate-100 flex items-center justify-center relative overflow-hidden font-sans p-4">
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
              <AtlasLogo className="w-9 h-9" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">AtlasGR & TotalTrac</h1>
            <p className="text-gray-400 text-xs mt-1 font-medium text-center">Plataforma Unificada de Inteligência Comercial B2B</p>
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
                placeholder="marcelo.nascimento@atlasgr.com.br ou joao.reis..."
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
