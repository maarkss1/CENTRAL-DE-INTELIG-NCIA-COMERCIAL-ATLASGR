import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const createMock = vi.fn();
const updateMock = vi.fn();

vi.mock('@/lib/db', () => ({
    companiesDB: {
        create: (...args: unknown[]) => createMock(...args),
        update: (...args: unknown[]) => updateMock(...args),
    },
}));

import { CompanyForm } from '@/features/companies/components/CompanyForm';

beforeEach(() => {
    vi.clearAllMocks();
    createMock.mockResolvedValue({ id: 'c1' });
});

afterEach(() => cleanup());

describe('CompanyForm', () => {
    it('shows required-field errors instead of submitting when Razão Social/Nome Fantasia are empty', async () => {
        const user = userEvent.setup();
        render(<CompanyForm onClose={vi.fn()} onSave={vi.fn()} />);

        await user.click(screen.getByRole('button', { name: /criar empresa/i }));

        expect(await screen.findByText('Razão Social é obrigatória')).toBeInTheDocument();
        expect(screen.getByText('Nome Fantasia é obrigatório')).toBeInTheDocument();
        expect(createMock).not.toHaveBeenCalled();
    });

    it('shows a CNPJ inválido error and blocks submit when the checksum is wrong', async () => {
        const user = userEvent.setup();
        render(<CompanyForm onClose={vi.fn()} onSave={vi.fn()} />);

        await user.type(screen.getByLabelText(/razão social/i), 'Acme Transportes Ltda');
        await user.type(screen.getByLabelText(/nome fantasia/i), 'Acme');
        await user.type(screen.getByPlaceholderText('00.000.000/0000-00'), '11.111.111/1111-11');
        await user.click(screen.getByRole('button', { name: /criar empresa/i }));

        expect(await screen.findByText(/cnpj inválido/i)).toBeInTheDocument();
        expect(createMock).not.toHaveBeenCalled();
    });

    it('submits via companiesDB.create with a valid CNPJ', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn();
        render(<CompanyForm onClose={vi.fn()} onSave={onSave} />);

        await user.type(screen.getByLabelText(/razão social/i), 'Acme Transportes Ltda');
        await user.type(screen.getByLabelText(/nome fantasia/i), 'Acme');
        // CNPJ válido (dígitos verificadores corretos) usado só como fixture de teste.
        await user.type(screen.getByPlaceholderText('00.000.000/0000-00'), '11.222.333/0001-81');
        await user.click(screen.getByRole('button', { name: /criar empresa/i }));

        await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
        expect(createMock.mock.calls[0][0]).toMatchObject({
            legalName: 'Acme Transportes Ltda',
            tradeName: 'Acme',
            cnpj: '11.222.333/0001-81',
        });
        expect(onSave).toHaveBeenCalledTimes(1);
    });
});
