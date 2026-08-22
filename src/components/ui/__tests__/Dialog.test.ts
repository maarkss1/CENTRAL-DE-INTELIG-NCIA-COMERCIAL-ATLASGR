import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from '../Dialog';

describe('Dialog', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.restoreAllMocks();
  });

  it('does not override the native hidden state while closed', () => {
    const content = React.createElement('p', null, 'Dialog content');
    // createElement's component overload requires the mandatory Dialog prop in this object.
    // eslint-disable-next-line react/no-children-prop
    render(React.createElement(Dialog, {
      isOpen: false,
      onClose: vi.fn(),
      title: 'Example',
      children: content,
    }));

    const dialog = screen.getByRole('dialog', { hidden: true });

    expect(dialog.hasAttribute('open')).toBe(false);
    expect(dialog.classList.contains('open:flex')).toBe(true);
    expect(dialog.classList.contains('open:flex-col')).toBe(true);
    expect(dialog.classList.contains('flex')).toBe(false);
    expect(dialog.classList.contains('flex-col')).toBe(false);
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
  });

  it('uses the modal lifecycle when opening and closing', () => {
    const props = {
      isOpen: true,
      onClose: vi.fn(),
      title: 'Example',
      children: React.createElement('p', null, 'Dialog content'),
    };
    const { rerender } = render(React.createElement(Dialog, props));

    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog').hasAttribute('open')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(React.createElement(Dialog, { ...props, isOpen: false }));

    expect(HTMLDialogElement.prototype.close).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog', { hidden: true }).hasAttribute('open')).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });
});
