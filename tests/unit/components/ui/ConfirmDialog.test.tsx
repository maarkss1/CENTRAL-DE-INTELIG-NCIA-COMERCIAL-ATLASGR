/**
 * useConfirmDialog substitui window.confirm() por um diálogo estilizado (reaproveitando o
 * primitivo Dialog já testado indiretamente via seu polyfill de showModal em tests/mocks/setup.ts)
 * em ~14 call sites do produto que antes usavam window.confirm()/confirm() nativo. Cobre o
 * contrato que todo esse call sites passa a depender: confirm() resolve true/false conforme o
 * botão clicado, e o diálogo some depois de qualquer um dos dois.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

function Harness({ onResult }: { onResult: (v: boolean) => void }) {
  const { confirm, dialog } = useConfirmDialog();
  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          const result = await confirm({
            title: 'Excluir item',
            description: 'Essa ação não pode ser desfeita.',
            confirmLabel: 'Excluir',
            variant: 'danger',
          });
          onResult(result);
        }}
      >
        Disparar
      </button>
      {dialog}
    </div>
  );
}

describe('useConfirmDialog', () => {
  it('não renderiza nenhum diálogo antes de confirm() ser chamado', () => {
    render(<Harness onResult={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('abre o diálogo com título/descrição/rótulo custom ao chamar confirm()', async () => {
    const user = userEvent.setup();
    render(<Harness onResult={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Disparar' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Excluir item')).toBeInTheDocument();
    expect(screen.getByText('Essa ação não pode ser desfeita.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeInTheDocument();
  });

  it('resolve true e fecha o diálogo ao clicar no botão de confirmação', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    await user.click(screen.getByRole('button', { name: 'Disparar' }));
    await user.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('resolve false e fecha o diálogo ao clicar em Cancelar', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    await user.click(screen.getByRole('button', { name: 'Disparar' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('resolve false ao fechar pelo X (mesmo comportamento de cancelar)', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    await user.click(screen.getByRole('button', { name: 'Disparar' }));
    await user.click(screen.getByRole('button', { name: 'Fechar' }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it('usa rótulos default ("Cancelar"/"Confirmar") quando não especificados', async () => {
    const user = userEvent.setup();
    function DefaultHarness() {
      const { confirm, dialog } = useConfirmDialog();
      return (
        <div>
          <button type="button" onClick={() => confirm({ title: 'Confirmar ação', description: 'Tem certeza?' })}>
            Disparar
          </button>
          {dialog}
        </div>
      );
    }
    render(<DefaultHarness />);
    await user.click(screen.getByRole('button', { name: 'Disparar' }));

    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
  });
});
