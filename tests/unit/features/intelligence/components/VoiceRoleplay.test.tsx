/**
 * Cobre o widget de roleplay por voz (Web Speech API + fallback de TTS via /api/agent/tts).
 * jsdom não implementa SpeechRecognition/Audio/URL.createObjectURL de verdade, então o teste
 * simula esses globais do navegador pra exercitar o fluxo real: reconhecimento indisponível
 * (alerta), captura de transcript -> envio pra /api/agent/roleplay -> fala da resposta, e o
 * caminho de erro de rede.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render as rtlRender, screen, waitFor, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

import { VoiceRoleplay } from '@/features/intelligence/components/VoiceRoleplay';

interface FakeRecognitionEvent {
    resultIndex: number;
    results: Record<number, Record<number, { transcript: string }>>;
}

class FakeSpeechRecognition {
    continuous = false;
    interimResults = false;
    lang = '';
    onresult: ((e: FakeRecognitionEvent) => void) | null = null;
    onend: (() => void) | null = null;
    start = vi.fn();
    stop = vi.fn();
}

class FakeAudio {
    onplay: (() => void) | null = null;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public src?: string) {}
    play = vi.fn(() => {
        this.onplay?.();
        return Promise.resolve();
    });
    pause = vi.fn();
}

let recognitionInstances: FakeSpeechRecognition[];
let fetchMock: ReturnType<typeof vi.fn>;

function mountWithSpeechSupport() {
    recognitionInstances = [];
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = class extends FakeSpeechRecognition {
        constructor() {
            super();
            recognitionInstances.push(this);
        }
    };
}

beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('Audio', FakeAudio);
    Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:mock') });
    Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('VoiceRoleplay', () => {
    it('renderiza sem erro com o prompt inicial', () => {
        rtlRender(<VoiceRoleplay onClose={vi.fn()} onSwitchToText={vi.fn()} />);
        expect(screen.getByText('Live Roleplay')).toBeInTheDocument();
        expect(screen.getByText('Toque no microfone para falar com o comprador virtual.')).toBeInTheDocument();
    });

    it('chama onClose e onSwitchToText pelos controles do cabeçalho', async () => {
        const onClose = vi.fn();
        const onSwitchToText = vi.fn();
        const user = userEvent.setup();
        rtlRender(<VoiceRoleplay onClose={onClose} onSwitchToText={onSwitchToText} />);

        await user.click(screen.getByText('Modo Texto'));
        expect(onSwitchToText).toHaveBeenCalledTimes(1);

        await user.click(screen.getByText('✕'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('avisa que o navegador não suporta reconhecimento de voz quando a API não existe', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
        const user = userEvent.setup();
        rtlRender(<VoiceRoleplay onClose={vi.fn()} onSwitchToText={vi.fn()} />);

        const micButton = screen.getAllByRole('button')[3];
        await user.click(micButton);

        expect(alertSpy).toHaveBeenCalledWith(
            'Reconhecimento de voz não suportado neste navegador. Use o Chrome.',
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('captura o transcript falado, envia pra IA e fala a resposta de volta', async () => {
        mountWithSpeechSupport();
        fetchMock.mockImplementation((url: string) => {
            if (url === '/api/agent/roleplay') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true, reply: 'Temos um plano ideal pra você.' }),
                });
            }
            if (url === '/api/agent/tts') {
                return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob()) });
            }
            throw new Error(`unexpected fetch to ${url}`);
        });

        const user = userEvent.setup();
        rtlRender(<VoiceRoleplay onClose={vi.fn()} onSwitchToText={vi.fn()} />);

        // Liga o microfone: o clique usa a instância de reconhecimento já montada (efeito
        // inicial) para chamar start(); em seguida o estado muda e o efeito recria a instância
        // (dependência [isListening]), agora com onresult/onend fechados sobre isListening=true.
        await user.click(screen.getAllByRole('button')[3]);
        expect(recognitionInstances[0].start).toHaveBeenCalled();
        await waitFor(() => expect(recognitionInstances.length).toBeGreaterThan(1));
        const recognition = recognitionInstances[recognitionInstances.length - 1];

        // Simula o resultado do reconhecimento de voz.
        act(() => {
            recognition.onresult?.({
                resultIndex: 0,
                results: { 0: { 0: { transcript: 'Quero saber o preço' } } },
            });
        });
        expect(await screen.findByText('Quero saber o preço')).toBeInTheDocument();

        // Desliga o microfone -> dispara o processamento com o transcript capturado.
        await user.click(screen.getAllByRole('button')[3]);
        expect(recognition.stop).toHaveBeenCalled();

        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/agent/roleplay',
                expect.objectContaining({ method: 'POST' }),
            ),
        );
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/agent/tts', expect.anything()));

        expect(await screen.findByText('"Temos um plano ideal pra você."')).toBeInTheDocument();
    });

    it('não quebra e volta ao estado ocioso quando a chamada à IA falha', async () => {
        mountWithSpeechSupport();
        fetchMock.mockRejectedValue(new Error('network down'));

        const user = userEvent.setup();
        rtlRender(<VoiceRoleplay onClose={vi.fn()} onSwitchToText={vi.fn()} />);

        await user.click(screen.getAllByRole('button')[3]);
        await waitFor(() => expect(recognitionInstances.length).toBeGreaterThan(1));
        const recognition = recognitionInstances[recognitionInstances.length - 1];

        act(() => {
            recognition.onresult?.({
                resultIndex: 0,
                results: { 0: { 0: { transcript: 'Alô?' } } },
            });
        });

        await user.click(screen.getAllByRole('button')[3]);

        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/agent/roleplay', expect.anything()));
        // Volta ao prompt inicial em vez de travar em "Processando".
        expect(await screen.findByText('Toque no microfone para falar com o comprador virtual.')).toBeInTheDocument();
    });
});
