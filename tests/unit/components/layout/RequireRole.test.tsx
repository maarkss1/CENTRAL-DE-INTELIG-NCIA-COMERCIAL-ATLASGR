/**
 * `/app/team` (e qualquer outra rota administrativa futura) só escondia o item de menu da
 * Sidebar de quem não é ADMIN — navegar direto pela URL ainda renderizava a tela real, que só
 * falhava de forma confusa quando as chamadas de API batiam no requireRole do backend. RequireRole
 * fecha essa lacuna com um estado de bloqueio explícito.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);

const useAuthMock = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => useAuthMock() }));

import { RequireRole } from '@/components/layout/RequireRole';

describe('RequireRole', () => {
    it('renderiza o conteúdo quando o papel do usuário satisfaz allowedRoles', () => {
        useAuthMock.mockReturnValue({ currentUser: { role: 'ADMIN' } });
        render(<RequireRole allowedRoles={['ADMIN']}><p>Conteúdo restrito</p></RequireRole>);
        expect(screen.getByText('Conteúdo restrito')).toBeInTheDocument();
    });

    it('bloqueia com mensagem explícita em PT-BR quando o papel não satisfaz (nunca uma tela em branco)', () => {
        useAuthMock.mockReturnValue({ currentUser: { role: 'SDR' } });
        render(<RequireRole allowedRoles={['ADMIN']}><p>Conteúdo restrito</p></RequireRole>);
        expect(screen.queryByText('Conteúdo restrito')).not.toBeInTheDocument();
        expect(screen.getByText('Acesso restrito')).toBeInTheDocument();
        expect(screen.getByText(/permissão de ADMIN/)).toBeInTheDocument();
    });

    it('bloqueia quando não há usuário autenticado', () => {
        useAuthMock.mockReturnValue({ currentUser: null });
        render(<RequireRole allowedRoles={['ADMIN']}><p>Conteúdo restrito</p></RequireRole>);
        expect(screen.getByText('Acesso restrito')).toBeInTheDocument();
    });
});
