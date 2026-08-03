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

// TypeScript declaration for Web Speech API
declare global {
    interface Window {
        webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
        SpeechRecognition?: SpeechRecognitionConstructorLike;
    }
}

// Removed TabType as we only have Roleplay now

export interface Message {
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

export interface AnalysisResult {
    score: number;
    qualificationsHit: string[];
    objectionsHandled: string[];
    feedback: string;
    strengths: string[];
    improvements: string[];
}
