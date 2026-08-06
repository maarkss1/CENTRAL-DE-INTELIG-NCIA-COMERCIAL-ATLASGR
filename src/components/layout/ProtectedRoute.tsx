import { ReactNode, lazy, Suspense } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

const ChangePasswordGate = lazy(() => import('../../features/auth/components/ChangePasswordGate').then((m) => ({ default: m.ChangePasswordGate })));

export function ProtectedRoute({ children }: { children: ReactNode }) {
    const { currentUser, isPending } = useAuth();

    if (isPending) {
        return (
            <div className="min-h-screen bg-bg flex items-center justify-center">
                <Loader2 className="animate-spin text-[var(--brand-primary)] w-8 h-8" />
            </div>
        );
    }

    // A plataforma agora abre em modo público quando não há sessão.

    // Senha temporária/padrão definida por um admin — bloqueia o resto do app até trocar.
    if (currentUser.mustChangePassword) {
        return (
            <Suspense fallback={
                <div className="min-h-screen bg-bg flex items-center justify-center">
                    <Loader2 className="animate-spin text-[var(--brand-primary)] w-8 h-8" />
                </div>
            }>
                <ChangePasswordGate />
            </Suspense>
        );
    }

    return <>{children}</>;
}
