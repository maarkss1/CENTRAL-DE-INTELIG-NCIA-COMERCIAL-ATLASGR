// SpeechRecognitionLike/SpeechRecognitionEventLike/Window.SpeechRecognition agora são tipos
// ambient globais definidos em src/types/speech-recognition.d.ts (sem import necessário) — movidos
// de volta pra lá pra não colidir com a mesma declaração global usada por VoiceCommandWidget.tsx.

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
