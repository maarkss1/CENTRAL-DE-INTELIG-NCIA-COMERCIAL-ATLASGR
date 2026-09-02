import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Regressão de um achado real de acessibilidade: o modal de conversa do WhatsApp não tinha
 * Escape, role="dialog"/aria-modal nem gestão de foco — diferente do padrão já estabelecido em
 * ToolTechPopover.tsx. Um usuário de teclado só conseguia fechar clicando no botão "X".
 */
const apiGetMock = vi.fn();
vi.mock('../../../../../lib/api', () => ({
  api: { get: (...args: unknown[]) => apiGetMock(...args) },
}));

vi.mock('../../hooks/useWhatsAppMessages', () => ({
  useWhatsAppMessages: () => ({
    messages: [],
    sending: false,
    error: null,
    sendMessage: vi.fn(),
  }),
}));

const { WhatsAppChatPanel } = await import('../WhatsAppChatPanel');

// jsdom não implementa Element.prototype.scrollTo (usado pelo auto-scroll de novas mensagens) —
// sem isto, qualquer render deste componente quebra com "scrollTo is not a function", mesmo
// nada relacionado a isso sendo o alvo destes testes.
Element.prototype.scrollTo = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WhatsAppChatPanel — modal acessível', () => {
  it('tem role="dialog"/aria-modal e move o foco pro botão de fechar ao abrir', async () => {
    apiGetMock.mockResolvedValue({ status: 'connected', qr: null });

    render(
      React.createElement(WhatsAppChatPanel, {
        phone: '+5511999999999',
        contactName: 'Cliente Teste',
        onClose: vi.fn(),
      }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();

    const closeButton = screen.getByRole('button', { name: 'Fechar conversa' });
    await waitFor(() => expect(document.activeElement).toBe(closeButton));
  });

  it('fecha ao pressionar Escape', async () => {
    apiGetMock.mockResolvedValue({ status: 'connected', qr: null });
    const onClose = vi.fn();

    render(
      React.createElement(WhatsAppChatPanel, {
        phone: '+5511999999999',
        contactName: 'Cliente Teste',
        onClose,
      }),
    );

    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('devolve o foco pro elemento que estava focado antes de abrir, ao desmontar', async () => {
    apiGetMock.mockResolvedValue({ status: 'connected', qr: null });

    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(
      React.createElement(WhatsAppChatPanel, {
        phone: '+5511999999999',
        contactName: 'Cliente Teste',
        onClose: vi.fn(),
      }),
    );

    await screen.findByRole('dialog');
    unmount();

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
