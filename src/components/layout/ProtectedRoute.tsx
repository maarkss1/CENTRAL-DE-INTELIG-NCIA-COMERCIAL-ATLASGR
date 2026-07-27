import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export function ProtectedRoute({ children }: { children: ReactNode }) {
    const { currentUser } = useAuth();

    // Se o usuário não está autenticado, redireciona estritamente para a Tela de Login
    if (!currentUser) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
}
