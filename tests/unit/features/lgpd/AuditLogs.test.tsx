import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render as rtlRender, screen, cleanup, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../../../mocks/server';

import { AuditLogs } from '@/features/lgpd/components/AuditLogs';

/**
 * ACHADO REAL DO PILOTO 025: `GET /api/lgpd/audit-logs` devolvia `{ success: true, logs }` (chave
 * na raiz) em vez de `{ success: true, data: { logs } }`. Como `api.get` sempre desembrulha
 * `data.data`, `res.logs` era sempre `undefined` — a aba "Auditoria & LGPD" nunca mostrava nenhum
 * registro, para nenhum usuário, mesmo com dados reais no banco. Este teste prova o contrato
 * correto do lado do cliente: se o backend regredir para o formato antigo, o teste falha aqui,
 * não silenciosamente em produção.
 */

const LOGS_URL = '/api/lgpd/audit-logs';

const log = {
    id: 'log-1',
    action: 'DELETE',
    entity: 'LGPD_TITULAR',
    entityId: 'contact-1',
    actorId: 'user-1',
    ipAddress: '10.0.0.1',
    details: null,
    timestamp: '2026-08-01T12:00:00.000Z',
};

afterEach(() => {
    cleanup();
    server.resetHandlers();
});

describe('AuditLogs', () => {
    it('renderiza os registros quando o backend usa o envelope padrão {success, data: {logs}}', async () => {
        server.use(
            http.get(LOGS_URL, () => HttpResponse.json({ success: true, data: { logs: [log] } })),
        );
        rtlRender(<AuditLogs />);

        expect(await screen.findByText('LGPD_TITULAR')).toBeTruthy();
        const table = screen.getByRole('table');
        expect(within(table).getByText('DELETE')).toBeTruthy();
    });

    it('mostra estado vazio (não erro) quando não há registros', async () => {
        server.use(http.get(LOGS_URL, () => HttpResponse.json({ success: true, data: { logs: [] } })));
        rtlRender(<AuditLogs />);

        expect(await screen.findByText('Nenhum registro de auditoria encontrado.')).toBeTruthy();
    });

    it('mostra erro recuperável quando a API falha de verdade', async () => {
        server.use(
            http.get(LOGS_URL, () =>
                HttpResponse.json({ success: false, error: 'Banco indisponível' }, { status: 500 }),
            ),
        );
        rtlRender(<AuditLogs />);

        expect(await screen.findByText('Banco indisponível')).toBeTruthy();
    });
});
