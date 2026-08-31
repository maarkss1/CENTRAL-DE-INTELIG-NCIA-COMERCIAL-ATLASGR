import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render as rtlRender, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * `Settings.tsx` não tinha nenhum teste antes do Piloto 025. Cobre os dois bugs reais corrigidos
 * neste piloto: (1) os botões "Modo Escuro"/"Modo Claro" chamavam `toggleTheme()` — um alternador
 * binário — em vez de fixar o modo explícito, então clicar no botão do tema JÁ ativo trocava para
 * o oposto; (2) a aba "Auditoria & LGPD" só aparecia para `isAdmin`, apesar de o backend
 * (`lgpd.routes.ts`) já permitir GESTOR também.
 *
 * Os 4 sub-componentes pesados (Team/Integrations/FeatureFlagsPanel/AuditLogs) são substituídos
 * por stubs triviais — o que este arquivo testa é a composição/roteamento de abas e o tema do
 * próprio `Settings.tsx`, não a lógica interna deles (já cobertos, ou não, em seus próprios
 * arquivos de teste).
 */

const useAuthMock = vi.fn(() => ({
    currentUser: { id: 'u1', name: 'Ana', email: 'ana@atlasgr.com.br', role: 'ADMIN' },
    isAdmin: true,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => useAuthMock() }));

vi.mock('@/features/team/components/Team', () => ({ Team: () => <div>[Team stub]</div> }));
vi.mock('@/features/integrations/components/Integrations', () => ({
    Integrations: () => <div>[Integrations stub]</div>,
}));
vi.mock('@/features/feature-flags/components/FeatureFlagsPanel', () => ({
    FeatureFlagsPanel: () => <div>[FeatureFlags stub]</div>,
}));
vi.mock('@/features/lgpd/components/AuditLogs', () => ({ AuditLogs: () => <div>[AuditLogs stub]</div> }));
vi.mock('@/features/lgpd/components/DataSubjectRights', () => ({
    DataSubjectRights: () => <div>[DataSubjectRights stub]</div>,
}));

import { Settings } from '@/features/settings/components/Settings';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { BrandProvider } from '@/contexts/BrandContext';

function render(ui: React.ReactElement) {
    return rtlRender(
        <ThemeProvider>
            <BrandProvider>{ui}</BrandProvider>
        </ThemeProvider>,
    );
}

beforeEach(() => {
    localStorage.clear();
    useAuthMock.mockReturnValue({
        currentUser: { id: 'u1', name: 'Ana', email: 'ana@atlasgr.com.br', role: 'ADMIN' },
        isAdmin: true,
    });
});

afterEach(() => cleanup());

describe('Settings — tema', () => {
    it('clicar em "Modo Escuro" enquanto já está escuro NÃO troca para claro (achado real do Piloto 025)', async () => {
        localStorage.setItem('atlas_theme', 'dark');
        const user = userEvent.setup();
        render(<Settings />);

        const escuro = screen.getByRole('button', { name: /Modo Escuro/ });
        expect(escuro.getAttribute('aria-pressed')).toBe('true');

        await user.click(escuro);

        // Antes da correção, isso virava 'false' (o toggle invertia o tema mesmo clicando no
        // botão do modo já ativo).
        expect(screen.getByRole('button', { name: /Modo Escuro/ }).getAttribute('aria-pressed')).toBe(
            'true',
        );
    });

    it('clicar em "Modo Claro" enquanto está escuro troca para claro', async () => {
        localStorage.setItem('atlas_theme', 'dark');
        const user = userEvent.setup();
        render(<Settings />);

        await user.click(screen.getByRole('button', { name: /Modo Claro/ }));

        expect(screen.getByRole('button', { name: /Modo Claro/ }).getAttribute('aria-pressed')).toBe(
            'true',
        );
        expect(screen.getByRole('button', { name: /Modo Escuro/ }).getAttribute('aria-pressed')).toBe(
            'false',
        );
    });
});

describe('Settings — aba Auditoria & LGPD', () => {
    it('ADMIN vê a aba de auditoria', async () => {
        render(<Settings />);
        expect(screen.getByRole('button', { name: /Auditoria & LGPD/ })).toBeTruthy();
    });

    it('GESTOR também vê a aba de auditoria (achado real do Piloto 025 — backend já permite GESTOR)', async () => {
        useAuthMock.mockReturnValue({
            currentUser: { id: 'u2', name: 'Gustavo', email: 'g@atlasgr.com.br', role: 'GESTOR' },
            isAdmin: false,
        });
        render(<Settings />);
        expect(screen.getByRole('button', { name: /Auditoria & LGPD/ })).toBeTruthy();

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: /Auditoria & LGPD/ }));
        expect(await screen.findByText('[AuditLogs stub]')).toBeTruthy();
    });

    it('SDR não vê a aba de auditoria nem a de usuários/feature flags', async () => {
        useAuthMock.mockReturnValue({
            currentUser: { id: 'u3', name: 'Sérgio', email: 's@atlasgr.com.br', role: 'SDR' },
            isAdmin: false,
        });
        render(<Settings />);
        expect(screen.queryByRole('button', { name: /Auditoria & LGPD/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /^Usuários$/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Feature Flags/ })).toBeNull();
    });
});
