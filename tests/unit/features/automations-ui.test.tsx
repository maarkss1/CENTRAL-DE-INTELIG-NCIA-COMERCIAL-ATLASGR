import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render as rtlRender, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';

import { Automations } from '@/features/automations/components/Automations';
import { describeAutomation } from '@/features/automations/automations.api';
import { BrandProvider } from '@/contexts/BrandContext';

const AUTOMATIONS_URL = '/api/automations';

function render(ui: React.ReactElement) {
    return rtlRender(<BrandProvider>{ui}</BrandProvider>);
}

const regra = {
    id: 'a1',
    name: 'Avisar em Proposta Enviada',
    enabled: true,
    trigger: 'Lead mudou de status' as const,
    conditions: { status: 'Proposta Enviada' },
    action: 'Notificar equipe' as const,
    actionConfig: {},
    lastRunAt: null,
    runCount: 0,
    createdAt: new Date().toISOString(),
};

function mockList(items: unknown[]) {
    server.use(http.get(AUTOMATIONS_URL, () => HttpResponse.json({ success: true, data: items })));
}

beforeEach(() => {
    mockList([]);
});

afterEach(() => { cleanup(); server.resetHandlers(); });

describe('describeAutomation', () => {
    it('descreve gatilho, condição e ação numa frase', () => {
        expect(describeAutomation(regra)).toBe(
            'Quando "Lead mudou de status" (status = Proposta Enviada) → Notificar equipe',
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
        mockList([regra]);
        render(<Automations />);

        expect(await screen.findByText('Avisar em Proposta Enviada')).toBeTruthy();
        expect(screen.getByText(/Quando "Lead mudou de status"/)).toBeTruthy();
        expect(screen.getByText('ainda não disparou')).toBeTruthy();
        expect(screen.getByText('1 regra · 1 ativa(s)')).toBeTruthy();
    });

    it('pausa a regra pelo switch', async () => {
        mockList([regra]);
        let updateCalledWith: { id: string; patch: unknown } | undefined;
        server.use(
            http.put(`${AUTOMATIONS_URL}/:id`, async ({ params, request }) => {
                updateCalledWith = { id: String(params.id), patch: await request.json() };
                return HttpResponse.json({ success: true, data: { ...regra, enabled: false } });
            }),
        );
        const user = userEvent.setup();
        render(<Automations />);

        await user.click(await screen.findByRole('switch', { name: /Pausar Avisar em Proposta Enviada/ }));
        await waitFor(() => expect(updateCalledWith).toEqual({ id: 'a1', patch: { enabled: false } }));
    });

    it('reverte o switch quando a API recusa', async () => {
        mockList([regra]);
        let updateCalled = false;
        server.use(
            http.put(`${AUTOMATIONS_URL}/:id`, () => {
                updateCalled = true;
                return HttpResponse.json({ success: false, error: 'falhou' }, { status: 500 });
            }),
        );
        const user = userEvent.setup();
        render(<Automations />);

        const sw = await screen.findByRole('switch', { name: /Pausar Avisar em Proposta Enviada/ });
        await user.click(sw);
        await waitFor(() => expect(updateCalled).toBe(true));
        await waitFor(() => expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true'));
    });

    it('cria uma regra com condição de etapa', async () => {
        let createCalledWith: unknown;
        server.use(
            http.post(AUTOMATIONS_URL, async ({ request }) => {
                createCalledWith = await request.json();
                return HttpResponse.json({ success: true, data: regra });
            }),
        );
        const user = userEvent.setup();
        render(<Automations />);

        await user.click(await screen.findByRole('button', { name: /Criar a primeira/ }));
        await user.type(screen.getByLabelText('Nome'), 'Avisar em Proposta Enviada');
        await user.selectOptions(screen.getByLabelText(/Somente na etapa/), 'Proposta Enviada');
        await user.click(screen.getByRole('button', { name: 'Criar' }));

        await waitFor(() => expect(createCalledWith).toBeTruthy());
        const enviado = createCalledWith as { name: string; conditions: unknown; trigger: string };
        expect(enviado.name).toBe('Avisar em Proposta Enviada');
        expect(enviado.conditions).toEqual({ status: 'Proposta Enviada' });
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

    it('cria uma regra de estagnação (dias parado) como operador numérico nas condições', async () => {
        let createCalledWith: unknown;
        server.use(
            http.post(AUTOMATIONS_URL, async ({ request }) => {
                createCalledWith = await request.json();
                return HttpResponse.json({ success: true, data: regra });
            }),
        );
        const user = userEvent.setup();
        render(<Automations />);

        await user.click(await screen.findByRole('button', { name: /Criar a primeira/ }));
        await user.type(screen.getByLabelText('Nome'), 'Proposta sem resposta');
        await user.selectOptions(screen.getByLabelText(/Somente na etapa/), 'Proposta Enviada');
        await user.type(screen.getByLabelText(/reavaliar todo dia/), '3');
        await user.click(screen.getByRole('button', { name: 'Criar' }));

        await waitFor(() => expect(createCalledWith).toBeTruthy());
        const enviado = createCalledWith as { conditions: unknown };
        expect(enviado.conditions).toEqual({
            status: 'Proposta Enviada',
            daysSinceLastInteraction: { gte: 3 },
        });
    });

    it('canal de e-mail: exige destinatário antes de enviar, e manda channel/to no actionConfig', async () => {
        let createCalledWith: unknown;
        server.use(
            http.post(AUTOMATIONS_URL, async ({ request }) => {
                createCalledWith = await request.json();
                return HttpResponse.json({ success: true, data: regra });
            }),
        );
        const user = userEvent.setup();
        render(<Automations />);

        await user.click(await screen.findByRole('button', { name: /Criar a primeira/ }));
        await user.type(screen.getByLabelText('Nome'), 'Avisar gestor por e-mail');
        await user.click(screen.getByText(/Também enviar por e-mail/));
        await user.click(screen.getByRole('button', { name: 'Criar' }));
        expect(createCalledWith).toBeUndefined(); // bloqueado: sem destinatário ainda

        await user.type(screen.getByLabelText('Enviar para (e-mail)'), 'gestor@atlasgr.com.br');
        await user.click(screen.getByRole('button', { name: 'Criar' }));

        await waitFor(() => expect(createCalledWith).toBeTruthy());
        const enviado = createCalledWith as { actionConfig: { channel: string; to: string } };
        expect(enviado.actionConfig.channel).toBe('email');
        expect(enviado.actionConfig.to).toBe('gestor@atlasgr.com.br');
    });
});
