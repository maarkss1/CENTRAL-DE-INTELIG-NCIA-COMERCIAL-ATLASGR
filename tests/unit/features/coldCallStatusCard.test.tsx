import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render as rtlRender, screen, cleanup } from '@testing-library/react';

const statusMock = vi.fn();

vi.mock('@/features/automations/coldCallCampaign.api', () => ({
    coldCallCampaignApi: { status: () => statusMock() },
}));

import { ColdCallStatusCard } from '@/features/automations/components/ColdCallStatusCard';

function render(ui: React.ReactElement) {
    return rtlRender(ui);
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ColdCallStatusCard', () => {
    it('mostra a campanha como inativa quando a organização não está habilitada', async () => {
        statusMock.mockResolvedValue({
            enabled: false,
            window: { startHour: 9, endHour: 18, weekdaysOnly: true, timeZone: 'America/Sao_Paulo' },
            policy: { maxAttemptsPerLead: 3, retryCooldownHours: 48 },
            recentRuns: [],
        });

        render(<ColdCallStatusCard />);

        expect(await screen.findByText('inativa')).toBeTruthy();
        expect(screen.getByText(/Desativada para esta organização/)).toBeTruthy();
        expect(screen.getByText('Nenhuma execução registrada ainda.')).toBeTruthy();
    });

    it('mostra a janela de discagem e as execuções recentes quando ativa', async () => {
        statusMock.mockResolvedValue({
            enabled: true,
            window: { startHour: 9, endHour: 18, weekdaysOnly: true, timeZone: 'America/Sao_Paulo' },
            policy: { maxAttemptsPerLead: 3, retryCooldownHours: 48 },
            recentRuns: [
                {
                    id: 'r1',
                    scanned: 12,
                    called: 4,
                    skippedMaxAttempts: 1,
                    skippedCooldown: 2,
                    skippedNoPhone: 3,
                    skippedSuppressed: 1,
                    skippedError: 1,
                    haltedBy: null,
                    runAt: '2026-08-03T12:00:00.000Z',
                },
                {
                    id: 'r2',
                    scanned: 0,
                    called: 0,
                    skippedMaxAttempts: 0,
                    skippedCooldown: 0,
                    skippedNoPhone: 0,
                    skippedSuppressed: 0,
                    skippedError: 0,
                    haltedBy: 'outside-window',
                    runAt: '2026-08-01T12:00:00.000Z',
                },
            ],
        });

        render(<ColdCallStatusCard />);

        expect(await screen.findByText('ativa')).toBeTruthy();
        expect(screen.getByText(/09h–18h, dias úteis \(America\/Sao_Paulo\)/)).toBeTruthy();
        expect(screen.getByText(/12 examinado\(s\) · 4 ligação\(ões\) · 8 pulado\(s\)/)).toBeTruthy();
        expect(screen.getByText('fora da janela de discagem')).toBeTruthy();
    });

    it('mostra erro quando a API falha', async () => {
        statusMock.mockRejectedValue(new Error('falha de rede'));

        render(<ColdCallStatusCard />);

        expect(await screen.findByText('falha de rede')).toBeTruthy();
    });
});
