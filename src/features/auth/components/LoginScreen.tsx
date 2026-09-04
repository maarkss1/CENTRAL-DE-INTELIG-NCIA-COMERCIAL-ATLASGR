import { useState, useEffect, lazy, Suspense } from 'react';
import {
  Loader2,
  AlertCircle,
  ArrowRight,
  Mail,
  Building2,
  ListChecks,
  Sparkles,
  Clock,
  CalendarDays,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useBrand, BRAND_CONFIGS, type Brand } from '../../../contexts/BrandContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { authClient } from '../../../lib/auth-client';
import { isAuthorizedLoginEmail, getBrandFromEmail } from '../../../config/access-policy';
import { Logo } from '../../../components/Logo';
import { TotalTrackLogo } from '../../../components/TotalTrackLogo';
import { fadeInUp, staggerContainer, staggerItem, useTilt, useMagnetic } from '../../../lib/motion';

// Chunk de ~900kB (@react-three/fiber/three) — importado à parte para não pesar a página de
// login, a primeira coisa que qualquer usuário (nem autenticado ainda) carrega. Mesmo cuidado do
// OnboardingTour (ver comentário em App.tsx sobre esse mesmo chunk), aqui via Suspense em vez de
// um import direto no topo do arquivo.
const AtlasOrb = lazy(() =>
  import('../../../components/ui/AtlasOrb').then((m) => ({ default: m.AtlasOrb })),
);

const BRAND_ORDER: Brand[] = ['atlasgr', 'totaltrac'];

