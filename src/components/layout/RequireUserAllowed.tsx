import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface RequireUserAllowedProps {
  allowedEmails: string[];
  children: ReactNode;
}

/**
 * Guarda de autorização por e-mail específico de usuário.
 * Garante que rotas com acesso restrito a um ou mais usuários específicos (ex: marcelo.nascimento@atlasgr.com.br)
 * não possam ser acessadas por outros usuários mesmo digitando a URL diretamente.
 */
export function RequireUserAllowed({ allowedEmails, children }: RequireUserAllowedProps) {
  const { currentUser } = useAuth();
  const userEmail = currentUser?.email?.toLowerCase().trim();
  const allowed =
    !!userEmail && allowedEmails.some((e) => e.toLowerCase().trim() === userEmail);

  if (allowed) return <>{children}</>;

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-ink">Acesso Privado / Restrito</h2>
        <p className="text-sm text-ink-2">
          Este módulo é de acesso exclusivo para {allowedEmails.join(', ')}. Se você necessita de
          acesso a este acervo executivo, entre em contato com a administração.
        </p>
      </div>
    </div>
  );
}
