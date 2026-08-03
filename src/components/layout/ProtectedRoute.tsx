import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export function ProtectedRoute({ children }: { children: ReactNode }) {
    const { currentUser, isPending } = useAuth();

    if (isPending) {
        return (
            <div className="min-h-screen bg-bg flex items-center justify-center">
                <Loader2 className="animate-spin text-[var(--brand-primary)] w-8 h-8" />
            </div>
        );
    }

    // Se o usuário não está autenticado, redireciona estritamente para a Tela de Login
    if (!currentUser) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
}