// Prova de valor real ao lado do formulário (não é marketing genérico): reflete os grupos de
// jornada reais da Sidebar (src/components/layout/Sidebar.tsx) — Captar, Fechar, IA & Capacitação.
const FEATURES = [
  {
    icon: Building2,
    text: 'Prospecção com CNPJ oficial e decisores mapeados',
  },
  { icon: ListChecks, text: 'Pipeline comercial com automações, propostas e Bitrix24' },
  { icon: Sparkles, text: 'Dojo de Vendas: treino comercial com IA e capacitação contínua' },
] as const;

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Sem CTA visível de auto-registro na tela (contas são provisionadas pelo admin) — mas o
  // formulário de cadastro em si continua existindo e funcional (autorização real de domínio é
  // sempre server-side, ver isAuthorizedLoginEmail/databaseHooks.user.create.before em
  // src/lib/auth.ts), acessível via ?signup=1 para os testes e2e (tests/e2e/helpers.ts::signUp)
  // exercitarem o fluxo real de criação de conta sem depender de um link que não deve mais
  // aparecer para usuários reais.
  const [isSignUp] = useState(
    () => new URLSearchParams(window.location.search).get('signup') === '1',
  );
  const [name, setName] = useState('');
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const { activeBrand, setActiveBrand, brandInfo } = useBrand();
  const { theme } = useTheme();
  const brandAccent = useBrandAccent();

  // Inclinação 3D sutil do cartão de login seguindo o cursor, e puxão magnético do botão
  // principal — mesmos hooks premium já usados em outras peças "hero" da plataforma
  // (src/lib/motion.ts), ambos desligados automaticamente por prefers-reduced-motion.
  const cardTilt = useTilt(6);
  const submitMagnetic = useMagnetic(0.25);

  // Relógio e calendário ao vivo do painel do formulário: reforçam a sensação de central
  // operando agora, na cor da marca ativa no momento (mesmo princípio do AtlasOrb ao lado).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const weekday = format(now, 'EEEE', { locale: ptBR });
  const dateLabel = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${format(now, "dd 'de' MMMM", { locale: ptBR })}`;
  const timeLabel = format(now, 'HH:mm:ss');

  // O import do AtlasOrb (three.js, ~236KB gzip mesmo lazy — ver DOCUMENTED_LARGE_CHUNKS em
  // scripts/ci/check-bundle-budget.mjs) só dispara depois que o navegador fica ocioso, para não
  // competir por banda/CPU com o formulário no carregamento crítico da tela de login.
  const [showOrb, setShowOrb] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ric = window.requestIdleCallback;
    if (ric) {
      const id = ric(() => setShowOrb(true), { timeout: 1500 });
      return () => window.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setShowOrb(true), 400);
    return () => window.clearTimeout(id);
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    if (!isAuthorizedLoginEmail(email)) {
      setError(
        'Acesso restrito. Utilize um e-mail corporativo autorizado da AtlasGR (@atlasgr.com.br) ou Total Trac (@totaltrac.com.br).',
      );
      setIsSubmitting(false);
      return;
    }

    setActiveBrand(getBrandFromEmail(email));

    // A validação de credenciais é feita inteiramente pelo servidor (better-auth);
    // o cliente nunca decide, por conta própria, se um login é válido.
    const result = isSignUp
      ? await authClient.signUp.email({
          email,
          password,
          name: name || email.split('@')[0],
          callbackURL: '/app',
        })
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
      setError(
        'Acesso restrito. Utilize um e-mail corporativo autorizado da AtlasGR (@atlasgr.com.br) ou Total Trac (@totaltrac.com.br).',
      );
      setIsSubmitting(false);
      return;
    }

    const result = await authClient.requestPasswordReset({
      email,
      redirectTo: '/reset-password',
    });

    setIsSubmitting(false);

    if (result.error) {
      setError(
        result.error.message || 'Não foi possível enviar o e-mail de redefinição. Tente novamente.',
      );
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

  // Reflete a marca em tempo real conforme o domínio digitado — o toggle abaixo permite escolher a
  // marca antes de digitar o e-mail, mas o e-mail continua sendo a fonte de verdade no submit
  // (handleAuth chama getBrandFromEmail de novo), então os dois mecanismos nunca divergem.
  const handleEmailChange = (value: string) => {
    setEmail(value);
    setActiveBrand(getBrandFromEmail(value));
  };

  return (
    <main className="min-h-screen bg-bg text-ink flex font-sans transition-colors">
      {/* Painel de marca — visível a partir de lg, cor sólida da marca ativa (tokens --brand/
          --brand-2, reativos à troca via BrandContext) com prova de valor real do produto em vez de
          um hero centralizado genérico (regra visual #2). Substitui o antigo padrão de duas logos
          coexistindo com peso igual: o toggle no painel do formulário cumpre o mesmo papel (marca
          escolhida explicitamente, peso igual entre as duas opções) antes do e-mail confirmar. */}
      <div
        aria-hidden="true"
        className="hidden lg:flex lg:w-[44%] relative overflow-hidden items-center justify-center px-14 py-16 transition-colors duration-500"
        style={{
          background:
            'linear-gradient(150deg, rgba(0,0,0,0.32), rgba(0,0,0,0.04)), linear-gradient(150deg, var(--brand), var(--brand-2))',
        }}
      >
        <div className="pointer-events-none absolute -top-32 -left-24 w-[26rem] h-[26rem] rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-16 w-[30rem] h-[30rem] rounded-full bg-black/20 blur-3xl" />
        <svg
          className="pointer-events-none absolute inset-0 w-full h-full opacity-[0.08]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="login-dot-grid" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.6" fill="white" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#login-dot-grid)" />
        </svg>

        <motion.div
          key={activeBrand}
          initial="hidden"
          animate="show"
          variants={staggerContainer(0.08)}
          className="relative z-10 w-full max-w-sm"
        >
          <motion.div variants={staggerItem}>
            {activeBrand === 'atlasgr' ? (
              <Logo variant="white" className="h-10 w-auto" />
            ) : (
              <TotalTrackLogo tone="negative" className="h-10 w-auto" />
            )}
          </motion.div>

          <motion.h2
            variants={staggerItem}
            className="mt-10 text-3xl font-black leading-tight text-white text-balance"
          >
            {brandInfo.slogan}
          </motion.h2>
          <motion.p variants={staggerItem} className="mt-3 text-sm text-white/80">
            A central de prospecção e inteligência comercial da {brandInfo.name}.
          </motion.p>

          <ul className="mt-10 space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <motion.li key={text} variants={staggerItem} className="flex items-start gap-3">
                <span className="mt-0.5 grid place-items-center w-8 h-8 rounded-lg bg-white/15 shrink-0">
                  <Icon className="w-4 h-4 text-white" />
                </span>
                <span className="text-sm text-white/90 leading-snug pt-1.5">{text}</span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </div>

      {/* Painel do formulário — fundo claro (bg-surface): ao contrário do painel de marca acima,
          que comunica a marca ativa pela cor de fundo, aqui quem carrega a cor da marca é a
          tipografia (títulos, rótulos e links usam var(--brand) via useBrandAccent), então a
          identidade visual continua explícita mesmo neste lado "neutro" da tela. */}
      <div className="flex-1 min-w-0 relative overflow-hidden flex items-center justify-center p-4 sm:p-8">
        {/* Elemento 3D decorativo (esfera distorcida + partículas, cor da marca ativa) — puramente
            ambiental, por isso pointer-events-none e escondido em telas pequenas. */}
        {showOrb && (
          <div
            className="pointer-events-none absolute -top-8 -right-6 hidden sm:block opacity-80"
            aria-hidden="true"
          >
            <Suspense fallback={null}>
              <AtlasOrb size={150} />
            </Suspense>
          </div>
        )}

        <motion.div
          initial="hidden"
          animate="show"
          variants={fadeInUp}
          className="w-full min-w-0 max-w-sm relative z-10"
        >
          {/* Relógio e calendário ao vivo — mesma cor da marca ativa */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className={`mb-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm font-bold ${brandAccent.text}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={15} strokeWidth={2.5} aria-hidden="true" />
              {dateLabel}
            </span>
            <span className="h-1 w-1 rounded-full bg-current opacity-40" aria-hidden="true" />
            <span className="inline-flex items-center gap-1.5 tabular-nums" aria-live="off">
              <Clock size={15} strokeWidth={2.5} aria-hidden="true" />
              {timeLabel}
            </span>
          </motion.div>

          {/* Chave Atlas / Total Trac — escolha explícita da marca, peso visual igual entre as duas
              (mesmo objetivo do antigo par de logos lado a lado), sincronizada com handleEmailChange. */}
          <div className="flex justify-center mb-8">
            <div className="relative flex p-1 rounded-full bg-surface-2 border border-line">
              <div
                aria-hidden="true"
                className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-gradient-to-r from-brand to-brand-2 transition-transform duration-300 ease-out"
                style={{
                  transform:
                    activeBrand === 'atlasgr' ? 'translateX(0%)' : 'translateX(calc(100% + 8px))',
                }}
              />
              {BRAND_ORDER.map((brand) => (
                <button
                  key={brand}
                  type="button"
                  onClick={() => setActiveBrand(brand)}
                  aria-pressed={activeBrand === brand}
                  className={`relative z-10 flex w-28 items-center justify-center gap-1.5 py-2.5 text-sm font-bold rounded-full transition-colors cursor-pointer ${
                    activeBrand === brand ? 'text-white' : `text-ink-2 hover:${brandAccent.text}`
                  }`}
                >
                  {brand === 'atlasgr' ? (
                    <span
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${activeBrand === brand ? 'bg-white' : ''}`}
                    >
                      <Logo variant="symbol" className="h-3.5 w-3.5" />
                    </span>
                  ) : (
                    <TotalTrackLogo
                      variant="symbol"
                      tone={activeBrand === brand ? 'negative' : 'positive'}
                      className="h-4 w-4 shrink-0"
                    />
                  )}
                  {BRAND_CONFIGS[brand].name}
                </button>
              ))}
            </div>
          </div>

          {/* Cabeçalho compacto — no desktop o painel de marca já mostra a logo grande */}
          <div className="flex flex-col items-center mb-8">
            <div className="mb-5 lg:hidden">
              {activeBrand === 'atlasgr' ? (
                <Logo variant={theme === 'dark' ? 'white' : 'default'} className="h-8 w-auto" />
              ) : (
                <TotalTrackLogo className="h-8 w-auto" />
              )}
            </div>
            <h1 className={`text-3xl font-black text-center ${brandAccent.text}`}>Bem-vindo</h1>
          </div>

          <motion.div
            ref={cardTilt.ref as React.RefObject<HTMLDivElement>}
            onPointerMove={cardTilt.onPointerMove}
            onPointerLeave={cardTilt.onPointerLeave}
            style={cardTilt.style}
            className={`w-full p-6 sm:p-7 rounded-[var(--radius-card-lg)] border border-line bg-surface shadow-card transition-shadow duration-300 ${brandAccent.glow}`}
          >
            {isForgotPassword ? (
              <>
                {forgotPasswordSent ? (
                  <div className="space-y-5 text-center">
                    <div className="bg-brand/10 border border-brand/30 text-ink p-3.5 rounded-2xl text-sm flex items-start gap-2.5 text-left">
                      <Mail size={16} className="shrink-0 mt-0.5 text-brand" />
                      <p>
                        Se <strong>{email}</strong> tiver uma conta cadastrada, enviamos um e-mail
                        com um link para redefinir a senha. O link expira em 1 hora.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={backToSignIn}
                      className={`text-sm font-bold hover:underline transition-colors cursor-pointer ${brandAccent.text}`}
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
                        className="bg-danger/10 border border-danger/30 text-danger-active dark:text-danger p-3.5 rounded-2xl text-xs flex items-start gap-2.5"
                      >
                        <AlertCircle size={16} className="shrink-0 mt-0.5" />
                        <p>{error}</p>
                      </motion.div>
                    )}

                    <p className="text-ink-2 text-sm">
                      Informe o e-mail corporativo da sua conta. Se ele existir, enviaremos um link
                      para redefinir a senha.
                    </p>

                    <div>
                      <label
                        htmlFor="login-forgot-email"
                        className={`block text-xs font-extrabold uppercase tracking-wider mb-2 ml-1 ${brandAccent.text}`}
                      >
                        E-mail:
                      </label>
                      <input
                        id="login-forgot-email"
                        type="email"
                        value={email}
                        onChange={(e) => handleEmailChange(e.target.value)}
                        className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3.5 text-sm text-ink placeholder-ink-2 focus:outline-none focus:ring-2 focus:ring-brand transition-all"
                        required
                        /* campo revelado por ação do usuário ("Esqueci minha senha"), não focus
                           automático de carregamento de página; foca o único campo do
                           sub-formulário que acabou de aparecer, mesmo padrão de diálogo do
                           WAI-ARIA Authoring Practices. */
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                      />
                    </div>

                    <motion.button
                      ref={submitMagnetic.ref as React.RefObject<HTMLButtonElement>}
                      type="submit"
                      disabled={isSubmitting || !email}
                      onPointerMove={submitMagnetic.onPointerMove}
                      onPointerLeave={submitMagnetic.onPointerLeave}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      style={submitMagnetic.style}
                      className="w-full mt-2 bg-gradient-to-r from-brand to-brand-2 text-white py-3.5 rounded-2xl font-extrabold text-sm shadow-lg shadow-brand/30 transition-shadow hover:shadow-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <Loader2 className="animate-spin" size={18} />
                      ) : (
                        <>
                          Enviar Link de Redefinição <ArrowRight size={16} />
                        </>
                      )}
                    </motion.button>

                    <div className="text-center">
                      <button
                        type="button"
                        onClick={backToSignIn}
                        className={`text-sm font-bold hover:underline transition-colors cursor-pointer ${brandAccent.text}`}
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
                      className="bg-danger/10 border border-danger/30 text-danger-active dark:text-danger p-3.5 rounded-2xl text-xs flex items-start gap-2.5"
                    >
                      <AlertCircle size={16} className="shrink-0 mt-0.5" />
                      <p>{error}</p>
                    </motion.div>
                  )}

                  {isSignUp && (
                    <div>
                      <label
                        htmlFor="login-name"
                        className={`block text-xs font-extrabold uppercase tracking-wider mb-2 ml-1 ${brandAccent.text}`}
                      >
                        Seu Nome Completo
                      </label>
                      <input
                        id="login-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3.5 text-sm text-ink placeholder-ink-2 focus:outline-none focus:ring-2 focus:ring-brand transition-all"
                        placeholder="Ex: Marcelo Nascimento"
                        required={isSignUp}
                      />
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="login-email"
                      className={`block text-xs font-extrabold uppercase tracking-wider mb-2 ml-1 ${brandAccent.text}`}
                    >
                      E-mail:
                    </label>
                    <input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => handleEmailChange(e.target.value)}
                      className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3.5 text-sm text-ink placeholder-ink-2 focus:outline-none focus:ring-2 focus:ring-brand transition-all"
                      required
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2 ml-1 mr-1">
                      <label
                        htmlFor="login-password"
                        className={`block text-xs font-extrabold uppercase tracking-wider ${brandAccent.text}`}
                      >
                        Senha:
                      </label>
                      {!isSignUp && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsForgotPassword(true);
                            setError('');
                          }}
                          className={`text-xs font-bold hover:underline transition-colors cursor-pointer ${brandAccent.text}`}
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
                      className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3.5 text-sm text-ink placeholder-ink-2 focus:outline-none focus:ring-2 focus:ring-brand transition-all"
                      placeholder="••••••••"
                      required
                    />
                  </div>

                  <motion.button
                    ref={submitMagnetic.ref as React.RefObject<HTMLButtonElement>}
                    type="submit"
                    disabled={isSubmitting || !email || !password}
                    onPointerMove={submitMagnetic.onPointerMove}
                    onPointerLeave={submitMagnetic.onPointerLeave}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    style={submitMagnetic.style}
                    className="w-full mt-2 bg-gradient-to-r from-brand to-brand-2 text-white py-3.5 rounded-2xl font-extrabold text-sm shadow-lg shadow-brand/30 transition-shadow hover:shadow-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      <>
                        {isSignUp ? 'Criar Nova Conta' : 'Entrar'} <ArrowRight size={16} />
                      </>
                    )}
                  </motion.button>
                </form>
              </>
            )}
          </motion.div>
        </motion.div>
      </div>
    </main>
  );
}
