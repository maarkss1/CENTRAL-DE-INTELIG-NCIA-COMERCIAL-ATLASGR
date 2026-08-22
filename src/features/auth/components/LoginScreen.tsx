import { useState } from 'react';
import { Loader2, AlertCircle, ArrowRight, Mail } from 'lucide-react';
import { motion } from 'framer-motion';
import { useBrand, BRAND_CONFIGS } from '../../../contexts/BrandContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { authClient } from '../../../lib/auth-client';
import { isAuthorizedLoginEmail, getBrandFromEmail } from '../../../config/access-policy';
import { Logo } from '../../../components/Logo';
import { TotalTrackLogo } from '../../../components/TotalTrackLogo';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const { setActiveBrand } = useBrand();
  const { theme } = useTheme();
  
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    if (!isAuthorizedLoginEmail(email)) {
      setError('Acesso restrito. Utilize um e-mail corporativo autorizado da AtlasGR (@atlasgr.com.br) ou Total Trac (@totaltrac.com.br).');
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

    window.location.href = '/app';
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    if (!isAuthorizedLoginEmail(email)) {
      setError('Acesso restrito. Utilize um e-mail corporativo autorizado da AtlasGR (@atlasgr.com.br) ou Total Trac (@totaltrac.com.br).');
      setIsSubmitting(false);
      return;
    }

    const result = await authClient.requestPasswordReset({
      email,
      redirectTo: '/reset-password',
    });

    setIsSubmitting(false);

    if (result.error) {
      setError(result.error.message || 'Não foi possível enviar o e-mail de redefinição. Tente novamente.');
      return;
    }

    // O servidor sempre responde com sucesso, exista ou não o e-mail (evita que alguém descubra
    // quais e-mails têm conta só tentando redefinir a senha deles) — a mensagem abaixo reflete isso.
    setForgotPasswordSent(true);
  };

  const backToSignIn = () => {
    setIsForgotPassword(false);
    setForgotPasswordSent(false);
    setError('');
  };

  // Reflete a marca em tempo real conforme o domínio digitado, em vez de deixar o botão herdar
  // a última marca salva de uma sessão anterior (--brand só era atualizado no submit).
  const handleEmailChange = (value: string) => {
    setEmail(value);
    setActiveBrand(getBrandFromEmail(value));
  };

  return (
    <div className="min-h-screen bg-bg text-ink flex items-center justify-center relative overflow-hidden font-sans p-4 transition-colors">
      {/* Duas marcas convivem nesta tela (ambas as logos sempre visíveis) antes de o login
          confirmar qual é a real — mesma justificativa da WelcomeScreen (Piloto 001, CLAUDE.md
          §7.7): metade laranja (AtlasGR) / metade azul (Total Trac) com peso visual igual, tokens
          estáticos em vez de --brand reativo. Split linear substitui o indigo-500 genérico
          anterior (violava a regra #3 — gradiente azul/roxo de "IA genérica"). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black/[0.07]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-atlas-orange/30 via-transparent via-50% to-totaltrack-blue/30"
      />
      <motion.div
        aria-hidden="true"
        animate={{ scale: [1, 1.08, 1], rotate: [0, 90, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
        className="absolute left-[-12%] top-1/2 h-[640px] w-[560px] -translate-y-1/2 rounded-full bg-gradient-to-br from-atlas-orange/35 to-atlas-light-orange/15 blur-[120px] pointer-events-none"
      />
      <motion.div
        aria-hidden="true"
        animate={{ scale: [1, 1.1, 1], rotate: [0, -90, 0] }}
        transition={{ duration: 27, repeat: Infinity, ease: 'linear' }}
        className="absolute right-[-12%] top-1/2 h-[640px] w-[560px] -translate-y-1/2 rounded-full bg-gradient-to-bl from-totaltrack-blue/35 to-totaltrac-navy/15 blur-[120px] pointer-events-none"
      />

      <div className="w-full max-w-md relative z-10">

        {/* Card de Autenticação */}
        <div className="glass-panel p-8 sm:p-10 rounded-[2.5rem] border border-line bg-surface/95 shadow-2xl relative">
          <div className="flex flex-col items-center mb-6">
            {/* As duas marcas convivem com peso visual igual até o login confirmar qual é a real
                (e-mail define a marca em handleAuth) — mesmo padrão já usado em WelcomeScreen. */}
            <div className="flex items-center gap-5 mb-3">
              <Logo variant={theme === 'dark' ? 'white' : 'default'} className="h-8 w-auto" />
              <div className="h-8 w-px bg-line" aria-hidden="true" />
              <TotalTrackLogo className="h-8 w-auto" />
            </div>
            <motion.p
              className="text-center"
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
            >
              <motion.span
                className="inline-block font-black uppercase tracking-wide text-sm sm:text-base"
                style={{
                  backgroundImage: 'linear-gradient(90deg, #FF5618, #008FCE, #FF5618)',
                  backgroundSize: '200% 100%',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                  WebkitTextFillColor: 'transparent',
                }}
                animate={{
                  backgroundPosition: ['0% 50%', '200% 50%'],
                  scale: [1, 1.04, 1],
                  textShadow: [
                    '0 0 6px rgba(255,86,24,0.4)',
                    '0 0 14px rgba(0,143,206,0.5)',
                    '0 0 6px rgba(255,86,24,0.4)',
                  ],
                }}
                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                {BRAND_CONFIGS.atlasgr.slogan}
              </motion.span>
            </motion.p>
          </div>

          {isForgotPassword ? (
            <>
              {forgotPasswordSent ? (
                <div className="space-y-5 text-center">
                  <div className="bg-brand/10 border border-brand/30 text-ink p-3.5 rounded-2xl text-xs flex items-start gap-2.5 text-left">
                    <Mail size={16} className="shrink-0 mt-0.5 text-brand" />
                    <p>
                      Se <strong>{email}</strong> tiver uma conta cadastrada, enviamos um e-mail com um link para redefinir a senha.
                      O link expira em 1 hora.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={backToSignIn}
                    className="text-xs text-ink-2 hover:text-brand font-bold transition-colors cursor-pointer"
                  >
                    Voltar para o login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="bg-danger/10 border border-danger/30 text-danger p-3.5 rounded-2xl text-xs flex items-start gap-2.5"
                    >
                      <AlertCircle size={16} className="shrink-0 mt-0.5" />
                      <p>{error}</p>
                    </motion.div>
                  )}

                  <p className="text-ink-2 text-xs">
                    Informe o e-mail corporativo da sua conta. Se ele existir, enviaremos um link para redefinir a senha.
                  </p>

                  <div>
                    <label htmlFor="login-forgot-email" className="block text-[10px] font-bold text-ink-2 uppercase tracking-wider mb-1.5 ml-1">E-mail:</label>
                    <input
                      id="login-forgot-email"
                      type="email"
                      value={email}
                      onChange={(e) => handleEmailChange(e.target.value)}
                      className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3.5 text-xs text-ink placeholder-ink-2 focus:outline-none focus:ring-2 focus:ring-brand transition-all"
                      required
                      autoFocus
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !email}
                    className="w-full mt-2 bg-gradient-to-r from-brand to-brand-2 text-white py-3.5 rounded-2xl font-extrabold text-xs shadow-lg shadow-brand/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <>Enviar Link de Redefinição <ArrowRight size={16} /></>}
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={backToSignIn}
                      className="text-xs text-ink-2 hover:text-brand font-bold transition-colors cursor-pointer"
                    >
                      Voltar para o login
                    </button>
                  </div>
                </form>
              )}
            </>
          ) : (
            <>
              <form onSubmit={handleAuth} className="space-y-4">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="bg-danger/10 border border-danger/30 text-danger p-3.5 rounded-2xl text-xs flex items-start gap-2.5"
                  >
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <p>{error}</p>
                  </motion.div>
                )}

                {isSignUp && (
                  <div>
                    <label htmlFor="login-name" className="block text-[10px] font-bold text-ink-2 uppercase tracking-wider mb-1.5 ml-1">Seu Nome Completo</label>
                    <input
                      id="login-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3.5 text-xs text-ink placeholder-ink-2 focus:outline-none focus:ring-2 focus:ring-brand transition-all"
                      placeholder="Ex: Marcelo Nascimento"
                      required={isSignUp}
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="login-email" className="block text-[10px] font-bold text-ink-2 uppercase tracking-wider mb-1.5 ml-1">E-mail:</label>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3.5 text-xs text-ink placeholder-ink-2 focus:outline-none focus:ring-2 focus:ring-brand transition-all"
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5 ml-1 mr-1">
                    <label htmlFor="login-password" className="block text-[10px] font-bold text-ink-2 uppercase tracking-wider">Senha:</label>
                    {!isSignUp && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsForgotPassword(true);
                          setError('');
                        }}
                        className="text-[10px] font-bold text-ink-2 hover:text-brand transition-colors cursor-pointer"
                      >
                        Esqueci minha senha
                      </button>
                    )}
                  </div>
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3.5 text-xs text-ink placeholder-ink-2 focus:outline-none focus:ring-2 focus:ring-brand transition-all"
                    placeholder="••••••••"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !email || !password}
                  className="w-full mt-2 bg-gradient-to-r from-brand to-brand-2 text-white py-3.5 rounded-2xl font-extrabold text-xs shadow-lg shadow-brand/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
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
                  className="text-xs text-ink-2 hover:text-brand font-bold transition-colors cursor-pointer"
                >
                  {isSignUp ? 'Já possui conta? Fazer Login' : 'Não possui conta? Registrar Novo Acesso'}
                </button>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
