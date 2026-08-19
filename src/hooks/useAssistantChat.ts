import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { BRAND_OBJECTIONS, BRAND_QUALIFICATIONS } from '../features/chatbook/constants/brandMatrices';
import type { BrandInfo } from '../contexts/BrandContext';
import { useActiveRecord } from '../contexts/ActiveRecordContext';
import { buildAssistantLocalContext, getAssistantRouteContext, type AssistantContextSource } from './assistantContext';

export interface ChatMessage {
    id: string;
    sender: 'user' | 'bot';
    text: string;
    timestamp: string;
    source?: AssistantContextSource;
}

function timestamp(): string {
    return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function greeting(brandInfo: BrandInfo, activeRecordLabel?: string): ChatMessage {
    const recordLine = activeRecordLabel
        ? ` Vi que você está com **${activeRecordLabel}** aberto — pode perguntar direto sobre esse registro.`
        : '';
    return {
        id: `${brandInfo.name}-${Date.now()}`,
        sender: 'bot',
        text: `Olá! Sou o copiloto comercial da ${brandInfo.name}. Uso o motor Groq e a matriz interna da marca. Também posso responder com conhecimento geral, mas não tenho navegação web nem consulta de CNPJ em tempo real.${recordLine}`,
        timestamp: timestamp(),
        source: 'general',
    };
}

/**
 * Estado/ações do assistente conversacional (aba "Assistente IA") do FloatingChatbook —
 * extraído em FRONT-006. `selectedBrand`/`activeBrand` vêm do componente porque também são usados
 * pelo simulador de roleplay e pelo filtro de matrizes (não são exclusivos deste hook).
 */
export function useAssistantChat(activeBrand: string, brandInfo: BrandInfo, selectedBrand: 'atlasgr' | 'totaltrac') {
    const { activeRecord } = useActiveRecord();
    const location = useLocation();
    const [messages, setMessages] = useState<ChatMessage[]>([greeting(brandInfo, activeRecord?.label)]);
    const [inputQuery, setInputQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchMode, setSearchMode] = useState<'internal' | 'general'>('general');

    useEffect(() => {
        setMessages([greeting(brandInfo, activeRecord?.label)]);
        // Só a troca de marca reinicia a saudação — reagir a activeRecord aqui apagaria a conversa
        // em andamento sempre que o registro mudasse de fundo (ex.: usuário navega para outra empresa).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeBrand, brandInfo.name]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputQuery.trim() || isSearching) return;

        const userText = inputQuery;
        setInputQuery('');

        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            sender: 'user',
            text: userText,
            timestamp: timestamp(),
        };

        setMessages((prev) => [...prev, userMsg]);
        setIsSearching(true);

        const queryLower = userText.toLowerCase();

        const matchedObjection = BRAND_OBJECTIONS.find((o) =>
            o.brand === selectedBrand && (
                queryLower.includes(o.segment.toLowerCase()) ||
                queryLower.includes(o.persona.toLowerCase()) ||
                queryLower.includes('objeção') ||
                queryLower.includes('caro') ||
                queryLower.includes('concorrente') ||
                queryLower.includes('rastreador') ||
                queryLower.includes('crm')
            )
        );

        const matchedQual = BRAND_QUALIFICATIONS.find((q) =>
            q.brand === selectedBrand && (
                queryLower.includes(q.framework.toLowerCase()) ||
                queryLower.includes('qualificar') ||
                queryLower.includes('pergunta') ||
                queryLower.includes(q.segment.toLowerCase())
            )
        );

        // A rota e o registro aberto na tela valem em qualquer modo — não são "base interna
        // da marca", são literalmente o fluxo comercial que o usuário está executando agora.
        const routeContext = getAssistantRouteContext(location.pathname);

        const internalContext = searchMode === 'internal'
            ? [
                matchedObjection
                    ? `MATRIZ DE OBJEÇÃO:\n${JSON.stringify(matchedObjection, null, 2)}`
                    : '',
                matchedQual
                    ? `MATRIZ DE QUALIFICAÇÃO:\n${JSON.stringify(matchedQual, null, 2)}`
                    : '',
            ].filter(Boolean).join('\n\n')
            : '';

        const localContext = buildAssistantLocalContext({
            route: routeContext,
            activeRecord,
            internalContext,
        });

        try {
            const response = await api.post<{ result: { answer: string; webAccess: false } }>('/api/intelligence/studio', {
                kind: 'assistant',
                brand: {
                    name: brandInfo.name,
                    description: brandInfo.description,
                },
                inputs: {
                    question: userText,
                    mode: searchMode,
                    localContext,
                },
            }, { timeoutMs: 90_000 });

            setMessages((prev) => [...prev, {
                id: (Date.now() + 1).toString(),
                sender: 'bot',
                text: response.result.answer,
                timestamp: timestamp(),
                source: searchMode,
            }]);
        } catch (error) {
            const reason = error instanceof Error ? error.message : 'Falha inesperada';
            setMessages((prev) => [...prev, {
                id: (Date.now() + 1).toString(),
                sender: 'bot',
                text: `Não consegui consultar o motor de IA agora. ${reason}`,
                timestamp: timestamp(),
                source: searchMode,
            }]);
        } finally {
            setIsSearching(false);
        }
    };

    return { messages, inputQuery, setInputQuery, isSearching, searchMode, setSearchMode, handleSendMessage };
}
