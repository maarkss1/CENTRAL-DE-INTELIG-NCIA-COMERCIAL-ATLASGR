import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import { authClient } from '../../../lib/auth-client';
import { clientLogger } from '../../../lib/clientLogger';

interface GoogleLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedBrand: 'atlasgr' | 'totaltrac' | null;
}

export function GoogleLoginModal({ isOpen, onClose, selectedBrand }: GoogleLoginModalProps) {
  const [, setIsLoading] = useState(false);
  const [step, setStep] = useState<'button' | 'loading' | 'success'>('button');

  useEffect(() => {
    if (isOpen) {
      setStep('button');
      setIsLoading(false);
    }
  }, [isOpen]);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setStep('loading');

    if (selectedBrand) {
      localStorage.setItem('selectedBrand', selectedBrand);
    }

    try {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/app',
      });
      // The page will redirect to Google, so we just wait
    } catch (err) {
      clientLogger.error({ err }, 'Falha ao iniciar login com Google');
      setStep('button');
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative w-full max-w-md bg-surface rounded-3xl shadow-2xl overflow-hidden"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="absolute top-4 right-4 p-2 text-ink-2 hover:text-ink hover:bg-surface-2 rounded-full transition-colors z-10"
          >
            <X size={20} />
          </button>

          <div className="p-8 flex flex-col items-center text-center">
            {/* Google Logo SVG */}
            <div className="w-12 h-12 mb-6">
              <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
                <path fill="none" d="M0 0h48v48H0z" />
              </svg>
            </div>

            <h2 className="text-2xl font-semibold text-ink mb-2">Fazer login</h2>
            <p className="text-ink-2 mb-8 text-xs">
              Use sua Conta do Google corporativa (@atlasgr.com.br ou @totaltrac.com.br) para
              acessar a plataforma
            </p>

            <div className="w-full">
              {step === 'button' && (
                <button
                  onClick={handleGoogleLogin}
                  className="w-full flex items-center justify-center gap-3 bg-surface border border-line text-ink font-medium py-3 px-4 rounded-xl hover:bg-surface-2 active:bg-surface-2 transition-colors shadow-sm"
                >
                  <svg className="w-5 h-5" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                  Continuar com o Google
                </button>
              )}

              {step === 'loading' && (
                <div className="py-4 flex flex-col items-center justify-center">
                  <Loader2 className="w-8 h-8 text-brand animate-spin mb-4" />
                  <p className="text-sm text-ink-2">Autenticando de forma segura...</p>
                </div>
              )}

              {step === 'success' && (
                <div className="py-4 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 bg-ok/15 text-ok-active dark:text-ok rounded-full flex items-center justify-center mb-4">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-ink">Login realizado com sucesso!</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-surface-2 border-t border-line p-4 text-center">
            <p className="text-xs text-ink-2">
              Ao continuar, você concorda com os Termos de Serviço e a Política de Privacidade.
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
