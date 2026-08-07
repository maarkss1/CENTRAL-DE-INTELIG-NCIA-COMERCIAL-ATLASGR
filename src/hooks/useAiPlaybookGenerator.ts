import { useState } from 'react';
import { api } from '../lib/api';

interface AgentReply {
    reply: string;
    model: string;
    mode: string;
}

/**
 * Geração de IA sob medida para objeção/qualificação digitada pelo usuário — reaproveita os
 * mesmos modos de sistema (`objections`, `qualification`) que antes só existiam no AIDockWidget
 * (`/api/agent/chat` com tool=objections, `/api/agent/qualification`), agora dentro da aba
 * "Matrizes & Objeções" do FloatingChatbook, ao lado da busca estática já existente.
 */
export function useAiPlaybookGenerator() {
    const [objectionInput, setObjectionInput] = useState('');
    const [objectionReply, setObjectionReply] = useState('');
    const [isGeneratingObjection, setIsGeneratingObjection] = useState(false);
    const [objectionError, setObjectionError] = useState('');

    const [qualificationInput, setQualificationInput] = useState('');
    const [qualificationReply, setQualificationReply] = useState('');
    const [isGeneratingQualification, setIsGeneratingQualification] = useState(false);
    const [qualificationError, setQualificationError] = useState('');

    const generateObjectionResponse = async () => {
        if (!objectionInput.trim() || isGeneratingObjection) return;
        setIsGeneratingObjection(true);
        setObjectionError('');
        try {
            const data = await api.post<AgentReply>('/api/agent/chat', { message: objectionInput, tool: 'objections' });
            setObjectionReply(data.reply);
        } catch (error) {
            setObjectionError(error instanceof Error ? error.message : 'Não foi possível gerar a resposta.');
        } finally {
            setIsGeneratingObjection(false);
        }
    };

    const generateQualificationQuestions = async () => {
        if (!qualificationInput.trim() || isGeneratingQualification) return;
        setIsGeneratingQualification(true);
        setQualificationError('');
        try {
            const data = await api.post<AgentReply>('/api/agent/qualification', { message: qualificationInput });
            setQualificationReply(data.reply);
        } catch (error) {
            setQualificationError(error instanceof Error ? error.message : 'Não foi possível gerar as perguntas.');
        } finally {
            setIsGeneratingQualification(false);
        }
    };

    return {
        objectionInput, setObjectionInput, objectionReply, isGeneratingObjection, objectionError, generateObjectionResponse,
        qualificationInput, setQualificationInput, qualificationReply, isGeneratingQualification, qualificationError, generateQualificationQuestions,
    };
}
