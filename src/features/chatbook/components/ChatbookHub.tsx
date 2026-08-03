import { useState, useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useBrand } from '../../../contexts/BrandContext';
import { api } from '../../../lib/api';
import type { AnalysisResult, SpeechRecognitionEventLike, SpeechRecognitionLike, Message } from './chatbook-hub/types';
import { QUALIFICATION_CRITERIA, OBJECTIONS_DATA } from './chatbook-hub/playbookData';
import { QualificationMatrix } from './chatbook-hub/QualificationMatrix';
import { ObjectionsMatrix } from './chatbook-hub/ObjectionsMatrix';
import { SimulationSetup } from './chatbook-hub/SimulationSetup';
import { ActiveSimulationView } from './chatbook-hub/ActiveSimulationView';
import { AnalysisReport } from './chatbook-hub/AnalysisReport';

export function ChatbookHub() {
    const { activeBrand, brandInfo } = useBrand();

    // Roleplay state
    const [selectedPersona, setSelectedPersona] = useState('gestor_frota');
    const [difficulty, setDifficulty] = useState<'facil' | 'medio' | 'dificil'>('medio');
    const [simulationActive, setSimulationActive] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputMessage, setInputMessage] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [isListening, setIsListening] = useState(false);

    // Tab navigation state
    const [activeTab, setActiveTab] = useState<'simulador' | 'qualificacao' | 'objecoes'>('simulador');

    // Voice call specific state
    const [simulationMode, setSimulationMode] = useState<'text' | 'voice'>('text');
    const [callDuration, setCallDuration] = useState(0);
    const [botSpeaking, setBotSpeaking] = useState(false);

    // Score & Analysis results
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
    const [turnEvaluations, setTurnEvaluations] = useState<Array<{
        clarity: number;
        objectionHandling: number;
        total: number;
        feedback: string;
    }>>([]);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

    const personasAtlas = [
        { id: 'diretor_logistica', label: 'Diretor de Logística & Supply', desc: 'Focado em ROI, eficiência de processos e redução de sinistros.' },
        { id: 'gerente_risco', label: 'Gerente de Risco (GR)', desc: 'Exigente, cético quanto a novas ferramentas, focado em compliance.' },
        { id: 'comprador_pme', label: 'Dono / CEO de Transportadora', desc: 'Pouco tempo, focado em custo-benefício e facilidade de implantação.' }
    ];

    const personasTotaltrack = [
        { id: 'gestor_frota', label: 'Gestor de Frotas (Transportadora)', desc: 'Preocupado com consumo de combustível, manutenção e jammers.' },
        { id: 'diretor_operacoes', label: 'Diretor de Operações Logísticas', desc: 'Busca telemetria CAN real, videotelemetria e controle de jornada.' },
        { id: 'gerente_rh', label: 'Gerente de RH / Passivo Trabalhista', desc: 'Interessado no Total Jornada para cumprir legislação e evitar horas extras.' }
    ];

    const currentPersonas = activeBrand === 'totaltrac' ? personasTotaltrack : personasAtlas;

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isThinking]);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined;
        if (simulationActive && simulationMode === 'voice' && !isFinished) {
            interval = setInterval(() => setCallDuration(p => p + 1), 1000);
        }
        return () => clearInterval(interval);
    }, [simulationActive, simulationMode, isFinished]);

    const formatDuration = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // Setup speech recognition
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.lang = 'pt-BR';
            recognitionRef.current.onresult = (event: SpeechRecognitionEventLike) => {
                const transcript = event.results[0][0].transcript;
                setInputMessage(transcript);
                setIsListening(false);
            };
            recognitionRef.current.onerror = () => {
                setIsListening(false);
            };
            recognitionRef.current.onend = () => {
                setIsListening(false);
            };
        }
    }, []);

    const toggleListening = () => {
        if (!recognitionRef.current) {
            alert('Reconhecimento de voz não suportado neste navegador. Utilize o campo de texto.');
            return;
        }
        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        } else {
            setIsListening(true);
            recognitionRef.current.start();
        }
    };

    const speakText = (text: string) => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'pt-BR';

            // Try to find a premium, natural, or Google voice for pt-BR
            const voices = window.speechSynthesis.getVoices();
            const ptVoices = voices.filter(v => v.lang.includes('pt-BR') || v.lang.includes('pt_BR'));

            const bestVoice =
                ptVoices.find(v => v.name.toLowerCase().includes('google')) ||
                ptVoices.find(v => v.name.toLowerCase().includes('premium')) ||
                ptVoices.find(v => v.name.toLowerCase().includes('online')) ||
                ptVoices.find(v => v.name.toLowerCase().includes('microsoft')) ||
                ptVoices[0];

            if (bestVoice) {
                utterance.voice = bestVoice;
            }

            utterance.rate = 1.1; // Slightly faster sounds less robotic
            utterance.pitch = 1.05; // Slight pitch tweak for a more conversational tone

            utterance.onstart = () => setBotSpeaking(true);
            utterance.onend = () => setBotSpeaking(false);
            window.speechSynthesis.speak(utterance);
        }
    };

    const startSimulation = (mode: 'text' | 'voice' = 'text') => {
        setSimulationMode(mode);
        setSimulationActive(true);
        setIsFinished(false);
        setAnalysisResult(null);
        setTurnEvaluations([]);
        setCallDuration(0);

        const initialGreeting = activeBrand === 'totaltrac'
            ? 'Olá! Sou o responsável pela frota da nossa empresa. Recebi seu contato sobre soluções de rastreamento e telemetria. O que exatamente a TotalTrac oferece que é diferente do mercado?'
            : 'Olá! Recebi seu contato sobre a plataforma AtlasGR. Nossa operação já trabalha com Gerenciamento de Risco. Por que deveríamos conversar?';

        setMessages([
            {
                id: '1',
                sender: 'bot',
                text: initialGreeting,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
        ]);
        speakText(initialGreeting);
    };

    const handleSendMessage = async () => {
        if (!inputMessage.trim() || isThinking) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            sender: 'user',
            text: inputMessage.trim(),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        const text = inputMessage.trim();
        const nextMessages = [...messages, userMsg];
        setMessages(nextMessages);
        setInputMessage('');
        setIsThinking(true);

        const persona = ['diretor_operacoes', 'diretor_logistica'].includes(selectedPersona)
            ? 'tech_director'
            : ['gestor_frota', 'comprador_pme'].includes(selectedPersona)
                ? 'skeptical_cfo'
                : 'strict_buyer';
        const playbookContext = JSON.stringify({
            difficulty,
            persona: currentPersonas.find((item) => item.id === selectedPersona),
            qualificationCriteria: QUALIFICATION_CRITERIA.map((item) => ({
                category: item.category,
                criteria: activeBrand === 'totaltrac' ? item.totaltrac : item.atlas,
                question: activeBrand === 'totaltrac' ? item.spinQuestionTotaltrac : item.spinQuestionAtlas,
            })),
            objections: OBJECTIONS_DATA.map((item) => ({
                title: item.title,
                technique: item.technique,
                guidance: activeBrand === 'totaltrac' ? item.bestResponseTotaltrac : item.bestResponseAtlas,
            })),
        });

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
                    persona,
                    message: text,
                    transcript: nextMessages.map((message) => ({
                        sender: message.sender === 'user' ? 'sdr' : 'buyer',
                        text: message.text,
                    })),
                    playbookContext,
                },
            }, { timeoutMs: 90_000 });

            const botMessage = {
                id: Date.now().toString(),
                sender: 'bot',
                text: response.result.reply,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            } satisfies Message;
            setMessages(prev => [...prev, botMessage]);
            setTurnEvaluations(prev => [...prev, {
                clarity: response.result.clarity,
                objectionHandling: response.result.objectionHandling,
                total: response.result.total,
                feedback: response.result.feedback,
            }]);
            speakText(response.result.reply);
        } catch (error) {
            const reason = error instanceof Error ? error.message : 'Falha inesperada';
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                sender: 'bot',
                text: `Não consegui consultar o comprador simulado agora. ${reason}`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }]);
        } finally {
            setIsThinking(false);
        }
    };

    const endChat = () => {
        setSimulationActive(false);
        setMessages([]);
        if ((simulationMode as string) === 'voice') {
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        }
    };

    const finishSimulation = () => {
        setSimulationActive(false);
        setIsFinished(true);
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        if (recognitionRef.current && isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        }

        const average = (field: 'clarity' | 'objectionHandling' | 'total') =>
            turnEvaluations.length
                ? Math.round(turnEvaluations.reduce((sum, item) => sum + item[field], 0) / turnEvaluations.length)
                : 0;
        const score = average('total');
        setAnalysisResult({
            score,
            qualificationsHit: [],
            objectionsHandled: [],
            feedback: turnEvaluations.at(-1)?.feedback
                || 'Envie ao menos uma resposta ao comprador para receber uma avaliação pedagógica.',
            strengths: [
                `Clareza média estimada: ${average('clarity')}%`,
                `Tratamento de objeções estimado: ${average('objectionHandling')}%`,
                `${turnEvaluations.length} resposta(s) analisada(s) pelo motor Groq`,
            ],
            improvements: turnEvaluations.length
                ? turnEvaluations.slice(-3).map((item) => item.feedback)
                : ['Continue a conversa para gerar recomendações baseadas nas suas respostas.'],
        });
    };

    return (
        <div className="flex-1 overflow-y-auto bg-transparent p-4 md:p-8 flex flex-col items-center relative overflow-hidden transition-colors duration-1000">
            {/* Ambient Background Glows */}
            <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-orange-400/10 blur-[120px] pointer-events-none" />
            <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-400/10 blur-[120px] pointer-events-none" />

            <div className="w-full max-w-6xl space-y-12 pb-24 relative z-10">

                {/* Header Hub & Tabs - Glassmorphism */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-surface/70 backdrop-blur-2xl rounded-[3rem] p-8 md:p-12 border border-line shadow-[0_20px_40px_rgba(0,0,0,0.03)] flex flex-col items-center justify-center text-center gap-8 relative overflow-hidden"
                >
                    <div className="absolute inset-0 bg-gradient-to-b from-surface/50 to-transparent pointer-events-none" />

                    <div className="relative z-10 flex flex-col items-center gap-5">
                        <div className="flex items-center gap-3">
                            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm ${brandInfo.badgeBg} border-current/20`}>
                                {brandInfo.badgeText}
                            </span>
                            <span className="text-ink-2 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 bg-surface-2 px-3 py-1.5 rounded-full">
                                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Commercial Playbook
                            </span>
                        </div>
                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-ink tracking-tight">
                            Chatbook & <span className={`text-transparent bg-clip-text bg-gradient-to-r ${activeBrand === 'totaltrac' ? 'from-sky-500 to-blue-600' : 'from-orange-500 to-amber-600'}`}>Roleplay Simulator</span>
                        </h1>
                        <p className="text-ink-2 text-base md:text-lg font-medium max-w-2xl">
                            Treinamento gamificado em tempo real, matrizes de qualificação SPIN e contorno estratégico de objeções para {brandInfo.name}.
                        </p>
                    </div>
                </motion.div>

                {/* TAB NAVIGATION */}
                <div className="flex items-center justify-center gap-3 flex-wrap">
                    {([
                        { id: 'simulador', label: '⚡ Roleplay Simulator' },
                        { id: 'qualificacao', label: '🎯 Matriz SPIN / BANT' },
                        { id: 'objecoes', label: '🛡️ Contorno de Objeções' },
                    ] as const).map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all ${
                                activeTab === tab.id
                                    ? activeBrand === 'totaltrac'
                                        ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/25'
                                        : 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
                                    : 'bg-surface/80 text-ink-2 border border-line hover:bg-surface hover:shadow-md'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ROLEPLAY SIMULATOR */}
                {activeTab === 'simulador' && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
                        className="space-y-8"
                    >
                        {!simulationActive && !isFinished && (
                            <SimulationSetup
                                activeBrand={activeBrand}
                                currentPersonas={currentPersonas}
                                selectedPersona={selectedPersona}
                                setSelectedPersona={setSelectedPersona}
                                difficulty={difficulty}
                                setDifficulty={setDifficulty}
                                onStart={startSimulation}
                            />
                        )}

                        {simulationActive && (
                            <ActiveSimulationView
                                simulationMode={simulationMode}
                                activeBrand={activeBrand}
                                currentPersonas={currentPersonas}
                                selectedPersona={selectedPersona}
                                messages={messages}
                                isThinking={isThinking}
                                isListening={isListening}
                                inputMessage={inputMessage}
                                setInputMessage={setInputMessage}
                                toggleListening={toggleListening}
                                onSendMessage={handleSendMessage}
                                onEndChat={endChat}
                                callDuration={formatDuration(callDuration)}
                                botSpeaking={botSpeaking}
                                onEndCall={finishSimulation}
                                messagesEndRef={messagesEndRef}
                            />
                        )}

                        {isFinished && analysisResult && (
                            <AnalysisReport
                                analysisResult={analysisResult}
                                onRestartText={() => startSimulation('text')}
                                onRestartVoice={() => startSimulation('voice')}
                            />
                        )}
                    </motion.div>
                )}

                {/* ABA 2: MATRIZ DE QUALIFICAÇÃO (SPIN / BANT) */}
                {activeTab === 'qualificacao' && (
                    <QualificationMatrix activeBrand={activeBrand} brandInfo={brandInfo} />
                )}

                {/* ABA 3: MATRIZ DE OBJEÇÕES */}
                {activeTab === 'objecoes' && (
                    <ObjectionsMatrix activeBrand={activeBrand} brandInfo={brandInfo} />
                )}

            </div>
        </div>
    );
}
