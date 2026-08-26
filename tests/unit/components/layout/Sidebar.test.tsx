/**
 * Antes desta correção, "Automações" e "Integrações" só apareciam na Sidebar para `isAdmin`,
 * mesmo o backend (automation.routes.ts `managementRoles`, Integrations.tsx `canManage`) já
 * autorizando GESTOR a gerenciar as duas — um GESTOR não tinha nenhum caminho de navegação até
 * telas que ele tem permissão real de usar (achado da auditoria Onda 1/Roadmap v2 — Agente 02).
 * "Equipe" e "Consumo de IA" continuam ADMIN-only (o primeiro porque o backend também é
 * ADMIN-only; o segundo porque o backend hoje não tem checagem de papel nenhuma — ver handoff
 * 02-para-01-rbac-ausente-usage-routes.md — então a Sidebar não deveria ampliar ainda mais quem
 * vê o item).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

afterEach(cleanup);

const useAuthMock = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => useAuthMock() }));

const useBrandMock = vi.fn();
vi.mock('@/contexts/BrandContext', () => ({ useBrand: () => useBrandMock() }));

vi.mock('@/components/Logo', () => ({ Logo: () => <span data-testid="logo-atlasgr" /> }));
vi.mock('@/components/TotalTrackLogo', () => ({ TotalTrackLogo: () => <span data-testid="logo-totaltrac" /> }));

import { Sidebar } from '@/components/layout/Sidebar';

function renderSidebar(role: string) {
    useAuthMock.mockReturnValue({
        currentUser: { name: 'Usuária Teste', role, roleTitle: role },
        isAdmin: role === 'ADMIN',
        canAccessCommercialIntelligence: role === 'ADMIN' || role === 'GESTOR',
        logout: vi.fn(),
    });
    useBrandMock.mockReturnValue({ activeBrand: 'atlasgr', setActiveBrand: vi.fn() });

    return render(
        <MemoryRouter>
            <Sidebar activeTab="dashboard" />
        </MemoryRouter>,
    );
}

describe('Sidebar — visibilidade de Automações/Integrações por papel', () => {
    it('GESTOR vê Automações e Integrações (permissão real de gerenciar, per backend), mas não Equipe/Consumo de IA', () => {
        renderSidebar('GESTOR');
        expect(screen.getByRole('button', { name: /Automações/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Integrações/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Equipe$/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Consumo de IA/ })).not.toBeInTheDocument();
    });

    it('ADMIN vê os quatro itens administrativos', () => {
        renderSidebar('ADMIN');
        expect(screen.getByRole('button', { name: /Automações/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Integrações/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Equipe/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Consumo de IA/ })).toBeInTheDocument();
    });

    it('CLOSER não vê nenhum dos quatro itens administrativos', () => {
        renderSidebar('CLOSER');
        expect(screen.queryByRole('button', { name: /Automações/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Integrações/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Equipe/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Consumo de IA/ })).not.toBeInTheDocument();
    });
});
