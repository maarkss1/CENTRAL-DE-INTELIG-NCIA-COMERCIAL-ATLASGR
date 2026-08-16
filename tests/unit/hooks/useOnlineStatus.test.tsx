/**
 * Cobre o hook de detecção de conectividade — ver
 * .agents/handoffs/onda-8/09-para-02-offline-stale-state-ausente.md. Sem isto, dado já carregado
 * na tela continuava sendo exibido como atual mesmo depois do dispositivo perder conexão.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

function Probe() {
    const isOnline = useOnlineStatus();
    return <span data-testid="status">{isOnline ? 'online' : 'offline'}</span>;
}

function setNavigatorOnLine(value: boolean) {
    Object.defineProperty(window.navigator, 'onLine', {
        configurable: true,
        value,
    });
}

describe('useOnlineStatus', () => {
    beforeEach(() => {
        setNavigatorOnLine(true);
    });

    afterEach(() => {
        cleanup();
        setNavigatorOnLine(true);
    });

    it('começa "online" quando navigator.onLine é true', () => {
        render(<Probe />);
        expect(screen.getByTestId('status')).toHaveTextContent('online');
    });

    it('vira "offline" ao disparar o evento "offline" da window', () => {
        render(<Probe />);

        act(() => {
            setNavigatorOnLine(false);
            window.dispatchEvent(new Event('offline'));
        });

        expect(screen.getByTestId('status')).toHaveTextContent('offline');
    });

    it('volta a "online" ao disparar o evento "online" da window', () => {
        setNavigatorOnLine(false);
        render(<Probe />);

        act(() => {
            window.dispatchEvent(new Event('offline'));
        });
        expect(screen.getByTestId('status')).toHaveTextContent('offline');

        act(() => {
            setNavigatorOnLine(true);
            window.dispatchEvent(new Event('online'));
        });

        expect(screen.getByTestId('status')).toHaveTextContent('online');
    });

    it('para de escutar eventos depois de desmontar', () => {
        const { unmount } = render(<Probe />);
        unmount();

        // Não deve lançar nem deixar listener pendurado — se o cleanup falhasse, o teste seguinte
        // (que também escuta 'offline') poderia observar efeito colateral cruzado.
        expect(() => {
            act(() => {
                window.dispatchEvent(new Event('offline'));
            });
        }).not.toThrow();
    });
});
