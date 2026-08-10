import { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { hasRequiredRole, type Role } from '../../lib/auth/authorization';

interface RequireRoleProps {
    allowedRoles: Role[];
    children: ReactNode;
}

/**
 * Guarda de autorização por rota (não só por item de menu). Antes desta correção, rotas
 * administrativas como `/app/team` só ficavam ocultas da Sidebar para quem não é ADMIN — digitar
 * a URL diretamente, usar um link antigo ou um bookmark ainda renderizava a casca da tela real,
 * que só falhava (de forma confusa, sem explicação) quando as chamadas de API batiam no
 * `requireRole` do backend. Isto fecha essa lacuna: mostra um estado de bloqueio explícito em
 * PT-BR em vez de uma tela quebrada/em branco.
 */
export function RequireRole({ allowedRoles, children }: RequireRoleProps) {
    const { currentUser } = useAuth();
    const allowed = !!currentUser && hasRequiredRole(currentUser.role, allowedRoles);

    if (allowed) return <>{children}</>;

    return (
        <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md text-center space-y-3">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-soft border border-line flex items-center justify-center text-brand">
                    <ShieldAlert className="w-7 h-7" />
                </div>
                <h2 className="text-lg font-bold text-ink">Acesso restrito</h2>
                <p className="text-sm text-ink-2">
                    Esta área exige permissão de {allowedRoles.join(' ou ')}. Fale com um administrador da sua
                    organização se precisar de acesso.
                </p>
            </div>
        </div>
    );
}
