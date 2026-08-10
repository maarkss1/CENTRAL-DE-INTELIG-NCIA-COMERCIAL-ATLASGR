/**
 * Cobre a ponte real entre navigationBus (contrato de destino/navegação) e o react-router —
 * único ponto que de fato dispara `navigate()` a partir de um pedido de navegação por voz.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useNavigationBusBridge } from '@/hooks/useNavigationBusBridge';
import { navigationBus } from '@/lib/navigationBus';

function LocationProbe() {
    const location = useLocation();
    return <span data-testid="pathname">{location.pathname}</span>;
}

function Harness() {
    useNavigationBusBridge();
    return <LocationProbe />;
}

afterEach(() => {
    cleanup();
    navigationBus.registerNavigator(null);
});

describe('useNavigationBusBridge', () => {
    it('registra um navegador real que move a rota quando navigationBus.requestNavigation é chamado', () => {
        render(
            <MemoryRouter initialEntries={['/app']}>
                <Harness />
            </MemoryRouter>,
        );

        expect(screen.getByTestId('pathname')).toHaveTextContent('/app');

        act(() => {
            const navigated = navigationBus.requestNavigation('crm');
            expect(navigated).toBe(true);
        });

        expect(screen.getByTestId('pathname')).toHaveTextContent('/app/crm');
    });

    it('"dashboard" navega para /app (rota index), não /app/dashboard', () => {
        render(
            <MemoryRouter initialEntries={['/app/crm']}>
                <Harness />
            </MemoryRouter>,
        );

        act(() => {
            navigationBus.requestNavigation('dashboard');
        });

        expect(screen.getByTestId('pathname')).toHaveTextContent('/app');
    });

    it('desregistra o navegador ao desmontar — nenhuma navegação depois disso', () => {
        const { unmount } = render(
            <MemoryRouter initialEntries={['/app']}>
                <Harness />
            </MemoryRouter>,
        );

        unmount();

        const navigated = navigationBus.requestNavigation('crm');
        expect(navigated).toBe(false);
    });
});
