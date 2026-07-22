import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authClient } from '../../../lib/auth-client';
import { Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { AtlasLogo } from '../../../components/ui/AtlasLogo';

/**
 * O Better Auth às vezes devolve mensagens técnicas cruas (ex: "Failed to create user", que na
 * prática é um erro de banco/servidor, não algo que o usuário causou) — traduzimos os casos
 * conhecidos para português claro e acionável, e usamos uma mensagem honesta (não inventamos uma
 * causa) para o que não reconhecemos, em vez de vazar a string técnica original.
 */
function translateAuthError(rawMessage: string | undefined, mode: 'signup' | 'signin'): string {
    const msg = (rawMessage || '').toLowerCase();

    if (msg.includes('already exist') || msg.includes('already registered') || msg.includes('user_already')) {
        return 'Já existe uma conta com esse e-mail. Tente fazer login em vez de criar uma conta nova.';
    }
    if (msg.includes('invalid email') || msg.includes('email is invalid')) {
        return 'E-mail inválido. Confira se digitou corretamente.';
    }
    if (msg.includes('password') && (msg.includes('short') || msg.includes('least') || msg.includes('minimum'))) {
        return 'A senha é muito curta — use pelo menos 8 caracteres.';
    }
    if (msg.includes('invalid password') || msg.includes('invalid email or password') || msg.includes('invalid credentials')) {
        return 'E-mail ou senha incorretos.';
    }
    if (msg.includes('failed to create user') || msg.includes('internal') || msg.includes('unexpected')) {
        return 'Não foi possível criar a conta agora — é um problema do lado do servidor, não algo que você fez de errado. Tente novamente em alguns instantes; se persistir, avise o time técnico.';
    }
    if (!rawMessage) {
        return mode === 'signup'
            ? 'Falha ao criar conta. Tente novamente.'
            : 'Falha na autenticação. Verifique suas credenciais.';
    }
    // Mensagem não reconhecida — mostramos como veio, mas sem pretender saber a causa exata.
    return rawMessage;
}

export function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [name, setName] = useState('');
    const navigate = useNavigate();

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');

        if (isSignUp) {
            const { error: signUpError } = await authClient.signUp.email({
                name: name || email.split('@')[0],
                email,
                password
            });
            if (signUpError) {
                console.error('Sign up error:', signUpError);
                setError(translateAuthError(signUpError.message, 'signup'));
                setIsSubmitting(false);
                return;
            }
        }

        const { error } = await authClient.signIn.email({
            email,
            password
        });

        if (error) {
            console.error('Sign in error:', error);
            setError(translateAuthError(error.message, 'signin'));
            setIsSubmitting(false);
        } else {
            navigate('/app');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center relative overflow-hidden font-sans">
            {/* Ambient Background Elements */}
            <motion.div 
                animate={{ scale: [1, 1.1, 1], rotate: [0, 90, 0] }} 
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-atlas-orange/10 rounded-full blur-[100px] opacity-60" 
            />
            <motion.div 
                animate={{ scale: [1, 1.2, 1], rotate: [0, -90, 0] }} 
                transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-gray-200/50 rounded-full blur-[120px] opacity-60" 
            />
            
            <div className="w-full max-w-md p-6 relative z-10">
                <motion.div 
                    initial={{ opacity: 0, y: 30, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.6, type: "spring", bounce: 0.4 }}
                    className="bg-white p-10 rounded-[32px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] border border-gray-100 relative overflow-hidden"
                >
                    <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex flex-col items-center mb-8 relative z-10"
                    >
                        <div className="w-20 h-20 bg-orange-50 rounded-2xl flex items-center justify-center mb-6 text-atlas-orange relative group cursor-default">
                            <motion.div whileHover={{ rotate: 10, scale: 1.1 }} transition={{ type: "spring", stiffness: 400 }}>
                                <AtlasLogo className="w-12 h-12" />
                            </motion.div>
                        </div>
                        <h1 className="text-3xl font-black text-atlas-dark tracking-tight">Atlas GR</h1>
                        <p className="text-gray-500 mt-2 text-sm text-center font-medium">Segurança e Inteligência Logística</p>
                    </motion.div>

                    <form onSubmit={handleAuth} className="space-y-5 relative z-10">
                        {error && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl text-sm flex items-start gap-3"
                            >
                                <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-500" />
                                <p>{error}</p>
                            </motion.div>
                        )}
                        
                        <div className="space-y-4">
                            {isSignUp && (
                                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">Seu Nome</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 text-atlas-dark placeholder-gray-400 focus:outline-none focus:border-atlas-orange focus:ring-2 focus:ring-atlas-orange/20 transition-all font-medium"
                                        placeholder="Nome Completo"
                                        required={isSignUp}
                                    />
                                </motion.div>
                            )}
                            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">E-mail Corporativo</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 text-atlas-dark placeholder-gray-400 focus:outline-none focus:border-atlas-orange focus:ring-2 focus:ring-atlas-orange/20 transition-all font-medium"
                                    placeholder="voce@empresa.com"
                                    required
                                />
                            </motion.div>
                            
                            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">Senha</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 text-atlas-dark placeholder-gray-400 focus:outline-none focus:border-atlas-orange focus:ring-2 focus:ring-atlas-orange/20 transition-all font-medium"
                                    placeholder="••••••••"
                                    required
                                />
                            </motion.div>
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            type="submit"
                            disabled={isSubmitting || !email || !password || (isSignUp && !name)}
                            className="w-full mt-6 bg-atlas-orange text-white py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 group disabled:opacity-50 shadow-lg shadow-atlas-orange/30 hover:shadow-xl hover:shadow-atlas-orange/40 hover:bg-[#E04B12]"
                        >
                            {isSubmitting ? (
                                <Loader2 className="animate-spin" size={20} />
                            ) : (
                                <>{isSignUp ? 'Criar Conta' : 'Acessar Plataforma'} <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></>
                            )}
                        </motion.button>
                    </form>

                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="mt-6 text-center relative z-10"
                    >
                        <button 
                            type="button"
                            onClick={() => {
                                setIsSignUp(!isSignUp);
                                setError('');
                            }}
                            className="text-sm text-gray-500 hover:text-atlas-orange font-semibold transition-colors"
                        >
                            {isSignUp ? 'Já possui conta? Faça Login' : 'Não tem conta? Solicite Acesso (Sign Up)'}
                        </button>
                    </motion.div>
                </motion.div>
                
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="text-center mt-8"
                >
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Ambiente Corporativo Restrito</p>
                </motion.div>
            </div>
        </div>
    );
}
