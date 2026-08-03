import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight, KeyRound, Loader2 } from 'lucide-react';
import { authClient } from '../../../lib/auth-client';

// Bloqueia o acesso ao app até o usuário trocar uma senha temporária/padrão definida por um
// admin (ver User.mustChangePassword). Sem isso, uma senha padrão conhecida ficaria valendo
// indefinidamente para quem a recebeu.
export function ChangePasswordGate() {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (newPassword.length < 8) {
            setError('A nova senha precisa ter pelo menos 8 caracteres.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('As senhas não coincidem.');
            return;
        }

        setIsSubmitting(true);
        const changeResult = await authClient.changePassword({ currentPassword, newPassword });
        if (changeResult.error) {
            setError(changeResult.error.message || 'Não foi possível trocar a senha. Confira a senha atual.');
            setIsSubmitting(false);
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const clearResult = await (authClient.updateUser as any)({ mustChangePassword: false });
        if (clearResult?.error) {
            setError('Senha trocada, mas não consegui liberar o acesso automaticamente. Recarregue a página.');
            setIsSubmitting(false);
            return;
        }

        window.location.href = '/app';
    };

    return (
        <div className="min-h-screen bg-bg text-ink flex items-center justify-center relative overflow-hidden font-sans p-4">
            <div className="w-full max-w-md relative z-10">
                <div className="glass-panel p-8 sm:p-10 rounded-[2.5rem] border border-line bg-surface/95 shadow-2xl">
                    <div className="flex flex-col items-center mb-6 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-atlas-orange/10 flex items-center justify-center text-atlas-orange mb-4">
                            <KeyRound size={24} />
                        </div>
                        <h1 className="text-xl font-black text-ink">Troque sua senha para continuar</h1>
                        <p className="text-ink-2 text-xs mt-2">
                            Sua conta foi criada com uma senha temporária. Defina uma senha nova antes de acessar a plataforma.
                        </p>
                    </div>

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
                            <label className="block text-[10px] font-bold text-ink-2 uppercase tracking-wider mb-1.5 ml-1">Senha temporária (atual)</label>
                            <input
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3.5 text-xs text-ink placeholder-ink-2 focus:outline-none focus:ring-2 focus:ring-atlas-orange transition-all"
                                placeholder="A senha que você recebeu"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-ink-2 uppercase tracking-wider mb-1.5 ml-1">Nova senha</label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3.5 text-xs text-ink placeholder-ink-2 focus:outline-none focus:ring-2 focus:ring-atlas-orange transition-all"
                                placeholder="Mínimo 8 caracteres"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-ink-2 uppercase tracking-wider mb-1.5 ml-1">Confirme a nova senha</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full bg-surface-2 border border-line rounded-2xl px-4 py-3.5 text-xs text-ink placeholder-ink-2 focus:outline-none focus:ring-2 focus:ring-atlas-orange transition-all"
                                placeholder="Repita a nova senha"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting || !currentPassword || !newPassword || !confirmPassword}
                            className="w-full mt-2 bg-gradient-to-r from-atlas-orange to-amber-500 text-white py-3.5 rounded-2xl font-extrabold text-xs shadow-lg shadow-atlas-orange/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                            {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : (
                                <>Trocar senha e entrar <ArrowRight size={16} /></>
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
