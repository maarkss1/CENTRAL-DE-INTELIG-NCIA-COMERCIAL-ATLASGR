/**
 * Cobre o contrato honesto de navegação por voz (bloqueador #7 do AGENTS.md: "comando de voz que
 * afirma navegar sem realizar navegação"). O widget nunca deve anunciar sucesso sem que
 * `navigationBus.requestNavigation` confirme que a navegação foi de fato disparada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render as rtlRender, screen, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const requestNavigationMock = vi.fn();

vi.mock('@/lib/navigationBus', () => ({
    navigationBus: { requestNavigation: (...args: unknown[]) => requestNavigationMock(...args) },
}));

import { VoiceCommandWidget } from '@/components/ui/VoiceCommandWidget';
import { BrandProvider } from '@/contexts/BrandContext';

function render(ui: React.ReactElement) {
    return rtlRender(<BrandProvider>{ui}</BrandProvider>);
}

/** Fake mínimo do SpeechRecognition — só o suficiente pro widget se inicializar e reagir a onresult. */
class FakeSpeechRecognition implements SpeechRecognitionLike {
    continuous = false;
    interimResults = true;
    lang = '';
    onresult: ((event: SpeechRecognitionEventLike) => void) | null = null;
    onerror: (() => void) | null = null;
    onend: (() => void) | null = null;
    start = vi.fn();
    stop = vi.fn();

    /** Simula o navegador entregando uma transcrição final. */
    emit(transcript: string) {
        this.onresult?.({
            results: [{ 0: { transcript }, isFinal: true }],
        });
    }
}

let fakeRecognition: FakeSpeechRecognition;

beforeEach(() => {
    vi.clearAllMocks();
    fakeRecognition = new FakeSpeechRecognition();
    // Função construtora simples (não vi.fn com arrow function) — `new` exige uma função com
    // [[Construct]], que uma implementação em arrow function do vi.fn não tem.
    // @ts-expect-error — stub mínimo de teste, não a interface DOM completa.
    window.SpeechRecognition = function SpeechRecognitionStub() {
        return fakeRecognition;
    };
});

afterEach(() => {
    cleanup();
    // @ts-expect-error — limpo o stub entre testes.
    delete window.SpeechRecognition;
});

describe('VoiceCommandWidget — contrato honesto de navegação', () => {
    it('anuncia sucesso quando navigationBus confirma que a navegação foi disparada', () => {
        requestNavigationMock.mockReturnValue(true);
        render(<VoiceCommandWidget />);

        act(() => { fakeRecognition.emit('abrir crm'); });

        expect(requestNavigationMock).toHaveBeenCalledWith('crm');
        expect(screen.getByText('Navegou para o CRM Board')).toBeInTheDocument();
    });

    it('NUNCA anuncia sucesso quando navigationBus reporta que a navegação falhou', () => {
        requestNavigationMock.mockReturnValue(false);
        render(<VoiceCommandWidget />);

        act(() => { fakeRecognition.emit('abrir crm'); });

        expect(requestNavigationMock).toHaveBeenCalledWith('crm');
        expect(screen.queryByText('Navegou para o CRM Board')).not.toBeInTheDocument();
        expect(screen.getByText(/Não consegui navegar/)).toBeInTheDocument();
    });

    it('avisa quando o comando não é reconhecido, em vez de ficar em silêncio (sem falso positivo nem botão morto)', () => {
        render(<VoiceCommandWidget />);

        act(() => { fakeRecognition.emit('faça o café da manhã'); });

        expect(requestNavigationMock).not.toHaveBeenCalled();
        expect(screen.getByText(/Não entendi o comando/)).toBeInTheDocument();
    });
});
