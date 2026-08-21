import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { readSseStream, sseRequestInit } from '../lib/sse';
import { BRAND_OBJECTIONS, BRAND_QUALIFICATIONS } from '../features/chatbook/constants/brandMatrices';
import type { BrandInfo } from '../contexts/BrandContext';
import { useActiveRecord } from '../contexts/ActiveRecordContext';
import { buildAssistantLocalContext, getAssistantRouteContext, type AssistantContextSource } from './assistantContext';
import { clientLogger } from '../lib/clientLogger';

export interface ChatMessage {
    id: string;
    sender: 'user' | 'bot';
    text: string;
    timestamp: string;
    source?: AssistantContextSource;
    /** Bolha de saudação sintética — não é conversa real, não entra no histórico enviado à IA. */
    isGreeting?: boolean;
}

interface AssistantHistoryMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
}

/** Quantos turnos recentes vão no prompt como memória da conversa — ver AssistantMessage. */
const PROMPT_HISTORY_TURNS = 10;

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
        isGreeting: true,
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
    const streamAbortRef = useRef<AbortController | null>(null);

    // Carrega o histórico persistido (AssistantMessage) ao montar/trocar de marca — antes a
    // conversa vivia só em useState e sumia a cada reload. Só mostra a saudação quando não há
    // nenhum histórico salvo ainda para esta marca+usuário.
    useEffect(() => {
        streamAbortRef.current?.abort();
        let cancelled = false;

        api.get<AssistantHistoryMessage[]>(`/api/intelligence/chatbook/history?brand=${selectedBrand}`)
            .then((history) => {
                if (cancelled) return;
                if (!history.length) {
                    setMessages([greeting(brandInfo, activeRecord?.label)]);
                    return;
                }
                setMessages(history.map((m) => ({
                    id: m.id,
                    sender: m.role === 'user' ? 'user' : 'bot',
                    text: m.content,
                    timestamp: new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                })));
            })
            .catch((error) => {
                if (cancelled) return;
                clientLogger.error({ err: error }, 'Falha ao carregar histórico do Chatbook');
                setMessages([greeting(brandInfo, activeRecord?.label)]);
            });

        return () => { cancelled = true; };
        // Só a troca de marca recarrega o histórico — reagir a activeRecord aqui reiniciaria a
        // conversa em andamento sempre que o registro mudasse de fundo (ex.: usuário navega para
        // outra empresa).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeBrand, brandInfo.name, selectedBrand]);

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

        // Últimos turnos reais (sem a saudação sintética) como memória da conversa — sem isso cada
        // pergunta era respondida como se fosse a primeira desta conversa.
        const promptHistory = messages
            .filter((m) => !m.isGreeting)
            .slice(-PROMPT_HISTORY_TURNS)
            .map((m) => ({ sender: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant', text: m.text }));

        const botMsgId = (Date.now() + 1).toString();
        setMessages((prev) => [...prev, { id: botMsgId, sender: 'bot', text: '', timestamp: timestamp(), source: searchMode }]);

        const controller = new AbortController();
        streamAbortRef.current = controller;

        try {
            const response = await fetch('/api/intelligence/studio/stream', sseRequestInit({
                kind: 'assistant',
                brand: {
                    name: brandInfo.name,
                    description: brandInfo.description,
                },
                brandKey: selectedBrand,
                inputs: {
                    question: userText,
                    mode: searchMode,
                    localContext,
                    history: promptHistory,
                },
            }, controller.signal));

            let sawDelta = false;
            let streamError: string | null = null;
            await readSseStream(response, (evt) => {
                if (evt.event === 'delta') {
                    sawDelta = true;
                    const { delta } = JSON.parse(evt.data) as { delta: string };
                    setMessages((prev) => prev.map((m) => (m.id === botMsgId ? { ...m, text: m.text + delta } : m)));
                } else if (evt.event === 'error') {
                    streamError = JSON.parse(evt.data) as string;
                }
            });

            if (streamError) throw new Error(streamError);
            if (!sawDelta) throw new Error('O motor de IA não retornou nenhuma resposta.');
        } catch (error) {
            if (controller.signal.aborted) return;
            const reason = error instanceof Error ? error.message : 'Falha inesperada';
            setMessages((prev) => prev.map((m) => (m.id === botMsgId
                ? { ...m, text: `Não consegui consultar o motor de IA agora. ${reason}` }
                : m)));
        } finally {
            setIsSearching(false);
        }
    };

    return { messages, inputQuery, setInputQuery, isSearching, searchMode, setSearchMode, handleSendMessage };
}
