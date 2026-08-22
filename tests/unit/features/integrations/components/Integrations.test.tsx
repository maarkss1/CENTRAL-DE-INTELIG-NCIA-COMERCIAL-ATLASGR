import { describe, it, expect, beforeEach, vi } from 'vitest';
// não registra os matchers do jest-dom globalmente — importa aqui pra não depender de config
// (mesmo padrão de tests/unit/features/companies/components/CompanyForm.test.tsx).
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, cleanup, within, configure } from '@testing-library/react';
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

// `findByText`/`waitFor` neste arquivo falharam de forma intermitente em CI (não reproduz local)
// com o timeout padrão de 1000ms — runner sob I/O pesado (containers de Postgres/Redis do job)
// pode atrasar o próximo render bem além disso mesmo sem nenhum fetch de rede envolvido, já que
// o conteúdo de cada aba é puramente `activeTab === X &&` (sem efeito assíncrono). Timeout maior
// só absorve lentidão do runner, não muda o que o teste verifica. O `testTimeout` de cada `it`
// também precisa subir junto (padrão do vitest é 5000ms) — senão o teste inteiro estoura antes do
// `asyncUtilTimeout` interno do findByText/waitFor ter chance de valer alguma coisa.
const TEST_TIMEOUT_MS = 20_000;
configure({ asyncUtilTimeout: 8_000 });

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
    }, TEST_TIMEOUT_MS);

    it('troca de aba sem lançar erro e mostra o conteúdo de cada uma (activeTab via useState)', async () => {
        const user = userEvent.setup();
        render(<Integrations />);

        await user.click(screen.getByText('Bitrix24'));
        expect(await screen.findByText(/Bitrix24 tem leitura\/importação real/)).toBeInTheDocument();

        await user.click(screen.getByText('Google Workspace'));
        expect(await screen.findByText('Gmail em modo leitura; Calendar tem leitura e escrita real (via Cadência); a Agenda do produto continua local.')).toBeInTheDocument();

        await user.click(screen.getByText('PABX 3CX')).catch(() => {});
        expect(await screen.findByText(/Cadastro de PABX 3CX e teste de comunicação/)).toBeInTheDocument();
    }, TEST_TIMEOUT_MS);

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
    }, TEST_TIMEOUT_MS);

    it('declara maturidade real por integração — escrita real no Google Calendar (CYC-004) com prova, sem prometer 3CX 24h sem prova', async () => {
        const user = userEvent.setup();
        server.use(
            http.get('/api/google/status', () => HttpResponse.json({ success: true, data: { connected: true, email: 'agenda@example.com', hasCalendarWriteScope: true } })),
            http.get('/api/google/calendar/upcoming', () => HttpResponse.json({ success: true, data: [] })),
            http.get('/api/bitrix/connections', () => HttpResponse.json({
                success: true,
                data: [{
                    id: 'bitrix-1',
                    label: 'AtlasGR',
                    portalDomain: 'atlas.bitrix24.com.br',
                    webhookReceiverUrl: 'https://app.example.com/api/bitrix/webhook/bitrix-1',
                    hasWebhookSecret: true,
                    inboundEventsEnabled: true,
                }],
            })),
            http.get('/api/integrations/3cx/connections', () => HttpResponse.json({ success: true, data: [{ id: '3cx-1', label: '3CX Comercial', pbxUrl: 'https://pbx.example.com', extension: '101', autoDialEnabled: true }] })),
        );

        render(<Integrations />);

        expect(await screen.findByText('não é API oficial Meta')).toBeInTheDocument();

        await user.click(screen.getByText('Google Workspace'));
        expect(await screen.findByText('Calendar escrita via Cadência')).toBeInTheDocument();
        expect(screen.getByText(/A Agenda do Atlas continua local e não sincroniza com o Google/i)).toBeInTheDocument();
        expect(screen.getByText(/Agendamento pela Cadência cria o evento de verdade no Google Calendar/i)).toBeInTheDocument();

        await user.click(screen.getByText('Bitrix24'));
        expect(await screen.findByText('webhook entrada opcional')).toBeInTheDocument();
        expect(screen.getByText(/Não é espelho bidirecional completo/i)).toBeInTheDocument();

        await user.click(screen.getByText('PABX 3CX'));
        expect(await screen.findByText('gravações dependem de webhook')).toBeInTheDocument();
        expect(screen.getByText(/não prova, sozinha, gravação de chamadas ou prospecção 24h/i)).toBeInTheDocument();
    }, TEST_TIMEOUT_MS);

    it('avisa (sem prometer escrita) quando a conexão Google é anterior ao escopo calendar.events', async () => {
        const user = userEvent.setup();
        server.use(
            http.get('/api/google/status', () => HttpResponse.json({ success: true, data: { connected: true, email: 'agenda@example.com', hasCalendarWriteScope: false } })),
            http.get('/api/google/calendar/upcoming', () => HttpResponse.json({ success: true, data: [] })),
        );

        render(<Integrations />);

        await user.click(screen.getByText('Google Workspace'));
        expect(await screen.findByText(/ainda tem só/i)).toBeInTheDocument();
        expect(screen.getByText(/desconectar e reconectar a conta abaixo/i)).toBeInTheDocument();
    });

    it('VISUALIZADOR vê o status mas não consegue conectar (achado do inventário de navegação da Onda 1)', async () => {
        useAuthMock.mockReturnValue({ currentUser: { role: 'VISUALIZADOR' } });
        render(<Integrations />);

        await waitFor(() => expect(screen.getByText('Desconectado')).toBeInTheDocument());

        expect(screen.getByText(/exige permissão de Gestor ou Administrador/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Conectar WhatsApp' })).toBeDisabled();
    }, TEST_TIMEOUT_MS);
});
