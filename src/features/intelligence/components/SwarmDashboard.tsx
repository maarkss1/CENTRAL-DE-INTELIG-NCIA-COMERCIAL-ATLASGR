import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Zap, ShieldAlert, Database, Wrench, Handshake, Loader2, Send, Square, CheckCircle2, AlertTriangle, Sparkles, Gauge, RefreshCw } from 'lucide-react';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { SWARM_BRAND } from '../agents/swarm.constants';
import { clientLogger } from '../../../lib/clientLogger';
import { api } from '../../../lib/api';

type SwarmAgent = 'supervisor' | 'sdr' | 'bdr' | 'closer' | 'crm' | 'ops';
type SwarmEventType = 'routing' | 'agent_result' | 'agent_error' | 'final';

interface SwarmEvent {
    type: SwarmEventType;
    agent: SwarmAgent;
    content: string;
    step: number;
    reasoning?: string;
    nextAgent?: 'sdr' | 'bdr' | 'closer' | 'crm' | 'ops';
}

interface SwarmMessage {
    id: string;
    agent: SwarmAgent;
    text: string;
    timestamp: Date;
    status: 'thinking' | 'done' | 'error';
    kind: 'routing' | 'result' | 'final';
    step: number;
}

interface SloRate {
    value: number | null;
    numerator: number;
    denominator: number;
    emptyReason?: string;
}

interface AgentSloMetrics {
    role: 'SDR' | 'BDR' | 'CLOSER' | 'CRM' | 'OPS';
    coverage: number;
    conversion: SloRate;
    humanOverride: SloRate;
    errorRate: SloRate;
    avgExecutionLatencyMs: number | null;
    dataSourceNote?: string;
}

interface SwarmSloSnapshot {
    organizationId: string;
    windowDays: number;
    generatedAt: string;
    agents: AgentSloMetrics[];
    cost: {
        windowDays: number;
        totalCostUsd: number;
        totalTokens: number;
        requestCount: number;
        avgLatencyMs: number | null;
        note: string;
    };
}

const SLO_ROLE_LABEL: Record<AgentSloMetrics['role'], string> = {
    SDR: 'SDR Autônomo',
    BDR: 'BDR (Outbound)',
    CLOSER: 'Closer Autônomo',
    CRM: 'Gestor de CRM',
    OPS: 'Agente de Operações',
};

const SLO_ROLE_COLOR: Record<AgentSloMetrics['role'], string> = {
    SDR: '#00C2FF',
    BDR: '#00FF9D',
    CLOSER: '#FF5CA8',
    CRM: '#B554FF',
    OPS: '#FFB020',
};

function formatPercent(rate: SloRate): string {
    if (rate.value === null) return '—';
    return `${Math.round(rate.value * 100)}%`;
}

function formatMs(ms: number | null): string {
    if (ms === null) return '—';
    if (ms < 1_000) return `${Math.round(ms)} ms`;
    if (ms < 60_000) return `${(ms / 1_000).toFixed(1)} s`;
    return `${(ms / 60_000).toFixed(1)} min`;
}

const MISSION_SUGGESTIONS = [
    'Acabei de importar um lead da empresa "TransLogística Express" (frota de 50 caminhões, faturamento alto). Qualifique o risco, avalie o fit outbound e sugira a próxima ação.',
    'Analise os negócios em risco no funil desta semana e recomende os próximos passos para cada um.',
    'Preciso de uma linha de abordagem fria para um lead do segmento logístico que ainda não respondeu.',
    'Temos uma proposta enviada e o comprador levantou objeção de preço. Monte a estratégia de fechamento sem sacrificar margem.',
];

