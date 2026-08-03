export interface SpeechRecognitionEventLike {
    results: {
        [index: number]: {
            [index: number]: { transcript: string };
        };
    };
}

export interface SpeechRecognitionLike {
    continuous: boolean;
    lang: string;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    onerror: (() => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
}

export interface SpeechRecognitionConstructorLike {
    new(): SpeechRecognitionLike;
}

declare global {
    interface Window {
        webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
        SpeechRecognition?: SpeechRecognitionConstructorLike;
    }
}

export interface CallMessage {
    id: string;
    sender: 'bot' | 'user';
    text: string;
    timestamp: string;
}

export interface Persona {
    id: string;
    label: string;
    desc: string;
}

export interface CallAnalysisResult {
    score: number;
    feedback: string;
    strengths: string[];
    improvements: string[];
}
