import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Loader2, AlertCircle, ArrowRight, Sun, Moon, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useBrand } from '../../../contexts/BrandContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { authClient } from '../../../lib/auth-client';
import { TotalTrackLogo } from '../../../components/TotalTrackLogo';

// Chegamos aqui a partir do link enviado por e-mail (ver sendResetPassword em src/lib/auth.ts):
// better-auth redireciona pra cá com ?token=... quando o token é válido, ou ?error=INVALID_TOKEN
// quando o link já expirou/foi usado (ver requestPasswordResetCallback no pacote better-auth).
export function ResetPasswordScreen() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const linkError = searchParams.get('error');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const { activeBrand, brandInfo } = useBrand();
  const { theme, toggleTheme } = useTheme();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Link inválido ou expirado. Solicite uma nova redefinição de senha.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setIsSubmitting(true);
    const result = await authClient.resetPassword({ newPassword, token });
    setIsSubmitting(false);

    if (result.error) {
      setError(result.error.message || 'Não foi possível redefinir a senha. O link pode ter expirado.');
      return;
    }

    setSuccess(true);
  };

  return (
    <div className="min-h-screen bg-bg text-ink flex items-center justify-center relative overflow-hidden font-sans p-4 transition-colors">
      {/* Mesmo tratamento visual do LoginScreen (mesmo fluxo de auth) — metade laranja/metade azul
          com tokens estáticos em vez do indigo-500 genérico anterior. Ver LoginScreen.tsx. */}
      <motion.div
        aria-hidden="true"
        animate={{ scale: [1, 1.08, 1], rotate: [0, 90, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
        className="absolute left-[-18%] top-1/2 h-[560px] w-[440px] -translate-y-1/2 rounded-full bg-atlas-orange/12 blur-[130px] pointer-events-none"
      />
      <motion.div
        aria-hidden="true"
        animate={{ scale: [1, 1.1, 1], rotate: [0, -90, 0] }}
        transition={{ duration: 27, repeat: Infinity, ease: 'linear' }}
        className="absolute right-[-18%] top-1/2 h-[560px] w-[440px] -translate-y-1/2 rounded-full bg-totaltrack-blue/12 blur-[130px] pointer-events-none"
      />

      <button
        type="button"
        onClick={toggleTheme}
        className="fixed top-5 right-5 z-20 flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-ink-2 shadow-sm transition-colors hover:bg-surface-2 cursor-pointer"
        aria-label="Alternar tema"
        title={`Mudar para modo ${theme === 'dark' ? 'claro' : 'escuro'}`}
      >
        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      <div className="w-full max-w-md relative z-10">
        <div className="glass-panel p-8 sm:p-10 rounded-[2.5rem] border border-line bg-surface/95 shadow-2xl relative">
          <div className="flex flex-col items-center mb-6">
            {activeBrand === 'atlasgr' ? (
              <img src="/atlas-logo.svg" alt="AtlasGR" className="h-10 w-auto object-contain" />
            ) : (
              <TotalTrackLogo className="h-10 w-auto" />
            )}
            <p className="text-ink-2 text-xs mt-3 font-medium text-center">{brandInfo.slogan}</p>
          </div>

          {!token || linkError ? (
            <div className="space-y-5 text-center">
              <div className="bg-danger/10 border border-danger/30 text-danger p-3.5 rounded-2xl text-xs flex items-start gap-2.5 text-left">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <p>Este link de redefinição de senha é inválido ou já expirou. Solicite um novo na tela de login.</p>
              </div>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-xs text-ink-2 hover:text-brand font-bold transition-colors"
              >
                Voltar para o login
              </Link>
            </div>
          ) : success ? (
            <div className="space-y-5 text-center">
              <div className="bg-brand/10 border border-brand/30 text-ink p-3.5 rounded-2xl text-xs flex items-start gap-2.5 text-left">
                <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-brand" />
                <p>Senha redefinida com sucesso. Já pode entrar com a nova senha.</p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full bg-gradient-to-r from-brand to-brand-2 text-white py-3.5 rounded-2xl font-extrabold text-xs shadow-lg shadow-brand/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                Ir para o login <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
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

              <div>
                <label htmlFor="reset-new-password" className="block text-[10px] font-bold text-ink-2 uppercase tracking-wider mb-1.5 ml-1">Nova Senha</label>
                <input
                  id="reset-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3.5 text-xs text-ink placeholder-ink-2 focus:outline-none focus:ring-2 focus:ring-brand transition-all"
                  placeholder="••••••••"
                  minLength={8}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="reset-confirm-password" className="block text-[10px] font-bold text-ink-2 uppercase tracking-wider mb-1.5 ml-1">Confirmar Nova Senha</label>
                <input
                  id="reset-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3.5 text-xs text-ink placeholder-ink-2 focus:outline-none focus:ring-2 focus:ring-brand transition-all"
                  placeholder="••••••••"
                  minLength={8}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !newPassword || !confirmPassword}
                className="w-full mt-2 bg-gradient-to-r from-brand to-brand-2 text-white py-3.5 rounded-2xl font-extrabold text-xs shadow-lg shadow-brand/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <>Redefinir Senha <ArrowRight size={16} /></>}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
