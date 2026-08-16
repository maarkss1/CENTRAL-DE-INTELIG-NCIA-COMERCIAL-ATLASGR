/**
 * Cobre o indicador visual de offline — ver
 * .agents/handoffs/onda-8/09-para-02-offline-stale-state-ausente.md.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import { OfflineBanner } from '@/components/layout/OfflineBanner';

function setNavigatorOnLine(value: boolean) {
    Object.defineProperty(window.navigator, 'onLine', {
        configurable: true,
        value,
    });
}

describe('OfflineBanner', () => {
    beforeEach(() => {
        setNavigatorOnLine(true);
    });

    afterEach(() => {
        cleanup();
        setNavigatorOnLine(true);
    });

    it('não mostra a mensagem de offline enquanto conectado', () => {
        render(<OfflineBanner />);
        expect(screen.queryByText(/sem conexão/i)).not.toBeInTheDocument();
    });

    it('a região role="status" aria-live="polite" fica sempre montada, para o leitor de tela anunciar a mudança', () => {
        render(<OfflineBanner />);
        expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    });

    it('mostra a mensagem explícita de offline quando a conexão cai', async () => {
        render(<OfflineBanner />);

        act(() => {
            setNavigatorOnLine(false);
            window.dispatchEvent(new Event('offline'));
        });

        await waitFor(() => {
            expect(
                screen.getByText('Sem conexão — os dados exibidos podem estar desatualizados.')
            ).toBeInTheDocument();
        });
    });

    it('esconde a mensagem de novo quando a conexão volta', async () => {
        setNavigatorOnLine(false);
        render(<OfflineBanner />);

        act(() => {
            window.dispatchEvent(new Event('offline'));
        });
        await waitFor(() => {
            expect(screen.getByText(/sem conexão/i)).toBeInTheDocument();
        });

        act(() => {
            setNavigatorOnLine(true);
            window.dispatchEvent(new Event('online'));
        });

        await waitFor(() => {
            expect(screen.queryByText(/sem conexão/i)).not.toBeInTheDocument();
        });
    });
});
