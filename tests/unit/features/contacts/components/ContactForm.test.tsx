import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// vitest.unit.config.ts (usado por `npm run test:unit`, ao contrário do vitest.config.ts na raiz)
// não registra os matchers do jest-dom globalmente — importa aqui pra não depender de config
// compartilhada.
import '@testing-library/jest-dom/vitest';

const createMock = vi.fn();
const updateMock = vi.fn();
const listMock = vi.fn();

vi.mock('@/lib/db', () => ({
    contactsDB: {
        create: (...args: unknown[]) => createMock(...args),
        update: (...args: unknown[]) => updateMock(...args),
    },
    companiesDB: {
        list: (...args: unknown[]) => listMock(...args),
    },
}));

import { ContactForm } from '@/features/contacts/components/ContactForm';
import { ActiveRecordProvider } from '@/contexts/ActiveRecordContext';

// ContactForm agora registra o contato em edição no ActiveRecordContext (copiloto de IA global) —
// mesmo padrão de CompanyDetail/LeadDetailDrawer. Sem o Provider aqui, useActiveRecord() lança.
function renderContactForm(props: React.ComponentProps<typeof ContactForm>) {
    return render(
        <ActiveRecordProvider>
            <ContactForm {...props} />
        </ActiveRecordProvider>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    createMock.mockResolvedValue({ id: 'ct1' });
    listMock.mockResolvedValue({
        data: [{ id: 'co1', legalName: 'Acme Ltda', tradeName: 'Acme' }],
        meta: { total: 1, page: 1, limit: 200, totalPages: 1 },
    });
});

afterEach(() => cleanup());

describe('ContactForm', () => {
    it('shows required-field errors instead of submitting when Nome/Empresa are empty', async () => {
        const user = userEvent.setup();
        renderContactForm({ onClose: vi.fn(), onSave: vi.fn() });

        await waitFor(() => expect(listMock).toHaveBeenCalled());
        await user.click(screen.getByRole('button', { name: /criar contato/i }));

        expect(await screen.findByText('Nome é obrigatório')).toBeInTheDocument();
        // "Selecione uma empresa" também é o texto da <option> placeholder do select — a
        // mensagem de erro real é o segundo elemento com esse texto (o <p> de erro).
        expect(await screen.findAllByText('Selecione uma empresa')).toHaveLength(2);
        expect(createMock).not.toHaveBeenCalled();
    });

    it('shows an e-mail inválido error and blocks submit', async () => {
        const user = userEvent.setup();
        renderContactForm({ onClose: vi.fn(), onSave: vi.fn() });

        await waitFor(() => expect(listMock).toHaveBeenCalled());
        await user.type(screen.getByLabelText(/nome \*/i), 'Fulano de Tal');
        await user.selectOptions(screen.getByLabelText(/empresa \*/i), 'co1');
        await user.type(screen.getByLabelText(/e-mail/i), 'nao-e-um-email');
        await user.click(screen.getByRole('button', { name: /criar contato/i }));

        expect(await screen.findByText(/e-mail inválido/i)).toBeInTheDocument();
        expect(createMock).not.toHaveBeenCalled();
    });

    it('submits via contactsDB.create with valid data', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn();
        renderContactForm({ onClose: vi.fn(), onSave });

        await waitFor(() => expect(listMock).toHaveBeenCalled());
        await user.type(screen.getByLabelText(/nome \*/i), 'Fulano de Tal');
        await user.selectOptions(screen.getByLabelText(/empresa \*/i), 'co1');
        await user.click(screen.getByRole('button', { name: /criar contato/i }));

        await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
        expect(createMock.mock.calls[0][0]).toMatchObject({ name: 'Fulano de Tal', companyId: 'co1' });
        expect(onSave).toHaveBeenCalledTimes(1);
    });
});
