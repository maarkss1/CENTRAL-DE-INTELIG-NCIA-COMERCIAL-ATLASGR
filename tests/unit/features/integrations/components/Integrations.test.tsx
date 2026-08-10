import { describe, it, expect, beforeEach, vi } from 'vitest';
// não registra os matchers do jest-dom globalmente — importa aqui pra não depender de config
// (mesmo padrão de tests/unit/features/companies/components/CompanyForm.test.tsx).
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../../mocks/server';

// GESTOR por padrão: mantém as flows de connect/disconnect exercitadas pelos testes existentes
// sem exigir AuthProvider/authClient reais (rede/sessão) só para montar este componente.
// Testes específicos de permissão sobrescrevem com mockReturnValueOnce.
const useAuthMock = vi.fn(() => ({ currentUser: { role: 'GESTOR' } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => useAuthMock() }));

import { Integrations } from '@/features/integrations/components/Integrations';

// Regressão do bloqueador #9 do AGENTS.md ("Erros de frontend em Integrações, incluindo
// estado/importações ausentes" — suspeita de `useState` ausente). Ao investigar, o componente já
// importava `useState` corretamente (nenhum bug de import encontrado neste ponto do código) — este
// teste existe para travar essa garantia: se alguém remover o import de novo, ou se qualquer um
// dos quatro hooks de integração (WhatsApp/Google/Bitrix/3CX) lançar durante o render inicial, o
// teste falha imediatamente em vez de o bug só aparecer em produção.
function mockAllIntegrationEndpoints() {
    server.use(
        http.get('/api/whatsapp/status', () => HttpResponse.json({ success: true, data: { status: 'disconnected', qr: null } })),
        http.get('/api/google/status', () => HttpResponse.json({ success: true, data: { connected: false, email: null } })),
        http.get('/api/bitrix/connections', () => HttpResponse.json({ success: true, data: [] })),
        http.get('/api/integrations/3cx/connections', () => HttpResponse.json({ success: true, data: [] })),
    );
}

beforeEach(() => {
    cleanup();
    mockAllIntegrationEndpoints();
    useAuthMock.mockReturnValue({ currentUser: { role: 'GESTOR' } });
});

describe('Integrations — tela de Integrações não quebra ao montar (estado/imports)', () => {
    it('renderiza as 4 abas sem lançar erro (WhatsApp, Google, Bitrix24, 3CX)', async () => {
        render(<Integrations />);

expect(screen.getByText('Integrações')).toBeInTheDocument();

        // Escopado ao <nav> das abas: a aba "WhatsApp" e o botão de ação "Conectar WhatsApp" do
        // painel de conteúdo têm nomes acessíveis que casam com o mesmo /WhatsApp/ regex — sem
        // escopar, getByRole('button', {name}) achava os dois e falhava por ambiguidade.
        const tabs = within(screen.getByRole('navigation', { name: 'Módulos de integração' }));
        expect(tabs.getByRole('button', { name: /WhatsApp/ })).toBeInTheDocument();
        expect(tabs.getByRole('button', { name: /Google Workspace/ })).toBeInTheDocument();
        expect(tabs.getByRole('button', { name: /Bitrix24/ })).toBeInTheDocument();
        expect(tabs.getByRole('button', { name: /PABX 3CX/ })).toBeInTheDocument();

        // Aba inicial (WhatsApp) renderizou de fato o conteúdo, não só a casca da sidebar.
        await waitFor(() => expect(screen.getByText('Desconectado')).toBeInTheDocument());
    });

    it('troca de aba sem lançar erro e mostra o conteúdo de cada uma (activeTab via useState)', async () => {
        const user = userEvent.setup();
        render(<Integrations />);

        await user.click(screen.getByText('Bitrix24'));
        expect(await screen.findByText(/Todo lead novo do Atlas vai automaticamente/)).toBeInTheDocument();

        await user.click(screen.getByText('Google Workspace'));
        expect(await screen.findByText('Gmail e Calendar integrados.')).toBeInTheDocument();

        await user.click(screen.getByText('PABX 3CX')).catch(() => {});
        expect(await screen.findByText(/Click-to-Call, gravação de chamadas/)).toBeInTheDocument();
    });

    it('mostra estado desconectado quando os endpoints de status falham (sem tela em branco)', async () => {
        server.use(
            http.get('/api/whatsapp/status', () => HttpResponse.json({ success: false, error: 'boom' }, { status: 500 })),
            http.get('/api/google/status', () => HttpResponse.json({ success: false, error: 'boom' }, { status: 500 })),
            http.get('/api/bitrix/connections', () => HttpResponse.json({ success: false, error: 'boom' }, { status: 500 })),
            http.get('/api/integrations/3cx/connections', () => HttpResponse.json({ success: false, error: 'boom' }, { status: 500 })),
        );

        render(<Integrations />);

        // Falha de rede/servidor nos 4 status endpoints não deixa a tela em branco nem lança —
        // cai pro estado padrão "desconectado" de cada hook.
        expect(screen.getByText('Integrações')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText('Desconectado')).toBeInTheDocument());
    });

    it('VISUALIZADOR vê o status mas não consegue conectar (achado do inventário de navegação da Onda 1)', async () => {
        useAuthMock.mockReturnValue({ currentUser: { role: 'VISUALIZADOR' } });
        render(<Integrations />);

        await waitFor(() => expect(screen.getByText('Desconectado')).toBeInTheDocument());

        expect(screen.getByText(/exige permissão de Gestor ou Administrador/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Conectar WhatsApp' })).toBeDisabled();
    });
});
