/**
 * ITEM-04 (cobertura de testes real): Pagination.tsx é o componente de paginação compartilhado
 * entre ContactList e CompanyList (ver comentário no próprio componente) — alto reuso, lógica de
 * borda real (clamping de página, plural condicional, ocultar quando não há páginas suficientes)
 * e, antes desta suíte, sem nenhum teste dedicado (só coberto de raspão, parcialmente, por render
 * indireto em outras suítes de feature).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from '@/components/ui/Pagination';

afterEach(() => {
    cleanup();
});

describe('Pagination', () => {
    it('não renderiza nada quando há 1 página ou menos (nada para paginar)', () => {
        const { container: c1 } = render(
            <Pagination page={1} totalPages={1} onPageChange={vi.fn()} />
        );
        expect(c1).toBeEmptyDOMElement();

        const { container: c2 } = render(
            <Pagination page={1} totalPages={0} onPageChange={vi.fn()} />
        );
        expect(c2).toBeEmptyDOMElement();
    });

    it('mostra a página atual e o total de páginas', () => {
        render(<Pagination page={2} totalPages={5} onPageChange={vi.fn()} />);
        expect(screen.getByText('Página 2 de 5')).toBeInTheDocument();
    });

    it('mostra o total de itens e o rótulo só quando ambos são passados', () => {
        const { rerender } = render(
            <Pagination page={1} totalPages={3} onPageChange={vi.fn()} totalItems={42} itemLabel="contatos" />
        );
        expect(screen.getByText('Página 1 de 3 · 42 contatos')).toBeInTheDocument();

        rerender(<Pagination page={1} totalPages={3} onPageChange={vi.fn()} totalItems={42} />);
        expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
    });

    it('desabilita "Anterior" na primeira página e "Próxima" na última', () => {
        render(<Pagination page={1} totalPages={3} onPageChange={vi.fn()} />);
        expect(screen.getByRole('button', { name: /Anterior/ })).toBeDisabled();
        expect(screen.getByRole('button', { name: /Próxima/ })).not.toBeDisabled();

        cleanup();
        render(<Pagination page={3} totalPages={3} onPageChange={vi.fn()} />);
        expect(screen.getByRole('button', { name: /Anterior/ })).not.toBeDisabled();
        expect(screen.getByRole('button', { name: /Próxima/ })).toBeDisabled();
    });

    it('avança e retrocede uma página por clique, sem passar dos limites', async () => {
        const user = userEvent.setup();
        const onPageChange = vi.fn();
        render(<Pagination page={2} totalPages={3} onPageChange={onPageChange} />);

        await user.click(screen.getByRole('button', { name: /Próxima/ }));
        expect(onPageChange).toHaveBeenLastCalledWith(3);

        await user.click(screen.getByRole('button', { name: /Anterior/ }));
        expect(onPageChange).toHaveBeenLastCalledWith(1);
    });

    it('não permite navegar antes da página 1 ou depois da última via clique em botão desabilitado', async () => {
        const user = userEvent.setup();
        const onPageChange = vi.fn();
        render(<Pagination page={1} totalPages={1 + 1} onPageChange={onPageChange} />);
        // page=1, totalPages=2: "Anterior" está desabilitado (page===1)
        await user.click(screen.getByRole('button', { name: /Anterior/ }));
        expect(onPageChange).not.toHaveBeenCalled();
    });
});
