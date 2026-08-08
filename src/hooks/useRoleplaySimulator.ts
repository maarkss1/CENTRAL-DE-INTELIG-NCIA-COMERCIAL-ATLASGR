import { useState } from 'react';
import { api } from '../lib/api';
import { BRAND_OBJECTIONS } from '../features/chatbook/constants/brandMatrices';
import type { BrandInfo } from '../contexts/BrandContext';

export interface RoleplayMessage {
    sender: 'sdr' | 'buyer';
    text: string;
}

export type RoleplayPersona = 'skeptical_cfo' | 'strict_buyer' | 'tech_director';

/**
 * Estado/ações do simulador de roleplay (aba "Roleplay Simulator") do FloatingChatbook —
 * extraído em FRONT-006. `selectedBrand` vem do componente (compartilhado com o assistente e o
 * filtro de matrizes).
 */
export function useRoleplaySimulator(brandInfo: BrandInfo, selectedBrand: 'atlasgr' | 'totaltrac') {
    const [roleplayPersona, setRoleplayPersona] = useState<RoleplayPersona>('skeptical_cfo');
    const [roleplayActive, setRoleplayActive] = useState(false);
    const [roleplayMessages, setRoleplayMessages] = useState<RoleplayMessage[]>([]);
    const [roleplayInput, setRoleplayInput] = useState('');
    const [roleplayScore, setRoleplayScore] = useState<{ clarity: number; objectionHandling: number; total: number } | null>(null);
    const [roleplayFeedback, setRoleplayFeedback] = useState('');
    const [roleplayError, setRoleplayError] = useState('');
    const [isRoleplayThinking, setIsRoleplayThinking] = useState(false);

    // Roleplay Simulator Interactions extraídas das 100 objeções
    const startRoleplay = () => {
        setRoleplayActive(true);
        setRoleplayScore(null);
        setRoleplayFeedback('');
        setRoleplayError('');

        // Pega objeções da marca selecionada na base de 100
        const brandObjs = BRAND_OBJECTIONS.filter(o => o.brand === selectedBrand);
        const randomObj = brandObjs[Math.floor(Math.random() * brandObjs.length)];
        const objectionText = randomObj.objectionText.replace(/[.!?]+$/, '');

        let initialGreeting = '';
        if (roleplayPersona === 'skeptical_cfo') {
            initialGreeting = `Olá! Sou o CFO. Em nossa operação de ${randomObj.segment}, ${objectionText}. O que a sua solução traz de retorno financeiro para justificar a contratação?`;
        } else if (roleplayPersona === 'strict_buyer') {
            initialGreeting = `Boa tarde. Em nossa operação de ${randomObj.segment}, ${objectionText}. Por que deveríamos perder tempo avaliando o ${selectedBrand.toUpperCase()}?`;
        } else {
            initialGreeting = `Oi. Sou o Diretor Técnico. Falando como ${randomObj.persona}, a dor principal em ${randomObj.segment} é que ${objectionText}. Como vocês resolvem isso na prática?`;
        }

        setRoleplayMessages([{ sender: 'buyer', text: initialGreeting }]);
    };

    const handleRoleplaySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!roleplayInput.trim() || !roleplayActive || isRoleplayThinking) return;

        const userText = roleplayInput;
        setRoleplayInput('');
        setRoleplayError('');
        setRoleplayFeedback('');
        const transcript = [...roleplayMessages, { sender: 'sdr' as const, text: userText }];
        setRoleplayMessages(transcript);
        setIsRoleplayThinking(true);

        const playbookContext = BRAND_OBJECTIONS
            .filter((item) => item.brand === selectedBrand)
            .slice(0, 3)
            .map((item) => JSON.stringify({
                segment: item.segment,
                persona: item.persona,
                objection: item.objectionText,
                responseGuidance: item.responseScript,
                differentiator: item.keyDifferentiator,
            }))
            .join('\n');

        try {
            const response = await api.post<{
                result: {
                    reply: string;
                    feedback: string;
                    clarity: number;
                    objectionHandling: number;
                    total: number;
                };
            }>('/api/intelligence/studio', {
                kind: 'roleplay',
                brand: {
                    name: brandInfo.name,
                    description: brandInfo.description,
                },
                inputs: {
                    persona: roleplayPersona,
                    message: userText,
                    transcript,
                    playbookContext,
                },
            }, { timeoutMs: 90_000 });

            setRoleplayMessages((prev) => [...prev, { sender: 'buyer', text: response.result.reply }]);
            setRoleplayFeedback(response.result.feedback);
            setRoleplayScore({
                clarity: response.result.clarity,
                objectionHandling: response.result.objectionHandling,
                total: response.result.total,
            });
        } catch (error) {
            setRoleplayError(error instanceof Error ? error.message : 'Falha ao consultar o motor de IA');
        } finally {
            setIsRoleplayThinking(false);
        }
    };

    return {
        roleplayPersona, setRoleplayPersona,
        roleplayActive, setRoleplayActive,
        roleplayMessages,
        roleplayInput, setRoleplayInput,
        roleplayScore, roleplayFeedback, roleplayError,
        isRoleplayThinking,
        startRoleplay, handleRoleplaySubmit,
    };
}