function createId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function SwarmDashboard() {
    const accent = useBrandAccent();
    const [view, setView] = useState<'mission' | 'slo'>('mission');
    const [mission, setMission] = useState('');
    const [leadId, setLeadId] = useState('');
    const [isExecuting, setIsExecuting] = useState(false);
    const [messages, setMessages] = useState<SwarmMessage[]>([]);
    const [activeStep, setActiveStep] = useState(0);
    const [engagedAgents, setEngagedAgents] = useState<Set<SwarmAgent>>(new Set());
    const [startedAt, setStartedAt] = useState<number | null>(null);
    const [elapsedMs, setElapsedMs] = useState(0);

    const [sloSnapshot, setSloSnapshot] = useState<SwarmSloSnapshot | null>(null);
    const [sloLoading, setSloLoading] = useState(false);
    const [sloError, setSloError] = useState<string | null>(null);

    const abortRef = useRef<AbortController | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);

    const fetchSlo = useCallback(async () => {
        setSloLoading(true);
        setSloError(null);
        try {
            const data = await api.get<SwarmSloSnapshot>('/api/agent/swarm/slo?days=30');
            setSloSnapshot(data);
        } catch (error) {
            clientLogger.error({ err: error }, 'Falha ao buscar o painel de SLO do enxame');
            setSloError('Painel de SLO ainda não disponível nesta instância (rota pendente ou base sem dados).');
        } finally {
            setSloLoading(false);
        }
    }, []);

    useEffect(() => {
        if (view === 'slo' && !sloSnapshot && !sloLoading) {
            void fetchSlo();
        }
    }, [view, sloSnapshot, sloLoading, fetchSlo]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (!isExecuting || !startedAt) return;
        const interval = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 200);
        return () => window.clearInterval(interval);
    }, [isExecuting, startedAt]);

    const stopMission = () => {
        abortRef.current?.abort();
    };

    const resolvePendingThinking = (text: string) => {
        setMessages(prev => prev.map(m => (m.status === 'thinking' ? { ...m, status: 'error', text } : m)));
    };

    const parseSseErrorMessage = (dataStr: string): string => {
        try {
            const parsed = JSON.parse(dataStr);
            return typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
        } catch {
            return dataStr;
        }
    };

    const runSimulation = async (overrideMission?: string) => {
        const missionText = (overrideMission ?? mission).trim();
        if (!missionText) return;

        setIsExecuting(true);
        setActiveStep(0);
        setEngagedAgents(new Set());
        setStartedAt(Date.now());
        setElapsedMs(0);
        setMessages([{
            id: 'routing-boot',
            agent: 'supervisor',
            text: 'Analisando a missão e escolhendo o primeiro especialista...',
            timestamp: new Date(),
            status: 'thinking',
            kind: 'routing',
            step: 0,
        }]);

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/agent/swarm/stream', {
                method: 'POST',
                credentials: 'include',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ mission: missionText, leadId: leadId.trim() || undefined })
            });

            if (!response.ok) {
                throw new Error('Falha ao iniciar streaming');
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('Stream não suportado');

            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let streamErrored = false;

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (!value) continue;

                buffer += decoder.decode(value, { stream: true });
                const frames = buffer.split('\n\n');
                buffer = frames.pop() || '';

                for (const frame of frames) {
                    if (!frame.trim()) continue;

                    let eventName = 'message';
                    let dataStr = '';
                    for (const line of frame.split('\n')) {
                        if (line.startsWith('event: ')) eventName = line.slice(7).trim();
                        else if (line.startsWith('data: ')) dataStr += line.slice(6);
                    }
                    if (!dataStr) continue;

                    if (eventName === 'error') {
                        streamErrored = true;
                        const message = parseSseErrorMessage(dataStr);
                        resolvePendingThinking('Interrompido por um erro no enxame.');
                        setMessages(prev => [
                            ...prev,
                            {
                                id: createId(),
                                agent: 'supervisor',
                                text: `O enxame foi interrompido: ${message}`,
                                timestamp: new Date(),
                                status: 'error',
                                kind: 'routing',
                                step: activeStep,
                            }
                        ]);
                        continue;
                    }

                    if (eventName === 'end' || dataStr === '{}') continue;

                    try {
                        const event = JSON.parse(dataStr) as SwarmEvent;
                        applyEvent(event);
                    } catch (e) {
                        clientLogger.error({ err: e }, 'Erro ao fazer parse SSE data');
                    }
                }
            }

            if (!streamErrored) resolvePendingThinking('Sem resposta deste agente — a conexão foi encerrada antes da conclusão.');

            setIsExecuting(false);
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                resolvePendingThinking('Cancelado pelo usuário.');
                setMessages(prev => [
                    ...prev,
                    {
                        id: createId(),
                        agent: 'supervisor',
                        text: 'Missão cancelada pelo usuário.',
                        timestamp: new Date(),
                        status: 'error',
                        kind: 'routing',
                        step: activeStep,
                    }
                ]);
            } else {
                clientLogger.error({ err: error }, 'Falha ao executar Enxame via Stream');
                resolvePendingThinking('Falha de comunicação com o enxame.');
                setMessages(prev => [
                    ...prev,
                    {
                        id: createId(),
                        agent: 'supervisor',
                        text: 'O Swarm não conseguiu se comunicar com os agentes. Tente novamente em instantes.',
                        timestamp: new Date(),
                        status: 'error',
                        kind: 'routing',
                        step: activeStep,
                    }
                ]);
            }
            setIsExecuting(false);
        } finally {
            abortRef.current = null;
        }
    };

    const applyEvent = (event: SwarmEvent) => {
        setActiveStep(event.step);

        setMessages(prev => prev.map(m => (m.id === 'routing-boot' && m.status === 'thinking' ? { ...m, status: 'done' } : m)));

        if (event.type === 'routing') {
            setMessages(prev => [
                ...prev,
                {
                    id: createId(),
                    agent: 'supervisor',
                    text: event.content,
                    timestamp: new Date(),
                    status: 'done',
                    kind: 'routing',
                    step: event.step,
                }
            ]);

            if (event.nextAgent) {
                const target = event.nextAgent;
                setEngagedAgents(prev => new Set(prev).add(target));
                setMessages(prev => [
                    ...prev,
                    {
                        id: `thinking-${target}-${event.step}`,
                        agent: target,
                        text: '',
                        timestamp: new Date(),
                        status: 'thinking',
                        kind: 'result',
                        step: event.step,
                    }
                ]);
            }
            return;
        }

        if (event.type === 'agent_result' || event.type === 'agent_error') {
            const thinkingId = `thinking-${event.agent}-${event.step}`;
            setMessages(prev => {
                const idx = prev.findIndex(m => m.id === thinkingId);
                const updated: SwarmMessage = {
                    id: thinkingId,
                    agent: event.agent,
                    text: event.content,
                    timestamp: new Date(),
                    status: event.type === 'agent_error' ? 'error' : 'done',
                    kind: 'result',
                    step: event.step,
                };
                if (idx === -1) return [...prev, updated];
                const next = [...prev];
                next[idx] = updated;
                return next;
            });
            return;
        }

        if (event.type === 'final') {
            setMessages(prev => [
                ...prev,
                {
                    id: createId(),
                    agent: 'supervisor',
                    text: event.content,
                    timestamp: new Date(),
                    status: 'done',
                    kind: 'final',
                    step: event.step,
                }
            ]);
        }
    };

    const getAgentIcon = (agent: string) => {
        switch (agent) {
            case 'supervisor': return <ShieldAlert size={18} className={accent.text} />;
            case 'sdr': return <Bot size={18} className="text-[#008cb8] dark:text-[#00C2FF]" />;
            case 'bdr': return <Zap size={18} className="text-[#009e5c] dark:text-[#00FF9D]" />;
            case 'closer': return <Handshake size={18} className="text-[#d12474] dark:text-[#FF5CA8]" />;
            case 'crm': return <Database size={18} className="text-[#8523cc] dark:text-[#B554FF]" />;
            case 'ops': return <Wrench size={18} className="text-[#cc7a00] dark:text-[#FFB020]" />;
            default: return <Bot size={18} />;
        }
    };

    const getAgentName = (agent: string) => {
        switch (agent) {
            case 'supervisor': return 'Supervisor (Orquestrador)';
            case 'sdr': return 'SDR Autônomo';
            case 'bdr': return 'BDR (Outbound)';
            case 'closer': return 'Closer Autônomo';
            case 'crm': return 'Gestor de CRM';
            case 'ops': return 'Agente de Operações';
            default: return 'Agente';
        }
    };

    const getAgentBg = (agent: string, status: SwarmMessage['status']) => {
        if (status === 'error') return 'bg-danger/10 border-danger/30 text-danger';
        switch (agent) {
            case 'supervisor': return `${accent.bgSofter} ${accent.borderSoft} text-ink`;
            case 'sdr': return 'bg-[#00C2FF]/10 border-[#00C2FF]/30 text-ink';
            case 'bdr': return 'bg-[#00FF9D]/10 border-[#00FF9D]/30 text-ink';
            case 'closer': return 'bg-[#FF5CA8]/10 border-[#FF5CA8]/30 text-ink';
            case 'crm': return 'bg-[#B554FF]/10 border-[#B554FF]/30 text-ink';
            case 'ops': return 'bg-[#FFB020]/10 border-[#FFB020]/30 text-ink';
            default: return 'bg-surface-2 border-line text-ink';
        }
    };

    const pipelineAgents: { key: SwarmAgent; label: string }[] = [
        { key: 'sdr', label: 'SDR' },
        { key: 'bdr', label: 'BDR' },
        { key: 'closer', label: 'CLOSER' },
        { key: 'crm', label: 'CRM' },
        { key: 'ops', label: 'OPS' },
    ];

    return (
        <div className="flex flex-col h-[750px] bg-surface rounded-3xl border border-line overflow-hidden shadow-card relative">
            {/* Efeitos Glow Suaves de Fundo */}
            <div className={`absolute top-[-10%] left-[-10%] w-[50%] h-[50%] ${accent.blobA} rounded-full blur-[120px] pointer-events-none opacity-30`} />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#00C2FF]/10 rounded-full blur-[120px] pointer-events-none opacity-30" />

            {/* Cabeçalho */}
            <div className="px-8 py-6 border-b border-line bg-surface/80 backdrop-blur-xl flex items-center justify-between z-10 gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${accent.gradient} flex items-center justify-center text-white shadow-md`}>
                        <Zap size={24} fill="currentColor" />
                    </div>
                    <div>
                        <h2 className="text-xl text-ink font-black tracking-tight">{SWARM_BRAND} Swarm</h2>
                        <p className="text-ink-2 text-sm mt-0.5 font-medium">Orquestração Autônoma de Agentes Comerciais</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {isExecuting && (
                        <div className="hidden md:flex items-center gap-2 mr-2">
                            {pipelineAgents.map((p) => (
                                <div
                                    key={p.key}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${
                                        engagedAgents.has(p.key)
                                            ? getAgentBg(p.key, 'done')
                                            : 'bg-surface-2 border-line text-ink-2'
                                    }`}
                                >
                                    {p.label}
                                </div>
                            ))}
                            <span className="text-ink-2 text-[10px] font-bold uppercase tracking-widest ml-1">
                                {(elapsedMs / 1000).toFixed(1)}s
                            </span>
                        </div>
                    )}
                    <span className="flex h-3 w-3 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-success"></span>
                    </span>
                    <span className="text-xs font-bold text-success uppercase tracking-widest">Enxame Online</span>
                </div>
            </div>

            {/* Seletor de visão: missão ao vivo vs. SLO por agente */}
            <div className="px-8 pt-4 border-b border-line bg-surface-2/40 z-10 flex items-center gap-2">
                <button
                    onClick={() => setView('mission')}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-widest rounded-t-lg border-b-2 transition-colors cursor-pointer ${view === 'mission' ? `${accent.text} border-current` : 'text-ink-2 border-transparent hover:text-ink'}`}
                >
                    <Send size={12} /> Missão ao vivo
                </button>
                <button
                    onClick={() => setView('slo')}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-widest rounded-t-lg border-b-2 transition-colors cursor-pointer ${view === 'slo' ? `${accent.text} border-current` : 'text-ink-2 border-transparent hover:text-ink'}`}
                >
                    <Gauge size={12} /> SLO por agente
                </button>
            </div>

            {view === 'slo' && (
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar z-10">
                    <SwarmSloPanel
                        snapshot={sloSnapshot}
                        loading={sloLoading}
                        error={sloError}
                        onRetry={fetchSlo}
                    />
                </div>
            )}

            {/* Área de Mensagens (Chat) */}
            {view === 'mission' && (
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar z-10">
                {messages.length === 0 && !isExecuting && (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-90">
                        <div className="w-20 h-20 bg-surface-2 rounded-full flex items-center justify-center mb-6 border border-line shadow-sm">
                            <Bot size={32} className="text-ink-2" />
                        </div>
                        <h3 className="text-ink text-lg font-bold mb-2">Aguardando Missão</h3>
                        <p className="text-ink-2 text-sm max-w-sm mb-6">Descreva o que os agentes devem fazer e eles se organizarão automaticamente para executar.</p>

                        <div className="flex flex-col gap-2 max-w-lg w-full">
                            {MISSION_SUGGESTIONS.map((suggestion) => (
                                <button
                                    key={suggestion}
                                    onClick={() => setMission(suggestion)}
                                    className={`text-left text-xs text-ink bg-surface-2 border border-line rounded-xl px-4 py-3 ${accent.hoverBorder} hover:bg-surface transition-colors cursor-pointer`}
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <AnimatePresence initial={false}>
                    {messages.map((msg) => {
                        if (msg.kind === 'routing') {
                            return (
                                <motion.div
                                    key={msg.id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-ink-2 ml-2"
                                >
                                    {msg.status === 'thinking'
                                        ? <Loader2 size={12} className={`animate-spin ${accent.text}`} />
                                        : <ShieldAlert size={12} className={accent.text} />}
                                    <span className={msg.status === 'error' ? 'text-danger' : ''}>{msg.text}</span>
                                </motion.div>
                            );
                        }

                        if (msg.kind === 'final') {
                            return (
                                <motion.div
                                    key={msg.id}
                                    initial={{ opacity: 0, y: 15, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    className="mr-0"
                                >
                                    <div className={`p-6 rounded-2xl border-2 backdrop-blur-xl shadow-card ${accent.borderSoft} bg-surface-2/90`}>
                                        <div className="flex items-center gap-2 mb-3">
                                            <CheckCircle2 size={18} className={accent.text} />
                                            <span className="font-black text-sm tracking-wide text-ink uppercase">Síntese Final do Enxame</span>
                                        </div>
                                        <p className="text-ink text-[15px] leading-relaxed font-medium whitespace-pre-wrap">
                                            {msg.text}
                                        </p>
                                    </div>
                                </motion.div>
                            );
                        }

                        return (
                            <motion.div
                                key={msg.id}
                                initial={{ opacity: 0, y: 15, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                className={`flex gap-4 ${msg.agent === 'supervisor' ? 'ml-0 mr-12' : 'ml-12 mr-0'}`}
                            >
                                <div className="w-12 h-12 rounded-xl bg-surface-2 flex items-center justify-center shrink-0 border border-line shadow-sm backdrop-blur-md">
                                    {msg.status === 'thinking'
                                        ? <Loader2 size={18} className="animate-spin text-ink-2" />
                                        : msg.status === 'error'
                                            ? <AlertTriangle size={18} className="text-danger" />
                                            : getAgentIcon(msg.agent)}
                                </div>
                                <div className={`p-5 rounded-2xl border backdrop-blur-xl shadow-card flex-1 ${getAgentBg(msg.agent, msg.status)}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-bold text-sm tracking-wide text-ink">{getAgentName(msg.agent)}</span>
                                        <span className="text-ink-2 text-[10px] uppercase font-black tracking-widest">{msg.timestamp.toLocaleTimeString()}</span>
                                    </div>
                                    {msg.status === 'thinking' ? (
                                        <div className="flex items-center gap-2 text-ink-2 text-sm font-medium">
                                            <Loader2 size={14} className="animate-spin" /> Processando...
                                        </div>
                                    ) : (
                                        <p className="text-ink text-[15px] leading-relaxed font-medium whitespace-pre-wrap">
                                            {msg.text}
                                        </p>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
            )}

            {/* Input Footer */}
            {view === 'mission' && (
            <div className="p-6 bg-surface/95 border-t border-line backdrop-blur-2xl relative z-50">
                <div className="relative max-w-4xl mx-auto mb-3">
                    <input
                        type="text"
                        value={leadId}
                        onChange={(e) => setLeadId(e.target.value)}
                        placeholder="Lead ID (opcional) — necessário para o Agente SDR qualificar um lead real do CRM"
                        className="w-full bg-surface-2 border border-line rounded-xl px-4 py-2.5 text-ink text-[13px] font-medium focus:outline-none focus:ring-1 focus:bg-surface transition-all placeholder:text-ink-2 pointer-events-auto"
                        disabled={isExecuting}
                    />
                </div>
                <div className="relative max-w-4xl mx-auto">
                    <input
                        type="text"
                        value={mission}
                        onChange={(e) => setMission(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !isExecuting && mission.trim()) runSimulation();
                        }}
                        placeholder="O que você deseja que o Swarm faça? (Clique aqui para digitar)"
                        className={`w-full bg-surface-2 border border-line rounded-2xl pl-6 pr-20 py-5 text-ink text-[16px] font-medium focus:outline-none focus:ring-1 focus:bg-surface transition-all placeholder:text-ink-2 shadow-inner relative z-50 pointer-events-auto ${accent.isAtlas ? 'focus:border-atlas-orange focus:ring-atlas-orange/50' : 'focus:border-totaltrack-blue focus:ring-totaltrack-blue/50'}`}
                        disabled={isExecuting}
                    />
                    {isExecuting ? (
                        <button
                            onClick={stopMission}
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 bg-danger/90 hover:bg-danger hover:scale-105 rounded-xl flex items-center justify-center text-white transition-all shadow-lg z-50 pointer-events-auto cursor-pointer"
                            title="Cancelar missão"
                        >
                            <Square size={16} fill="currentColor" />
                        </button>
                    ) : (
                        <button
                            onClick={() => runSimulation()}
                            disabled={!mission.trim()}
                            className={`absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 bg-gradient-to-r ${accent.gradient} hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed rounded-xl flex items-center justify-center text-white transition-all shadow-lg z-50 pointer-events-auto cursor-pointer`}
                        >
                            <Send size={20} className="ml-1" />
                        </button>
                    )}
                </div>
                <p className="text-center text-ink-2 text-xs mt-4 font-bold uppercase tracking-widest flex items-center justify-center gap-1.5">
                    {isExecuting ? (
                        <>
                            <Sparkles size={12} className={accent.text} />
                            Enxame em ação · etapa {activeStep}
                        </>
                    ) : (
                        <>Pressione <kbd className="font-mono bg-surface-2 px-1.5 py-0.5 rounded text-ink mx-1 border border-line">Enter</kbd> para enviar a missão</>
                    )}
                </p>
            </div>
            )}
        </div>
    );
}

interface SwarmSloPanelProps {
    snapshot: SwarmSloSnapshot | null;
    loading: boolean;
    error: string | null;
    onRetry: () => void;
}

function SwarmSloPanel({ snapshot, loading, error, onRetry }: SwarmSloPanelProps) {
    const accent = useBrandAccent();

    if (loading && !snapshot) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3 text-ink-2">
                <Loader2 size={28} className={`animate-spin ${accent.text}`} />
                <p className="text-sm font-medium">Calculando SLO a partir de AIPendingAction e AILog reais...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 max-w-md mx-auto">
                <AlertTriangle size={28} className="text-amber-500" />
                <p className="text-sm text-ink-2 font-medium">{error}</p>
                <button
                    onClick={onRetry}
                    className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-lg border border-line text-ink hover:bg-surface-2 transition-colors cursor-pointer"
                >
                    <RefreshCw size={12} /> Tentar novamente
                </button>
            </div>
        );
    }

    if (!snapshot) return null;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-ink text-sm font-black uppercase tracking-widest flex items-center gap-2">
                        <Gauge size={16} className={accent.text} /> SLO por agente · últimos {snapshot.windowDays} dias
                    </h3>
                    <p className="text-ink-2 text-xs mt-1">Fonte: AIPendingAction (por papel) e AILog (agregado da organização) — nunca número fabricado.</p>
                </div>
                <button onClick={onRetry} className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border border-line text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer">
                    <RefreshCw size={11} /> Atualizar
                </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-surface-2 text-ink-2 text-[10px] uppercase tracking-widest">
                            <th className="text-left font-bold px-4 py-3">Agente</th>
                            <th className="text-right font-bold px-4 py-3">Cobertura</th>
                            <th className="text-right font-bold px-4 py-3">Conversão</th>
                            <th className="text-right font-bold px-4 py-3">Override humano</th>
                            <th className="text-right font-bold px-4 py-3">Taxa de erro</th>
                            <th className="text-right font-bold px-4 py-3">Latência operacional</th>
                        </tr>
                    </thead>
                    <tbody>
                        {snapshot.agents.map((agent) => (
                            <tr key={agent.role} className="border-t border-line hover:bg-surface-2/50 transition-colors" title={agent.dataSourceNote}>
                                <td className="px-4 py-3">
                                    <span className="font-bold text-ink flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SLO_ROLE_COLOR[agent.role] }} />
                                        {SLO_ROLE_LABEL[agent.role]}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right text-ink font-mono">{agent.coverage}</td>
                                <td className="px-4 py-3 text-right text-ink font-mono" title={agent.conversion.emptyReason}>{formatPercent(agent.conversion)}</td>
                                <td className="px-4 py-3 text-right text-ink font-mono" title={agent.humanOverride.emptyReason}>{formatPercent(agent.humanOverride)}</td>
                                <td className="px-4 py-3 text-right font-mono" title={agent.errorRate.emptyReason}>
                                    <span className={agent.errorRate.value !== null && agent.errorRate.value > 0 ? 'text-danger font-bold' : 'text-ink'}>
                                        {formatPercent(agent.errorRate)}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right text-ink font-mono">{formatMs(agent.avgExecutionLatencyMs)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="rounded-2xl border border-line bg-surface-2 p-5">
                <p className="text-[10px] uppercase tracking-widest font-bold text-ink-2 mb-3">Consumo de IA da organização (AILog, agregado — não fatiado por agente)</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <p className="text-ink text-lg font-black font-mono">${snapshot.cost.totalCostUsd.toFixed(2)}</p>
                        <p className="text-ink-2 text-[10px] uppercase tracking-widest mt-0.5">Custo (USD)</p>
                    </div>
                    <div>
                        <p className="text-ink text-lg font-black font-mono">{snapshot.cost.totalTokens.toLocaleString('pt-BR')}</p>
                        <p className="text-ink-2 text-[10px] uppercase tracking-widest mt-0.5">Tokens</p>
                    </div>
                    <div>
                        <p className="text-ink text-lg font-black font-mono">{snapshot.cost.requestCount.toLocaleString('pt-BR')}</p>
                        <p className="text-ink-2 text-[10px] uppercase tracking-widest mt-0.5">Chamadas</p>
                    </div>
                    <div>
                        <p className="text-ink text-lg font-black font-mono">{formatMs(snapshot.cost.avgLatencyMs)}</p>
                        <p className="text-ink-2 text-[10px] uppercase tracking-widest mt-0.5">Latência média</p>
                    </div>
                </div>
                <p className="text-ink-2 text-[11px] mt-4 leading-relaxed">{snapshot.cost.note}</p>
            </div>
        </div>
    );
}
