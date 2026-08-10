export {};

/**
 * Web Speech API não faz parte da lib "DOM" do TypeScript (ainda não padronizada) — tipos mínimos
 * cobrindo só o que VoiceCommandWidget.tsx e RoleplayHub.tsx usam, no lugar de `any`. Únicos e
 * globais (sem import) para evitar duas declarações de `Window.SpeechRecognition` incompatíveis
 * entre si, que o TypeScript rejeita ao mesclar `declare global` de arquivos diferentes.
 */
declare global {
    interface SpeechRecognitionResultLike {
        0: { transcript: string };
        /** true quando o reconhecimento terminou de processar este resultado (não é mais interino). */
        isFinal: boolean;
    }

    interface SpeechRecognitionEventLike {
        results: ArrayLike<SpeechRecognitionResultLike>;
    }

    interface SpeechRecognitionLike {
        continuous: boolean;
        interimResults?: boolean;
        lang: string;
        onresult: ((event: SpeechRecognitionEventLike) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start(): void;
        stop(): void;
    }

    type SpeechRecognitionConstructorLike = new () => SpeechRecognitionLike;

    interface Window {
        SpeechRecognition?: SpeechRecognitionConstructorLike;
        webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
    }
}
