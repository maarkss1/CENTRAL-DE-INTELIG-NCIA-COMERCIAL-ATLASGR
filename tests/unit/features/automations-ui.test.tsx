import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render as rtlRender, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const listMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();
const removeMock = vi.fn();

vi.mock('@/features/automations/automations.api', async () => {
    const actual = await vi.importActual<typeof import('@/features/automations/automations.api')>(
        '@/features/automations/automations.api',
    );
    return {
        ...actual,
        automationsApi: {
            list: () => listMock(),
            create: (d: unknown) => createMock(d),
            update: (id: string, p: unknown) => updateMock(id, p),
            remove: (id: string) => removeMock(id),
        },
    };
});

import { Automations } from '@/features/automations/components/Automations';
import { describeAutomation } from '@/features/automations/automations.api';
import { BrandProvider } from '@/contexts/BrandContext';

function render(ui: React.ReactElement) {
    return rtlRender(<BrandProvider>{ui}</BrandProvider>);
}

const regra = {
    id: 'a1',
    name: 'Avisar em Proposta',
    enabled: true,
    trigger: 'Lead mudou de status' as const,
    conditions: { status: 'Proposta' },
    action: 'Notificar equipe' as const,
    actionConfig: {},
    lastRunAt: null,
    runCount: 0,
    createdAt: new Date().toISOString(),
};

beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue([]);
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('describeAutomation', () => {
    it('descreve gatilho, condição e ação numa frase', () => {
        expect(describeAutomation(regra)).toBe(
            'Quando "Lead mudou de status" (status = Proposta) → Notificar equipe',
        );
    });

    it('omite o filtro quando não há condição', () => {
        expect(describeAutomation({ ...regra, conditions: null })).toBe(
            'Quando "Lead mudou de status" → Notificar equipe',
        );
    });

    it('ignora condições de valor vazio', () => {
        expect(describeAutomation({ ...regra, conditions: { status: '' } })).toBe(
            'Quando "Lead mudou de status" → Notificar equipe',
        );
    });
});

describe('Automações', () => {
    it('mostra estado vazio com convite para criar', async () => {
        render(<Automations />);
        expect(await screen.findByText('Nenhuma automação ainda')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Criar a primeira/ })).toBeTruthy();
    });

    it('lista a regra com a descrição e o contador de execuções', async () => {
        listMock.mockResolvedValue([regra]);
        render(<Automations />);

        expect(await screen.findByText('Avisar em Proposta')).toBeTruthy();
        expect(screen.getByText(/Quando "Lead mudou de status"/)).toBeTruthy();
        expect(screen.getByText('ainda não disparou')).toBeTruthy();
        expect(screen.getByText('1 regra · 1 ativa(s)')).toBeTruthy();
    });

    it('pausa a regra pelo switch', async () => {
        listMock.mockResolvedValue([regra]);
        updateMock.mockResolvedValue({ ...regra, enabled: false });
        const user = userEvent.setup();
        render(<Automations />);

        await user.click(await screen.findByRole('switch', { name: /Pausar Avisar em Proposta/ }));
        await waitFor(() => expect(updateMock).toHaveBeenCalledWith('a1', { enabled: false }));
    });

    it('reverte o switch quando a API recusa', async () => {
        listMock.mockResolvedValue([regra]);
        updateMock.mockRejectedValue(new Error('falhou'));
        const user = userEvent.setup();
        render(<Automations />);

        const sw = await screen.findByRole('switch', { name: /Pausar Avisar em Proposta/ });
        await user.click(sw);
        await waitFor(() => expect(updateMock).toHaveBeenCalled());
        await waitFor(() => expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true'));
    });

    it('cria uma regra com condição de etapa', async () => {
        createMock.mockResolvedValue(regra);
        const user = userEvent.setup();
        render(<Automations />);

        await user.click(await screen.findByRole('button', { name: /Criar a primeira/ }));
        await user.type(screen.getByLabelText('Nome'), 'Avisar em Proposta');
        await user.selectOptions(screen.getByLabelText(/Somente na etapa/), 'Proposta');
        await user.click(screen.getByRole('button', { name: 'Criar' }));

        await waitFor(() => expect(createMock).toHaveBeenCalled());
        const enviado = createMock.mock.calls[0][0];
        expect(enviado.name).toBe('Avisar em Proposta');
        expect(enviado.conditions).toEqual({ status: 'Proposta' });
        expect(enviado.trigger).toBe('Lead mudou de status');
    });

    it('esconde o filtro de etapa em gatilhos que não são de status', async () => {
        const user = userEvent.setup();
        render(<Automations />);

        await user.click(await screen.findByRole('button', { name: /Criar a primeira/ }));
        expect(screen.getByLabelText(/Somente na etapa/)).toBeTruthy();

        await user.selectOptions(screen.getByLabelText('Quando'), 'Lead criado');
        expect(screen.queryByLabelText(/Somente na etapa/)).toBeNull();
    });
});
